const COMMANDS = new Set(["craft", "recipes", "smelt", "station", "stash"]);

async function handleProductionCommand(production, command, args, { prepare, reply }) {
  if (!COMMANDS.has(command)) return false;
  if (command === "stash" && args[0] !== "scan") return false;
  if (!production) throw new Error("Крафт и рабочие блоки ещё не готовы");
  if (command === "station" && args[0] === "scan") {
    if (args.length > 2) throw new Error("station scan [радиус 4–64]");
    reply(production.scanStations(args[1] ?? 32));
    return true;
  }
  if (command === "stash" && args[1] === "saved") {
    if (args.length !== 3) throw new Error("stash scan saved номерСканирования");
    production.acknowledgeStorageScan(args[2]);
    return true;
  }
  if (command === "stash") {
    if (args.length > 2) throw new Error("stash scan [радиус 4–64]");
    const plan = production.prepareStorageScan(args[1] ?? 32);
    if ((await prepare()) === false) return true;
    reply(production.scanStorage(plan));
    return true;
  }
  if (command === "station" && ["status", "close", "stop"].includes(args[0] || "status")) {
    if (args.length > 1) throw new Error("station status|close|stop");
    if (["close", "stop"].includes(args[0])) await production.stop();
    reply(production.status);
    return true;
  }
  if (command === "station" && args[0] !== "open") {
    reply(production.stationAction(args[0], args.slice(1)));
    return true;
  }
  let plan;
  if (command === "craft" || command === "recipes") {
    if (!args.length || args.length > 3)
      throw new Error(`${command} предмет [количество] [auto|inventory|table]`);
    plan = production.prepareCraft(args[0], args[1] ?? 1, args[2] ?? "auto");
    if (command === "recipes") {
      reply(production.previewCraft(plan));
      reply(
        plan.needsTable ? "Нужен верстак; бот найдёт или установит его" : "Крафт в инвентаре 2×2",
      );
      return true;
    }
  } else if (command === "smelt") {
    if (!args.length || args.length > 4)
      throw new Error(
        "smelt предмет [количество] [топливо|auto] [furnace|blast_furnace|smoker|auto]",
      );
    plan = production.prepareSmelt(args[0], args[1] ?? 1, args[2] ?? "auto", args[3] ?? "auto");
  } else {
    if (![2, 4].includes(args.length))
      throw new Error("station open названиеБлока или station open x y z");
    plan = production.prepareStation(args.length === 4 ? args.slice(1) : args[1]);
  }
  // Validate the complete request before replacing a running movement/job.
  if ((await prepare()) === false) return true;
  reply(
    command === "craft"
      ? production.craft(plan)
      : command === "smelt"
        ? production.smelt(plan)
        : production.station(plan),
  );
  return true;
}

module.exports = { COMMANDS, handleProductionCommand };
