"use strict";

const { randomUUID } = require("node:crypto");
const { Vec3 } = require("vec3");
const { dimensionOf } = require("./fleet-crew.cjs");
const { safeCell } = require("./fleet-navigation.cjs");

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const outsideStorage = (p, positions) => positions.every(q => distance(p, q) >= 9);

function* parkingSearch(bot, positions, reserved = []) {
  const origin = bot.entity.position;
  const occupied = [...reserved, ...Object.values(bot.entities || {})
    .filter(entity => entity !== bot.entity && entity.isValid !== false && entity.username)
    .map(entity => entity.position)];
  let best = null, score = Infinity;
  let examined = 0, sliceStarted = performance.now();
  // Search actual loaded floors, including the user's raised steps. Movement
  // to the selected cell is handled by the regular walking pathfinder.
  for (let dx = -20; dx <= 20; dx++) for (let dz = -20; dz <= 20; dz++) {
    const horizontal = Math.hypot(dx, dz);
    if (horizontal > 20 || horizontal > score) continue;
    for (let dy = -12; dy <= 12; dy++) {
      if (++examined % 32 === 0 && performance.now() - sliceStarted >= 2) {
        yield;
        sliceStarted = performance.now();
      }
      const p = new Vec3(Math.floor(origin.x) + dx + 0.5, Math.floor(origin.y) + dy, Math.floor(origin.z) + dz + 0.5);
      const cost = horizontal + Math.abs(dy) * 2;
      // Keep a margin for GoalNear's arrival radius and residual velocity.
      if (cost >= score || positions.some(q => distance(p, q) < 10.5) || occupied.some(q => distance(p, q) < 2 && Math.abs(p.y - q.y) < 2)) continue;
      if (safeCell(bot, p)) { best = p; score = cost; }
    }
  }
  return best;
}

function parkingCell(bot, positions, reserved = []) {
  const search = parkingSearch(bot, positions, reserved);
  let result;
  do { result = search.next(); } while (!result.done);
  return result.value;
}

async function parkingCellAsync(bot, positions, reserved, { signal, wait }) {
  const search = parkingSearch(bot, positions, reserved);
  let result;
  do {
    if (signal.aborted) throw new Error("Поиск места у склада прерван");
    result = search.next();
    if (!result.done) await wait(bot.launcherTraffic?.workDelayMs || 0, signal);
  } while (!result.done);
  return result.value;
}

// A ticket lives through approach, transfer and departure. Refresh it while
// walking or opening a window, and always release it on cancellation/failure.
async function withStorageTurn(bot, crew, positions, { signal: parentSignal, wait, walk, status, onStalled,
  stallMs = 30000 }, action) {
  if (!crew || bot.launcherTraffic?.enabled === false) return action(undefined, parentSignal);
  const lifetime = new AbortController(), signal = lifetime.signal;
  const token = randomUUID(), dim = dimensionOf(bot);
  let parking = null, reply, pending = null, closed = false, nextParkingAt = 0;
  let rejectStopped, deadline = Date.now() + stallMs;
  const stopped = new Promise((_, reject) => { rejectStopped = reject; });
  const cancel = () => { lifetime.abort(); rejectStopped(new Error("Выгрузка прервана")); };
  parentSignal.addEventListener("abort", cancel, { once: true });
  const visited = new Set();
  const diggings = new Set();
  const progress = () => { deadline = Date.now() + stallMs; };
  bot.on?.("diggingCompleted", progress); bot.on?.("blockPlaced", progress);
  bot.on?.("windowOpen", progress); bot.on?.("windowClose", progress);
  bot.inventory?.on?.("updateSlot", progress);
  const monitor = setInterval(() => {
    if (!reply?.allowed) { progress(); return; }
    const p = bot.entity.position;
    const cell = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
    if (!visited.has(cell)) { visited.add(cell); progress(); }
    // A genuinely slow dig gets its expected duration once, without letting
    // repeated starts on the same block keep an unproductive ticket alive.
    const block = bot.targetDigBlock;
    const id = block && `${block.position}:${block.type}`;
    if (id && !diggings.has(id)) {
      diggings.add(id);
      const duration = bot.digTime?.(block);
      if (Number.isFinite(duration)) deadline = Math.max(deadline, Date.now() + duration + 5000);
    }
    if (Date.now() < deadline) return;
    rejectStopped(new Error("Выгрузка остановлена: нет продвижения к складу или передачи предметов; очередь освобождена"));
    lifetime.abort();
    try { onStalled?.(); } catch { /* A disconnected window must not retain the ticket. */ }
  }, Math.min(250, Math.max(10, stallMs / 4)));
  monitor.unref?.();
  const failedParking = [];
  const refresh = () => {
    if (closed || pending) return pending;
    pending = crew.request("storage", { token, dim, positions, parking }).then(value => { reply = value; })
      .finally(() => { pending = null; });
    return pending;
  };
  const heartbeat = setInterval(() => { void refresh()?.catch(() => {}); }, 750);
  heartbeat.unref?.();
  const run = async () => {
    if (parentSignal.aborted) { cancel(); throw new Error("Выгрузка прервана"); }
    await refresh();
    while (!reply?.allowed) {
      if (signal.aborted || dimensionOf(bot) !== dim) throw new Error("Ожидание склада прервано");
      if (bot.launcherTraffic?.enabled === false) return await action(undefined, signal);
      status(`Очередь на разгрузку: передо мной ${reply?.ahead ?? 1}`);
      const crowded = Object.values(bot.entities || {}).some(entity => entity !== bot.entity && entity.username &&
        entity.isValid !== false && distance(entity.position, bot.entity.position) < 1.6 && Math.abs(entity.position.y - bot.entity.position.y) < 2);
      if ((!outsideStorage(bot.entity.position, positions) || crowded) && !parking && Date.now() >= nextParkingAt) {
        nextParkingAt = Date.now() + 2000;
        parking = await parkingCellAsync(bot, positions, [...(reply?.parking || []), ...failedParking], { signal, wait });
        if (parking) {
          await pending; // A previous heartbeat may still contain the old bay.
          await refresh(); // Atomically reserve the bay before walking.
          if (!reply?.bay) { parking = null; continue; }
          try { await walk(parking, signal); }
          catch (error) {
            if (signal.aborted) throw error;
            failedParking.push(parking);
            if (failedParking.length > 8) failedParking.shift();
            parking = null;
          }
        }
      }
      await wait(500, signal);
      await refresh();
    }
    status("Моя очередь: подхожу к складу");
    return await action(async () => {
      // Clear the shared steps before allowing the next bot to approach.
      const failed = [];
      for (let attempt = 0; attempt < 3 && !outsideStorage(bot.entity.position, positions); attempt++) {
        const exit = await parkingCellAsync(bot, positions, [...(reply?.parking || []), ...failed], { signal, wait });
        if (!exit) return;
        try { await walk(exit, signal); return; }
        catch (error) { if (signal.aborted || attempt === 2) throw error; failed.push(exit); }
      }
    }, signal);
  };
  try { return await Promise.race([run(), stopped]); }
  finally {
    closed = true;
    lifetime.abort(); clearInterval(heartbeat); clearInterval(monitor);
    parentSignal.removeEventListener("abort", cancel);
    bot.off?.("diggingCompleted", progress); bot.off?.("blockPlaced", progress);
    bot.off?.("windowOpen", progress); bot.off?.("windowClose", progress);
    bot.inventory?.off?.("updateSlot", progress);
    await pending?.catch(() => {});
    await crew.request("storage", { token, release: true }).catch(() => {});
  }
}

module.exports = { withStorageTurn, parkingCell, parkingCellAsync, outsideStorage };
