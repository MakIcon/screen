import { Vec3 } from 'vec3'

/** Spatial hints only: every reused movement is planned against live terrain. */
export class TraversalMemory {
  private readonly cells = new Map<string, Vec3>()

  constructor (private readonly capacity = 4096) {}

  get size (): number { return this.cells.size }

  clear (): void { this.cells.clear() }

  remember (position: Vec3): void {
    const cell = position.floored()
    const key = `${cell.x},${cell.y},${cell.z}`
    if (this.cells.has(key)) return
    this.cells.set(key, cell)
    if (this.cells.size > this.capacity) this.cells.delete(this.cells.keys().next().value!)
  }

  contains (position: Vec3): boolean {
    const cell = position.floored()
    // A narrow corridor permits centering, diagonal smoothing and stair
    // landings without turning individual footsteps into mandatory waypoints.
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) {
      if (this.cells.has(`${cell.x + x},${cell.y + y},${cell.z + z}`)) return true
    }
    return false
  }

  stepCost (position: Vec3): number {
    const cell = position.floored()
    if (this.cells.has(`${cell.x},${cell.y},${cell.z}`)) return 0
    // Prefer the actual stair entrance to a neighbouring ledge/drop, while
    // still allowing recentering and fresh connections inside the corridor.
    return this.contains(position) ? 4 : Infinity
  }

  near (position: Vec3, radius: number): boolean {
    for (const cell of this.cells.values()) if (cell.offset(0.5, 0, 0.5).distanceTo(position) <= radius) return true
    return false
  }

  levelAnchor (target: Vec3): Vec3 | undefined {
    let best: Vec3 | undefined
    let distance = Infinity
    for (const cell of this.cells.values()) {
      if (Math.abs(cell.y - target.y) > 2) continue
      const center = cell.offset(0.5, 0, 0.5)
      const next = center.distanceTo(target)
      if (next < distance) { best = center; distance = next }
    }
    return best
  }
}
