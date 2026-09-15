import React from 'react';
import {
  Calendar,
  Users,
  CheckSquare,
  Package,
  Bell,
  Settings,
} from 'lucide-react';
import { MainTabType } from './Navbar';
import { useAuth } from '../../context/AuthContext';

interface MobileNavProps {
  activeTab: MainTabType;
  setActiveTab: (t: MainTabType) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();
  const isViewer =
    user?.role === 'viewer' ||
    (typeof window !== 'undefined' && (
      localStorage.getItem('familycal_viewer_mode') === 'true' ||
      window.location.pathname === '/viewer' ||
      window.location.search.includes('mode=viewer') ||
      window.location.search.includes('viewer=1')
    ));

  const allTabs = [
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'family', label: 'Family', icon: Users },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'stock', label: 'Stock', icon: Package },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  const tabs = isViewer
    ? allTabs.filter((t) => t.id === 'calendar' || t.id === 'tasks' || t.id === 'stock')
    : allTabs;

  return (
    <nav
      id="mobile-bottom-nav"
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 flex items-center justify-around px-2 z-40 shadow-lg"
      style={{
        height: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            id={`mobile-tab-${tab.id}`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 min-h-[48px] transition-all cursor-pointer ${
              isActive ? 'text-blue-600 font-bold' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition-all ${
                isActive ? 'text-blue-600' : ''
              }`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <span className={`text-[10px] tracking-tight mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
