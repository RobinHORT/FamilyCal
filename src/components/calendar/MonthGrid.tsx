import React from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
  differenceInCalendarDays,
} from 'date-fns';
import { CalendarEvent, FamilyMember, EventType } from '../../types';
import { EventPill, MultiDayEventBar } from './EventCard';

interface MonthGridProps {
  currentDate: Date;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  filteredEvents: CalendarEvent[];
  members: FamilyMember[];
  eventTypes?: EventType[];
  onEditEvent?: (event: CalendarEvent) => void;
  maxVisibleSlots?: number;
  className?: string;
}

interface WeekEventSlot {
  event: CalendarEvent;
  startCol: number;
  endCol: number;
  isStartOfWeek: boolean;
  isEndOfWeek: boolean;
  isMultiDay: boolean;
}

interface ScheduledSlot extends WeekEventSlot {
  slotIdx: number;
}

export const MonthGrid: React.FC<MonthGridProps> = ({
  currentDate,
  selectedDay,
  onSelectDay,
  filteredEvents,
  members,
  eventTypes,
  onEditEvent,
  maxVisibleSlots = 2,
  className = '',
}) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = startDate;
  while (day <= endDate) {
    days.push(day);
    day = addDays(day, 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const getEventsForDay = (dayDate: Date) => {
    return filteredEvents.filter((evt) => {
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
    });
  };

  const isEventMultiDay = (evt: CalendarEvent) => {
    if (evt.recurring_rule && evt.recurring_rule !== 'none') return false;
    const s = new Date(evt.start_time);
    const e = new Date(evt.end_time);
    return !isSameDay(s, e) && e > s;
  };

  return (
    <div className={`flex flex-col flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs ${className}`}>
      {/* 7 Days Header */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/70 text-center text-[11px] sm:text-xs font-bold text-gray-500 py-1.5 sm:py-2 shrink-0 select-none">
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
        <div>Sun</div>
      </div>

      {/* Week Rows */}
      <div className="flex-1 flex flex-col divide-y divide-gray-100 bg-gray-50/20 min-h-0 h-full">
        {weeks.map((weekDays, weekIdx) => {
          // Map events in this week
          const weekEventsMap = new Map<string, WeekEventSlot>();

          weekDays.forEach((dayDate, colIdx) => {
            const dayEvts = getEventsForDay(dayDate);
            dayEvts.forEach((evt) => {
              const multi = isEventMultiDay(evt);
              if (!weekEventsMap.has(evt.id)) {
                let startCol = colIdx;
                let endCol = colIdx;
                const evtStart = new Date(evt.start_time);
                const evtEnd = new Date(evt.end_time);

                if (multi) {
                  for (let c = 0; c < 7; c++) {
                    const d = weekDays[c];
                    if (isSameDay(evtStart, d) || (d >= evtStart && d <= evtEnd)) {
                      startCol = c;
                      break;
                    }
                  }
                  for (let c = 6; c >= 0; c--) {
                    const d = weekDays[c];
                    if (isSameDay(evtEnd, d) || (d >= evtStart && d <= evtEnd)) {
                      endCol = c;
                      break;
                    }
                  }
                }

                const isStartOfWeek = multi && startCol === 0 && evtStart < weekDays[0];
                const isEndOfWeek = multi && endCol === 6 && evtEnd >= addDays(weekDays[6], 1);

                weekEventsMap.set(evt.id, {
                  event: evt,
                  startCol,
                  endCol,
                  isStartOfWeek,
                  isEndOfWeek,
                  isMultiDay: multi,
                });
              } else if (multi) {
                const info = weekEventsMap.get(evt.id)!;
                if (colIdx > info.endCol) {
                  info.endCol = colIdx;
                }
              }
            });
          });

          // Sort week events
          const sortedWeekEvents = Array.from(weekEventsMap.values()).sort((a, b) => {
            const spanA = a.endCol - a.startCol;
            const spanB = b.endCol - b.startCol;
            if (spanA !== spanB) return spanB - spanA; // Longer multi-day first
            if (a.startCol !== b.startCol) return a.startCol - b.startCol;
            return new Date(a.event.start_time).getTime() - new Date(b.event.start_time).getTime();
          });

          // Slot assignment matrix
          const scheduledSlots: ScheduledSlot[] = [];
          const occupied: boolean[][] = Array.from({ length: 7 }, () => []);

          sortedWeekEvents.forEach((item) => {
            let slot = 0;
            while (true) {
              let isFree = true;
              for (let c = item.startCol; c <= item.endCol; c++) {
                if (occupied[c] && occupied[c][slot]) {
                  isFree = false;
                  break;
                }
              }
              if (isFree) {
                for (let c = item.startCol; c <= item.endCol; c++) {
                  if (!occupied[c]) occupied[c] = [];
                  occupied[c][slot] = true;
                }
                scheduledSlots.push({ ...item, slotIdx: slot });
                break;
              }
              slot++;
            }
          });

          return (
            <div key={weekIdx} className="flex-1 flex flex-col min-h-0 border-b border-gray-100 last:border-b-0 relative">
              {/* Day Cells Grid */}
              <div className="grid grid-cols-7 flex-1 divide-x divide-gray-100 relative h-full">
                {weekDays.map((dayDate, colIdx) => {
                  const isCurrentMonth = isSameMonth(dayDate, monthStart);
                  const isDayToday = isToday(dayDate);
                  const isSelected = isSameDay(dayDate, selectedDay);
                  const allDayEvts = getEventsForDay(dayDate);
                  const totalEventsOnDay = allDayEvts.length;
                  const overflowCount = Math.max(0, totalEventsOnDay - maxVisibleSlots);

                  return (
                    <div
                      key={dayDate.toISOString()}
                      onClick={() => onSelectDay(dayDate)}
                      className={`p-1 sm:p-1.5 flex flex-col justify-between transition-colors cursor-pointer select-none relative ${
                        !isCurrentMonth ? 'bg-gray-50/40 text-gray-300' : 'bg-white text-gray-800'
                      } ${isSelected ? 'ring-2 ring-blue-500/80 ring-inset bg-blue-50/20' : ''}`}
                    >
                      {/* Day Number Header */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-extrabold flex items-center justify-center rounded-lg w-5 h-5 sm:w-6 sm:h-6 ${
                            isDayToday
                              ? 'bg-blue-600 text-white shadow-xs'
                              : isCurrentMonth
                              ? 'text-slate-800'
                              : 'text-gray-300'
                          }`}
                        >
                          {format(dayDate, 'd')}
                        </span>
                      </div>

                      {/* Spacer for slots */}
                      <div className="flex-1 my-0.5" />

                      {/* Overflow +X more link */}
                      {overflowCount > 0 ? (
                        <div
                          className="text-[10px] sm:text-[11px] font-extrabold text-blue-600 hover:underline pl-0.5 pt-0.5 relative z-20"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDay(dayDate);
                          }}
                        >
                          +{overflowCount} more
                        </div>
                      ) : (
                        <div className="h-2" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Events Overlay Layer */}
              <div className="absolute inset-x-0 top-7 sm:top-8 px-1 sm:px-1.5 flex flex-col gap-1 pointer-events-none z-10">
                {Array.from({ length: maxVisibleSlots }).map((_, slotIdx) => {
                  const eventsInRow = scheduledSlots.filter((s) => s.slotIdx === slotIdx);

                  return (
                    <div key={slotIdx} className="grid grid-cols-7 gap-x-1 sm:gap-x-1.5 h-5 sm:h-5.5 relative">
                      {eventsInRow.map((slotInfo) => {
                        const { event, startCol, endCol, isStartOfWeek, isEndOfWeek } = slotInfo;
                        const spanCount = endCol - startCol + 1;

                        return (
                          <MultiDayEventBar
                            key={event.id + '-' + slotIdx}
                            event={event}
                            startCol={startCol}
                            endCol={endCol}
                            spanCount={spanCount}
                            isStartOfWeek={isStartOfWeek}
                            isEndOfWeek={isEndOfWeek}
                            members={members}
                            eventTypes={eventTypes}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onEditEvent) onEditEvent(event);
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
