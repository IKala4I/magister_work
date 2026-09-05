/**
 * Binding for the Android exact-alarm state (FR-50; hardware pass day 4 item 8: inexact alarms
 * drifted +31–60 min and one reminder was never shown). Android only — elsewhere the module is
 * absent and the state is `not_applicable`. Two calls; the policy (when to prompt, what to log)
 * lives in src/domain/notificationActions.ts.
 */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface NativeExactAlarm {
  canScheduleExactAlarms(): boolean;
  openSettings(): boolean;
}

/**
 * `not_applicable` = not Android; `unavailable` = Android without the native module (a bundle
 * older than build 6, an autolinking regression) — distinguishable in telemetry, never prompted.
 */
export type ExactAlarmState = 'allowed' | 'denied' | 'not_applicable' | 'unavailable';

function native(): NativeExactAlarm | null {
  try {
    return requireOptionalNativeModule<NativeExactAlarm>('HourwellExactAlarm');
  } catch {
    return null;
  }
}

/** Whether the OS lets this app schedule exact alarms (`allowed` below Android 12: every alarm is). */
export function exactAlarmState(): ExactAlarmState {
  if (Platform.OS !== 'android') return 'not_applicable';
  const m = native();
  if (m === null) return 'unavailable';
  return m.canScheduleExactAlarms() ? 'allowed' : 'denied';
}

/** The system "Alarms & reminders" screen for this app; false when there is none. */
export function openExactAlarmSettings(): boolean {
  return native()?.openSettings() ?? false;
}
