/**
 * Genvägar på appikonen (manifestets `shortcuts`). Varje genväg öppnar appen med
 * `?action=<id>`, som tolkas här och skickas vidare till rätt vy. Modulen har
 * inga beroenden så att vite.config.ts kan bygga manifestet från samma lista.
 */

export type ShortcutId = 'log-weight' | 'add-water' | 'log-food';

export interface Shortcut {
  id: ShortcutId;
  /** Namn i genvägsmenyn. */
  name: string;
  shortName: string;
  description: string;
  /** Ikonfil i public/ (96 × 96 px). */
  icon: string;
  /** Funktionen som krävs (se features.ts). Saknas = alltid på. */
  feature?: 'vatten' | 'mat';
}

/** Mängden som "+250 ml vatten" loggar. */
export const SHORTCUT_WATER_ML = 250;

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'log-weight',
    name: 'Logga vikt',
    shortName: 'Vikt',
    description: 'Öppna viktloggningen',
    icon: 'shortcut-weight-96x96.png',
  },
  {
    id: 'add-water',
    name: '+250 ml vatten',
    shortName: '+250 ml',
    description: 'Logga 250 ml vatten direkt',
    icon: 'shortcut-water-96x96.png',
    feature: 'vatten',
  },
  {
    id: 'log-food',
    name: 'Logga mat',
    shortName: 'Mat',
    description: 'Sök och logga mat',
    icon: 'shortcut-food-96x96.png',
    feature: 'mat',
  },
];

/** Adressen genvägen öppnar, relativt appens bas (t.ex. "/viktresan/"). */
export function shortcutUrl(base: string, id: ShortcutId): string {
  return `${base}?action=${id}`;
}

/** Tolkar `location.search`. Okänd eller saknad `action` → `null`. */
export function parseShortcut(search: string): Shortcut | null {
  const action = new URLSearchParams(search).get('action');
  return SHORTCUTS.find((s) => s.id === action) ?? null;
}

/** Vad appen ska göra för en genväg. */
export type ShortcutOutcome =
  /** Byt till en hash-adress (öppnar en panel). */
  | { kind: 'open'; hash: string }
  /** Logga vatten direkt och visa en toast med Ångra. */
  | { kind: 'add-water'; ml: number; hash: string }
  /** Funktionen är avstängd: fråga om den ska slås på. */
  | { kind: 'disabled'; feature: 'vatten' | 'mat' };

/**
 * Genväg + funktionsbrytare → åtgärd. `enabled` avgör om genvägens funktion är på.
 * Vikt: Logga → Vikt. Vatten: loggas direkt, Översikt visas. Mat: Mat → Logga mat.
 */
export function shortcutOutcome(
  shortcut: Shortcut,
  enabled: (feature: 'vatten' | 'mat') => boolean,
): ShortcutOutcome {
  if (shortcut.feature && !enabled(shortcut.feature)) {
    return { kind: 'disabled', feature: shortcut.feature };
  }
  switch (shortcut.id) {
    case 'log-weight':
      return { kind: 'open', hash: '#/logga/vikt' };
    case 'add-water':
      return { kind: 'add-water', ml: SHORTCUT_WATER_ML, hash: '#/' };
    case 'log-food':
      return { kind: 'open', hash: '#/mat/logga' };
  }
}

/** Adressen utan `action`, så att en omladdning inte kör genvägen igen. */
export function withoutAction(pathname: string, search: string, hash: string): string {
  const params = new URLSearchParams(search);
  params.delete('action');
  const rest = params.toString();
  return `${pathname}${rest ? `?${rest}` : ''}${hash}`;
}
