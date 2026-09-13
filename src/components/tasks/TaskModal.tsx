import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckSquare, Calendar, Clock, AlertCircle, Trash2, Archive, Check, Bell, BellOff, BellRing } from 'lucide-react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { Priority, Task } from '../../types';
import { getNotificationPermission, requestNotificationPermission, NotificationPermissionState } from '../../utils/taskNotifications';

export const TaskModal: React.FC = () => {
  const {
    isTaskModalOpen,
    closeTaskModal,
    taskModalInitialDate,
    editingTask,
    createTask,
    updateTask,
    deleteTask,
    archiveTask,
    toggleTask,
  } = useCalendar();

  const { members } = useFamily();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [assignedMemberId, setAssignedMemberId] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [isArchived, setIsArchived] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permState, setPermState] = useState<NotificationPermissionState>('default');

  useEffect(() => {
    if (isTaskModalOpen) {
      setPermState(getNotificationPermission());
      if (editingTask) {
        setTitle(editingTask.title);
        setDescription(editingTask.description || '');
        setDueDate(editingTask.due_date || '');
        setDueTime(editingTask.due_time || '');
        setReminderMinutes(
          editingTask.reminder_minutes !== undefined && editingTask.reminder_minutes !== null
            ? Number(editingTask.reminder_minutes)
            : null
        );
        setAssignedMemberId(editingTask.assigned_member_id || '');
        setPriority(editingTask.priority || 'medium');
        setIsArchived(Boolean(editingTask.is_archived));
        setIsCompleted(Boolean(editingTask.completed));
      } else {
        const initial = taskModalInitialDate || new Date();
        setTitle('');
        setDescription('');
        setDueDate(format(initial, 'yyyy-MM-dd'));
        setDueTime('');
        setReminderMinutes(null);
        setAssignedMemberId('');
        setPriority('medium');
        setIsArchived(false);
        setIsCompleted(false);
      }
      setError(null);
    }
  }, [isTaskModalOpen, editingTask, taskModalInitialDate]);

  if (!isTaskModalOpen) return null;

  const handleReminderChange = async (val: string) => {
    if (val === '') {
      setReminderMinutes(null);
      return;
    }
    const num = Number(val);
    setReminderMinutes(num);

    // Request notification permission if not yet decided
    if (permState === 'default') {
      const res = await requestNotificationPermission();
      setPermState(res);
    }
  };

  const handleRequestPermissionClick = async () => {
    const res = await requestNotificationPermission();
    setPermState(res);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a task title');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const taskData: Partial<Task> = {
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        due_time: dueTime || null,
        reminder_minutes: reminderMinutes,
        assigned_member_id: assignedMemberId || null,
        priority,
        is_archived: isArchived ? 1 : 0,
        completed: isCompleted,
      };

      if (editingTask) {
        await updateTask(editingTask.id, taskData);
      } else {
        await createTask(taskData);
      }

      closeTaskModal();
    } catch (err: any) {
      setError(err.message || 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingTask) return;
    if (window.confirm('Are you sure you want to delete this task?')) {
      setIsSubmitting(true);
      try {
        await deleteTask(editingTask.id);
        closeTaskModal();
      } catch (err: any) {
        setError(err.message || 'Failed to delete task');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleToggleArchive = async () => {
    if (!editingTask) {
      setIsArchived(!isArchived);
      return;
    }
    setIsSubmitting(true);
    try {
      await archiveTask(editingTask.id);
      closeTaskModal();
    } catch (err: any) {
      setError(err.message || 'Failed to update archive status');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplete = async () => {
    if (!editingTask) {
      setIsCompleted(!isCompleted);
      return;
    }
    setIsSubmitting(true);
    try {
      await toggleTask(editingTask.id);
      closeTaskModal();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle status');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/70">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckSquare className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">
                {editingTask ? 'Edit Task' : 'New Task'}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeTaskModal}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200/60 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Task Title */}
            <div>
              <label htmlFor="task-title" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Task Title *
              </label>
              <input
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Take bins out, Pack school lunches, Pay electricity bill"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-slate-800 placeholder-gray-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                autoFocus
              />
            </div>

            {/* Description / Notes */}
            <div>
              <label htmlFor="task-desc" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Description / Notes
              </label>
              <textarea
                id="task-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add any additional details, checklists, or instructions..."
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-slate-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
              />
            </div>

            {/* Date & Time Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="task-due-date" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  Due Date
                </label>
                <input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label htmlFor="task-due-time" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  Due Time (Optional)
                </label>
                <input
                  id="task-due-time"
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Device Reminder Settings */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="task-reminder" className="block text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-emerald-600" />
                  Device Reminder
                </label>
                {permState === 'granted' && reminderMinutes !== null && (
                  <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                    <BellRing className="w-3 h-3" /> Notifications enabled
                  </span>
                )}
              </div>

              <select
                id="task-reminder"
                value={reminderMinutes === null ? '' : reminderMinutes.toString()}
                onChange={(e) => handleReminderChange(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              >
                <option value="">No reminder</option>
                <option value="0">At time of task (Due time)</option>
                <option value="5">5 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="1440">1 day before</option>
              </select>

              {reminderMinutes !== null && (
                <div className="mt-2 space-y-1.5">
                  {permState === 'default' && (
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-xs flex items-center justify-between gap-2">
                      <span>Enable device notifications to receive this reminder on your phone or PC.</span>
                      <button
                        type="button"
                        onClick={handleRequestPermissionClick}
                        className="px-2.5 py-1 bg-blue-600 text-white font-bold text-[11px] rounded-lg hover:bg-blue-700 shrink-0"
                      >
                        Allow
                      </button>
                    </div>
                  )}

                  {permState === 'denied' && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
                      <BellOff className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                      <span>
                        Notifications are blocked in your browser settings. To receive task reminders on your lock screen or notification shade, please enable notification permissions for FamilyCal in your browser / OS settings.
                      </span>
                    </div>
                  )}

                  {permState === 'granted' && (
                    <p className="text-[11px] text-gray-500">
                      A real device notification will alert your device when this task is due. Tapping it opens this task directly.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Assign Member */}
            <div>
              <label htmlFor="task-assignee" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Assign Family Member
              </label>
              <select
                id="task-assignee"
                value={assignedMemberId}
                onChange={(e) => setAssignedMemberId(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              >
                <option value="">Everyone / Unassigned</option>
                {members
                  .filter((m) => m.is_active === 1)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
              </select>
            </div>

            {/* Priority Selector */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Priority
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['low', 'medium', 'high'] as Priority[]).map((p) => {
                  const isSelected = priority === p;
                  let bgActive = 'bg-blue-600 text-white border-blue-600';
                  let bgInactive = 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200';

                  if (p === 'low') {
                    bgActive = 'bg-slate-700 text-white border-slate-700';
                  } else if (p === 'medium') {
                    bgActive = 'bg-amber-600 text-white border-amber-600';
                  } else if (p === 'high') {
                    bgActive = 'bg-rose-600 text-white border-rose-600';
                  }

                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        isSelected ? bgActive : bgInactive
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer / Actions */}
            <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {editingTask && (
                  <>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isSubmitting}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-transparent hover:border-rose-200"
                      title="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleArchive}
                      disabled={isSubmitting}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors border border-transparent hover:border-gray-200"
                      title={isArchived ? 'Restore task' : 'Archive task'}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={closeTaskModal}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] rounded-xl shadow-xs transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
