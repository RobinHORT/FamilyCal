import { Task } from '../types';
import { getEffectiveTodayDate } from './timezoneData';

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
 * Returns today's date formatted as YYYY-MM-DD in the household's configured UTC offset.
 */
export function getHouseholdTodayDateString(householdTimezone?: string | null): string {
  return getEffectiveTodayDate(householdTimezone);
}

/**
 * Checks if a task is actionable (claimable / completable) on or after its due date.
 * - Before the task's due date: FALSE
 * - On the due date: TRUE
 * - After the due date: TRUE
 *
 * Uses pure YYYY-MM-DD date string comparison in the household's timezone to avoid UTC timezone shifts.
 */
export function isTaskDateActionable(
  dueDateStr?: string | null,
  householdTimezone?: string | null
): boolean {
  if (!dueDateStr) return false;
  const todayStr = getHouseholdTodayDateString(householdTimezone);
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
  isAdultOrAdmin?: boolean,
  householdTimezone?: string | null
): { canToggle: boolean; reason?: string } {
  if (isViewer) {
    return { canToggle: false, reason: 'Viewer mode cannot modify tasks' };
  }

  // If already completed (checked), always allow unticking to reopen
  if (task.completed) {
    return { canToggle: true };
  }

  // Verify due date rule: tasks cannot be completed before their due date or outside scheduled date
  const todayStr = getHouseholdTodayDateString(householdTimezone);
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
  allTasks: Task[] = [],
  householdTimezone?: string | null
): { canClaim: boolean; reason?: string } {
  return { canClaim: false, reason: 'Claiming is disabled. Open chores can be completed directly by any member.' };
}
