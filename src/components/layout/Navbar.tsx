import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Calendar as CalIcon,
  Users,
  Bell,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import { getPastelColorInfo } from '../../utils/colors';

export type MainTabType = 'calendar' | 'family' | 'notifications' | 'settings' | 'profile';

interface NavbarProps {
  activeTab: MainTabType;
  setActiveTab: (t: MainTabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();
  const userColorInfo = user ? getPastelColorInfo(user.color) : null;

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'JD';

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
            FamilyCal
          </span>
        </button>
      </div>

      {/* PC Center Navigation Tabs: Calendar | Family | Notifications | Settings */}
      <nav className="hidden md:flex items-center gap-2">
        {(
          [
            { id: 'calendar', label: 'Calendar', icon: CalIcon },
            { id: 'family', label: 'Family', icon: Users },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'settings', label: 'Settings', icon: Settings },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
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

      {/* Right side controls: Profile initials avatar on PC, filter icon on Mobile */}
      <div className="flex items-center gap-3">
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
      </div>
    </header>
  );
};
