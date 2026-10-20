'use strict'

// Mineflayer data adaptation for Fabric registry sync.
//
// prismarine-registry copies minecraft-data shallowly: nested tables are
// shared by every bot of the same version in the process. Never mutate them;
// install per-bot replacements and keep the originals for restoration.
//
// Registry sync only carries names and numeric IDs. Mod content gets explicit
// placeholders (marked `modded: true`), never invented gameplay data.

const FULL_CUBE = [[0, 0, 0, 1, 1, 1]]

const SIMPLE_TABLES = [
  { registry: 'minecraft:item', key: 'items', byName: 'itemsByName', array: 'itemsArray', make: (base) => ({ ...base, stackSize: 64 }) },
  {
    registry: 'minecraft:entity_type',
    key: 'entities',
    byName: 'entitiesByName',
    array: 'entitiesArray',
    make: (base) => ({ ...base, internalId: base.id, type: 'other', category: 'Modded', width: 1, height: 1, metadataKeys: [] })
  },
  { registry: 'minecraft:mob_effect', key: 'effects', byName: 'effectsByName', array: 'effectsArray', make: (base) => ({ ...base, type: 'neutral' }), loose: true },
  { registry: 'minecraft:enchantment', key: 'enchantments', byName: 'enchantmentsByName', array: 'enchantmentsArray', make: (base) => ({ ...base, maxLevel: 1, exclude: [] }) },
  { registry: 'minecraft:sound_event', key: 'sounds', byName: 'soundsByName', array: 'soundsArray', make: (base) => base },
  { registry: 'minecraft:particle_type', key: 'particles', byName: 'particlesByName', array: 'particlesArray', make: (base) => base }
]

function titleCase (identifier) {
  const path = identifier.slice(identifier.indexOf(':') + 1)
  return path.split(/[/_.]/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ')
}

// minecraft-data does not always use raw registry IDs: some versions store
// protocol IDs (for example sound IDs shifted by one). Keep its convention by
// using the offset shared by the matching vanilla entries.
function idOffset (table, resolve) {
  const counts = new Map()
  for (const [name, id] of table.entries) {
    const local = resolve(name)
    if (local) counts.set(local.id - id, (counts.get(local.id - id) ?? 0) + 1)
  }
  let offset = 0
  for (const [value, count] of counts) {
    if (count > (counts.get(offset) ?? 0)) offset = value
  }
  return offset
}

function looseKey (name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// minecraft-data uses unprefixed vanilla names; effects use display-style keys.
function resolver (byName, spec) {
  let loose
  return (identifier) => {
    const namespace = identifier.slice(0, identifier.indexOf(':'))
    const path = identifier.slice(namespace.length + 1)
    const direct = byName[identifier] ?? (namespace === 'minecraft' ? byName[path] : undefined)
    if (direct || namespace !== 'minecraft' || !spec.loose) return direct
    if (!loose) {
      loose = new Map()
      for (const entry of Object.values(byName)) loose.set(looseKey(entry.name), entry)
    }
    const key = looseKey(path)
    return loose.get(key) ?? (key === 'unluck' ? loose.get('badluck') : undefined)
  }
}

class MineflayerAdapter {
  constructor (bot, options = {}) {
    this.bot = bot
    this.modData = options.modData ?? {}
    this.unknownBlock = options.unknownBlock ?? {}
    this.baseline = null
    this.menus = null
    this.report = null
  }

  get registry () { return this.bot.registry }

  _save (keys) {
    this.baseline ??= new Map()
    for (const key of keys) {
      if (!this.baseline.has(key)) this.baseline.set(key, this.registry[key])
    }
  }

  _install (key, value) {
    this._save([key])
    this.registry[key] = value
  }

  restore () {
    if (this.baseline && this.registry) {
      for (const [key, value] of this.baseline) this.registry[key] = value
    }
    this.baseline = null
    this.menus = null
    this.report = null
  }

  apply (sync) {
    this.restore()
    const report = { added: {}, remapped: {}, missing: {}, unresolvedBlocks: [], unknownStateFrom: null, namespaces: new Set() }
    if (!this.registry) return report
    for (const table of sync.registries.values()) {
      for (const name of table.entries.keys()) {
        const namespace = name.slice(0, name.indexOf(':'))
        if (namespace !== 'minecraft' && namespace !== 'brigadier') report.namespaces.add(namespace)
      }
    }
    for (const spec of SIMPLE_TABLES) {
      const table = sync.registries.get(spec.registry)
      if (table && this.registry[spec.key] && this.registry[spec.byName]) this._simple(spec, table, report)
    }
    const blocks = sync.registries.get('minecraft:block')
    if (blocks && this.registry.blocksByStateId && this.registry.supportFeature?.('blockStateId')) {
      this._blocks(blocks, report)
    }
    const menus = sync.registries.get('minecraft:menu')
    if (menus) this.menus = new Map([...menus.entries].map(([name, id]) => [id, name]))
    this.report = report
    return report
  }

  _overrides (kind, name) {
    return this.modData[kind]?.[name] ?? {}
  }

  _simple (spec, table, report) {
    const kind = spec.key
    const byName = this.registry[spec.byName]
    const resolve = resolver(byName, spec)
    const offset = idOffset(table, resolve)
    const resolved = []
    let changed = false
    for (const [name, rawId] of table.entries) {
      const id = rawId + offset
      const local = resolve(name)
      if (local && local.id === id) {
        resolved.push(local)
        continue
      }
      changed = true
      if (local) {
        resolved.push({ ...local, id })
        report.remapped[kind] = (report.remapped[kind] ?? 0) + 1
      } else if (name.startsWith('minecraft:')) {
        // Vanilla entry absent from minecraft-data (for example the air item).
        const path = name.slice(10)
        resolved.push(spec.make({ id, name: path, displayName: titleCase(name) }))
        report.missing[kind] = (report.missing[kind] ?? 0) + 1
      } else {
        const base = { id, name, displayName: titleCase(name), modded: true }
        resolved.push({ ...spec.make(base), ...this._overrides(kind, name) })
        report.added[kind] = (report.added[kind] ?? 0) + 1
      }
    }
    if (!changed) return
    const byId = {}
    const names = {}
    for (const entry of resolved) {
      byId[entry.id] = entry
      names[entry.name] = entry
    }
    this._install(spec.key, byId)
    this._install(spec.byName, names)
    if (this.registry[spec.array]) this._install(spec.array, resolved.slice().sort((a, b) => a.id - b.id))
  }

  _blockCount (local, name) {
    if (local) return local.maxStateId - local.minStateId + 1
    const data = this._overrides('blocks', name)
    if (Number.isSafeInteger(data.stateCount) && data.stateCount > 0) return data.stateCount
    if (Array.isArray(data.states) && data.states.length) {
      return data.states.reduce((count, state) => count * (state.num_values ?? state.values?.length ?? 1), 1)
    }
    return undefined
  }

  // Block states are numbered in raw block ID order. Known vanilla blocks and
  // blocks described in modData.blocks get exact ranges; after the first block
  // with an unknown state count every further state ID is unknown.
  _blocks (table, report) {
    const resolve = resolver(this.registry.blocksByName, {})
    const order = [...table.entries].sort((a, b) => a[1] - b[1])
    const blocks = {}
    const byName = {}
    const byState = {}
    let offset = 0
    let unknownFrom = null
    let changed = false
    let unresolved = 0
    for (const [name, id] of order) {
      const local = resolve(name)
      const count = this._blockCount(local, name)
      let block
      if (unknownFrom === null && count !== undefined) {
        const states = { minStateId: offset, maxStateId: offset + count - 1 }
        if (local) {
          block = local.id === id && local.minStateId === offset
            ? local
            : { ...local, id, ...states, defaultState: offset + (local.defaultState - local.minStateId) }
        } else {
          block = this._moddedBlock(name, id, states, count)
        }
        for (let state = offset; state < offset + count; state++) byState[state] = block
        offset += count
      } else {
        unknownFrom ??= offset
        unresolved++
        // Keep the name and ID; the state range is not known.
        block = local
          ? { ...local, id, minStateId: unknownFrom, maxStateId: unknownFrom, defaultState: unknownFrom, unresolvedStates: true }
          : this._moddedBlock(name, id, { minStateId: unknownFrom, maxStateId: unknownFrom }, 1, true)
        report.unresolvedBlocks.push(name)
      }
      if (block !== local) changed = true
      blocks[id] = block
      byName[block.name] = block
    }
    if (!changed && unknownFrom === null) return
    let lookup = byState
    if (unknownFrom !== null) {
      report.unknownStateFrom = unknownFrom
      const unknown = {
        id: order.length ? order[order.length - 1][1] + 1 : 0,
        name: 'fabric:unknown_block',
        displayName: 'Unknown modded block',
        hardness: 1,
        resistance: 1,
        stackSize: 64,
        diggable: true,
        material: 'default',
        transparent: false,
        emitLight: 0,
        filterLight: 15,
        // Lower bound: every unresolved block has at least one state.
        minStateId: unknownFrom,
        maxStateId: unknownFrom + unresolved - 1,
        defaultState: unknownFrom,
        states: [],
        drops: [],
        boundingBox: 'block',
        shapes: FULL_CUBE,
        modded: true,
        ...this.unknownBlock
      }
      if (unknown.boundingBox === 'empty' && !this.unknownBlock.shapes) unknown.shapes = []
      blocks[unknown.id] = unknown
      byName[unknown.name] = unknown
      lookup = new Proxy(byState, {
        get (target, key) {
          const value = target[key]
          if (value !== undefined || typeof key !== 'string') return value
          const state = Number(key)
          return Number.isInteger(state) && state >= unknownFrom ? unknown : undefined
        }
      })
    }
    report.added.blocks = order.filter(([name]) => !resolve(name)).length
    this._install('blocks', blocks)
    this._install('blocksByName', byName)
    this._install('blocksArray', Object.values(blocks).sort((a, b) => a.id - b.id))
    this._install('blocksByStateId', lookup)
    this._collisionShapes(blocks)
  }

  _collisionShapes (blocks) {
    const original = this.registry.blockCollisionShapes
    if (!original) return
    // prismarine-block rebuilds block.shapes from this table whenever a plugin
    // loads its factory. Without these entries it erases our placeholder shapes.
    const names = { ...original.blocks }
    const shapes = { ...original.shapes }
    let next = Object.keys(shapes).reduce((max, key) => Math.max(max, Number(key) || 0), 0) + 1
    for (const block of Object.values(blocks)) {
      if (!block.modded) continue
      names[block.name] = next
      shapes[next++] = block.shapes
    }
    this._install('blockCollisionShapes', { ...original, blocks: names, shapes })
  }

  _moddedBlock (name, id, states, count, unresolved = false) {
    const data = this._overrides('blocks', name)
    const block = {
      id,
      name,
      displayName: titleCase(name),
      hardness: 1,
      resistance: 1,
      stackSize: 64,
      diggable: true,
      material: 'default',
      transparent: false,
      emitLight: 0,
      filterLight: 15,
      defaultState: states.minStateId,
      states: [],
      drops: [],
      boundingBox: 'block',
      shapes: FULL_CUBE,
      modded: true,
      ...data,
      ...states
    }
    delete block.stateCount
    if (unresolved) block.unresolvedStates = true
    if (data.boundingBox === 'empty' && !data.shapes) block.shapes = []
    if (count > 1 && !Array.isArray(data.states)) block.states = []
    return block
  }
}

// Mod menus are absent from prismarine-windows. Mineflayer would crash on
// their numeric IDs, so a synced menu ID is rewritten to its identifier and a
// mod menu is held until its contents reveal the slot count.
function guardWindows (client, adapter, emitWarning) {
  const ownEmit = Object.hasOwn(client, 'emit')
  const originalEmit = client.emit
  let held = null
  let timer = null
  function drop (reason) {
    if (!held) return
    clearTimeout(timer)
    timer = null
    emitWarning({ code: 'FABRIC_MENU_DROPPED', message: 'Mod menu ' + held.name + ' was not opened: ' + reason })
    held = null
  }
  function emit (event, packet, ...rest) {
    if (event === 'end' || (event === 'state' && packet === 'configuration')) {
      clearTimeout(timer)
      timer = null
      held = null
    }
    const menus = adapter.menus
    if (menus && packet && typeof packet === 'object') {
      if (event === 'open_window' && typeof packet.inventoryType === 'number') {
        drop('another menu replaced it')
        const name = menus.get(packet.inventoryType)
        if (name) {
          if (name.startsWith('minecraft:')) {
            packet.inventoryType = name
          } else {
            held = { name, packet, rest }
            timer = setTimeout(() => drop('the server sent no contents'), 5000)
            timer.unref?.()
            return true
          }
        }
      } else if (held && event === 'window_items' && packet.windowId === held.packet.windowId) {
        const opened = held
        clearTimeout(timer)
        timer = null
        held = null
        const slots = Array.isArray(packet.items) ? packet.items.length : 0
        opened.packet.inventoryType = opened.name
        opened.packet.slotCount = Math.max(slots - 36, 0)
        originalEmit.call(this, 'open_window', opened.packet, ...opened.rest)
      } else if (held && event === 'close_window' && packet.windowId === held.packet.windowId) {
        clearTimeout(timer)
        timer = null
        held = null
      }
    }
    return originalEmit.call(this, event, packet, ...rest)
  }
  client.emit = emit
  return () => {
    clearTimeout(timer)
    held = null
    if (client.emit !== emit) return
    if (ownEmit) client.emit = originalEmit
    else delete client.emit
  }
}

module.exports = { MineflayerAdapter, guardWindows }
