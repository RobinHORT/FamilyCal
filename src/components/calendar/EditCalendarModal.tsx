import React, { useState, useEffect } from 'react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { Calendar } from '../../types';
import {
  X,
  Calendar as CalIcon,
  Palette,
  Users,
  Globe,
  Loader2,
  Trash2,
} from 'lucide-react';
import { PastelColorPicker, getPastelColorInfo } from '../../utils/colors';

interface EditCalendarModalProps {
  calendar: Calendar | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditCalendarModal: React.FC<EditCalendarModalProps> = ({
  calendar,
  isOpen,
  onClose,
}) => {
  const { updateCalendar, deleteCalendar } = useCalendar();
  const { members } = useFamily();
  const { hasPermission, isAdmin } = useAuth();

  const [name, setName] = useState('');
  const [color, setColor] = useState('#F8BBD0');
  const [memberId, setMemberId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDeleteCalendar = (isAdmin || hasPermission('calendar_delete')) && calendar?.is_default !== 1;
  const canAssignCalendar = isAdmin || hasPermission('calendar_assign');

  useEffect(() => {
    if (calendar && isOpen) {
      setName(calendar.name);
      setColor(calendar.color || '#F8BBD0');
      setMemberId(calendar.member_id || '');
      setError(null);
    }
  }, [calendar, isOpen]);

  if (!isOpen || !calendar) return null;

  const activeMembers = members.filter((m) => m.is_active !== 0);
  const isGoogle = calendar.source === 'google';
  const colorInfo = getPastelColorInfo(color);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Calendar name is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateCalendar(calendar.id, {
        name: name.trim(),
        color,
        member_id: canAssignCalendar ? (memberId || null) : calendar.member_id,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update calendar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${calendar.name}"? All events on this calendar will also be removed.`)) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await deleteCalendar(calendar.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete calendar.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      id="edit-calendar-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="edit-calendar-dialog"
        className="relative bg-white border border-gray-200 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 my-0 sm:my-8"
      >
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border shrink-0 shadow-2xs"
              style={{ backgroundColor: colorInfo.hex, borderColor: colorInfo.borderHex }}
            />
            <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight font-serif">Edit Calendar</h3>
            {isGoogle && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <Globe className="w-2.5 h-2.5" /> Google
              </span>
            )}
          </div>
          <button
            id="close-edit-calendar-button"
            type="button"
            onClick={onClose}
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
        <form onSubmit={handleSave} className="space-y-4">
          {/* Name input */}
          <div>
            <label
              htmlFor="edit-cal-name-input"
              className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5"
            >
              <CalIcon className="w-3.5 h-3.5 text-gray-500" /> Calendar Name
            </label>
            <input
              id="edit-cal-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dad's Work, School, Family..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-colors"
            />
          </div>

          {/* Color Picker with 15 Pastel Shades */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-gray-500" /> Color (15 Pastel Colours)
            </label>
            <PastelColorPicker selectedColor={color} onSelectColor={setColor} />
          </div>

          {/* Assigned Member dropdown */}
          {canAssignCalendar && (
            <div>
              <label
                htmlFor="edit-cal-member-select"
                className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5 text-gray-500" /> Assigned Member
              </label>
              <select
                id="edit-cal-member-select"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-xs text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-900 cursor-pointer font-medium"
              >
                <option value="">Shared Household</option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role.charAt(0).toUpperCase() + m.role.slice(1)})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Assign to a specific family member or leave as Shared Household.
              </p>
            </div>
          )}

          {/* Google Calendar Informational Banner */}
          {isGoogle && (
            <div className="p-3 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-1 text-xs">
              <div className="flex items-center gap-1.5 text-blue-900 font-semibold">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>Google Calendar Details</span>
              </div>
              <p className="text-[11px] text-gray-600 break-all font-mono">
                ID: {calendar.google_calendar_id || calendar.id}
              </p>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            {canDeleteCalendar ? (
              <button
                id="delete-calendar-button"
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting || isDeleting}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                id="cancel-edit-calendar-button"
                type="button"
                onClick={onClose}
                disabled={isSubmitting || isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="save-calendar-button"
                type="submit"
                disabled={isSubmitting || isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gray-900 hover:bg-gray-800 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
