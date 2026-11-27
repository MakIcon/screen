const { randomUUID } = require('node:crypto')
const { createRequire } = require('node:module')
const { fromNotchianYaw, fromNotchianPitch, toNotchianYaw, toNotchianPitch } = require('mineflayer/lib/conversions')

const CAMERA_ENTITY = 0x40000000
const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator']
const GAME_INPUT = new Set([
  'position', 'position_look', 'look', 'flying', 'player_input', 'tick_end', 'entity_action',
  'vehicle_move', 'steer_boat', 'attack', 'use_entity', 'punch', 'arm_animation', 'block_dig',
  'block_place', 'use_item', 'held_item_slot', 'client_command', 'close_window', 'window_click',
  'craft_recipe_request', 'enchant_item', 'name_item', 'select_trade', 'set_creative_slot',
  'set_beacon_effect', 'update_sign', 'edit_book', 'set_slot_state', 'select_bundle_item'
])
const SNAPSHOT_PACKETS = new Set([
  'update_view_position', 'update_view_distance', 'simulation_distance', 'spawn_position',
  'difficulty', 'initialize_world_border', 'update_time', 'declare_recipes',
  'tags', 'abilities', 'update_health', 'experience'
])
const CONFIGURATION_PACKETS = new Set(['feature_flags', 'registry_data', 'tags'])
const CAMERA_EXCLUDED = new Set([
  'abilities', 'camera', 'open_window', 'open_horse_window', 'close_window', 'window_items',
  'craft_progress_bar', 'set_slot', 'set_cursor_item', 'set_player_inventory', 'held_item_slot',
  'trade_list', 'vehicle_move', 'open_sign_entity', 'death_combat_event', 'face_player'
])
const SESSION_PACKETS = new Set([
  'login', 'respawn', 'position', 'start_configuration', 'keep_alive', 'ping', 'ping_response',
  'kick_disconnect', 'custom_payload', 'server_data', 'player_chat', 'profileless_chat',
  'system_chat', 'hide_message', 'chunk_batch_start', 'chunk_batch_finished', 'acknowledge_player_digging'
])
const ENTITY_STATE = new Set(['entity_metadata', 'entity_equipment', 'entity_update_attributes', 'entity_head_rotation'])
const uuidKey = uuid => String(uuid).replace(/-/g, '').toLowerCase()
const chunkKey = (x, z) => `${x},${z}`
const rotationByte = degrees => ((Math.floor(degrees * 256 / 360) + 128) & 255) - 128

function createPlayerControl (bot, { accountUuid, prepare, onStatus, onError }) {
  const dependency = createRequire(require.resolve('@wp2508/mineflayer'))
  const protocol = dependency('minecraft-protocol')
  const { getNextSequence } = dependency('./lib/interaction_sequence.js')
  const upstream = bot._client
  const forwardPlayerInput = upstream.write.bind(upstream)
  const configuration = []
  const chunks = new Map(), players = new Map(), entities = new Map(), snapshot = new Map()
  const predictions = new Map()
  const avatarUuid = randomUUID()
  let login, commands, server, viewer, authenticated, address, Item, originalWrite, release
  let mode = 'bot', disposed = false, switching = false, worldReady = false, inventoryState = 0
  let teleportId = 0, pendingPosition = null, positionTimeout

  const publish = () => onStatus({ address, mode, switching })
  const text = (client, message) => client.write('system_chat', { content: { type: 'string', value: message }, isActionBar: false })
  const write = (name, data) => { if (viewer?.state === 'play') viewer.write(name, data) }
  const transform = (entity = bot.entity) => ({
    x: entity.position.x, y: entity.position.y, z: entity.position.z,
    yaw: toNotchianYaw(entity.yaw || 0), pitch: toNotchianPitch(entity.pitch || 0)
  })

  function positionViewer () {
    if (!viewer || !bot.entity) return
    pendingPosition = ++teleportId
    clearTimeout(positionTimeout)
    positionTimeout = setTimeout(() => viewer?.end('Minecraft не подтвердил позицию персонажа'), 10_000)
    write('position', { ...transform(), teleportId: pendingPosition, flags: 0, dx: 0, dy: 0, dz: 0 })
  }

  function spawnAvatar () {
    const pose = transform()
    write('player_info', {
      action: { add_player: true },
      data: [{ uuid: avatarUuid, player: { name: bot.username, properties: [] } }]
    })
    write('spawn_entity', {
      entityId: CAMERA_ENTITY, objectUUID: avatarUuid, type: bot.registry.entitiesByName.player.id,
      x: pose.x, y: pose.y, z: pose.z, velocity: { x: 0, y: 0, z: 0 },
      pitch: rotationByte(pose.pitch), yaw: rotationByte(pose.yaw), headPitch: rotationByte(pose.yaw), objectData: 0
    })
  }

  function updateAvatar () {
    if (mode !== 'camera' || !viewer || !bot.entity) return
    write('entity_teleport', { entityId: CAMERA_ENTITY, ...transform(), dx: 0, dy: 0, dz: 0, flags: 0, onGround: Boolean(bot.entity.onGround) })
  }

  function sendInventory () {
    write('window_items', {
      windowId: 0, stateId: inventoryState, items: bot.inventory.slots.map(item => Item.toNotch(item)),
      carriedItem: Item.toNotch(bot.inventory.selectedItem)
    })
    write('held_item_slot', { slot: bot.quickBarSlot || 0 })
  }

  function blockWorld (name, data) {
    if (name === 'map_chunk') chunks.set(chunkKey(data.x, data.z), { data })
    if (name === 'unload_chunk') chunks.delete(chunkKey(data.chunkX ?? data.x, data.chunkZ ?? data.z))
    if (name === 'update_light') {
      const column = chunks.get(chunkKey(data.chunkX ?? data.x, data.chunkZ ?? data.z))
      if (column) column.light = data
    }
    if (name === 'tile_entity_data') {
      const { x, y, z } = data.location
      const column = chunks.get(chunkKey(Math.floor(x / 16), Math.floor(z / 16)))
      if (column) (column.blockEntities ??= new Map()).set(`${x},${y},${z}`, data)
    }
  }

  function clearWorld () {
    worldReady = false
    chunks.clear()
    entities.clear()
    for (const key of ['update_view_position', 'spawn_position', 'initialize_world_border']) snapshot.delete(key)
  }

  function readUpstream (data, { name, state }, _packet, fullPacket) {
    if (state === 'configuration' && CONFIGURATION_PACKETS.has(name)) configuration.push([name, data])
    if (state !== 'play') return
    if (name === 'start_configuration') {
      viewer?.end('Мир меняется. Подключитесь к локальному адресу снова.')
      login = null
      commands = null
      clearWorld()
      snapshot.clear()
      players.clear()
      configuration.length = 0
      return
    }
    if (name === 'declare_commands') {
      // The viewer uses the same protocol. Preserve argument types the codec cannot encode.
      commands = Buffer.from(fullPacket)
      if (viewer?.state === 'play') viewer.writeRaw(commands)
      return
    }
    if (name === 'login') {
      login = data
      worldReady = false
    }
    if (name === 'respawn' && login) {
      login = { ...login, worldState: data.worldState }
      clearWorld()
      viewer?.end('Персонаж сменил мир. Подключитесь к локальному адресу снова.')
      return
    }
    blockWorld(name, data)
    if (name === 'acknowledge_player_digging') {
      const sequenceId = predictions.get(data.sequenceId)
      for (const id of predictions.keys()) if (id <= data.sequenceId) predictions.delete(id)
      if (mode === 'player' && sequenceId !== undefined) write(name, { sequenceId })
    }
    if (SNAPSHOT_PACKETS.has(name)) snapshot.set(name, data)
    if ((name === 'window_items' || name === 'set_slot') && data.windowId === 0) inventoryState = data.stateId
    if (name === 'player_info') {
      for (const entry of data.data) {
        const player = players.get(entry.uuid) || { uuid: entry.uuid }
        for (const [key, value] of Object.entries(entry)) if (value !== undefined && key !== 'chatSession') player[key] = value
        players.set(entry.uuid, player)
      }
    } else if (name === 'player_remove') {
      for (const uuid of data.players) players.delete(uuid)
    } else if (name === 'spawn_entity') {
      entities.set(data.entityId, { spawn: data, packets: new Map() })
    } else if (name === 'entity_destroy') {
      for (const id of data.entityIds) entities.delete(id)
    } else if (ENTITY_STATE.has(name)) {
      const entity = entities.get(data.entityId)
      const previous = entity?.packets.get(name)
      if (previous && name === 'entity_metadata') {
        const entries = new Map(previous.metadata.map(entry => [entry.key, entry]))
        for (const entry of data.metadata) entries.set(entry.key, entry)
        data = { ...data, metadata: [...entries.values()] }
      }
      entity?.packets.set(name, data)
    }
    if (viewer && !SESSION_PACKETS.has(name) && !(mode === 'camera' && (CAMERA_EXCLUDED.has(name) || name === 'game_state_change' && data.reason === 'change_game_mode'))) {
      write(name, data)
    }
  }

  function renderWorld () {
    write('login', { ...login, onlineMode: true, enforcesSecureChat: false, worldState: { ...login.worldState, gamemode: 'spectator' } })
    for (const [name, data] of snapshot) if (!CAMERA_EXCLUDED.has(name)) write(name, data)
    if (commands) viewer.writeRaw(commands)
    if (!snapshot.has('update_view_position')) {
      const { x, z } = bot.entity.position
      write('update_view_position', { chunkX: Math.floor(x / 16), chunkZ: Math.floor(z / 16) })
    }
    write('abilities', { flags: 7, flyingSpeed: 0.05, walkingSpeed: 0.1 })
    positionViewer()
    write('game_state_change', { reason: 'level_chunks_load_start', gameMode: 0 })
    write('chunk_batch_start', {})
    for (const { data, light, blockEntities } of chunks.values()) {
      const column = bot.world?.getColumn(data.x, data.z)
      write('map_chunk', column ? { ...data, chunkData: column.dump() } : data)
      if (light) write('update_light', light)
      for (const block of blockEntities?.values() || []) write('tile_entity_data', block)
    }
    write('chunk_batch_finished', { batchSize: chunks.size })
    for (const player of players.values()) {
      if (!player.player) continue
      write('player_info', { action: { add_player: true, update_listed: true }, data: [{ ...player, listed: player.listed ?? false }] })
    }
    for (const [id, { spawn, packets }] of entities) {
      const entity = bot.entities[id]
      if (!entity || id === bot.entity.id) continue
      const pose = transform(entity)
      write('spawn_entity', { ...spawn, x: pose.x, y: pose.y, z: pose.z, yaw: rotationByte(pose.yaw), pitch: rotationByte(pose.pitch) })
      for (const [name, data] of packets) write(name, data)
    }
    spawnAvatar()
  }

  function releasePlayer () {
    if (!release) return
    upstream.write = originalWrite
    bot.setExternalMovementControl(false)
    predictions.clear()
    const resume = release
    release = null
    if (bot.currentWindow && !upstream.ended && upstream.state === 'play') bot.closeWindow(bot.currentWindow)
    resume()
  }

  async function switchMode (action) {
    if (!['take', 'bot', 'camera'].includes(action)) throw new Error('Неизвестный режим управления')
    if (!viewer || !login) throw new Error('Сначала подключитесь к локальному адресу из Minecraft')
    if (switching) throw new Error('Смена управления уже выполняется')
    if (action === 'take' && mode === 'player') return
    if (action === 'take') {
      const client = viewer
      switching = true
      publish()
      try {
        const resume = await prepare()
        if (client !== viewer || disposed || !login) { resume(); return }
        release = resume
        bot.setExternalMovementControl(true)
        originalWrite = upstream.write
        upstream.write = function (name, data) {
          if (this.state !== 'play' || !GAME_INPUT.has(name)) return originalWrite.call(this, name, data)
        }
        mode = 'player'
        write('entity_destroy', { entityIds: [CAMERA_ENTITY] })
        write('player_remove', { players: [avatarUuid] })
        write('game_state_change', { reason: 'change_game_mode', gameMode: Math.max(0, GAME_MODES.indexOf(bot.game?.gameMode)) })
        write('abilities', snapshot.get('abilities') || { flags: 0, flyingSpeed: 0.05, walkingSpeed: 0.1 })
        positionViewer()
        sendInventory()
      } finally {
        switching = false
        publish()
      }
    } else {
      if (mode === 'player') {
        releasePlayer()
        mode = 'camera'
        write('game_state_change', { reason: 'change_game_mode', gameMode: 3 })
        write('abilities', { flags: 7, flyingSpeed: 0.05, walkingSpeed: 0.1 })
        spawnAvatar()
      }
      if (action === 'camera') positionViewer()
      publish()
    }
  }

  function readPlayer (data, { name, state }) {
    if (state !== 'play') return
    if (name === 'teleport_confirm') {
      if (data.teleportId === pendingPosition) {
        pendingPosition = null
        clearTimeout(positionTimeout)
      }
      return
    }
    if (name === 'chat_message' && ['.take', '.bot', '.camera'].includes(data.message)) {
      const client = viewer
      void switchMode(data.message.slice(1)).catch(error => { if (client === viewer && viewer) text(client, error.message) })
      return
    }
    if (mode !== 'player' || !release || upstream.state !== 'play') return
    if (name === 'chat_message') { bot.chat(data.message); return }
    if (name === 'chat_command' || name === 'chat_command_signed') { bot.chat(`/${data.command}`); return }
    if (!GAME_INPUT.has(name) || (pendingPosition !== null && name !== 'tick_end')) return
    if (['position', 'position_look', 'look', 'flying'].includes(name)) {
      const { entity } = bot
      if (Number.isFinite(data.x) && Number.isFinite(data.y) && Number.isFinite(data.z)) entity.position.set(data.x, data.y, data.z)
      if (Number.isFinite(data.yaw)) entity.yaw = fromNotchianYaw(data.yaw)
      if (Number.isFinite(data.pitch)) entity.pitch = fromNotchianPitch(data.pitch)
      entity.onGround = Boolean(data.flags?.onGround ?? data.onGround)
      entity.isCollidedHorizontally = Boolean(data.flags?.hasHorizontalCollision)
    }
    if (Number.isInteger(data.sequence)) {
      const sequence = getNextSequence(bot)
      predictions.set(sequence, data.sequence)
      if (predictions.size > 256) predictions.delete(predictions.keys().next().value)
      data = { ...data, sequence }
    }
    forwardPlayerInput(name, data)
  }

  function start () {
    Item = dependency('prismarine-item')(bot.registry)
    server = protocol.createServer({
      version: '26.3', host: '127.0.0.1', port: 0, maxPlayers: 1, 'online-mode': true,
      registryCodec: {}, hideErrors: true, motd: 'ScreenLauncher · Bot control',
      beforeLogin (client) {
        const send = client.write.bind(client)
        client.write = (name, data) => {
          if (name === 'success') data = { ...data, sessionId: randomUUID() }
          // Java resolves references to tags when configuration finishes.
          if (name === 'finish_configuration' && client.state === 'configuration') {
            for (const [packetName, packet] of configuration) send(packetName, packet)
          }
          return send(name, data)
        }
      }
    })
    server.on('error', onError)
    server.on('listening', () => {
      if (disposed) { server.close(); return }
      address = `127.0.0.1:${server.socketServer.address().port}`
      publish()
    })
    server.on('login', client => {
      if (disposed || !login || !worldReady || authenticated || uuidKey(client.uuid) !== uuidKey(accountUuid)) {
        client.end('Управление доступно владельцу активной сессии бота.')
        return
      }
      authenticated = client
      client.on('error', onError)
      client.once('end', () => {
        if (authenticated !== client) return
        authenticated = null
        viewer = null
        pendingPosition = null
        clearTimeout(positionTimeout)
        releasePlayer()
        mode = 'bot'
        if (!disposed) publish()
      })
    })
    server.on('playerJoin', client => {
      if (authenticated !== client || !login || !worldReady || !bot.entity) {
        client.end('Мир бота ещё загружается')
        return
      }
      viewer = client
      mode = 'camera'
      client.on('packet', readPlayer)
      try {
        renderWorld()
        text(client, '.take — играть   .bot — вернуть боту   .camera — камера у бота')
        publish()
      } catch (error) { onError(error); client.end('Не удалось открыть состояние мира бота') }
    })
  }

  const onMessage = message => { if (viewer) text(viewer, message.toString()) }
  const onForcedMove = () => {
    worldReady = true
    if (mode === 'player') positionViewer()
  }
  upstream.on('packet', readUpstream)
  bot.on('move', updateAvatar)
  bot.on('forcedMove', onForcedMove)
  bot.on('message', onMessage)
  return {
    start,
    switchMode,
    get busy () { return switching || mode === 'player' },
    close () {
      if (disposed) return
      disposed = true
      clearTimeout(positionTimeout)
      upstream.off('packet', readUpstream)
      bot.off('move', updateAvatar)
      bot.off('forcedMove', onForcedMove)
      bot.off('message', onMessage)
      releasePlayer()
      if (server?.socketServer.listening) server.close()
      address = null
      mode = 'bot'
      publish()
    }
  }
}

module.exports = { createPlayerControl }
