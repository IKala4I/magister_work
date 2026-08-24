/**
 * Shared jest setup. Native-module seams that nearly every component test needs:
 * expo-localization (locale detection) is mocked to an English device; react-native-mmkv
 * is replaced via moduleNameMapper (see package.json).
 */
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}));
