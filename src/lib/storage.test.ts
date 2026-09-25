import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, getStorageStatus, requestPersistence } from './storage.ts';

function mockStorage(storage: Partial<StorageManager> | undefined) {
  vi.stubGlobal('navigator', storage ? { storage } : {});
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestPersistence', () => {
  it('returnerar persisted om lagringen redan är beständig', async () => {
    const persist = vi.fn();
    mockStorage({ persisted: () => Promise.resolve(true), persist });
    await expect(requestPersistence()).resolves.toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('begär beständighet och rapporterar resultatet', async () => {
    mockStorage({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) });
    await expect(requestPersistence()).resolves.toBe('not-persisted');
  });

  it('hanterar webbläsare utan Storage API', async () => {
    mockStorage(undefined);
    await expect(requestPersistence()).resolves.toBe('unsupported');
  });
});

describe('getStorageStatus', () => {
  it('rapporterar status och uppskattning', async () => {
    mockStorage({
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve({ usage: 2048, quota: 1024 * 1024 }),
    });
    await expect(getStorageStatus()).resolves.toEqual({
      persistence: 'persisted',
      usage: 2048,
      quota: 1024 * 1024,
    });
  });
});

describe('formatBytes', () => {
  it('formaterar med svenska decimaler', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 kB');
  });
});
