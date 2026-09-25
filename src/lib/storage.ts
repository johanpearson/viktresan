export type PersistenceState = 'persisted' | 'not-persisted' | 'unsupported';

export interface StorageStatus {
  persistence: PersistenceState;
  /** Använt utrymme i byte, om webbläsaren rapporterar det. */
  usage: number | null;
  /** Tillgänglig kvot i byte, om webbläsaren rapporterar det. */
  quota: number | null;
}

function storageManager(): StorageManager | null {
  return typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : null;
}

/** Begär beständig lagring. Anropas vid start och från Inställningar. */
export async function requestPersistence(): Promise<PersistenceState> {
  const storage = storageManager();
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  try {
    if (await storage.persisted()) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'not-persisted';
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = storageManager();
  if (!storage || typeof storage.persisted !== 'function') {
    return { persistence: 'unsupported', usage: null, quota: null };
  }
  const [persisted, estimate] = await Promise.all([
    storage.persisted().catch(() => false),
    typeof storage.estimate === 'function'
      ? storage.estimate().catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    persistence: persisted ? 'persisted' : 'not-persisted',
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
  };
}

const byteFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

export function formatBytes(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${byteFormat.format(value)} ${units[unit] ?? 'B'}`;
}
