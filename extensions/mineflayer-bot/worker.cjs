#!/usr/bin/env node

function emit (type, payload = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`)
}

// Mineflayer 4.37.1 was published before its version allow-list was updated for
// Minecraft 26.1, while the stable Prismarine data packages already contain
// protocol 775 and the required 26.1 chunk/physics implementations. Extend the
// allow-list before Mineflayer's loader snapshots it. This can be removed once
// upstream includes 26.1 in `mineflayer/lib/version`.
function loadMineflayer () {
  const minecraftData = require('minecraft-data')
  const compatibilityVersion = '26.1.2'
  const versionInfo = require('mineflayer/lib/version')

  if (
    minecraftData(compatibilityVersion) &&
    !versionInfo.testedVersions.includes(compatibilityVersion)
  ) {
    versionInfo.testedVersions.push(compatibilityVersion)
    versionInfo.latestSupportedVersion = compatibilityVersion
  }

  return {
    mineflayer: require('mineflayer'),
    compatibilityVersion:
      versionInfo.latestSupportedVersion === compatibilityVersion
        ? compatibilityVersion
        : null
  }
}

const { mineflayer, compatibilityVersion } = loadMineflayer()
const { createRequire } = require('node:module')
const minecraft263Version = '26.3'
const minecraft263Protocol = 777
const { installFabricSupport } = require('./fabric.cjs')
const { createPlugin, goals, movementProviders, installSurfaceSwimming } = require('./pathfinder.cjs')
const { normalizeCombat, createCombatController } = require('./combat.cjs')
const { createTravelController } = require('./pearls.cjs')
const { installKnockback } = require('./knockback.cjs')
const { normalizeSurvival, createSurvivalController } = require('./survival.cjs')
const { createGatheringController } = require('./gathering.cjs')
const { COMMANDS: GATHERING_COMMANDS, handleGatheringCommand } = require('./gathering-commands.cjs')
const { createProductionController } = require('./production.cjs')
const { COMMANDS: PRODUCTION_COMMANDS, handleProductionCommand } = require('./production-commands.cjs')
const { createWorkflowController } = require('./workflow.cjs')
const { createCrewLink } = require('./fleet-crew.cjs')
const { createFleetNavigation } = require('./fleet-navigation.cjs')
const { createChaoticMovementController } = require('./chaotic-movement.cjs')
const { configureHashedInventory, createInventoryActions } = require('./inventory-actions.cjs')
const { createStorageInspection } = require('./storage-inspection.cjs')
const { assignStorage } = require('./storage-scan.cjs')
const { startWebInventory, startInventoryTelemetry } = require('./web-inventory.cjs')
const { Vec3 } = require('vec3')

const { GoalFollowEntity, GoalNear } = goals

function configurePathfinder (bot, movement, behavior = {}) {
  // Navigation, survival, combat and gathering have independent tick hooks.
  // Reserve a bounded listener budget for the managed bot's controllers.
  const listenerLimit = bot.getMaxListeners()
  if (listenerLimit > 0 && listenerLimit < 32) bot.setMaxListeners(32)
  bot.loadPlugin(createPlugin({
    moveSettings: {
      allowSprinting: Boolean(movement.allowSprinting),
      allowLowCeilingJumps: movement.allowLowCeilingJumps !== false,
      allowJumpSprint: Boolean(movement.allowParkour && movement.allowSprinting),
      allowAirStrafe: movement.allowAirStrafe === true,
      canDig: Boolean(movement.canDig),
      canPlace: true,
      allow1by1towers: true,
      maxDropDown: movement.maxDropDown,
      allowWaterDrop: movement.allowWaterDrop !== false,
      allowBucketWaterDrop: movement.allowBucketWaterDrop !== false,
      infiniteLiquidDropdownDistance: movement.allowWaterDrop !== false,
      movementTimeoutMs: 3000
    },
    pathfinderSettings: {
      searchTimeoutMs: 2500,
      tickTimeoutMs: 5,
      maxVisitedNodes: 20000,
      heuristicWeight: 1.5,
      routePrefixMs: 30,
      routePrefixLength: 16
    }
  }))
  installSurfaceSwimming(bot, behavior.stayOnWater !== false)
  installKnockback(bot, behavior.antiKnockback)
  if (!movement.allowParkour) {
    bot.pathfinder.dropMovement(movementProviders.ParkourForward)
    bot.pathfinder.dropMovement(movementProviders.ParkourDiagonal)
    bot.pathfinder.dropMovement(movementProviders.MomentumJump)
    bot.pathfinder.dropMovement(movementProviders.NeoProvider)
    bot.pathfinder.dropMovement(movementProviders.LadderForward)
    bot.pathfinder.dropMovement(movementProviders.LadderDiagonal)
    bot.pathfinder.dropMovement(movementProviders.LadderLandingForward)
    bot.pathfinder.dropMovement(movementProviders.LadderLandingDiagonal)
    bot.pathfinder.dropMovement(movementProviders.AroundCornerDiagonal)
  }
  return bot.pathfinder
}

function optionalRequire (name) {
  try {
    return require(name)
  } catch (error) {
    emit('status', {
      state: 'starting',
      message: `optional module ${name} unavailable: ${error.message}`
    })
    return null
  }
}

function normalizeUuid (uuid) {
  return typeof uuid === 'string' ? uuid.replace(/-/g, '') : uuid
}

function sameName (left, right) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase()
}

function clampNumber (value, fallback, minimum, maximum) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(Math.round(parsed), maximum))
}

function clampChat (text) {
  return String(text || '').slice(0, 240)
}

function formatPosition (position) {
  if (!position) return 'unknown'
  return `${position.x.toFixed(1)} ${position.y.toFixed(1)} ${position.z.toFixed(1)}`
}

function formatReason (reason) {
  if (!reason) return ''
  if (typeof reason === 'string') return reason

  const formatted = flattenStructuredText(reason)
    .replace(/\s+/g, ' ')
    .trim()
  if (formatted) return formatted

  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

function flattenStructuredText (node) {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenStructuredText).join('')
  if (typeof node !== 'object') return ''

  if ('type' in node && 'value' in node) {
    return flattenStructuredText(node.value)
  }

  const formattingKeys = new Set([
    'color',
    'bold',
    'italic',
    'underlined',
    'strikethrough',
    'obfuscated',
    'font',
    'insertion',
    'clickEvent',
    'hoverEvent'
  ])
  let result = ''

  if ('text' in node) result += flattenStructuredText(node.text)
  if ('translate' in node) result += flattenStructuredText(node.translate)

  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'text' ||
      key === 'translate' ||
      key === 'extra' ||
      formattingKeys.has(key)
    ) {
      continue
    }
    result += flattenStructuredText(value)
  }

  if ('extra' in node) result += flattenStructuredText(node.extra)
  return result
}

function describeKickReason (reason) {
  const message = formatReason(reason)
  if (
    /fabric loader|fabric api|installed on your client|registry entry namespaces|xaerominimap|xaeroworldmap/i.test(
      message
    )
  ) {
    return `${message} SCREEN includes Fabric networking and registry adaptation. Check the Fabric messages above: mod-specific client replies and gameplay may need a dedicated adapter.`
  }
  return message
}

function isPermanentConnectionError (reason) {
  return /FABRIC_(?!TIMEOUT\b)[A-Z_]+|unsupported protocol version|server version .* is not supported|no data for version|no chunk implementation|this server requires|installed on your client|fabric loader|fabric api|registry entry namespaces|xaerominimap|xaeroworldmap|not whitelisted|you are banned|invalid session|failed to verify username/i.test(
    String(reason || '')
  )
}

function protocolLongToBigInt (value, fallback = 0n) {
  try {
    if (typeof value === 'bigint') return BigInt.asIntN(64, value)
    if (typeof value === 'number' && Number.isFinite(value)) {
      return BigInt.asIntN(64, BigInt(Math.trunc(value)))
    }
    if (typeof value === 'string' && value.trim()) {
      return BigInt.asIntN(64, BigInt(value))
    }

    if (Array.isArray(value) && value.length >= 2) {
      const high = BigInt.asIntN(32, BigInt(value[0]))
      const low = BigInt.asUintN(32, BigInt(value[1]))
      return BigInt.asIntN(64, (high << 32n) | low)
    }

    if (value && typeof value === 'object') {
      if ('high' in value && 'low' in value) {
        const high = BigInt.asIntN(32, BigInt(value.high))
        const low = BigInt.asUintN(32, BigInt(value.low))
        return BigInt.asIntN(64, (high << 32n) | low)
      }
      if ('0' in value && '1' in value) {
        return protocolLongToBigInt([value[0], value[1]], fallback)
      }
    }
  } catch {
    return fallback
  }

  return fallback
}

function compatibleTimePlugin (bot) {
  bot.time = {
    doDaylightCycle: null,
    bigTime: null,
    time: null,
    timeOfDay: null,
    day: null,
    isDay: null,
    moonPhase: null,
    bigAge: null,
    age: null,
    clockId: null,
    partialTick: 0,
    rate: null
  }

  bot._client.on('update_time', (packet) => {
    const clockUpdates = Array.isArray(packet.clockUpdates)
      ? packet.clockUpdates
      : []
    const clock =
      clockUpdates.find((entry) => Number(entry?.clockId ?? entry?.id) === 0) ||
      clockUpdates[0] ||
      null
    const usesWorldClocks = packet.time === undefined && clock !== null
    const rawTime = usesWorldClocks ? clock.totalTicks : packet.time

    // World-clock packets may contain no clock updates. Keep the last known values.
    if (rawTime === undefined || rawTime === null) return

    const time = protocolLongToBigInt(rawTime)
    const age = protocolLongToBigInt(packet.gameTime ?? packet.age, bot.time.bigAge || 0n)
    const rate = usesWorldClocks ? Number(clock.rate) : null
    const doDaylightCycle = usesWorldClocks
      ? !Number.isFinite(rate) || rate !== 0
      : packet.tickDayTime !== undefined
        ? Boolean(packet.tickDayTime)
        : time >= 0n
    const finalTime = doDaylightCycle ? time : (time < 0n ? -time : time)

    bot.time.doDaylightCycle = doDaylightCycle
    bot.time.bigTime = finalTime
    bot.time.time = Number(finalTime)
    bot.time.timeOfDay = bot.time.time % 24000
    bot.time.day = Math.floor(bot.time.time / 24000)
    bot.time.isDay = bot.time.timeOfDay >= 0 && bot.time.timeOfDay < 13000
    bot.time.moonPhase = bot.time.day % 8
    bot.time.bigAge = age
    bot.time.age = Number(age)
    bot.time.clockId = usesWorldClocks ? Number(clock.clockId ?? clock.id) : null
    bot.time.partialTick = usesWorldClocks && Number.isFinite(Number(clock.partialTick))
      ? Number(clock.partialTick)
      : 0
    bot.time.rate = Number.isFinite(rate) ? rate : null

    bot.emit('time')
  })
}

function renderTemplate (template, values) {
  return String(template || '').replace(/%(owner|bot|server)%/gi, (_, key) => {
    return values[key.toLowerCase()] || ''
  })
}

// Routing happens before cooldowns and task dispatch: other bots must ignore
// an addressed command, including its arguments, entirely.
function commandBodyForBot (rawMessage, prefix, botUsername, bareCommands = new Set()) {
  if (typeof rawMessage !== 'string') return null
  const prefixed = rawMessage.startsWith(prefix)
  if (!prefixed && !bareCommands.has(rawMessage.trim().split(/\s+/)[0].toLowerCase())) return null
  let body = (prefixed ? rawMessage.slice(prefix.length) : rawMessage).trim()
  if (body.startsWith('@')) {
    const [address, ...parts] = body.split(/\s+/)
    const targets = address.slice(1).split(',').map(name => name.replace(/^@/, '').toLowerCase())
    if (!targets.some(name => name === 'all' || name === '*' || name === String(botUsername).toLowerCase())) return null
    body = parts.join(' ')
  }
  return body || null
}

function parseConfig (raw) {
  const config = JSON.parse(raw)
  if (!config.server || !config.server.host) {
    throw new Error('server.host is required')
  }
  if (!config.account || !config.account.username) {
    throw new Error('account.username is required')
  }

  config.commands = {
    prefix: '.',
    source: 'both',
    extraOwners: [],
    cooldownMs: 500,
    sendFeedback: true,
    allowSay: false,
    allowQuit: true,
    ...(config.commands || {})
  }
  const configuredPrefix = String(config.commands.prefix ?? '').trim()
  config.commands.prefix = ['', '!', ','].includes(configuredPrefix) ? '.' : configuredPrefix
  config.movement = {
    followDistance: 3,
    gotoRadius: 1,
    allowSprinting: true,
    allowLowCeilingJumps: true,
    allowParkour: true,
    allowAirStrafe: false,
    canDig: false,
    maxDropDown: 3,
    allowWaterDrop: true,
    allowBucketWaterDrop: true,
    ...(config.movement || {})
  }
  config.connection = {
    autoReconnect: true,
    reconnectDelayMs: 5000,
    maxReconnectAttempts: 10,
    checkTimeoutIntervalMs: 30000,
    autoRespawn: true,
    ...(config.connection || {})
  }
  config.behavior = {
    stayOnWater: true,
    antiKnockback: false,
    autoFollowOnSpawn: false,
    announceOnSpawn: false,
    spawnMessage: 'Ready, %owner%!',
    logPathUpdates: false,
    ...(config.behavior || {})
  }
  config.behavior.antiKnockback = config.behavior.antiKnockback === true

  config.commands.prefix = String(config.commands.prefix || '!').slice(0, 8)
  config.commands.source = ['chat', 'whisper', 'both'].includes(config.commands.source)
    ? config.commands.source
    : 'both'
  config.commands.extraOwners = Array.isArray(config.commands.extraOwners)
    ? config.commands.extraOwners.filter((name) => typeof name === 'string' && name.trim())
    : []
  config.commands.cooldownMs = clampNumber(config.commands.cooldownMs, 500, 0, 10000)
  config.movement.followDistance = clampNumber(config.movement.followDistance, 3, 1, 16)
  config.movement.gotoRadius = clampNumber(config.movement.gotoRadius, 1, 1, 16)
  config.movement.maxDropDown = clampNumber(config.movement.maxDropDown, 3, 1, 16)
  config.movement.allowWaterDrop = config.movement.allowWaterDrop !== false
  config.movement.allowBucketWaterDrop = config.movement.allowBucketWaterDrop !== false
  config.connection.reconnectDelayMs = clampNumber(
    config.connection.reconnectDelayMs,
    5000,
    1000,
    300000
  )
  config.connection.maxReconnectAttempts = clampNumber(
    config.connection.maxReconnectAttempts,
    10,
    0,
    100
  )
  config.connection.checkTimeoutIntervalMs = clampNumber(
    config.connection.checkTimeoutIntervalMs,
    30000,
    5000,
    300000
  )
  config.combat = normalizeCombat(config.combat)
  config.survival = normalizeSurvival(config.survival)
  return config
}

// Forward a value only when it differs from the previous one.
function onlyChanges (forward) {
  let last
  return value => {
    const encoded = JSON.stringify(value)
    if (encoded === last) return
    last = encoded
    forward(value)
  }
}

function createLauncherInput (input) {
  return require('node:readline')
    .createInterface({ input, crlfDelay: Infinity })[Symbol.asyncIterator]()
}

function createCommandQueue (handler) {
  let pending = Promise.resolve()
  return (...args) => {
    const next = pending.then(() => handler(...args))
    pending = next.catch(() => {})
    return next
  }
}

async function handleLauncherMessages (lines, getBot, sendEvent = emit, configureNavigation = null, receiveSession = null) {
  const pendingDrops = new Set()
  for await (const line of lines) {
    if (!line.trim()) continue
    let request
    try {
      request = JSON.parse(line)
    } catch {
      sendEvent('log', { message: 'invalid launcher message' })
      continue
    }
    if (request?.type === 'navigation_config' && typeof request.enabled === 'boolean') {
      configureNavigation?.(request.enabled)
      continue
    }
    if (request?.type === 'minecraft_session') {
      receiveSession?.(request)
      continue
    }
    if (!['chat', 'command', 'storage_config', 'storage_probe', 'storage_scan', 'storage_assign', 'workflow', 'inventory_drop', 'player_control'].includes(request?.type) || typeof request.requestId !== 'string') continue
    try {
      const bot = getBot(request.type)
      if (!bot) throw new Error('Бот не подключён к серверу')
      if (request.type === 'player_control') {
        if (!bot.launcherPlayerControl) throw new Error('Управление из Minecraft выключено')
        await bot.launcherPlayerControl.switchMode(request.action)
        sendEvent('chat_result', { requestId: request.requestId })
        continue
      }
      if (bot.launcherPlayerControl?.busy) throw new Error('Верните управление боту перед запуском команд')
      if (request.type === 'storage_assign') {
        if (!Array.isArray(request.records) || request.records.length > 512) throw new Error('Некорректные результаты проверки складов')
        sendEvent('chat_result', { requestId: request.requestId, result: assignStorage(request.records, []) })
        continue
      }
      if (request.type === 'storage_probe') {
        if (!bot.launcherStorageInspection) throw new Error('Обновите расширение и переподключите бота для поиска складов')
        sendEvent('chat_result', { requestId: request.requestId, result: bot.launcherStorageInspection.probe() })
        continue
      }
      if (request.type === 'storage_scan') {
        if (!bot.launcherStorageInspection) throw new Error('Поиск складов ещё не готов')
        if (!['start', 'stop', 'discover', 'inspect', 'snapshot'].includes(request.action)) throw new Error('Неизвестное действие поиска складов')
        if (request.action === 'snapshot') {
          sendEvent('chat_result', { requestId: request.requestId, result: bot.launcherStorageInspection.snapshot() })
          continue
        }
        if (request.action === 'stop') {
          await bot.launcherStorageInspection.stop(request.token)
          sendEvent('chat_result', { requestId: request.requestId, message: 'Поиск складов остановлен' })
        } else {
          const operation = bot.launcherStorageInspection.run(request.radius, request.token, {
            phase: request.action, blocks: request.blocks, origin: request.origin, teamSize: request.teamSize, teamTotal: request.teamTotal
          }).then(
            result => sendEvent('chat_result', { requestId: request.requestId, result }),
            error => sendEvent('chat_result', { requestId: request.requestId, error: error.message || String(error) })
          )
          pendingDrops.add(operation)
          void operation.finally(() => pendingDrops.delete(operation))
        }
        continue
      }
      if (request.type === 'inventory_drop') {
        if (!bot.launcherInventoryActions) throw new Error('Перезапустите бота, чтобы включить управление инвентарём')
        // Keep reading stdin while a batch is running so stop can cancel it.
        // The controller owns the inventory queue and rejects duplicate drops.
        const operation = Promise.resolve().then(() => bot.launcherInventoryActions.drop(request.items)).then(
          message => sendEvent('chat_result', { requestId: request.requestId, message }),
          error => sendEvent('chat_result', { requestId: request.requestId, error: error.message || String(error) })
        )
        pendingDrops.add(operation)
        void operation.then(() => pendingDrops.delete(operation), () => pendingDrops.delete(operation))
        continue
      }
      if (request.type === 'workflow') {
        if (bot.launcherInventoryActions?.busy) {
          if (request.action === 'stop') bot.launcherInventoryActions.cancel()
          else throw new Error('Бот выбрасывает предметы. Дождитесь завершения действия')
        }
        if (!bot.launcherWorkflow) throw new Error('Сценарии ещё не готовы. Обновите расширение и перезапустите бота')
        const message = await bot.launcherWorkflow.dispatch(request.action, request.steps, request.name)
        sendEvent('chat_result', { requestId: request.requestId, message })
        continue
      }
      if (request.type === 'storage_config') {
        if (!bot.launcherGathering) throw new Error('Система добычи ещё не готова')
        if (bot.launcherConfigureStorage) await bot.launcherConfigureStorage(request.groups)
        else bot.launcherGathering.configureStorage(request.groups)
        sendEvent('chat_result', { requestId: request.requestId, message: 'Группы сундуков применены' })
        continue
      }
      if (typeof request.message !== 'string' || !request.message.trim()) {
        throw new Error('Введите сообщение')
      }
      const message = request.message.trim()
      // Control characters are intentionally rejected before chat/command dispatch.
      // eslint-disable-next-line no-control-regex
      if (message.length > 240 || /[\u0000-\u001f\u007f-\u009f§]/.test(message)) {
        throw new Error('Сообщение слишком длинное или содержит недопустимые символы')
      }
      const bareCommand = bot.launcherBareCommands?.has(message.split(/\s+/)[0].toLowerCase())
      const localCommand = request.type === 'command' || (!request.literalChat && bot.launcherCommand && (message.startsWith(bot.launcherCommandPrefix) || bareCommand))
      if (localCommand) {
        if (!bot.launcherCommand) throw new Error('Команды бота ещё не готовы')
        await bot.launcherCommand(message.startsWith(bot.launcherCommandPrefix) ? message : `${bot.launcherCommandPrefix}${message}`)
      }
      else await bot.chat(message)
      sendEvent('chat_result', {
        requestId: request.requestId,
        message: `${localCommand ? 'command executed' : 'chat sent'}: ${message}`
      })
    } catch (error) {
      sendEvent('chat_result', {
        requestId: request.requestId,
        error: error.message || String(error)
      })
    }
  }
  await Promise.all(pendingDrops)
}

function loadMovementExtras (bot) {
  optionalRequire('prismarine-physics')

  const movementModule = optionalRequire('mineflayer-movement')
  if (!movementModule) return

  const plugin =
    movementModule.plugin ||
    movementModule.default ||
    movementModule.movement ||
    movementModule

  if (typeof plugin !== 'function') {
    emit('status', {
      state: 'starting',
      message: 'mineflayer-movement loaded without a plugin export'
    })
    return
  }

  try {
    bot.loadPlugin(plugin)
    emit('status', { state: 'starting', message: 'mineflayer-movement loaded' })
  } catch (error) {
    emit('status', {
      state: 'starting',
      message: `mineflayer-movement skipped: ${error.message}`
    })
  }
}

function getPlayerEntity (bot, username) {
  const match = Object.entries(bot.players).find(([name]) => sameName(name, username))
  return match?.[1]?.entity || null
}

function createBotOptions (config) {
  const options = {
    host: config.server.host,
    port: Number(config.server.port) || 25565,
    checkTimeoutInterval: config.connection.checkTimeoutIntervalMs,
    respawn: Boolean(config.connection.autoRespawn),
    hideErrors: true,
    plugins: {
      time: compatibleTimePlugin
    }
  }

  if (config.server.version) {
    options.version = config.server.version
  }

  if (config.account.mode === 'microsoft') {
    const accessToken = config.account.accessToken
    const profile = { id: normalizeUuid(config.account.uuid), name: config.account.username }
    if (typeof accessToken !== 'string' || !accessToken || !/^[0-9a-f]{32}$/i.test(profile.id)) {
      throw new Error('Invalid session for Minecraft. Sign in again in ScreenLauncher.')
    }
    options.username = profile.name
    options.auth = (client, protocolOptions) => {
      // minecraft-protocol ignores a supplied session in its default offline branch.
      const session = { accessToken, selectedProfile: profile }
      client.session = session
      client.username = profile.name
      protocolOptions.accessToken = accessToken
      protocolOptions.haveCredentials = true
      client.emit('session', session)
      protocolOptions.connect(client)
    }
  } else {
    options.username = config.account.username
    options.auth = 'offline'
  }

  return options
}

async function selectMineflayer (options) {
  if (options.version && options.version !== minecraft263Version) return mineflayer

  if (!options.version) {
    const protocol = createRequire(require.resolve('@wp2508/mineflayer'))('minecraft-protocol')
    const status = await protocol.ping({
      host: options.host,
      port: options.port,
      version: minecraft263Version,
      closeTimeout: options.checkTimeoutInterval,
      noPongTimeout: 1000
    })
    if (status.version?.protocol !== minecraft263Protocol) return mineflayer
    options.version = minecraft263Version
  }

  return require('@wp2508/mineflayer')
}

async function main () {
  const majorNode = Number(process.versions.node.split('.')[0])
  if (majorNode < 22) {
    throw new Error(`Node.js 22+ is required by mineflayer, current is ${process.versions.node}`)
  }

  const input = createLauncherInput(process.stdin)
  const firstLine = await input.next()
  if (firstLine.done) throw new Error('Missing bot configuration')
  const config = parseConfig(firstLine.value)
  const prefix = config.commands.prefix
  const ownerName = config.ownerName
  const serverLabel = `${config.server.host}:${config.server.port}`
  const allowedOwners = [ownerName, ...config.commands.extraOwners]
  const commandTimestamps = new Map()
  // One crew link per worker: it outlives reconnects, so leases survive them.
  const crew = createCrewLink({
    key: `${String(config.server.host).toLowerCase()}:${config.server.port || 25565}`,
    name: String(config.account.username).toLowerCase(),
    log: message => emit('log', { message })
  })

  let activeBot = null
  let chatReady = false
  let reconnectTimer = null
  let reconnectAttempts = 0
  let stopping = false
  let nextSessionRequest = 0
  let pendingSession = null

  if (compatibilityVersion) {
    emit('status', {
      state: 'starting',
      message: `Minecraft ${compatibilityVersion} compatibility data loaded`
    })
  }

  function isOwner (username) {
    return allowedOwners.some((owner) => sameName(owner, username))
  }

  function sourceEnabled (source) {
    return config.commands.source === 'both' || config.commands.source === source
  }

  function finish (code = 0) {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    setTimeout(() => process.exit(code), 50)
  }

  function receiveSession ({ requestId, accessToken, error }) {
    if (!pendingSession || pendingSession.id !== requestId) return
    const { resolve, reject, timer } = pendingSession
    pendingSession = null
    clearTimeout(timer)
    if (typeof accessToken === 'string' && accessToken) resolve(accessToken)
    else reject(new Error(typeof error === 'string' ? error : 'Minecraft session is unavailable'))
  }

  function requestSession () {
    return new Promise((resolve, reject) => {
      const id = `reconnect-${++nextSessionRequest}`
      const timer = setTimeout(() => receiveSession({ requestId: id, error: 'Timed out refreshing the Minecraft session' }), 30_000)
      pendingSession = { id, resolve, reject, timer }
      emit('minecraft_session_request', { requestId: id })
    })
  }

  function scheduleReconnect (reason) {
    if (stopping) {
      emit('end', { message: `disconnected${reason ? `: ${reason}` : ''}` })
      finish(0)
      return
    }

    if (isPermanentConnectionError(reason)) {
      emit('end', {
        message: `permanent connection error; reconnect disabled: ${reason}`
      })
      finish(1)
      return
    }

    if (!config.connection.autoReconnect) {
      emit('end', { message: `disconnected${reason ? `: ${reason}` : ''}` })
      finish(0)
      return
    }

    if (reconnectTimer) return
    if (
      config.connection.maxReconnectAttempts > 0 &&
      reconnectAttempts >= config.connection.maxReconnectAttempts
    ) {
      const message = `reconnect limit reached (${config.connection.maxReconnectAttempts})`
      emit('error', { error: message })
      finish(1)
      return
    }

    reconnectAttempts += 1
    const delaySeconds = (config.connection.reconnectDelayMs / 1000).toFixed(1)
    emit('status', {
      state: 'reconnecting',
      message: `reconnect ${reconnectAttempts}${
        config.connection.maxReconnectAttempts > 0
          ? `/${config.connection.maxReconnectAttempts}`
          : ''
      } in ${delaySeconds}s${reason ? `: ${reason}` : ''}`
    })

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void startConnection(true)
    }, config.connection.reconnectDelayMs)
  }

  async function startConnection (isReconnect = false) {
    if (stopping) return
    chatReady = false

    emit('status', {
      state: isReconnect ? 'reconnecting' : 'connecting',
      message: `${isReconnect ? 'reconnecting' : 'connecting'} ${config.account.username} to ${serverLabel}`
    })

    let bot
    try {
      if (isReconnect && config.account.mode === 'microsoft') {
        config.account.accessToken = await requestSession()
      }
      if (stopping) return
      const options = createBotOptions(config)
      const engine = await selectMineflayer(options)
      if (stopping) return
      if (config.playerControl && engine === mineflayer) throw new Error('Unsupported protocol version: управление из Minecraft требует Java 26.3')
      bot = engine.createBot(options)
      bot.prependOnceListener('inject_allowed', () => configureHashedInventory(bot))
    } catch (error) {
      if (stopping) return
      emit('error', { error: error.message || String(error) })
      scheduleReconnect(error.message || String(error))
      return
    }

    activeBot = bot
    let currentGoal = 'idle'
    let goalGeneration = 0
    let ended = false
    let kickReason = ''
    let combat = null
    let travel = null
    let gathering = null
    let production = null
    let workflow = null
    let chaoticMovement = null
    const playerControl = config.playerControl ? require('./player-control.cjs').createPlayerControl(bot, {
      accountUuid: config.account.uuid,
      prepare: preparePlayerControl,
      onStatus: playerControl => emit('player_control', { playerControl }),
      onError: error => emit('error', { error: `Управление из Minecraft: ${error.message}` })
    }) : null
    bot.launcherPlayerControl = playerControl
    bot.launcherOwnerName = ownerName

    function reply (username, source, text) {
      const message = clampChat(text)
      if (source === 'launcher' || !config.commands.sendFeedback) {
        emit('status', {
          state: 'connected',
          message: `command response for ${username}: ${message}`
        })
        return
      }

      if (source === 'whisper' && typeof bot.whisper === 'function') {
        bot.whisper(username, message)
      } else {
        bot.chat(message)
      }
    }

    async function stopMovement (cancelGathering = true, cancelWorkflow = true) {
      const generation = ++goalGeneration
      await bot.launcherStorageInspection?.stop()
      chaoticMovement?.stop()
      if (cancelWorkflow) await workflow?.stop()
      combat?.stop(true)
      await production?.stop()
      if (cancelGathering) await gathering?.stop()
      await travel?.stop()
      await combat?.idleTask
      if (generation !== goalGeneration || ended) return false
      if (bot.pathfinder) await bot.pathfinder.stop()
      if (generation !== goalGeneration || ended) return false
      bot.clearControlStates()
      currentGoal = 'idle'
      return true
    }

    async function preparePlayerControl () {
      if (bot.isAlive === false || bot.launcherSurvival?.busy || bot.launcherInventoryActions?.busy) {
        throw new Error('Дождитесь возрождения или завершения текущего действия')
      }
      await bot.launcherStorageInspection?.stop()
      if (workflow?.busy && !gathering?.busy && workflow.snapshot().phase !== 'paused') {
        throw new Error('Поставьте сценарий на паузу после текущего шага')
      }
      const follow = currentGoal.startsWith('follow ') ? currentGoal.slice(7) : null
      const automaticCombat = combat?.status === 'hostile mobs'
      const resumeGathering = await gathering.suspendForStorageInspection('Ручное управление')
      const resume = () => {
        if (ended || stopping) return
        resumeGathering()
        if (automaticCombat) combat.auto(true)
        if (follow) startFollowingOwner(false, follow, 'launcher')
        if (bot.isAlive === false && config.connection.autoRespawn) bot.respawn()
      }
      try {
        if (!(await stopMovement(false, false))) throw new Error('Бот отключился во время переключения')
      } catch (error) {
        resume()
        throw error
      }
      return resume
    }

    function startGoal (goal, label, destination, kind, radius) {
      if (!bot.pathfinder) throw new Error('Bot is not ready to move yet')
      bot.launcherTraffic?.adaptGoal(goal, kind)
      chaoticMovement?.stop()
      const generation = ++goalGeneration
      combat?.stop(true)
      currentGoal = label
      void Promise.all([production?.stop(), gathering?.stop(), travel?.stop()]).then(async () => {
        await bot.pathfinder.stop()
        if (generation !== goalGeneration || ended) return
        if (travel && destination) {
          travel.start(goal, destination, kind, label, radius)
          return
        }
        return bot.pathfinder.goto(goal)
      }).then(() => {
        if (travel && destination) return
        if (generation !== goalGeneration || ended) return
        currentGoal = 'idle'
        emit('status', { state: 'connected', message: `movement finished: ${label}` })
      }).catch((error) => {
        if (generation !== goalGeneration || ended) return
        currentGoal = 'idle'
        emit('error', { error: `movement ${label}: ${error.message || String(error)}` })
      })
    }

    function ownerEntity (username = ownerName) {
      return getPlayerEntity(bot, username)
    }

    function startFollowingOwner (announce, username = ownerName, source = 'chat') {
      const target = ownerEntity(username)
      if (!target || !bot.pathfinder) return false
      startGoal(
        GoalFollowEntity.fromEntity(target, config.movement.followDistance, { dynamic: true, neverfinish: true }),
        `follow ${username}`,
        () => target.isValid === false ? null : target.position,
        'follow', config.movement.followDistance
      )
      if (announce) reply(username, source, `Following ${username}`)
      return true
    }

    function commandHelp (username, source) {
      reply(username, source, `Один бот: ${prefix}@${bot.username} mine stone 64; группа: ${prefix}@Bot1,Bot2 stop; все: ${prefix}@all stop`)
      const commands = [
        'help',
        'status',
        'where',
        'come',
        'follow',
        'goto x y z',
        'chaos on|off',
        'stop',
        'look',
        'jump',
        'work status|pause|resume',
        'mine блок [кол-во]',
        'forest',
        'till [кол-во] [радиус]',
        'plant культура [кол-во] [радиус]',
        'harvest культура [кол-во] [радиус] [replant|leave]',
        'farm культура [кол-во] [радиус]',
        'deliver',
        'craft предмет [кол-во]',
        'recipes предмет [кол-во]',
        'smelt предмет [кол-во]',
        'station open блок',
        'station scan [радиус]',
        'stash scan [радиус]',
        'station put|take|select|rename|close',
        'inventory'
      ]
      if (config.commands.allowSay) commands.push('say text')
      if (config.commands.allowQuit) commands.push('quit')
      if (config.combat.enabled) commands.push('attack player', 'bow player', 'pvp auto|stop|status')
      if (config.combat.enabled && config.combat.crystalEnabled) commands.push('crystal player')
      for (let index = 0; index < commands.length; index += 6)
        reply(username, source, commands.slice(index, index + 6).map((command) => `${prefix}${command}`).join(' '))
    }

    async function handleCommand (username, rawMessage, source) {
      if (activeBot !== bot || !isOwner(username) || (source !== 'launcher' && !sourceEnabled(source))) return
      const body = commandBodyForBot(rawMessage, prefix, bot.username, bot.launcherBareCommands)
      if (!body) return

      const now = Date.now()
      const lastCommandAt = commandTimestamps.get(username.toLowerCase()) || 0
      if (source !== 'launcher' && now - lastCommandAt < config.commands.cooldownMs) return
      if (source !== 'launcher') commandTimestamps.set(username.toLowerCase(), now)

      const [commandRaw, ...args] = body.split(/\s+/)
      const command = commandRaw.toLowerCase()
      const stationScan = command === 'station' && args[0] === 'scan'

      try {
        if (playerControl?.busy) throw new Error('Верните управление боту перед запуском команд')
        if (bot.launcherInventoryActions?.busy) {
          if (['stop', 'quit'].includes(command)) bot.launcherInventoryActions.cancel()
          else if (!stationScan && !['status', 'where', 'help', 'inventory'].includes(command))
            throw new Error('Бот выбрасывает предметы. Дождитесь завершения действия')
        }
        if (workflow?.busy && !stationScan && !['stop', 'status', 'where', 'help', 'inventory'].includes(command) && !(command === 'chaos' && args[0]?.toLowerCase() === 'off')) {
          throw new Error('Бот выполняет сценарий. Остановите его перед другой командой')
        }
        if (command === 'chaos') {
          if (!chaoticMovement) throw new Error('Движение ещё не готово. Перезапустите бота')
          const action = (args[0] || 'on').toLowerCase()
          if (!['on', 'off'].includes(action)) throw new Error(`Usage: ${prefix}chaos on|off`)
          if (action === 'off') {
            if (chaoticMovement.active) { chaoticMovement.stop(); currentGoal = 'idle' }
          } else {
            if (!(await stopMovement())) return
            currentGoal = 'chaos'
            chaoticMovement.start()
          }
          reply(username, source, action === 'on' ? 'Хаотичное движение включено' : 'Хаотичное движение остановлено')
          return
        }
        if (command === 'inventory') {
          reply(username, source, bot.launcherInventoryUrl || 'Веб-инвентарь ещё запускается')
          return
        }
        if (await handleProductionCommand(production, command, args, {
          prepare: () => stopMovement(), reply: text => reply(username, source, text)
        })) return
        if (await handleGatheringCommand(bot, gathering, command, args, {
          prepare: () => stopMovement(false), reply: text => reply(username, source, text),
          owner: () => ownerEntity(username)
        })) return

        if (command === 'help') {
          commandHelp(username, source)
          return
        }

        if (command === 'status') {
          const pos = formatPosition(bot.entity?.position)
          reply(
            username,
            source,
            `Bot ${bot.username} on ${serverLabel}; pos ${pos}; hp ${bot.health ?? '?'}; food ${bot.food ?? '?'}; goal ${currentGoal}; pvp ${combat?.status || 'not ready'}`
          )
          if (gathering?.busy) reply(username, source, gathering.status)
          if (production?.busy) reply(username, source, production.status)
          return
        }

        if (command === 'where') {
          reply(username, source, `I am at ${formatPosition(bot.entity?.position)}`)
          return
        }

        if (['attack', 'sword', 'bow', 'crystal'].includes(command)) {
          if (!combat) throw new Error('Combat is not ready yet')
          const target = combat.findTarget(args.join(' ') || 'nearest')
          if (!target) throw new Error('Target is not loaded nearby; move closer and use the exact player name, or nearest for a visible hostile mob')
          if (!(await stopMovement())) return
          combat.select(target, command === 'crystal' ? 'crystal' : command === 'bow' ? 'ranged' : command === 'sword' ? 'melee' : config.combat.style)
          reply(username, source, `Attacking ${target.username || target.name} (${combat.status})`)
          return
        }

        if (command === 'pvp') {
          if (!combat) throw new Error('Combat is not ready yet')
          const action = (args[0] || 'status').toLowerCase()
          if (action === 'auto') {
            if (!(await stopMovement())) return
            combat.auto(true)
          } else if (action === 'stop') {
            if (!(await stopMovement())) return
          } else if (action !== 'status') {
            reply(username, source, `Usage: ${prefix}pvp auto|stop|status`)
            return
          }
          reply(username, source, `PvP: ${combat.status}`)
          return
        }

        if (command === 'come') {
          const target = ownerEntity(username)
          if (!target) {
            reply(username, source, `I cannot see ${username}`)
            return
          }
          const pos = target.position.clone()
          startGoal(
            new GoalNear(
              pos.x,
              pos.y,
              pos.z,
              config.movement.followDistance
            ),
            `near ${username}`,
            () => pos, 'come', config.movement.followDistance
          )
          reply(username, source, `Coming to ${username}`)
          return
        }

        if (command === 'follow') {
          if (!startFollowingOwner(true, username, source)) {
            reply(username, source, `I cannot see ${username}`)
          }
          return
        }

        if (command === 'goto') {
          if (args.length < 3) {
            reply(username, source, `Usage: ${prefix}goto x y z`)
            return
          }
          const [x, y, z] = args.slice(0, 3).map(Number)
          if (![x, y, z].every(Number.isFinite)) {
            reply(username, source, `Usage: ${prefix}goto x y z`)
            return
          }
          startGoal(
            new GoalNear(x, y, z, config.movement.gotoRadius),
            `goto ${x} ${y} ${z}`,
            () => new Vec3(x, y, z), 'goto', config.movement.gotoRadius
          )
          reply(
            username,
            source,
            `Going to ${x} ${y} ${z} (radius ${config.movement.gotoRadius})`
          )
          return
        }

        if (command === 'stop') {
          if (!(await stopMovement())) return
          reply(username, source, 'Stopped')
          return
        }

        if (command === 'look') {
          const target = ownerEntity(username)
          if (!target) {
            reply(username, source, `I cannot see ${username}`)
            return
          }
          if (!(await stopMovement())) return
          await bot.lookAt(target.position.offset(0, target.height || 1.6, 0), true)
          reply(username, source, `Looking at ${username}`)
          return
        }

        if (command === 'jump') {
          if (!(await stopMovement())) return
          bot.setControlState('jump', true)
          setTimeout(() => {
            if (activeBot === bot) bot.setControlState('jump', false)
          }, 350)
          reply(username, source, 'Jump')
          return
        }

        if (command === 'say') {
          if (!config.commands.allowSay) {
            reply(username, source, 'The say command is disabled')
            return
          }
          const text = body.slice(commandRaw.length).trim()
          if (!text) {
            reply(username, source, `Usage: ${prefix}say text`)
            return
          }
          bot.chat(clampChat(text))
          return
        }

        if (command === 'quit') {
          if (!config.commands.allowQuit) {
            reply(username, source, 'The quit command is disabled')
            return
          }
          reply(username, source, 'Quitting')
          if (!(await stopMovement())) return
          stopping = true
          setTimeout(() => bot.quit('owner quit command'), 150)
          return
        }

        if (source === 'launcher') throw new Error(`Неизвестная команда. ${prefix}help`)
        reply(username, source, `Unknown command. Try ${prefix}help`)
      } catch (error) {
        emit('error', { error: error.message })
        if (source === 'launcher') throw error
        reply(username, source, `Command failed: ${error.message}`)
      }
    }

    loadMovementExtras(bot)
    const queuedCommand = createCommandQueue(handleCommand)
    bot.launcherCommandPrefix = prefix
    bot.launcherBareCommands = new Set([...GATHERING_COMMANDS, ...PRODUCTION_COMMANDS, 'inventory', 'chaos'])
    bot.launcherCommand = message => queuedCommand(ownerName, message, 'launcher')
    bot.launcherMovementGoal = () => currentGoal

    bot.once('spawn', () => {
      reconnectAttempts = 0
      try {
        configurePathfinder(bot, config.movement, config.behavior)
        createFleetNavigation(bot, crew, { enabled: config.crowdAvoidance !== false })
        createSurvivalController(bot, config.survival, {
          onStatus: message => emit('status', { state: 'connected', message }),
          onError: error => emit('error', { error: `survival: ${error.message || String(error)}` })
        })
        combat = createCombatController(bot, config.combat, {
          isOwner,
          onStatus: message => emit('status', { state: 'connected', message }),
          onError: error => emit('error', { error: `combat: ${error.message || String(error)}` })
        })
        bot.launcherCombat = combat
        travel = createTravelController(bot, config.combat, {
          onStatus: message => emit('status', { state: 'connected', message }),
          onFinished: label => {
            currentGoal = 'idle'
            emit('status', { state: 'connected', message: `movement finished: ${label}` })
          },
          onError: error => emit('error', { error: `movement: ${error.message || String(error)}` })
        })
        bot.launcherTravel = travel
        chaoticMovement = createChaoticMovementController(bot, config.movement, {
          onChange: () => bot.emit('launcherMovementChanged'),
          onError: error => emit('error', { error: `chaotic movement: ${error.message || String(error)}` })
        })
        bot.launcherChaoticMovement = chaoticMovement
        // The work loop reports once a second; forward only what changed so
        // a fleet does not flood the launcher with identical snapshots.
        gathering = createGatheringController(bot, config.gathering, {
          isOwner,
          crew,
          onAimChange: aim => { config.gathering = { ...config.gathering, ...aim } },
          onStatus: onlyChanges(message => emit('status', { state: 'connected', message })),
          onProgress: onlyChanges(gathering => emit('gathering', { gathering }))
        })
        production = createProductionController(bot, {
          onStart: () => emit('production_started'),
          onStatus: message => emit('status', { state: 'connected', message }),
          onError: error => emit('error', { error: `production: ${error.message || String(error)}` })
        })
        workflow = createWorkflowController({ bot, gathering, production,
          prepare: () => stopMovement(true, false),
          onStatus: message => { if (chatReady && !ended) emit('status', { state: 'connected', message }) }
        })
        bot.launcherConfigureStorage = groups => {
          const normalized = gathering.configureStorage(groups)
          config.gathering = { ...config.gathering, storageGroups: normalized }
          return normalized
        }
        createStorageInspection(bot, { gathering, production, stopMovement: async () => {
          goalGeneration++
          chaoticMovement?.stop()
          combat?.stop(true)
          await combat?.idleTask
          await travel?.stop()
          await bot.pathfinder.stop()
          currentGoal = 'storage inspection'
        } })
        bot.launcherInventoryActions = createInventoryActions(bot, {
          prepare: () => stopMovement(),
          onChange: () => bot.emit('launcherInventoryChanged')
        })
        startInventoryTelemetry(bot, {
          onUpdate: inventory => emit('bot_inventory', { inventory }),
          onCatalog: catalog => emit('minecraft_catalog', { catalog })
        })
        void startWebInventory(bot, {
          onReady: inventoryUrl => { bot.launcherInventoryUrl = inventoryUrl; emit('inventory', { inventoryUrl }) },
          onError: error => emit('log', { message: `Веб-инвентарь: ${error.message}` })
        })
      } catch (error) {
        emit('error', { error: `Bot plugin initialization failed: ${error.message}` })
        bot.quit('bot plugin initialization failed')
        return
      }

      chatReady = true
      emit('ready', {
        botUsername: bot.username,
        message: `connected as ${bot.username} on Minecraft ${bot.version}; navigation minecraft-pathfinding-2026; owners ${allowedOwners.join(', ')}; prefix ${prefix}; source ${config.commands.source}`
      })
      if (playerControl) {
        try { playerControl.start() } catch (error) { emit('error', { error: `Управление из Minecraft: ${error.message}` }) }
      }

      if (config.behavior.announceOnSpawn && config.behavior.spawnMessage) {
        const message = renderTemplate(config.behavior.spawnMessage, {
          owner: ownerName,
          bot: bot.username,
          server: serverLabel
        })
        if (message.trim()) setTimeout(() => bot.chat(clampChat(message)), 500)
      }

      if (config.behavior.autoFollowOnSpawn) {
        let attempts = 0
        const tryFollow = () => {
          if (activeBot !== bot || ended || stopping) return
          if (gathering?.busy || production?.busy || workflow?.busy || chaoticMovement?.active) return
          attempts += 1
          if (startFollowingOwner(false)) {
            emit('status', {
              state: 'connected',
              message: `auto-following ${ownerName}`
            })
            return
          }
          if (attempts < 10) {
            setTimeout(tryFollow, 2000)
          } else {
            emit('status', {
              state: 'connected',
              message: `auto-follow skipped: ${ownerName} is not visible`
            })
          }
        }
        setTimeout(tryFollow, 1200)
      }
    })

    bot.on('chat', (username, message) => {
      if (sameName(username, bot.username)) return
      void queuedCommand(username, message, 'chat').catch(error => emit('error', { error: error.message }))
    })

    bot.on('whisper', (username, message) => {
      if (sameName(username, bot.username)) return
      void queuedCommand(username, message, 'whisper').catch(error => emit('error', { error: error.message }))
    })

    if (config.behavior.logPathUpdates) {
      bot.on('pathGenerated', (result) => {
        if (result?.status) {
          emit('status', {
            state: 'connected',
            message: `path ${result.status}; visited ${result.visitedNodes ?? '?'}`
          })
        }
      })
      bot.on('resetPath', (reason) => {
        emit('status', { state: 'connected', message: `path reset: ${reason}` })
      })
      bot.on('pathFailed', failure => {
        emit('log', { message: `path execution failed: ${JSON.stringify(failure)}` })
      })
    }

    bot.on('death', () => {
      chatReady = false
      void stopMovement().catch((error) => emit('error', { error: error.message }))
      currentGoal = 'idle'
      emit('status', {
        state: config.connection.autoRespawn ? 'respawning' : 'dead',
        message: config.connection.autoRespawn
          ? 'bot died; waiting for respawn'
          : 'bot died; auto respawn is disabled'
      })
    })

    bot.on('respawn', () => {
      chatReady = true
      emit('status', { state: 'connected', message: 'bot respawned' })
    })

    bot.on('kicked', (reason) => {
      kickReason = describeKickReason(reason)
      emit('error', { error: `kicked: ${kickReason}` })
    })

    bot.on('error', (error) => {
      if (ended) return
      const message = error.code?.startsWith('FABRIC_')
        ? `${error.code}: ${error.message}`
        : error.message
      if (isPermanentConnectionError(message)) kickReason = message
      emit('error', { error: message })
    })

    bot.on('end', (reason) => {
      if (ended) return
      ended = true
      playerControl?.close()
      bot.launcherInventoryActions?.dispose()
      bot.launcherTraffic?.dispose()
      bot.launcherStorageInspection?.dispose()
      chaoticMovement?.dispose()
      void workflow?.stop().catch(error => emit('log', { message: `scenario shutdown: ${error.message}` }))
      void production?.dispose().catch(error => emit('log', { message: `production shutdown: ${error.message}` }))
      void gathering?.dispose().catch(error => emit('log', { message: `gathering shutdown: ${error.message}` }))
      bot.launcherSurvival?.dispose()
      travel?.dispose()
      combat?.dispose()
      goalGeneration++
      if (activeBot === bot) {
        activeBot = null
        chatReady = false
      }
      scheduleReconnect(kickReason || formatReason(reason))
    })
    installFabricSupport(bot, emit)
  }

  function requestShutdown (signal) {
    if (stopping) return
    stopping = true
    chatReady = false
    if (pendingSession) receiveSession({ requestId: pendingSession.id, error: 'Worker stopped' })
    emit('status', { state: 'stopping', message: `received ${signal}` })
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    if (activeBot) {
      activeBot.launcherPlayerControl?.close()
      activeBot.launcherInventoryActions?.dispose()
      activeBot.launcherTraffic?.dispose()
      activeBot.launcherStorageInspection?.dispose()
      activeBot.launcherChaoticMovement?.dispose()
      void activeBot.launcherWorkflow?.stop().catch(error => emit('log', { message: error.message }))
      void activeBot.launcherProduction?.dispose().catch(error => emit('log', { message: error.message }))
      void activeBot.launcherGathering?.dispose().catch(error => emit('log', { message: error.message }))
      activeBot.launcherSurvival?.dispose()
      activeBot.launcherTravel?.dispose()
      activeBot.launcherCombat?.dispose()
      activeBot.quit(`worker ${signal}`)
    } else {
      finish(0)
    }
  }

  process.on('SIGINT', () => requestShutdown('SIGINT'))
  process.on('SIGTERM', () => requestShutdown('SIGTERM'))

  void handleLauncherMessages(input, type => !stopping && (chatReady || type === 'player_control') ? activeBot : null, emit, enabled => {
    config.crowdAvoidance = enabled
    activeBot?.launcherTraffic?.setEnabled(enabled)
  }, receiveSession)
    .catch(error => emit('error', { error: `launcher input: ${error.message || String(error)}` }))

  await startConnection(false)
}

if (require.main === module) {
  main().catch((error) => {
    emit('error', { error: error.message || String(error) })
    process.exit(1)
  })
}

module.exports = {
  commandBodyForBot,
  createLauncherInput,
  createCommandQueue,
  handleLauncherMessages,
  parseConfig,
  configurePathfinder,
  compatibleTimePlugin,
  createBotOptions,
  describeKickReason,
  flattenStructuredText,
  formatReason,
  isPermanentConnectionError,
  protocolLongToBigInt
}
