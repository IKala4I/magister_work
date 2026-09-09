/**
 * Date and time rendering, bound to the app's language rather than the phone's.
 *
 * Every one of these used to be `toLocale*(undefined, …)`, which asks the OS. That is correct
 * only while the two agree: with an in-app language switch, a Ukrainian interface on an English
 * phone would print "Wed, 9 Sep" under Ukrainian prose. `localeTag()` decides the tag — language
 * from the catalog, regional conventions from the phone — and these wrappers are the only way
 * dates reach the UI.
 */
import { localeTag } from './locale';

/** The hour:minute shape used by the timeline, the move picker and the block cards. */
export const CLOCK_OPTIONS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(localeTag(), options);
}

export function formatTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = CLOCK_OPTIONS,
): string {
  return date.toLocaleTimeString(localeTag(), options);
}

export function formatDateTime(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString(localeTag(), options);
}
