// Sentry-wrapped Expo defaults (monorepo-aware; adds source-map upload hooks at native
// build time) + .sql source files for inlined Drizzle migrations.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
config.resolver.sourceExts.push('sql');

module.exports = config;
