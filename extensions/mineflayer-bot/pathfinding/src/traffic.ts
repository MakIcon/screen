import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'
import type { Move } from './mineflayer-specific/move'

export interface TrafficAwareBot extends Bot {
  launcherTraffic?: {
    cost: (from: Vec3, to: Vec3) => number
    pause: (move: Move) => boolean
    readonly waiting: boolean
    readonly workDelayMs?: number
  }
}
