import { Vec3 } from 'vec3'
import type { World } from './world/worldInterface'

/** Check feet support explicitly: raycasts do not intersect shapeless air/lava. */
export function supportedWalkSegment (world: World, from: Vec3, to: Vec3): boolean {
  const delta = to.minus(from)
  const steps = Math.max(1, Math.ceil(delta.norm() * 10))
  for (let i = 0; i <= steps; i++) {
    const pos = from.plus(delta.scaled(i / steps))
    const feet = world.getBlockInfo(pos)
    if (feet.water) continue
    // Walking needs a continuous corridor for the feet, not a single corner
    // hanging over a block. Partial overlap is valid while crouching at a rim,
    // but cannot authorize a shortcut or releasing sneak with forward held.
    const supported = [[0, 0], [-0.299, -0.299], [-0.299, 0.299], [0.299, -0.299], [0.299, 0.299]].every(([x, z]) => {
      const sample = pos.offset(x, -0.05, z)
      const support = world.getBlockInfo(sample)
      return support.physical && support.safe && support.getBBs().some(box =>
        box.maxY >= pos.y - 0.6 && box.maxY <= pos.y + 0.05 &&
        sample.x >= box.minX && sample.x <= box.maxX && sample.z >= box.minZ && sample.z <= box.maxZ)
    })
    if (!supported) return false
  }
  return true
}

/** Keep a grounded handoff safe until its next executor has chosen controls. */
export function needsWalkSneak (world: World, pos: Vec3, velocity: Vec3): boolean {
  return !supportedWalkSegment(world, pos, pos.offset(velocity.x * 3, 0, velocity.z * 3))
}

/** Sweep the player's body, including its sides, through actual block shapes. */
export function clearBodySegment (world: World, from: Vec3, to: Vec3, width = 0.62, height = 1.8): boolean {
  const radius = width / 2
  const delta = to.minus(from)
  const steps = Math.max(1, Math.ceil(delta.norm() * 2))
  // A thin corner overlap can lie entirely between two sample positions.
  // Pad only the candidate-block scan by half a sample interval; the exact
  // continuous slab intersection below still uses the real body dimensions.
  const scanPadding = delta.norm() / (2 * steps)
  const visited = new Set<string>()
  const intersects = (box: { minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number }): boolean => {
    let enter = 0, leave = 1
    const mins = [box.minX - radius, box.minY - height + 1e-5, box.minZ - radius]
    const maxs = [box.maxX + radius, box.maxY - 1e-5, box.maxZ + radius]
    const origin = [from.x, from.y, from.z], direction = [delta.x, delta.y, delta.z]
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(direction[axis]) < 1e-9) {
        if (origin[axis] <= mins[axis] || origin[axis] >= maxs[axis]) return false
      } else {
        const a = (mins[axis] - origin[axis]) / direction[axis]
        const b = (maxs[axis] - origin[axis]) / direction[axis]
        enter = Math.max(enter, Math.min(a, b))
        leave = Math.min(leave, Math.max(a, b))
      }
    }
    return enter < leave && leave > 0 && enter < 1
  }
  for (let i = 0; i <= steps; i++) {
    const p = from.plus(delta.scaled(i / steps))
    for (let x = Math.floor(p.x - radius - scanPadding); x <= Math.floor(p.x + radius + scanPadding); x++) {
      for (let z = Math.floor(p.z - radius - scanPadding); z <= Math.floor(p.z + radius + scanPadding); z++) {
        for (let y = Math.floor(p.y - scanPadding + 1e-5); y <= Math.floor(p.y + height + scanPadding - 1e-5); y++) {
          const key = `${x}:${y}:${z}`
          if (visited.has(key)) continue
          visited.add(key)
          // Padding discovers candidates only. Nearby lava or an unloaded cell
          // outside the actual body sweep must not invalidate a clear passage.
          if (!intersects({ minX: x, minY: y, minZ: z, maxX: x + 1, maxY: y + 1, maxZ: z + 1 })) continue
          const block = world.getBlockInfo(new Vec3(x, y, z))
          if (block.isInvalid || !block.safe) return false
          for (const box of block.getBBs()) {
            if (intersects(box)) return false
          }
        }
      }
    }
  }
  return true
}
