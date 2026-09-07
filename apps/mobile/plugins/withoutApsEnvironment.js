// Hourwell sends no push notifications (ADR-0011 / ADR-0014: local reminders only, no APNs).
// The expo-notifications config plugin still writes `aps-environment` into the iOS entitlements
// whenever the key is absent, and a personal (free) Apple team refuses the Push Notifications
// capability that entitlement stands for — the free-provisioned device build cannot be signed
// with it. Listed after `expo-notifications` in app.json so it runs on that plugin's result.
const { withEntitlementsPlist } = require('expo/config-plugins');

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withoutApsEnvironment = (config) =>
  withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });

module.exports = withoutApsEnvironment;
