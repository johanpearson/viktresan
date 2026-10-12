/**
 * Var säkerhetskopian hamnar. Med File System Access API (`showSaveFilePicker`, t.ex. Chrome på
 * datorn) väljer användaren en fil första gången och varje backup skriver sedan över den. Annars
 * laddas filen ner med ett fast namn – äldre kopior får användaren ta bort själv.
 */
import { SETTING_BACKUP_FILE, deleteSetting, getSetting, setSetting } from '../db/db.ts';
import { BACKUP_FILE_NAME } from './backup.ts';

export type BackupMode = 'fil' | 'nedladdning';

export const BACKUP_MODE_LABEL: Record<BackupMode, string> = {
  fil: 'Skriv över fil',
  nedladdning: 'Nedladdning',
};

type Permission = 'granted' | 'denied' | 'prompt';

interface PermissionDescriptor {
  mode: 'readwrite';
}

/** Det som används av ett `FileSystemFileHandle` (behörighetsmetoderna saknas i TS:s DOM-typer). */
export interface BackupFileHandle {
  readonly name: string;
  queryPermission?: (descriptor: PermissionDescriptor) => Promise<Permission>;
  requestPermission?: (descriptor: PermissionDescriptor) => Promise<Permission>;
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
  }>;
}

interface SaveFilePickerOptions {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}

interface PickerWindow {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<BackupFileHandle>;
}

/** Läget som enheten klarar: skriv över en vald fil, annars nedladdning. */
export function backupMode(win: object = window): BackupMode {
  return typeof (win as PickerWindow).showSaveFilePicker === 'function' ? 'fil' : 'nedladdning';
}

/** Ett lagrat värde som går att använda som filhandtag (annat ignoreras). */
export function asFileHandle(raw: unknown): BackupFileHandle | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const handle = raw as Partial<BackupFileHandle>;
  return typeof handle.name === 'string' && typeof handle.createWritable === 'function'
    ? (handle as BackupFileHandle)
    : null;
}

/** Det filflödet behöver utifrån – injicerbart för tester. */
export interface BackupFileDeps {
  /** Öppnar dialogen "Spara som"; kastar `AbortError` om användaren avbryter. */
  pick: () => Promise<BackupFileHandle>;
  load: () => Promise<BackupFileHandle | null>;
  store: (handle: BackupFileHandle) => Promise<void>;
  clear: () => Promise<void>;
}

export const browserFileDeps: BackupFileDeps = {
  pick: () => {
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (!picker) return Promise.reject(new Error('showSaveFilePicker saknas'));
    return picker.call(window, {
      suggestedName: BACKUP_FILE_NAME,
      types: [{ description: 'Zip-fil', accept: { 'application/zip': ['.zip'] } }],
    });
  },
  load: async () => asFileHandle(await getSetting(SETTING_BACKUP_FILE)),
  store: (handle) => setSetting(SETTING_BACKUP_FILE, handle),
  clear: () => deleteSetting(SETTING_BACKUP_FILE),
};

export type FileSaveResult =
  | { kind: 'saved'; name: string }
  /** Användaren stängde "Spara som" – inget sparades. */
  | { kind: 'cancelled' }
  /** Användaren gav inte behörighet att skriva till filen. */
  | { kind: 'denied' }
  /** Den sparade filen går inte längre att använda (flyttad, borttagen …) – välj fil igen. */
  | { kind: 'stale' }
  | { kind: 'error' };

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

const READWRITE: PermissionDescriptor = { mode: 'readwrite' };

/** Frågar om behörighet bara när den inte redan finns. Kastar om handtaget inte fungerar. */
async function ensurePermission(handle: BackupFileHandle): Promise<Permission> {
  if (!handle.queryPermission) return 'granted';
  const current = await handle.queryPermission(READWRITE);
  if (current === 'granted' || !handle.requestPermission) return current;
  return handle.requestPermission(READWRITE);
}

/**
 * Sparar säkerhetskopian i den valda filen. Utan sparad fil (eller med `choose`) öppnas "Spara
 * som" först. Filen väljs och behörigheten begärs **innan** kopian byggs, så att dialogerna
 * öppnas medan knapptrycket fortfarande räknas som användarens handling.
 */
export async function saveToBackupFile(
  deps: BackupFileDeps,
  build: () => Promise<Blob>,
  { choose = false }: { choose?: boolean } = {},
): Promise<FileSaveResult> {
  let handle = choose ? null : await deps.load();
  if (handle) {
    try {
      const permission = await ensurePermission(handle);
      if (permission !== 'granted') return { kind: 'denied' };
    } catch {
      await deps.clear();
      return { kind: 'stale' };
    }
  } else {
    try {
      handle = await deps.pick();
    } catch (err) {
      return isAbort(err) ? { kind: 'cancelled' } : { kind: 'error' };
    }
    await deps.store(handle);
  }

  const blob = await build();
  try {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      await writable.abort?.().catch(() => undefined);
      throw err;
    }
  } catch (err) {
    // Fullt minne är inte filens fel – behåll den.
    if (err instanceof DOMException && err.name === 'QuotaExceededError') return { kind: 'error' };
    await deps.clear();
    return { kind: 'stale' };
  }
  return { kind: 'saved', name: handle.name };
}

/** Laddar ner filen via en tillfällig länk. */
export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Ge webbläsaren tid att starta nedladdningen innan URL:en släpps.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
