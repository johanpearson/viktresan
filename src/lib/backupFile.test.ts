import { describe, expect, it, vi } from 'vitest';
import {
  asFileHandle,
  backupMode,
  saveToBackupFile,
  type BackupFileDeps,
  type BackupFileHandle,
} from './backupFile.ts';

type Permission = 'granted' | 'denied' | 'prompt';

function fakeHandle(
  options: {
    name?: string;
    permission?: Permission;
    afterRequest?: Permission;
    queryThrows?: boolean;
    writeError?: DOMException;
  } = {},
) {
  const written: Blob[] = [];
  const handle = {
    name: options.name ?? 'viktresan-backup.zip',
    queryPermission: vi.fn(() =>
      options.queryThrows
        ? Promise.reject(new DOMException('borta', 'NotFoundError'))
        : Promise.resolve(options.permission ?? 'granted'),
    ),
    requestPermission: vi.fn(() => Promise.resolve(options.afterRequest ?? 'granted')),
    createWritable: vi.fn(() =>
      options.writeError
        ? Promise.reject(options.writeError)
        : Promise.resolve({
            write: (data: Blob) => {
              written.push(data);
              return Promise.resolve();
            },
            close: () => Promise.resolve(),
          }),
    ),
  } satisfies BackupFileHandle;
  return { handle, written };
}

function deps(stored: BackupFileHandle | null, picked?: BackupFileHandle | DOMException) {
  let current = stored;
  const d = {
    pick: vi.fn(() =>
      picked && 'createWritable' in picked
        ? Promise.resolve(picked)
        : Promise.reject(picked ?? new Error('ingen fil')),
    ),
    load: vi.fn(() => Promise.resolve(current)),
    store: vi.fn((h: BackupFileHandle) => {
      current = h;
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      current = null;
      return Promise.resolve();
    }),
  } satisfies BackupFileDeps;
  return { d, stored: () => current };
}

const build = () => Promise.resolve(new Blob(['zip']));

describe('backupMode', () => {
  it('väljer fil när showSaveFilePicker finns', () => {
    expect(backupMode({ showSaveFilePicker: () => Promise.resolve() })).toBe('fil');
  });

  it('väljer nedladdning när showSaveFilePicker saknas eller inte är en funktion', () => {
    expect(backupMode({})).toBe('nedladdning');
    expect(backupMode({ showSaveFilePicker: true })).toBe('nedladdning');
  });
});

describe('asFileHandle', () => {
  it('godtar bara något som kan skrivas till', () => {
    expect(asFileHandle(undefined)).toBeNull();
    expect(asFileHandle({ name: 'x.zip' })).toBeNull();
    expect(asFileHandle({ createWritable: () => undefined })).toBeNull();
    const { handle } = fakeHandle();
    expect(asFileHandle(handle)).toBe(handle);
  });
});

describe('saveToBackupFile', () => {
  it('första gången väljs fil, handtaget sparas och filen skrivs', async () => {
    const { handle, written } = fakeHandle({ name: 'min-backup.zip' });
    const { d, stored } = deps(null, handle);
    expect(await saveToBackupFile(d, build)).toEqual({ kind: 'saved', name: 'min-backup.zip' });
    expect(d.pick).toHaveBeenCalledTimes(1);
    expect(stored()).toBe(handle);
    expect(written).toHaveLength(1);
  });

  it('nästa gång skrivs samma fil över utan dialog', async () => {
    const { handle, written } = fakeHandle();
    const { d } = deps(handle);
    await saveToBackupFile(d, build);
    await saveToBackupFile(d, build);
    expect(d.pick).not.toHaveBeenCalled();
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(written).toHaveLength(2);
  });

  it('frågar om behörighet när den inte finns kvar', async () => {
    const { handle, written } = fakeHandle({ permission: 'prompt', afterRequest: 'granted' });
    const { d } = deps(handle);
    expect((await saveToBackupFile(d, build)).kind).toBe('saved');
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(written).toHaveLength(1);
  });

  it('nekad behörighet skriver inget och behåller filen', async () => {
    const { handle, written } = fakeHandle({ permission: 'prompt', afterRequest: 'denied' });
    const { d, stored } = deps(handle);
    const buildSpy = vi.fn(build);
    expect(await saveToBackupFile(d, buildSpy)).toEqual({ kind: 'denied' });
    expect(buildSpy).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
    expect(stored()).toBe(handle);
  });

  it('avbruten "Spara som" sparar inget', async () => {
    const { d, stored } = deps(null, new DOMException('avbrutet', 'AbortError'));
    expect(await saveToBackupFile(d, build)).toEqual({ kind: 'cancelled' });
    expect(stored()).toBeNull();
  });

  it('ogiltigt handtag vid behörighetskontrollen glöms och användaren får välja igen', async () => {
    const { handle } = fakeHandle({ queryThrows: true });
    const { d, stored } = deps(handle);
    expect(await saveToBackupFile(d, build)).toEqual({ kind: 'stale' });
    expect(stored()).toBeNull();
    expect(d.pick).not.toHaveBeenCalled();
  });

  it('en fil som inte går att skriva till (flyttad/borttagen) glöms', async () => {
    const { handle } = fakeHandle({ writeError: new DOMException('borta', 'NotFoundError') });
    const { d, stored } = deps(handle);
    expect(await saveToBackupFile(d, build)).toEqual({ kind: 'stale' });
    expect(stored()).toBeNull();
  });

  it('fullt lagringsutrymme är ett fel men filen behålls', async () => {
    const { handle } = fakeHandle({ writeError: new DOMException('fullt', 'QuotaExceededError') });
    const { d, stored } = deps(handle);
    expect(await saveToBackupFile(d, build)).toEqual({ kind: 'error' });
    expect(stored()).toBe(handle);
  });

  it('"Välj fil igen" öppnar dialogen även när en fil finns sparad', async () => {
    const old = fakeHandle({ name: 'gammal.zip' });
    const fresh = fakeHandle({ name: 'ny.zip' });
    const { d, stored } = deps(old.handle, fresh.handle);
    expect(await saveToBackupFile(d, build, { choose: true })).toEqual({
      kind: 'saved',
      name: 'ny.zip',
    });
    expect(stored()).toBe(fresh.handle);
    expect(old.written).toHaveLength(0);
    expect(fresh.written).toHaveLength(1);
  });
});
