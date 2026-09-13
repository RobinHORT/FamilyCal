import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Calendar,
  Clock,
  User,
  Search,
  CheckCircle2,
  Archive,
  ArrowUpDown,
  Edit2,
  AlertTriangle,
  Bell,
  Repeat,
} from 'lucide-react';
import { format, isPast, isToday, isTomorrow, parseISO } from 'date-fns';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { Priority, Task } from '../../types';
import { formatReminderLabel } from '../../utils/taskNotifications';

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

type TaskStatusFilter = 'all' | 'open' | 'completed' | 'archived';
type TaskSortOption = 'due_date' | 'priority' | 'title' | 'created_at';

export const TasksView: React.FC = () => {
  const {
    tasks,
    fetchTasks,
    toggleTask,
    deleteTask,
    archiveTask,
    openCreateTaskModal,
    openEditTaskModal,
    isLoading,
  } = useCalendar();

  const { members } = useFamily();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('open');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<TaskSortOption>('due_date');

  // Handle deep-linking from device notifications (e.g. ?tab=tasks&taskId=tsk_123)
  useEffect(() => {
    if (typeof window === 'undefined' || tasks.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const targetTaskId = params.get('taskId');
    if (targetTaskId) {
      const match = tasks.find((t) => t.id === targetTaskId);
      if (match) {
        openEditTaskModal(match);
        // Clean query parameter from address bar without reloading
        const url = new URL(window.location.href);
        url.searchParams.delete('taskId');
        window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''));
      }
    }
  }, [tasks, openEditTaskModal]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = tasks.length;
    const open = tasks.filter((t) => !t.completed && !t.is_archived).length;
    const completed = tasks.filter((t) => t.completed && !t.is_archived).length;
    const archived = tasks.filter((t) => Boolean(t.is_archived)).length;
    return { total, open, completed, archived };
  }, [tasks]);

  // Filtered and sorted tasks
  const displayedTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        // Status filter
        const isArchived = Boolean(t.is_archived);
        if (statusFilter === 'open' && (t.completed || isArchived)) return false;
        if (statusFilter === 'completed' && (!t.completed || isArchived)) return false;
        if (statusFilter === 'archived' && !isArchived) return false;
        if (statusFilter === 'all' && isArchived) return false; // "all" displays all non-archived by default

        // Member filter
        if (memberFilter !== 'all') {
          if (memberFilter === 'unassigned' && t.assigned_member_id) return false;
          if (memberFilter !== 'unassigned' && t.assigned_member_id !== memberFilter) return false;
        }

        // Priority filter
        if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesTitle = t.title.toLowerCase().includes(q);
          const matchesDesc = t.description ? t.description.toLowerCase().includes(q) : false;
          const matchesMember = t.member_name ? t.member_name.toLowerCase().includes(q) : false;
          if (!matchesTitle && !matchesDesc && !matchesMember) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'due_date') {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        }
        if (sortBy === 'priority') {
          const weights: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
          return (weights[b.priority] || 0) - (weights[a.priority] || 0);
        }
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title);
        }
        if (sortBy === 'created_at') {
          return (b.created_at || '').localeCompare(a.created_at || '');
        }
        return 0;
      });
  }, [tasks, statusFilter, memberFilter, priorityFilter, searchQuery, sortBy]);

  const handleToggle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await toggleTask(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchive = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await archiveTask(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Delete this task?')) {
      try {
        await deleteTask(id);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const formatDueBadge = (dueDateStr?: string | null, dueTimeStr?: string | null) => {
    if (!dueDateStr) return null;
    try {
      const date = parseISO(dueDateStr);
      let text = format(date, 'MMM d');
      let isOverdue = false;

      if (isToday(date)) {
        text = 'Today';
      } else if (isTomorrow(date)) {
        text = 'Tomorrow';
      } else if (isPast(date) && !isToday(date)) {
        text = format(date, 'MMM d') + ' (Overdue)';
        isOverdue = true;
      }

      if (dueTimeStr) {
        text += ` at ${dueTimeStr}`;
      }

      return (
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
            isOverdue
              ? 'bg-rose-100 text-rose-800 border border-rose-200'
              : isToday(date)
              ? 'bg-amber-100 text-amber-900 border border-amber-200'
              : 'bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          {isOverdue ? <AlertTriangle className="w-3 h-3 text-rose-600" /> : <Clock className="w-3 h-3" />}
          {text}
        </span>
      );
    } catch {
      return null;
    }
  };

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'high':
        return (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
            High
          </span>
        );
      case 'medium':
        return (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            Medium
          </span>
        );
      case 'low':
        return (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            Low
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Family Tasks
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 font-medium">
                Keep track of household to-dos, chores, and responsibilities
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openCreateTaskModal()}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-xs active:scale-[0.98] transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>New Task</span>
        </button>
      </div>

      {/* Navigation / Filter Tabs */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/60 overflow-x-auto">
          {(
            [
              { id: 'open', label: 'Open', count: stats.open },
              { id: 'completed', label: 'Completed', count: stats.completed },
              { id: 'all', label: 'All Active', count: stats.open + stats.completed },
              { id: 'archived', label: 'Archived', count: stats.archived },
            ] as const
          ).map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Secondary Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64 min-w-[160px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
            />
          </div>

          {/* Member Filter */}
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            aria-label="Filter by assigned family member"
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs cursor-pointer"
          >
            <option value="all">All Members</option>
            <option value="unassigned">Unassigned / Everyone</option>
            {members
              .filter((m) => m.is_active === 1)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by priority"
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as TaskSortOption)}
            aria-label="Sort tasks by"
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs cursor-pointer"
          >
            <option value="due_date">Sort: Due Date</option>
            <option value="priority">Sort: Priority</option>
            <option value="title">Sort: Title</option>
            <option value="created_at">Sort: Recent</option>
          </select>
        </div>
      </div>

      {/* Task List / Grid */}
      {displayedTasks.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">
            {statusFilter === 'open'
              ? 'No open tasks'
              : statusFilter === 'completed'
              ? 'No completed tasks yet'
              : statusFilter === 'archived'
              ? 'No archived tasks'
              : 'No tasks found'}
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 max-w-sm mb-4">
            {statusFilter === 'open'
              ? "You're all caught up! Create a new task to organize chores or errands."
              : 'Tasks matching your active filters will appear here.'}
          </p>
          <button
            type="button"
            onClick={() => openCreateTaskModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {displayedTasks.map((task) => {
            const isCompleted = task.completed;
            const assignedMember = members.find((m) => m.id === task.assigned_member_id);

            return (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                onClick={() => openEditTaskModal(task)}
                className={`group relative flex flex-col justify-between p-4 rounded-2xl border transition-all cursor-pointer select-none bg-white ${
                  isCompleted
                    ? 'border-gray-200/70 bg-gray-50/60 opacity-80'
                    : 'border-gray-200/90 hover:border-emerald-300 hover:shadow-xs'
                }`}
              >
                {/* Top Row: Checkbox, Title & Priority */}
                <div>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={(e) => handleToggle(e, task.id)}
                      className={`mt-0.5 shrink-0 rounded-lg transition-colors p-1 -m-1 ${
                        isCompleted
                          ? 'text-emerald-600 hover:text-emerald-700'
                          : 'text-gray-400 hover:text-emerald-600'
                      }`}
                      aria-label={isCompleted ? 'Mark task as incomplete' : 'Mark task as complete'}
                    >
                      {isCompleted ? (
                        <CheckSquare className="w-5 h-5 fill-emerald-100 stroke-[2.5]" />
                      ) : (
                        <Square className="w-5 h-5 stroke-[2]" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4
                          className={`text-sm font-bold tracking-tight truncate ${
                            isCompleted ? 'line-through text-gray-400 font-medium' : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </h4>
                        {getPriorityBadge(task.priority)}
                      </div>

                      {task.description && (
                        <p
                          className={`mt-1 text-xs line-clamp-2 ${
                            isCompleted ? 'text-gray-400 line-through' : 'text-gray-600'
                          }`}
                        >
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Metadata & Quick Actions */}
                <div className="mt-3.5 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Due Date Badge */}
                    {formatDueBadge(task.due_date, task.due_time)}

                    {/* Member Pill */}
                    {assignedMember ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-700 border"
                        style={{
                          backgroundColor: `${assignedMember.color}15`,
                          borderColor: `${assignedMember.color}40`,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: assignedMember.color }}
                        />
                        <span className="truncate max-w-[80px]">{assignedMember.name}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                        <User className="w-3 h-3 text-gray-400" />
                        Family
                      </span>
                    )}

                    {/* Device Reminder Badge */}
                    {task.reminder_minutes !== null && task.reminder_minutes !== undefined && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200"
                        title={`Device reminder: ${formatReminderLabel(task.reminder_minutes)}`}
                      >
                        <Bell className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate max-w-[100px]">{formatReminderLabel(task.reminder_minutes)}</span>
                      </span>
                    )}

                    {/* Repeat Badge */}
                    {task.recurring_rule && task.recurring_rule !== 'none' && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200"
                        title={`Repeats: ${formatTaskRepeatLabel(task.recurring_rule, task.recurring_interval, task.recurring_unit)}`}
                      >
                        <Repeat className="w-3 h-3 text-indigo-600 shrink-0" />
                        <span className="truncate max-w-[95px]">{formatTaskRepeatLabel(task.recurring_rule, task.recurring_interval, task.recurring_unit)}</span>
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => handleArchive(e, task.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      title={task.is_archived ? 'Restore task' : 'Archive task'}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, task.id)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
