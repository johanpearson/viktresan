import { describe, expect, it } from 'vitest';
import { daysSince, isBackupDue } from './backupReminder.ts';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 25, 12);

describe('isBackupDue', () => {
  it('påminner inte utan data', () => {
    expect(isBackupDue({ lastExportAt: null, oldestEntryAt: null, now })).toBe(false);
  });

  it('räknar från äldsta posten om ingen export gjorts', () => {
    expect(isBackupDue({ lastExportAt: null, oldestEntryAt: now - 6 * DAY, now })).toBe(false);
    expect(isBackupDue({ lastExportAt: null, oldestEntryAt: now - 7 * DAY, now })).toBe(true);
  });

  it('påminner när senaste exporten är 7 dagar gammal', () => {
    const oldestEntryAt = now - 100 * DAY;
    expect(isBackupDue({ lastExportAt: now - 7 * DAY + 1, oldestEntryAt, now })).toBe(false);
    expect(isBackupDue({ lastExportAt: now - 7 * DAY, oldestEntryAt, now })).toBe(true);
  });
});

describe('daysSince', () => {
  it('avrundar nedåt och blir aldrig negativ', () => {
    expect(daysSince(now - 7.9 * DAY, now)).toBe(7);
    expect(daysSince(now + DAY, now)).toBe(0);
  });
});
