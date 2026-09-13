import React from 'react';
import { LogOut } from 'lucide-react';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { CalendarContainer } from '../calendar/CalendarContainer';
import { EventModal } from '../calendar/EventModal';

interface TabletViewerProps {
  onExit?: () => void;
}

export const TabletViewer: React.FC<TabletViewerProps> = () => {
  const { family } = useFamily();
  const { logout } = useAuth();

  return (
    <div
      id="familycal-tablet-viewer"
      className="flex flex-col h-screen supports-[height:100dvh]:h-[100dvh] w-full max-w-full bg-[#FAFAFA] text-gray-900 font-sans overflow-hidden select-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
    >
      {/* --- HOUSEHOLD VIEWER HEADER --- */}
      <header className="h-16 shrink-0 bg-white border-b border-gray-200/80 px-4 sm:px-6 md:px-8 flex items-center justify-between z-30 shadow-2xs">
        {/* Left: Existing household icon + Household Name + "Household Calendar" */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-200/60 p-1 grid grid-cols-2 gap-0.5 items-center justify-center shrink-0 shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EC4899]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#EAB308]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <span id="tablet-household-title" className="text-base sm:text-lg font-bold text-slate-800 tracking-tight leading-tight font-sans truncate">
              {family?.name || 'Household Family'}
            </span>
            <span className="text-[11px] font-semibold text-gray-500 leading-tight truncate">
              Household Calendar
            </span>
          </div>
        </div>

        {/* Right: Log Out (No Exit Viewer button) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="tablet-logout-button"
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold text-gray-600 hover:text-red-600 hover:bg-red-50 border border-gray-200 transition-colors cursor-pointer active:scale-98"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      {/* --- MAIN VIEWER BODY (Standard FamilyCal Calendar) --- */}
      <main id="tablet-viewer-content" className="flex-1 flex flex-col min-h-0 overflow-hidden p-2 sm:p-3 md:p-3.5 bg-[#FAFAFA]">
        <CalendarContainer isViewer={true} />
      </main>

      <EventModal />
    </div>
  );
};
