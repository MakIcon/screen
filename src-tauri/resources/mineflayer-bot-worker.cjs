#!/usr/bin/env node

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const { GoalFollow, GoalNear } = goals

function emit(type, payload = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`)
}

function optionalRequire(name) {
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

function normalizeUuid(uuid) {
  return typeof uuid === 'string' ? uuid.replace(/-/g, '') : uuid
}

function sameName(left, right) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase()
}

function clampChat(text) {
  return String(text || '').slice(0, 240)
}

function formatPosition(position) {
  if (!position) return 'unknown'
  return `${position.x.toFixed(1)} ${position.y.toFixed(1)} ${position.z.toFixed(1)}`
}

function parseConfig(raw) {
  const config = JSON.parse(raw)
  if (!config.server || !config.server.host) {
    throw new Error('server.host is required')
  }
  if (!config.account || !config.account.username) {
    throw new Error('account.username is required')
  }
  return config
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on('data', (chunk) => chunks.push(chunk))
    process.stdin.on('error', reject)
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function loadMovementExtras(bot) {
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

function getPlayerEntity(bot, username) {
  const match = Object.entries(bot.players).find(([name]) => sameName(name, username))
  return match?.[1]?.entity || null
}

async function main() {
  const majorNode = Number(process.versions.node.split('.')[0])
  if (majorNode < 22) {
    throw new Error(`Node.js 22+ is required by mineflayer, current is ${process.versions.node}`)
  }

  const config = parseConfig(await readStdin())
  const prefix = config.commandPrefix || '!'
  const ownerName = config.ownerName
  const followDistance = Math.max(1, Math.min(Number(config.followDistance) || 3, 16))
  const serverLabel = `${config.server.host}:${config.server.port}`

  const options = {
    host: config.server.host,
    port: Number(config.server.port) || 25565
  }

  if (config.server.version) {
    options.version = config.server.version
  }

  if (config.account.mode === 'microsoft') {
    options.session = {
      accessToken: config.account.accessToken,
      selectedProfile: {
        id: normalizeUuid(config.account.uuid),
        name: config.account.username
      }
    }
  } else {
    options.username = config.account.username
    options.auth = 'offline'
  }

  emit('status', {
    state: 'connecting',
    message: `connecting ${config.account.username} to ${serverLabel}`
  })

  const bot = mineflayer.createBot(options)
  let defaultMoves = null
  let currentGoal = 'idle'

  function reply(text) {
    bot.chat(clampChat(text))
  }

  function stopMovement() {
    if (bot.pathfinder) bot.pathfinder.stop()
    bot.clearControlStates()
    currentGoal = 'idle'
  }

  function ownerEntity() {
    return getPlayerEntity(bot, ownerName)
  }

  function commandHelp() {
    reply(`${prefix}help ${prefix}status ${prefix}where ${prefix}come ${prefix}follow ${prefix}goto x y z ${prefix}stop ${prefix}look ${prefix}jump ${prefix}say text ${prefix}quit`)
  }

  async function handleCommand(username, rawMessage) {
    if (!sameName(username, ownerName)) return
    if (!rawMessage.startsWith(prefix)) return

    const body = rawMessage.slice(prefix.length).trim()
    if (!body) return

    const [commandRaw, ...args] = body.split(/\s+/)
    const command = commandRaw.toLowerCase()

    try {
      if (command === 'help') {
        commandHelp()
        return
      }

      if (command === 'status') {
        const pos = formatPosition(bot.entity?.position)
        reply(`Bot ${bot.username} on ${serverLabel}; pos ${pos}; hp ${bot.health ?? '?'}; food ${bot.food ?? '?'}; goal ${currentGoal}`)
        return
      }

      if (command === 'where') {
        reply(`I am at ${formatPosition(bot.entity?.position)}`)
        return
      }

      if (command === 'come') {
        const target = ownerEntity()
        if (!target) {
          reply(`I cannot see ${ownerName}`)
          return
        }
        const pos = target.position
        currentGoal = `near ${ownerName}`
        bot.pathfinder.setMovements(defaultMoves)
        bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, followDistance))
        reply(`Coming to ${ownerName}`)
        return
      }

      if (command === 'follow') {
        const target = ownerEntity()
        if (!target) {
          reply(`I cannot see ${ownerName}`)
          return
        }
        currentGoal = `follow ${ownerName}`
        bot.pathfinder.setMovements(defaultMoves)
        bot.pathfinder.setGoal(new GoalFollow(target, followDistance), true)
        reply(`Following ${ownerName}`)
        return
      }

      if (command === 'goto') {
        if (args.length < 3) {
          reply(`Usage: ${prefix}goto x y z`)
          return
        }
        const [x, y, z] = args.slice(0, 3).map(Number)
        if (![x, y, z].every(Number.isFinite)) {
          reply(`Usage: ${prefix}goto x y z`)
          return
        }
        currentGoal = `goto ${x} ${y} ${z}`
        bot.pathfinder.setMovements(defaultMoves)
        bot.pathfinder.setGoal(new GoalNear(x, y, z, 1))
        reply(`Going to ${x} ${y} ${z}`)
        return
      }

      if (command === 'stop') {
        stopMovement()
        reply('Stopped')
        return
      }

      if (command === 'look') {
        const target = ownerEntity()
        if (!target) {
          reply(`I cannot see ${ownerName}`)
          return
        }
        await bot.lookAt(target.position.offset(0, target.height || 1.6, 0), true)
        reply(`Looking at ${ownerName}`)
        return
      }

      if (command === 'jump') {
        bot.setControlState('jump', true)
        setTimeout(() => bot.setControlState('jump', false), 350)
        reply('Jump')
        return
      }

      if (command === 'say') {
        const text = body.slice(commandRaw.length).trim()
        if (!text) {
          reply(`Usage: ${prefix}say text`)
          return
        }
        reply(text)
        return
      }

      if (command === 'quit') {
        reply('Quitting')
        setTimeout(() => bot.quit('launcher quit'), 150)
        return
      }

      reply(`Unknown command. Try ${prefix}help`)
    } catch (error) {
      emit('error', { error: error.message })
      reply(`Command failed: ${error.message}`)
    }
  }

  bot.loadPlugin(pathfinder)
  loadMovementExtras(bot)

  bot.once('spawn', () => {
    defaultMoves = new Movements(bot)
    bot.pathfinder.setMovements(defaultMoves)
    emit('ready', {
      botUsername: bot.username,
      message: `connected as ${bot.username}; owner ${ownerName}; prefix ${prefix}`
    })
  })

  bot.on('chat', (username, message) => {
    if (sameName(username, bot.username)) return
    void handleCommand(username, message)
  })

  bot.on('whisper', (username, message) => {
    if (sameName(username, bot.username)) return
    void handleCommand(username, message)
  })

  bot.on('goal_reached', (goal) => {
    currentGoal = 'idle'
    emit('status', { state: 'connected', message: `goal reached ${goal?.constructor?.name || ''}`.trim() })
  })

  bot.on('path_update', (result) => {
    if (result?.status) {
      emit('status', { state: 'connected', message: `path ${result.status}` })
    }
  })

  bot.on('kicked', (reason) => {
    emit('error', { error: `kicked: ${String(reason)}` })
  })

  bot.on('error', (error) => {
    emit('error', { error: error.message })
  })

  bot.on('end', (reason) => {
    emit('end', { message: `disconnected${reason ? `: ${reason}` : ''}` })
    setTimeout(() => process.exit(0), 50)
  })
}

main().catch((error) => {
  emit('error', { error: error.message || String(error) })
  process.exit(1)
})
