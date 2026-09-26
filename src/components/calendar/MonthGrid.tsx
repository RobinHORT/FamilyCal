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
  parseISO,
} from 'date-fns';
import { CalendarEvent, FamilyMember, EventType, Task } from '../../types';
import { MultiDayEventBar, MultiDayTaskBar } from './EventCard';
import { isEventOnDay, isEventMultiDay } from '../../utils/calendarDateUtils';

interface MonthGridProps {
  currentDate: Date;
  selectedDay?: Date | null;
  onSelectDay: (day: Date) => void;
  filteredEvents?: CalendarEvent[];
  tasks?: Task[];
  members: FamilyMember[];
  eventTypes?: EventType[];
  onEditEvent?: (event: CalendarEvent) => void;
  onEditTask?: (task: Task) => void;
  maxVisibleSlots?: number;
  className?: string;
}

interface WeekItemSlot {
  type: 'event' | 'task';
  id: string;
  event?: CalendarEvent;
  task?: Task;
  startCol: number;
  endCol: number;
  isStartOfWeek: boolean;
  isEndOfWeek: boolean;
  isMultiDay: boolean;
  sortTime: number;
}

interface ScheduledSlot extends WeekItemSlot {
  slotIdx: number;
}

export const MonthGrid: React.FC<MonthGridProps> = ({
  currentDate,
  selectedDay,
  onSelectDay,
  filteredEvents = [],
  tasks = [],
  members,
  eventTypes,
  onEditEvent,
  onEditTask,
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
    return filteredEvents.filter((evt) => isEventOnDay(evt, dayDate));
  };

  const getTasksForDay = (dayDate: Date) => {
    if (!tasks || tasks.length === 0) return [];
    const dayStr = format(dayDate, 'yyyy-MM-dd');

    return tasks.filter((t) => {
      if (t.is_archived) return false;

      const sStr = (t as any).start_date || (t as any).start_time;
      const eStr = (t as any).end_date || (t as any).end_time || t.due_date;

      if (sStr && eStr) {
        const s = parseISO(sStr.slice(0, 10));
        const e = parseISO(eStr.slice(0, 10));
        if (isSameDay(s, dayDate) || (dayDate >= s && dayDate <= e)) return true;
      } else if (t.due_date && t.due_date.slice(0, 10) === dayStr) {
        return true;
      }

      if (!t.due_date) return false;
      // Spawned child tasks are tied to a single occurrence date and never project recurrence
      if (t.parent_task_id) return false;

      const due = parseISO(t.due_date.slice(0, 10));
      if (dayDate < due) return false;
      // Completed recurring tasks should not project forward into future dates
      if (t.completed && dayDate > due) return false;

      const rule = t.recurring_rule;
      if (!rule || rule === 'none') return false;

      const interval = Math.max(1, Number(t.recurring_interval) || 1);
      const diffDays = differenceInCalendarDays(dayDate, due);

      if (rule === 'daily') {
        return diffDays % interval === 0;
      }
      if (rule === 'weekly') {
        return dayDate.getDay() === due.getDay() && Math.floor(diffDays / 7) % interval === 0;
      }
      if (rule === 'fortnightly') {
        return diffDays >= 0 && diffDays % 14 === 0;
      }
      if (rule === 'monthly') {
        return dayDate.getDate() === due.getDate();
      }
      if (rule === 'custom') {
        const unit = t.recurring_unit || 'day';
        if (unit === 'day') return diffDays % interval === 0;
        if (unit === 'week') return dayDate.getDay() === due.getDay() && Math.floor(diffDays / 7) % interval === 0;
        if (unit === 'month') return dayDate.getDate() === due.getDate();
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

  const isTaskMultiDay = (t: Task) => {
    if (t.recurring_rule && t.recurring_rule !== 'none') return false;
    const sStr = (t as any).start_date || (t as any).start_time;
    const eStr = (t as any).end_date || (t as any).end_time || t.due_date;
    if (!sStr || !eStr) return false;
    const s = parseISO(sStr.slice(0, 10));
    const e = parseISO(eStr.slice(0, 10));
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
          // Map all items in this week
          const weekItemsMap = new Map<string, WeekItemSlot>();

          // Process Events
          weekDays.forEach((dayDate, colIdx) => {
            const dayEvts = getEventsForDay(dayDate);
            dayEvts.forEach((evt) => {
              const multi = isEventMultiDay(evt);
              const key = `evt-${evt.id}`;
              if (!weekItemsMap.has(key)) {
                let startCol = colIdx;
                let endCol = colIdx;
                const evtStart = new Date(evt.start_time);
                const evtEnd = new Date(evt.end_time);

                if (multi) {
                  for (let c = 0; c < 7; c++) {
                    const d = weekDays[c];
                    if (isEventOnDay(evt, d)) {
                      startCol = c;
                      break;
                    }
                  }
                  for (let c = 6; c >= 0; c--) {
                    const d = weekDays[c];
                    if (isEventOnDay(evt, d)) {
                      endCol = c;
                      break;
                    }
                  }
                }

                const sDateComp = evt.all_day ? evt.start_time.slice(0, 10) : format(evtStart, 'yyyy-MM-dd');
                const eDateComp = evt.all_day ? (evt.end_time ? evt.end_time.slice(0, 10) : sDateComp) : format(evtEnd, 'yyyy-MM-dd');
                const weekStartComp = format(weekDays[0], 'yyyy-MM-dd');
                const weekEndComp = format(weekDays[6], 'yyyy-MM-dd');

                const isStartOfWeek = multi && startCol === 0 && sDateComp < weekStartComp;
                const isEndOfWeek = multi && endCol === 6 && eDateComp > weekEndComp;

                weekItemsMap.set(key, {
                  type: 'event',
                  id: evt.id,
                  event: evt,
                  startCol,
                  endCol,
                  isStartOfWeek,
                  isEndOfWeek,
                  isMultiDay: multi,
                  sortTime: evtStart.getTime(),
                });
              } else if (multi) {
                const info = weekItemsMap.get(key)!;
                if (colIdx > info.endCol) {
                  info.endCol = colIdx;
                }
              }
            });
          });

          // Process Tasks
          weekDays.forEach((dayDate, colIdx) => {
            const dayTasks = getTasksForDay(dayDate);
            dayTasks.forEach((task) => {
              const multi = isTaskMultiDay(task);
              const key = `task-${task.id}`;
              if (!weekItemsMap.has(key)) {
                let startCol = colIdx;
                let endCol = colIdx;
                const sStr = (task as any).start_date || (task as any).start_time || task.due_date;
                const eStr = (task as any).end_date || (task as any).end_time || task.due_date;
                const taskStart = sStr ? parseISO(sStr.slice(0, 10)) : dayDate;
                const taskEnd = eStr ? parseISO(eStr.slice(0, 10)) : dayDate;

                if (multi) {
                  for (let c = 0; c < 7; c++) {
                    const d = weekDays[c];
                    if (isSameDay(taskStart, d) || (d >= taskStart && d <= taskEnd)) {
                      startCol = c;
                      break;
                    }
                  }
                  for (let c = 6; c >= 0; c--) {
                    const d = weekDays[c];
                    if (isSameDay(taskEnd, d) || (d >= taskStart && d <= taskEnd)) {
                      endCol = c;
                      break;
                    }
                  }
                }

                const isStartOfWeek = multi && startCol === 0 && taskStart < weekDays[0];
                const isEndOfWeek = multi && endCol === 6 && taskEnd >= addDays(weekDays[6], 1);

                weekItemsMap.set(key, {
                  type: 'task',
                  id: task.id,
                  task,
                  startCol,
                  endCol,
                  isStartOfWeek,
                  isEndOfWeek,
                  isMultiDay: multi,
                  sortTime: taskStart.getTime(),
                });
              } else if (multi) {
                const info = weekItemsMap.get(key)!;
                if (colIdx > info.endCol) {
                  info.endCol = colIdx;
                }
              }
            });
          });

          // Sort week items: multi-day with longest span first, then startCol, then sortTime
          const sortedWeekItems = Array.from(weekItemsMap.values()).sort((a, b) => {
            const spanA = a.endCol - a.startCol;
            const spanB = b.endCol - b.startCol;
            if (spanA !== spanB) return spanB - spanA;
            if (a.startCol !== b.startCol) return a.startCol - b.startCol;
            return a.sortTime - b.sortTime;
          });

          // Slot assignment matrix
          const scheduledSlots: ScheduledSlot[] = [];
          const occupied: boolean[][] = Array.from({ length: 7 }, () => []);

          sortedWeekItems.forEach((item) => {
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
            <div key={weekIdx} className="flex-1 flex flex-col min-h-[96px] md:min-h-0 border-b border-gray-100 last:border-b-0 relative">
              {/* Day Cells Grid */}
              <div className="grid grid-cols-7 flex-1 divide-x divide-gray-100 relative h-full">
                {weekDays.map((dayDate, colIdx) => {
                  const isCurrentMonth = isSameMonth(dayDate, monthStart);
                  const isDayToday = isToday(dayDate);
                  const isSelected = Boolean(selectedDay && isSameDay(dayDate, selectedDay));
                  const itemsOnThisDay = scheduledSlots.filter(
                    (s) => s.startCol <= colIdx && colIdx <= s.endCol
                  );
                  const overflowCount = itemsOnThisDay.filter((s) => s.slotIdx >= maxVisibleSlots).length;

                  return (
                    <div
                      key={dayDate.toISOString()}
                      onClick={() => onSelectDay(dayDate)}
                      className={`p-1 sm:p-1.5 flex flex-col justify-between transition-colors cursor-pointer select-none relative min-h-[96px] md:min-h-0 ${
                        !isCurrentMonth ? 'bg-gray-50/40 text-gray-300' : 'bg-white text-gray-800'
                      } ${isSelected ? 'ring-2 ring-blue-500/80 ring-inset bg-blue-50/20' : ''}`}
                    >
                      {/* Day Number Header */}
                      <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                        <span
                          className={`text-[11px] sm:text-xs font-extrabold flex items-center justify-center rounded-lg w-5 h-5 sm:w-6 sm:h-6 ${
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
                        <div className="text-[10px] sm:text-[11px] font-extrabold text-blue-600 pl-0.5 pt-0.5 relative z-20 pointer-events-none">
                          +{overflowCount} more
                        </div>
                      ) : (
                        <div className="h-2" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Overlay Layer for Spanning Continuous Multi-Day and Single-Day Pills */}
              <div className="absolute inset-x-0 top-[26px] sm:top-8 px-1 sm:px-1.5 flex flex-col gap-1 pointer-events-none z-10">
                {Array.from({ length: maxVisibleSlots }).map((_, slotIdx) => {
                  const itemsInRow = scheduledSlots.filter((s) => s.slotIdx === slotIdx);

                  return (
                    <div key={slotIdx} className="grid grid-cols-7 gap-x-1 sm:gap-x-1.5 h-5 sm:h-5.5 relative">
                      {itemsInRow.map((slotInfo) => {
                        const { type, event, task, startCol, endCol, isStartOfWeek, isEndOfWeek } = slotInfo;
                        const spanCount = endCol - startCol + 1;

                        if (type === 'event' && event) {
                          return (
                            <MultiDayEventBar
                              key={`evt-${event.id}-${slotIdx}`}
                              event={event}
                              startCol={startCol}
                              endCol={endCol}
                              spanCount={spanCount}
                              isStartOfWeek={isStartOfWeek}
                              isEndOfWeek={isEndOfWeek}
                              members={members}
                              eventTypes={eventTypes}
                            />
                          );
                        }

                        if (type === 'task' && task) {
                          return (
                            <MultiDayTaskBar
                              key={`task-${task.id}-${slotIdx}`}
                              task={task}
                              startCol={startCol}
                              endCol={endCol}
                              spanCount={spanCount}
                              isStartOfWeek={isStartOfWeek}
                              isEndOfWeek={isEndOfWeek}
                              members={members}
                            />
                          );
                        }

                        return null;
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
