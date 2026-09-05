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

export type ExactAlarmState = 'allowed' | 'denied' | 'not_applicable';

function native(): NativeExactAlarm | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireOptionalNativeModule<NativeExactAlarm>('HourwellExactAlarm');
  } catch {
    return null;
  }
}

/** Whether the OS lets this app schedule exact alarms (always `allowed` below Android 12). */
export function exactAlarmState(): ExactAlarmState {
  const m = native();
  if (m === null) return 'not_applicable';
  return m.canScheduleExactAlarms() ? 'allowed' : 'denied';
}

/** The system "Alarms & reminders" screen for this app; false when there is none. */
export function openExactAlarmSettings(): boolean {
  return native()?.openSettings() ?? false;
}
