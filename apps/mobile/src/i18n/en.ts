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

  'inbox.quickAdd.placeholder': 'Add a task — try "report draft 2h by Fri"',
  'inbox.quickAdd.add': 'Add',
  'inbox.quickAdd.input.a11y': 'Quick add task',
  'inbox.quickAdd.noTitleHint': 'Add a few words for the title',
  'inbox.preview.duration': '{minutes} min',
  'inbox.preview.deadline': 'by {date}',
  'inbox.chip.today': 'Today',
  'inbox.chip.nextWeek': 'Next week',
  'inbox.chip.date.a11y': 'Use {date} as the deadline',
  'inbox.chip.duration.a11y': 'Use {minutes} minutes as the estimate',
  'inbox.undo.deleted': 'Task deleted',
  'inbox.undo.deletedMany': '{count} tasks deleted',
  'inbox.undo.action': 'Undo',
  'inbox.row.a11y': '{title}, {category}, {minutes} minutes',
  'inbox.row.a11y.deadline': '{title}, {category}, {minutes} minutes, due {date}',
  'inbox.row.delete.a11y': 'Delete {title}',

  'task.new.title': 'New task',
  'task.edit.title': 'Edit task',
  'task.field.title': 'Title',
  'task.field.title.placeholder': 'What needs doing?',
  'task.field.category': 'Category',
  'task.category.deep': 'Deep work',
  'task.category.admin': 'Admin',
  'task.category.physical': 'Physical',
  'task.category.learning': 'Learning',
  'task.field.duration': 'Estimated minutes',
  'task.field.deadline': 'Deadline',
  'task.field.deadline.none': 'No deadline',
  'task.field.deadline.clear': 'Clear deadline',
  'task.field.earliestStart': 'Earliest start',
  'task.field.earliestStart.none': 'Anytime',
  'task.field.earliestStart.clear': 'Clear earliest start',
  'task.field.value': 'Priority',
  'task.value.1': 'Low',
  'task.value.2': 'Normal',
  'task.value.3': 'High',
  'task.field.range.error': 'Earliest start must be on or before the deadline',
  'task.field.splittable': 'Can be split into chunks',
  'task.save': 'Save changes',
  'task.create': 'Add task',
  'task.notFound': 'This task no longer exists.',

  'db.migrationFailed.title': 'Local storage problem',
  'db.migrationFailed.body':
    'Hourwell could not prepare its on-device database. Restart the app; if this persists, reinstall.',
} as const;

export type MessageKey = keyof typeof en;
