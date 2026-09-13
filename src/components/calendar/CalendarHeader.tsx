import React, { useState } from 'react';
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfWeek,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Users,
  Calendar as CalendarIcon,
  Check,
  Globe,
  Pencil,
  X,
  Layers,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { CalendarViewMode, Calendar } from '../../types';
import { getPastelColorInfo, PastelColorPicker } from '../../utils/colors';
import { EditCalendarModal } from './EditCalendarModal';

export const CalendarHeader: React.FC = () => {
  const {
    currentDate,
    setCurrentDate,
    viewMode,
    setViewMode,
    goToPreviousPeriod,
    goToNextPeriod,
    goToToday,
    openCreateEventModal,
    calendars,
    selectedCalendarIds,
    toggleCalendarSelection,
    selectedMemberIds,
    toggleMemberFilter,
    selectAllMembers,
    deselectAllMembers,
    selectAllCalendars,
    deselectAllCalendars,
    createCalendar,
    isSyncing,
    triggerGoogleSync,
    googleAccounts,
  } = useCalendar();

  const { members } = useFamily();
  const { user, hasPermission, isAdmin } = useAuth();

  const isViewer =
    user?.role === 'viewer' ||
    (typeof window !== 'undefined' && localStorage.getItem('familycal_viewer_mode') === 'true');

  const [isCalendarsDropdownOpen, setIsCalendarsDropdownOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [isAddingCal, setIsAddingCal] = useState(false);
  const [newCalName, setNewCalName] = useState('');
  const [newCalColor, setNewCalColor] = useState('#F8BBD0');
  const [newCalMemberId, setNewCalMemberId] = useState('');

  const canCreateEvent = !isViewer && (isAdmin || hasPermission('event_create'));
  const canCreateCalendar = !isViewer && (isAdmin || hasPermission('calendar_create'));
  const canEditCalendar = !isViewer && (isAdmin || hasPermission('calendar_edit'));
  const canAssignCalendar = !isViewer && (isAdmin || hasPermission('calendar_assign'));
  const activeMembers = members.filter((m) => m.is_active !== 0);

  // Group calendars into Member Calendars and Family-wide / Non-login Calendar Layers
  const familyCalendarLayers = calendars.filter(
    (c) => !c.member_id && c.name !== 'Family Hub' && c.name.toLowerCase() !== 'family hub'
  );
  const memberCalendars = calendars.filter((c) => !!c.member_id);

  const handlePrev = () => {
    goToPreviousPeriod();
  };

  const handleNext = () => {
    goToNextPeriod();
  };

  const handleToday = () => {
    goToToday();
  };

  const handleCreateNewCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCalName.trim()) return;
    await createCalendar({
      name: newCalName.trim(),
      color: newCalColor,
      member_id: canAssignCalendar ? (newCalMemberId || null) : null,
    });
    setNewCalName('');
    setNewCalMemberId('');
    setIsAddingCal(false);
  };

  const formattedHeaderTitle = () => {
    if (viewMode === 'month') return format(currentDate, 'MMMM yyyy');
    if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = addDays(start, 6);
      const startMonth = format(start, 'MMM');
      const endMonth = format(end, 'MMM');
      if (startMonth === endMonth) {
        return `${format(start, 'd')} – ${format(end, 'd')} ${format(start, 'MMM yyyy')}`;
      }
      return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
    }
    if (viewMode === 'day') return format(currentDate, 'EEEE, MMM d, yyyy');
    return `${format(currentDate, 'MMMM yyyy')} Agenda`;
  };

  const totalLayersCount = activeMembers.length + familyCalendarLayers.length;
  const activeLayersCount =
    selectedMemberIds.filter((id) => activeMembers.some((m) => m.id === id)).length +
    selectedCalendarIds.filter((id) => familyCalendarLayers.some((c) => c.id === id)).length;

  return (
    <div id="calendar-header-section" className="flex flex-col gap-3 pb-3 border-b border-gray-200">
      {/* Top Bar: Navigation, Title, View Mode & Action (Desktop) */}
      <div className="hidden md:flex items-center justify-between gap-3">
        {/* Left: Date controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <button
            id="cal-prev-btn"
            onClick={handlePrev}
            className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            id="cal-today-btn"
            onClick={handleToday}
            className="px-3 py-1.5 min-h-[38px] text-xs font-bold rounded-xl bg-white border border-gray-200 shadow-2xs hover:bg-gray-50 text-slate-800 transition-colors cursor-pointer"
          >
            Today
          </button>
          <button
            id="cal-next-btn"
            onClick={handleNext}
            className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <h2 id="calendar-current-title" className="text-sm sm:text-base md:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5 cursor-pointer hover:opacity-80 min-w-0 truncate">
            <span className="truncate">{formattedHeaderTitle()}</span>
            <ChevronDown className="w-4 h-4 text-slate-400 stroke-[2.5] shrink-0" />
          </h2>
        </div>

        {/* Right: Calendar Selector, View Mode Switcher, and Add Event Button */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Calendars Filter Dropdown */}
          <div className="relative">
            <button
              id="calendars-dropdown-toggle-btn"
              onClick={() => setIsCalendarsDropdownOpen(!isCalendarsDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-xs"
            >
              <Layers className="w-3.5 h-3.5 text-gray-500" />
              <span className="hidden sm:inline">
                Layers ({activeLayersCount}/{totalLayersCount})
              </span>
              <span className="sm:hidden">Layers</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {isCalendarsDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-gray-200 shadow-xl p-3.5 z-40 space-y-3 animate-in fade-in zoom-in-95"
              >
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" /> Calendar Layers
                  </span>
                  <div className="flex items-center gap-1">
                    {canCreateCalendar && (
                      <button
                        onClick={() => setIsAddingCal(!isAddingCal)}
                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                        title="Add Calendar"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setIsCalendarsDropdownOpen(false)}
                      className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Add Calendar inline form */}
                {isAddingCal && (
                  <form onSubmit={handleCreateNewCalendar} className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                    <input
                      type="text"
                      required
                      placeholder="Layer name (e.g. 🏫 School, ⚽ Sports...)"
                      value={newCalName}
                      onChange={(e) => setNewCalName(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
                    />
                    {canAssignCalendar && (
                      <select
                        value={newCalMemberId}
                        onChange={(e) => setNewCalMemberId(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-gray-900"
                      >
                        <option value="">Non-login Family Layer (Shared)</option>
                        {activeMembers.map((m) => (
                          <option key={m.id} value={m.id}>{m.name} (Member)</option>
                        ))}
                      </select>
                    )}
                    <PastelColorPicker selectedColor={newCalColor} onSelectColor={setNewCalColor} />
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingCal(false)}
                        className="px-2.5 py-1 text-xs text-gray-600 hover:text-gray-900 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-gray-800 cursor-pointer"
                      >
                        Add Layer
                      </button>
                    </div>
                  </form>
                )}

                {/* Multi-toggle list grouped by MEMBERS and FAMILY CALENDARS */}
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {/* Section 1: MEMBERS */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Members
                      </span>
                    </div>
                    {activeMembers.map((m) => {
                      const isChecked = selectedMemberIds.includes(m.id);
                      const colorInfo = getPastelColorInfo(m.color);

                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-gray-50 transition-colors group cursor-pointer"
                          onClick={() => toggleMemberFilter(m.id)}
                        >
                          <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleMemberFilter(m.id)}
                              className="rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
                            />
                            <span
                              className="w-3 h-3 rounded-full border shrink-0"
                              style={{ backgroundColor: colorInfo.dotHex, borderColor: colorInfo.borderHex }}
                            />
                            <span className="text-xs text-gray-800 font-semibold truncate">
                              {m.name}
                            </span>
                          </label>
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold border truncate"
                            style={{
                              backgroundColor: colorInfo.bgSoft,
                              color: colorInfo.textHex,
                              borderColor: colorInfo.borderHex,
                            }}
                          >
                            Member
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Section 2: FAMILY CALENDARS */}
                  <div className="space-y-1 pt-1 border-t border-gray-100">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Family Calendars
                      </span>
                    </div>
                    {familyCalendarLayers.map((cal) => {
                      const isChecked = selectedCalendarIds.includes(cal.id);
                      const colorInfo = getPastelColorInfo(cal.color);

                      return (
                        <div
                          key={cal.id}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-gray-50 transition-colors group cursor-pointer"
                          onClick={() => toggleCalendarSelection(cal.id)}
                        >
                          <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCalendarSelection(cal.id)}
                              className="rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
                            />
                            <span
                              className="w-3 h-3 rounded-full border shrink-0"
                              style={{ backgroundColor: colorInfo.dotHex, borderColor: colorInfo.borderHex }}
                            />
                            <span className="text-xs text-gray-800 font-medium truncate">
                              {cal.name}
                            </span>
                          </label>

                          <div className="flex items-center gap-1 shrink-0">
                            {cal.source === 'google' && (
                              <Globe className="w-3 h-3 text-blue-500 shrink-0" />
                            )}
                            {canEditCalendar && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsCalendarsDropdownOpen(false);
                                  setEditingCalendar(cal);
                                }}
                                className="p-1 rounded-md text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                                title="Edit Calendar"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* View Mode Switcher (Month / Week / Day / Agenda) */}
          <div id="calendar-view-mode-tabs" className="flex items-center bg-blue-50/80 p-1 rounded-xl border border-blue-200/60 shadow-2xs">
            {(['month', 'week', 'day', 'agenda'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                id={`cal-mode-${mode}`}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 sm:px-3.5 py-1.5 min-h-[36px] text-xs font-bold capitalize rounded-lg transition-all cursor-pointer ${
                  viewMode === mode
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-blue-700 hover:bg-blue-100/60'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={handleNext}
            className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer shadow-xs hidden sm:flex"
            aria-label="Next period"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Add Event Button */}
          {canCreateEvent && (
            <button
              id="cal-add-event-btn"
              onClick={() => openCreateEventModal()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span>Add Event</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Controls */}
      <div className="flex md:hidden flex-col gap-2.5 pt-1">
        <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-gray-200 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrev}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-gray-100 text-slate-800 cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1">
            <span>{formattedHeaderTitle()}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </h2>
        </div>

        {/* View Switcher Bar on Mobile & Small Tablets */}
        <div className="flex items-center justify-between bg-blue-50/80 p-1 rounded-xl border border-blue-200/60 gap-1">
          {(['month', 'week', 'day', 'agenda'] as CalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-2 min-h-[40px] text-xs font-bold capitalize rounded-lg transition-all text-center cursor-pointer ${
                viewMode === mode
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-blue-700 hover:bg-blue-100/60'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Horizontal Multi-Layer Filter Bar (Members + Family Calendars) */}
      <div id="calendar-layer-filter-bar" className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
        <span className="text-gray-400 font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap flex items-center gap-1 shrink-0 mr-0.5">
          <Layers className="w-3.5 h-3.5 text-blue-500" /> Layers:
        </span>

        {/* 1. Real Family Member Layers */}
        {activeMembers.map((member) => {
          const isSelected = selectedMemberIds.includes(member.id);
          const colorInfo = getPastelColorInfo(member.color);

          return (
            <button
              key={member.id}
              id={`filter-member-${member.id}`}
              onClick={() => toggleMemberFilter(member.id)}
              style={{
                backgroundColor: isSelected ? colorInfo.hex : '#F8FAFC',
                borderColor: isSelected ? colorInfo.borderHex : '#E2E8F0',
                color: isSelected ? colorInfo.textHex : '#94A3B8',
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold transition-all whitespace-nowrap cursor-pointer border shadow-2xs ${
                isSelected ? 'ring-1 ring-black/5 opacity-100' : 'opacity-65 hover:opacity-90 hover:border-gray-300'
              }`}
              title={`Toggle ${member.name}'s Layer`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border shrink-0"
                style={{
                  backgroundColor: isSelected ? colorInfo.dotHex : '#CBD5E1',
                  borderColor: isSelected ? colorInfo.borderHex : '#94A3B8',
                }}
              />
              <span>{member.name}</span>
              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
            </button>
          );
        })}

        {/* Category Divider */}
        {familyCalendarLayers.length > 0 && (
          <div className="h-4 w-px bg-gray-200 mx-1 shrink-0" />
        )}

        {/* 2. Non-login Family Calendar Layers (Birthdays, Bin Calendar, Public Holidays, etc.) */}
        {familyCalendarLayers.map((cal) => {
          const isSelected = selectedCalendarIds.includes(cal.id);
          const colorInfo = getPastelColorInfo(cal.color);

          return (
            <button
              key={cal.id}
              id={`filter-cal-layer-${cal.id}`}
              onClick={() => toggleCalendarSelection(cal.id)}
              style={{
                backgroundColor: isSelected ? colorInfo.hex : '#F8FAFC',
                borderColor: isSelected ? colorInfo.borderHex : '#E2E8F0',
                color: isSelected ? colorInfo.textHex : '#94A3B8',
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold transition-all whitespace-nowrap cursor-pointer border shadow-2xs ${
                isSelected ? 'ring-1 ring-black/5 opacity-100' : 'opacity-65 hover:opacity-90 hover:border-gray-300'
              }`}
              title={`Toggle ${cal.name} Layer`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border shrink-0"
                style={{
                  backgroundColor: isSelected ? colorInfo.dotHex : '#CBD5E1',
                  borderColor: isSelected ? colorInfo.borderHex : '#94A3B8',
                }}
              />
              <span>{cal.name}</span>
              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
            </button>
          );
        })}
      </div>

      {/* Edit Calendar Modal */}
      <EditCalendarModal
        calendar={editingCalendar}
        isOpen={!!editingCalendar}
        onClose={() => setEditingCalendar(null)}
      />
    </div>
  );
};
