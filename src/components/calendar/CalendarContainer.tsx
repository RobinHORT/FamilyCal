import React from 'react';
import { useCalendar } from '../../context/CalendarContext';
import { useAuth } from '../../context/AuthContext';
import { CalendarHeader } from './CalendarHeader';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { AgendaView } from './AgendaView';
import { Plus } from 'lucide-react';

interface CalendarContainerProps {
  isViewer?: boolean;
}

export function CalendarContainer({ isViewer: isViewerProp }: CalendarContainerProps = {}) {
  const { viewMode, openAddChoiceModal, selectedCalendarDate, currentDate } = useCalendar();
  const { user, hasPermission, isAdmin } = useAuth();

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

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-3 sm:gap-4 max-w-7xl mx-auto w-full max-w-full min-w-0 relative">
      <CalendarHeader />
      <div className="flex-1 flex flex-col min-h-0 w-full max-w-full min-w-0">
        {viewMode === 'month' && <MonthView isViewer={isViewer} />}
        {viewMode === 'week' && <WeekView isViewer={isViewer} />}
        {viewMode === 'day' && <DayView isViewer={isViewer} />}
        {viewMode === 'agenda' && <AgendaView isViewer={isViewer} />}
      </div>

      {/* Floating Action Add Button on Mobile (Hidden in Viewer mode) */}
      {canCreateEvent && (
        <button
          id="mobile-create-event-fab"
          onClick={() => openAddChoiceModal(selectedCalendarDate || currentDate)}
          className="md:hidden fixed right-5 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all z-40 cursor-pointer border border-blue-500/20 bottom-fab-mobile"
          style={{
            bottom: 'calc(3.25rem + env(safe-area-inset-bottom, 0px) + 12px)',
          }}
          title="Add"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
}
