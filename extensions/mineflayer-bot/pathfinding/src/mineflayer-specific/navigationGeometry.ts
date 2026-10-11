import { Vec3 } from 'vec3'
import type { World } from './world/worldInterface'

/** Sweep the player's body, including its sides, through actual block shapes. */
export function clearBodySegment (world: World, from: Vec3, to: Vec3, width = 0.62, height = 1.8): boolean {
  const radius = width / 2
  const delta = to.minus(from)
  const steps = Math.max(1, Math.ceil(delta.norm() * 2))
  const visited = new Set<string>()
  for (let i = 0; i <= steps; i++) {
    const p = from.plus(delta.scaled(i / steps))
    for (let x = Math.floor(p.x - radius); x <= Math.floor(p.x + radius); x++) {
      for (let z = Math.floor(p.z - radius); z <= Math.floor(p.z + radius); z++) {
        for (let y = Math.floor(p.y + 1e-5); y <= Math.floor(p.y + height - 1e-5); y++) {
          const key = `${x}:${y}:${z}`
          if (visited.has(key)) continue
          visited.add(key)
          const block = world.getBlockInfo(new Vec3(x, y, z))
          if (block.isInvalid || !block.safe) return false
          for (const box of block.getBBs()) {
            let enter = 0, leave = 1
            const mins = [box.minX - radius, box.minY - height + 1e-5, box.minZ - radius]
            const maxs = [box.maxX + radius, box.maxY - 1e-5, box.maxZ + radius]
            const origin = [from.x, from.y, from.z], direction = [delta.x, delta.y, delta.z]
            for (let axis = 0; axis < 3; axis++) {
              if (Math.abs(direction[axis]) < 1e-9) {
                if (origin[axis] <= mins[axis] || origin[axis] >= maxs[axis]) { enter = 2; break }
              } else {
                const a = (mins[axis] - origin[axis]) / direction[axis]
                const b = (maxs[axis] - origin[axis]) / direction[axis]
                enter = Math.max(enter, Math.min(a, b))
                leave = Math.min(leave, Math.max(a, b))
              }
            }
            if (enter < leave && leave > 0 && enter < 1) return false
          }
        }
      }
    }
  }
  return true
}
