import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Task, FamilyMember, GoogleSyncLog } from '../../types';
import { useFamily } from '../../context/FamilyContext';
import { useCalendar } from '../../context/CalendarContext';
import { useAuth } from '../../context/AuthContext';
import {
  Bell,
  Cake,
  CheckSquare,
  Square,
  Globe,
  Clock,
  Sparkles,
  Calendar,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Gift,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { format, differenceInDays, addYears, isAfter } from 'date-fns';
import { getPastelColorInfo } from '../../utils/colors';

export const NotificationsView: React.FC = () => {
  const { members } = useFamily();
  const { isSyncing, lastSyncedAt, triggerGoogleSync, googleAccounts } = useCalendar();
  const { user } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [syncLogs, setSyncLogs] = useState<GoogleSyncLog[]>([]);
  const [filter, setFilter] = useState<'all' | 'birthdays' | 'tasks' | 'sync'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskMemberId, setNewTaskMemberId] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tasksRes, logsRes] = await Promise.all([
        api.getTasks().catch(() => []),
        api.getGoogleLogs().catch(() => []),
      ]);
      setTasks(tasksRes);
      setSyncLogs(logsRes);
    } catch (err) {
      console.error('Failed to load notifications data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleTask = async (task: Task) => {
    try {
      const updated = await api.toggleTask(task.id);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      const created = await api.createTask({
        title: newTaskTitle.trim(),
        assigned_member_id: newTaskMemberId || null,
        priority: 'medium',
      });
      setTasks((prev) => [created, ...prev]);
      setNewTaskTitle('');
      setNewTaskMemberId('');
      setIsAddingTask(false);
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  // Calculate upcoming birthdays
  const today = new Date();
  const activeMembersWithBirthday = members
    .filter((m) => m.birth_date && m.is_active !== 0)
    .map((m) => {
      const bDate = new Date(m.birth_date!);
      let nextBirthday = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
      if (isAfter(today, nextBirthday) && differenceInDays(today, nextBirthday) > 0) {
        nextBirthday = addYears(nextBirthday, 1);
      }
      const daysUntil = differenceInDays(nextBirthday, today);
      const ageTurning = nextBirthday.getFullYear() - bDate.getFullYear();
      return {
        ...m,
        nextBirthday,
        daysUntil,
        ageTurning,
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const pendingTasks = tasks.filter((t) => t.status !== 'completed');

  return (
    <div id="notifications-view-container" className="max-w-4xl mx-auto w-full space-y-6 pb-12">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2 font-serif">
            <Bell className="w-6 h-6 text-[#DB2777]" />
            Notifications & Family Activity
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Stay updated with upcoming family birthdays, household tasks, and calendar sync logs.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl border border-gray-200 self-start sm:self-auto overflow-x-auto">
          {(
            [
              { id: 'all', label: 'All Updates' },
              { id: 'birthdays', label: `Birthdays (${activeMembersWithBirthday.length})` },
              { id: 'tasks', label: `Tasks (${pendingTasks.length})` },
              { id: 'sync', label: 'Sync Log' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                filter === t.id
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Upcoming Birthdays Section */}
      {(filter === 'all' || filter === 'birthdays') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
              <Cake className="w-4 h-4 text-[#DB2777]" />
              Upcoming Family Birthdays
            </h3>
            <span className="text-xs text-gray-500 font-medium">Next in line</span>
          </div>

          {activeMembersWithBirthday.length === 0 ? (
            <div className="p-6 text-center bg-white rounded-2xl border border-gray-200 text-gray-400 text-xs">
              No birthdays recorded. Add birth dates in the Household / Family tab.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeMembersWithBirthday.map((m) => {
                const colorInfo = getPastelColorInfo(m.color);
                const isVerySoon = m.daysUntil <= 14;

                return (
                  <div
                    key={m.id}
                    style={{ backgroundColor: colorInfo.bgSoft, borderColor: colorInfo.borderHex }}
                    className="p-4 rounded-2xl border transition-all hover:shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-xs border"
                        style={{
                          backgroundColor: colorInfo.hex,
                          color: colorInfo.textHex,
                          borderColor: colorInfo.borderHex,
                        }}
                      >
                        {m.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-gray-900 truncate block">
                          {m.name}
                        </span>
                        <span className="text-xs text-gray-600 block">
                          {format(m.nextBirthday, 'MMMM d')} • Turning {m.ageTurning}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-full ${
                          isVerySoon
                            ? 'bg-[#DB2777] text-white'
                            : 'bg-white text-gray-700 border border-gray-200'
                        }`}
                      >
                        {m.daysUntil === 0
                          ? 'Today! 🎂'
                          : m.daysUntil === 1
                          ? 'Tomorrow'
                          : `${m.daysUntil} days`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Household Tasks Section */}
      {(filter === 'all' || filter === 'tasks') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-emerald-600" />
              Household Tasks & To-Dos
            </h3>

            <button
              onClick={() => setIsAddingTask(!isAddingTask)}
              className="text-xs font-semibold text-[#DB2777] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Task
            </button>
          </div>

          {/* Quick Add Task inline */}
          {isAddingTask && (
            <form onSubmit={handleCreateTask} className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  placeholder="Task title (e.g. Buy groceries, Pick up dry cleaning...)"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-[#DB2777]"
                />
                <select
                  value={newTaskMemberId}
                  onChange={(e) => setNewTaskMemberId(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-[#DB2777]"
                >
                  <option value="">Assign to Anyone</option>
                  {members.filter((m) => m.is_active !== 0).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </form>
          )}

          {tasks.length === 0 ? (
            <div className="p-6 text-center bg-white rounded-2xl border border-gray-200 text-gray-400 text-xs">
              No tasks currently pending.
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 10).map((task) => {
                const assignedMember = members.find((m) => m.id === task.assigned_member_id);
                const isDone = task.status === 'completed';

                return (
                  <div
                    key={task.id}
                    className={`p-3.5 rounded-2xl bg-white border border-gray-200 flex items-center justify-between gap-3 transition-colors ${
                      isDone ? 'opacity-50' : 'hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        onClick={() => handleToggleTask(task)}
                        className="text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer"
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <span
                          className={`text-xs font-semibold block truncate ${
                            isDone ? 'line-through text-gray-400' : 'text-gray-900'
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.due_date && (
                          <span className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> Due: {format(new Date(task.due_date), 'MMM d')}
                          </span>
                        )}
                      </div>
                    </div>

                    {assignedMember && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border"
                        style={{
                          backgroundColor: getPastelColorInfo(assignedMember.color).bgSoft,
                          color: getPastelColorInfo(assignedMember.color).textHex,
                          borderColor: getPastelColorInfo(assignedMember.color).borderHex,
                        }}
                      >
                        {assignedMember.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Google Calendar Sync & Activity Log */}
      {(filter === 'all' || filter === 'sync') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              Calendar Sync & Activity
            </h3>

            {googleAccounts.length > 0 && (
              <button
                onClick={() => triggerGoogleSync()}
                disabled={isSyncing}
                className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-gray-700">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>
                  Last Google Sync:{' '}
                  <strong>
                    {lastSyncedAt ? format(new Date(lastSyncedAt), 'MMM d, yyyy HH:mm') : 'Never'}
                  </strong>
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px]">
                {googleAccounts.length > 0 ? 'Connected' : 'Local Only'}
              </span>
            </div>

            {syncLogs.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                  Recent Sync Logs
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {syncLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-gray-50 border border-gray-100 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        <span className="text-gray-800 font-medium">
                          {log.events_synced} events synced ({log.direction})
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {format(new Date(log.created_at), 'HH:mm:ss')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
