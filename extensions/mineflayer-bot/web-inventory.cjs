const http = require("node:http");
const { createRequire } = require("node:module");
const dependency = createRequire(require.resolve("mineflayer-web-inventory"));
const express = dependency("express");
const { Server } = dependency("socket.io");

// The npm package's browser bundle is built by its install script. The launcher
// intentionally installs without scripts; this small client uses the plugin's
// actual window protocol and does not depend on a missing bundle.
const PAGE = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Инвентарь бота</title>
<style>body{font:16px system-ui;background:#181c22;color:#eee;margin:24px}h1{font-size:24px}#state{color:#aeb7c6}#slots{display:grid;grid-template-columns:repeat(9,minmax(40px,76px));gap:6px;max-width:730px}.slot{min-height:64px;background:#2b323e;border:1px solid #465164;border-radius:6px;position:relative;display:grid;place-items:center}.slot img{width:40px;height:40px;image-rendering:pixelated}.slot b{position:absolute;right:4px;bottom:2px;text-shadow:1px 1px #000}.slot small{position:absolute;top:2px;left:4px;color:#8995a9;font-size:10px}#items{max-width:730px;line-height:1.8}.note{color:#aeb7c6;font-size:14px}@media(max-width:500px){body{margin:12px}.slot{min-height:44px}.slot img{width:28px;height:28px}}</style>
<h1>Инвентарь бота</h1><p id="state">Подключение…</p><p class="note">Предметы обновляются в реальном времени. Для передачи добычи нажмите «Принести мне добычу» во вкладке «Выживание».</p><div id="slots"></div><ul id="items"></ul>
<script src="/socket.io/socket.io.js"></script><script>
const socket=io();let current={slots:{}};const state=document.getElementById('state'),slots=document.getElementById('slots'),items=document.getElementById('items');
function render(){slots.replaceChildren();items.replaceChildren();const entries=Object.entries(current.slots);for(const [index,item] of entries){const cell=document.createElement('div');cell.className='slot';const number=document.createElement('small');number.textContent=index;cell.append(number);if(item){cell.title=(item.displayName||item.name)+' × '+item.count;const img=document.createElement('img');img.src=item.texture;img.alt=item.name;cell.append(img);const count=document.createElement('b');count.textContent=item.count;cell.append(count);const line=document.createElement('li');line.textContent=cell.title;items.append(line);}slots.append(cell);}state.textContent=(current.type==='inventory'?'Инвентарь':'Открытый контейнер')+' · занято '+entries.filter(([,item])=>item).length+' слотов';}
socket.on('window',value=>{current=value;render()});socket.on('windowUpdate',value=>{if(value.id!==current.id)return;Object.assign(current.slots,value.slots);render()});socket.on('disconnect',()=>{state.textContent='Бот отключён. Перезапустите его в лаунчере.'});socket.on('connect_error',()=>{state.textContent='Нет соединения с ботом'});
</script></html>`;
const FALLBACK =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#52637b"/><text x="20" y="28" text-anchor="middle" fill="white" font-size="28">?</text></svg>',
  ).toString("base64");

// Upstream assumes a texture exists for every item. Modern 26.1 items may be
// missing in minecraft-assets; clone snapshots and provide a fallback icon.
const utils = dependency("./utils");
utils.addItemData = (data, assets, item) => {
  if (!item) return null;
  const value = { ...item, durabilityUsed: item.durabilityUsed };
  value.texture = item.texture || assets.textureContent?.[item.name]?.texture || FALLBACK;
  const max = data.itemsByName[item.name]?.maxDurability;
  if (max && value.durabilityUsed != null)
    value.durabilityLeft = (max - value.durabilityUsed) / max;
  return value;
};
const inventoryViewer = require("mineflayer-web-inventory");

async function startWebInventory(bot, { onReady = () => {}, onError = () => {} } = {}) {
  const app = express();
  app.get("/", (_request, response) => response.type("html").send(PAGE));
  const server = http.createServer(app);
  const io = new Server(server);
  const listen = server.listen.bind(server);
  server.listen = (port, callback) => listen(port, "127.0.0.1", callback);
  const endListeners = new Set(bot.listeners("end"));
  const connections = new Set();
  let closed = false;
  // Upstream's disconnect cleanup misses its anonymous updateSlot listener.
  // Capture only listeners introduced by that connection and remove them.
  io.prependListener("connection", (socket) => {
    connections.add(socket);
    const before = new Set(bot.inventory.listeners("updateSlot"));
    socket.once("disconnect", () => {
      connections.delete(socket);
      for (const listener of introduced) bot.inventory.off("updateSlot", listener);
    });
    let introduced = [];
    queueMicrotask(() => {
      introduced = bot.inventory
        .listeners("updateSlot")
        .filter((listener) => !before.has(listener));
    });
  });
  inventoryViewer(bot, { app, http: server, io, port: 0, startOnLoad: false });
  for (const listener of bot.listeners("end"))
    if (!endListeners.has(listener)) bot.off("end", listener);
  async function stop() {
    if (closed) return;
    closed = true;
    for (const socket of connections) socket.disconnect(true);
    await new Promise((resolve) => io.close(resolve));
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    bot.webInventory.isRunning = false;
    bot.off("end", stop);
    onReady(null);
  }
  bot.once("end", stop);
  try {
    await Promise.race([
      bot.webInventory.start(),
      new Promise((_, reject) => server.once("error", reject)),
    ]);
    if (closed) return { stop, url: null };
    const url = `http://127.0.0.1:${server.address().port}/`;
    onReady(url);
    return { url, stop };
  } catch (error) {
    await stop();
    onError(error);
    return { url: null, stop };
  }
}
module.exports = { startWebInventory, PAGE };
