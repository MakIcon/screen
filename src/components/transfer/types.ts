import type { ExportedItem } from "../../types";

export type InstanceTransferOptions = {
  name: boolean;
  ram: boolean;
  javaArgs: boolean;
  javaPath: boolean;
  environmentVariables: boolean;
  window: boolean;
  mods: boolean;
  shaders: boolean;
  resourcePacks: boolean;
};

export type TransferListPreview = {
  items: ExportedItem[];
  label: string;
  rect: DOMRect;
  ownerId: string;
};

export type TransferHoverTarget = {
  items: ExportedItem[];
  label: string;
  el: HTMLElement;
  ownerId: string;
};
