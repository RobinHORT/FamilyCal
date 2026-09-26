/**
 * FamilyCal Local Date & Time Utilities
 *
 * Uses the user's device/browser local date and time for display,
 * input formatting, and conversion without external timezone offsets.
 */

/**
 * Converts an ISO timestamp or Date into local date (YYYY-MM-DD) and 24h time (HH:mm)
 * using the browser/device local time.
 */
export function isoToLocalTime(
  isoStr?: string | Date | null
): { dateStr: string; timeStr: string } {
  if (!isoStr) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return {
      dateStr: `${year}-${month}-${day}`,
      timeStr: '09:00',
    };
  }

  const d = typeof isoStr === 'string' ? new Date(isoStr) : isoStr;
  if (isNaN(d.getTime())) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return {
      dateStr: `${year}-${month}-${day}`,
      timeStr: '09:00',
    };
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return {
    dateStr: `${year}-${month}-${day}`,
    timeStr: `${hours}:${minutes}`,
  };
}

/**
 * Converts a local date (YYYY-MM-DD) and 24h time (HH:mm)
 * into a standard ISO string based on the user's browser/device local time.
 */
export function localTimeToISO(
  dateStr: string,
  timeStr: string
): string {
  if (!dateStr) return new Date().toISOString();
  const safeTime = timeStr || '09:00';
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = safeTime.split(':').map(Number);

  const localDate = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0);
  return localDate.toISOString();
}

/**
 * Formats a Date or ISO string into a localized time string (e.g. "9:00 AM" or "8:30 PM")
 * using the user's browser/device local time.
 */
export function formatTimeInTimezone(
  isoStr?: string | Date | null
): string {
  if (!isoStr) return '';
  const d = typeof isoStr === 'string' ? new Date(isoStr) : isoStr;
  if (isNaN(d.getTime())) return '';

  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;

  return `${h12}:${minutes} ${ampm}`;
}

export const formatTimeInLocal = formatTimeInTimezone;

/**
 * Returns today's date in YYYY-MM-DD format based on browser/device local time.
 */
export function getEffectiveTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
