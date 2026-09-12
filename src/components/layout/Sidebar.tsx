import React, { useState } from 'react';
import { MiniCalendar } from '../calendar/MiniCalendar';
import { EditCalendarModal } from '../calendar/EditCalendarModal';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { Calendar } from '../../types';
import {
  Calendar as CalIcon,
  Plus,
  Check,
  Globe,
  Users,
  ChevronDown,
  Pencil,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    calendars,
    selectedCalendarIds,
    toggleCalendarSelection,
    createCalendar,
  } = useCalendar();

  const { members, selectedMemberFilter, setSelectedMemberFilter } = useFamily();
  const { hasPermission, isAdmin } = useAuth();

  const canCreateCalendar = isAdmin || hasPermission('calendar_create');
  const canEditCalendar = isAdmin || hasPermission('calendar_edit');
  const canAssignCalendar = isAdmin || hasPermission('calendar_assign');

  // Collapsible section states persisted across page refresh and re-login
  const [isCalendarsCollapsed, setIsCalendarsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('householdCalendarsCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [isMembersCollapsed, setIsMembersCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('familyMembersCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [editingCal, setEditingCal] = useState<Calendar | null>(null);
  const [isAddingCal, setIsAddingCal] = useState(false);
  const [newCalName, setNewCalName] = useState('');
  const [newCalColor, setNewCalColor] = useState('#FF4FA3');
  const [newCalMemberId, setNewCalMemberId] = useState('');

  const activeMembers = members.filter((m) => m.is_active !== 0);

  const toggleHouseholdCalendars = () => {
    setIsCalendarsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('householdCalendarsCollapsed', String(next));
      } catch {}
      return next;
    });
  };

  const toggleFamilyMembers = () => {
    setIsMembersCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('familyMembersCollapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleCreateCalendar = async (e: React.FormEvent) => {
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

  return (
    <aside
      id="app-sidebar"
      className="hidden lg:flex flex-col w-64 xl:w-72 bg-[#0B0D13] border-r border-[#242C3D]/60 p-4 gap-5 overflow-y-auto shrink-0 scrollbar-none"
    >
      {/* 1. Mini Month Date Picker */}
      <MiniCalendar />

      {/* 2. Calendars Multi-Select */}
      <div className="p-3.5 bg-[#121620] rounded-2xl border border-[#242C3D]/60 space-y-3">
        {/* Clickable Collapsible Section Header */}
        <div
          id="toggle-household-calendars"
          onClick={toggleHouseholdCalendars}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-white transition-colors">
            <CalIcon className="w-3.5 h-3.5 text-[#FF4FA3]" /> Household Calendars
          </span>
          <div className="flex items-center gap-1">
            {canCreateCalendar && (
              <button
                id="add-calendar-toggle-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isCalendarsCollapsed) {
                    setIsCalendarsCollapsed(false);
                    try {
                      localStorage.setItem('householdCalendarsCollapsed', 'false');
                    } catch {}
                  }
                  setIsAddingCal(!isAddingCal);
                }}
                className="p-1 rounded-lg hover:bg-[#1A202C] text-gray-400 hover:text-white transition-colors cursor-pointer"
                title="Create Calendar"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <span
              className="p-1 text-gray-400 group-hover:text-white transition-transform duration-200 flex items-center justify-center"
              style={{
                transform: isCalendarsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              }}
              title={isCalendarsCollapsed ? 'Expand Household Calendars' : 'Collapse Household Calendars'}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Collapsible Content */}
        {!isCalendarsCollapsed && (
          <div className="space-y-3">
            {/* Add Calendar inline form with Name, Color, and Assigned Member */}
            {canCreateCalendar && isAddingCal && (
              <form onSubmit={handleCreateCalendar} className="space-y-2.5 pt-1 pb-2 border-b border-[#242C3D]/60">
                <div>
                  <label htmlFor="create-cal-name" className="text-[10px] text-gray-400 font-semibold block mb-1">
                    Calendar Name
                  </label>
                  <input
                    id="create-cal-name"
                    type="text"
                    required
                    value={newCalName}
                    onChange={(e) => setNewCalName(e.target.value)}
                    placeholder="e.g. School, Work..."
                    className="w-full bg-[#1A202C] border border-[#242C3D] rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FA3]"
                  />
                </div>

                {canAssignCalendar && (
                  <div>
                    <label htmlFor="create-cal-member" className="text-[10px] text-gray-400 font-semibold block mb-1">
                      Assigned Member
                    </label>
                    <select
                      id="create-cal-member"
                      value={newCalMemberId}
                      onChange={(e) => setNewCalMemberId(e.target.value)}
                      className="w-full bg-[#1A202C] border border-[#242C3D] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FF4FA3] cursor-pointer"
                    >
                      <option value="">Shared Household</option>
                      {activeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role.charAt(0).toUpperCase() + m.role.slice(1)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[10px] text-gray-400 font-semibold block mb-1">
                    Color
                  </label>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {['#FF4FA3', '#06B6D4', '#10B981', '#F59E0B', '#8B5CF6'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewCalColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                            newCalColor === c ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsAddingCal(false)}
                        className="px-2 py-1 text-gray-400 hover:text-white rounded-lg text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-[#FF4FA3] hover:bg-[#e63e90] text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            )}

            {/* Calendars Checkbox List */}
            <div className="space-y-1.5">
              {calendars.map((cal) => {
                const isChecked = selectedCalendarIds.includes(cal.id);
                const isGoogle = cal.source === 'google';

                return (
                  <div
                    key={cal.id}
                    className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-[#1A202C] transition-colors group"
                  >
                    <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCalendarSelection(cal.id)}
                        className="rounded bg-[#1A202C] border-[#242C3D] text-[#FF4FA3] focus:ring-[#FF4FA3] cursor-pointer"
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cal.color || '#FF4FA3' }}
                      />
                      <span className="text-xs text-gray-200 font-medium truncate group-hover:text-white">
                        {cal.name}
                      </span>
                    </label>

                    <div className="flex items-center gap-1 shrink-0">
                      {cal.member_name && (
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[9px] font-bold truncate max-w-[65px]"
                          style={{
                            backgroundColor: `${cal.member_color || '#FF4FA3'}25`,
                            color: cal.member_color || '#FF4FA3',
                            border: `1px solid ${cal.member_color || '#FF4FA3'}40`,
                          }}
                          title={`Assigned to ${cal.member_name}`}
                        >
                          {cal.member_name}
                        </span>
                      )}
                      {isGoogle && (
                        <Globe className="w-3 h-3 text-blue-400 shrink-0" title="Google Synced" />
                      )}
                      {canEditCalendar && (
                        <button
                          id={`edit-cal-${cal.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCal(cal);
                          }}
                          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#242C3D] transition-colors opacity-80 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                          title={`Edit ${cal.name}`}
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

      {/* 3. Family Members Quick Status */}
      <div className="p-3.5 bg-[#121620] rounded-2xl border border-[#242C3D]/60 space-y-2.5">
        {/* Clickable Collapsible Section Header */}
        <div
          id="toggle-family-members"
          onClick={toggleFamilyMembers}
          className="flex items-center justify-between cursor-pointer select-none group"
        >
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-white transition-colors">
            <Users className="w-3.5 h-3.5 text-[#FF4FA3]" /> Family Members
          </span>
          <span
            className="p-1 text-gray-400 group-hover:text-white transition-transform duration-200 flex items-center justify-center"
            style={{
              transform: isMembersCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            }}
            title={isMembersCollapsed ? 'Expand Family Members' : 'Collapse Family Members'}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Collapsible Content */}
        {!isMembersCollapsed && (
          <div className="space-y-1.5">
            <button
              onClick={() => setSelectedMemberFilter(null)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                selectedMemberFilter === null
                  ? 'bg-[#1A202C] text-[#FF4FA3] font-bold'
                  : 'text-gray-400 hover:text-white hover:bg-[#1A202C]'
              }`}
            >
              <span>All Members</span>
              {selectedMemberFilter === null && <Check className="w-3.5 h-3.5" />}
            </button>

            {members.map((m) => {
              const isSelected = selectedMemberFilter === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMemberFilter(isSelected ? null : m.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#1A202C] text-white font-bold'
                      : 'text-gray-300 hover:text-white hover:bg-[#1A202C]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: m.color || '#FF4FA3' }}
                    />
                    <span className="truncate">{m.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#FF4FA3]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. App Info Badge */}
      <div className="mt-auto pt-2 text-center text-[10px] text-gray-500 flex flex-col items-center gap-1">
        <span>Yimly FamilyCal • Self-Hosted Edition</span>
        <span className="text-gray-600 font-mono">SQLite Local Database</span>
      </div>

      {/* Edit Calendar Modal */}
      <EditCalendarModal
        calendar={editingCal}
        isOpen={!!editingCal}
        onClose={() => setEditingCal(null)}
      />
    </aside>
  );
};
