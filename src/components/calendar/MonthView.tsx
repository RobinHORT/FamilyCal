import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  format,
  startOfMonth,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { useCalendarSwipe } from '../../hooks/useCalendarSwipe';
import { EventCard } from './EventCard';
import { MonthGrid } from './MonthGrid';
import { DayView } from './DayView';
import { isEventOnDay } from '../../utils/calendarDateUtils';

interface MonthViewProps {
  isViewer?: boolean;
}

export const MonthView: React.FC<MonthViewProps> = ({ isViewer: isViewerProp }) => {
  const {
    currentDate,
    filteredEvents,
    openEditEventModal,
    eventTypes,
    goToPreviousPeriod,
    goToNextPeriod,
    navigationDirection,
    selectedCalendarDate,
    setSelectedCalendarDate,
  } = useCalendar();
  const { members } = useFamily();
  const { user } = useAuth();

  const isViewer =
    isViewerProp ??
    (user?.role === 'viewer' ||
    (typeof window !== 'undefined' && (
      localStorage.getItem('familycal_viewer_mode') === 'true' ||
      window.location.pathname === '/viewer' ||
      window.location.search.includes('mode=viewer') ||
      window.location.search.includes('viewer=1')
    )));

  // Desktop selected day (always synchronized)
  const desktopSelectedDay = selectedCalendarDate || currentDate;

  // Mobile selected day state (null when no overlay is open)
  const [mobileSelectedDate, setMobileSelectedDate] = useState<Date | null>(null);

  const overlayScrollRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const startedAtTopRef = useRef<boolean>(false);

  // Desktop day selection
  const handleSelectDesktopDay = (d: Date) => {
    setSelectedCalendarDate(d);
  };

  // Mobile date tap handler (opens overlay)
  const handleSelectMobileDay = (d: Date) => {
    setMobileSelectedDate(d);
    setSelectedCalendarDate(d);
  };

  // Dismiss mobile overlay & clear selected date
  const handleDismissMobileOverlay = useCallback(() => {
    setMobileSelectedDate(null);
  }, []);

  // Synchronize desktop selected day when navigating to a different month
  useEffect(() => {
    if (!isSameMonth(desktopSelectedDay, currentDate)) {
      if (isSameMonth(new Date(), currentDate)) {
        handleSelectDesktopDay(new Date());
      } else {
        handleSelectDesktopDay(startOfMonth(currentDate));
      }
    }
  }, [currentDate]);

  // Reset mobile overlay when month changes
  useEffect(() => {
    setMobileSelectedDate(null);
  }, [currentDate]);

  // Mobile horizontal swipe navigation handlers (only active when overlay is closed)
  const swipeHandlers = useCalendarSwipe({
    onSwipeLeft: () => {
      if (!mobileSelectedDate) goToNextPeriod();
    },
    onSwipeRight: () => {
      if (!mobileSelectedDate) goToPreviousPeriod();
    },
    minDistance: 45,
    maxTime: 700,
    preventScrollToleranceRatio: 1.3,
  });

  // Helper to get events for a date
  const getEventsForDay = (dayDate: Date) => {
    return filteredEvents.filter((evt) => isEventOnDay(evt, dayDate));
  };

  const desktopSelectedDayEvents = getEventsForDay(desktopSelectedDay);
  const mobileSelectedDayEvents = mobileSelectedDate ? getEventsForDay(mobileSelectedDate) : [];
  const monthKey = format(currentDate, 'yyyy-MM');

  // Downward swipe-to-dismiss gesture handling on the mobile overlay
  const onOverlayTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    touchStartYRef.current = e.touches[0].clientY;
    startedAtTopRef.current = overlayScrollRef.current
      ? overlayScrollRef.current.scrollTop <= 5
      : true;
  };

  const onOverlayTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const onOverlayTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchStartYRef.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - touchStartYRef.current;
    const isCurrentlyAtTop = overlayScrollRef.current
      ? overlayScrollRef.current.scrollTop <= 5
      : true;
    touchStartYRef.current = null;

    // If gesture is a downward swipe and started at the top
    if (diffY > 50 && startedAtTopRef.current && isCurrentlyAtTop) {
      handleDismissMobileOverlay();
    }
  };

  return (
    <div id="calendar-month-view" className="flex flex-col flex-1 min-h-0 h-full gap-2 sm:gap-3 overflow-hidden relative">
      {/* 1. TABLET / IPAD / PC: SIDE-BY-SIDE (MONTH CALENDAR on Left, SELECTED DAY DAY VIEW on Right) */}
      <div
        id="desktop-month-split"
        {...swipeHandlers}
        className="hidden md:grid md:grid-cols-12 gap-3.5 lg:gap-4 flex-1 items-stretch min-h-0 h-full touch-pan-y overflow-hidden"
      >
        {/* Left: MONTH CALENDAR (Locked, fully visible, non-scrollable) */}
        <div className="md:col-span-7 lg:col-span-7 xl:col-span-8 flex flex-col min-w-0 h-full min-h-0 overflow-hidden">
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
              className="flex-1 flex flex-col min-h-0 h-full overflow-hidden"
            >
              <MonthGrid
                currentDate={currentDate}
                selectedDay={desktopSelectedDay}
                onSelectDay={handleSelectDesktopDay}
                filteredEvents={filteredEvents}
                members={members}
                eventTypes={eventTypes}
                onEditEvent={openEditEventModal}
                maxVisibleSlots={2}
                className="h-full flex-1 min-h-0 overflow-hidden"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right: SELECTED DAY DAY VIEW (Only internal event list is scrollable) */}
        <div className="md:col-span-5 lg:col-span-5 xl:col-span-4 flex flex-col min-w-0 h-full min-h-0 overflow-hidden">
          <DayView currentDate={desktopSelectedDay} isViewer={isViewer} className="h-full min-h-0" />
        </div>
      </div>

      {/* 2. PHONE: MONTH CALENDAR ONLY (NO INLINE BOTTOM SECTION) */}
      <div
        id="mobile-month-container"
        {...(!mobileSelectedDate ? swipeHandlers : {})}
        className="flex md:hidden flex-col flex-1 min-h-0 h-full touch-pan-y w-full max-w-full min-w-0 overflow-hidden pb-[calc(3.25rem+env(safe-area-inset-bottom,0px)+0.5rem)] md:pb-0"
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
            className="flex-1 flex flex-col min-h-0 h-full w-full max-w-full min-w-0 overflow-hidden"
          >
            <MonthGrid
              currentDate={currentDate}
              selectedDay={mobileSelectedDate}
              onSelectDay={handleSelectMobileDay}
              filteredEvents={filteredEvents}
              members={members}
              eventTypes={eventTypes}
              onEditEvent={openEditEventModal}
              maxVisibleSlots={2}
              className="h-full flex-1 min-h-0 overflow-hidden"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 3. PHONE ONLY: FLOATING DAY VIEW OVERLAY (OCCUPIES BOTTOM HALF OF PHONE SCREEN) */}
      <AnimatePresence>
        {mobileSelectedDate && (
          <>
            {/* Backdrop: Captures outside taps to dismiss overlay & deselect date */}
            <motion.div
              key="mobile-overlay-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={handleDismissMobileOverlay}
              className="md:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-[0.5px]"
            />

            {/* Bottom-Half Floating Sheet (Covers bottom navigation completely) */}
            <motion.div
              key="mobile-overlay-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onTouchStart={onOverlayTouchStart}
              onTouchMove={onOverlayTouchMove}
              onTouchEnd={onOverlayTouchEnd}
              className="md:hidden fixed inset-x-0 bottom-0 z-50 h-[50vh] max-h-[60vh] flex flex-col bg-white rounded-t-3xl border-t border-gray-200 shadow-2xl overflow-hidden"
            >
              {/* Subtle grab handle pill at top */}
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

              {/* Selected Day Title Bar */}
              <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-100 shrink-0">
                <h3 className="text-base font-bold text-slate-900 font-serif tracking-tight truncate">
                  {format(mobileSelectedDate, 'EEEE, d MMMM')}
                </h3>
              </div>

              {/* Vertically Scrollable Event Cards List */}
              <div
                ref={overlayScrollRef}
                className="flex-1 overflow-y-auto p-3.5 space-y-2.5 min-h-0 overscroll-contain pb-[calc(1.5rem+env(safe-area-inset-bottom,0px)+16px)]"
              >
                {mobileSelectedDayEvents.length === 0 ? (
                  <div className="py-6 px-4 rounded-2xl bg-white border border-dashed border-gray-200 text-gray-400 text-xs font-medium text-center shadow-2xs w-full">
                    No events scheduled for this date
                  </div>
                ) : (
                  mobileSelectedDayEvents.map((evt) => (
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
