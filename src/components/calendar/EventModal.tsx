import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarEvent, RecurrenceRule } from '../../types';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Trash2,
  Calendar as CalIcon,
  Clock,
  MapPin,
  FileText,
  Repeat,
  Users,
  Tag,
  Globe,
  Check,
  Sparkles,
} from 'lucide-react';
import {
  PREDEFINED_EVENT_TYPES,
  getPastelColorInfo,
  getEventTypeInfo,
  getEventAssignmentInfo,
} from '../../utils/colors';

export const EventModal: React.FC = () => {
  const {
    selectedEvent,
    isEventModalOpen,
    eventModalInitialDate,
    closeEventModal,
    calendars,
    eventTypes,
    createEvent,
    updateEvent,
    deleteEvent,
  } = useCalendar();

  const { members } = useFamily();
  const { hasPermission, isAdmin, canEditEvent, canDeleteEvent } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [eventType, setEventType] = useState('Other');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [recurringRule, setRecurringRule] = useState<RecurrenceRule>('none');
  const [recurringUntil, setRecurringUntil] = useState('');
  const [assignedMemberIds, setAssignedMemberIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = selectedEvent ? canEditEvent(selectedEvent) : (isAdmin || hasPermission('event_create'));
  const canDelete = selectedEvent ? canDeleteEvent(selectedEvent) : false;

  // Available event types (either loaded from database or predefined fallback)
  const availableEventTypes = eventTypes && eventTypes.length > 0 ? eventTypes : PREDEFINED_EVENT_TYPES;

  // Initialize form when modal opens or selectedEvent changes
  useEffect(() => {
    if (!isEventModalOpen) return;

    if (selectedEvent) {
      setTitle(selectedEvent.title);
      setDescription(selectedEvent.description || '');
      setLocation(selectedEvent.location || '');
      setCalendarId(selectedEvent.calendar_id);
      setEventType(selectedEvent.event_type || 'Other');
      setAllDay(Boolean(selectedEvent.all_day));
      setRecurringRule(selectedEvent.recurring_rule || 'none');
      setRecurringUntil(selectedEvent.recurring_until ? selectedEvent.recurring_until.slice(0, 10) : '');
      setAssignedMemberIds(selectedEvent.assigned_member_ids || []);

      const sDate = new Date(selectedEvent.start_time);
      const eDate = new Date(selectedEvent.end_time);
      setStartDate(format(sDate, 'yyyy-MM-dd'));
      setStartTime(format(sDate, 'HH:mm'));
      setEndDate(format(eDate, 'yyyy-MM-dd'));
      setEndTime(format(eDate, 'HH:mm'));
    } else {
      // New Event Defaults
      const baseDate = eventModalInitialDate || new Date();
      const sDateStr = format(baseDate, 'yyyy-MM-dd');

      setTitle('');
      setDescription('');
      setLocation('');
      setEventType('Other');
      setStartDate(sDateStr);
      setEndDate(sDateStr);
      setStartTime(format(baseDate, 'HH:mm') === '00:00' ? '09:00' : format(baseDate, 'HH:mm'));
      setEndTime('10:00');
      setAllDay(false);
      setRecurringRule('none');
      setRecurringUntil('');

      // Default Calendar & Member assignment
      const defaultCal = calendars.find((c) => c.is_default) || calendars[0];
      if (defaultCal) {
        setCalendarId(defaultCal.id);
        if (defaultCal.member_id) {
          setAssignedMemberIds([defaultCal.member_id]);
        } else if (members.length > 0) {
          setAssignedMemberIds([members[0].id]);
        } else {
          setAssignedMemberIds([]);
        }
      } else if (members.length > 0) {
        setAssignedMemberIds([members[0].id]);
      } else {
        setAssignedMemberIds([]);
      }
    }
    setError(null);
  }, [isEventModalOpen, selectedEvent, eventModalInitialDate, calendars, members]);

  if (!isEventModalOpen) return null;

  // Derive assignment info (support single member or Whole Family / multi-member):
  const previewAssignment = getEventAssignmentInfo(
    {
      title,
      event_type: eventType,
      assigned_member_ids: assignedMemberIds,
    },
    members
  );

  // Derive the event type info:
  const currentEventTypeInfo = getEventTypeInfo(title, eventType, availableEventTypes as any);

  const isWholeFamilySelected =
    assignedMemberIds.length === members.length ||
    (assignedMemberIds.length === 0 && members.length > 0);

  const handleSelectWholeFamily = () => {
    setAssignedMemberIds(members.map((m) => m.id));
  };

  const handleSelectSingleMember = (memberId: string) => {
    setAssignedMemberIds([memberId]);
    const matchingCal = calendars.find((c) => c.member_id === memberId);
    if (matchingCal) {
      setCalendarId(matchingCal.id);
    }
  };

  const toggleMemberAssignment = (memberId: string) => {
    setAssignedMemberIds((prev) => {
      if (prev.includes(memberId)) {
        const updated = prev.filter((id) => id !== memberId);
        // If unchecking everything, fallback to admin or first member
        if (updated.length === 0 && members.length > 0) {
          return [members[0].id];
        }
        return updated;
      } else {
        return [...prev, memberId];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      setError('You do not have permission to save this event.');
      return;
    }
    if (!title.trim()) {
      setError('Event title is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let startIso: string;
      let endIso: string;

      if (allDay) {
        startIso = `${startDate}T00:00:00Z`;
        endIso = `${endDate || startDate}T23:59:59Z`;
      } else {
        startIso = new Date(`${startDate}T${startTime}:00`).toISOString();
        endIso = new Date(`${endDate || startDate}T${endTime}:00`).toISOString();
      }

      // Member colour is used as the full background colour of the event card
      const finalColor = previewAssignment.isFamilyEvent
        ? previewAssignment.adminMember?.color || 'blue'
        : previewAssignment.singleMember?.color || 'blue';

      const eventPayload: Partial<CalendarEvent> = {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        calendar_id: calendarId || calendars[0]?.id,
        color: finalColor,
        event_type: eventType,
        start_time: startIso,
        end_time: endIso,
        all_day: allDay,
        recurring_rule: recurringRule,
        recurring_until: recurringUntil ? `${recurringUntil}T23:59:59Z` : null,
        assigned_member_ids: assignedMemberIds,
      };

      if (selectedEvent) {
        await updateEvent(selectedEvent.id, eventPayload);
      } else {
        await createEvent(eventPayload);
      }
      closeEventModal();
    } catch (err: any) {
      setError(err?.message || 'Failed to save event.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEvent || !canDelete) return;
    if (confirm('Are you sure you want to delete this event?')) {
      setIsSubmitting(true);
      try {
        await deleteEvent(selectedEvent.id);
        closeEventModal();
      } catch (err: any) {
        setError(err?.message || 'Failed to delete event.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const isGoogle = selectedEvent?.google_event_id || selectedEvent?.calendar_source === 'google';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeEventModal();
      }}
    >
      <div
        id="event-modal-dialog"
        className="relative bg-white border border-gray-200 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[92vh] overflow-y-auto"
      >
        {/* Mobile Drag Indicator Bar */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div
              className="w-4 h-4 rounded-full shadow-2xs border shrink-0"
              style={{
                background: previewAssignment.isFamilyEvent
                  ? previewAssignment.segmentedGradient
                  : previewAssignment.primaryColorInfo.hex,
                borderColor: previewAssignment.borderHex,
              }}
            />
            <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight font-serif">
              {selectedEvent ? (canSave ? 'Edit Event' : 'Event Details') : 'New Event'}
            </h3>
            {isGoogle && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <Globe className="w-2.5 h-2.5" /> Google
              </span>
            )}
          </div>
          <button
            onClick={closeEventModal}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title Input */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Event Title *
            </label>
            <input
              id="event-title-input"
              type="text"
              required
              disabled={!canSave}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Football match, Doctor appointment, School camp..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-colors disabled:opacity-70 font-medium"
            />
          </div>

          {/* 1. FAMILY MEMBER SELECTOR (Determines full event-card pastel background colour) */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>1. Assign To</span>
              </label>
              <span className="text-[11px] font-medium text-gray-500">
                {previewAssignment.isFamilyEvent
                  ? 'Family event (divided member colours)'
                  : 'Individual member colour'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5">
              {/* Whole Family Option */}
              <button
                type="button"
                disabled={!canSave}
                onClick={handleSelectWholeFamily}
                style={{
                  background: isWholeFamilySelected
                    ? previewAssignment.segmentedGradient
                    : '#FFFFFF',
                  borderColor: isWholeFamilySelected
                    ? previewAssignment.adminColorInfo.borderHex
                    : '#E2E8F0',
                  color: '#0F172A',
                }}
                className={`relative flex items-center gap-2 p-2 rounded-xl text-xs border transition-all cursor-pointer shadow-2xs text-left overflow-hidden ${
                  isWholeFamilySelected
                    ? 'font-bold ring-2 ring-indigo-500/40 scale-[1.02]'
                    : 'hover:border-gray-300 font-medium'
                } disabled:opacity-70`}
              >
                {/* Visual section boundary indicators */}
                {isWholeFamilySelected && (
                  <div className="absolute inset-0 flex pointer-events-none rounded-[inherit] overflow-hidden -z-0">
                    {members.map((m, idx) => (
                      <div
                        key={m.id || idx}
                        className="flex-1 h-full border-r border-black/8 last:border-r-0"
                      />
                    ))}
                  </div>
                )}

                <div
                  className="relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-2xs"
                  style={{ backgroundColor: previewAssignment.adminColorInfo.dotHex }}
                >
                  <Users className="w-3 h-3 stroke-[2.5]" />
                </div>
                <div className="relative z-10 truncate flex-1 flex flex-col">
                  <span className="font-extrabold text-slate-900 leading-tight">Whole Family</span>
                  <span className="text-[9px] text-slate-600 font-semibold leading-tight">
                    All {members.length} members
                  </span>
                </div>
                {isWholeFamilySelected && (
                  <Check className="relative z-10 w-3.5 h-3.5 shrink-0 text-slate-900" />
                )}
              </button>

              {/* Individual Family Members */}
              {members.map((m) => {
                const isSelected =
                  !isWholeFamilySelected &&
                  assignedMemberIds.length === 1 &&
                  assignedMemberIds[0] === m.id;
                const mColor = getPastelColorInfo(m.color);

                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!canSave}
                    onClick={() => handleSelectSingleMember(m.id)}
                    style={{
                      backgroundColor: isSelected ? mColor.hex : '#FFFFFF',
                      borderColor: isSelected ? mColor.borderHex : '#E2E8F0',
                      color: isSelected ? mColor.textHex : '#334155',
                    }}
                    className={`flex items-center gap-2 p-2 rounded-xl text-xs border transition-all cursor-pointer shadow-2xs text-left ${
                      isSelected
                        ? 'font-bold ring-2 ring-indigo-500/30 scale-[1.02]'
                        : 'hover:border-gray-300 font-medium'
                    } disabled:opacity-70`}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: mColor.dotHex }}
                    >
                      {m.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="truncate flex-1">{m.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Multi-member toggle for custom subset of family members */}
            {members.length > 2 && (
              <div className="pt-1.5 flex items-center gap-2 text-[11px] text-gray-500 border-t border-slate-200/60 mt-2">
                <span className="shrink-0 font-medium">Customize participating:</span>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const isChecked = assignedMemberIds.includes(m.id);
                    const mColor = getPastelColorInfo(m.color);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMemberAssignment(m.id)}
                        disabled={!canSave}
                        style={{
                          backgroundColor: isChecked ? mColor.hex : '#FFFFFF',
                          borderColor: isChecked ? mColor.borderHex : '#E2E8F0',
                        }}
                        className={`px-2 py-0.5 rounded-full text-[10px] border transition-all cursor-pointer flex items-center gap-1 ${
                          isChecked
                            ? 'font-bold text-slate-900 shadow-2xs'
                            : 'text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: mColor.dotHex }}
                        />
                        <span>{m.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. EVENT TYPE SELECTOR (Determines event-type colour badge) */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-indigo-600" />
                <span>2. Event Type</span>
              </label>
              <span className="text-[11px] font-medium text-gray-500">
                Preassigned badge colour
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 pt-0.5">
              {availableEventTypes.map((et) => {
                const isSelected = eventType.toLowerCase() === et.name.toLowerCase();
                const badgeColor = et.color || (et as any).bgHex || '#64748B';
                const badgeIcon = et.icon || '⭐';

                return (
                  <button
                    key={et.name}
                    type="button"
                    disabled={!canSave}
                    onClick={() => setEventType(et.name)}
                    style={{
                      borderColor: isSelected ? badgeColor : '#E2E8F0',
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs border transition-all cursor-pointer bg-white text-left ${
                      isSelected
                        ? 'font-bold ring-2 shadow-xs scale-[1.02]'
                        : 'hover:border-gray-300 text-gray-700 font-medium'
                    } disabled:opacity-70`}
                  >
                    <span
                      className="w-5 h-5 rounded-full text-[10px] text-white flex items-center justify-center shrink-0 shadow-2xs"
                      style={{ backgroundColor: badgeColor }}
                    >
                      {badgeIcon}
                    </span>
                    <span className="truncate flex-1 text-slate-800">{et.name}</span>
                    {isSelected && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: badgeColor }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* LIVE VISUAL PREVIEW OF EVENT CARD */}
          <div className="p-3.5 rounded-2xl bg-white border border-gray-200 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 px-0.5">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> Card Appearance Preview
              </span>
              <span className="text-[10px] text-gray-400">
                {previewAssignment.isFamilyEvent
                  ? 'Divided Family Colours + Event Type Badge'
                  : 'Member Colour + Event Type Badge'}
              </span>
            </div>

            <div
              style={{
                background: previewAssignment.isFamilyEvent
                  ? previewAssignment.segmentedGradient
                  : previewAssignment.primaryColorInfo.hex,
                borderColor: previewAssignment.borderHex,
              }}
              className="relative p-3.5 rounded-2xl border shadow-2xs flex flex-col gap-2 transition-all overflow-hidden"
            >
              {/* Visible boundary dividers for multi-colour Family event card */}
              {previewAssignment.isFamilyEvent && (
                <div className="absolute inset-0 flex pointer-events-none rounded-[inherit] overflow-hidden -z-0">
                  {previewAssignment.participatingMembers.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      className="flex-1 h-full border-r border-black/8 last:border-r-0"
                    />
                  ))}
                </div>
              )}

              <div className="relative z-10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {previewAssignment.isFamilyEvent ? (
                    <>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-2xs shrink-0"
                        style={{ backgroundColor: previewAssignment.adminColorInfo.dotHex }}
                        title="Whole Family"
                      >
                        <Users className="w-3 h-3 stroke-[2.5]" />
                      </div>
                      <span className="text-xs font-extrabold text-slate-900 tracking-tight">
                        Family
                      </span>
                      <div className="flex -space-x-1 items-center ml-0.5">
                        {previewAssignment.participatingMembers.map((m) => {
                          const mColor = getPastelColorInfo(m.color);
                          return (
                            <span
                              key={m.id}
                              title={m.name}
                              className="w-3.5 h-3.5 rounded-full border border-white/90 shadow-2xs shrink-0 flex items-center justify-center text-[7px] font-bold text-white"
                              style={{ backgroundColor: mColor.dotHex }}
                            >
                              {m.name.slice(0, 1).toUpperCase()}
                            </span>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-2xs shrink-0"
                        style={{ backgroundColor: previewAssignment.primaryColorInfo.dotHex }}
                      >
                        {previewAssignment.label.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {previewAssignment.label}
                      </span>
                    </>
                  )}
                </div>

                {/* Preassigned Event Type Badge */}
                <div
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white flex items-center gap-1 shadow-2xs shrink-0"
                  style={{ backgroundColor: currentEventTypeInfo.bgHex }}
                >
                  <span>{currentEventTypeInfo.icon}</span>
                  <span>{currentEventTypeInfo.name}</span>
                </div>
              </div>

              <div className="relative z-10 text-sm font-bold text-slate-900 truncate">
                {title.trim() || 'Family School Event'}
              </div>

              <div className="relative z-10 text-xs font-semibold text-slate-700 opacity-90 flex items-center gap-2 truncate">
                <span>{allDay ? 'All Day' : `${startTime} – ${endTime}`}</span>
                {location.trim() && (
                  <>
                    <span>•</span>
                    <span className="truncate">{location}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Date & Time Row */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-500" /> Time & Schedule
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 font-medium">
                <input
                  type="checkbox"
                  disabled={!canSave}
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span>All Day</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-gray-500 font-semibold block mb-1">Start</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    required
                    disabled={!canSave}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                  {!allDay && (
                    <input
                      type="time"
                      required
                      disabled={!canSave}
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-28 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-gray-900 font-mono"
                    />
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-gray-500 font-semibold block mb-1">End</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    required
                    disabled={!canSave}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                  {!allDay && (
                    <input
                      type="time"
                      required
                      disabled={!canSave}
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-28 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-gray-900 font-mono"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recurrence Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <Repeat className="w-3.5 h-3.5 text-gray-500" /> Repeat
              </label>
              <select
                value={recurringRule}
                disabled={!canSave}
                onChange={(e) => setRecurringRule(e.target.value as RecurrenceRule)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900 cursor-pointer disabled:opacity-70 font-medium"
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
                <option value="yearly">Every year</option>
              </select>
            </div>

            {recurringRule !== 'none' && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Repeat Until
                </label>
                <input
                  type="date"
                  disabled={!canSave}
                  value={recurringUntil}
                  onChange={(e) => setRecurringUntil(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>
            )}
          </div>

          {/* Calendar Select */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <CalIcon className="w-3.5 h-3.5 text-gray-500" /> Calendar
            </label>
            <select
              id="event-calendar-select"
              value={calendarId}
              disabled={!canSave}
              onChange={(e) => setCalendarId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900 cursor-pointer disabled:opacity-70 font-medium"
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.member_name ? `(${c.member_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-gray-500" /> Location
            </label>
            <input
              id="event-location-input"
              type="text"
              disabled={!canSave}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Home, School Gym, Central Park..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 disabled:opacity-70"
            />
          </div>

          {/* Description Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-gray-500" /> Notes & Details
            </label>
            <textarea
              id="event-description-input"
              rows={2}
              disabled={!canSave}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details, packing list, or notes for the family..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 resize-none disabled:opacity-70"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            {selectedEvent && canDelete ? (
              <button
                type="button"
                id="event-delete-btn"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeEventModal}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                {canSave ? 'Cancel' : 'Close'}
              </button>
              {canSave && (
                <button
                  type="submit"
                  id="event-save-btn"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : selectedEvent ? 'Update Event' : 'Create Event'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
