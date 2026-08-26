/**
 * Attribution-day formatting (File 05 §1: events carry the user's local calendar day).
 * Uses the device's local calendar fields directly, so DST transitions can never shift a
 * timestamp into the wrong day — the day is whatever the wall clock said.
 */
export function localDayOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
