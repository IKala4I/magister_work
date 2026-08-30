import {
  DEFAULT_NOTIFICATION_SETTINGS,
  isValidTime,
  notificationSettingsOf,
  timeOnDay,
  withNotificationSettings,
} from '../notificationSettings';

describe('notificationSettingsOf — total parse of profiles.settings (ADR-0014 §5)', () => {
  it('null / garbage / empty → defaults', () => {
    expect(notificationSettingsOf(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(notificationSettingsOf('junk')).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(notificationSettingsOf({})).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(notificationSettingsOf({ notifications: 42 })).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });
  it('reads valid fields, drops unknown categories and duplicates, ignores a bad time', () => {
    expect(
      notificationSettingsOf({
        notifications: {
          block_reminders: false,
          muted_categories: ['admin', 'bogus', 'admin', 'deep'],
          evening_ritual: false,
          evening_ritual_time: '25:99',
        },
      }),
    ).toEqual({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      block_reminders: false,
      muted_categories: ['admin', 'deep'],
      evening_ritual: false,
    });
  });
  it('the lead time is spec-owned in v1 — a stored value never overrides it', () => {
    expect(notificationSettingsOf({ notifications: { lead_minutes: 45 } }).lead_minutes).toBe(10);
  });
});

describe('withNotificationSettings', () => {
  it('merges a patch and keeps unrelated settings keys', () => {
    const out = withNotificationSettings(
      { theme: 'x', notifications: { evening_ritual_time: '21:00' } },
      { muted_categories: ['physical', 'physical'] },
    );
    expect(out.theme).toBe('x');
    expect(out.notifications).toEqual({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      evening_ritual_time: '21:00',
      muted_categories: ['physical'],
    });
  });
  it('an invalid ritual time in the patch falls back to the default', () => {
    const out = withNotificationSettings(null, { evening_ritual_time: 'late' });
    expect((out.notifications as { evening_ritual_time: string }).evening_ritual_time).toBe(
      '20:00',
    );
  });
});

describe('time helpers', () => {
  it('isValidTime', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
    expect(isValidTime(2000)).toBe(false);
  });
  it('timeOnDay builds the local instant', () => {
    const d = timeOnDay('2026-09-06', '20:30');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 8, 6, 20, 30,
    ]);
  });
});
