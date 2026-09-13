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
import { CalendarContainer } from './components/calendar/CalendarContainer';
import { TabletViewer } from './components/viewer/TabletViewer';
import { ViewerLogin } from './components/viewer/ViewerLogin';
import { AuthModal } from './components/auth/AuthModal';
import { PrivacyPolicy } from './components/privacy/PrivacyPolicy';
import { Plus, Loader2 } from 'lucide-react';

function MainDashboard() {
  const { user, isLoading, checkAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<MainTabType>('calendar');
  const [currentPath, setCurrentPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '/');
  const [isViewerMode, setIsViewerMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        window.location.pathname === '/viewer' ||
        window.location.search.includes('mode=viewer') ||
        window.location.search.includes('viewer=1') ||
        localStorage.getItem('familycal_viewer_mode') === 'true'
      );
    }
    return false;
  });

  React.useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      if (path === '/viewer' || window.location.search.includes('mode=viewer')) {
        setIsViewerMode(true);
      }
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

  // Dedicated Tablet / iPad Viewer Mode Route
  if (currentPath === '/viewer') {
    if (!user) {
      return (
        <ViewerLogin
          onSuccess={async () => {
            await checkAuth();
            setIsViewerMode(true);
          }}
        />
      );
    }

    return (
      <TabletViewer
        onExit={() => {
          setIsViewerMode(false);
          localStorage.removeItem('familycal_viewer_mode');
          window.history.pushState(null, '', '/');
          setCurrentPath('/');
        }}
      />
    );
  }

  if (!user) {
    return <AuthModal />;
  }

  if (isViewerMode) {
    return (
      <TabletViewer
        onExit={() => {
          setIsViewerMode(false);
          localStorage.removeItem('familycal_viewer_mode');
          window.history.pushState(null, '', '/');
          setCurrentPath('/');
        }}
      />
    );
  }

  return (
    <div id="yimly-app-root" className="flex flex-col h-screen bg-[#FAFAFA] text-gray-900 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

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
