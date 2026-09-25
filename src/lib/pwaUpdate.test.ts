import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UPDATE_INTERVAL_MS,
  applyUpdate,
  checkForUpdate,
  dismissUpdate,
  maybeCheckForUpdate,
  resetUpdateForTests,
  shouldCheck,
  useUpdateAvailable,
  watchRegistration,
} from './pwaUpdate.ts';

/** Minimal ServiceWorker/ServiceWorkerRegistration för tester. */
class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing';
  postMessage = vi.fn();

  setState(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  /** Vad nästa update() gör: hittar en ny worker eller inte. */
  next: 'new' | 'none' | 'offline' = 'none';
  update = vi.fn(() => {
    if (this.next === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
    if (this.next === 'new') {
      const sw = new FakeWorker();
      this.installing = sw;
      this.dispatchEvent(new Event('updatefound'));
      // Installationen blir klar lite senare.
      setTimeout(() => {
        this.installing = null;
        this.waiting = sw;
        sw.setState('installed');
      }, 10);
    }
    return Promise.resolve();
  });
}

const container = new EventTarget() as EventTarget & { controller: object | null };

function register(): FakeRegistration {
  const reg = new FakeRegistration();
  watchRegistration(reg as unknown as ServiceWorkerRegistration);
  return reg;
}

beforeEach(() => {
  resetUpdateForTests();
  container.controller = {};
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.restoreAllMocks();
});

describe('shouldCheck', () => {
  it('högst en automatisk sökning per 30 minuter', () => {
    expect(UPDATE_INTERVAL_MS).toBe(30 * 60 * 1000);
    expect(shouldCheck(0, UPDATE_INTERVAL_MS)).toBe(true);
    expect(shouldCheck(1000, 1000 + UPDATE_INTERVAL_MS - 1)).toBe(false);
  });
});

describe('uppdateringsflödet', () => {
  it('visar toasten när en ny service worker väntar', async () => {
    const { result } = renderHook(() => useUpdateAvailable());
    const reg = register();
    reg.next = 'new';
    let outcome: string | undefined;
    await act(async () => {
      outcome = await checkForUpdate();
    });
    expect(outcome).toBe('available');
    expect(result.current).toBe(true);

    act(() => {
      dismissUpdate();
    });
    expect(result.current).toBe(false);
  });

  it('en väntande worker vid start räknas också', () => {
    const reg = new FakeRegistration();
    reg.waiting = new FakeWorker();
    const { result } = renderHook(() => useUpdateAvailable());
    act(() => {
      watchRegistration(reg as unknown as ServiceWorkerRegistration);
    });
    expect(result.current).toBe(true);
  });

  it('första installationen (ingen controller) är ingen uppdatering', async () => {
    container.controller = null;
    const reg = register();
    reg.next = 'new';
    expect(await checkForUpdate()).toBe('latest');
  });

  it('ingen ny version och offline', async () => {
    const reg = register();
    expect(await checkForUpdate()).toBe('latest');
    reg.next = 'offline';
    expect(await checkForUpdate()).toBe('failed');
  });

  it('utan registrering (dev) stöds inte sökning', async () => {
    expect(await checkForUpdate()).toBe('unsupported');
  });

  it('automatiska sökningar begränsas till var 30:e minut', async () => {
    const reg = register();
    await checkForUpdate(1_000);
    await maybeCheckForUpdate(1_000 + 60_000);
    expect(reg.update).toHaveBeenCalledTimes(1);
    await maybeCheckForUpdate(1_000 + UPDATE_INTERVAL_MS);
    expect(reg.update).toHaveBeenCalledTimes(2);
  });

  it('Uppdatera skickar SKIP_WAITING och laddar om när den nya workern tagit över', async () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload } as unknown as Location);
    const reg = register();
    reg.next = 'new';
    await checkForUpdate();
    applyUpdate();
    expect(reg.waiting?.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
