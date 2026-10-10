import type { Bot } from 'mineflayer'
import { BotcraftPhysics, EPhysicsCtx, PlayerState } from '@nxg-org/mineflayer-physics-util'

const patched = new WeakSet<object>()
const vineNames = new Set(['twisting_vines', 'twisting_vines_plant', 'weeping_vines', 'weeping_vines_plant'])
export const climbableNames = new Set(['ladder', 'vine', ...vineNames])

export class ClimbAwarePhysics extends BotcraftPhysics {
  private readonly simulationAttributes = new WeakMap<PlayerState, PlayerState['attributes']>()

  constructor (registry: Bot['registry']) {
    super(registry)
    // The engine's setter replaces server attributes with the default speed.
    // Its movement-speed getter already applies the sprint modifier.
    const internal = this as unknown as { setSprinting: (context: EPhysicsCtx<PlayerState>, value: boolean) => void }
    internal.setSprinting = (context, value) => { context.state.sprinting = value }
  }

  override simulate (context: EPhysicsCtx<PlayerState>, world: Parameters<BotcraftPhysics['simulate']>[1]): PlayerState {
    const player = context.state
    // Prismarine does not maintain entity.lastOnGround. A fresh prediction
    // must use the live grounded state for takeoff acceleration and friction.
    player.lastOnGround = player.onGround
    // PlayerState.update shares the bot's attribute objects. Predictions and
    // water simulation must never change the attributes received from a server.
    if (this.simulationAttributes.get(player) !== player.attributes) {
      player.attributes = structuredClone(player.attributes ?? {})
      this.simulationAttributes.set(player, player.attributes)
    }
    return super.simulate(context, world) as PlayerState
  }

  override isInClimbable (player: PlayerState, world: Parameters<BotcraftPhysics['isInClimbable']>[1]): boolean {
    return player.gameMode !== 'spectator' && (vineNames.has(world.getBlock(player.pos)?.name ?? '') || super.isInClimbable(player, world))
  }
}

/** Extend prismarine-physics' ladder tag while preserving real block shapes and world data. */
export function installClimbablePhysics (bot: Bot): void {
  const physics = bot.physics as typeof bot.physics & { simulatePlayer: (state: any, world: any) => any }
  if (physics == null || patched.has(physics)) return
  patched.add(physics)
  const simulate = physics.simulatePlayer.bind(physics)
  const ladderId = bot.registry.blocksByName.ladder.id
  const worlds = new WeakMap<object, any>()
  physics.simulatePlayer = (state, world) => {
    let facade = worlds.get(world)
    if (facade == null) {
      facade = Object.create(world)
      facade.getBlock = (pos: any) => {
        const block = world.getBlock(pos)
        if (block == null || !vineNames.has(block.name)) return block
        const climbable = Object.create(block)
        climbable.type = ladderId
        return climbable
      }
      worlds.set(world, facade)
    }
    return simulate(state, facade)
  }
}
