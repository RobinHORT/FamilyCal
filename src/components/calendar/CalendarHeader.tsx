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
    openCreateEventModal,
    calendars,
    selectedCalendarIds,
    toggleCalendarSelection,
    createCalendar,
    isSyncing,
    triggerGoogleSync,
    googleAccounts,
  } = useCalendar();

  const { members, selectedMemberFilter, setSelectedMemberFilter } = useFamily();
  const { hasPermission, isAdmin } = useAuth();

  const [isCalendarsDropdownOpen, setIsCalendarsDropdownOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [isAddingCal, setIsAddingCal] = useState(false);
  const [newCalName, setNewCalName] = useState('');
  const [newCalColor, setNewCalColor] = useState('#F8BBD0');
  const [newCalMemberId, setNewCalMemberId] = useState('');

  const canCreateEvent = isAdmin || hasPermission('event_create');
  const canCreateCalendar = isAdmin || hasPermission('calendar_create');
  const canEditCalendar = isAdmin || hasPermission('calendar_edit');
  const canAssignCalendar = isAdmin || hasPermission('calendar_assign');
  const activeMembers = members.filter((m) => m.is_active !== 0);

  const handlePrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else if (viewMode === 'day') setCurrentDate(subDays(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else if (viewMode === 'day') setCurrentDate(addDays(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
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

  const isGoogleConnected = googleAccounts.length > 0 && googleAccounts.some(a => a.sync_status === 'connected');

  return (
    <div id="calendar-header-section" className="flex flex-col gap-3 pb-3 border-b border-gray-200">
      {/* Top Bar: Navigation, Title, View Mode & Action (Desktop) */}
      <div className="hidden md:flex items-center justify-between gap-3">
        {/* Left: Date controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            id="cal-prev-btn"
            onClick={handlePrev}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            id="cal-today-btn"
            onClick={handleToday}
            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-white border border-gray-200 shadow-2xs hover:bg-gray-50 text-slate-800 transition-colors cursor-pointer"
          >
            Today
          </button>
          <button
            id="cal-next-btn"
            onClick={handleNext}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <h2 id="calendar-current-title" className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5 cursor-pointer hover:opacity-80">
            <span>{formattedHeaderTitle()}</span>
            <ChevronDown className="w-4 h-4 text-slate-400 stroke-[2.5]" />
          </h2>
        </div>

        {/* Right: Calendar Selector, View Mode Switcher, and Add Event Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Calendars Filter Dropdown */}
          <div className="relative">
            <button
              id="calendars-dropdown-toggle-btn"
              onClick={() => setIsCalendarsDropdownOpen(!isCalendarsDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-xs"
            >
              <Layers className="w-3.5 h-3.5 text-gray-500" />
              <span className="hidden sm:inline">Calendars ({selectedCalendarIds.length}/{calendars.length})</span>
              <span className="sm:hidden">Calendars</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {isCalendarsDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-2xl border border-gray-200 shadow-xl p-3.5 z-40 space-y-3 animate-in fade-in zoom-in-95"
              >
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Household Calendars
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
                      placeholder="Calendar name (e.g. School, Work...)"
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
                        <option value="">Shared Household</option>
                        {activeMembers.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
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
                        Add
                      </button>
                    </div>
                  </form>
                )}

                {/* Calendars multi-toggle list */}
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {calendars.map((cal) => {
                    const isChecked = selectedCalendarIds.includes(cal.id);
                    const colorInfo = getPastelColorInfo(cal.color);
                    const assignedMember = members.find((m) => m.id === cal.member_id);

                    return (
                      <div
                        key={cal.id}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-gray-50 transition-colors group"
                      >
                        <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCalendarSelection(cal.id)}
                            className="rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer"
                          />
                          <span
                            className="w-3 h-3 rounded-full border shrink-0"
                            style={{ backgroundColor: colorInfo.hex, borderColor: colorInfo.borderHex }}
                          />
                          <span className="text-xs text-gray-800 font-medium truncate">
                            {cal.name}
                          </span>
                        </label>

                        <div className="flex items-center gap-1 shrink-0">
                          {assignedMember && (
                            <span
                              className="px-1.5 py-0.5 rounded-md text-[9px] font-bold border truncate max-w-[65px]"
                              style={{
                                backgroundColor: getPastelColorInfo(assignedMember.color).bgSoft,
                                color: getPastelColorInfo(assignedMember.color).textHex,
                                borderColor: getPastelColorInfo(assignedMember.color).borderHex,
                              }}
                            >
                              {assignedMember.name}
                            </span>
                          )}
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
            )}
          </div>

          {/* View Mode Switcher (Week / Month) */}
          <div id="calendar-view-mode-tabs" className="flex items-center bg-blue-50/80 p-1 rounded-xl border border-blue-200/60 shadow-2xs">
            {(['week', 'month'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                id={`cal-mode-${mode}`}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-1.5 text-xs font-bold capitalize rounded-lg transition-all cursor-pointer ${
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

      {/* Mobile Controls (Matching Phone Reference) */}
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

        {/* View Switcher Bar on Mobile */}
        <div className="flex items-center justify-between bg-blue-50/80 p-1 rounded-xl border border-blue-200/60">
          {(['week', 'month'] as CalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-1.5 text-xs font-bold capitalize rounded-lg transition-all text-center cursor-pointer ${
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
      <div id="family-member-filter-bar" className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
        <span className="text-gray-400 font-medium whitespace-nowrap flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-gray-400" /> Filter:
        </span>

        <button
          id="filter-member-all"
          onClick={() => setSelectedMemberFilter(null)}
          className={`px-3 py-1 rounded-full font-semibold transition-all whitespace-nowrap cursor-pointer border ${
            selectedMemberFilter === null
              ? 'bg-gray-900 text-white border-gray-900 shadow-xs'
              : 'bg-white text-gray-600 hover:text-gray-900 border-gray-200'
          }`}
        >
          All Household
        </button>

        {members.map((member) => {
          const isSelected = selectedMemberFilter === member.id;
          const colorInfo = getPastelColorInfo(member.color);

          return (
            <button
              key={member.id}
              id={`filter-member-${member.id}`}
              onClick={() => setSelectedMemberFilter(isSelected ? null : member.id)}
              style={{
                backgroundColor: isSelected ? colorInfo.hex : '#FFFFFF',
                borderColor: isSelected ? colorInfo.borderHex : '#E2E8F0',
                color: isSelected ? colorInfo.textHex : '#475569',
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold transition-all whitespace-nowrap cursor-pointer border shadow-xs ${
                isSelected ? 'ring-1 ring-black/10' : 'hover:border-gray-300'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border shrink-0"
                style={{ backgroundColor: colorInfo.dotHex, borderColor: colorInfo.borderHex }}
              />
              <span>{member.name}</span>
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
