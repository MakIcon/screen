// mineflayer-fabric 0.2.1 (Apache-2.0). Source: vendor/mineflayer-fabric; see FABRIC-LICENSE and FABRIC-NOTICE.
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// vendor/mineflayer-fabric/src/binary.js
var require_binary = __commonJS({
  "vendor/mineflayer-fabric/src/binary.js"(exports2, module2) {
    "use strict";
    var utf8 = new TextDecoder("utf-8", { fatal: true });
    var lenientUtf8 = new TextDecoder("utf-8");
    var FabricProtocolError = class extends Error {
      constructor(code, message, options) {
        super(message, options);
        this.name = "FabricProtocolError";
        this.code = code;
      }
    };
    function check(condition, message, code = "FABRIC_INVALID_PACKET") {
      if (!condition) throw new FabricProtocolError(code, message);
    }
    var Reader = class {
      constructor(buffer) {
        check(Buffer.isBuffer(buffer), "Expected a Buffer");
        this.buffer = buffer;
        this.offset = 0;
      }
      get remaining() {
        return this.buffer.length - this.offset;
      }
      byte() {
        check(this.offset < this.buffer.length, "Truncated packet");
        return this.buffer[this.offset++];
      }
      bytes(length) {
        check(Number.isSafeInteger(length) && length >= 0 && length <= this.remaining, "Truncated packet");
        const value = this.buffer.subarray(this.offset, this.offset + length);
        this.offset += length;
        return value;
      }
      short() {
        return this.bytes(2).readInt16BE(0);
      }
      ushort() {
        return this.bytes(2).readUInt16BE(0);
      }
      int() {
        return this.bytes(4).readInt32BE(0);
      }
      varint() {
        let value = 0;
        for (let i = 0; i < 5; i++) {
          const byte = this.byte();
          check(i !== 4 || (byte & 240) === 0, "VarInt exceeds 32 bits");
          value |= (byte & 127) << i * 7;
          if (!(byte & 128)) return value;
        }
        throw new FabricProtocolError("FABRIC_INVALID_PACKET", "VarInt exceeds five bytes");
      }
      count(max = 1e6) {
        const value = this.varint();
        check(value >= 0 && value <= max, "Invalid or excessive collection length");
        return value;
      }
      string(max = 32767) {
        const length = this.count(max * 3);
        check(this.offset + length <= this.buffer.length, "Truncated UTF-8 string");
        const value = utf8.decode(this.buffer.subarray(this.offset, this.offset + length));
        this.offset += length;
        check(value.length <= max, "String exceeds character limit");
        return value;
      }
      end() {
        check(this.offset === this.buffer.length, "Unexpected trailing bytes");
      }
    };
    function varint(value) {
      check(Number.isInteger(value) && value >= -2147483648 && value <= 2147483647, "Invalid VarInt");
      let n = value >>> 0;
      const bytes = [];
      do {
        let byte = n & 127;
        n >>>= 7;
        if (n) byte |= 128;
        bytes.push(byte);
      } while (n);
      return Buffer.from(bytes);
    }
    function string(value) {
      check(typeof value === "string" && value.length <= 32767, "Invalid string");
      const bytes = Buffer.from(value, "utf8");
      return Buffer.concat([varint(bytes.length), bytes]);
    }
    var IDENTIFIER = /^[a-z0-9_.-]+:[a-z0-9/._-]+$/;
    function isIdentifier(value) {
      return typeof value === "string" && value.length <= 32767 && IDENTIFIER.test(value);
    }
    function identifier(value) {
      check(isIdentifier(value), "Invalid identifier: " + value);
      return value;
    }
    function decodeChannels(buffer, { limit = 4096, legacy = false } = {}) {
      const channels = /* @__PURE__ */ new Set();
      let ignored = 0;
      for (const name of lenientUtf8.decode(buffer).split("\0")) {
        if (!name) continue;
        const valid = legacy ? name.length <= 256 && !/[\x00-\x1f]/.test(name) : isIdentifier(name);
        if (valid && channels.size < limit) channels.add(name);
        else ignored++;
      }
      return { channels, ignored };
    }
    function encodeChannels(values) {
      const channels = [...new Set(values)].map(identifier);
      check(channels.length <= 1024, "Too many plugin channels");
      const bytes = Buffer.from(channels.join("\0"), "utf8");
      check(bytes.length <= 32767, "Registration packet too large");
      return bytes;
    }
    function decodeVersions(buffer) {
      const reader = new Reader(buffer);
      const values = Array.from({ length: reader.count(64) }, () => reader.varint());
      reader.end();
      return values;
    }
    function encodeVersions(values) {
      return Buffer.concat([varint(values.length), ...values.map(varint)]);
    }
    function decodeCommonRegister(buffer) {
      const reader = new Reader(buffer);
      const version = reader.varint();
      const protocol = reader.string(32);
      check(protocol === "configuration" || protocol === "play", "Unsupported common register phase");
      const channels = /* @__PURE__ */ new Set();
      const count = reader.count(4096);
      for (let i = 0; i < count; i++) {
        const name = reader.string();
        if (isIdentifier(name)) channels.add(name);
      }
      reader.end();
      return { version, protocol, channels };
    }
    function encodeCommonRegister({ version = 1, protocol, channels }) {
      check(protocol === "configuration" || protocol === "play", "Unsupported common register phase");
      const ids = [...new Set(channels)].map(identifier);
      check(ids.length <= 1024, "Too many plugin channels");
      return Buffer.concat([varint(version), string(protocol), varint(ids.length), ...ids.map(string)]);
    }
    function decodeIdentifierList(buffer) {
      const reader = new Reader(buffer);
      const values = /* @__PURE__ */ new Set();
      const count = reader.count(65536);
      for (let i = 0; i < count; i++) {
        const name = reader.string();
        if (isIdentifier(name)) values.add(name);
      }
      reader.end();
      return values;
    }
    function encodeIdentifierList(values) {
      const ids = [...new Set(values)].map(identifier);
      return Buffer.concat([varint(ids.length), ...ids.map(string)]);
    }
    function readNbt(buffer, { named = true, maxDepth = 64 } = {}) {
      const reader = new Reader(buffer);
      const type = reader.byte();
      if (type === 0) return { value: null, size: reader.offset };
      check(type === 10, "NBT root is not a compound");
      if (named) reader.bytes(reader.ushort());
      const value = nbtPayload(reader, 10, 0, maxDepth);
      return { value, size: reader.offset };
    }
    function nbtPayload(reader, type, depth, maxDepth) {
      check(depth <= maxDepth, "NBT nesting too deep");
      switch (type) {
        case 1:
          return reader.bytes(1).readInt8(0);
        case 2:
          return reader.short();
        case 3:
          return reader.int();
        case 4:
          return reader.bytes(8).readBigInt64BE(0);
        case 5:
          return reader.bytes(4).readFloatBE(0);
        case 6:
          return reader.bytes(8).readDoubleBE(0);
        case 7:
          return Buffer.from(reader.bytes(nbtLength(reader, 1)));
        case 8:
          return lenientUtf8.decode(reader.bytes(reader.ushort()));
        case 9: {
          const itemType = reader.byte();
          const length = nbtLength(reader, itemType === 0 ? 0 : 1);
          check(itemType !== 0 || length === 0, "NBT list of TAG_End is not empty");
          return Array.from({ length }, () => nbtPayload(reader, itemType, depth + 1, maxDepth));
        }
        case 10: {
          const compound = /* @__PURE__ */ Object.create(null);
          for (; ; ) {
            const childType = reader.byte();
            if (childType === 0) return compound;
            const name = lenientUtf8.decode(reader.bytes(reader.ushort()));
            compound[name] = nbtPayload(reader, childType, depth + 1, maxDepth);
          }
        }
        case 11:
          return Array.from({ length: nbtLength(reader, 4) }, () => reader.int());
        case 12:
          return Array.from({ length: nbtLength(reader, 8) }, () => reader.bytes(8).readBigInt64BE(0));
        default:
          throw new FabricProtocolError("FABRIC_INVALID_PACKET", "Unknown NBT tag type " + type);
      }
    }
    function nbtLength(reader, minBytes) {
      const length = reader.int();
      check(length >= 0 && length * minBytes <= reader.remaining, "Invalid NBT array length");
      return length;
    }
    module2.exports = {
      FabricProtocolError,
      check,
      Reader,
      varint,
      string,
      isIdentifier,
      identifier,
      decodeChannels,
      encodeChannels,
      decodeVersions,
      encodeVersions,
      decodeCommonRegister,
      encodeCommonRegister,
      decodeIdentifierList,
      encodeIdentifierList,
      readNbt
    };
  }
});

// vendor/mineflayer-fabric/src/registry.js
var require_registry = __commonJS({
  "vendor/mineflayer-fabric/src/registry.js"(exports2, module2) {
    "use strict";
    var { Reader, check, identifier, isIdentifier, readNbt, FabricProtocolError } = require_binary();
    function decodeBinary(buffer, maxEntries, withAttributes, allowTrailing) {
      const reader = new Reader(buffer);
      const registries = /* @__PURE__ */ new Map();
      let entryCount = 0;
      const registryGroups = reader.count(4096);
      check(registryGroups > 0, "Empty registry sync");
      for (let i = 0; i < registryGroups; i++) {
        const namespace = reader.string() || "minecraft";
        const registryCount = reader.count(4096);
        check(registryCount > 0 && registries.size + registryCount <= 4096, "Empty or excessive registry group");
        for (let j = 0; j < registryCount; j++) {
          const name = identifier(namespace + ":" + reader.string());
          check(!registries.has(name), "Duplicate registry: " + name);
          let attributes = 0;
          if (withAttributes) {
            attributes = reader.byte();
            check((attributes & ~1) === 0, "Unsupported registry attribute flags");
          }
          const entries = /* @__PURE__ */ new Map();
          const byId = /* @__PURE__ */ new Map();
          let lastId = 0;
          const groups = reader.count(maxEntries);
          check(groups > 0, "Empty registry " + name);
          for (let k = 0; k < groups; k++) {
            const entryNamespace = reader.string() || "minecraft";
            const runs = reader.count(maxEntries);
            check(runs > 0, "Empty namespace group in " + name);
            for (let l = 0; l < runs; l++) {
              const delta = reader.varint();
              const size = reader.count(maxEntries);
              check(size > 0 && entryCount + size <= maxEntries, "Registry entry limit exceeded or empty ID run");
              const start = lastId + delta;
              check(start >= 0 && start + size - 1 <= 2147483647, "Registry ID out of range");
              for (let m = 0; m < size; m++) {
                const entryName = identifier(entryNamespace + ":" + reader.string());
                const id = start + m;
                check(!entries.has(entryName) && !byId.has(id), "Duplicate registry name or ID in " + name);
                entries.set(entryName, id);
                byId.set(id, entryName);
              }
              entryCount += size;
              lastId = start + size - 1;
            }
          }
          registries.set(name, { optional: Boolean(attributes & 1), entries, byId });
        }
      }
      if (!allowTrailing) reader.end();
      return { registries, entryCount, format: withAttributes ? "binary+attributes" : "binary", trailingBytes: reader.remaining };
    }
    function entryLimit(options) {
      const maxEntries = options.maxEntries ?? 1e6;
      check(Number.isSafeInteger(maxEntries) && maxEntries > 0, "Invalid registry entry limit");
      return maxEntries;
    }
    function decodeRegistrySync(buffer, options = {}) {
      const maxEntries = entryLimit(options);
      const allowTrailing = Boolean(options.allowTrailing);
      const mode = options.attributes ?? "auto";
      if (mode !== "auto") return decodeBinary(buffer, maxEntries, Boolean(mode), allowTrailing);
      const order = options.preferAttributes === false ? [false, true] : [true, false];
      let first;
      for (const withAttributes of order) {
        try {
          return decodeBinary(buffer, maxEntries, withAttributes, allowTrailing);
        } catch (error) {
          if (!(error instanceof FabricProtocolError)) throw error;
          first ??= error;
        }
      }
      throw first;
    }
    function decodeNbtRegistrySync(buffer, options = {}) {
      const maxEntries = entryLimit(options);
      const { value } = readNbt(buffer);
      check(value && typeof value === "object", "Registry NBT is empty");
      const version = value.version ?? 1;
      check(version === 1, "Unsupported legacy registry sync version " + version, "FABRIC_UNSUPPORTED_VERSION");
      const root = value.registries;
      check(root && typeof root === "object" && !Array.isArray(root), "Registry NBT has no registries compound");
      const registries = /* @__PURE__ */ new Map();
      let entryCount = 0;
      for (const [rawName, table] of Object.entries(root)) {
        const name = normalizeIdentifier(rawName);
        check(table && typeof table === "object" && !Array.isArray(table), "Invalid registry table " + name);
        check(!registries.has(name) && registries.size < 4096, "Duplicate or excessive registry " + name);
        const entries = /* @__PURE__ */ new Map();
        const byId = /* @__PURE__ */ new Map();
        for (const [rawEntry, id] of Object.entries(table)) {
          const entryName = normalizeIdentifier(rawEntry);
          check(Number.isInteger(id) && id >= 0, "Invalid raw ID for " + entryName);
          check(!entries.has(entryName) && !byId.has(id), "Duplicate registry name or ID in " + name);
          check(++entryCount <= maxEntries, "Registry entry limit exceeded");
          entries.set(entryName, id);
          byId.set(id, entryName);
        }
        registries.set(name, { optional: false, entries, byId });
      }
      return { registries, entryCount, format: "nbt" };
    }
    function normalizeIdentifier(value) {
      const name = value.includes(":") ? value : "minecraft:" + value;
      check(isIdentifier(name), "Invalid identifier: " + value);
      return name;
    }
    function registrySnapshot(sync) {
      return {
        format: "fabric-registry-sync",
        source: sync.format ?? "binary+attributes",
        entryCount: sync.entryCount,
        registries: Object.fromEntries([...sync.registries].map(([name, table]) => [
          name,
          { optional: table.optional, entries: Object.fromEntries(table.entries) }
        ]))
      };
    }
    module2.exports = { decodeRegistrySync, decodeNbtRegistrySync, registrySnapshot };
  }
});

// vendor/mineflayer-fabric/src/protocol.js
var require_protocol = __commonJS({
  "vendor/mineflayer-fabric/src/protocol.js"(exports2, module2) {
    "use strict";
    var { dirname } = require("node:path");
    function mineflayerProtocolPath() {
      return require.resolve("minecraft-protocol", { paths: [dirname(require.resolve("mineflayer"))] });
    }
    function protocolPath(preferMineflayer) {
      if (preferMineflayer) return mineflayerProtocolPath();
      try {
        return require.resolve("minecraft-protocol");
      } catch (error) {
        if (error.code !== "MODULE_NOT_FOUND") throw error;
        return mineflayerProtocolPath();
      }
    }
    function loadProtocol(preferMineflayer = false) {
      return require(protocolPath(preferMineflayer));
    }
    function loadMinecraftData(preferMineflayer = false) {
      return require(require.resolve("minecraft-data", { paths: [dirname(protocolPath(preferMineflayer))] }));
    }
    function protocolVersionOf(client, preferMineflayer = false) {
      if (typeof client.version !== "string") return void 0;
      try {
        return loadMinecraftData(preferMineflayer)(client.version)?.version?.version;
      } catch {
        return void 0;
      }
    }
    module2.exports = { loadProtocol, loadMinecraftData, protocolVersionOf };
  }
});

// vendor/mineflayer-fabric/src/handshake.js
var require_handshake = __commonJS({
  "vendor/mineflayer-fabric/src/handshake.js"(exports2, module2) {
    "use strict";
    var { EventEmitter } = require("node:events");
    var {
      FabricProtocolError,
      check,
      Reader,
      string,
      identifier,
      decodeChannels,
      encodeChannels,
      decodeVersions,
      encodeVersions,
      decodeCommonRegister,
      encodeCommonRegister,
      decodeIdentifierList,
      encodeIdentifierList
    } = require_binary();
    var { decodeRegistrySync, decodeNbtRegistrySync, registrySnapshot } = require_registry();
    var { loadProtocol, protocolVersionOf } = require_protocol();
    var CHANNELS = Object.freeze({
      register: "minecraft:register",
      unregister: "minecraft:unregister",
      brand: "minecraft:brand",
      version: "c:version",
      commonRegister: "c:register",
      // Binary payload in CONFIGURATION (Fabric API for 1.21.11+),
      // NBT payload in PLAY (Fabric API for 1.14 - 1.19.4).
      registry: "fabric:registry/sync",
      // Chunked binary payload terminated by an empty message: PLAY for
      // 1.17 - 1.20.1, CONFIGURATION for 1.20.2 - 1.21.10.
      registryDirect: "fabric:registry/sync/direct",
      complete: "fabric:registry/sync/complete",
      split: "fabric:split",
      // Login query used by Fabric API for 1.14 - 1.20.1 to learn client channels.
      earlyRegistration: "fabric-networking-api-v1:early_registration"
    });
    var LEGACY_REGISTER = "REGISTER";
    var LEGACY_UNREGISTER = "UNREGISTER";
    var RESERVED = /* @__PURE__ */ new Set([...Object.values(CHANNELS), LEGACY_REGISTER, LEGACY_UNREGISTER]);
    var MAX_SERVER_CHANNELS = 4096;
    var ATTRIBUTES_PROTOCOL = 769;
    var attached = /* @__PURE__ */ new WeakMap();
    function isFabricChannel(name) {
      return name.startsWith("fabric:") || name.startsWith("fabric-");
    }
    var FabricConnection = class extends EventEmitter {
      constructor(client, options = {}) {
        super();
        check(
          client && typeof client.prependListener === "function" && typeof client.write === "function",
          "fabricHandshake requires a minecraft-protocol client",
          "FABRIC_BAD_OPTIONS"
        );
        this.client = client;
        this._loadProtocol = loadProtocol;
        this._preferMineflayer = false;
        this.options = {
          brand: "mineflayer-fabric",
          timeout: 3e4,
          maxPayloadBytes: 16 * 1024 * 1024,
          maxRegistryEntries: 1e6,
          handleConfigurationPing: true,
          earlyRegistration: true,
          announce: "auto",
          ...options
        };
        check(
          Number.isSafeInteger(this.options.timeout) && this.options.timeout >= 0,
          "timeout must be a non-negative integer (0 disables it)",
          "FABRIC_BAD_OPTIONS"
        );
        for (const key of ["maxPayloadBytes", "maxRegistryEntries"]) {
          check(
            Number.isSafeInteger(this.options[key]) && this.options[key] > 0,
            key + " must be a positive integer",
            "FABRIC_BAD_OPTIONS"
          );
        }
        check(
          typeof this.options.brand === "string" && this.options.brand.length <= 32767,
          "Invalid client brand",
          "FABRIC_BAD_OPTIONS"
        );
        check(
          ["auto", "always"].includes(this.options.announce),
          'announce must be "auto" or "always"',
          "FABRIC_BAD_OPTIONS"
        );
        this.handlers = { configuration: /* @__PURE__ */ new Map(), play: /* @__PURE__ */ new Map() };
        for (const phase of ["configuration", "play"]) {
          for (const [name, handler] of Object.entries(options.handlers?.[phase] || {})) {
            identifier(name);
            check(
              !RESERVED.has(name) && typeof handler === "function",
              "Invalid or reserved payload handler: " + name,
              "FABRIC_BAD_OPTIONS"
            );
            this.handlers[phase].set(name, handler);
          }
        }
        this.detected = false;
        this.disposed = false;
        this.failed = false;
        this.era = null;
        this.generation = 0;
        this.registry = { registries: /* @__PURE__ */ new Map(), entryCount: 0 };
        this.serverChannels = { configuration: /* @__PURE__ */ new Set(), play: /* @__PURE__ */ new Set() };
        this._listeners = [];
        this._reset();
        this._listen("custom_payload", (packet, meta) => {
          try {
            this._payload(packet, meta);
          } catch (error) {
            this._fail(error);
          }
        }, true);
        this._listen("state", (state) => {
          try {
            this._state(state);
          } catch (error) {
            this._fail(error);
          }
        }, true);
        this._listen("packet", (packet, metadata) => {
          if (this._split && !this.failed && !this.disposed && (metadata.state !== this._split.phase || metadata.name !== "custom_payload" || packet.channel !== CHANNELS.split)) {
            this._fail(new FabricProtocolError("FABRIC_INVALID_PACKET", "A packet interrupted fabric:split"));
          }
        }, true);
        this._listen("ping", (packet) => {
          if (this.options.handleConfigurationPing && !this.failed && !this.disposed && client.state === "configuration") {
            try {
              check(!this._split, "Ping interrupted a split payload");
              client.write("pong", { id: packet.id });
            } catch (error) {
              this._fail(error);
            }
          }
        });
        this._listen("end", () => this.dispose());
        if (this.options.earlyRegistration) this._hookLoginQueries();
        if (client.state === "configuration") this._state("configuration");
      }
      get protocolVersion() {
        return protocolVersionOf(this.client, this._preferMineflayer);
      }
      _listen(name, listener, prepend = false) {
        this.client[prepend ? "prependListener" : "on"](name, listener);
        this._listeners.push([name, listener]);
      }
      // minecraft-protocol answers every login query with "not understood". Keep
      // that behaviour for foreign channels and answer only Fabric's query. The
      // wrapper keeps the original function name, so minecraft-protocol-forge can
      // still find and replace it.
      _hookLoginQueries() {
        const client = this.client;
        const original = client.listeners("login_plugin_request").find((fn) => fn.name === "onLoginPluginRequest");
        const connection = this;
        const wrapper = function onLoginPluginRequest(packet) {
          if (packet?.channel === CHANNELS.earlyRegistration && !connection.failed && !connection.disposed) {
            try {
              connection._earlyRegistration(packet);
            } catch (error) {
              connection._fail(error);
            }
            return;
          }
          if (original) return original.apply(this, arguments);
        };
        if (original) client.removeListener("login_plugin_request", original);
        client.on("login_plugin_request", wrapper);
        this._loginHook = { wrapper, original };
      }
      _unhookLoginQueries() {
        const hook = this._loginHook;
        if (!hook) return;
        this._loginHook = null;
        const listeners = this.client.listeners("login_plugin_request");
        if (!listeners.includes(hook.wrapper)) return;
        this.client.removeListener("login_plugin_request", hook.wrapper);
        if (hook.original) this.client.on("login_plugin_request", hook.original);
      }
      _earlyRegistration(packet) {
        const data = packet.data ?? Buffer.alloc(0);
        check(Buffer.isBuffer(data) && data.length <= this.options.maxPayloadBytes, "Invalid early registration query");
        for (const name of decodeIdentifierList(data)) {
          if (this.serverChannels.play.size < MAX_SERVER_CHANNELS) this.serverChannels.play.add(name);
        }
        this.detected = true;
        this.era ??= "play";
        const channels = this._channels("play");
        this.client.write("login_plugin_response", { messageId: packet.messageId, data: encodeIdentifierList(channels) });
        this.emit("registered", channels, "login");
        this.emit("channels", { phase: "play", channels: new Set(this.serverChannels.play) });
      }
      _reset() {
        clearTimeout(this._timer);
        this._timer = null;
        this._registered = false;
        this._playRegistered = false;
        this._split = null;
        this._direct = null;
        this._syncPending = false;
        this.synced = false;
        this.commonVersion = null;
      }
      _state(state) {
        if (this.failed || this.disposed) return;
        if (state === "configuration") {
          check(!this._split && !this._direct && !this._syncPending, "Configuration interrupted an unfinished Fabric exchange");
          this.generation++;
          this._reset();
          this.detected = false;
          this.era = "configuration";
          this.registry = { registries: /* @__PURE__ */ new Map(), entryCount: 0 };
          this.serverChannels = { configuration: /* @__PURE__ */ new Set(), play: /* @__PURE__ */ new Set() };
          this.emit("configuration", { generation: this.generation });
        } else if (state === "play") {
          check(
            !this._split && !this._direct && !this._syncPending,
            "Server entered PLAY before registry synchronization completed"
          );
          clearTimeout(this._timer);
          this._timer = null;
          this.emit("ready", { detected: this.detected, synced: this.synced, era: this.era });
        }
      }
      _channels(phase) {
        const base = phase === "configuration" ? [CHANNELS.registry, CHANNELS.registryDirect, CHANNELS.version, CHANNELS.commonRegister] : [CHANNELS.registryDirect, CHANNELS.registry];
        return [...base, ...this.handlers[phase].keys()];
      }
      // Never reveal Fabric channels to a server that did not show Fabric itself:
      // anti-cheat plugins of ordinary servers may kick such clients.
      _shouldAnnounce(phase) {
        if (this.options.announce === "always" || this.detected) return true;
        for (const name of this.handlers[phase].keys()) {
          if (this.serverChannels[phase].has(name)) return true;
        }
        return false;
      }
      _armTimeout() {
        if (this._timer || !this.options.timeout) return;
        this._timer = setTimeout(() => this._fail(new FabricProtocolError(
          "FABRIC_TIMEOUT",
          "Fabric exchange did not complete within " + this.options.timeout + " ms" + this._waitingHint()
        )), this.options.timeout);
        this._timer.unref?.();
      }
      _waitingHint() {
        const foreign = [...this.serverChannels.configuration].filter((name) => !name.startsWith("minecraft:") && !name.startsWith("c:") && !isFabricChannel(name));
        return foreign.length ? ". The server also registered mod channels that may expect a client reply: " + foreign.slice(0, 8).join(", ") : "";
      }
      _register() {
        if (this._registered) return;
        this._registered = true;
        if (this.detected && this.client.state === "configuration") this._armTimeout();
        this.send(CHANNELS.brand, string(this.options.brand));
        this.send(CHANNELS.register, encodeChannels(this._channels("configuration")));
        this.emit("registered", this._channels("configuration"), "configuration");
      }
      _payload(packet, metadata) {
        if (this.failed || this.disposed) return;
        const phase = metadata?.state || this.client.state;
        if (phase !== "configuration" && phase !== "play") return;
        const channel = packet.channel;
        const data = packet.data;
        check(Buffer.isBuffer(data), "Fabric plugin must receive raw custom_payload bytes");
        check(data.length <= this.options.maxPayloadBytes, "Payload exceeds configured size limit");
        if (this._split) check(channel === CHANNELS.split, "A different payload interrupted fabric:split");
        if (channel === CHANNELS.split) return this._receiveSplit(data, phase);
        if (channel === CHANNELS.register || channel === CHANNELS.unregister || channel === LEGACY_REGISTER || channel === LEGACY_UNREGISTER) {
          return this._registration(channel, data, phase);
        }
        if (channel === CHANNELS.version) {
          if (phase !== "configuration") return;
          check(decodeVersions(data).includes(1), "No supported common networking version", "FABRIC_COMMON_VERSION");
          this.commonVersion = 1;
          this.send(CHANNELS.version, encodeVersions([1]));
          return;
        }
        if (channel === CHANNELS.commonRegister) {
          if (phase !== "configuration") return;
          const registration = decodeCommonRegister(data);
          check(this.commonVersion === 1 && registration.version === 1, "Common version has not been negotiated");
          const known = this.serverChannels[registration.protocol];
          for (const name of registration.channels) if (known.size < MAX_SERVER_CHANNELS) known.add(name);
          this.send(CHANNELS.commonRegister, encodeCommonRegister({
            version: 1,
            protocol: registration.protocol,
            channels: this._channels(registration.protocol)
          }));
          return;
        }
        if (channel === CHANNELS.registry) return this._receiveRegistry(data, phase, channel);
        if (channel === CHANNELS.registryDirect) return this._receiveDirect(data, phase);
        const handler = this.handlers[phase].get(channel);
        if (handler) {
          Promise.resolve().then(() => {
            if (!this.failed && !this.disposed) return handler(data, this);
          }).catch((error) => this._fail(error));
        } else if (!channel.startsWith("minecraft:") && !channel.startsWith("MC|")) {
          this.emit("unhandledPayload", { channel, data, phase });
        }
      }
      _registration(channel, data, phase) {
        const legacy = channel === LEGACY_REGISTER || channel === LEGACY_UNREGISTER;
        const adding = channel === CHANNELS.register || channel === LEGACY_REGISTER;
        const { channels, ignored } = decodeChannels(data, { legacy });
        const known = this.serverChannels[phase];
        for (const name of channels) {
          if (!adding) known.delete(name);
          else if (known.size < MAX_SERVER_CHANNELS) known.add(name);
        }
        if (adding && [...channels].some(isFabricChannel)) {
          this.detected = true;
          this.era ??= phase;
        }
        if (adding && !legacy && this._shouldAnnounce(phase)) {
          if (phase === "configuration") {
            this._register();
          } else if (!this._playRegistered) {
            this._playRegistered = true;
            this.send(CHANNELS.register, encodeChannels(this._channels("play")));
            this.emit("registered", this._channels("play"), "play");
          }
        }
        this.emit("channels", { phase, channels: new Set(known), ignored });
      }
      _preferAttributes(phase, channel) {
        if (channel === CHANNELS.registry) return true;
        if (phase === "play") return false;
        const protocol = this.protocolVersion;
        return protocol === void 0 || protocol >= ATTRIBUTES_PROTOCOL;
      }
      _decodeRegistry(data, phase, channel) {
        if (phase === "play" && channel === CHANNELS.registry) {
          return decodeNbtRegistrySync(data, { maxEntries: this.options.maxRegistryEntries });
        }
        return decodeRegistrySync(data, {
          maxEntries: this.options.maxRegistryEntries,
          preferAttributes: this._preferAttributes(phase, channel),
          allowTrailing: channel === CHANNELS.registryDirect
        });
      }
      _receiveRegistry(data, phase, channel, decoded = null) {
        let sync = decoded;
        try {
          sync ??= this._decodeRegistry(data, phase, channel);
        } catch (error) {
          if (phase === "play" && error instanceof FabricProtocolError) {
            this._settleTimer();
            this.emit("warning", { code: "FABRIC_REGISTRY_DECODE_FAILED", message: "Ignored " + channel + ": " + error.message });
            return;
          }
          throw error;
        }
        this._acceptRegistry(sync, phase, channel);
      }
      _receiveDirect(data, phase) {
        if (!this._direct) {
          if (data.length === 0) return;
          this._direct = { phase, parts: [], size: 0 };
          this._armTimeout();
        }
        const direct = this._direct;
        check(direct.phase === phase, "fabric:registry/sync/direct crossed a protocol phase");
        if (data.length) {
          if (direct.parts.length === 1 && !direct.decoded) {
            try {
              direct.decoded = this._decodeRegistry(direct.parts[0], phase, CHANNELS.registryDirect);
            } catch (error) {
              if (!(error instanceof FabricProtocolError)) throw error;
            }
          }
          if (direct.decoded) return;
          check(direct.size + data.length <= this.options.maxPayloadBytes, "Registry sync exceeds configured size limit");
          direct.parts.push(data);
          direct.size += data.length;
          return;
        }
        this._direct = null;
        this._receiveRegistry(Buffer.concat(direct.parts, direct.size), phase, CHANNELS.registryDirect, direct.decoded);
      }
      _acceptRegistry(sync, phase, channel) {
        check(!this._syncPending && !this.synced, "Duplicate registry synchronization");
        check(phase === "play" || this.client.state === "configuration", "Unexpected registry sync");
        this.detected = true;
        this.era = phase;
        const generation = this.generation;
        sync.channel = channel;
        sync.phase = phase;
        this._syncPending = true;
        this._armTimeout();
        Promise.resolve().then(() => this.options.onRegistry?.(sync, this)).then(() => {
          if (this.failed || this.disposed || generation !== this.generation) return;
          if (phase === "configuration") {
            check(this.client.state === "configuration", "Registry sync completed outside configuration");
          }
          this.registry = sync;
          this._syncPending = false;
          this.synced = true;
          this.emit("registry", sync);
          if (this.failed || this.disposed) return;
          if (phase === "configuration") this.send(CHANNELS.complete, Buffer.alloc(0));
          this._settleTimer();
          this.emit("synced", sync);
        }).catch((error) => this._fail(error));
      }
      // CONFIGURATION keeps one deadline until PLAY. In PLAY the deadline only
      // covers an unfinished split, chunked registry or pending adapter.
      _settleTimer() {
        if (this.client.state === "configuration" || this._split || this._direct || this._syncPending) return;
        clearTimeout(this._timer);
        this._timer = null;
      }
      _receiveSplit(data, phase) {
        if (!this._split) {
          const reader2 = new Reader(data);
          const size = reader2.count(this.options.maxPayloadBytes);
          check(size > 0, "Empty split packet");
          this._split = { size, received: 0, parts: [], phase };
          data = data.subarray(reader2.offset);
          this._armTimeout();
        }
        const split = this._split;
        check(split.phase === phase && data.length > 0, "Invalid split continuation");
        check(split.received + data.length <= split.size, "Split payload exceeds declared size");
        split.parts.push(data);
        split.received += data.length;
        if (split.received !== split.size) return;
        this._split = null;
        this._settleTimer();
        const reader = new Reader(Buffer.concat(split.parts, split.size));
        const packetId = reader.varint();
        const expectedId = customPayloadPacketId(this.client, phase, this._loadProtocol());
        check(packetId === expectedId, "Split packet is not a custom_payload");
        const channel = identifier(reader.string());
        check(channel !== CHANNELS.split, "Nested fabric:split payload");
        this._payload({ channel, data: reader.buffer.subarray(reader.offset) }, { state: phase });
      }
      send(channel, data) {
        check(!this.disposed && !this.failed, "Fabric connection is closed", "FABRIC_CLOSED");
        identifier(channel);
        check(Buffer.isBuffer(data), "Payload must be a Buffer");
        check(["configuration", "play"].includes(this.client.state), "Cannot send payload in this protocol state");
        check(data.length <= 32767, "Outgoing custom payload exceeds vanilla client limit");
        this.client.write("custom_payload", { channel, data });
      }
      snapshot() {
        return registrySnapshot(this.registry);
      }
      _fail(cause) {
        if (this.failed || this.disposed) return;
        const error = cause instanceof FabricProtocolError ? cause : new FabricProtocolError("FABRIC_HANDLER_ERROR", cause?.message || String(cause), { cause });
        this.failed = true;
        clearTimeout(this._timer);
        this._timer = null;
        this._split = null;
        this._direct = null;
        this._syncPending = false;
        this.emit("failure", error);
        this.client.end(error.code + ": " + error.message);
        this.client.emit("error", error);
      }
      dispose() {
        if (this.disposed) return;
        this.disposed = true;
        clearTimeout(this._timer);
        this._timer = null;
        this._split = null;
        this._direct = null;
        this.generation++;
        for (const [name, listener] of this._listeners) this.client.removeListener(name, listener);
        this._listeners = [];
        this._unhookLoginQueries();
        attached.delete(this.client);
        this.emit("disposed");
      }
    };
    function customPayloadPacketId(client, phase, protocol) {
      const serializer = protocol.createSerializer({ state: phase, isServer: true, version: client.version, customPackets: client.customPackets });
      const bytes = serializer.createPacketBuffer({ name: "custom_payload", params: { channel: CHANNELS.registry, data: Buffer.alloc(0) } });
      const id = new Reader(bytes).varint();
      serializer.destroy();
      return id;
    }
    function fabricHandshake(client, options) {
      if (attached.has(client)) return attached.get(client);
      const connection = new FabricConnection(client, options);
      attached.set(client, connection);
      return connection;
    }
    module2.exports = { fabricHandshake, FabricConnection, CHANNELS };
  }
});

// vendor/mineflayer-fabric/src/adapter.js
var require_adapter = __commonJS({
  "vendor/mineflayer-fabric/src/adapter.js"(exports2, module2) {
    "use strict";
    var FULL_CUBE = [[0, 0, 0, 1, 1, 1]];
    var SIMPLE_TABLES = [
      { registry: "minecraft:item", key: "items", byName: "itemsByName", array: "itemsArray", make: (base) => ({ ...base, stackSize: 64 }) },
      {
        registry: "minecraft:entity_type",
        key: "entities",
        byName: "entitiesByName",
        array: "entitiesArray",
        make: (base) => ({ ...base, internalId: base.id, type: "other", category: "Modded", width: 1, height: 1, metadataKeys: [] })
      },
      { registry: "minecraft:mob_effect", key: "effects", byName: "effectsByName", array: "effectsArray", make: (base) => ({ ...base, type: "neutral" }), loose: true },
      { registry: "minecraft:enchantment", key: "enchantments", byName: "enchantmentsByName", array: "enchantmentsArray", make: (base) => ({ ...base, maxLevel: 1, exclude: [] }) },
      { registry: "minecraft:sound_event", key: "sounds", byName: "soundsByName", array: "soundsArray", make: (base) => base },
      { registry: "minecraft:particle_type", key: "particles", byName: "particlesByName", array: "particlesArray", make: (base) => base }
    ];
    function titleCase(identifier) {
      const path = identifier.slice(identifier.indexOf(":") + 1);
      return path.split(/[/_.]/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
    }
    function idOffset(table, resolve) {
      const counts = /* @__PURE__ */ new Map();
      for (const [name, id] of table.entries) {
        const local = resolve(name);
        if (local) counts.set(local.id - id, (counts.get(local.id - id) ?? 0) + 1);
      }
      let offset = 0;
      for (const [value, count] of counts) {
        if (count > (counts.get(offset) ?? 0)) offset = value;
      }
      return offset;
    }
    function looseKey(name) {
      return name.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    function resolver(byName, spec) {
      let loose;
      return (identifier) => {
        const namespace = identifier.slice(0, identifier.indexOf(":"));
        const path = identifier.slice(namespace.length + 1);
        const direct = byName[identifier] ?? (namespace === "minecraft" ? byName[path] : void 0);
        if (direct || namespace !== "minecraft" || !spec.loose) return direct;
        if (!loose) {
          loose = /* @__PURE__ */ new Map();
          for (const entry of Object.values(byName)) loose.set(looseKey(entry.name), entry);
        }
        const key = looseKey(path);
        return loose.get(key) ?? (key === "unluck" ? loose.get("badluck") : void 0);
      };
    }
    var MineflayerAdapter = class {
      constructor(bot, options = {}) {
        this.bot = bot;
        this.modData = options.modData ?? {};
        this.unknownBlock = options.unknownBlock ?? {};
        this.baseline = null;
        this.menus = null;
        this.report = null;
      }
      get registry() {
        return this.bot.registry;
      }
      _save(keys) {
        this.baseline ??= /* @__PURE__ */ new Map();
        for (const key of keys) {
          if (!this.baseline.has(key)) this.baseline.set(key, this.registry[key]);
        }
      }
      _install(key, value) {
        this._save([key]);
        this.registry[key] = value;
      }
      restore() {
        if (this.baseline && this.registry) {
          for (const [key, value] of this.baseline) this.registry[key] = value;
        }
        this.baseline = null;
        this.menus = null;
        this.report = null;
      }
      apply(sync) {
        this.restore();
        const report = { added: {}, remapped: {}, missing: {}, unresolvedBlocks: [], unknownStateFrom: null, namespaces: /* @__PURE__ */ new Set() };
        if (!this.registry) return report;
        for (const table of sync.registries.values()) {
          for (const name of table.entries.keys()) {
            const namespace = name.slice(0, name.indexOf(":"));
            if (namespace !== "minecraft" && namespace !== "brigadier") report.namespaces.add(namespace);
          }
        }
        for (const spec of SIMPLE_TABLES) {
          const table = sync.registries.get(spec.registry);
          if (table && this.registry[spec.key] && this.registry[spec.byName]) this._simple(spec, table, report);
        }
        const blocks = sync.registries.get("minecraft:block");
        if (blocks && this.registry.blocksByStateId && this.registry.supportFeature?.("blockStateId")) {
          this._blocks(blocks, report);
        }
        const menus = sync.registries.get("minecraft:menu");
        if (menus) this.menus = new Map([...menus.entries].map(([name, id]) => [id, name]));
        this.report = report;
        return report;
      }
      _overrides(kind, name) {
        return this.modData[kind]?.[name] ?? {};
      }
      _simple(spec, table, report) {
        const kind = spec.key;
        const byName = this.registry[spec.byName];
        const resolve = resolver(byName, spec);
        const offset = idOffset(table, resolve);
        const resolved = [];
        let changed = false;
        for (const [name, rawId] of table.entries) {
          const id = rawId + offset;
          const local = resolve(name);
          if (local && local.id === id) {
            resolved.push(local);
            continue;
          }
          changed = true;
          if (local) {
            resolved.push({ ...local, id });
            report.remapped[kind] = (report.remapped[kind] ?? 0) + 1;
          } else if (name.startsWith("minecraft:")) {
            const path = name.slice(10);
            resolved.push(spec.make({ id, name: path, displayName: titleCase(name) }));
            report.missing[kind] = (report.missing[kind] ?? 0) + 1;
          } else {
            const base = { id, name, displayName: titleCase(name), modded: true };
            resolved.push({ ...spec.make(base), ...this._overrides(kind, name) });
            report.added[kind] = (report.added[kind] ?? 0) + 1;
          }
        }
        if (!changed) return;
        const byId = {};
        const names = {};
        for (const entry of resolved) {
          byId[entry.id] = entry;
          names[entry.name] = entry;
        }
        this._install(spec.key, byId);
        this._install(spec.byName, names);
        if (this.registry[spec.array]) this._install(spec.array, resolved.slice().sort((a, b) => a.id - b.id));
      }
      _blockCount(local, name) {
        if (local) return local.maxStateId - local.minStateId + 1;
        const data = this._overrides("blocks", name);
        if (Number.isSafeInteger(data.stateCount) && data.stateCount > 0) return data.stateCount;
        if (Array.isArray(data.states) && data.states.length) {
          return data.states.reduce((count, state) => count * (state.num_values ?? state.values?.length ?? 1), 1);
        }
        return void 0;
      }
      // Block states are numbered in raw block ID order. Known vanilla blocks and
      // blocks described in modData.blocks get exact ranges; after the first block
      // with an unknown state count every further state ID is unknown.
      _blocks(table, report) {
        const resolve = resolver(this.registry.blocksByName, {});
        const order = [...table.entries].sort((a, b) => a[1] - b[1]);
        const blocks = {};
        const byName = {};
        const byState = {};
        let offset = 0;
        let unknownFrom = null;
        let changed = false;
        let unresolved = 0;
        for (const [name, id] of order) {
          const local = resolve(name);
          const count = this._blockCount(local, name);
          let block;
          if (unknownFrom === null && count !== void 0) {
            const states = { minStateId: offset, maxStateId: offset + count - 1 };
            if (local) {
              block = local.id === id && local.minStateId === offset ? local : { ...local, id, ...states, defaultState: offset + (local.defaultState - local.minStateId) };
            } else {
              block = this._moddedBlock(name, id, states, count);
            }
            for (let state = offset; state < offset + count; state++) byState[state] = block;
            offset += count;
          } else {
            unknownFrom ??= offset;
            unresolved++;
            block = local ? { ...local, id, minStateId: unknownFrom, maxStateId: unknownFrom, defaultState: unknownFrom, unresolvedStates: true } : this._moddedBlock(name, id, { minStateId: unknownFrom, maxStateId: unknownFrom }, 1, true);
            report.unresolvedBlocks.push(name);
          }
          if (block !== local) changed = true;
          blocks[id] = block;
          byName[block.name] = block;
        }
        if (!changed && unknownFrom === null) return;
        let lookup = byState;
        if (unknownFrom !== null) {
          report.unknownStateFrom = unknownFrom;
          const unknown = {
            id: order.length ? order[order.length - 1][1] + 1 : 0,
            name: "fabric:unknown_block",
            displayName: "Unknown modded block",
            hardness: 1,
            resistance: 1,
            stackSize: 64,
            diggable: true,
            material: "default",
            transparent: false,
            emitLight: 0,
            filterLight: 15,
            // Lower bound: every unresolved block has at least one state.
            minStateId: unknownFrom,
            maxStateId: unknownFrom + unresolved - 1,
            defaultState: unknownFrom,
            states: [],
            drops: [],
            boundingBox: "block",
            shapes: FULL_CUBE,
            modded: true,
            ...this.unknownBlock
          };
          if (unknown.boundingBox === "empty" && !this.unknownBlock.shapes) unknown.shapes = [];
          blocks[unknown.id] = unknown;
          byName[unknown.name] = unknown;
          lookup = new Proxy(byState, {
            get(target, key) {
              const value = target[key];
              if (value !== void 0 || typeof key !== "string") return value;
              const state = Number(key);
              return Number.isInteger(state) && state >= unknownFrom ? unknown : void 0;
            }
          });
        }
        report.added.blocks = order.filter(([name]) => !resolve(name)).length;
        this._install("blocks", blocks);
        this._install("blocksByName", byName);
        this._install("blocksArray", Object.values(blocks).sort((a, b) => a.id - b.id));
        this._install("blocksByStateId", lookup);
        this._collisionShapes(blocks);
      }
      _collisionShapes(blocks) {
        const original = this.registry.blockCollisionShapes;
        if (!original) return;
        const names = { ...original.blocks };
        const shapes = { ...original.shapes };
        let next = Object.keys(shapes).reduce((max, key) => Math.max(max, Number(key) || 0), 0) + 1;
        for (const block of Object.values(blocks)) {
          if (!block.modded) continue;
          names[block.name] = next;
          shapes[next++] = block.shapes;
        }
        this._install("blockCollisionShapes", { ...original, blocks: names, shapes });
      }
      _moddedBlock(name, id, states, count, unresolved = false) {
        const data = this._overrides("blocks", name);
        const block = {
          id,
          name,
          displayName: titleCase(name),
          hardness: 1,
          resistance: 1,
          stackSize: 64,
          diggable: true,
          material: "default",
          transparent: false,
          emitLight: 0,
          filterLight: 15,
          defaultState: states.minStateId,
          states: [],
          drops: [],
          boundingBox: "block",
          shapes: FULL_CUBE,
          modded: true,
          ...data,
          ...states
        };
        delete block.stateCount;
        if (unresolved) block.unresolvedStates = true;
        if (data.boundingBox === "empty" && !data.shapes) block.shapes = [];
        if (count > 1 && !Array.isArray(data.states)) block.states = [];
        return block;
      }
    };
    function guardWindows(client, adapter, emitWarning) {
      const ownEmit = Object.hasOwn(client, "emit");
      const originalEmit = client.emit;
      let held = null;
      let timer = null;
      function drop(reason) {
        if (!held) return;
        clearTimeout(timer);
        timer = null;
        emitWarning({ code: "FABRIC_MENU_DROPPED", message: "Mod menu " + held.name + " was not opened: " + reason });
        held = null;
      }
      function emit(event, packet, ...rest) {
        if (event === "end" || event === "state" && packet === "configuration") {
          clearTimeout(timer);
          timer = null;
          held = null;
        }
        const menus = adapter.menus;
        if (menus && packet && typeof packet === "object") {
          if (event === "open_window" && typeof packet.inventoryType === "number") {
            drop("another menu replaced it");
            const name = menus.get(packet.inventoryType);
            if (name) {
              if (name.startsWith("minecraft:")) {
                packet.inventoryType = name;
              } else {
                held = { name, packet, rest };
                timer = setTimeout(() => drop("the server sent no contents"), 5e3);
                timer.unref?.();
                return true;
              }
            }
          } else if (held && event === "window_items" && packet.windowId === held.packet.windowId) {
            const opened = held;
            clearTimeout(timer);
            timer = null;
            held = null;
            const slots = Array.isArray(packet.items) ? packet.items.length : 0;
            opened.packet.inventoryType = opened.name;
            opened.packet.slotCount = Math.max(slots - 36, 0);
            originalEmit.call(this, "open_window", opened.packet, ...opened.rest);
          } else if (held && event === "close_window" && packet.windowId === held.packet.windowId) {
            clearTimeout(timer);
            timer = null;
            held = null;
          }
        }
        return originalEmit.call(this, event, packet, ...rest);
      }
      client.emit = emit;
      return () => {
        clearTimeout(timer);
        held = null;
        if (client.emit !== emit) return;
        if (ownEmit) client.emit = originalEmit;
        else delete client.emit;
      };
    }
    module2.exports = { MineflayerAdapter, guardWindows };
  }
});

// vendor/mineflayer-fabric/src/mineflayer.js
var require_mineflayer = __commonJS({
  "vendor/mineflayer-fabric/src/mineflayer.js"(exports2, module2) {
    "use strict";
    var { fabricHandshake } = require_handshake();
    var { FabricProtocolError } = require_binary();
    var { loadProtocol } = require_protocol();
    var { MineflayerAdapter, guardWindows } = require_adapter();
    var attached = /* @__PURE__ */ new WeakMap();
    var MODES = ["adapt", "strict", "vanilla", "none"];
    function validateMineflayerRegistry(registry, sync) {
      const checks = [
        ["minecraft:block", "blocksByName"],
        ["minecraft:item", "itemsByName"],
        ["minecraft:entity_type", "entitiesByName"],
        ["minecraft:mob_effect", "effectsByName"]
      ];
      const incompatible = [];
      for (const [registryName, property] of checks) {
        const table = sync.registries.get(registryName);
        if (!table) continue;
        if (!registry?.[property]) {
          incompatible.push(registryName + ": Mineflayer data unavailable");
          continue;
        }
        for (const [name, id] of table.entries) {
          let local = registry[property][name] || name.startsWith("minecraft:") && registry[property][name.slice(10)];
          if (!local && property === "effectsByName" && name.startsWith("minecraft:")) {
            let key = name.slice(10).replaceAll("_", "");
            if (key === "unluck") key = "badluck";
            local = Object.values(registry[property]).find((effect) => effect.name.toLowerCase() === key);
          }
          if (!local || local.id !== id) {
            incompatible.push(name + " (server ID " + id + ", client " + (local?.id ?? "unknown") + ")");
          }
        }
      }
      if (incompatible.length) {
        throw new FabricProtocolError(
          "FABRIC_REGISTRY_INCOMPATIBLE",
          "Mineflayer needs a mod-specific data adapter before registry sync can be acknowledged: " + incompatible.slice(0, 8).join(", ") + (incompatible.length > 8 ? ", ..." : "") + '. Use registryValidation: "adapt" (default) for placeholders, or supply onRegistry with accurate data.'
        );
      }
    }
    function attachFabric(bot, options = {}) {
      if (attached.has(bot)) return attached.get(bot);
      if (!bot?._client) throw new TypeError("attachFabric requires a Mineflayer bot with _client");
      const mode = options.registryValidation ?? "adapt";
      if (!MODES.includes(mode)) throw new TypeError('registryValidation must be "adapt", "strict" or "none"');
      const adapter = new MineflayerAdapter(bot, options);
      const connection = fabricHandshake(bot._client, {
        ...options,
        // A fast configuration can arrive before Mineflayer's deferred injection.
        // Cover that window, then let its game plugin own ping in both phases.
        handleConfigurationPing: options.handleConfigurationPing ?? !bot.game,
        onRegistry: async (sync, fabric) => {
          const generation = fabric.generation;
          await options.onRegistry?.(sync, fabric);
          if (fabric.disposed || fabric.failed || generation !== fabric.generation) return;
          if (mode === "strict" || mode === "vanilla") validateMineflayerRegistry(bot.registry, sync);
          if (mode === "none") return;
          const report = adapter.apply(sync);
          fabric.adaptation = report;
          if (report.namespaces.size) {
            fabric.emit("warning", {
              code: "FABRIC_MOD_CONTENT",
              message: "Registry entries received for " + [...report.namespaces].join(", ") + ". Mod blocks, items and entities use placeholders; their GUIs, payloads and gameplay need dedicated adapters."
            });
          }
          if (report.unresolvedBlocks.length) {
            fabric.emit("warning", {
              code: "FABRIC_BLOCK_STATES_UNKNOWN",
              message: report.unresolvedBlocks.length + " blocks have unknown state counts (" + report.unresolvedBlocks.slice(0, 5).join(", ") + (report.unresolvedBlocks.length > 5 ? ", ..." : "") + "); block states from " + report.unknownStateFrom + " are treated as solid unknown blocks. Describe them in modData.blocks for exact mapping."
            });
          }
          fabric.emit("adapted", report);
        }
      });
      connection._loadProtocol = () => loadProtocol(true);
      connection._preferMineflayer = true;
      const restore = () => {
        adapter.restore();
        delete connection.adaptation;
      };
      connection.on("configuration", restore);
      connection.on("failure", restore);
      const unguard = guardWindows(bot._client, adapter, (warning) => {
        if (!connection.disposed) connection.emit("warning", warning);
      });
      if (options.handleConfigurationPing === void 0 && !bot.game) {
        const injected = () => {
          connection.options.handleConfigurationPing = false;
          connection.removeListener("disposed", cleanup);
        };
        const cleanup = () => bot.removeListener("inject_allowed", injected);
        bot.once("inject_allowed", injected);
        connection.once("disposed", cleanup);
      }
      bot.fabric = connection;
      attached.set(bot, connection);
      connection.once("disposed", () => {
        unguard();
        restore();
        connection.removeListener("configuration", restore);
        connection.removeListener("failure", restore);
        attached.delete(bot);
      });
      return connection;
    }
    function fabricPlugin(options = {}) {
      return (bot) => attachFabric(bot, options);
    }
    function createFabricBot(botOptions = {}, fabricOptions = {}) {
      const bot = require("mineflayer").createBot(botOptions);
      attachFabric(bot, fabricOptions);
      return bot;
    }
    function createFabricClient(clientOptions, fabricOptions = {}) {
      const client = loadProtocol().createClient(clientOptions);
      client.fabric = fabricHandshake(client, fabricOptions);
      return client;
    }
    module2.exports = { attachFabric, fabricPlugin, createFabricBot, createFabricClient, validateMineflayerRegistry };
  }
});

// vendor/mineflayer-fabric/index.js
module.exports = {
  ...require_handshake(),
  ...require_mineflayer(),
  ...require_registry(),
  FabricProtocolError: require_binary().FabricProtocolError
};
