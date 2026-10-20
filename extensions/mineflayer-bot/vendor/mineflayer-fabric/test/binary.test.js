'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { Reader, varint, string, decodeCommonRegister, encodeCommonRegister } = require('../src/binary')
const { decodeRegistrySync, registrySnapshot } = require('..')
const { registryFixture, groupedFixture } = require('./fixtures')

test('Minecraft signed VarInts match known wire bytes', () => {
  for (const [n, hex] of [[0, '00'], [127, '7f'], [128, '8001'], [2147483647, 'ffffffff07'], [-1, 'ffffffff0f'], [-18, 'eeffffff0f']]) {
    assert.equal(varint(n).toString('hex'), hex)
    assert.equal(new Reader(Buffer.from(hex, 'hex')).varint(), n)
  }
  assert.throws(() => new Reader(Buffer.from('808080808000', 'hex')).varint())
  assert.throws(() => new Reader(Buffer.from('ffffffff1f', 'hex')).varint())
  assert.throws(() => new Reader(Buffer.from('80', 'hex')).varint())
})

test('registry decodes CreativeCore menu and vanilla namespace abbreviation', () => {
  const sync = decodeRegistrySync(registryFixture())
  assert.equal(sync.entryCount, 3)
  const menu = sync.registries.get('minecraft:menu')
  assert.equal(menu.entries.get('creativecore:container'), 35)
  assert.equal(menu.byId.get(1), 'minecraft:generic_9x2')
  assert.equal(menu.optional, false)
  assert.equal(registrySnapshot(sync).registries['minecraft:menu'].entries['creativecore:container'], 35)
})

test('optional attribute, multiple runs, negative namespace delta', () => {
  const table = decodeRegistrySync(groupedFixture()).registries.get('example:metadata')
  assert.equal(table.optional, true)
  assert.deepEqual([...table.entries.values()], [10, 11, 20, 2])
  assert.equal(table.byId.get(2), 'minecraft:backwards')
})

test('every truncated registry prefix is rejected; limits and trailing bytes are enforced', () => {
  const bytes = registryFixture()
  for (let i = 0; i < bytes.length; i++) assert.throws(() => decodeRegistrySync(bytes.subarray(0, i)))
  assert.throws(() => decodeRegistrySync(bytes, { maxEntries: 2 }))
  assert.throws(() => decodeRegistrySync(Buffer.concat([bytes, Buffer.from([0])])))
  assert.throws(() => decodeRegistrySync(Buffer.from('ffffffff0f', 'hex')))
})

test('strict UTF-8 and common packet framing', () => {
  assert.throws(() => new Reader(Buffer.from('02c328', 'hex')).string())
  const bytes = Buffer.concat([Buffer.from([1]), string('play'), Buffer.from([1]), string('test:channel')])
  const parsed = decodeCommonRegister(bytes)
  assert.equal(parsed.version, 1)
  assert.deepEqual([...parsed.channels], ['test:channel'])
  assert.deepEqual(encodeCommonRegister(parsed), bytes)
})

test('both binary layouts decode from the Fabric writer; auto mode picks the valid one', () => {
  const { decodeRegistrySync: decode } = require('..')
  const { encodeRegistryMap, moddedRegistries } = require('./fixtures')
  for (const version of ['1.17.1', '1.20.4', '1.21.4', '26.1']) {
    const map = moddedRegistries(version)
    for (const attributes of [false, true]) {
      const bytes = encodeRegistryMap(map, { attributes, optional: new Set(['minecraft:menu']) })
      for (const preferAttributes of [false, true]) {
        const sync = decode(bytes, { preferAttributes })
        assert.equal(sync.format, attributes ? 'binary+attributes' : 'binary')
        assert.equal(sync.registries.get('minecraft:menu').optional, attributes)
        for (const [name, entries] of map) assert.deepEqual(sync.registries.get(name).entries, entries, version + ' ' + name)
      }
      assert.throws(() => decode(bytes, { attributes: !attributes }))
    }
  }
})

test('legacy NBT registry sync of Fabric API 1.14 - 1.19.4', () => {
  const { decodeNbtRegistrySync } = require('..')
  const { encodeNbtRegistryMap, moddedRegistries } = require('./fixtures')
  const map = moddedRegistries('1.16.5')
  const sync = decodeNbtRegistrySync(encodeNbtRegistryMap(map))
  assert.equal(sync.format, 'nbt')
  assert.equal(sync.registries.get('minecraft:item').entries.get('testmod:gadget'), map.get('minecraft:item').get('testmod:gadget'))
  assert.equal(sync.entryCount, [...map.values()].reduce((sum, table) => sum + table.size, 0))
  const bytes = encodeNbtRegistryMap(map)
  for (const end of [1, 5, 40, bytes.length - 1]) assert.throws(() => decodeNbtRegistrySync(bytes.subarray(0, end)))
  assert.throws(() => decodeNbtRegistrySync(encodeNbtRegistryMap(new Map([['minecraft:item', new Map([['bad name', 1]])]]))))
})

test('channel lists tolerate proxies and legacy plugins; identifier lists round-trip', () => {
  const { decodeChannels, encodeIdentifierList, decodeIdentifierList, readNbt } = require('../src/binary')
  const parsed = decodeChannels(Buffer.from('bungeecord:main\0Bad Name\0\0velocity:player_info\0WDL|INIT', 'utf8'))
  assert.deepEqual([...parsed.channels], ['bungeecord:main', 'velocity:player_info'])
  assert.equal(parsed.ignored, 2)
  assert.deepEqual([...decodeChannels(Buffer.from('MC|Brand\0BungeeCord'), { legacy: true }).channels], ['MC|Brand', 'BungeeCord'])
  assert.equal(decodeChannels(Buffer.from(Array.from({ length: 5000 }, (_, i) => 'a:' + i).join('\0')), { limit: 10 }).channels.size, 10)
  const list = encodeIdentifierList(['fabric:registry/sync/direct', 'test:one'])
  assert.deepEqual([...decodeIdentifierList(list)], ['fabric:registry/sync/direct', 'test:one'])
  assert.throws(() => readNbt(Buffer.from([10, 0, 0, 99])))
  assert.equal(readNbt(Buffer.from([0])).value, null)
})
