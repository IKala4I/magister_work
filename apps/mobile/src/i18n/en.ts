/**
 * English string catalog — the only user-facing string source from P2 onward (decision 6:
 * no hardcoded user-facing strings in components; Ukrainian later = add a file here).
 * Interpolation slots use `{name}` syntax, resolved by `t()`.
 */
export const en = {
  'app.name': 'Hourwell',

  'tabs.today': 'Today',
  'tabs.inbox': 'Inbox',
  'tabs.focus': 'Focus',
  'tabs.insights': 'Insights',

  'today.empty.title': 'No plan yet',
  'today.empty.body': 'Your day will appear here once planning starts.',
  'inbox.empty.title': 'Inbox is clear',
  'inbox.empty.body': 'Unscheduled tasks will land here.',
  'focus.empty.title': 'Nothing running',
  'focus.empty.body': 'Start a focus session from a planned block.',
  'insights.empty.title': 'Still learning',
  'insights.empty.body': 'Hourwell will show what it learns about your best hours here.',

  'settings.title': 'Settings',
  'settings.open.a11y': 'Open settings',
  'settings.appearance.title': 'Appearance',
  'settings.appearance.system': 'System',
  'settings.appearance.light': 'Light',
  'settings.appearance.dark': 'Dark',

  'block.experiment': 'Experiment',
  'block.confidence.a11y': 'Confidence {percent} percent',

  'db.migrationFailed.title': 'Local storage problem',
  'db.migrationFailed.body':
    'Hourwell could not prepare its on-device database. Restart the app; if this persists, reinstall.',
} as const;

export type MessageKey = keyof typeof en;
