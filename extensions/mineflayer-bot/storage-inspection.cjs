"use strict";

function createStorageInspection(bot, { gathering, production, stopMovement = async () => {} }) {
  let busy = false, disposed = false, generation = 0, preparing = Promise.resolve();
  let completion = Promise.resolve();
  let held = null, holdTimer = null;
  let activeToken = null;
  const cancelled = new Set();
  const owner = () => Object.values(bot.players || {}).find(player =>
    player.username?.toLowerCase() === String(bot.launcherOwnerName).toLowerCase() ||
    player.entity?.username?.toLowerCase() === String(bot.launcherOwnerName).toLowerCase())?.entity ||
    bot.players?.[bot.launcherOwnerName]?.entity;
  function probe() {
    const player = owner();
    if (!player || player.isValid === false || !bot.entity?.position)
      throw new Error("Игрок не виден этому боту");
    const workflow = bot.launcherWorkflow?.snapshot();
    const workflowBusy = workflow && ["starting", "running", "pausing", "stopping"].includes(workflow.phase);
    const combat = bot.launcherCombat?.status;
    return {
      distance: bot.entity.position.distanceTo(player.position),
      position: { ...bot.entity.position },
      ownerName: bot.launcherOwnerName,
      dimension: String(bot.game?.dimension || "overworld"),
      scanning: busy,
      eligible: !disposed && !busy && bot.health > 6 && bot.isAlive !== false &&
        !bot.launcherSurvival?.busy && !production.busy && !bot.currentWindow &&
        !bot.launcherDefendingBow && (!combat || ["idle", "hostile mobs"].includes(combat)) &&
        !bot.launcherInventoryActions?.busy && !(workflowBusy && !gathering.busy),
    };
  }
  async function run(radius, token, options = {}) {
    if (cancelled.has(token)) throw new Error("Поиск складов остановлен");
    const reserved = held?.token === token && options.phase === "inspect" ? held : null;
    if (!reserved && !probe().eligible) throw new Error("Бот занят другой операцией; повторите после её завершения");
    const plan = production.prepareStorageScan(radius, options.phase === "inspect" ? null : owner, token, options);
    if (reserved) { clearTimeout(holdTimer); held = null; }
    busy = true;
    activeToken = token;
    const version = ++generation;
    let release = reserved?.release || (() => {});
    let retain = false;
    try {
      preparing = (async () => {
        if (!reserved) release = await gathering.suspendForStorageInspection();
        if (disposed || version !== generation) throw new Error("Поиск складов остановлен");
        await stopMovement();
        if (disposed || version !== generation) throw new Error("Поиск складов остановлен");
        production.scanStorage(plan);
        completion = production.task;
      })();
      await preparing;
      await completion;
      if (disposed || version !== generation) throw new Error("Поиск складов остановлен");
      const scan = production.snapshot().storageScan;
      if (scan?.state !== "complete") throw new Error(production.status || "Сканирование не завершено");
      if (options.phase === "discover") {
        held = { token, release };
        retain = true;
        holdTimer = setTimeout(() => { void stop(token).catch(() => {}); }, 15000);
        holdTimer.unref?.();
      }
      return scan;
    } finally {
      // Do not let the scenario advance while the borrowed worker is returning
      // control to its paused gathering job.
      if (!retain) try { release(); } finally { busy = false; }
    }
  }
  async function stop(token) {
    if (typeof token === "string") {
      cancelled.add(token);
      if (cancelled.size > 32) cancelled.delete(cancelled.values().next().value);
    }
    if (!busy || (typeof token === "string" && activeToken !== token)) return;
    generation++;
    clearTimeout(holdTimer);
    if (held) {
      const reservation = held; held = null;
      try { reservation.release(); } finally { busy = false; }
      return;
    }
    await preparing.catch(() => {});
    await production.stop();
    await completion.catch(() => {});
  }
  const controller = { probe, run, stop, snapshot: () => production.snapshot().storageScan, get busy() { return busy; },
    dispose() { disposed = true; void stop().catch(() => {}); } };
  bot.launcherStorageInspection = controller;
  return controller;
}

module.exports = { createStorageInspection };
