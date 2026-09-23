import React, { useState, useEffect } from 'react';
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
  differenceInCalendarDays,
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useCalendarSwipe } from '../../hooks/useCalendarSwipe';
import { useAuth } from '../../context/AuthContext';
import { Plus } from 'lucide-react';
import { EventCard } from './EventCard';
import { CalendarEvent } from '../../types';
import { isEventOnDay } from '../../utils/calendarDateUtils';

interface WeekViewProps {
  isViewer?: boolean;
}

type ViewerWeekLayoutMode = 'desktop-7' | 'tablet-landscape-4x2' | 'portrait';

function computeViewerLayout(): ViewerWeekLayoutMode {
  if (typeof window === 'undefined') return 'desktop-7';
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isLandscape = width > height;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Portrait mode: narrower screen or portrait orientation (height >= width)
  if (!isLandscape || width < 768) {
    return 'portrait';
  }

  // Tablet/iPad in landscape:
  // iPads in landscape are:
  // - iPad mini / 10.2": 1024 x 768
  // - iPad Air / Pro 11": 1180 x 820 or 1194 x 834
  // - iPad Pro 12.9": 1366 x 1024
  // When touch is present and width <= 1366, or width is in tablet range (768 - 1279):
  if ((hasTouch && width <= 1366) || (width >= 768 && width < 1280)) {
    return 'tablet-landscape-4x2';
  }

  // PC / Desktop landscape: screen width >= 1280px (or >= 1024px without touch)
  return 'desktop-7';
}

export const WeekView: React.FC<WeekViewProps> = ({ isViewer: isViewerProp }) => {
  const {
    currentDate,
    filteredEvents,
    openCreateEventModal,
    openEditEventModal,
    eventTypes,
    goToPreviousPeriod,
    goToNextPeriod,
    navigationDirection,
    viewingTimezone,
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

  const canCreateEvent = !isViewer && (isAdmin || hasPermission('event_create'));

  // Mobile / touch horizontal swipe navigation handlers
  const swipeHandlers = useCalendarSwipe({
    onSwipeLeft: goToNextPeriod, // Swipe LEFT -> next week
    onSwipeRight: goToPreviousPeriod, // Swipe RIGHT -> previous week
    minDistance: 45,
    maxTime: 700,
    preventScrollToleranceRatio: 1.3,
  });

  // Week starts on Monday (weekStartsOn: 1)
  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    return filteredEvents.filter((evt) => isEventOnDay(evt, day, viewingTimezone));
  };

  const weekKey = format(start, 'yyyy-MM-dd');

  // Track viewer layout mode reactively
  const [viewerLayout, setViewerLayout] = useState<ViewerWeekLayoutMode>(computeViewerLayout);

  useEffect(() => {
    if (!isViewer) return;

    const handleResize = () => {
      setViewerLayout(computeViewerLayout());
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [isViewer]);

  // Helper component to render a single Day Column in the Viewer 7-col and 4-col grids
  const renderViewerDayColumn = (day: Date, compact: boolean = false) => {
    const dayEvents = getEventsForDay(day);
    const isDayToday = isToday(day);

    return (
      <div
        key={day.toISOString()}
        className={`flex flex-col rounded-2xl bg-white border ${
          isDayToday
            ? 'border-blue-300 ring-2 ring-blue-500/10 shadow-xs'
            : 'border-gray-200/80 shadow-2xs'
        } overflow-hidden transition-all min-w-0 h-full`}
      >
        {/* Day Header */}
        <div
          className={`px-3 py-2 flex items-center justify-between border-b select-none ${
            isDayToday ? 'bg-blue-50/80 border-blue-200/70' : 'bg-gray-50/70 border-gray-100'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`text-xs font-bold uppercase tracking-wide truncate ${
                isDayToday ? 'text-blue-700' : 'text-gray-500'
              }`}
            >
              {format(day, 'EEE')}
            </span>
            <span
              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs sm:text-sm font-black shrink-0 ${
                isDayToday ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-800'
              }`}
            >
              {format(day, 'd')}
            </span>
          </div>
          {dayEvents.length > 0 && (
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-400 bg-white/90 px-1.5 py-0.5 rounded-full border border-gray-200/60 shadow-2xs shrink-0">
              {dayEvents.length}
            </span>
          )}
        </div>

        {/* Day Events Stack */}
        <div className="flex-1 p-2 sm:p-2.5 flex flex-col gap-2 min-h-[120px] overflow-y-auto">
          {dayEvents.length === 0 ? (
            <div className="flex-1 min-h-[70px] rounded-xl border border-dashed border-gray-200/70 bg-gray-50/30 text-gray-400 text-xs font-medium flex items-center justify-center select-none">
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
                className={compact ? 'p-2 sm:p-2.5 rounded-xl gap-2' : 'p-2.5 sm:p-3 rounded-xl gap-2.5'}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  // --- HOUSEHOLD VIEWER SPECIFIC WEEK VIEW ---
  if (isViewer) {
    return (
      <div
        id="calendar-week-view-household"
        {...swipeHandlers}
        className="flex flex-col flex-1 gap-4 w-full touch-pan-y"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${weekKey}-${viewerLayout}`}
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
            className="flex-1 flex flex-col w-full"
          >
            {/* 1. PC / Desktop: 7 Days Across One Row (1 2 3 4 5 6 7) */}
            {viewerLayout === 'desktop-7' && (
              <div
                id="household-week-desktop-grid"
                className="grid grid-cols-7 gap-2.5 xl:gap-3 w-full items-stretch"
              >
                {weekDays.map((day) => renderViewerDayColumn(day, true))}
              </div>
            )}

            {/* 2. Tablet / iPad Landscape: 4-Column × 2-Row Grid (1 2 3 4 / 5 6 7 [empty]) */}
            {viewerLayout === 'tablet-landscape-4x2' && (
              <div
                id="household-week-tablet-landscape-grid"
                className="grid grid-cols-4 gap-3 md:gap-3.5 w-full items-stretch"
              >
                {/* Row 1: Day 1, Day 2, Day 3, Day 4 */}
                {/* Row 2: Day 5, Day 6, Day 7 */}
                {weekDays.map((day) => renderViewerDayColumn(day, false))}

                {/* Final 4th position on second row left empty */}
                <div
                  key="viewer-week-empty-slot"
                  aria-hidden="true"
                  className="rounded-2xl border border-dashed border-gray-200/40 bg-gray-50/20 p-4 min-h-[140px] flex items-center justify-center pointer-events-none select-none"
                >
                  <span className="text-xs text-gray-300 font-medium select-none">—</span>
                </div>
              </div>
            )}

            {/* 3. Tablet / iPad Portrait: Responsive Portrait Layout */}
            {viewerLayout === 'portrait' && (
              <div
                id="household-week-portrait-list"
                className="flex flex-col gap-3 sm:gap-3.5 w-full"
              >
                {weekDays.map((day) => {
                  const dayEvents = getEventsForDay(day);
                  const isDayToday = isToday(day);

                  return (
                    <div
                      key={day.toISOString()}
                      className="flex items-start gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-2xl bg-white border border-gray-200/80 shadow-2xs hover:bg-gray-50/60 transition-colors w-full max-w-full min-w-0"
                    >
                      {/* Left Day/Date Column */}
                      <div className="w-14 sm:w-16 shrink-0 pt-0.5 flex flex-col items-start select-none">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                          {format(day, 'EEE')}
                        </span>
                        <span
                          className={`text-xl sm:text-2xl font-black leading-none mt-0.5 ${
                            isDayToday ? 'text-blue-600' : 'text-slate-800'
                          }`}
                        >
                          {format(day, 'd')}
                        </span>
                      </div>

                      {/* Right Events Stack */}
                      <div className="flex-1 min-w-0 max-w-full flex flex-col gap-2.5">
                        {dayEvents.length === 0 ? (
                          <div className="py-2.5 px-3 rounded-xl bg-gray-50/40 border border-dashed border-gray-200 text-gray-400 text-xs font-medium">
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
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // --- NORMAL FAMILYCAL CALENDAR (OUTSIDE THE VIEWER: UNCHANGED) ---
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
                  canCreateEvent ? (
                    <button
                      onClick={() => openCreateEventModal(day)}
                      className="h-full min-h-[64px] rounded-2xl border border-dashed border-gray-200/80 bg-white/40 hover:bg-white text-gray-400 hover:text-gray-600 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer group"
                    >
                      <Plus className="w-4 h-4 group-hover:scale-110 transition-transform text-blue-500" />
                      <span>Add event for {format(day, 'EEEE')}</span>
                    </button>
                  ) : (
                    <div className="h-full min-h-[64px] rounded-2xl border border-dashed border-gray-200/60 bg-white/20 text-gray-400 text-xs font-medium flex items-center justify-center">
                      No events
                    </div>
                  )
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

      {/* --- MOBILE WEEK VIEW WITH TOUCH SWIPE NAVIGATION --- */}
      <div
        id="mobile-week-calendar-container"
        {...swipeHandlers}
        className="flex md:hidden flex-col gap-4 pb-calendar-mobile touch-pan-y w-full max-w-full min-w-0"
        style={{
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 64px)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={weekKey}
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
            className="flex flex-col gap-4 w-full max-w-full min-w-0"
          >
            {weekDays.map((day) => {
              const dayEvents = getEventsForDay(day);
              const isDayToday = isToday(day);

              return (
                <div key={day.toISOString()} className="flex items-start gap-3 w-full max-w-full min-w-0">
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
                  <div className="flex-1 min-w-0 max-w-full flex flex-col gap-2.5">
                    {dayEvents.length === 0 ? (
                      <div className="py-2.5 px-3 rounded-2xl bg-white border border-dashed border-gray-200 text-gray-400 text-xs font-medium w-full">
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};


