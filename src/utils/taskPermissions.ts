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

/**
 * Returns today's date formatted as YYYY-MM-DD in the user's local device/browser date.
 */
export function getHouseholdTodayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Checks if a task is actionable (claimable / completable) on or after its due date.
 * - Before the task's due date: FALSE
 * - On the due date: TRUE
 * - After the due date: TRUE
 */
export function isTaskDateActionable(dueDateStr?: string | null): boolean {
  if (!dueDateStr) return false;
  const todayStr = getHouseholdTodayDateString();
  const taskDateStr = dueDateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDateStr)) return false;
  return taskDateStr <= todayStr;
}

export function isAdultOrAdminRole(user?: any, memberProfile?: any): boolean {
  if (user?.role === 'administrator' || user?.role === 'adult') return true;
  if (memberProfile?.role === 'administrator' || memberProfile?.role === 'adult') return true;
  return false;
}

export function isTaskOccurrenceCompleted(
  task: Task,
  occurrenceDate: string,
  currentMemberId?: string | null
): boolean {
  if (!task.completions || task.completions.length === 0) {
    return Boolean(task.completed);
  }
  const dateStr = occurrenceDate.slice(0, 10);
  if (task.assignment_mode === 'open') {
    return task.completions.some(
      (c) => c.occurrence_date === dateStr && c.member_id === currentMemberId
    );
  } else {
    return task.completions.some(
      (c) => c.occurrence_date === dateStr
    );
  }
}

export function canMemberToggleTask(
  task: Task,
  currentMemberId?: string | null,
  isViewer?: boolean,
  isAdultOrAdmin?: boolean
): { canToggle: boolean; reason?: string } {
  if (isViewer) {
    return { canToggle: false, reason: 'Viewer mode cannot modify tasks' };
  }

  // If already completed (checked), always allow unticking to reopen
  if (task.completed) {
    return { canToggle: true };
  }

  // Verify due date rule: tasks cannot be completed before their due date or outside scheduled date
  const todayStr = getHouseholdTodayDateString();
  const taskDateStr = task.due_date ? task.due_date.trim().slice(0, 10) : '';

  if (taskDateStr > todayStr) {
    return {
      canToggle: false,
      reason: `Tasks cannot be completed before their due date (${taskDateStr})`,
    };
  }

  if (taskDateStr < todayStr) {
    return {
      canToggle: false,
      reason: `Tasks can only be completed on their scheduled due date (${taskDateStr})`,
    };
  }

  // Adults and Administrators can complete on behalf of any family member on scheduled date
  if (isAdultOrAdmin) {
    return { canToggle: true };
  }

  // For Assigned: Child can only complete if assigned to them
  if (task.assignment_mode !== 'open') {
    const assignedIds = getTaskAssignedMemberIds(task);
    const isAssigned = currentMemberId ? assignedIds.includes(currentMemberId) : false;
    if (!isAssigned) {
      return { canToggle: false, reason: 'Only the assigned family member can complete this task' };
    }
  }

  return { canToggle: true };
}

export function canMemberClaimTask(
  task: Task,
  currentMemberId?: string | null,
  isViewer?: boolean,
  allTasks: Task[] = []
): { canClaim: boolean; reason?: string } {
  return { canClaim: false, reason: 'Claiming is disabled. Open chores can be completed directly by any member.' };
}
