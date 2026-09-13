import React from 'react';
import {
  format,
  isSameDay,
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useCalendarSwipe } from '../../hooks/useCalendarSwipe';
import { Plus } from 'lucide-react';
import { EventCard } from './EventCard';

export const DayView: React.FC = () => {
  const {
    currentDate,
    filteredEvents,
    openCreateEventModal,
    openEditEventModal,
    eventTypes,
    goToPreviousPeriod,
    goToNextPeriod,
    navigationDirection,
  } = useCalendar();
  const { members } = useFamily();

  const swipeHandlers = useCalendarSwipe({
    onSwipeLeft: goToNextPeriod,
    onSwipeRight: goToPreviousPeriod,
    minDistance: 45,
    maxTime: 700,
    preventScrollToleranceRatio: 1.3,
  });

  const dayEvents = filteredEvents.filter((evt) => {
    const evtStart = new Date(evt.start_time);
    const evtEnd = new Date(evt.end_time);
    return isSameDay(evtStart, currentDate) || (currentDate >= evtStart && currentDate <= evtEnd);
  });

  const dayKey = format(currentDate, 'yyyy-MM-dd');

  return (
    <div
      id="calendar-day-view"
      {...swipeHandlers}
      className="flex flex-col flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs touch-pan-y"
    >
      {/* Day Title Bar */}
      <div className="py-4 px-6 border-b border-gray-200 bg-gray-50/75 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 tracking-tight font-serif">
            {format(currentDate, 'EEEE, MMMM d, yyyy')}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'} planned for this day
          </p>
        </div>

        <button
          onClick={() => openCreateEventModal(currentDate)}
          className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Event</span>
        </button>
      </div>

      {/* Daily Schedule Stream */}
      <div className="flex-1 overflow-y-auto max-h-[640px] p-4 pb-calendar-mobile md:pb-4 space-y-3 bg-white scrollbar-thin">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={dayKey}
            initial={{
              opacity: 0,
              x: navigationDirection > 0 ? 20 : navigationDirection < 0 ? -20 : 0,
            }}
            animate={{ opacity: 1, x: 0 }}
            exit={{
              opacity: 0,
              x: navigationDirection > 0 ? -20 : navigationDirection < 0 ? 20 : 0,
            }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            className="space-y-3"
          >
            {dayEvents.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <p className="text-sm font-semibold text-gray-600">No scheduled events for this day.</p>
                <p className="text-xs text-gray-400 mt-1">Tap the button above to schedule family activities.</p>
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
