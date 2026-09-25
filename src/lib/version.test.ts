import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { BUILD_INFO, formatBuildTime, versionLine } from './version.ts';

describe('version', () => {
  it('bakas in från package.json vid bygget', () => {
    expect(BUILD_INFO.version).toBe(pkg.version);
    expect(BUILD_INFO.commit).toMatch(/^([0-9a-f]{7}|dev)$/);
    expect(Number.isNaN(Date.parse(BUILD_INFO.buildTime))).toBe(false);
  });

  it('formaterar sidfotsraden och byggtiden', () => {
    expect(versionLine({ version: '1.2.3', commit: 'abc1234', buildTime: '' })).toBe(
      'Viktresan 1.2.3 (abc1234)',
    );
    expect(formatBuildTime('inte ett datum')).toBe('inte ett datum');
    expect(formatBuildTime('2026-09-25T12:00:00Z')).toMatch(/2026/);
  });
});
