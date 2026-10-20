'use strict'

// Wire fixtures written field by field from Fabric RegistrySyncPayload.java /
// DirectRegistryPacketHandler.java / RegistryMapSerializer.java. They are not
// produced by the library decoders and are not captured server dumps.
const { varint, string } = require('../src/binary')

function registryFixture () {
  return Buffer.concat([
    varint(1), string(''), varint(1), string('menu'), Buffer.from([0]),
    varint(2),
    string(''), varint(1), varint(0), varint(2), string('generic_9x1'), string('generic_9x2'),
    string('creativecore'), varint(1), varint(35 - 1), varint(1), string('container')
  ])
}
function groupedFixture () {
  return Buffer.concat([
    varint(1), string('example'), varint(1), string('metadata'), Buffer.from([1]),
    varint(2),
    string('example'), varint(2),
    varint(10), varint(2), string('one'), string('two'),
    varint(20 - 11), varint(1), string('three'),
    string(''), varint(1), varint(2 - 20), varint(1), string('backwards')
  ])
}

const split = (id) => [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]
const optimize = (namespace) => namespace === 'minecraft' ? '' : namespace

// Port of Fabric's writer. map: Map<registry, Map<entry, rawId>>,
// optional: Set of optional registries, attributes: write the attribute byte.
function encodeRegistryMap (map, { attributes = true, optional = new Set() } = {}) {
  const groups = new Map()
  for (const registry of map.keys()) {
    const [namespace] = split(registry)
    if (!groups.has(namespace)) groups.set(namespace, [])
    groups.get(namespace).push(registry)
  }
  const parts = [varint(groups.size)]
  for (const [namespace, registries] of groups) {
    parts.push(string(optimize(namespace)), varint(registries.length))
    for (const registry of registries) {
      parts.push(string(split(registry)[1]))
      if (attributes) parts.push(Buffer.from([optional.has(registry) ? 1 : 0]))
      const byNamespace = new Map()
      for (const [entry, id] of map.get(registry)) {
        const [entryNamespace, path] = split(entry)
        if (!byNamespace.has(entryNamespace)) byNamespace.set(entryNamespace, [])
        byNamespace.get(entryNamespace).push([path, id])
      }
      parts.push(varint(byNamespace.size))
      let lastBulkLastRawId = 0
      for (const [entryNamespace, pairs] of byNamespace) {
        pairs.sort((a, b) => a[1] - b[1])
        const bulks = []
        for (const pair of pairs) {
          const bulk = bulks.at(-1)
          if (bulk && bulk.at(-1)[1] + 1 === pair[1]) bulk.push(pair)
          else bulks.push([pair])
        }
        parts.push(string(optimize(entryNamespace)), varint(bulks.length))
        for (const bulk of bulks) {
          parts.push(varint(bulk[0][1] - lastBulkLastRawId), varint(bulk.length))
          for (const [path, id] of bulk) {
            parts.push(string(path))
            lastBulkLastRawId = id
          }
        }
      }
    }
  }
  return Buffer.concat(parts)
}

// Named NBT root: { version: 1, registries: { registry: { entry: int } } }.
function encodeNbtRegistryMap (map) {
  const name = (value) => {
    const bytes = Buffer.from(value, 'utf8')
    const length = Buffer.alloc(2)
    length.writeUInt16BE(bytes.length)
    return Buffer.concat([length, bytes])
  }
  const int = (value) => {
    const bytes = Buffer.alloc(4)
    bytes.writeInt32BE(value)
    return bytes
  }
  const registries = []
  for (const [registry, entries] of map) {
    const children = []
    for (const [entry, id] of entries) children.push(Buffer.from([3]), name(entry), int(id))
    registries.push(Buffer.from([10]), name(registry), ...children, Buffer.from([0]))
  }
  return Buffer.concat([
    Buffer.from([10]), name(''),
    Buffer.from([3]), name('version'), int(1),
    Buffer.from([10]), name('registries'), ...registries, Buffer.from([0]),
    Buffer.from([0])
  ])
}

function chunk (buffer, size) {
  const parts = []
  for (let offset = 0; offset < buffer.length; offset += size) parts.push(buffer.subarray(offset, offset + size))
  return parts
}

// Vanilla data from minecraft-data plus content of a fictional "testmod".
function moddedRegistries (version, { remap = false } = {}) {
  const data = require('minecraft-data')(version)
  const map = new Map()
  const table = (name, entries) => map.set(name, new Map(entries))
  const vanilla = (array) => array.map(entry => ['minecraft:' + entry.name, entry.id])
  const after = (array) => Math.max(...array.map(entry => entry.id)) + 1
  const blocks = vanilla(data.blocksArray)
  table('minecraft:block', [...blocks, ['testmod:machine', after(data.blocksArray)], ['testmod:pipe', after(data.blocksArray) + 1]])
  const items = vanilla(data.itemsArray)
  // minecraft-data before 1.17 omits the air item, raw ID 0 on a real server.
  if (!data.itemsByName.air) items.unshift(['minecraft:air', 0])
  if (remap) {
    // Swap two vanilla item IDs, as an upgraded modded world may do.
    const a = items.findIndex(([name]) => name === 'minecraft:stone')
    const b = items.findIndex(([name]) => name === 'minecraft:granite')
    ;[items[a][1], items[b][1]] = [items[b][1], items[a][1]]
  }
  table('minecraft:item', [...items, ['testmod:gadget', after(data.itemsArray)], ['testmod:wrench', after(data.itemsArray) + 1]])
  table('minecraft:entity_type', [...vanilla(data.entitiesArray), ['testmod:robot', after(data.entitiesArray)]])
  // Some minecraft-data versions store sound IDs shifted by one (protocol IDs).
  const soundBase = Math.min(...data.soundsArray.map(sound => sound.id))
  table('minecraft:sound_event', [...data.soundsArray.map(sound => ['minecraft:' + sound.name, sound.id - soundBase]), ['testmod:beep', data.soundsArray.length]])
  const windows = require('prismarine-windows')(version).windows
  const menus = Object.entries(windows).filter(([, value]) => value && value.type >= 0).map(([name, value]) => [name, value.type])
  table('minecraft:menu', [...menus, ['testmod:crate', Math.max(...menus.map(([, id]) => id)) + 1]])
  return map
}

module.exports = { registryFixture, groupedFixture, encodeRegistryMap, encodeNbtRegistryMap, chunk, moddedRegistries }
