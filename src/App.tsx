import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FamilyProvider } from './context/FamilyContext';
import { CalendarProvider, useCalendar } from './context/CalendarContext';
import { Navbar, MainTabType } from './components/layout/Navbar';
import { MobileNav } from './components/layout/MobileNav';
import { CalendarHeader } from './components/calendar/CalendarHeader';
import { MonthView } from './components/calendar/MonthView';
import { WeekView } from './components/calendar/WeekView';
import { DayView } from './components/calendar/DayView';
import { AgendaView } from './components/calendar/AgendaView';
import { EventModal } from './components/calendar/EventModal';
import { FamilyView } from './components/family/FamilyView';
import { NotificationsView } from './components/notifications/NotificationsView';
import { IntegrationsView } from './components/settings/IntegrationsView';
import { ProfileView } from './components/profile/ProfileView';
import { TasksView } from './components/tasks/TasksView';
import { BirthdaysView } from './components/birthdays/BirthdaysView';
import { AuthModal } from './components/auth/AuthModal';
import { PrivacyPolicy } from './components/privacy/PrivacyPolicy';
import { Plus, Loader2 } from 'lucide-react';

function CalendarContainer() {
  const { viewMode, openCreateEventModal } = useCalendar();

  return (
    <div className="flex flex-col flex-1 min-h-full md:h-full gap-4 max-w-7xl mx-auto w-full relative">
      <CalendarHeader />
      <div className="flex-1 flex flex-col min-h-0">
        {viewMode === 'month' && <MonthView />}
        {viewMode === 'week' && <WeekView />}
        {viewMode === 'day' && <DayView />}
        {viewMode === 'agenda' && <AgendaView />}
      </div>

      {/* Floating Action Add Button on Mobile (Positioned above bottom nav & safe-area) */}
      <button
        id="mobile-create-event-fab"
        onClick={() => openCreateEventModal()}
        className="md:hidden fixed right-5 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all z-40 cursor-pointer border border-blue-500/20 bottom-fab-mobile"
        style={{
          bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 16px)',
        }}
        title="Add Event"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>
    </div>
  );
}

function MainDashboard() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<MainTabType>('calendar');
  const [currentPath, setCurrentPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '/');

  React.useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Publicly accessible without authentication
  if (currentPath === '/privacy' || currentPath.startsWith('/privacy')) {
    return (
      <PrivacyPolicy
        onBack={() => {
          window.history.pushState(null, '', '/');
          setCurrentPath('/');
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAFAFA]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#DB2777] animate-spin" />
          <span className="text-xs text-gray-600 font-medium">Loading Yimly FamilyCal...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthModal />;
  }

  return (
    <div id="yimly-app-root" className="flex flex-col h-screen bg-[#FAFAFA] text-gray-900 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Dynamic Center Stage (NO SIDEBAR) */}
        <main
          id="main-stage-content"
          className="flex-1 flex flex-col overflow-y-auto p-3 sm:p-6 main-stage-scroll bg-[#FAFAFA]"
        >
          {activeTab === 'calendar' && <CalendarContainer />}
          {activeTab === 'family' && <FamilyView />}
          {activeTab === 'notifications' && <NotificationsView />}
          {activeTab === 'settings' && <IntegrationsView />}
          {activeTab === 'profile' && <ProfileView />}
          {/* Fallbacks if accessed via state */}
          {activeTab === ('tasks' as any) && <TasksView />}
          {activeTab === ('birthdays' as any) && <BirthdaysView />}
        </main>
      </div>

      {/* Global Event Modal for Add / Edit */}
      <EventModal />

      {/* Bottom Navigation for Mobile Devices */}
      <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <FamilyProvider>
        <CalendarProvider>
          <MainDashboard />
        </CalendarProvider>
      </FamilyProvider>
    </AuthProvider>
  );
}

export default App;
