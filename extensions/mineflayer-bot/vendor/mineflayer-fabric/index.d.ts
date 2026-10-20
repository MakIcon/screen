import { EventEmitter } from 'node:events'
import { Bot, BotOptions } from 'mineflayer'
import { Client, ClientOptions } from 'minecraft-protocol'

export interface RegistryTable {
  optional: boolean
  entries: Map<string, number>
  byId: Map<number, string>
}
export type RegistryFormat = 'binary' | 'binary+attributes' | 'nbt'
export interface RegistrySync {
  registries: Map<string, RegistryTable>
  entryCount: number
  /** Wire layout: NBT (Fabric API 1.14 - 1.19.4), binary (1.17 - 1.21.3), binary with attributes (1.21.4+). */
  format: RegistryFormat
  /** Channel it arrived on; set for synchronizations received by FabricConnection. */
  channel?: 'fabric:registry/sync' | 'fabric:registry/sync/direct'
  phase?: 'configuration' | 'play'
}
export interface RegistrySnapshot {
  format: 'fabric-registry-sync'
  source: RegistryFormat
  entryCount: number
  registries: Record<string, { optional: boolean, entries: Record<string, number> }>
}
export type PayloadHandler = (data: Buffer, connection: FabricConnection) => void | Promise<void>
export interface FabricOptions {
  brand?: string
  /** Deadline for a detected Fabric exchange in ms; 0 disables it. Default 30000. */
  timeout?: number
  maxPayloadBytes?: number
  maxRegistryEntries?: number
  /** Raw default: true. Mineflayer default: true until inject_allowed, then false. */
  handleConfigurationPing?: boolean
  /** Answer the Fabric login query of Fabric API 1.14 - 1.20.1. Default true. */
  earlyRegistration?: boolean
  /** "auto": announce Fabric channels only to servers that show Fabric. Default "auto". */
  announce?: 'auto' | 'always'
  handlers?: {
    configuration?: Record<string, PayloadHandler>
    play?: Record<string, PayloadHandler>
  }
  onRegistry?: (registry: RegistrySync, connection: FabricConnection) => void | Promise<void>
}
/** Fields in minecraft-data format that replace placeholder defaults. */
export interface ModBlockData {
  /** Number of block states; or give `states` in minecraft-data format. */
  stateCount?: number
  states?: Array<{ name: string, type: string, num_values: number, values?: string[] }>
  boundingBox?: 'block' | 'empty'
  shapes?: number[][]
  [field: string]: unknown
}
export interface ModData {
  blocks?: Record<string, ModBlockData>
  items?: Record<string, Record<string, unknown>>
  entities?: Record<string, Record<string, unknown>>
  effects?: Record<string, Record<string, unknown>>
  enchantments?: Record<string, Record<string, unknown>>
  sounds?: Record<string, Record<string, unknown>>
  particles?: Record<string, Record<string, unknown>>
}
export interface AdaptationReport {
  added: Record<string, number>
  remapped: Record<string, number>
  missing: Record<string, number>
  unresolvedBlocks: string[]
  unknownStateFrom: number | null
  namespaces: Set<string>
}
export interface FabricBotOptions extends FabricOptions {
  /** "adapt" (default): placeholders for mod content; "strict"/"vanilla": refuse it; "none": leave data untouched. */
  registryValidation?: 'adapt' | 'strict' | 'vanilla' | 'none'
  modData?: ModData
  /** Overrides for the block used for unknown mod block states. */
  unknownBlock?: Record<string, unknown>
}
export interface FabricWarning { code: string, message: string }
export class FabricProtocolError extends Error {
  readonly code: string
  constructor (code: string, message: string, options?: ErrorOptions)
}
export interface FabricConnectionEvents {
  registered: (channels: string[], phase: 'login' | 'configuration' | 'play') => void
  registry: (sync: RegistrySync) => void
  synced: (sync: RegistrySync) => void
  adapted: (report: AdaptationReport) => void
  ready: (state: { detected: boolean, synced: boolean, era: 'configuration' | 'play' | null }) => void
  configuration: (state: { generation: number }) => void
  channels: (update: { phase: 'configuration' | 'play', channels: Set<string>, ignored?: number }) => void
  unhandledPayload: (payload: { channel: string, data: Buffer, phase: 'configuration' | 'play' }) => void
  warning: (warning: FabricWarning) => void
  failure: (error: FabricProtocolError) => void
  disposed: () => void
}
export class FabricConnection extends EventEmitter {
  constructor (client: Client, options?: FabricOptions)
  readonly client: Client
  readonly options: Required<Omit<FabricOptions, 'handlers' | 'onRegistry'>> & FabricOptions
  /** The server showed Fabric (channels, login query or registry sync). */
  readonly detected: boolean
  readonly disposed: boolean
  readonly failed: boolean
  readonly synced: boolean
  /** Phase used by the server's Fabric API: PLAY (1.14 - 1.20.1) or CONFIGURATION (1.20.2+). */
  readonly era: 'configuration' | 'play' | null
  readonly protocolVersion: number | undefined
  readonly commonVersion: number | null
  readonly registry: RegistrySync
  readonly serverChannels: { configuration: Set<string>, play: Set<string> }
  /** Set by attachFabric after Mineflayer data adaptation. */
  adaptation?: AdaptationReport
  send (channel: string, data: Buffer): void
  snapshot (): RegistrySnapshot
  dispose (): void
  on<E extends keyof FabricConnectionEvents> (event: E, listener: FabricConnectionEvents[E]): this
  once<E extends keyof FabricConnectionEvents> (event: E, listener: FabricConnectionEvents[E]): this
}
export type FabricBot = Bot & { fabric: FabricConnection }
export type FabricClient = Client & { fabric: FabricConnection }
export type FabricClientOptions = Omit<ClientOptions, 'version'> & { version?: string | false }
export const CHANNELS: Readonly<{
  register: 'minecraft:register'
  unregister: 'minecraft:unregister'
  brand: 'minecraft:brand'
  version: 'c:version'
  commonRegister: 'c:register'
  registry: 'fabric:registry/sync'
  registryDirect: 'fabric:registry/sync/direct'
  complete: 'fabric:registry/sync/complete'
  split: 'fabric:split'
  earlyRegistration: 'fabric-networking-api-v1:early_registration'
}>
export function fabricHandshake (client: Client, options?: FabricOptions): FabricConnection
export function attachFabric (bot: Bot, options?: FabricBotOptions): FabricConnection
export function fabricPlugin (options?: FabricBotOptions): (bot: Bot) => void
export function createFabricBot (options?: BotOptions, fabric?: FabricBotOptions): FabricBot
export function createFabricClient (options: FabricClientOptions, fabric?: FabricOptions): FabricClient
export function decodeRegistrySync (buffer: Buffer, options?: {
  maxEntries?: number
  /** true/false force a layout; "auto" (default) tries both. */
  attributes?: boolean | 'auto'
  preferAttributes?: boolean
}): RegistrySync
export function decodeNbtRegistrySync (buffer: Buffer, options?: { maxEntries?: number }): RegistrySync
export function registrySnapshot (registry: RegistrySync): RegistrySnapshot
export function validateMineflayerRegistry (registry: Bot['registry'], sync: RegistrySync): void
