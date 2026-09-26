/**
 * FamilyCal Simplified UTC Offset Timezone System
 *
 * DISPLAY-ONLY UTC offset system.
 * Replaces heavy timezone databases and complex multi-step conversions
 * with lightweight, high-performance, deterministic O(1) UTC offset arithmetic.
 */

export interface UtcOffsetOption {
  label: string; // e.g. "UTC +10", "UTC +5:30", "UTC -7", "UTC +0"
  offsetMinutes: number; // offset in minutes from UTC (e.g. +600, +330, -420)
}

/**
 * Standard worldwide UTC offsets including whole-hour, half-hour, and 45-minute offsets.
 */
export const UTC_OFFSET_OPTIONS: UtcOffsetOption[] = [
  { label: 'UTC -12', offsetMinutes: -720 },
  { label: 'UTC -11', offsetMinutes: -660 },
  { label: 'UTC -10', offsetMinutes: -600 },
  { label: 'UTC -9:30', offsetMinutes: -570 },
  { label: 'UTC -9', offsetMinutes: -540 },
  { label: 'UTC -8', offsetMinutes: -480 },
  { label: 'UTC -7', offsetMinutes: -420 },
  { label: 'UTC -6', offsetMinutes: -360 },
  { label: 'UTC -5', offsetMinutes: -300 },
  { label: 'UTC -4', offsetMinutes: -240 },
  { label: 'UTC -3:30', offsetMinutes: -210 },
  { label: 'UTC -3', offsetMinutes: -180 },
  { label: 'UTC -2', offsetMinutes: -120 },
  { label: 'UTC -1', offsetMinutes: -60 },
  { label: 'UTC +0', offsetMinutes: 0 },
  { label: 'UTC +1', offsetMinutes: 60 },
  { label: 'UTC +2', offsetMinutes: 120 },
  { label: 'UTC +3', offsetMinutes: 180 },
  { label: 'UTC +3:30', offsetMinutes: 210 },
  { label: 'UTC +4', offsetMinutes: 240 },
  { label: 'UTC +4:30', offsetMinutes: 270 },
  { label: 'UTC +5', offsetMinutes: 300 },
  { label: 'UTC +5:30', offsetMinutes: 330 },
  { label: 'UTC +5:45', offsetMinutes: 345 },
  { label: 'UTC +6', offsetMinutes: 360 },
  { label: 'UTC +6:30', offsetMinutes: 390 },
  { label: 'UTC +7', offsetMinutes: 420 },
  { label: 'UTC +8', offsetMinutes: 480 },
  { label: 'UTC +8:45', offsetMinutes: 525 },
  { label: 'UTC +9', offsetMinutes: 540 },
  { label: 'UTC +9:30', offsetMinutes: 570 },
  { label: 'UTC +10', offsetMinutes: 600 },
  { label: 'UTC +10:30', offsetMinutes: 630 },
  { label: 'UTC +11', offsetMinutes: 660 },
  { label: 'UTC +12', offsetMinutes: 720 },
  { label: 'UTC +12:45', offsetMinutes: 765 },
  { label: 'UTC +13', offsetMinutes: 780 },
  { label: 'UTC +14', offsetMinutes: 840 },
];

/**
 * Default fallback UTC offset (UTC +10 = 600 minutes)
 */
export const DEFAULT_UTC_OFFSET_MINUTES = 600;
export const DEFAULT_UTC_OFFSET_LABEL = 'UTC +10';

/**
 * Parses any offset string, number, or legacy timezone name into minutes from UTC.
 * Supports:
 * - Numbers: 600, -420, 0
 * - Formatted strings: "UTC +10", "UTC+10", "UTC -7", "UTC +5:30", "+10:00", "-07", "UTC"
 * - Legacy IANA strings: "Australia/Melbourne", "America/New_York", etc.
 */
export function parseUtcOffsetMinutes(tzStringOrMinutes?: string | number | null): number {
  if (tzStringOrMinutes === undefined || tzStringOrMinutes === null || tzStringOrMinutes === '') {
    return DEFAULT_UTC_OFFSET_MINUTES;
  }

  if (typeof tzStringOrMinutes === 'number') {
    return isNaN(tzStringOrMinutes) ? DEFAULT_UTC_OFFSET_MINUTES : tzStringOrMinutes;
  }

  const str = String(tzStringOrMinutes).trim();

  // If plain "UTC" or "GMT" or "Z"
  if (str.toUpperCase() === 'UTC' || str.toUpperCase() === 'GMT' || str.toUpperCase() === 'Z') {
    return 0;
  }

  // Check explicit UTC offset pattern: e.g. "UTC +10", "UTC+10:30", "UTC -9:30", "+10", "-07:00"
  const match = str.match(/(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::(\d{2}))?/i);
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const hours = parseInt(match[2], 10);
    const mins = match[3] ? parseInt(match[3], 10) : 0;
    return sign * (hours * 60 + mins);
  }

  // Check if string is just digits with sign: e.g. "+10", "-5"
  const simpleMatch = str.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (simpleMatch) {
    const hours = parseFloat(simpleMatch[1]);
    return Math.round(hours * 60);
  }

  // Graceful fallback for legacy IANA timezone strings
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: str,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tzPart) {
      const ianaMatch = tzPart.match(/(?:GMT|UTC)?\s*([+-])\s*(\d{1,2})(?::(\d{2}))?/i);
      if (ianaMatch) {
        const sign = ianaMatch[1] === '-' ? -1 : 1;
        const hours = parseInt(ianaMatch[2], 10);
        const mins = ianaMatch[3] ? parseInt(ianaMatch[3], 10) : 0;
        return sign * (hours * 60 + mins);
      }
    }
  } catch {
    // If not a recognized IANA timezone, return default
  }

  return DEFAULT_UTC_OFFSET_MINUTES;
}

/**
 * Formats offset minutes into a clean display label (e.g. "UTC +10", "UTC +5:30", "UTC -7", "UTC +0").
 */
export function formatUtcOffsetLabel(offsetMinutes: number): string {
  if (isNaN(offsetMinutes)) return DEFAULT_UTC_OFFSET_LABEL;
  if (offsetMinutes === 0) return 'UTC +0';

  const sign = offsetMinutes >= 0 ? '+' : '-';
  const totalMins = Math.abs(offsetMinutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (mins === 0) {
    return `UTC ${sign}${hours}`;
  }
  return `UTC ${sign}${hours}:${String(mins).padStart(2, '0')}`;
}

/**
 * Converts a UTC ISO timestamp or Date into local date (YYYY-MM-DD) and 24h time (HH:mm)
 * shifted by the specified UTC offset.
 */
export function isoToLocalTime(
  isoStr: string | Date,
  tzOffset?: string | number | null
): { dateStr: string; timeStr: string } {
  if (!isoStr) {
    const now = new Date();
    return {
      dateStr: now.toISOString().slice(0, 10),
      timeStr: '09:00',
    };
  }

  const d = typeof isoStr === 'string' ? new Date(isoStr) : isoStr;
  const timeMs = isNaN(d.getTime()) ? Date.now() : d.getTime();
  const offsetMinutes = parseUtcOffsetMinutes(tzOffset);

  // Apply UTC offset shift
  const shiftedDate = new Date(timeMs + offsetMinutes * 60000);

  const year = shiftedDate.getUTCFullYear();
  const month = String(shiftedDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shiftedDate.getUTCDate()).padStart(2, '0');
  const hours = String(shiftedDate.getUTCHours()).padStart(2, '0');
  const minutes = String(shiftedDate.getUTCMinutes()).padStart(2, '0');

  return {
    dateStr: `${year}-${month}-${day}`,
    timeStr: `${hours}:${minutes}`,
  };
}

/**
 * Converts a local date (YYYY-MM-DD) and 24h time (HH:mm) entered at a specified UTC offset
 * into an exact standard UTC ISO string (e.g. "2026-09-26T10:00:00.000Z").
 */
export function localTimeToISO(
  dateStr: string,
  timeStr: string,
  tzOffset?: string | number | null
): string {
  if (!dateStr) return new Date().toISOString();
  const safeTime = timeStr || '09:00';
  const offsetMinutes = parseUtcOffsetMinutes(tzOffset);

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = safeTime.split(':').map(Number);

  // Calculate UTC timestamp from local components minus the offset
  const utcMs =
    Date.UTC(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0) -
    offsetMinutes * 60000;

  return new Date(utcMs).toISOString();
}

/**
 * Formats a Date or ISO string into a localized time string (e.g. "7:00 AM" or "8:30 PM")
 * shifted by the specified UTC offset.
 */
export function formatTimeInTimezone(
  isoStr: string | Date,
  tzOffset?: string | number | null
): string {
  const { timeStr } = isoToLocalTime(isoStr, tzOffset);
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;

  return `${h12}:${mStr} ${ampm}`;
}

/**
 * Returns today's date in YYYY-MM-DD format for a given UTC offset.
 */
export function getEffectiveTodayDate(tzOffset?: string | number | null): string {
  return isoToLocalTime(new Date(), tzOffset).dateStr;
}

/**
 * Returns the UTC offset badge label (e.g. "UTC +10", "UTC +5:30", "UTC -7").
 */
export function getTimezoneBadge(tzOffset?: string | number | null): string {
  const mins = parseUtcOffsetMinutes(tzOffset);
  return formatUtcOffsetLabel(mins);
}

/**
 * Returns the friendly display label for a UTC offset.
 */
export function getTimezoneDisplayLabel(tzOffset?: string | number | null): string {
  const mins = parseUtcOffsetMinutes(tzOffset);
  return formatUtcOffsetLabel(mins);
}

/**
 * Legacy compatibility interface for components referencing TimezoneInfo.
 */
export interface TimezoneInfo {
  iana: string;
  code: string;
  city: string;
  country: string;
  province?: string;
  displayName: string;
  formattedOffset: string;
}

export function getTimezoneInfo(tzOffset?: string | number | null): TimezoneInfo {
  const label = getTimezoneBadge(tzOffset);
  return {
    iana: label,
    code: label,
    city: label,
    country: 'UTC',
    displayName: label,
    formattedOffset: label,
  };
}
