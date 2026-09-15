import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckSquare, Calendar, Clock, AlertCircle, Trash2, Archive, Check, Bell, BellOff, BellRing, Repeat, Users, Award, Sparkles, UserCheck, UserPlus } from 'lucide-react';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { Priority, Task, TaskRecurrenceRule, TaskAssignmentMode } from '../../types';
import { getNotificationPermission, requestNotificationPermission, NotificationPermissionState } from '../../utils/taskNotifications';
import { getPastelColorInfo } from '../../utils/colors';
import { getTaskAssignedMemberIds, canMemberToggleTask, isAdultOrAdminRole } from '../../utils/taskPermissions';

export const TaskModal: React.FC = () => {
  const {
    isTaskModalOpen,
    closeTaskModal,
    taskModalInitialDate,
    editingTask,
    tasks,
    createTask,
    updateTask,
    deleteTask,
    archiveTask,
    toggleTask,
  } = useCalendar();

  const { family, members } = useFamily();
  const { user, memberProfile, isViewer } = useAuth();

  const activeMembers = members.filter((m) => m.is_active === 1);
  const currentMemberId = memberProfile?.id || members.find((m) => m.user_id === user?.id || m.id === user?.id)?.id || user?.id;
  const isAdultOrAdmin = isAdultOrAdminRole(user, memberProfile);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [recurringRule, setRecurringRule] = useState<TaskRecurrenceRule>('none');
  const [recurringInterval, setRecurringInterval] = useState<number>(1);
  const [recurringUnit, setRecurringUnit] = useState<'day' | 'week' | 'month'>('day');
  const [assignedMemberIds, setAssignedMemberIds] = useState<string[]>([]);
  const [assignmentMode, setAssignmentMode] = useState<TaskAssignmentMode>('assigned');
  const [claimLimit, setClaimLimit] = useState<number>(1); // 1 = single person, 0 = multiple people
  const [points, setPoints] = useState<number>(10);
  const [pointsAwarded, setPointsAwarded] = useState<number>(0);
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
        setDueDate(editingTask.due_date ? editingTask.due_date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'));
        setDueTime(editingTask.due_time || '');
        setReminderMinutes(
          editingTask.reminder_minutes !== undefined && editingTask.reminder_minutes !== null
            ? Number(editingTask.reminder_minutes)
            : null
        );
        setRecurringRule(editingTask.recurring_rule || 'none');
        setRecurringInterval(editingTask.recurring_interval ? Number(editingTask.recurring_interval) : 1);
        setRecurringUnit(editingTask.recurring_unit || 'day');

        setAssignmentMode(editingTask.assignment_mode || 'assigned');
        setClaimLimit(editingTask.claim_limit !== undefined && editingTask.claim_limit !== null ? Number(editingTask.claim_limit) : 1);
        setPoints(editingTask.points !== undefined && editingTask.points !== null ? Number(editingTask.points) : 0);
        setPointsAwarded(editingTask.points_awarded !== undefined && editingTask.points_awarded !== null ? Number(editingTask.points_awarded) : 0);

        let existingIds: string[] = [];
        if (editingTask.task_group_id) {
          const groupTasks = tasks.filter((t) => t.task_group_id === editingTask.task_group_id);
          const ids = new Set<string>();
          groupTasks.forEach((t) => {
            getTaskAssignedMemberIds(t).forEach((id) => ids.add(id));
          });
          existingIds = Array.from(ids);
        }
        if (existingIds.length === 0) {
          existingIds = getTaskAssignedMemberIds(editingTask);
        }

        if (existingIds.length > 0) {
          setAssignedMemberIds(existingIds);
        } else if (currentMemberId) {
          setAssignedMemberIds([currentMemberId]);
        } else {
          setAssignedMemberIds(activeMembers.map((m) => m.id));
        }

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
        setRecurringRule('none');
        setRecurringInterval(1);
        setRecurringUnit('day');

        setAssignmentMode('assigned');
        setClaimLimit(1);
        setPoints(isAdultOrAdmin ? 10 : 0);
        setPointsAwarded(0);

        if (currentMemberId) {
          setAssignedMemberIds([currentMemberId]);
        } else if (activeMembers.length > 0) {
          setAssignedMemberIds([activeMembers[0].id]);
        } else {
          setAssignedMemberIds([]);
        }

        setPriority('medium');
        setIsArchived(false);
        setIsCompleted(false);
      }
      setError(null);
    }
  }, [isTaskModalOpen, editingTask, taskModalInitialDate, tasks, isAdultOrAdmin]);

  if (!isTaskModalOpen) return null;

  const handleReminderChange = async (val: string) => {
    if (val === '') {
      setReminderMinutes(null);
      return;
    }
    const num = Number(val);
    setReminderMinutes(num);

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

    if (!dueDate) {
      setError('Task due date is required');
      return;
    }

    if (assignmentMode === 'assigned' && assignedMemberIds.length === 0) {
      setError('Please assign at least one family member to this task');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const taskData: Partial<Task> = {
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate,
        due_time: dueTime || null,
        reminder_minutes: reminderMinutes,
        assigned_member_ids: assignmentMode === 'open' ? [] : (assignmentMode === 'everyone' ? activeMembers.map((m) => m.id) : assignedMemberIds),
        assigned_member_id: assignmentMode === 'open' ? null : (assignmentMode === 'everyone' ? (activeMembers[0]?.id || null) : (assignedMemberIds[0] || null)),
        priority,
        is_archived: isArchived ? 1 : 0,
        completed: isCompleted,
        recurring_rule: recurringRule,
        recurring_interval: recurringRule === 'custom' ? recurringInterval : 1,
        recurring_unit: recurringRule === 'custom' ? recurringUnit : 'day',
        assignment_mode: assignmentMode,
        claim_limit: assignmentMode === 'open' ? claimLimit : 1,
        points: isAdultOrAdmin ? Math.max(0, points || 0) : 0,
        points_awarded: isAdultOrAdmin && editingTask?.completed ? Math.max(0, pointsAwarded || 0) : undefined,
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
    const isGrouped = Boolean(editingTask.task_group_id && tasks.filter((t) => t.task_group_id === editingTask.task_group_id).length > 1);
    const confirmMsg = isGrouped
      ? 'Are you sure you want to delete this task for all assigned family members?'
      : 'Are you sure you want to delete this task?';
    if (window.confirm(confirmMsg)) {
      setIsSubmitting(true);
      try {
        await deleteTask(editingTask.id, { allInGroup: true });
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
      await archiveTask(editingTask.id, { allInGroup: true });
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

    const check = canMemberToggleTask(editingTask, currentMemberId, isViewer, isAdultOrAdmin, family?.timezone);
    if (!editingTask.completed && !check.canToggle) {
      setError(check.reason || 'You do not have permission to complete this task');
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

  if (!isTaskModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeTaskModal();
      }}
    >
      <div
        id="task-modal-dialog"
        className="relative bg-white border border-gray-200 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator Bar */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-4 h-4 rounded-full shadow-2xs border shrink-0 bg-emerald-500 border-emerald-600" />
            <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight font-serif">
              {editingTask ? 'Edit Task' : 'New Task'}
            </h3>
          </div>
          <button
            onClick={closeTaskModal}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
            aria-label="Close modal"
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
          {/* Task Title */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Task Title *
            </label>
            <input
              id="task-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Take bins out, Pack school lunches, Pay electricity bill"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-colors disabled:opacity-70 font-medium"
              autoFocus
            />
          </div>

          {/* Description / Notes */}
          <div>
            <label htmlFor="task-desc" className="block text-xs font-semibold text-gray-700 mb-1">
              Description / Notes
            </label>
            <textarea
              id="task-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any additional details, checklists, or instructions..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 resize-none disabled:opacity-70"
            />
          </div>

          {/* Date & Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-due-date" className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                Due Date *
              </label>
              <input
                id="task-due-date"
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900 transition-colors font-medium"
              />
            </div>

            <div>
              <label htmlFor="task-due-time" className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                Due Time (Optional)
              </label>
              <input
                id="task-due-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900 transition-colors font-medium"
              />
            </div>
          </div>

          {/* Repeat Option */}
          <div>
            <label htmlFor="task-repeat" className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 text-emerald-600" />
              Repeat
            </label>
            <select
              id="task-repeat"
              value={recurringRule}
              onChange={(e) => setRecurringRule(e.target.value as TaskRecurrenceRule)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900 transition-colors cursor-pointer font-medium"
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>

            {/* Custom Repeat Configuration */}
            {recurringRule === 'custom' && (
              <div className="mt-2.5 p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700 whitespace-nowrap">Repeat every</span>
                <input
                  id="task-custom-interval"
                  type="number"
                  min="1"
                  max="365"
                  value={recurringInterval}
                  onChange={(e) => setRecurringInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-slate-800 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <select
                  id="task-custom-unit"
                  value={recurringUnit}
                  onChange={(e) => setRecurringUnit(e.target.value as 'day' | 'week' | 'month')}
                  className="px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-slate-800 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
                >
                  <option value="day">{recurringInterval === 1 ? 'Day' : 'Days'}</option>
                  <option value="week">{recurringInterval === 1 ? 'Week' : 'Weeks'}</option>
                  <option value="month">{recurringInterval === 1 ? 'Month' : 'Months'}</option>
                </select>
              </div>
            )}
          </div>

          {/* Device Reminder Settings */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="task-reminder" className="block text-xs font-bold text-gray-700 flex items-center gap-1.5">
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
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900 transition-colors cursor-pointer font-medium"
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
                      className="px-2.5 py-1 bg-blue-600 text-white font-bold text-[11px] rounded-lg hover:bg-blue-700 shrink-0 cursor-pointer"
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

          {/* Assignment Mode (Admin/Adult only) */}
          {isAdultOrAdmin && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700">
                  Assignment Mode
                </label>
                <span className="text-[11px] font-semibold text-emerald-600">
                  {assignmentMode === 'assigned' ? 'Specific Members' : assignmentMode === 'open' ? 'Open to Claim' : 'All Active Members'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAssignmentMode('assigned')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    assignmentMode === 'assigned'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Assigned</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentMode('open')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    assignmentMode === 'open'
                      ? 'bg-blue-50 text-blue-800 border-blue-300 ring-2 ring-blue-500/20 shadow-xs'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <UserPlus className="w-4 h-4 text-blue-600" />
                  <span>Open Chore</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentMode('everyone')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    assignmentMode === 'everyone'
                      ? 'bg-purple-50 text-purple-800 border-purple-300 ring-2 ring-purple-500/20 shadow-xs'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <Users className="w-4 h-4 text-purple-600" />
                  <span>Everyone</span>
                </button>
              </div>
            </div>
          )}

          {/* Mode-specific detail panel */}
          {assignmentMode === 'open' ? (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                  Claim Limit Configuration
                </span>
                <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                  {claimLimit === 1 ? 'Single Claim' : 'Multiple Claims'}
                </span>
              </div>
              <p className="text-[11px] text-blue-800">
                This task is not initially assigned. Eligible family members can see it and choose <strong>Claim Task</strong>.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setClaimLimit(1)}
                  className={`p-2.5 rounded-xl text-xs border text-left transition-all cursor-pointer ${
                    claimLimit === 1
                      ? 'bg-white text-blue-900 border-blue-400 ring-2 ring-blue-500/20 shadow-xs font-bold'
                      : 'bg-blue-100/40 text-blue-700 border-transparent hover:bg-blue-100/70 font-medium'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>Single Person</span>
                    {claimLimit === 1 && <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3]" />}
                  </div>
                  <div className="text-[10px] text-blue-600 mt-0.5">First to claim owns task</div>
                </button>
                <button
                  type="button"
                  onClick={() => setClaimLimit(0)}
                  className={`p-2.5 rounded-xl text-xs border text-left transition-all cursor-pointer ${
                    claimLimit === 0
                      ? 'bg-white text-blue-900 border-blue-400 ring-2 ring-blue-500/20 shadow-xs font-bold'
                      : 'bg-blue-100/40 text-blue-700 border-transparent hover:bg-blue-100/70 font-medium'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>Multiple People</span>
                    {claimLimit === 0 && <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3]" />}
                  </div>
                  <div className="text-[10px] text-blue-600 mt-0.5">Any member claims own copy</div>
                </button>
              </div>
            </div>
          ) : assignmentMode === 'everyone' ? (
            <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                <Users className="w-4 h-4 text-purple-600" />
                <span>Individual tasks for all {activeMembers.length} family members</span>
              </div>
              <p className="text-[11px] text-purple-700">
                A completely separate task entry will automatically be created for each active family member using their own real profile and mapped colour.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {activeMembers.map((m) => {
                  const mColor = getPastelColorInfo(m.color);
                  return (
                    <span
                      key={m.id}
                      style={{
                        backgroundColor: mColor.hex,
                        borderColor: mColor.borderHex,
                        color: mColor.textHex,
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: mColor.dotHex }} />
                      {m.name}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Assign Member Chips */
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700">
                  Assign Family Members *
                </label>
                <span className="text-[11px] font-semibold text-gray-400">
                  {assignedMemberIds.length} selected
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* All Members Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    if (assignedMemberIds.length === activeMembers.length) {
                      if (activeMembers.length > 0) {
                        setAssignedMemberIds([activeMembers[0].id]);
                      }
                    } else {
                      setAssignedMemberIds(activeMembers.map((m) => m.id));
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    assignedMemberIds.length === activeMembers.length
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-gray-50 text-slate-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>All Members</span>
                  {assignedMemberIds.length === activeMembers.length && <Check className="w-3 h-3 stroke-[3]" />}
                </button>

                {/* Individual Family Members */}
                {activeMembers.map((m) => {
                  const isSelected = assignedMemberIds.includes(m.id);
                  const mColor = getPastelColorInfo(m.color);

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          if (assignedMemberIds.length > 1) {
                            setAssignedMemberIds(assignedMemberIds.filter((id) => id !== m.id));
                          }
                        } else {
                          setAssignedMemberIds([...assignedMemberIds, m.id]);
                        }
                      }}
                      style={{
                        backgroundColor: isSelected ? mColor.hex : '#F8FAFC',
                        borderColor: isSelected ? mColor.borderHex : '#E2E8F0',
                        color: isSelected ? mColor.textHex : '#64748B',
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                        isSelected ? 'ring-2 ring-emerald-500/30 font-extrabold' : 'hover:border-gray-300 font-medium'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: mColor.dotHex }}
                      />
                      <span>{m.name}</span>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Points / Rewards Setting (Admin/Adult only) */}
          {isAdultOrAdmin && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="task-points" className="block text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-600" />
                  Points / Reward
                </label>
                <span className="text-xs font-extrabold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  {points} {points === 1 ? 'point' : 'points'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="flex items-center gap-1">
                  {[0, 5, 10, 20, 50].map((ptVal) => (
                    <button
                      key={ptVal}
                      type="button"
                      onClick={() => setPoints(ptVal)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        points === ptVal
                          ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/60'
                      }`}
                    >
                      {ptVal === 0 ? '0' : `+${ptVal}`}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-amber-900 font-semibold">Custom:</span>
                  <input
                    id="task-points"
                    type="number"
                    min="0"
                    max="10000"
                    value={points}
                    onChange={(e) => setPoints(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-16 px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-slate-800 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
              </div>

              <p className="text-[11px] text-amber-700">
                Points are awarded to the family member upon task completion and deducted if reopened.
              </p>

              {/* If task is already completed and editing as Admin/Adult: allow manual points awarded adjustment */}
              {editingTask && Boolean(editingTask.completed) && (
                <div className="pt-2 border-t border-amber-200/70 flex items-center justify-between text-xs">
                  <span className="text-amber-900 font-bold">Manual points adjustment:</span>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={pointsAwarded}
                    onChange={(e) => setPointsAwarded(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-16 px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-slate-800 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
              )}
            </div>
          )}

          {/* Priority Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Priority
            </label>
            <div className="grid grid-cols-3 gap-2">
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
                    className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
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

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            {editingTask ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="task-delete-btn"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleArchive}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  title={isArchived ? 'Restore task' : 'Archive task'}
                >
                  <Archive className="w-4 h-4" />
                  <span>{isArchived ? 'Restore' : 'Archive'}</span>
                </button>
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeTaskModal}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="task-save-btn"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
