import React, { useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  isSameMonth,
  isSameDay,
  differenceInCalendarDays,
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useCalendarSwipe } from '../../hooks/useCalendarSwipe';
import { EventCard } from './EventCard';
import { MonthGrid } from './MonthGrid';

export const MonthView: React.FC = () => {
  const {
    currentDate,
    filteredEvents,
    openEditEventModal,
    eventTypes,
    goToPreviousPeriod,
    goToNextPeriod,
    navigationDirection,
  } = useCalendar();
  const { members } = useFamily();

  const [selectedDay, setSelectedDay] = useState<Date>(currentDate);

  // Synchronize selected day when navigating to a different month
  useEffect(() => {
    if (!isSameMonth(selectedDay, currentDate)) {
      if (isSameMonth(new Date(), currentDate)) {
        setSelectedDay(new Date());
      } else {
        setSelectedDay(startOfMonth(currentDate));
      }
    }
  }, [currentDate]);

  // Mobile horizontal swipe navigation handlers
  const swipeHandlers = useCalendarSwipe({
    onSwipeLeft: goToNextPeriod, // Swipe LEFT -> next month
    onSwipeRight: goToPreviousPeriod, // Swipe RIGHT -> previous month
    minDistance: 45,
    maxTime: 700,
    preventScrollToleranceRatio: 1.3,
  });

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

  const selectedDayEvents = getEventsForDay(selectedDay);
  const monthKey = format(currentDate, 'yyyy-MM');

  return (
    <div id="calendar-month-view" className="flex flex-col flex-1 gap-4">
      {/* --- DESKTOP MONTH VIEW --- */}
      <div className="hidden md:flex flex-col flex-1">
        <MonthGrid
          currentDate={currentDate}
          selectedDay={selectedDay}
          onSelectDay={(d) => setSelectedDay(d)}
          filteredEvents={filteredEvents}
          members={members}
          eventTypes={eventTypes}
          onEditEvent={openEditEventModal}
          maxVisibleSlots={2}
        />
      </div>

      {/* --- MOBILE MONTH VIEW WITH TOUCH SWIPE NAVIGATION --- */}
      <div
        id="mobile-month-calendar-container"
        {...swipeHandlers}
        className="flex md:hidden flex-col gap-4 pb-calendar-mobile touch-pan-y"
        style={{
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 32px)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={monthKey}
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
          >
            <MonthGrid
              currentDate={currentDate}
              selectedDay={selectedDay}
              onSelectDay={(d) => setSelectedDay(d)}
              filteredEvents={filteredEvents}
              members={members}
              eventTypes={eventTypes}
              onEditEvent={openEditEventModal}
              maxVisibleSlots={2}
            />
          </motion.div>
        </AnimatePresence>

        {/* Selected Day Agenda Section */}
        <div className="flex flex-col gap-3 pt-1">
          <h3 className="text-base font-bold text-slate-900 px-1 font-serif tracking-tight">
            {format(selectedDay, 'EEEE, d MMMM')}
          </h3>

          <div className="flex flex-col gap-2.5">
            {selectedDayEvents.length === 0 ? (
              <div className="py-6 px-4 rounded-2xl bg-white border border-dashed border-gray-200 text-gray-400 text-xs font-medium text-center shadow-2xs">
                No events scheduled for this date
              </div>
            ) : (
              selectedDayEvents.map((evt) => (
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
      </div>
    </div>
  );
};

