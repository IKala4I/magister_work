/**
 * useFontScale mirrors what ThemedText renders: the OS multiplier clamped to [1, MAX_FONT_SCALE]
 * (NFR-A2 — "up to 200 %"). react-native's index re-exports the hook from this module path.
 */
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));

import { renderHook } from '@testing-library/react-native';

import { MAX_FONT_SCALE } from '../tokens/typography';
import { useFontScale } from '../useFontScale';

describe('useFontScale', () => {
  it.each([
    [1, 1],
    [1.3, 1.3],
    [2, 2],
  ])('passes %s through as %s', async (os, expected) => {
    mockFontScale = os;
    const { result } = await renderHook(() => useFontScale());
    expect(result.current).toBe(expected);
  });

  it('clamps to the ThemedText cap above 200 % and to 1 below the default size', async () => {
    mockFontScale = 3.1;
    expect((await renderHook(() => useFontScale())).result.current).toBe(MAX_FONT_SCALE);
    mockFontScale = 0.85;
    expect((await renderHook(() => useFontScale())).result.current).toBe(1);
  });
});
