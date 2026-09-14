import { format } from 'date-fns';
import { Task } from '../types';

export function getTaskAssignedMemberIds(task: Task): string[] {
  if (Array.isArray(task.assigned_member_ids) && task.assigned_member_ids.length > 0) {
    return task.assigned_member_ids;
  }
  if (task.assigned_member_id) {
    return [task.assigned_member_id];
  }
  return [];
}

export function isTaskDateActionable(dueDateStr?: string | null): boolean {
  if (!dueDateStr) return false;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const taskDateStr = dueDateStr.slice(0, 10);
  return todayStr >= taskDateStr;
}

export function canMemberToggleTask(
  task: Task,
  currentMemberId?: string | null,
  isViewer?: boolean
): { canToggle: boolean; reason?: string } {
  if (isViewer) {
    return { canToggle: false, reason: 'Viewer mode cannot modify tasks' };
  }

  const assignedIds = getTaskAssignedMemberIds(task);
  const isAssigned = currentMemberId ? assignedIds.includes(currentMemberId) : false;

  if (!isAssigned) {
    return { canToggle: false, reason: 'Only assigned family members can complete this task' };
  }

  if (!task.due_date) {
    return { canToggle: false, reason: 'Task requires a due date' };
  }

  if (!isTaskDateActionable(task.due_date)) {
    const formattedDueDate = task.due_date.slice(0, 10);
    return {
      canToggle: false,
      reason: `Task cannot be completed before its due date (${formattedDueDate})`,
    };
  }

  return { canToggle: true };
}
