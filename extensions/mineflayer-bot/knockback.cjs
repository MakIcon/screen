const controllers = new WeakMap()
const livingTypes = new Set(['player', 'mob', 'animal', 'hostile', 'passive', 'water_creature'])

function canPush (bot, entity) {
  if (!entity || entity === bot.entity || entity.id === bot.entity.id || entity.isValid === false) return false
  if (!livingTypes.has(entity.type)) return false
  if (entity.noPhysics || bot.players?.[entity.username]?.gamemode === 3) return false
  const ownTeam = bot.teamMap?.[bot.username]
  const otherTeam = bot.teamMap?.[entity.username || entity.uuid]
  // Respect server teams that disable collisions.
  if (ownTeam?.collisionRule === 'never' || otherTeam?.collisionRule === 'never') return false
  return true
}

function pushFromEntities (bot) {
  const self = bot.entity
  if (!self?.position || !self.velocity || bot.physicsEnabled === false || bot.isAlive === false) return
  if (bot.vehicle || self.noPhysics || bot.game?.gameMode === 'spectator') return

  for (const entity of Object.values(bot.entities || {})) {
    if (!canPush(bot, entity) || !entity.position || !(entity.width > 0) || !(entity.height > 0)) continue
    const dx = entity.position.x - self.position.x
    const dz = entity.position.z - self.position.z
    const reach = (self.width + entity.width) / 2 + 0.2
    if (Math.abs(dx) >= reach || Math.abs(dz) >= reach) continue
    if (entity.position.y >= self.position.y + self.height ||
        entity.position.y + entity.height <= self.position.y) continue

    // Living entity collision impulse, applied only to our locally simulated
    // player. Physics handles the resulting motion and block collisions next tick.
    const distance = Math.max(Math.abs(dx), Math.abs(dz))
    if (!Number.isFinite(distance) || distance < 0.01) continue
    const root = Math.sqrt(distance)
    const scale = 0.05 * Math.min(1, 1 / root) / root
    self.velocity.x -= dx * scale
    self.velocity.z -= dz * scale
  }
}

function installKnockback (bot, enabled = false) {
  const existing = controllers.get(bot)
  if (existing) {
    existing.setEnabled(enabled)
    return existing
  }

  let antiKnockback = enabled === true
  const listeners = []

  // Keep Mineflayer's packet processing intact (including remote entities).
  // Snapshot only our velocity around an impulse; walking, jumping, falling and
  // server position corrections continue to use normal physics in either mode.
  for (const event of ['entity_velocity', 'explosion']) {
    const snapshots = new WeakMap()
    const before = (packet) => {
      if (!antiKnockback || !bot.entity?.velocity) return
      if (event === 'entity_velocity' && packet.entityId !== bot.entity.id) return
      snapshots.set(packet, { entity: bot.entity, velocity: bot.entity.velocity.clone() })
    }
    const after = (packet) => {
      const snapshot = snapshots.get(packet)
      if (!snapshot) return
      snapshots.delete(packet)
      if (bot.entity === snapshot.entity) bot.entity.velocity.update(snapshot.velocity)
    }
    bot._client.prependListener(event, before)
    bot._client.on(event, after)
    listeners.push([event, before, after])
  }

  const onTick = () => {
    if (!antiKnockback) pushFromEntities(bot)
  }
  const controller = {
    get enabled () { return antiKnockback },
    setEnabled (value) { antiKnockback = value === true },
    dispose () {
      bot.removeListener('physicsTick', onTick)
      bot.removeListener('end', controller.dispose)
      for (const [event, before, after] of listeners) {
        bot._client.removeListener(event, before)
        bot._client.removeListener(event, after)
      }
      controllers.delete(bot)
    }
  }
  bot.on('physicsTick', onTick)
  bot.once('end', controller.dispose)
  controllers.set(bot, controller)
  return controller
}

module.exports = { installKnockback }
