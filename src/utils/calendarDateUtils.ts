import {
  format,
  isSameDay,
  differenceInCalendarDays,
  parseISO,
} from 'date-fns';
import { CalendarEvent } from '../types';

/**
 * Extracts the raw YYYY-MM-DD string from any date string or ISO timestamp
 * without timezone offset distortion.
 */
export function parseAllDayDateString(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.slice(0, 10);
}

/**
 * Converts stored event start/end timestamps into inclusive YYYY-MM-DD date strings
 * for the event modal editor.
 *
 * If the event was stored with an exclusive end date (e.g. from Google Calendar sync
 * where end_time has T00:00:00 on the following day), it converts it back to the
 * inclusive end date so the user sees the exact dates they selected.
 */
export function getInclusiveAllDayDates(event: {
  all_day?: boolean | number;
  start_time: string;
  end_time: string;
}): { startDate: string; endDate: string } {
  const sStr = parseAllDayDateString(event.start_time) || format(new Date(), 'yyyy-MM-dd');
  let eStr = parseAllDayDateString(event.end_time) || sStr;

  // Detect exclusive end date (e.g. 00:00:00 or date string without 23:59:59 where end > start)
  if (
    event.end_time &&
    (event.end_time.includes('T00:00:00') || !event.end_time.includes('T')) &&
    !event.end_time.includes('23:59') &&
    eStr > sStr
  ) {
    const eDateObj = new Date(eStr + 'T00:00:00Z');
    eDateObj.setUTCDate(eDateObj.getUTCDate() - 1);
    const adjusted = eDateObj.toISOString().slice(0, 10);
    if (adjusted >= sStr) {
      eStr = adjusted;
    }
  }

  return {
    startDate: sStr,
    endDate: eStr >= sStr ? eStr : sStr,
  };
}

/**
 * Formats inclusive start and end dates for an all-day event payload.
 */
export function formatAllDayPayloadDates(
  startDate: string,
  endDate: string
): { start_time: string; end_time: string; all_day: true } {
  const sStr = startDate || format(new Date(), 'yyyy-MM-dd');
  const eStr = endDate && endDate >= sStr ? endDate : sStr;
  return {
    start_time: `${sStr}T00:00:00Z`,
    end_time: `${eStr}T23:59:59Z`,
    all_day: true,
  };
}

/**
 * Checks if a calendar event (all-day or timed) is active on a specific day.
 */
export function isEventOnDay(evt: CalendarEvent, dayDate: Date): boolean {
  if (evt.all_day) {
    const dayStr = format(dayDate, 'yyyy-MM-dd');
    const sStr = evt.start_time.slice(0, 10);
    const eStr = evt.end_time ? evt.end_time.slice(0, 10) : sStr;
    const finalEnd = eStr >= sStr ? eStr : sStr;

    if (dayStr >= sStr && dayStr <= finalEnd) return true;

    // Recurrence for all-day events
    if (evt.recurring_rule === 'daily' && dayStr >= sStr) {
      if (!evt.recurring_until || dayStr <= evt.recurring_until.slice(0, 10)) return true;
    }
    if (evt.recurring_rule === 'weekly' && dayStr >= sStr) {
      const startD = parseISO(sStr);
      if (dayDate.getDay() === startD.getDay()) {
        if (!evt.recurring_until || dayStr <= evt.recurring_until.slice(0, 10)) return true;
      }
    }
    if (evt.recurring_rule === 'biweekly' && dayStr >= sStr) {
      const diffDays = differenceInCalendarDays(dayDate, parseISO(sStr));
      if (diffDays >= 0 && diffDays % 14 === 0) {
        if (!evt.recurring_until || dayStr <= evt.recurring_until.slice(0, 10)) return true;
      }
    }
    if (evt.recurring_rule === 'monthly' && dayStr >= sStr) {
      if (parseISO(dayStr).getDate() === parseISO(sStr).getDate()) {
        if (!evt.recurring_until || dayStr <= evt.recurring_until.slice(0, 10)) return true;
      }
    }
    if (evt.recurring_rule === 'yearly' && dayStr >= sStr) {
      const sDateObj = parseISO(sStr);
      if (dayDate.getMonth() === sDateObj.getMonth() && dayDate.getDate() === sDateObj.getDate()) {
        if (!evt.recurring_until || dayStr <= evt.recurring_until.slice(0, 10)) return true;
      }
    }
    return false;
  }

  // Timed event logic (unchanged)
  const evtStart = new Date(evt.start_time);
  const evtEnd = new Date(evt.end_time);

  if (isSameDay(evtStart, dayDate) || (dayDate >= evtStart && dayDate <= evtEnd)) return true;

  if (evt.recurring_rule === 'daily' && dayDate >= evtStart) {
    if (!evt.recurring_until || dayDate <= new Date(evt.recurring_until)) return true;
  }
  if (evt.recurring_rule === 'weekly' && dayDate >= evtStart) {
    if (dayDate.getDay() === evtStart.getDay()) {
      if (!evt.recurring_until || dayDate <= new Date(evt.recurring_until)) return true;
    }
  }
  if (evt.recurring_rule === 'biweekly' && dayDate >= evtStart) {
    const diffDays = differenceInCalendarDays(dayDate, evtStart);
    if (diffDays >= 0 && diffDays % 14 === 0) {
      if (!evt.recurring_until || dayDate <= new Date(evt.recurring_until)) return true;
    }
  }
  if (evt.recurring_rule === 'monthly' && dayDate >= evtStart) {
    if (dayDate.getDate() === evtStart.getDate()) {
      if (!evt.recurring_until || dayDate <= new Date(evt.recurring_until)) return true;
    }
  }
  if (evt.recurring_rule === 'yearly' && dayDate >= evtStart) {
    if (dayDate.getMonth() === evtStart.getMonth() && dayDate.getDate() === evtStart.getDate()) {
      if (!evt.recurring_until || dayDate <= new Date(evt.recurring_until)) return true;
    }
  }

  return false;
}

/**
 * Determines whether an event spans multiple days.
 */
export function isEventMultiDay(evt: CalendarEvent): boolean {
  if (evt.recurring_rule && evt.recurring_rule !== 'none') return false;
  if (evt.all_day) {
    const sStr = evt.start_time.slice(0, 10);
    const eStr = evt.end_time ? evt.end_time.slice(0, 10) : sStr;
    return sStr !== eStr && eStr > sStr;
  }
  const s = new Date(evt.start_time);
  const e = new Date(evt.end_time);
  return !isSameDay(s, e) && e > s;
}

/**
 * Adds a given number of minutes to a date (YYYY-MM-DD) and time (HH:mm) string.
 * Automatically handles crossing midnight into the next day(s).
 */
export function addMinutesToDateTime(
  dateStr: string,
  timeStr: string,
  minutes: number = 30
): { date: string; time: string } {
  const safeDate = dateStr || format(new Date(), 'yyyy-MM-dd');
  const safeTime = timeStr || '09:00';

  const [year, month, day] = safeDate.split('-').map(Number);
  const [hours, mins] = safeTime.split(':').map(Number);

  const dt = new Date(year, (month || 1) - 1, day || 1, hours || 0, (mins || 0) + minutes, 0);

  return {
    date: format(dt, 'yyyy-MM-dd'),
    time: format(dt, 'HH:mm'),
  };
}

/**
 * Checks if the end datetime is strictly after the start datetime.
 */
export function isEndAfterStart(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string
): boolean {
  if (!startDate || !startTime || !endDate || !endTime) return false;

  const [sY, sM, sD] = startDate.split('-').map(Number);
  const [sH, sMin] = startTime.split(':').map(Number);
  const startDt = new Date(sY, (sM || 1) - 1, sD || 1, sH || 0, sMin || 0, 0);

  const [eY, eM, eD] = endDate.split('-').map(Number);
  const [eH, eMin] = endTime.split(':').map(Number);
  const endDt = new Date(eY, (eM || 1) - 1, eD || 1, eH || 0, eMin || 0, 0);

  return endDt.getTime() > startDt.getTime();
}

