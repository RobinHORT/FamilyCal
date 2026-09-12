import React from 'react';
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
} from 'date-fns';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { Plus } from 'lucide-react';
import { EventCard } from './EventCard';

export const WeekView: React.FC = () => {
  const {
    currentDate,
    filteredEvents,
    openCreateEventModal,
    openEditEventModal,
    eventTypes,
  } = useCalendar();
  const { members } = useFamily();

  // Week starts on Monday (weekStartsOn: 1)
  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const getEventsForDay = (day: Date) => {
    return filteredEvents.filter((evt) => {
      const evtStart = new Date(evt.start_time);
      const evtEnd = new Date(evt.end_time);

      if (isSameDay(evtStart, day) || (day >= evtStart && day <= evtEnd)) return true;

      if (evt.recurring_rule === 'daily' && day >= evtStart) {
        if (!evt.recurring_until || day <= new Date(evt.recurring_until)) return true;
      }
      if (evt.recurring_rule === 'weekly' && day >= evtStart) {
        if (day.getDay() === evtStart.getDay()) {
          if (!evt.recurring_until || day <= new Date(evt.recurring_until)) return true;
        }
      }
      if (evt.recurring_rule === 'monthly' && day >= evtStart) {
        if (day.getDate() === evtStart.getDate()) {
          if (!evt.recurring_until || day <= new Date(evt.recurring_until)) return true;
        }
      }
      if (evt.recurring_rule === 'yearly' && day >= evtStart) {
        if (day.getMonth() === evtStart.getMonth() && day.getDate() === evtStart.getDate()) {
          if (!evt.recurring_until || day <= new Date(evt.recurring_until)) return true;
        }
      }

      return false;
    });
  };

  return (
    <div id="calendar-week-view" className="flex flex-col flex-1 gap-4">
      {/* --- DESKTOP WEEK VIEW (Matching Reference Top-Left Layout) --- */}
      <div className="hidden md:flex flex-col gap-3.5">
        {weekDays.map((day) => {
          const dayEvents = getEventsForDay(day);
          const isDayToday = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className="flex items-start gap-4 p-2 rounded-2xl transition-colors hover:bg-gray-100/50"
            >
              {/* Left Day/Date Column */}
              <div className="w-16 shrink-0 pt-1 flex flex-col items-start select-none">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {format(day, 'EEE')}
                </span>
                <span
                  className={`text-2xl font-extrabold leading-none mt-0.5 ${
                    isDayToday ? 'text-blue-600' : 'text-slate-800'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              </div>

              {/* Right Events Grid (Side by side cards like Reference Image) */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3.5 min-h-[72px]">
                {dayEvents.length === 0 ? (
                  <button
                    onClick={() => openCreateEventModal(day)}
                    className="h-full min-h-[64px] rounded-2xl border border-dashed border-gray-200/80 bg-white/40 hover:bg-white text-gray-400 hover:text-gray-600 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer group"
                  >
                    <Plus className="w-4 h-4 group-hover:scale-110 transition-transform text-blue-500" />
                    <span>Add event for {format(day, 'EEEE')}</span>
                  </button>
                ) : (
                  dayEvents.map((evt) => (
                    <EventCard
                      key={evt.id}
                      event={evt}
                      members={members}
                      eventTypes={eventTypes}
                      onClick={() => openEditEventModal(evt)}
                      showDetails={true}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- MOBILE WEEK VIEW (Matching Reference Middle-Right Layout) --- */}
      <div
        id="mobile-week-calendar-container"
        className="flex md:hidden flex-col gap-4 pb-calendar-mobile"
        style={{
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 32px)',
        }}
      >
        {weekDays.map((day) => {
          const dayEvents = getEventsForDay(day);
          const isDayToday = isToday(day);

          return (
            <div key={day.toISOString()} className="flex items-start gap-3">
              {/* Left Day Column */}
              <div className="w-12 shrink-0 pt-0.5 flex flex-col items-start select-none">
                <span className="text-[11px] font-bold text-gray-400 uppercase">
                  {format(day, 'EEE')}
                </span>
                <span
                  className={`text-xl font-black leading-none mt-0.5 ${
                    isDayToday ? 'text-blue-600' : 'text-slate-800'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              </div>

              {/* Right Events Stack */}
              <div className="flex-1 flex flex-col gap-2.5">
                {dayEvents.length === 0 ? (
                  <div className="py-2.5 px-3 rounded-2xl bg-white border border-dashed border-gray-200 text-gray-400 text-xs font-medium">
                    No events
                  </div>
                ) : (
                  dayEvents.map((evt) => (
                    <EventCard
                      key={evt.id}
                      event={evt}
                      members={members}
                      eventTypes={eventTypes}
                      onClick={() => openEditEventModal(evt)}
                      showDetails={true}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
