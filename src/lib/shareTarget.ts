/**
 * Web Share Target: Viktresan i Androids delningsmeny. Manifestets `share_target` öppnar
 * appen med `?share-title=…&share-text=…&share-url=…` (GET); en delad länk eller text
 * öppnar "Importera recept" (Mat → Egna). Modulen har inga beroenden så att
 * vite.config.ts kan bygga manifestet från samma namn.
 */

/** Frågeparametrarna som delningen fylls i med (egna namn, så att de inte krockar). */
export const SHARE_PARAMS = {
  title: 'share-title',
  text: 'share-text',
  url: 'share-url',
} as const;

/** Adressen som öppnar importen (hash-route i Mat). */
export const IMPORT_RECIPE_HASH = '#/mat/importera';

export interface SharedRecipe {
  /** Det som förifylls i "Länk eller receptext": länken, annars texten. */
  input: string;
}

/**
 * Tolkar `location.search`. Android lägger ofta länken i `text` ("Kycklinggryta
 * https://…") och lämnar `url` tom – länken letas då upp i texten. `null` utan delning.
 */
export function parseShare(search: string): SharedRecipe | null {
  const params = new URLSearchParams(search);
  const keys = Object.values(SHARE_PARAMS);
  if (!keys.some((k) => params.has(k))) return null;
  const url = (params.get(SHARE_PARAMS.url) ?? '').trim();
  const text = (params.get(SHARE_PARAMS.text) ?? '').trim();
  const title = (params.get(SHARE_PARAMS.title) ?? '').trim();
  if (url !== '') return { input: url };
  const inText = /https?:\/\/\S+/i.exec(text)?.[0];
  if (inText !== undefined && text.replace(inText, '').trim().length <= 200) {
    return { input: inText.replace(/[.,;:!?)\]]+$/, '') };
  }
  return { input: text !== '' ? text : title };
}

/** Adressen utan delningens parametrar, så att en omladdning inte öppnar importen igen. */
export function withoutShare(pathname: string, search: string, hash: string): string {
  const params = new URLSearchParams(search);
  for (const key of Object.values(SHARE_PARAMS)) params.delete(key);
  const rest = params.toString();
  return `${pathname}${rest ? `?${rest}` : ''}${hash}`;
}

let pending: SharedRecipe | null = null;

/** Sparar delningen tills importpanelen öppnats och stängts. */
export function setPendingShare(share: SharedRecipe | null): void {
  pending = share;
}

/** Delningen som väntar på importpanelen (glöms när panelen stängs: `setPendingShare(null)`). */
export function pendingShare(): SharedRecipe | null {
  return pending;
}
