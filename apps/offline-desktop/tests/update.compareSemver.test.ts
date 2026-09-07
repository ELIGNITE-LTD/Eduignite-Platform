import { describe, expect, it } from 'vitest';
import { compareSemver } from '../src/update/compareSemver';

describe('compareSemver', () => {
  it('treats equal versions as equal', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('orders by patch version difference', () => {
    expect(compareSemver('1.0.1', '1.0.2')).toBe(-1);
    expect(compareSemver('1.0.2', '1.0.1')).toBe(1);
  });

  it('orders by minor version difference', () => {
    expect(compareSemver('1.2.0', '1.3.0')).toBe(-1);
    expect(compareSemver('1.3.0', '1.2.0')).toBe(1);
  });

  it('orders by major version difference', () => {
    expect(compareSemver('1.9.9', '2.0.0')).toBe(-1);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
  });

  it('never falls into the classic string-comparison trap ("1.0.9" vs "1.0.10")', () => {
    // As plain strings, "1.0.9" > "1.0.10" is true (character-by-character
    // comparison) even though 1.0.10 is the numerically newer release.
    expect('1.0.9' > '1.0.10').toBe(true);
    expect(compareSemver('1.0.9', '1.0.10')).toBe(-1);
    expect(compareSemver('1.0.10', '1.0.9')).toBe(1);
  });

  it('handles multi-digit segments beyond the trap case too', () => {
    expect(compareSemver('1.2.9', '1.2.10')).toBe(-1);
    expect(compareSemver('1.9.0', '1.10.0')).toBe(-1);
    expect(compareSemver('9.0.0', '10.0.0')).toBe(-1);
  });

  it('treats a missing trailing segment as 0', () => {
    expect(compareSemver('1.2', '1.2.0')).toBe(0);
    expect(compareSemver('1.2.1', '1.2')).toBe(1);
    expect(compareSemver('1.2', '1.2.1')).toBe(-1);
  });

  it('strips pre-release/build metadata suffixes before comparing', () => {
    expect(compareSemver('1.2.0-beta.1', '1.2.0')).toBe(0);
    expect(compareSemver('1.2.0+build5', '1.2.0')).toBe(0);
  });
});
