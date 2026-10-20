import api from './index.js'

export const {
  fabricHandshake, FabricConnection, CHANNELS,
  attachFabric, fabricPlugin, createFabricBot, createFabricClient, validateMineflayerRegistry,
  decodeRegistrySync, decodeNbtRegistrySync, registrySnapshot, FabricProtocolError
} = api
export default api
