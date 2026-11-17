"use strict";

const { randomUUID } = require("node:crypto");
const { Vec3 } = require("vec3");
const { dimensionOf } = require("./fleet-crew.cjs");
const { safeCell } = require("./fleet-navigation.cjs");
const { warehouseLayout, flat, containerClick } = require("./warehouse-geometry.cjs");

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
async function withStorageTurn(bot, crew, positions, { signal: parentSignal, wait, walk, status, onStalled, approach, preferred,
  stallMs = 30000, approachStallMs = 6500 }, action) {
  if (!crew || bot.launcherTraffic?.enabled === false) return action(undefined, parentSignal);
  const lifetime = new AbortController(), signal = lifetime.signal;
  const token = randomUUID(), dim = dimensionOf(bot);
  let parking = null, reply, pending = null, closed = false, nextParkingAt = 0;
  let layout = null, desired = preferred || positions[0], ready = false, requeue = false, reselect = false;
  let layoutDirty = true, phase = "gathering", departed = false;
  let enteredBay = null;
  let announced = false;
  const setPhase = value => { phase = value; bot.launcherTraffic?.setStoragePhase?.(value, positions); };
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
    // The items are already in the chest. A blocked walk back must not turn
    // a finished unloading into a failed task: stop walking, keep the result.
    if (phase === "leaving") {
      lifetime.abort();
      try { onStalled?.(); } catch { /* Stop a cancelled walk as well as its waiter. */ }
      return;
    }
    rejectStopped(new Error("Выгрузка остановлена: нет продвижения к складу или передачи предметов; очередь освобождена"));
    lifetime.abort();
    try { onStalled?.(); } catch { /* A disconnected window must not retain the ticket. */ }
  }, Math.min(250, Math.max(10, stallMs / 4)));
  monitor.unref?.();
  const failedParking = [];
  const refresh = () => {
    if (closed || pending || !announced) return pending;
    const changed = layoutDirty; layoutDirty = false;
    const rotate = requeue; requeue = false;
    const select = reselect; reselect = false;
    pending = crew.request("storage", { token, dim, positions, parking,
      ...(layout ? { batch: true, pos: bot.entity.position, ready, requeue: rotate, reselect: select, done: phase === "leaving",
        ...(changed ? { stages: layout.stages, bays: layout.bays } : {}) } : {}) }).then(value => { reply = value; })
      .finally(() => { pending = null; });
    return pending;
  };
  const heartbeat = setInterval(() => { void refresh()?.catch(() => {}); }, 250);
  heartbeat.unref?.();
  const run = async () => {
    if (parentSignal.aborted) { cancel(); throw new Error("Выгрузка прервана"); }
    setPhase("gathering");
    if (bot.world?.raycast && bot.pathfinder?.goto) {
      layout = await warehouseLayout(bot, positions, { signal, wait, targets: [desired] });
      if ((!layout.bays.length || !layout.stages.length) && approach) {
        await approach(desired, signal);
        layout = await warehouseLayout(bot, positions, { signal, wait, targets: [desired] });
      }
      // Without loaded, safe physical places there can be no parallel bays.
      // The existing bounded route recovery can establish the first approach.
      if (!layout.bays.length || !layout.stages.length) layout = null;
    }
    layoutDirty = true;
    announced = true;
    await pending;
    await refresh();
    if (layout) {
      const assemble = async () => {
        let failures = 0;
        while (!reply?.allowed) {
          if (signal.aborted) throw new Error("Подход к складу прерван");
          // An idle waiter may be stepping out for a departing customer.
          // Keep its ticket, but do not pull it back into that exit mid-step.
          if (bot.launcherTraffic?.clearing) {
            ready = false; await pending; await refresh();
            await wait(150, signal); continue;
          }
          const stage = reply?.stage && new Vec3(reply.stage.x, reply.stage.y, reply.stage.z);
          if (!stage) throw new Error("Нет свободного безопасного места ожидания у склада");
          if (flat(bot.entity.position, stage) > 0.45 || Math.abs(bot.entity.position.y - stage.y) > 0.5) {
            status("Подхожу к свободному месту у склада");
            // A waiting place needs no click geometry: a loose arrival keeps
            // a crowd from fighting over the exact centre of a block.
            try { await walk(stage, signal, 0.4); }
            catch (error) {
              if (signal.aborted || ++failures >= 6) throw error;
              await wait(300, signal);
              layout.stages = layout.stages.filter(p => flat(p, stage) > 1.9 || Math.abs(p.y - stage.y) > 1);
              layoutDirty = true; reselect = true;
              await pending; await refresh(); continue;
            }
          }
          ready = true;
          await pending; await refresh();
          if (!reply?.allowed) { status(`Жду свободный подход к сундуку: впереди ${reply?.ahead ?? 0}`); await wait(150, signal); await refresh(); }
        }
        setPhase("service");
        status("Свободный подход: разгружаюсь");
      };
      const enterChest = async position => {
        if (flat(position, desired) > 0.1 || Math.abs(position.y - desired.y) > 0.1) {
          // Several sorted chests can be clicked from the same reserved spot.
          // Keep unloading there instead of walking a full queue lap per item.
          if (reply?.service && bot.entity.position.distanceTo(new Vec3(reply.service.x, reply.service.y, reply.service.z)) < 0.4 &&
              containerClick(bot, bot.blockAt(new Vec3(position.x, position.y, position.z)))) { desired = position; return; }
          // Never requeue while standing at the chest: first use the exit,
          // otherwise the waiting bot itself blocks its replacement.
          await leave();
          departed = false;
          desired = position; ready = false; requeue = true; setPhase("gathering");
          layout = await warehouseLayout(bot, positions, { signal, wait, targets: [desired], reserved: reply?.parking || [] });
          if (!layout.bays.length) throw new Error("Нет свободного подхода к этому сундуку");
          layoutDirty = true; await pending; await refresh();
        }
        for (let attempt = 0; ; attempt++) {
          await assemble();
          const bay = reply?.service;
          if (!bay) throw new Error("Координатор не выделил место разгрузки");
          bot.launcherTraffic?.setStoragePhase?.("service", positions, bay);
          const target = new Vec3(bay.x, bay.y, bay.z);
          if (bot.entity.position.distanceTo(target) <= 0.25) { enteredBay = target; return; }
          const approachAbort = new AbortController();
          const cancelApproach = () => approachAbort.abort();
          signal.addEventListener("abort", cancelApproach, { once: true });
          let approachDeadline = Date.now() + approachStallMs, stalled = false;
          const approachCells = new Set();
          const approachMonitor = setInterval(() => {
            const p = bot.entity.position, cell = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
            if (!approachCells.has(cell)) { approachCells.add(cell); approachDeadline = Date.now() + approachStallMs; }
            if (Date.now() >= approachDeadline) { stalled = true; approachAbort.abort(); }
          }, 200);
          try {
            // A push during opening only needs a local correction. Replaying
            // the entrance sends a bot away from the chest it already reached.
            const correcting = enteredBay?.equals(target) && flat(bot.entity.position, target) < 1.5 &&
              Math.abs(bot.entity.position.y - target.y) < 0.5;
            if (!correcting) for (const p of bay.inbound || []) await walk(new Vec3(p.x, p.y, p.z), approachAbort.signal, 0.3);
            await walk(target, approachAbort.signal); enteredBay = target; return;
          }
          catch (error) {
            // One closed approach is not an unreachable chest: give the place
            // back, line up again and take another side.
            layout.bays = layout.bays.filter(p => flat(p, bay) > 0.1 || Math.abs(p.y - bay.y) > 0.1);
            if (signal.aborted || attempt >= 4 || !layout.bays.length)
              throw stalled ? new Error("Нет продвижения к свободному месту у сундука") : error;
            status("Подход к сундуку закрыт: беру другое место");
            layoutDirty = true; ready = false; requeue = true; setPhase("gathering");
            await pending; await refresh();
          } finally {
            clearInterval(approachMonitor);
            signal.removeEventListener("abort", cancelApproach);
          }
        }
      };
      const leave = async (leaveSignal = signal) => {
        if (departed) return;
        enteredBay = null;
        setPhase("leaving");
        // The way back runs over cells already visited on the way in.
        visited.clear(); progress();
        await pending; await refresh();
        const outbound = reply?.service?.outbound || [];
        if (outbound.length) {
          try {
            for (const p of outbound) await walk(new Vec3(p.x, p.y, p.z), leaveSignal, 0.3);
            // Release independently as soon as this exit is clear. There is no
            // return trip to the old waiting place after a completed deposit.
            await pending; await refresh(); departed = true; return;
          } catch (error) { if (leaveSignal.aborted) throw error; }
        }
        // A narrow/changed terrace may have only one safe path. Use its nearest
        // free waiting place; the usual traffic controller yields on that path.
        const taken = reply?.parking || [];
        const places = layout.stages.filter(p => !taken.some(q => flat(p, q) < 1.9 && Math.abs(p.y - q.y) < 2))
          .sort((a, b) => flat(a, bot.entity.position) - flat(b, bot.entity.position)).slice(0, 3);
        for (const [index, place] of places.entries()) {
          try { await walk(new Vec3(place.x, place.y, place.z), leaveSignal, 0.4); break; }
          catch (error) { if (leaveSignal.aborted || index === places.length - 1) throw error; }
        }
        departed = true;
      };
      await assemble();
      try { return await action(leave, signal, { enterChest, get service() { return reply?.service; } }); }
      finally {
        // Both a successful transfer and an error must clear the click/jump
        // approach before its replacement is released. A failed task gets its
        // own short cleanup signal, independent of its cancelled operation.
        if (!departed && !parentSignal.aborted) {
          const cleanup = new AbortController();
          const timer = setTimeout(() => cleanup.abort(), 8000);
          try { await leave(cleanup.signal); } catch { /* Persistent traffic yielding retries once idle. */ }
          finally { clearTimeout(timer); }
        }
      }
    }
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
      setPhase("leaving");
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
    setPhase("idle");
  }
}

module.exports = { withStorageTurn, parkingCell, parkingCellAsync, outsideStorage };
