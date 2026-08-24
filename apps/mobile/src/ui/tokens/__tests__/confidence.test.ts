/**
 * Confidence = solidity (File 02 §3.1): monotone map from model confidence to panel
 * opacity; exploratory blocks stay legible (floor) and full confidence is fully solid.
 */
import {
  confidenceOpacity,
  CONFIDENCE_OPACITY_MIN,
  CONFIDENCE_OPACITY_MAX,
  EXPERIMENT_BORDER,
} from '../confidence';

describe('confidence-as-solidity mapping', () => {
  it('maps the endpoints to the floor and full opacity', () => {
    expect(confidenceOpacity(0)).toBe(CONFIDENCE_OPACITY_MIN);
    expect(confidenceOpacity(1)).toBe(CONFIDENCE_OPACITY_MAX);
  });

  it('is monotone non-decreasing on a grid', () => {
    let prev = -Infinity;
    for (let c = 0; c <= 1.0001; c += 0.05) {
      const o = confidenceOpacity(c);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });

  it('clamps out-of-range and non-finite input instead of extrapolating', () => {
    expect(confidenceOpacity(-3)).toBe(CONFIDENCE_OPACITY_MIN);
    expect(confidenceOpacity(7)).toBe(CONFIDENCE_OPACITY_MAX);
    expect(confidenceOpacity(Number.NaN)).toBe(CONFIDENCE_OPACITY_MIN);
  });

  it('keeps the exploratory floor legible (≥0.5) and below full solidity', () => {
    expect(CONFIDENCE_OPACITY_MIN).toBeGreaterThanOrEqual(0.5);
    expect(CONFIDENCE_OPACITY_MIN).toBeLessThan(CONFIDENCE_OPACITY_MAX);
  });

  it('experiment treatment is a subtle dashed border (FR-22)', () => {
    expect(EXPERIMENT_BORDER.style).toBe('dashed');
    expect(EXPERIMENT_BORDER.width).toBeLessThanOrEqual(2);
  });
});
