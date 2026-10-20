'use strict'

// RegistrySyncPayload wire decoding adapted from FabricMC Fabric API.
// Copyright (c) 2016-2019 FabricMC. Licensed under Apache-2.0; see LICENSE/NOTICE.
const { Reader, check, identifier, isIdentifier, readNbt, FabricProtocolError } = require('./binary')

// Binary format shared by fabric:registry/sync/direct (Fabric API for 1.17 -
// 1.21.10) and fabric:registry/sync (1.21.11+): namespace groups of registries,
// then namespace groups of entries as runs of consecutive raw IDs with signed
// deltas. Fabric API for 1.21.4+ adds one attribute byte after each registry
// path (bit 0 = optional registry); older releases do not have it.
function decodeBinary (buffer, maxEntries, withAttributes, allowTrailing) {
  const reader = new Reader(buffer)
  const registries = new Map()
  let entryCount = 0
  // Fabric never writes empty groups or runs: every count below is >= 1.
  // This also keeps the two layouts from accepting each other's bytes.
  const registryGroups = reader.count(4096)
  check(registryGroups > 0, 'Empty registry sync')
  for (let i = 0; i < registryGroups; i++) {
    const namespace = reader.string() || 'minecraft'
    const registryCount = reader.count(4096)
    check(registryCount > 0 && registries.size + registryCount <= 4096, 'Empty or excessive registry group')
    for (let j = 0; j < registryCount; j++) {
      const name = identifier(namespace + ':' + reader.string())
      check(!registries.has(name), 'Duplicate registry: ' + name)
      let attributes = 0
      if (withAttributes) {
        attributes = reader.byte()
        check((attributes & ~1) === 0, 'Unsupported registry attribute flags')
      }
      const entries = new Map()
      const byId = new Map()
      let lastId = 0
      const groups = reader.count(maxEntries)
      check(groups > 0, 'Empty registry ' + name)
      for (let k = 0; k < groups; k++) {
        const entryNamespace = reader.string() || 'minecraft'
        const runs = reader.count(maxEntries)
        check(runs > 0, 'Empty namespace group in ' + name)
        for (let l = 0; l < runs; l++) {
          const delta = reader.varint()
          const size = reader.count(maxEntries)
          check(size > 0 && entryCount + size <= maxEntries, 'Registry entry limit exceeded or empty ID run')
          const start = lastId + delta
          check(start >= 0 && start + size - 1 <= 2147483647, 'Registry ID out of range')
          for (let m = 0; m < size; m++) {
            const entryName = identifier(entryNamespace + ':' + reader.string())
            const id = start + m
            check(!entries.has(entryName) && !byId.has(id), 'Duplicate registry name or ID in ' + name)
            entries.set(entryName, id)
            byId.set(id, entryName)
          }
          entryCount += size
          lastId = start + size - 1
        }
      }
      registries.set(name, { optional: Boolean(attributes & 1), entries, byId })
    }
  }
  if (!allowTrailing) reader.end()
  return { registries, entryCount, format: withAttributes ? 'binary+attributes' : 'binary', trailingBytes: reader.remaining }
}

function entryLimit (options) {
  const maxEntries = options.maxEntries ?? 1000000
  check(Number.isSafeInteger(maxEntries) && maxEntries > 0, 'Invalid registry entry limit')
  return maxEntries
}

// options.attributes: true, false or 'auto' (default). In auto mode the
// preferred layout (options.preferAttributes, default true) is tried first;
// a buffer is only accepted when it parses completely with valid identifiers.
// options.allowTrailing accepts bytes after the data: Fabric API for 1.20.5 -
// 1.21.10 sends the whole Netty backing array of the direct payload (zero
// padding, and a full copy in every part), and its own reader ignores them.
function decodeRegistrySync (buffer, options = {}) {
  const maxEntries = entryLimit(options)
  const allowTrailing = Boolean(options.allowTrailing)
  const mode = options.attributes ?? 'auto'
  if (mode !== 'auto') return decodeBinary(buffer, maxEntries, Boolean(mode), allowTrailing)
  const order = options.preferAttributes === false ? [false, true] : [true, false]
  let first
  for (const withAttributes of order) {
    try {
      return decodeBinary(buffer, maxEntries, withAttributes, allowTrailing)
    } catch (error) {
      if (!(error instanceof FabricProtocolError)) throw error
      first ??= error
    }
  }
  throw first
}

// Legacy fabric:registry/sync payload (Fabric API for 1.14 - 1.19.4, PLAY):
// named NBT { version: 1, registries: { registry: { entry: rawId } } }.
function decodeNbtRegistrySync (buffer, options = {}) {
  const maxEntries = entryLimit(options)
  const { value } = readNbt(buffer)
  check(value && typeof value === 'object', 'Registry NBT is empty')
  const version = value.version ?? 1
  check(version === 1, 'Unsupported legacy registry sync version ' + version, 'FABRIC_UNSUPPORTED_VERSION')
  const root = value.registries
  check(root && typeof root === 'object' && !Array.isArray(root), 'Registry NBT has no registries compound')
  const registries = new Map()
  let entryCount = 0
  for (const [rawName, table] of Object.entries(root)) {
    const name = normalizeIdentifier(rawName)
    check(table && typeof table === 'object' && !Array.isArray(table), 'Invalid registry table ' + name)
    check(!registries.has(name) && registries.size < 4096, 'Duplicate or excessive registry ' + name)
    const entries = new Map()
    const byId = new Map()
    for (const [rawEntry, id] of Object.entries(table)) {
      const entryName = normalizeIdentifier(rawEntry)
      check(Number.isInteger(id) && id >= 0, 'Invalid raw ID for ' + entryName)
      check(!entries.has(entryName) && !byId.has(id), 'Duplicate registry name or ID in ' + name)
      check(++entryCount <= maxEntries, 'Registry entry limit exceeded')
      entries.set(entryName, id)
      byId.set(id, entryName)
    }
    registries.set(name, { optional: false, entries, byId })
  }
  return { registries, entryCount, format: 'nbt' }
}

// Identifier.toString() always has a namespace, but be tolerant of "stone".
function normalizeIdentifier (value) {
  const name = value.includes(':') ? value : 'minecraft:' + value
  check(isIdentifier(name), 'Invalid identifier: ' + value)
  return name
}

function registrySnapshot (sync) {
  return {
    format: 'fabric-registry-sync',
    source: sync.format ?? 'binary+attributes',
    entryCount: sync.entryCount,
    registries: Object.fromEntries([...sync.registries].map(([name, table]) => [
      name, { optional: table.optional, entries: Object.fromEntries(table.entries) }
    ]))
  }
}

module.exports = { decodeRegistrySync, decodeNbtRegistrySync, registrySnapshot }
