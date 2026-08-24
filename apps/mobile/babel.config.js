// babel-preset-expo carries Reanimated 4's worklets plugin; inline-import inlines the
// drizzle-kit-generated .sql migrations (Drizzle Expo SQLite guide).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
