import { describe, expect, it } from 'vitest';

import { isInstalledDisplay, isIosDevice } from './install';

describe('isIosDevice', () => {
  it('detects iPhone and iPad user agents', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
  });

  it('detects iPadOS posing as a Mac', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
  });

  it('does not flag desktops or Android', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });
});

describe('isInstalledDisplay', () => {
  it('is true for standalone display mode or iOS standalone', () => {
    expect(isInstalledDisplay(true)).toBe(true);
    expect(isInstalledDisplay(false, true)).toBe(true);
  });

  it('is false in a normal tab', () => {
    expect(isInstalledDisplay(false)).toBe(false);
    expect(isInstalledDisplay(false, false)).toBe(false);
  });
});
