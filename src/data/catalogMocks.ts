import type { CatalogItem } from "./types";

export const modrinthMock: CatalogItem[] = [
  {
    id: "mod-1",
    title: "Sodium",
    author: "jellysquid",
    category: "Optimization",
    description: "UI-заглушка. Реализован пока только реальный vanilla/offline launcher.",
    installed: true,
  },
  {
    id: "mod-2",
    title: "Iris Shaders",
    author: "coderbot",
    category: "Shaders",
    description: "Экран оставлен, но реальная установка модов пока не подключена.",
  },
];

export const packsMock: CatalogItem[] = [
  {
    id: "pack-1",
    title: "Faithful 32x",
    author: "Faithful Team",
    category: "Resource Pack",
    description: "Каталог пока UI-only.",
  },
];

export const shadersMock: CatalogItem[] = [
  {
    id: "shader-1",
    title: "Complementary Reimagined",
    author: "EminGT",
    category: "Shader",
    description: "Каталог пока UI-only.",
  },
];
