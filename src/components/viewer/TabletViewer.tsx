import React, { useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  isSameMonth,
  isSameDay,
  isToday,
  differenceInCalendarDays,
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { useCalendarSwipe } from '../../hooks/useCalendarSwipe';
import { EventCard } from '../calendar/EventCard';
import { MonthGrid } from '../calendar/MonthGrid';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, LogOut } from 'lucide-react';

interface TabletViewerProps {
  onExit?: () => void;
}

export const TabletViewer: React.FC<TabletViewerProps> = ({ onExit }) => {
  const {
    currentDate,
    filteredEvents,
    eventTypes,
    goToPreviousPeriod,
    goToNextPeriod,
    goToToday,
    navigationDirection,
  } = useCalendar();

  const { members } = useFamily();
  const { logout } = useAuth();

  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  // Detect orientation dynamically for tablets, iPads, and browsers
  const [isLandscape, setIsLandscape] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > window.innerHeight;
    }
    return true;
  });

  useEffect(() => {
    const handleOrientationChange = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    handleOrientationChange();
    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  // Synchronize selected day when month changes
  useEffect(() => {
    if (!isSameMonth(selectedDay, currentDate)) {
      if (isSameMonth(new Date(), currentDate)) {
        setSelectedDay(new Date());
      } else {
        setSelectedDay(startOfMonth(currentDate));
      }
    }
  }, [currentDate]);

  // Touch horizontal swipe navigation for month view
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

  const selectedDayEvents = getEventsForDay(selectedDay).sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const monthKey = format(currentDate, 'yyyy-MM');

  return (
    <div
      id="familycal-tablet-viewer"
      className="flex flex-col h-screen w-screen bg-[#FAFAFA] text-gray-900 font-sans overflow-hidden select-none"
    >
      {/* --- DEDICATED TABLET HEADER --- */}
      <header className="h-16 bg-white border-b border-gray-200/80 px-4 sm:px-8 flex items-center justify-between z-30 shrink-0 shadow-2xs">
        {/* Left: FamilyCal logo + "FamilyCal" title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-200/60 p-1 grid grid-cols-2 gap-0.5 items-center justify-center shrink-0 shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EC4899]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#EAB308]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
          </div>
          <span className="text-xl font-bold text-slate-800 tracking-tight font-sans">
            FamilyCal
          </span>
        </div>

        {/* Right: Log Out */}
        <div className="flex items-center gap-2">
          {onExit && (
            <button
              onClick={onExit}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors mr-1 cursor-pointer"
              title="Return to standard dashboard"
            >
              Exit Viewer
            </button>
          )}
          <button
            id="tablet-logout-button"
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-gray-600 hover:text-red-600 hover:bg-red-50 border border-gray-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      {/* --- MAIN VIEWER BODY (RESPONSIVE: LANDSCAPE vs PORTRAIT) --- */}
      <main className="flex-1 overflow-hidden p-3 sm:p-5 md:p-6">
        {isLandscape ? (
          /* --- LANDSCAPE ORIENTATION (Two-Column Layout: Month on Left, Events on Right) --- */
          <div className="grid grid-cols-12 gap-5 h-full max-w-7xl mx-auto">
            {/* LEFT COLUMN: Month View Calendar */}
            <div
              {...swipeHandlers}
              className="col-span-7 xl:col-span-8 flex flex-col bg-white rounded-2xl border border-gray-200 p-4 shadow-2xs overflow-hidden touch-pan-y"
            >
              {/* Month Navigation & Title Header */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPreviousPeriod}
                    className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToNextPeriod}
                    className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                    title="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToToday}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer ml-1"
                  >
                    Today
                  </button>
                </div>

                <h2 className="text-base sm:text-lg font-extrabold text-slate-800 tracking-wide uppercase font-serif">
                  {format(currentDate, 'MMMM yyyy')}
                </h2>
              </div>

              {/* Days Grid with Slide Transition */}
              <div className="flex-1 flex flex-col overflow-hidden">
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
                    className="h-full flex flex-col"
                  >
                    <MonthGrid
                      currentDate={currentDate}
                      selectedDay={selectedDay}
                      onSelectDay={(d) => setSelectedDay(d)}
                      filteredEvents={filteredEvents}
                      members={members}
                      eventTypes={eventTypes}
                      maxVisibleSlots={2}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* RIGHT COLUMN: Dedicated Selected-Day Events Panel */}
            <div className="col-span-5 xl:col-span-4 flex flex-col bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs overflow-hidden">
              {/* Selected Date Header */}
              <div className="pb-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 font-serif tracking-tight">
                    {format(selectedDay, 'EEEE, d MMM')}
                  </h3>
                  <span className="text-[11px] font-extrabold text-blue-600 tracking-wider uppercase mt-0.5 block">
                    EVENTS ({selectedDayEvents.length})
                  </span>
                </div>

                {isToday(selectedDay) && (
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold border border-blue-200/60">
                    Today
                  </span>
                )}
              </div>

              {/* Events List for Selected Day (Read-Only) */}
              <div className="flex-1 overflow-y-auto pt-3 space-y-3 scrollbar-thin">
                {selectedDayEvents.length === 0 ? (
                  <div className="h-full min-h-[200px] flex flex-col items-center justify-center p-6 text-center text-gray-400">
                    <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-2.5">
                      <CalendarIcon className="w-6 h-6 text-gray-300" />
                    </div>
                    <p className="text-sm font-semibold text-gray-600">No events</p>
                    <p className="text-xs text-gray-400 mt-0.5">No schedule planned for this day.</p>
                  </div>
                ) : (
                  selectedDayEvents.map((evt) => (
                    <EventCard
                      key={evt.id}
                      event={evt}
                      members={members}
                      eventTypes={eventTypes}
                      showDetails={true}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* --- PORTRAIT ORIENTATION (Phone/Tablet Portrait: Phone Month View) --- */
          <div
            {...swipeHandlers}
            className="flex flex-col gap-4 h-full overflow-y-auto pb-6 touch-pan-y max-w-2xl mx-auto"
          >
            {/* Month Header & Grid */}
            <div className="bg-white rounded-2xl border border-gray-200 p-3.5 shadow-2xs overflow-hidden flex flex-col">
              {/* Month Title & Navigation */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={goToPreviousPeriod}
                    className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToNextPeriod}
                    className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 flex items-center justify-center"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToToday}
                    className="px-2 py-0.5 text-xs font-bold rounded-md border border-gray-200 text-gray-600 ml-1"
                  >
                    Today
                  </button>
                </div>

                <h2 className="text-sm font-bold text-slate-800 uppercase font-serif tracking-wide">
                  {format(currentDate, 'MMMM yyyy')}
                </h2>
              </div>

              {/* Days Grid with Slide Transition */}
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
                    maxVisibleSlots={2}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Selected Day Agenda Section (Read-Only) */}
            <div className="flex flex-col gap-3 pt-1">
              <h3 className="text-base font-bold text-slate-900 px-1 font-serif tracking-tight">
                {format(selectedDay, 'EEEE, d MMMM')}
              </h3>

              <div className="flex flex-col gap-2.5">
                {selectedDayEvents.length === 0 ? (
                  <div className="py-6 px-4 rounded-2xl bg-white border border-dashed border-gray-200 text-gray-400 text-xs font-medium text-center shadow-2xs">
                    No events
                  </div>
                ) : (
                  selectedDayEvents.map((evt) => (
                    <EventCard
                      key={evt.id}
                      event={evt}
                      members={members}
                      eventTypes={eventTypes}
                      showDetails={true}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
