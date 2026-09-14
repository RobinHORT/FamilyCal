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
import { CalendarAddChoiceModal } from './components/calendar/CalendarAddChoiceModal';
import { TaskModal } from './components/tasks/TaskModal';
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
  const [activeTab, setActiveTab] = useState<MainTabType>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['calendar', 'family', 'tasks', 'notifications', 'settings', 'profile'].includes(tabParam)) {
        return tabParam as MainTabType;
      }
    }
    return 'calendar';
  });
  const [currentPath, setCurrentPath] = useState(typeof window !== 'undefined' ? window.location.pathname : '/');

  const isViewer =
    user?.role === 'viewer' ||
    (typeof window !== 'undefined' && (
      localStorage.getItem('familycal_viewer_mode') === 'true' ||
      window.location.pathname === '/viewer' ||
      window.location.search.includes('mode=viewer') ||
      window.location.search.includes('viewer=1')
    ));

  React.useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['calendar', 'family', 'tasks', 'notifications', 'settings', 'profile'].includes(tabParam)) {
        setActiveTab(tabParam as MainTabType);
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Enforce restricted navigation for Viewer accounts
  React.useEffect(() => {
    if (isViewer && activeTab !== 'calendar' && activeTab !== 'tasks') {
      setActiveTab('calendar');
    }
  }, [isViewer, activeTab]);

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

  // If on /viewer and not authenticated yet, show ViewerLogin modal/screen
  if (currentPath === '/viewer' && !user) {
    return (
      <ViewerLogin
        onSuccess={async () => {
          await checkAuth();
        }}
      />
    );
  }

  if (!user) {
    return <AuthModal />;
  }

  return (
    <div
      id="yimly-app-root"
      className="flex flex-col h-screen supports-[height:100dvh]:h-[100dvh] w-full max-w-full bg-[#FAFAFA] text-gray-900 font-sans overflow-hidden select-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
    >
      {/* Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative w-full max-w-full min-w-0">
        {/* Dynamic Center Stage */}
        <main
          id="main-stage-content"
          className={`flex-1 flex flex-col min-h-0 bg-[#FAFAFA] w-full max-w-full min-w-0 ${
            activeTab === 'calendar' || activeTab === 'tasks'
              ? 'overflow-y-auto md:overflow-hidden p-2 sm:p-3 md:p-3.5'
              : 'overflow-y-auto p-3 sm:p-6 main-stage-scroll'
          }`}
        >
          {activeTab === 'calendar' && <CalendarContainer />}
          {!isViewer && activeTab === 'family' && <FamilyView />}
          {activeTab === 'tasks' && <TasksView />}
          {!isViewer && activeTab === 'notifications' && <NotificationsView />}
          {!isViewer && activeTab === 'settings' && <IntegrationsView />}
          {!isViewer && activeTab === 'profile' && <ProfileView />}
          {!isViewer && activeTab === ('birthdays' as any) && <BirthdaysView />}
        </main>
      </div>

      {/* Small Choice Modal for + (Event vs Task) */}
      <CalendarAddChoiceModal />

      {/* Global Event Modal for Add / Edit */}
      <EventModal />

      {/* Global Task Modal for Add / Edit */}
      <TaskModal />

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
