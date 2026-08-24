// Expo defaults (monorepo-aware) + .sql source files for inlined Drizzle migrations.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');

module.exports = config;
