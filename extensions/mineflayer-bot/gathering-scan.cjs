const { Vec3 } = require("vec3");
const plan = require("./gathering-plan.cjs");

// Controller-owned index: ore coordinates survive digs and subsequent tasks.
// Changes update a coordinate, not all 4096 cells of every loaded section.
function createMineIndex(bot) {
  const columns = new Map();
  const columnKey = (x, z) => `${x}:${z}`;
  const onColumn = (pos) => columns.delete(columnKey(Math.floor(pos.x / 16), Math.floor(pos.z / 16)));
  const onBlock = (_old, block) => {
    if (!block) return;
    const pos = block.position;
    const column = columns.get(columnKey(Math.floor(pos.x / 16), Math.floor(pos.z / 16)));
    if (!column) return;
    for (const entry of column.sections.get(Math.floor(pos.y / 16))?.values() || []) {
      const key = plan.key(pos);
      if (entry.ids.has(block.type)) entry.positions.set(key, pos.clone());
      else entry.positions.delete(key);
    }
  };
  bot.on("blockUpdate", onBlock);
  bot.on("chunkColumnLoad", onColumn);
  bot.on("chunkColumnUnload", onColumn);
  return {
    section(column, x, y, z, ids) {
      const key = columnKey(x, z);
      let record = columns.get(key);
      if (record?.column !== column) {
        record = { column, sections: new Map() };
        columns.set(key, record);
      }
      const sy = Math.floor(y / 16);
      let section = record.sections.get(sy);
      if (!section) record.sections.set(sy, (section = new Map()));
      const signature = [...ids].sort((a, b) => a - b).join(",");
      let entry = section.get(signature);
      if (!entry?.ready) {
        entry = { ids, positions: new Map(), ready: false };
        section.set(signature, entry);
      }
      return entry;
    },
    dispose() {
      bot.off("blockUpdate", onBlock);
      bot.off("chunkColumnLoad", onColumn);
      bot.off("chunkColumnUnload", onColumn);
      columns.clear();
    },
  };
}

// Scan the loaded vertical columns, not a sphere at the player's elevation.
// Palettes skip sections without the desired ore; yield so physics/stop still run.
async function scanMine(bot, task, { limit = 512, allowed, yieldControl, index }) {
  const ids = new Set(task.names.map((name) => bot.registry.blocksByName[name].id));
  const candidates = [];
  let remaining = 0,
    unloaded = 0,
    examined = 0;
  if (!bot.world?.getColumn) {
    for (let y = task.minY; y <= task.maxY; y += 16) {
      const point = new Vec3(task.origin.x, Math.min(y + 8, task.maxY), task.origin.z);
      const positions = bot.findBlocks({
        point,
        maxDistance: Math.ceil(Math.hypot(task.radius, 16)),
        count: limit,
        matching: [...ids],
        useExtraInfo: (block) =>
          block.position.y >= y &&
          block.position.y < y + 16 &&
          plan.insideTask(task, block.position),
      });
      for (const position of positions) {
        const block = bot.blockAt(position);
        remaining++;
        if (allowed(block)) candidates.push(block);
      }
      await yieldControl();
    }
  } else {
    const columns = [];
    for (
      let x = Math.floor((task.origin.x - task.radius) / 16);
      x <= Math.floor((task.origin.x + task.radius) / 16);
      x++
    )
      for (
        let z = Math.floor((task.origin.z - task.radius) / 16);
        z <= Math.floor((task.origin.z + task.radius) / 16);
        z++
      )
        columns.push({ x, z });
    columns.sort(
      (a, b) =>
        Math.hypot(a.x * 16 + 8 - bot.entity.position.x, a.z * 16 + 8 - bot.entity.position.z) -
        Math.hypot(b.x * 16 + 8 - bot.entity.position.x, b.z * 16 + 8 - bot.entity.position.z),
    );
    for (const { x, z } of columns) {
      const column = bot.world.getColumn(x, z);
      if (!column) {
        unloaded++;
        continue;
      }
      const columnMinY =
        column.minY ?? bot.game?.minY ?? (bot.registry.version[">="]("1.18") ? -64 : 0);
      for (let y = Math.floor(task.minY / 16) * 16; y <= task.maxY; y += 16) {
        const entry = index?.section(column, x, y, z, ids) || { positions: new Map(), ready: false };
        const section = column.sections?.[(y - columnMinY) / 16];
        const palette = section?.palette || section?.data?.palette;
        const empty = (column.sections && !section) ||
          (section?.solidBlockCount === 0 && !section.fluidCount) ||
          (palette && !palette.some((state) => ids.has(bot.registry.blocksByStateId[state]?.id))) ||
          (Number.isInteger(section?.data?.value) && !ids.has(bot.registry.blocksByStateId[section.data.value]?.id));
        if (!entry.ready) {
          if (!empty) for (let dy = 0; dy < 16; dy++)
            for (let dx = 0; dx < 16; dx++)
              for (let dz = 0; dz < 16; dz++) {
                const position = new Vec3(x * 16 + dx, y + dy, z * 16 + dz);
                const state = column.getBlockStateId(new Vec3(dx, y + dy, dz));
                if (ids.has(bot.registry.blocksByStateId[state]?.id)) entry.positions.set(plan.key(position), position);
                if (++examined % 512 === 0) await yieldControl();
              }
          entry.ready = true;
        }
        for (const position of entry.positions.values()) {
          if (++examined % 512 === 0) await yieldControl();
          if (!plan.insideTask(task, position)) continue;
          const block = bot.blockAt(position);
          if (!block || !ids.has(block.type)) continue;
          remaining++;
          if (allowed(block)) candidates.push(block);
        }
        // Explicit stone/dirt jobs can match entire chunks. Do not retain
        // millions of coordinates; sparse ore sections remain indexed.
        if (entry.positions.size > 1024) {
          entry.positions.clear();
          entry.ready = false;
        }
        if (candidates.length > limit * 2) {
          candidates.sort(
            (a, b) =>
              a.position.distanceTo(bot.entity.position) -
              b.position.distanceTo(bot.entity.position),
          );
          candidates.length = limit;
        }
      }
      await yieldControl();
    }
  }
  candidates.sort(
    (a, b) =>
      a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position),
  );
  return { candidates: candidates.slice(0, limit), remaining, unloaded };
}
module.exports = { scanMine, createMineIndex };
