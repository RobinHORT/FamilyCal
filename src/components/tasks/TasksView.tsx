import React, { useState, useEffect, useCallback } from 'react';
import { Task, Priority } from '../../types';
import { api } from '../../api/client';
import { useFamily } from '../../context/FamilyContext';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  Filter,
  CheckCircle2,
  Clock,
  User,
} from 'lucide-react';
import { format } from 'date-fns';

export const TasksView: React.FC = () => {
  const { members } = useFamily();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterMemberId, setFilterMemberId] = useState<string | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<string | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed'>('active');

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newAssignedId, setNewAssignedId] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.getTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleToggleTask = async (id: string) => {
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
    try {
      await api.toggleTask(id);
      await fetchTasks();
    } catch {
      await fetchTasks();
    }
  };

  const handleDeleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.deleteTask(id);
    } catch {
      await fetchTasks();
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsAdding(true);
    try {
      await api.createTask({
        title: newTitle.trim(),
        due_date: newDueDate || null,
        priority: newPriority,
        assigned_member_id: newAssignedId || null,
      });
      setNewTitle('');
      setNewDueDate('');
      setNewAssignedId('');
      setNewPriority('medium');
      await fetchTasks();
    } finally {
      setIsAdding(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus === 'active' && t.completed) return false;
    if (filterStatus === 'completed' && !t.completed) return false;
    if (filterMemberId !== 'all' && t.assigned_member_id !== filterMemberId) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  const completedCount = tasks.filter((t) => t.completed).length;
  const activeCount = tasks.filter((t) => !t.completed).length;

  return (
    <div id="tasks-view-container" className="flex flex-col flex-1 max-w-5xl mx-auto w-full space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#242C3D]/60">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight font-serif">
            Family Tasks & Chores
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Keep the household running smoothly with shared checklists and assignments.
          </p>
        </div>

        {/* Status Count Pills */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-[#121620] border border-[#242C3D] text-xs font-semibold text-gray-300">
            <span className="text-[#FF4FA3] font-bold">{activeCount}</span> Pending
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-[#121620] border border-[#242C3D] text-xs font-semibold text-gray-300">
            <span className="text-emerald-400 font-bold">{completedCount}</span> Done
          </div>
        </div>
      </div>

      {/* Quick Add Task Box */}
      <form
        onSubmit={handleCreateTask}
        id="task-create-form"
        className="p-4 rounded-2xl bg-[#121620] border border-[#242C3D] shadow-md space-y-3"
      >
        <div className="flex items-center gap-2">
          <input
            id="task-title-input"
            type="text"
            required
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What needs to be done? (e.g. Unpack dishwasher, Buy milk, Walk dog...)"
            className="flex-1 bg-[#1A202C] border border-[#242C3D] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FA3] transition-colors"
          />
          <button
            type="submit"
            id="task-submit-btn"
            disabled={isAdding || !newTitle.trim()}
            className="px-5 py-2.5 rounded-xl bg-[#FF4FA3] hover:bg-[#e63e90] text-white text-xs font-bold transition-all shadow-md shadow-[#FF4FA3]/25 cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Task</span>
          </button>
        </div>

        {/* Task Metadata Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Assignee */}
          <div className="flex items-center gap-2 bg-[#1A202C] px-3 py-1.5 rounded-xl border border-[#242C3D]">
            <User className="w-3.5 h-3.5 text-[#FF4FA3]" />
            <select
              id="task-assignee-select"
              value={newAssignedId}
              onChange={(e) => setNewAssignedId(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none w-full"
            >
              <option value="" className="bg-[#121620]">Assign to Everyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#121620]">
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div className="flex items-center gap-2 bg-[#1A202C] px-3 py-1.5 rounded-xl border border-[#242C3D]">
            <Calendar className="w-3.5 h-3.5 text-[#FF4FA3]" />
            <input
              id="task-duedate-input"
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none w-full"
            />
          </div>

          {/* Priority */}
          <div className="flex items-center gap-2 bg-[#1A202C] px-3 py-1.5 rounded-xl border border-[#242C3D]">
            <AlertCircle className="w-3.5 h-3.5 text-[#FF4FA3]" />
            <select
              id="task-priority-select"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as Priority)}
              className="bg-transparent text-xs text-white focus:outline-none w-full"
            >
              <option value="low" className="bg-[#121620]">Low Priority</option>
              <option value="medium" className="bg-[#121620]">Medium Priority</option>
              <option value="high" className="bg-[#121620]">High Priority ⚡</option>
            </select>
          </div>
        </div>
      </form>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          {(['active', 'completed', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                filterStatus === status
                  ? 'bg-[#FF4FA3] text-white shadow-xs'
                  : 'bg-[#121620] text-gray-400 hover:text-white border border-[#242C3D]'
              }`}
            >
              {status} Tasks
            </button>
          ))}
        </div>

        {/* Member Filter Dropdown */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          <select
            value={filterMemberId}
            onChange={(e) => setFilterMemberId(e.target.value)}
            className="bg-[#121620] border border-[#242C3D] rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-[#FF4FA3]"
          >
            <option value="all">All Members</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-2.5">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#121620] border border-[#242C3D]/60 text-gray-500">
            <CheckCircle2 className="w-10 h-10 mx-auto text-gray-600 mb-2" />
            <p className="text-sm font-semibold text-gray-300">All clear!</p>
            <p className="text-xs text-gray-500 mt-1">No tasks matching current filters.</p>
          </div>
        ) : (
          filteredTasks.map((t) => {
            const member = members.find((m) => m.id === t.assigned_member_id);

            return (
              <div
                key={t.id}
                id={`task-item-${t.id}`}
                className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 group ${
                  t.completed
                    ? 'bg-[#0E111A]/60 border-[#242C3D]/40 opacity-60'
                    : 'bg-[#121620] hover:bg-[#181F2E] border-[#242C3D] shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => handleToggleTask(t.id)}
                    className="text-gray-400 hover:text-[#FF4FA3] transition-colors cursor-pointer shrink-0"
                  >
                    {t.completed ? (
                      <CheckSquare className="w-5 h-5 text-[#FF4FA3]" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>

                  <div className="flex flex-col min-w-0">
                    <span
                      className={`text-sm font-semibold tracking-tight truncate ${
                        t.completed ? 'line-through text-gray-500' : 'text-white'
                      }`}
                    >
                      {t.title}
                    </span>

                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-gray-400 font-medium">
                      {t.due_date && (
                        <span className="flex items-center gap-1 font-mono text-gray-400">
                          <Clock className="w-3 h-3 text-[#FF4FA3]" />
                          {t.due_date}
                        </span>
                      )}

                      {t.priority === 'high' && (
                        <span className="px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 font-bold text-[10px]">
                          High Priority
                        </span>
                      )}

                      {member && (
                        <span
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                          style={{ backgroundColor: `${member.color}25`, borderColor: member.color, borderWidth: '1px' }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: member.color }} />
                          {member.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteTask(t.id)}
                  className="p-1.5 rounded-xl hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Delete Task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
