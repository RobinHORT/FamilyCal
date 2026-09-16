import React from 'react';
import {
  format,
  isSameDay,
  differenceInCalendarDays,
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { useCalendarSwipe } from '../../hooks/useCalendarSwipe';
import { Plus } from 'lucide-react';
import { EventCard } from './EventCard';
import { isEventOnDay } from '../../utils/calendarDateUtils';

interface DayViewProps {
  currentDate?: Date;
  isViewer?: boolean;
  className?: string;
}

export const DayView: React.FC<DayViewProps> = ({
  currentDate: propDate,
  isViewer: isViewerProp,
  className = '',
}) => {
  const {
    currentDate: contextDate,
    filteredEvents,
    openCreateEventModal,
    openEditEventModal,
    eventTypes,
    goToPreviousPeriod,
    goToNextPeriod,
    navigationDirection,
  } = useCalendar();
  const { members } = useFamily();
  const { user, isAdmin, hasPermission } = useAuth();

  const isViewer =
    isViewerProp ??
    (user?.role === 'viewer' ||
    (typeof window !== 'undefined' && (
      localStorage.getItem('familycal_viewer_mode') === 'true' ||
      window.location.pathname === '/viewer' ||
      window.location.search.includes('mode=viewer') ||
      window.location.search.includes('viewer=1')
    )));

  const activeDate = propDate ?? contextDate;
  const isEmbedded = Boolean(propDate);

  const swipeHandlers = useCalendarSwipe({
    onSwipeLeft: goToNextPeriod,
    onSwipeRight: goToPreviousPeriod,
    minDistance: 45,
    maxTime: 700,
    preventScrollToleranceRatio: 1.3,
  });

  const dayEvents = filteredEvents.filter((evt) => isEventOnDay(evt, activeDate));

  const dayKey = format(activeDate, 'yyyy-MM-dd');
  const canCreate = !isViewer && (isAdmin || hasPermission('event_create'));

  return (
    <div
      id={isEmbedded ? "embedded-calendar-day-view" : "calendar-day-view"}
      {...(!isEmbedded ? swipeHandlers : {})}
      className={`flex flex-col flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs ${
        !isEmbedded ? 'touch-pan-y' : ''
      } ${className}`}
    >
      {/* Day Title Bar */}
      <div className="py-2.5 sm:py-3.5 px-3.5 sm:px-5 border-b border-gray-200 bg-gray-50/75 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 tracking-tight font-serif truncate">
            {format(activeDate, 'EEEE, MMMM d, yyyy')}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'} planned for this day
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => openCreateEventModal(activeDate)}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 ml-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Event</span>
          </button>
        )}
      </div>

      {/* Daily Schedule Stream */}
      <div
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-white scrollbar-thin min-h-0 w-full max-w-full min-w-0 pb-calendar-mobile md:pb-4"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={dayKey}
            initial={{
              opacity: 0,
              x: !isEmbedded ? (navigationDirection > 0 ? 20 : navigationDirection < 0 ? -20 : 0) : 0,
              y: isEmbedded ? 6 : 0,
            }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{
              opacity: 0,
              x: !isEmbedded ? (navigationDirection > 0 ? -20 : navigationDirection < 0 ? 20 : 0) : 0,
              y: isEmbedded ? -6 : 0,
            }}
            transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
            className="space-y-3 w-full max-w-full min-w-0"
          >
            {dayEvents.length === 0 ? (
              <div className="py-12 sm:py-16 text-center text-gray-400">
                <p className="text-sm font-semibold text-gray-600">No scheduled events for this day.</p>
                {!isViewer && (
                  <p className="text-xs text-gray-400 mt-1">Tap the button above to schedule family activities.</p>
                )}
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
