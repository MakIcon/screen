'use strict'

const utf8 = new TextDecoder('utf-8', { fatal: true })
const lenientUtf8 = new TextDecoder('utf-8')

class FabricProtocolError extends Error {
  constructor (code, message, options) {
    super(message, options)
    this.name = 'FabricProtocolError'
    this.code = code
  }
}

function check (condition, message, code = 'FABRIC_INVALID_PACKET') {
  if (!condition) throw new FabricProtocolError(code, message)
}

class Reader {
  constructor (buffer) {
    check(Buffer.isBuffer(buffer), 'Expected a Buffer')
    this.buffer = buffer
    this.offset = 0
  }

  get remaining () { return this.buffer.length - this.offset }

  byte () {
    check(this.offset < this.buffer.length, 'Truncated packet')
    return this.buffer[this.offset++]
  }

  bytes (length) {
    check(Number.isSafeInteger(length) && length >= 0 && length <= this.remaining, 'Truncated packet')
    const value = this.buffer.subarray(this.offset, this.offset + length)
    this.offset += length
    return value
  }

  short () { return this.bytes(2).readInt16BE(0) }
  ushort () { return this.bytes(2).readUInt16BE(0) }
  int () { return this.bytes(4).readInt32BE(0) }

  varint () {
    let value = 0
    for (let i = 0; i < 5; i++) {
      const byte = this.byte()
      check(i !== 4 || (byte & 0xf0) === 0, 'VarInt exceeds 32 bits')
      value |= (byte & 0x7f) << (i * 7)
      if (!(byte & 0x80)) return value
    }
    throw new FabricProtocolError('FABRIC_INVALID_PACKET', 'VarInt exceeds five bytes')
  }

  count (max = 1000000) {
    const value = this.varint()
    check(value >= 0 && value <= max, 'Invalid or excessive collection length')
    return value
  }

  string (max = 32767) {
    const length = this.count(max * 3)
    check(this.offset + length <= this.buffer.length, 'Truncated UTF-8 string')
    const value = utf8.decode(this.buffer.subarray(this.offset, this.offset + length))
    this.offset += length
    check(value.length <= max, 'String exceeds character limit')
    return value
  }

  end () {
    check(this.offset === this.buffer.length, 'Unexpected trailing bytes')
  }
}

function varint (value) {
  check(Number.isInteger(value) && value >= -2147483648 && value <= 2147483647, 'Invalid VarInt')
  let n = value >>> 0
  const bytes = []
  do {
    let byte = n & 0x7f
    n >>>= 7
    if (n) byte |= 0x80
    bytes.push(byte)
  } while (n)
  return Buffer.from(bytes)
}

function string (value) {
  check(typeof value === 'string' && value.length <= 32767, 'Invalid string')
  const bytes = Buffer.from(value, 'utf8')
  return Buffer.concat([varint(bytes.length), bytes])
}

const IDENTIFIER = /^[a-z0-9_.-]+:[a-z0-9/._-]+$/

function isIdentifier (value) {
  return typeof value === 'string' && value.length <= 32767 && IDENTIFIER.test(value)
}

function identifier (value) {
  check(isIdentifier(value), 'Invalid identifier: ' + value)
  return value
}

// minecraft:register is a NUL separated list. Proxies and plugins often put
// legacy or malformed names there; one bad name must not break the login.
function decodeChannels (buffer, { limit = 4096, legacy = false } = {}) {
  const channels = new Set()
  let ignored = 0
  for (const name of lenientUtf8.decode(buffer).split('\0')) {
    if (!name) continue
    const valid = legacy ? name.length <= 256 && !/[\x00-\x1f]/.test(name) : isIdentifier(name)
    if (valid && channels.size < limit) channels.add(name)
    else ignored++
  }
  return { channels, ignored }
}

function encodeChannels (values) {
  const channels = [...new Set(values)].map(identifier)
  check(channels.length <= 1024, 'Too many plugin channels')
  const bytes = Buffer.from(channels.join('\0'), 'utf8')
  check(bytes.length <= 32767, 'Registration packet too large')
  return bytes
}

function decodeVersions (buffer) {
  const reader = new Reader(buffer)
  const values = Array.from({ length: reader.count(64) }, () => reader.varint())
  reader.end()
  return values
}

function encodeVersions (values) {
  return Buffer.concat([varint(values.length), ...values.map(varint)])
}

function decodeCommonRegister (buffer) {
  const reader = new Reader(buffer)
  const version = reader.varint()
  const protocol = reader.string(32)
  check(protocol === 'configuration' || protocol === 'play', 'Unsupported common register phase')
  const channels = new Set()
  const count = reader.count(4096)
  for (let i = 0; i < count; i++) {
    const name = reader.string()
    if (isIdentifier(name)) channels.add(name)
  }
  reader.end()
  return { version, protocol, channels }
}

function encodeCommonRegister ({ version = 1, protocol, channels }) {
  check(protocol === 'configuration' || protocol === 'play', 'Unsupported common register phase')
  const ids = [...new Set(channels)].map(identifier)
  check(ids.length <= 1024, 'Too many plugin channels')
  return Buffer.concat([varint(version), string(protocol), varint(ids.length), ...ids.map(string)])
}

// Fabric early registration (login query, Fabric API for 1.14 - 1.20.1):
// VarInt count followed by identifier strings.
function decodeIdentifierList (buffer) {
  const reader = new Reader(buffer)
  const values = new Set()
  const count = reader.count(65536)
  for (let i = 0; i < count; i++) {
    const name = reader.string()
    if (isIdentifier(name)) values.add(name)
  }
  reader.end()
  return values
}

function encodeIdentifierList (values) {
  const ids = [...new Set(values)].map(identifier)
  return Buffer.concat([varint(ids.length), ...ids.map(string)])
}

// Minimal big-endian NBT reader for the legacy fabric:registry/sync payload.
// Compounds become null-prototype objects, longs become BigInt.
function readNbt (buffer, { named = true, maxDepth = 64 } = {}) {
  const reader = new Reader(buffer)
  const type = reader.byte()
  if (type === 0) return { value: null, size: reader.offset }
  check(type === 10, 'NBT root is not a compound')
  if (named) reader.bytes(reader.ushort())
  const value = nbtPayload(reader, 10, 0, maxDepth)
  return { value, size: reader.offset }
}

function nbtPayload (reader, type, depth, maxDepth) {
  check(depth <= maxDepth, 'NBT nesting too deep')
  switch (type) {
    case 1: return reader.bytes(1).readInt8(0)
    case 2: return reader.short()
    case 3: return reader.int()
    case 4: return reader.bytes(8).readBigInt64BE(0)
    case 5: return reader.bytes(4).readFloatBE(0)
    case 6: return reader.bytes(8).readDoubleBE(0)
    case 7: return Buffer.from(reader.bytes(nbtLength(reader, 1)))
    case 8: return lenientUtf8.decode(reader.bytes(reader.ushort()))
    case 9: {
      const itemType = reader.byte()
      const length = nbtLength(reader, itemType === 0 ? 0 : 1)
      check(itemType !== 0 || length === 0, 'NBT list of TAG_End is not empty')
      return Array.from({ length }, () => nbtPayload(reader, itemType, depth + 1, maxDepth))
    }
    case 10: {
      const compound = Object.create(null)
      for (;;) {
        const childType = reader.byte()
        if (childType === 0) return compound
        const name = lenientUtf8.decode(reader.bytes(reader.ushort()))
        compound[name] = nbtPayload(reader, childType, depth + 1, maxDepth)
      }
    }
    case 11: return Array.from({ length: nbtLength(reader, 4) }, () => reader.int())
    case 12: return Array.from({ length: nbtLength(reader, 8) }, () => reader.bytes(8).readBigInt64BE(0))
    default: throw new FabricProtocolError('FABRIC_INVALID_PACKET', 'Unknown NBT tag type ' + type)
  }
}

function nbtLength (reader, minBytes) {
  const length = reader.int()
  check(length >= 0 && length * minBytes <= reader.remaining, 'Invalid NBT array length')
  return length
}

module.exports = {
  FabricProtocolError, check, Reader, varint, string, isIdentifier, identifier,
  decodeChannels, encodeChannels, decodeVersions, encodeVersions,
  decodeCommonRegister, encodeCommonRegister, decodeIdentifierList, encodeIdentifierList, readNbt
}
