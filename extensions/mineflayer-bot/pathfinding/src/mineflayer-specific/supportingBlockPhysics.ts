// SPDX-License-Identifier: GPL-3.0-only
import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'

const installed = new WeakSet<object>()
const supportKey = Symbol('supportingBlock')
type Support = { block?: Vec3; noBlocks: boolean }
type State = { pos: Vec3; vel: Vec3; onGround: boolean; [supportKey]?: Support }
type BlockWorld = { getBlock: (pos: Vec3) => any }

export function usesSupportingBlock (bot: Bot): boolean {
  // The verified 26.1 client uses Entity.checkSupportingBlock/getOnPos for
  // friction. Keep older protocol physics unchanged by this compatibility fix.
  return bot.version.startsWith('26.')
}

function findSupport (world: BlockWorld, position: Vec3, width: number): Vec3 | undefined {
  const half = width / 2
  const y = Math.floor(position.y - 1e-6)
  if (Math.abs(position.y - (y + 1)) > 1e-6) return
  let best: Vec3 | undefined
  let nearest = Infinity
  for (let x = Math.floor(position.x - half + 1e-7); x <= Math.floor(position.x + half - 1e-7); x++) {
    for (let z = Math.floor(position.z - half + 1e-7); z <= Math.floor(position.z + half - 1e-7); z++) {
      const pos = new Vec3(x, y, z)
      const block = world.getBlock(pos)
      if (!block?.shapes?.some((shape: number[]) => shape[0] === 0 && shape[1] === 0 && shape[2] === 0 && shape[3] === 1 && shape[4] === 1 && shape[5] === 1)) continue
      const distance = position.distanceSquared(pos.offset(0.5, 0.5, 0.5))
      if (distance < nearest) { nearest = distance; best = pos }
    }
  }
  return best
}

export function movementSupport (bot: Bot, world: BlockWorld, state: State): Vec3 | undefined {
  if (!usesSupportingBlock(bot) || !state.onGround) return
  return state[supportKey]?.block ?? findSupport(world, state.pos, bot.entity.width ?? 0.6)
}

/** Match modern vanilla's supporting full block for friction, including the
 * one grounded movement tick at an edge. Collision shapes and world stay real.
 */
export function installSupportingBlockPhysics (bot: Bot): void {
  const physics = bot.physics as typeof bot.physics & { simulatePlayer: (state: State, world: BlockWorld) => State }
  if (!usesSupportingBlock(bot) || physics == null || installed.has(physics)) return
  installed.add(physics)
  const simulate = physics.simulatePlayer.bind(physics)
  const appliedPositions = new WeakMap<Vec3, { at: Vec3; support: Support }>()
  physics.simulatePlayer = (state, world) => {
    const before = state.pos.clone()
    const width = bot.entity.width ?? 0.6
    let support = state[supportKey]
    if (support == null && before.equals(bot.entity.position) && state.vel.equals(bot.entity.velocity)) {
      const applied = appliedPositions.get(bot.entity.position)
      if (applied?.at.equals(before)) support = applied.support
    }
    support ??= { block: findSupport(world, before, width), noBlocks: false }
    const supportedBlock = state.onGround && support.block != null ? world.getBlock(support.block) : null
    const sample = before.offset(0, -1, 0)
    const facade = Object.create(world)
    facade.getBlock = (pos: Vec3) => {
      const block = world.getBlock(pos)
      if (supportedBlock == null || block == null || !pos.equals(sample)) return block
      // Only the friction lookup needs the supporting block's type. Preserve
      // the queried block's shapes so this cannot create an invisible floor.
      const surface = Object.create(block)
      surface.type = supportedBlock.type
      return surface
    }
    const result = simulate(state, facade)
    if (result.onGround) {
      let block = findSupport(world, result.pos, width)
      if (block == null && !support.noBlocks) block = findSupport(world, new Vec3(before.x, result.pos.y, before.z), width)
      result[supportKey] = { block, noBlocks: block == null }
    } else result[supportKey] = { noBlocks: false }
    appliedPositions.set(result.pos, { at: result.pos.clone(), support: result[supportKey]! })
    return result
  }
}
