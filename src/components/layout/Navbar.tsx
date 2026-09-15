import React, { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFamily } from '../../context/FamilyContext';
import {
  Calendar as CalIcon,
  Users,
  CheckSquare,
  Package,
  Bell,
  Settings,
  SlidersHorizontal,
  LogOut,
} from 'lucide-react';
import { getPastelColorInfo } from '../../utils/colors';

export type MainTabType = 'calendar' | 'family' | 'tasks' | 'stock' | 'notifications' | 'settings' | 'profile';

interface NavbarProps {
  activeTab: MainTabType;
  setActiveTab: (t: MainTabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, logout } = useAuth();
  const { family } = useFamily();
  const userColorInfo = user ? getPastelColorInfo(user.color) : null;

  useEffect(() => {
    if (family?.name) {
      document.title = family.name;
    }
  }, [family?.name]);

  const isViewer =
    user?.role === 'viewer' ||
    (typeof window !== 'undefined' && (
      localStorage.getItem('familycal_viewer_mode') === 'true' ||
      window.location.pathname === '/viewer' ||
      window.location.search.includes('mode=viewer') ||
      window.location.search.includes('viewer=1')
    ));

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'JD';

  const allTabs = [
    { id: 'calendar', label: 'Calendar', icon: CalIcon },
    { id: 'family', label: 'Family', icon: Users },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'stock', label: 'Stock', icon: Package },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  const navTabs = isViewer
    ? allTabs.filter((t) => t.id === 'calendar' || t.id === 'tasks' || t.id === 'stock')
    : allTabs;

  return (
    <header
      id="app-navbar"
      className="h-16 bg-white border-b border-gray-200/80 px-4 sm:px-8 flex items-center justify-between z-30 shrink-0 shadow-xs"
    >
      {/* Brand: 4 Colored Dots Logo + FamilyCal */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveTab('calendar')}
          className="flex items-center gap-2 text-left cursor-pointer focus:outline-none"
        >
          {/* Reference Logo Icon: 4 colorful dots grid */}
          <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-200/60 p-1 grid grid-cols-2 gap-0.5 items-center justify-center shrink-0 shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EC4899]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#EAB308]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
          </div>

          <span className="text-lg font-bold text-slate-800 tracking-tight">
            {family?.name || 'FamilyCal'}
          </span>
        </button>
      </div>

      {/* PC Center Navigation Tabs: Calendar | Tasks (for Viewer) OR Calendar | Family | Tasks | Notifications | Settings */}
      <nav className="hidden md:flex items-center gap-2">
        {navTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 lg:px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-bold'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right side controls: Profile avatar or Log Out for Viewer */}
      <div className="flex items-center gap-2 sm:gap-3">
        {isViewer ? (
          <button
            id="viewer-nav-logout-btn"
            onClick={() => {
              localStorage.removeItem('familycal_viewer_mode');
              logout();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-gray-50 hover:bg-red-50 hover:text-red-600 border border-gray-200 text-gray-700 text-xs font-bold transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        ) : (
          <>
            {/* Mobile Filter Button */}
            <button
              onClick={() => setActiveTab('settings')}
              className="flex md:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              title="Settings & Filters"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>

            {/* User Initials Avatar Circle (e.g. JD) */}
            <button
              onClick={() => setActiveTab('profile')}
              className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs cursor-pointer hover:bg-blue-700 transition-all border border-blue-700/20"
              title="View Profile"
            >
              {initials}
            </button>
          </>
        )}
      </div>
    </header>
  );
};
