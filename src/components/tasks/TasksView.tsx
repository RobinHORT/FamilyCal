import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckSquare,
  Square,
  Circle,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Clock,
  User,
  Search,
  CheckCircle2,
  Archive,
  Bell,
  Repeat,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Users,
  Award,
  Sparkles,
  UserPlus,
  Hand,
  AlertCircle,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  subMonths,
  addMonths,
  subWeeks,
  addWeeks,
  subDays,
  isSameMonth,
  isSameDay,
  isToday,
  isTomorrow,
  parseISO,
  differenceInCalendarDays,
} from 'date-fns';
import { useCalendar } from '../../context/CalendarContext';
import { useCalendarSwipe } from '../../hooks/useCalendarSwipe';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import { Priority, Task } from '../../types';
import { getEventAssignmentInfo, getPastelColorInfo } from '../../utils/colors';
import { formatReminderLabel } from '../../utils/taskNotifications';
import { getTaskAssignedMemberIds, canMemberToggleTask, canMemberClaimTask, isAdultOrAdminRole, isTaskDateActionable, getHouseholdTodayDateString, isTaskOccurrenceCompleted } from '../../utils/taskPermissions';
import { MonthGrid } from '../calendar/MonthGrid';
import { RewardsView } from './RewardsView';

function formatTaskRepeatLabel(rule?: string | null, interval?: number | null, unit?: string | null): string | null {
  if (!rule || rule === 'none') return null;
  if (rule === 'daily') return 'Daily';
  if (rule === 'weekly') return 'Weekly';
  if (rule === 'fortnightly') return 'Fortnightly';
  if (rule === 'monthly') return 'Monthly';
  if (rule === 'custom') {
    const num = interval && interval > 1 ? interval : 1;
    const u = unit || 'day';
    if (num === 1) {
      if (u === 'week') return 'Weekly';
      if (u === 'month') return 'Monthly';
      return 'Daily';
    }
    return `Every ${num} ${u}s`;
  }
  return null;
}

type TaskViewMode = 'month' | 'week' | 'day' | 'agenda' | 'rewards';
type TaskStatusFilter = 'all' | 'open' | 'completed';

export const TasksView: React.FC = () => {
  const {
    tasks,
    currentDate,
    setCurrentDate,
    selectedCalendarDate,
    setSelectedCalendarDate,
    viewMode,
    setViewMode,
    selectedMemberIds,
    toggleMemberFilter,
    goToPreviousPeriod,
    goToNextPeriod,
    goToToday,
    toggleTask,
    claimTask,
    unclaimTask,
    deleteTask,
    archiveTask,
    openCreateTaskModal,
    openEditTaskModal,
    openAddChoiceModal,
  } = useCalendar();

  const { family, members } = useFamily();
  const { user, memberProfile, isAdmin, hasPermission } = useAuth();
  const isAdultOrAdmin = isAdultOrAdminRole(user, memberProfile);

  const isViewer =
    user?.role === 'viewer' ||
    (typeof window !== 'undefined' && localStorage.getItem('familycal_viewer_mode') === 'true');

  const canCreateTask = !isViewer && (isAdmin || hasPermission('task_create'));
  const canAddItem = !isViewer && (isAdmin || hasPermission('task_create') || hasPermission('event_create'));

  // Mobile horizontal swipe navigation handlers
  const swipeHandlers = useCalendarSwipe({
    onSwipeLeft: goToNextPeriod, // Swipe LEFT -> next month/week/day
    onSwipeRight: goToPreviousPeriod, // Swipe RIGHT -> previous month/week/day
    minDistance: 45,
    maxTime: 700,
    preventScrollToleranceRatio: 1.3,
  });

  const currentMemberId = memberProfile?.id || members.find((m) => m.user_id === user?.id || m.id === user?.id)?.id || user?.id;

  // Selected Date alias pointing to CalendarContext state
  const selectedDate = selectedCalendarDate || currentDate;
  const setSelectedDate = (d: Date) => setSelectedCalendarDate(d);

  // Status filter & search
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [claimingTaskIds, setClaimingTaskIds] = useState<Record<string, boolean>>({});

  // Task deletion state
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Active family members list
  const activeMembers = useMemo(() => {
    return members.filter(
      (m) => m.is_active === undefined || m.is_active === 1 || (m.is_active as any) === true || (m.is_active as any) === '1'
    );
  }, [members]);

  // Handle deep-linking from device notifications (e.g. ?tab=tasks&taskId=tsk_123)
  useEffect(() => {
    if (typeof window === 'undefined' || tasks.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const targetTaskId = params.get('taskId');
    if (targetTaskId) {
      const match = tasks.find((t) => t.id === targetTaskId);
      if (match) {
        openEditTaskModal(match);
        const url = new URL(window.location.href);
        url.searchParams.delete('taskId');
        window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''));
      }
    }
  }, [tasks, openEditTaskModal]);

  // Filter tasks based on assigned member filter toggles, status filter, and search query
  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Ignore archived tasks in calendar view
      if (t.is_archived) return false;

      // Status filter
      if (statusFilter === 'open' && t.completed) return false;
      if (statusFilter === 'completed' && !t.completed) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description ? t.description.toLowerCase().includes(q) : false;
        const matchesMember = t.member_name ? t.member_name.toLowerCase().includes(q) : false;
        if (!matchesTitle && !matchesDesc && !matchesMember) return false;
      }

      // Member Filter based on real assigned_member_ids
      const assignedIds = getTaskAssignedMemberIds(t);
      if (assignedIds.length > 0 && selectedMemberIds.length > 0) {
        const isMemberActiveInFilter = assignedIds.some((id) => selectedMemberIds.includes(id));
        if (!isMemberActiveInFilter) {
          return false;
        }
      }

      return true;
    });
  }, [tasks, selectedMemberIds, statusFilter, searchQuery]);

  // Helper to get tasks due on a specific day
  const getTasksForDay = (day: Date): Task[] => {
    const dayStr = format(day, 'yyyy-MM-dd');

    return visibleTasks
      .filter((task) => {
        if (!task.due_date) return false;
        const taskDueStr = task.due_date.slice(0, 10);
        if (taskDueStr === dayStr) return true;

        // Check recurring rule
        try {
          if (task.parent_task_id) return false;

          const dueDate = parseISO(taskDueStr);
          if (isNaN(dueDate.getTime()) || day < dueDate) return false;

          const rule = task.recurring_rule;
          if (!rule || rule === 'none') return false;

          if (rule === 'daily') return true;
          if (rule === 'weekly') {
            return day.getDay() === dueDate.getDay();
          }
          if (rule === 'fortnightly') {
            const diffDays = differenceInCalendarDays(day, dueDate);
            return diffDays >= 0 && diffDays % 14 === 0;
          }
          if (rule === 'monthly') {
            return day.getDate() === dueDate.getDate();
          }
          if (rule === 'custom') {
            const interval = task.recurring_interval && task.recurring_interval > 0 ? task.recurring_interval : 1;
            const unit = task.recurring_unit || 'day';
            if (unit === 'day') {
              const diff = differenceInCalendarDays(day, dueDate);
              return diff >= 0 && diff % interval === 0;
            }
            if (unit === 'week') {
              const diffWeeks = Math.floor(differenceInCalendarDays(day, dueDate) / 7);
              return day.getDay() === dueDate.getDay() && diffWeeks >= 0 && diffWeeks % interval === 0;
            }
            if (unit === 'month') {
              return day.getDate() === dueDate.getDate();
            }
          }
        } catch {
          return false;
        }

        return false;
      })
      .map((task) => {
        const isCompleted = isTaskOccurrenceCompleted(task, dayStr, currentMemberId);
        // For recurring tasks, each occurrence has its own occurrence due date
        if (task.recurring_rule && task.recurring_rule !== 'none' && task.due_date && task.due_date.slice(0, 10) !== dayStr) {
          return {
            ...task,
            due_date: dayStr,
            completed: isCompleted,
          };
        }
        return {
          ...task,
          completed: isCompleted,
        };
      });
  };

  // Navigation handlers using CalendarContext methods
  const handlePrev = () => goToPreviousPeriod();
  const handleNext = () => goToNextPeriod();
  const handleToday = () => goToToday();

  // Header title formatter matching CalendarHeader exactly
  const formattedHeaderTitle = () => {
    if (viewMode === 'rewards') return 'Rewards';
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
    return `${format(currentDate, 'MMMM yyyy')} Tasks`;
  };

  // Action handlers
  const handleToggle = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const check = canMemberToggleTask(task, currentMemberId, isViewer, isAdultOrAdmin);
    if (!task.completed && !check.canToggle) {
      alert(check.reason || 'You do not have permission to complete this task.');
      return;
    }

    try {
      const occurrenceDueDate = task.due_date ? task.due_date.trim().slice(0, 10) : undefined;
      const todayDateStr = getHouseholdTodayDateString();
      await toggleTask(task.id, occurrenceDueDate, todayDateStr);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to toggle task');
    }
  };

  const handleClaim = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (claimingTaskIds[task.id]) return;
    const check = canMemberClaimTask(task, currentMemberId, isViewer, tasks);
    if (!check.canClaim) {
      alert(check.reason || 'You cannot claim this task.');
      return;
    }

    try {
      setClaimingTaskIds(prev => ({ ...prev, [task.id]: true }));
      const occurrenceDueDate = task.due_date ? task.due_date.trim().slice(0, 10) : undefined;
      const todayDateStr = getHouseholdTodayDateString();
      await claimTask(task.id, occurrenceDueDate, todayDateStr);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to claim task');
    } finally {
      setClaimingTaskIds(prev => ({ ...prev, [task.id]: false }));
    }
  };

  const handleUnclaim = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    try {
      await unclaimTask(task.id);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to release task');
    }
  };

  const handleDelete = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setTaskToDelete(task);
    setDeleteError(null);
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeletingTask(true);
    setDeleteError(null);
    try {
      await deleteTask(taskToDelete.id, { allInGroup: true });
      setTaskToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete task:', err);
      setDeleteError(err?.message || 'Failed to delete task');
    } finally {
      setIsDeletingTask(false);
    }
  };

  const handleArchive = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await archiveTask(id, { allInGroup: true });
    } catch (err) {
      console.error(err);
    }
  };

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'high': {
        const c = getPastelColorInfo('#EF4444');
        return (
          <span
            style={{ backgroundColor: c.hex, color: c.textHex, borderColor: c.borderHex }}
            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0"
          >
            High
          </span>
        );
      }
      case 'medium': {
        const c = getPastelColorInfo('#F59E0B');
        return (
          <span
            style={{ backgroundColor: c.hex, color: c.textHex, borderColor: c.borderHex }}
            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0"
          >
            Medium
          </span>
        );
      }
      case 'low': {
        const c = getPastelColorInfo('#64748B');
        return (
          <span
            style={{ backgroundColor: c.hex, color: c.textHex, borderColor: c.borderHex }}
            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0"
          >
            Low
          </span>
        );
      }
      default:
        return null;
    }
  };

  // Render Task Card Component (EXACT MATCH to EventCard visual system)
  const renderTaskCard = (task: Task, compact: boolean = false) => {
    const isCompleted = task.completed;
    const toggleCheck = canMemberToggleTask(task, currentMemberId, isViewer, isAdultOrAdmin);
    const isActionable = isCompleted || toggleCheck.canToggle;

    const isOpenTask = task.assignment_mode === 'open';

    const assignmentInfo = getEventAssignmentInfo(task as any, members);

    return (
      <div
        key={task.id}
        onClick={() => openEditTaskModal(task)}
        style={{
          background: (isOpenTask && !isCompleted)
            ? getPastelColorInfo('#FEF3C7').hex // Golden color for open chores with Global Softness!
            : (assignmentInfo.isFamilyEvent
                ? assignmentInfo.segmentedGradient
                : assignmentInfo.primaryColorInfo.hex),
          borderColor: (isOpenTask && !isCompleted)
            ? getPastelColorInfo('#FEF3C7').borderHex // Golden border with Global Softness!
            : assignmentInfo.borderHex,
        }}
        className={`relative p-3.5 sm:p-4 rounded-2xl border shadow-2xs hover:shadow-md active:scale-99 transition-all cursor-pointer flex flex-col justify-between gap-2.5 group overflow-hidden w-full max-w-full min-w-0 box-border ${
          isCompleted ? 'opacity-75' : ''
        }`}
      >
        {/* Visible boundary dividers for multi-colour Family task card */}
        {assignmentInfo.isFamilyEvent && !isOpenTask && (
          <div className="absolute inset-0 flex pointer-events-none rounded-[inherit] overflow-hidden -z-0">
            {assignmentInfo.participatingMembers.map((m, idx) => (
              <div
                key={m.id || idx}
                className="flex-1 h-full border-r border-black/8 last:border-r-0"
              />
            ))}
          </div>
        )}

        {/* Card Header: Member / Family Label + Checkbox + Priority/Actions */}
        <div className="relative z-10 flex items-center justify-between gap-2 w-full max-w-full min-w-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2 min-w-0 flex-1 max-w-full">
            {/* Tickable Checkbox */}
            <button
              type="button"
              disabled={!isActionable}
              onClick={(e) => handleToggle(e, task)}
              className={`shrink-0 rounded-lg transition-transform p-0.5 -m-0.5 ${
                !isActionable
                  ? 'opacity-35 cursor-not-allowed text-slate-400'
                  : isCompleted
                  ? 'text-blue-700 hover:scale-110 cursor-pointer'
                  : 'text-slate-700 hover:text-blue-700 hover:scale-110 cursor-pointer'
              }`}
              title={!isActionable ? toggleCheck.reason : isCompleted ? 'Mark incomplete' : 'Mark complete'}
              aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5 fill-blue-600 text-white shadow-2xs" />
              ) : (
                <Circle className="w-5 h-5 stroke-[2.2] text-slate-800" />
              )}
            </button>

            {isOpenTask ? (
              <>
                <div
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-2xs shrink-0 bg-amber-500"
                  title="Open Chore - Shared chore available for anyone to complete"
                >
                  <Hand className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-extrabold text-amber-950 tracking-tight shrink-0">
                  Open Chore
                </span>
              </>
            ) : assignmentInfo.isFamilyEvent ? (
              <>
                <div
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-2xs shrink-0"
                  style={{ backgroundColor: assignmentInfo.adminColorInfo.dotHex }}
                  title="Whole Family Task"
                >
                  <Users className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span className="text-xs font-extrabold text-slate-900 tracking-tight shrink-0">
                  Family
                </span>
                <div className="flex -space-x-1 items-center ml-0.5 shrink-0">
                  {assignmentInfo.participatingMembers.map((m) => {
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
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-2xs shrink-0"
                  style={{ backgroundColor: assignmentInfo.primaryColorInfo.dotHex }}
                >
                  {assignmentInfo.singleMember
                    ? assignmentInfo.singleMember.name.slice(0, 1).toUpperCase()
                    : assignmentInfo.label.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-xs font-bold text-slate-800 tracking-tight truncate min-w-0 flex-1">
                  {assignmentInfo.label}
                </span>
              </>
            )}
          </div>

          {/* Badges & Actions */}
          <div className="flex items-center gap-1.5 shrink-0 max-w-full">
            {/* Points Badge */}
            {task.points !== undefined && task.points !== null && task.points > 0 && (
              <span
                className="flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shrink-0 shadow-2xs"
                title={task.completed && task.points_awarded !== undefined ? `Earned: ${task.points_awarded} pts` : `Reward: ${task.points} pts`}
              >
                <Sparkles className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                <span>{task.completed && task.points_awarded !== undefined ? `+${task.points_awarded}` : `${task.points}`} pts</span>
              </span>
            )}

            {getPriorityBadge(task.priority)}
            {task.recurring_rule && task.recurring_rule !== 'none' && (
              <span
                className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/10 text-slate-800 shrink-0"
                title={`Repeats: ${formatTaskRepeatLabel(task.recurring_rule, task.recurring_interval, task.recurring_unit)}`}
              >
                <Repeat className="w-2.5 h-2.5" />
              </span>
            )}
            {task.reminder_minutes !== null && task.reminder_minutes !== undefined && (
              <span
                className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/10 text-slate-800 shrink-0"
                title={`Reminder: ${formatReminderLabel(task.reminder_minutes)}`}
              >
                <Bell className="w-2.5 h-2.5" />
              </span>
            )}

            {!isViewer && (
              <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity ml-1">
                <button
                  type="button"
                  onClick={(e) => handleArchive(e, task.id)}
                  className="p-1 text-slate-700 hover:text-slate-950 hover:bg-black/10 rounded-lg transition-colors cursor-pointer"
                  title="Archive task"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
                {(!isViewer && (isAdultOrAdmin || (currentMemberId && getTaskAssignedMemberIds(task).includes(currentMemberId)))) && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, task)}
                    className="p-1 text-slate-700 hover:text-rose-700 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
                    title="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Card Body: Title & Details */}
        <div className="relative z-10 flex flex-col min-w-0 w-full max-w-full">
          <h4
            className={`text-sm font-bold leading-snug group-hover:text-blue-900 transition-colors w-full min-w-0 max-w-full break-words [overflow-wrap:anywhere] ${
              isCompleted ? 'line-through text-slate-600' : 'text-slate-900'
            }`}
          >
            {task.title}
          </h4>

          {!compact && task.description && (
            <p
              className={`text-xs line-clamp-2 leading-relaxed mt-1 w-full min-w-0 max-w-full break-words [overflow-wrap:anywhere] ${
                isCompleted ? 'text-slate-500 line-through' : 'text-slate-700 opacity-90'
              }`}
            >
              {task.description}
            </p>
          )}

          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs font-semibold text-slate-700 opacity-90 mt-1 w-full min-w-0 max-w-full">
            {task.due_date && (
              <span className="flex items-center gap-1 shrink-0">
                <CalendarIcon className="w-3 h-3 opacity-70 shrink-0" />
                <span className="whitespace-nowrap">
                  {format(new Date(task.due_date.slice(0, 10) + 'T00:00:00'), 'MMM d, yyyy')}
                </span>
              </span>
            )}
            {task.due_time && (
              <span className="flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3 opacity-70 shrink-0" />
                <span className="whitespace-nowrap">{task.due_time}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Month Grid Calculation
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const monthDays: Date[] = [];
  let d = startDate;
  while (d <= endDate) {
    monthDays.push(d);
    d = addDays(d, 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < monthDays.length; i += 7) {
    weeks.push(monthDays.slice(i, i + 7));
  }

  const selectedDayTasks = getTasksForDay(selectedDate);

  // Week View Calculation
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Day View Tasks Calculation
  const currentDayTasks = getTasksForDay(currentDate);

  // Agenda View Tasks Grouping
  const searchedAgendaTasks = visibleTasks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.member_name && t.member_name.toLowerCase().includes(q))
    );
  });
  searchedAgendaTasks.sort((a, b) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : 0;
    const db = b.due_date ? new Date(b.due_date).getTime() : 0;
    return da - db;
  });

  const groupedAgendaTasks: Record<string, Task[]> = {};
  for (const t of searchedAgendaTasks) {
    const key = t.due_date ? t.due_date : 'No Due Date';
    if (!groupedAgendaTasks[key]) {
      groupedAgendaTasks[key] = [];
    }
    groupedAgendaTasks[key].push(t);
  }
  const agendaDateKeys = Object.keys(groupedAgendaTasks);

  return (
    <div id="tasks-container" className="flex flex-col flex-1 min-h-0 h-full gap-3 sm:gap-4 max-w-7xl mx-auto w-full max-w-full min-w-0 relative">
      {/* 1. Header & Navigation Controls Section (EXACT MATCH to CalendarHeader) */}
      <div id="calendar-header-section" className="flex flex-col gap-3 pb-3 border-b border-gray-200 shrink-0">
        {/* Top Bar: Navigation, Title, View Mode & Action (Desktop) */}
        <div className="hidden md:flex items-center justify-between gap-3">
          {/* Left: Date controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <button
              id="task-prev-btn"
              onClick={handlePrev}
              className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
              aria-label="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              id="task-today-btn"
              onClick={handleToday}
              className="px-3 py-1.5 min-h-[38px] text-xs font-bold rounded-xl bg-white border border-gray-200 shadow-2xs hover:bg-gray-50 text-slate-800 transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              id="task-next-btn"
              onClick={handleNext}
              className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
              aria-label="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <h2 id="tasks-current-title" className="text-sm sm:text-base md:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5 cursor-pointer hover:opacity-80 min-w-0 truncate">
              <span className="truncate">{formattedHeaderTitle()}</span>
              <ChevronDown className="w-4 h-4 text-slate-400 stroke-[2.5] shrink-0" />
            </h2>
          </div>

          {/* Right: Search, Status, View Mode Switcher, and Add Button */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Search & Status Pill */}
            <div className="flex items-center gap-2">
              <div className="relative w-36 sm:w-44">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="w-full pl-8 pr-2.5 py-1.5 min-h-[36px] bg-white border border-gray-200 rounded-xl text-xs text-slate-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 shadow-2xs"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TaskStatusFilter)}
                aria-label="Filter task status"
                className="px-2.5 py-1.5 min-h-[36px] bg-white border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {/* View Mode Switcher */}
            <div id="tasks-view-mode-tabs" className="flex items-center bg-blue-50/80 p-1 rounded-xl border border-blue-200/60 shadow-2xs">
              {(['month', 'week', 'day', 'agenda', 'rewards'] as TaskViewMode[]).map((mode) => (
                <button
                  key={mode}
                  id={`task-mode-${mode}`}
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

            {/* Add Button */}
            {canCreateTask && (
              <button
                id="task-add-btn"
                onClick={() => openCreateTaskModal(selectedDate || currentDate)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Controls */}
        <div className="flex md:hidden flex-col gap-2.5 pt-1">
          <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-gray-200 shadow-2xs">
            <div className="flex items-center gap-1.5">
              <button onClick={handlePrev} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={handleToday} className="px-2.5 py-1 text-xs font-bold rounded-lg bg-gray-100 text-slate-800 cursor-pointer">
                Today
              </button>
              <button onClick={handleNext} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer">
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
            {(['month', 'week', 'day', 'agenda', 'rewards'] as TaskViewMode[]).map((mode) => (
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

        {/* Horizontal Multi-Layer Filter Bar (Members) */}
        <div id="tasks-layer-filter-bar" className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
          <span className="text-gray-400 font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap flex items-center gap-1 shrink-0 mr-0.5">
            <Users className="w-3.5 h-3.5 text-blue-500" /> Members:
          </span>

          {activeMembers.map((member) => {
            const isSelected = selectedMemberIds.length === 0 || selectedMemberIds.includes(member.id);
            const colorInfo = getPastelColorInfo(member.color);

            return (
              <button
                key={member.id}
                id={`filter-task-member-${member.id}`}
                onClick={() => toggleMemberFilter(member.id)}
                style={{
                  backgroundColor: isSelected ? colorInfo.hex : '#F8FAFC',
                  borderColor: isSelected ? colorInfo.borderHex : '#E2E8F0',
                  color: isSelected ? colorInfo.textHex : '#94A3B8',
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold transition-all whitespace-nowrap cursor-pointer border shadow-2xs ${
                  isSelected ? 'ring-1 ring-black/5 opacity-100' : 'opacity-65 hover:opacity-90 hover:border-gray-300'
                }`}
                title={`Toggle ${member.name}'s Tasks`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border shrink-0"
                  style={{
                    backgroundColor: isSelected ? colorInfo.dotHex : '#CBD5E1',
                    borderColor: isSelected ? colorInfo.borderHex : '#94A3B8',
                  }}
                />
                <span>{member.name}</span>
                {member.points !== undefined && member.points > 0 && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-200/60 text-amber-900 ml-0.5">
                    ★ {member.points}
                  </span>
                )}
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. MAIN TASKS CALENDAR CONTENT CONTAINER (EXACT MATCH to CalendarContainer body) */}
      <div className="flex-1 flex flex-col min-h-0 w-full max-w-full min-w-0">
        {/* --- MONTH VIEW (SPLIT LAYOUT: Month Grid Left, Day Tasks Right) --- */}
        {viewMode === 'month' && (
          <div id="tasks-month-view" className="flex flex-col flex-1 min-h-0 md:h-full gap-2.5 sm:gap-3 overflow-y-auto md:overflow-hidden">
            {/* Desktop / Tablet Split Layout */}
            <div id="desktop-month-split" className="hidden md:grid md:grid-cols-12 gap-3.5 lg:gap-4 flex-1 items-stretch min-h-0 h-full touch-pan-y overflow-hidden">
              {/* Left: MONTH CALENDAR (Locked, fully visible, non-scrollable) */}
              <div className="md:col-span-7 lg:col-span-7 xl:col-span-8 flex flex-col min-w-0 h-full min-h-0 overflow-hidden">
                <MonthGrid
                  currentDate={currentDate}
                  selectedDay={selectedDate}
                  onSelectDay={setSelectedDate}
                  filteredEvents={[]}
                  tasks={visibleTasks}
                  members={members}
                  eventTypes={[]}
                  onEditTask={openEditTaskModal}
                  maxVisibleSlots={2}
                  className="h-full flex-1 min-h-0 overflow-hidden"
                />
              </div>

              {/* Right: SELECTED DAY DAY VIEW */}
              <div className="md:col-span-5 lg:col-span-5 xl:col-span-4 flex flex-col min-w-0 h-full min-h-0 overflow-hidden">
                <div id="embedded-tasks-day-view" className="flex flex-col flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs h-full min-h-0">
                  {/* Day Title Bar */}
                  <div className="py-2.5 sm:py-3.5 px-3.5 sm:px-5 border-b border-gray-200 bg-gray-50/75 flex items-center justify-between shrink-0">
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 tracking-tight font-serif truncate">
                        {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {selectedDayTasks.length} {selectedDayTasks.length === 1 ? 'task' : 'tasks'} scheduled for this day
                      </p>
                    </div>

                    {canCreateTask && (
                      <button
                        onClick={() => openCreateTaskModal(selectedDate)}
                        className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 ml-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Task</span>
                      </button>
                    )}
                  </div>

                  {/* Selected Date Tasks Stream */}
                  <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-white scrollbar-thin min-h-0 w-full max-w-full min-w-0 pb-calendar-mobile md:pb-4">
                    {selectedDayTasks.length === 0 ? (
                      <div className="py-12 sm:py-16 text-center text-gray-400">
                        <p className="text-sm font-semibold text-gray-600">No scheduled tasks for this day.</p>
                        {!isViewer && (
                          <p className="text-xs text-gray-400 mt-1">Tap the button above to schedule household tasks.</p>
                        )}
                      </div>
                    ) : (
                      selectedDayTasks.map((t) => renderTaskCard(t))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Month View */}
            <div
              id="mobile-month-container"
              {...swipeHandlers}
              className="flex md:hidden flex-col gap-4 pb-calendar-mobile touch-pan-y w-full max-w-full min-w-0"
              style={{
                paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 64px)',
              }}
            >
              {/* Month Grid Card */}
              <MonthGrid
                currentDate={currentDate}
                selectedDay={selectedDate}
                onSelectDay={setSelectedDate}
                filteredEvents={[]}
                tasks={visibleTasks}
                members={members}
                eventTypes={[]}
                onEditTask={openEditTaskModal}
                maxVisibleSlots={3}
              />

              {/* Selected Day Agenda Section Below */}
              <div className="flex flex-col gap-3 pt-1 w-full max-w-full min-w-0">
                <h3 className="text-base font-bold text-slate-900 px-1 font-serif tracking-tight truncate">
                  {format(selectedDate, 'EEEE, d MMMM')}
                </h3>

                <div className="flex flex-col gap-2.5 w-full max-w-full min-w-0">
                  {selectedDayTasks.length === 0 ? (
                    <div className="py-6 px-4 rounded-2xl bg-white border border-dashed border-gray-200 text-gray-400 text-xs font-medium text-center shadow-2xs w-full">
                      No tasks scheduled for this date
                    </div>
                  ) : (
                    selectedDayTasks.map((t) => renderTaskCard(t))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- WEEK VIEW --- */}
        {viewMode === 'week' && (
          <div id="tasks-week-view" className="flex flex-col flex-1 gap-4">
            {/* Desktop Week View */}
            <div className="hidden md:flex flex-col gap-3.5">
              {weekDays.map((day) => {
                const dayTasks = getTasksForDay(day);
                const isDayToday = isToday(day);

                return (
                  <div
                    key={day.toISOString()}
                    className="flex items-start gap-4 p-2 rounded-2xl transition-colors hover:bg-gray-100/50"
                  >
                    {/* Left Day/Date Column */}
                    <div className="w-16 shrink-0 pt-1 flex flex-col items-start select-none">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {format(day, 'EEE')}
                      </span>
                      <span
                        className={`text-2xl font-extrabold leading-none mt-0.5 ${
                          isDayToday ? 'text-blue-600' : 'text-slate-800'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>

                    {/* Right Tasks Grid */}
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3.5 min-h-[72px]">
                      {dayTasks.length === 0 ? (
                        canCreateTask ? (
                          <button
                            onClick={() => openCreateTaskModal(day)}
                            className="h-full min-h-[64px] rounded-2xl border border-dashed border-gray-200/80 bg-white/40 hover:bg-white text-gray-400 hover:text-gray-600 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer group"
                          >
                            <Plus className="w-4 h-4 group-hover:scale-110 transition-transform text-blue-500" />
                            <span>Add task for {format(day, 'EEEE')}</span>
                          </button>
                        ) : (
                          <div className="h-full min-h-[64px] rounded-2xl border border-dashed border-gray-200/60 bg-white/20 text-gray-400 text-xs font-medium flex items-center justify-center">
                            No tasks
                          </div>
                        )
                      ) : (
                        dayTasks.map((t) => renderTaskCard(t, true))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile Week View */}
            <div
              id="mobile-week-tasks-container"
              {...swipeHandlers}
              className="flex md:hidden flex-col gap-4 pb-calendar-mobile touch-pan-y w-full max-w-full min-w-0"
              style={{
                paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 64px)',
              }}
            >
              {weekDays.map((day) => {
                const dayTasks = getTasksForDay(day);
                const isDayToday = isToday(day);

                return (
                  <div key={day.toISOString()} className="flex items-start gap-3 w-full max-w-full min-w-0">
                    <div className="w-12 shrink-0 pt-0.5 flex flex-col items-start select-none">
                      <span className="text-[11px] font-bold text-gray-400 uppercase">
                        {format(day, 'EEE')}
                      </span>
                      <span
                        className={`text-xl font-black leading-none mt-0.5 ${
                          isDayToday ? 'text-blue-600' : 'text-slate-800'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 max-w-full flex flex-col gap-2.5">
                      {dayTasks.length === 0 ? (
                        <div className="py-2.5 px-3 rounded-2xl bg-white border border-dashed border-gray-200 text-gray-400 text-xs font-medium w-full">
                          No tasks
                        </div>
                      ) : (
                        dayTasks.map((t) => renderTaskCard(t, true))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --- DAY VIEW --- */}
        {viewMode === 'day' && (
          <div
            id="tasks-day-view"
            {...swipeHandlers}
            className="flex flex-col flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs touch-pan-y"
          >
            {/* Day Title Bar */}
            <div className="py-2.5 sm:py-3.5 px-3.5 sm:px-5 border-b border-gray-200 bg-gray-50/75 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 tracking-tight font-serif truncate">
                  {format(currentDate, 'EEEE, MMMM d, yyyy')}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {currentDayTasks.length} {currentDayTasks.length === 1 ? 'task' : 'tasks'} planned for this day
                </p>
              </div>

              {canCreateTask && (
                <button
                  onClick={() => openCreateTaskModal(currentDate)}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 ml-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>
              )}
            </div>

            {/* Tasks Stream */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-white scrollbar-thin min-h-0 w-full max-w-full min-w-0 pb-calendar-mobile md:pb-4">
              {currentDayTasks.length === 0 ? (
                <div className="py-12 sm:py-16 text-center text-gray-400">
                  <p className="text-sm font-semibold text-gray-600">No scheduled tasks for this day.</p>
                  {!isViewer && (
                    <p className="text-xs text-gray-400 mt-1">Tap the button above to schedule household tasks.</p>
                  )}
                </div>
              ) : (
                currentDayTasks.map((t) => renderTaskCard(t))
              )}
            </div>
          </div>
        )}

        {/* --- AGENDA VIEW --- */}
        {viewMode === 'agenda' && (
          <div
            id="tasks-agenda-view"
            {...swipeHandlers}
            className="flex flex-col flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs touch-pan-y"
          >
            {/* Search Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50/75 flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="tasks-agenda-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search family tasks..."
                  className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-colors font-medium"
                />
              </div>

              {canCreateTask && (
                <button
                  onClick={() => openCreateTaskModal()}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>
              )}
            </div>

            {/* Tasks Agenda Stream */}
            <div className="flex-1 overflow-y-auto md:max-h-[640px] p-4 pb-calendar-mobile md:pb-4 space-y-6 bg-white scrollbar-thin w-full max-w-full min-w-0">
              {agendaDateKeys.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm font-semibold text-gray-600">No tasks found matching criteria.</p>
                </div>
              ) : (
                agendaDateKeys.map((dateKey) => {
                  const dayTasks = groupedAgendaTasks[dateKey];
                  const isNoDate = dateKey === 'No Due Date';
                  const dateObj = isNoDate ? null : new Date(dateKey + 'T00:00:00');
                  const isDayToday = dateObj ? isToday(dateObj) : false;

                  return (
                    <div key={dateKey} className="space-y-2 w-full max-w-full min-w-0">
                      {/* Date Group Heading */}
                      <div className="flex items-center gap-2 sticky top-0 bg-white/95 backdrop-blur-xs py-1.5 z-10 w-full max-w-full min-w-0">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-xl ${
                            isDayToday ? 'bg-gray-900 text-white shadow-xs' : 'bg-gray-100 text-gray-800 border border-gray-200'
                          }`}
                        >
                          {isNoDate ? 'No Due Date' : format(dateObj!, 'EEEE, MMMM d, yyyy')}
                        </span>
                        {!isNoDate && dateObj && (
                          <span className="text-xs text-gray-500 font-mono">
                            {format(dateObj, 'MMM d, yyyy')}
                          </span>
                        )}
                        <div className="flex-1 h-[1px] bg-gray-100" />
                      </div>

                      {/* Task Cards */}
                      <div className="space-y-2.5 pl-1 w-full max-w-full min-w-0">
                        {dayTasks.map((t) => renderTaskCard(t))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* --- REWARDS VIEW --- */}
        {viewMode === 'rewards' && <RewardsView />}
      </div>

      {/* Floating Action Add Button on Mobile (Hidden in Viewer mode) */}
      {canAddItem && (
        <button
          id="mobile-create-task-fab"
          onClick={() => openAddChoiceModal(selectedDate || currentDate)}
          className="md:hidden fixed right-5 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all z-40 cursor-pointer border border-blue-500/20 bottom-fab-mobile"
          style={{
            bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 16px)',
          }}
          title="Add"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      )}

      {/* Task Delete Confirmation Modal */}
      {taskToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={() => {
            if (!isDeletingTask) {
              setTaskToDelete(null);
              setDeleteError(null);
            }
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-gray-100 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Delete Task</h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-gray-900">"{taskToDelete.title}"</span>?
              {taskToDelete.task_group_id && tasks.filter((t) => t.task_group_id === taskToDelete.task_group_id).length > 1
                ? ' This will delete the task for all assigned family members.'
                : ''}
            </p>

            {deleteError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-start gap-2 border border-red-100">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingTask}
                onClick={() => {
                  setTaskToDelete(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-delete-task-btn"
                disabled={isDeletingTask}
                onClick={confirmDeleteTask}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingTask ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Task</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
