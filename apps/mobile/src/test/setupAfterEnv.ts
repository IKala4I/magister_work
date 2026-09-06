/**
 * After-env setup: Reanimated's jest matchers/timers (`toHaveAnimatedStyle`, frame time) — the
 * Reanimated testing guide puts `setUpTests()` in setupFilesAfterEnv for jest ≥ 28.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-reanimated').setUpTests();
