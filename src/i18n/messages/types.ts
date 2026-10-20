/** Russian plural forms: 1 сундук, 2 сундука, 5 сундуков. `{count}` is substituted. */
export type RussianPlural = { readonly one: string; readonly few: string; readonly many: string };
/** English plural forms: 1 chest, 2 chests. `{count}` is substituted. */
export type EnglishPlural = { readonly one: string; readonly other: string };
