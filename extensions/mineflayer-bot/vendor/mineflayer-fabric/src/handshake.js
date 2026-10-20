'use strict'

const { EventEmitter } = require('node:events')
const {
  FabricProtocolError, check, Reader, string, identifier, decodeChannels,
  encodeChannels, decodeVersions, encodeVersions, decodeCommonRegister, encodeCommonRegister,
  decodeIdentifierList, encodeIdentifierList
} = require('./binary')
const { decodeRegistrySync, decodeNbtRegistrySync, registrySnapshot } = require('./registry')
const { loadProtocol, protocolVersionOf } = require('./protocol')

const CHANNELS = Object.freeze({
  register: 'minecraft:register',
  unregister: 'minecraft:unregister',
  brand: 'minecraft:brand',
  version: 'c:version',
  commonRegister: 'c:register',
  // Binary payload in CONFIGURATION (Fabric API for 1.21.11+),
  // NBT payload in PLAY (Fabric API for 1.14 - 1.19.4).
  registry: 'fabric:registry/sync',
  // Chunked binary payload terminated by an empty message: PLAY for
  // 1.17 - 1.20.1, CONFIGURATION for 1.20.2 - 1.21.10.
  registryDirect: 'fabric:registry/sync/direct',
  complete: 'fabric:registry/sync/complete',
  split: 'fabric:split',
  // Login query used by Fabric API for 1.14 - 1.20.1 to learn client channels.
  earlyRegistration: 'fabric-networking-api-v1:early_registration'
})
const LEGACY_REGISTER = 'REGISTER'
const LEGACY_UNREGISTER = 'UNREGISTER'
const RESERVED = new Set([...Object.values(CHANNELS), LEGACY_REGISTER, LEGACY_UNREGISTER])
const MAX_SERVER_CHANNELS = 4096
// Fabric API for 1.21.4 introduced the registry attribute byte.
const ATTRIBUTES_PROTOCOL = 769
const attached = new WeakMap()

function isFabricChannel (name) {
  return name.startsWith('fabric:') || name.startsWith('fabric-')
}

class FabricConnection extends EventEmitter {
  constructor (client, options = {}) {
    super()
    check(client && typeof client.prependListener === 'function' && typeof client.write === 'function',
      'fabricHandshake requires a minecraft-protocol client', 'FABRIC_BAD_OPTIONS')
    this.client = client
    this._loadProtocol = loadProtocol
    this._preferMineflayer = false
    this.options = {
      brand: 'mineflayer-fabric',
      timeout: 30000,
      maxPayloadBytes: 16 * 1024 * 1024,
      maxRegistryEntries: 1000000,
      handleConfigurationPing: true,
      earlyRegistration: true,
      announce: 'auto',
      ...options
    }
    check(Number.isSafeInteger(this.options.timeout) && this.options.timeout >= 0,
      'timeout must be a non-negative integer (0 disables it)', 'FABRIC_BAD_OPTIONS')
    for (const key of ['maxPayloadBytes', 'maxRegistryEntries']) {
      check(Number.isSafeInteger(this.options[key]) && this.options[key] > 0,
        key + ' must be a positive integer', 'FABRIC_BAD_OPTIONS')
    }
    check(typeof this.options.brand === 'string' && this.options.brand.length <= 32767,
      'Invalid client brand', 'FABRIC_BAD_OPTIONS')
    check(['auto', 'always'].includes(this.options.announce),
      'announce must be "auto" or "always"', 'FABRIC_BAD_OPTIONS')
    this.handlers = { configuration: new Map(), play: new Map() }
    for (const phase of ['configuration', 'play']) {
      for (const [name, handler] of Object.entries(options.handlers?.[phase] || {})) {
        identifier(name)
        check(!RESERVED.has(name) && typeof handler === 'function',
          'Invalid or reserved payload handler: ' + name, 'FABRIC_BAD_OPTIONS')
        this.handlers[phase].set(name, handler)
      }
    }
    this.detected = false
    this.disposed = false
    this.failed = false
    this.era = null
    this.generation = 0
    this.registry = { registries: new Map(), entryCount: 0 }
    this.serverChannels = { configuration: new Set(), play: new Set() }
    this._listeners = []
    this._reset()
    this._listen('custom_payload', (packet, meta) => {
      try { this._payload(packet, meta) } catch (error) { this._fail(error) }
    }, true)
    this._listen('state', (state) => {
      try { this._state(state) } catch (error) { this._fail(error) }
    }, true)
    this._listen('packet', (packet, metadata) => {
      if (this._split && !this.failed && !this.disposed &&
          (metadata.state !== this._split.phase || metadata.name !== 'custom_payload' || packet.channel !== CHANNELS.split)) {
        this._fail(new FabricProtocolError('FABRIC_INVALID_PACKET', 'A packet interrupted fabric:split'))
      }
    }, true)
    // minecraft-protocol does not answer configuration ping by itself.
    // Mineflayer owns ping in PLAY, so only cover configuration here.
    this._listen('ping', packet => {
      if (this.options.handleConfigurationPing && !this.failed && !this.disposed && client.state === 'configuration') {
        try {
          check(!this._split, 'Ping interrupted a split payload')
          client.write('pong', { id: packet.id })
        } catch (error) { this._fail(error) }
      }
    })
    this._listen('end', () => this.dispose())
    if (this.options.earlyRegistration) this._hookLoginQueries()
    if (client.state === 'configuration') this._state('configuration')
  }

  get protocolVersion () {
    return protocolVersionOf(this.client, this._preferMineflayer)
  }

  _listen (name, listener, prepend = false) {
    this.client[prepend ? 'prependListener' : 'on'](name, listener)
    this._listeners.push([name, listener])
  }

  // minecraft-protocol answers every login query with "not understood". Keep
  // that behaviour for foreign channels and answer only Fabric's query. The
  // wrapper keeps the original function name, so minecraft-protocol-forge can
  // still find and replace it.
  _hookLoginQueries () {
    const client = this.client
    const original = client.listeners('login_plugin_request').find(fn => fn.name === 'onLoginPluginRequest')
    const connection = this
    const wrapper = function onLoginPluginRequest (packet) {
      if (packet?.channel === CHANNELS.earlyRegistration && !connection.failed && !connection.disposed) {
        try { connection._earlyRegistration(packet) } catch (error) { connection._fail(error) }
        return
      }
      if (original) return original.apply(this, arguments)
    }
    if (original) client.removeListener('login_plugin_request', original)
    client.on('login_plugin_request', wrapper)
    this._loginHook = { wrapper, original }
  }

  _unhookLoginQueries () {
    const hook = this._loginHook
    if (!hook) return
    this._loginHook = null
    const listeners = this.client.listeners('login_plugin_request')
    if (!listeners.includes(hook.wrapper)) return // replaced by another plugin
    this.client.removeListener('login_plugin_request', hook.wrapper)
    if (hook.original) this.client.on('login_plugin_request', hook.original)
  }

  _earlyRegistration (packet) {
    const data = packet.data ?? Buffer.alloc(0)
    check(Buffer.isBuffer(data) && data.length <= this.options.maxPayloadBytes, 'Invalid early registration query')
    for (const name of decodeIdentifierList(data)) {
      if (this.serverChannels.play.size < MAX_SERVER_CHANNELS) this.serverChannels.play.add(name)
    }
    this.detected = true
    this.era ??= 'play'
    const channels = this._channels('play')
    this.client.write('login_plugin_response', { messageId: packet.messageId, data: encodeIdentifierList(channels) })
    this.emit('registered', channels, 'login')
    this.emit('channels', { phase: 'play', channels: new Set(this.serverChannels.play) })
  }

  _reset () {
    clearTimeout(this._timer)
    this._timer = null
    this._registered = false
    this._playRegistered = false
    this._split = null
    this._direct = null
    this._syncPending = false
    this.synced = false
    this.commonVersion = null
  }

  _state (state) {
    if (this.failed || this.disposed) return
    if (state === 'configuration') {
      check(!this._split && !this._direct && !this._syncPending, 'Configuration interrupted an unfinished Fabric exchange')
      this.generation++
      this._reset()
      // A proxy may have switched to another backend: detect Fabric anew.
      this.detected = false
      this.era = 'configuration'
      this.registry = { registries: new Map(), entryCount: 0 }
      this.serverChannels = { configuration: new Set(), play: new Set() }
      this.emit('configuration', { generation: this.generation })
    } else if (state === 'play') {
      check(!this._split && !this._direct && !this._syncPending,
        'Server entered PLAY before registry synchronization completed')
      clearTimeout(this._timer)
      this._timer = null
      this.emit('ready', { detected: this.detected, synced: this.synced, era: this.era })
    }
  }

  _channels (phase) {
    const base = phase === 'configuration'
      ? [CHANNELS.registry, CHANNELS.registryDirect, CHANNELS.version, CHANNELS.commonRegister]
      : [CHANNELS.registryDirect, CHANNELS.registry]
    return [...base, ...this.handlers[phase].keys()]
  }

  // Never reveal Fabric channels to a server that did not show Fabric itself:
  // anti-cheat plugins of ordinary servers may kick such clients.
  _shouldAnnounce (phase) {
    if (this.options.announce === 'always' || this.detected) return true
    for (const name of this.handlers[phase].keys()) {
      if (this.serverChannels[phase].has(name)) return true
    }
    return false
  }

  _armTimeout () {
    if (this._timer || !this.options.timeout) return
    this._timer = setTimeout(() => this._fail(new FabricProtocolError('FABRIC_TIMEOUT',
      'Fabric exchange did not complete within ' + this.options.timeout + ' ms' + this._waitingHint()
    )), this.options.timeout)
    this._timer.unref?.()
  }

  _waitingHint () {
    const foreign = [...this.serverChannels.configuration].filter(name =>
      !name.startsWith('minecraft:') && !name.startsWith('c:') && !isFabricChannel(name))
    return foreign.length
      ? '. The server also registered mod channels that may expect a client reply: ' + foreign.slice(0, 8).join(', ')
      : ''
  }

  _register () {
    if (this._registered) return
    this._registered = true
    // Only a detected Fabric server is expected to finish its tasks in time.
    if (this.detected && this.client.state === 'configuration') this._armTimeout()
    this.send(CHANNELS.brand, string(this.options.brand))
    this.send(CHANNELS.register, encodeChannels(this._channels('configuration')))
    this.emit('registered', this._channels('configuration'), 'configuration')
  }

  _payload (packet, metadata) {
    if (this.failed || this.disposed) return
    const phase = metadata?.state || this.client.state
    if (phase !== 'configuration' && phase !== 'play') return
    const channel = packet.channel
    const data = packet.data
    // Prepend listener preserves the raw bytes before pluginChannels parses them.
    check(Buffer.isBuffer(data), 'Fabric plugin must receive raw custom_payload bytes')
    check(data.length <= this.options.maxPayloadBytes, 'Payload exceeds configured size limit')
    if (this._split) check(channel === CHANNELS.split, 'A different payload interrupted fabric:split')
    if (channel === CHANNELS.split) return this._receiveSplit(data, phase)
    if (channel === CHANNELS.register || channel === CHANNELS.unregister ||
        channel === LEGACY_REGISTER || channel === LEGACY_UNREGISTER) {
      return this._registration(channel, data, phase)
    }
    if (channel === CHANNELS.version) {
      if (phase !== 'configuration') return
      check(decodeVersions(data).includes(1), 'No supported common networking version', 'FABRIC_COMMON_VERSION')
      this.commonVersion = 1
      this.send(CHANNELS.version, encodeVersions([1]))
      return
    }
    if (channel === CHANNELS.commonRegister) {
      if (phase !== 'configuration') return
      const registration = decodeCommonRegister(data)
      check(this.commonVersion === 1 && registration.version === 1, 'Common version has not been negotiated')
      const known = this.serverChannels[registration.protocol]
      for (const name of registration.channels) if (known.size < MAX_SERVER_CHANNELS) known.add(name)
      this.send(CHANNELS.commonRegister, encodeCommonRegister({
        version: 1, protocol: registration.protocol, channels: this._channels(registration.protocol)
      }))
      return
    }
    if (channel === CHANNELS.registry) return this._receiveRegistry(data, phase, channel)
    if (channel === CHANNELS.registryDirect) return this._receiveDirect(data, phase)
    const handler = this.handlers[phase].get(channel)
    if (handler) {
      Promise.resolve().then(() => {
        if (!this.failed && !this.disposed) return handler(data, this)
      }).catch(error => this._fail(error))
    } else if (!channel.startsWith('minecraft:') && !channel.startsWith('MC|')) {
      this.emit('unhandledPayload', { channel, data, phase })
    }
  }

  _registration (channel, data, phase) {
    const legacy = channel === LEGACY_REGISTER || channel === LEGACY_UNREGISTER
    const adding = channel === CHANNELS.register || channel === LEGACY_REGISTER
    const { channels, ignored } = decodeChannels(data, { legacy })
    const known = this.serverChannels[phase]
    for (const name of channels) {
      if (!adding) known.delete(name)
      else if (known.size < MAX_SERVER_CHANNELS) known.add(name)
    }
    if (adding && [...channels].some(isFabricChannel)) {
      this.detected = true
      this.era ??= phase
    }
    // Reply synchronously, BEFORE the Fabric 0xFAB71C ping can be answered.
    if (adding && !legacy && this._shouldAnnounce(phase)) {
      if (phase === 'configuration') {
        this._register()
      } else if (!this._playRegistered) {
        this._playRegistered = true
        this.send(CHANNELS.register, encodeChannels(this._channels('play')))
        this.emit('registered', this._channels('play'), 'play')
      }
    }
    this.emit('channels', { phase, channels: new Set(known), ignored })
  }

  _preferAttributes (phase, channel) {
    if (channel === CHANNELS.registry) return true
    if (phase === 'play') return false
    const protocol = this.protocolVersion
    return protocol === undefined || protocol >= ATTRIBUTES_PROTOCOL
  }

  _decodeRegistry (data, phase, channel) {
    if (phase === 'play' && channel === CHANNELS.registry) {
      return decodeNbtRegistrySync(data, { maxEntries: this.options.maxRegistryEntries })
    }
    return decodeRegistrySync(data, {
      maxEntries: this.options.maxRegistryEntries,
      preferAttributes: this._preferAttributes(phase, channel),
      allowTrailing: channel === CHANNELS.registryDirect
    })
  }

  _receiveRegistry (data, phase, channel, decoded = null) {
    let sync = decoded
    try {
      sync ??= this._decodeRegistry(data, phase, channel)
    } catch (error) {
      // PLAY-era servers do not wait for an answer: keep the vanilla data and
      // the connection. During configuration the server waits for an ACK.
      if (phase === 'play' && error instanceof FabricProtocolError) {
        this._settleTimer()
        this.emit('warning', { code: 'FABRIC_REGISTRY_DECODE_FAILED', message: 'Ignored ' + channel + ': ' + error.message })
        return
      }
      throw error
    }
    this._acceptRegistry(sync, phase, channel)
  }

  _receiveDirect (data, phase) {
    if (!this._direct) {
      if (data.length === 0) return // nothing was announced
      this._direct = { phase, parts: [], size: 0 }
      this._armTimeout()
    }
    const direct = this._direct
    check(direct.phase === phase, 'fabric:registry/sync/direct crossed a protocol phase')
    if (data.length) {
      // Fabric API 1.20.5 - 1.21.10 repeats the whole backing array in every
      // part, so the first part may already hold everything. A real prefix
      // cannot decode: the header counts every registry.
      if (direct.parts.length === 1 && !direct.decoded) {
        try {
          direct.decoded = this._decodeRegistry(direct.parts[0], phase, CHANNELS.registryDirect)
        } catch (error) {
          if (!(error instanceof FabricProtocolError)) throw error
        }
      }
      if (direct.decoded) return
      check(direct.size + data.length <= this.options.maxPayloadBytes, 'Registry sync exceeds configured size limit')
      direct.parts.push(data)
      direct.size += data.length
      return
    }
    this._direct = null
    this._receiveRegistry(Buffer.concat(direct.parts, direct.size), phase, CHANNELS.registryDirect, direct.decoded)
  }

  _acceptRegistry (sync, phase, channel) {
    check(!this._syncPending && !this.synced, 'Duplicate registry synchronization')
    check(phase === 'play' || this.client.state === 'configuration', 'Unexpected registry sync')
    this.detected = true
    this.era = phase
    const generation = this.generation
    sync.channel = channel
    sync.phase = phase
    this._syncPending = true
    this._armTimeout()
    // A validator/adapter must finish before ACK. Never send an ACK after failure.
    Promise.resolve().then(() => this.options.onRegistry?.(sync, this)).then(() => {
      if (this.failed || this.disposed || generation !== this.generation) return
      if (phase === 'configuration') {
        check(this.client.state === 'configuration', 'Registry sync completed outside configuration')
      }
      this.registry = sync
      this._syncPending = false
      this.synced = true
      this.emit('registry', sync)
      if (this.failed || this.disposed) return
      // Only the configuration task waits for an acknowledgement.
      if (phase === 'configuration') this.send(CHANNELS.complete, Buffer.alloc(0))
      this._settleTimer()
      this.emit('synced', sync)
    }).catch(error => this._fail(error))
  }

  // CONFIGURATION keeps one deadline until PLAY. In PLAY the deadline only
  // covers an unfinished split, chunked registry or pending adapter.
  _settleTimer () {
    if (this.client.state === 'configuration' || this._split || this._direct || this._syncPending) return
    clearTimeout(this._timer)
    this._timer = null
  }

  _receiveSplit (data, phase) {
    if (!this._split) {
      const reader = new Reader(data)
      const size = reader.count(this.options.maxPayloadBytes)
      check(size > 0, 'Empty split packet')
      this._split = { size, received: 0, parts: [], phase }
      data = data.subarray(reader.offset)
      this._armTimeout()
    }
    const split = this._split
    check(split.phase === phase && data.length > 0, 'Invalid split continuation')
    check(split.received + data.length <= split.size, 'Split payload exceeds declared size')
    split.parts.push(data)
    split.received += data.length
    if (split.received !== split.size) return
    this._split = null
    this._settleTimer()
    const reader = new Reader(Buffer.concat(split.parts, split.size))
    // Wrapped bytes include the ORIGINAL Minecraft packet ID and channel string.
    const packetId = reader.varint()
    const expectedId = customPayloadPacketId(this.client, phase, this._loadProtocol())
    check(packetId === expectedId, 'Split packet is not a custom_payload')
    const channel = identifier(reader.string())
    check(channel !== CHANNELS.split, 'Nested fabric:split payload')
    this._payload({ channel, data: reader.buffer.subarray(reader.offset) }, { state: phase })
  }

  send (channel, data) {
    check(!this.disposed && !this.failed, 'Fabric connection is closed', 'FABRIC_CLOSED')
    identifier(channel)
    check(Buffer.isBuffer(data), 'Payload must be a Buffer')
    check(['configuration', 'play'].includes(this.client.state), 'Cannot send payload in this protocol state')
    check(data.length <= 32767, 'Outgoing custom payload exceeds vanilla client limit')
    this.client.write('custom_payload', { channel, data })
  }

  snapshot () { return registrySnapshot(this.registry) }

  _fail (cause) {
    if (this.failed || this.disposed) return
    const error = cause instanceof FabricProtocolError ? cause
      : new FabricProtocolError('FABRIC_HANDLER_ERROR', cause?.message || String(cause), { cause })
    this.failed = true
    clearTimeout(this._timer)
    this._timer = null
    this._split = null
    this._direct = null
    this._syncPending = false
    // Custom event avoids EventEmitter's special unhandled 'error' semantics.
    this.emit('failure', error)
    this.client.end(error.code + ': ' + error.message)
    this.client.emit('error', error)
  }

  dispose () {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this._timer)
    this._timer = null
    this._split = null
    this._direct = null
    this.generation++
    for (const [name, listener] of this._listeners) this.client.removeListener(name, listener)
    this._listeners = []
    this._unhookLoginQueries()
    attached.delete(this.client)
    this.emit('disposed')
  }
}

function customPayloadPacketId (client, phase, protocol) {
  // Resolve from the client's selected protocol, never hardcode a packet ID.
  const serializer = protocol.createSerializer({ state: phase, isServer: true, version: client.version, customPackets: client.customPackets })
  const bytes = serializer.createPacketBuffer({ name: 'custom_payload', params: { channel: CHANNELS.registry, data: Buffer.alloc(0) } })
  const id = new Reader(bytes).varint()
  serializer.destroy()
  return id
}

function fabricHandshake (client, options) {
  if (attached.has(client)) return attached.get(client)
  const connection = new FabricConnection(client, options)
  attached.set(client, connection)
  return connection
}

module.exports = { fabricHandshake, FabricConnection, CHANNELS }
