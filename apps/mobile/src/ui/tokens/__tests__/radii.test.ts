/**
 * File 02 §3.1: "large rounded radii (16–20 px)" — every shipped radius sits in the band
 * (pills excepted: fully-round is a shape, not a radius).
 */
import { radii, RADII_BAND } from '../radii';

describe('File 02 §3.1 radii', () => {
  it('band is 16–20 px', () => {
    expect(RADII_BAND).toEqual({ min: 16, max: 20 });
  });

  it('every non-pill radius stays inside the band', () => {
    const { pill, ...banded } = radii;
    for (const value of Object.values(banded)) {
      expect(value).toBeGreaterThanOrEqual(RADII_BAND.min);
      expect(value).toBeLessThanOrEqual(RADII_BAND.max);
    }
    expect(pill).toBeGreaterThan(RADII_BAND.max);
  });
});
