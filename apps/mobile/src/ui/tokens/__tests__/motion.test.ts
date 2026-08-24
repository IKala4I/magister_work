/**
 * File 02 §3.4: springs ≤250 ms; reduced motion honored (NFR-A2) by collapsing every
 * duration to zero — never by leaving an animation half-alive.
 */
import { springs, resolveMotion, MOTION_MAX_MS } from '../motion';

describe('File 02 §3.4 motion tokens', () => {
  it('caps every spring at ≤250 ms', () => {
    expect(MOTION_MAX_MS).toBe(250);
    for (const spring of Object.values(springs)) {
      expect(spring.duration).toBeLessThanOrEqual(MOTION_MAX_MS);
      expect(spring.duration).toBeGreaterThan(0);
    }
  });

  it('reduced motion zeroes every duration (NFR-A2)', () => {
    const reduced = resolveMotion(true);
    expect(reduced.reduceMotion).toBe(true);
    for (const spring of Object.values(reduced.springs)) {
      expect(spring.duration).toBe(0);
    }
  });

  it('full motion returns the token springs untouched', () => {
    expect(resolveMotion(false).springs).toEqual(springs);
  });
});
