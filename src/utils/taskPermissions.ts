import { format, differenceInCalendarDays, parseISO, isSameDay } from 'date-fns';
import { Task, FamilyMember } from '../types';

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

export function isChildMember(member: { role?: string } | null | undefined): boolean {
  return member?.role === 'child';
}

export function filterEligibleChildMembers(members: FamilyMember[]): FamilyMember[] {
  if (!Array.isArray(members)) return [];
  return members.filter((m) => {
    if (!m) return false;
    const isActive =
      m.is_active === undefined ||
      m.is_active === 1 ||
      (m.is_active as any) === true ||
      (m.is_active as any) === '1';
    const role = m.role || (m as any).type;
    return isActive && role === 'child';
  });
}

/**
 * Accurately determines if a task occurrence is completed on a specific date.
 */
export function isTaskOccurrenceCompleted(
  task: Task,
  occurrenceDate: string,
  currentMemberId?: string | null
): boolean {
  const dateStr = occurrenceDate ? occurrenceDate.slice(0, 10) : '';
  const rootDueDateStr = task.due_date ? task.due_date.slice(0, 10) : '';

  if (task.completions && task.completions.length > 0) {
    if (task.assignment_mode === 'open') {
      return task.completions.some(
        (c) => c.occurrence_date === dateStr && (currentMemberId ? c.member_id === currentMemberId : true)
      );
    } else {
      return task.completions.some(
        (c) => c.occurrence_date === dateStr
      );
    }
  }

  // If no completions array, only match if this occurrence is the root task due date
  if (dateStr && rootDueDateStr && dateStr === rootDueDateStr) {
    return Boolean(task.completed);
  }
  return false;
}

/**
 * Unified calculation for whether a recurring/non-recurring task occurs on a given date.
 */
export function isTaskOccurrenceOnDay(task: Task, dayDate: Date): boolean {
  if (task.is_archived) return false;
  if (!task.due_date) return false;

  const dayStr = format(dayDate, 'yyyy-MM-dd');
  const taskDueStr = task.due_date.trim().slice(0, 10);

  // Direct due date match (root date)
  if (taskDueStr === dayStr) {
    return true;
  }

  // Child tasks created from single edits don't project recurrence
  if (task.parent_task_id) {
    return false;
  }

  const rule = task.recurring_rule;
  if (!rule || rule === 'none') {
    return false;
  }

  const dueDate = parseISO(taskDueStr);
  if (isNaN(dueDate.getTime()) || dayDate < dueDate) {
    return false;
  }

  // Check end conditions:
  // 1. Date cutoff
  if (task.recurring_end_type === 'date' && task.recurring_end_date) {
    const endStr = task.recurring_end_date.trim().slice(0, 10);
    if (dayStr > endStr) return false;
  }

  // Check exceptions (dates removed via "This task only" delete)
  let exceptions: string[] = [];
  try {
    if (Array.isArray(task.recurring_exceptions)) {
      exceptions = task.recurring_exceptions;
    } else if (typeof task.recurring_exceptions === 'string') {
      exceptions = JSON.parse(task.recurring_exceptions);
    }
  } catch {
    exceptions = [];
  }
  if (exceptions.includes(dayStr)) {
    return false;
  }

  const interval = Math.max(1, Number(task.recurring_interval) || 1);
  const diffDays = differenceInCalendarDays(dayDate, dueDate);
  if (diffDays < 0) return false;

  let isMatch = false;
  let occIndex = 0;

  if (rule === 'daily') {
    isMatch = diffDays % interval === 0;
    occIndex = Math.floor(diffDays / interval);
  } else if (rule === 'weekly') {
    isMatch = dayDate.getDay() === dueDate.getDay() && Math.floor(diffDays / 7) % interval === 0;
    occIndex = Math.floor(diffDays / (7 * interval));
  } else if (rule === 'fortnightly') {
    isMatch = diffDays % 14 === 0;
    occIndex = Math.floor(diffDays / 14);
  } else if (rule === 'monthly') {
    const monthsDiff = (dayDate.getFullYear() - dueDate.getFullYear()) * 12 + (dayDate.getMonth() - dueDate.getMonth());
    isMatch = dayDate.getDate() === dueDate.getDate() && monthsDiff >= 0 && monthsDiff % interval === 0;
    occIndex = Math.floor(monthsDiff / interval);
  } else if (rule === 'yearly') {
    const yearsDiff = dayDate.getFullYear() - dueDate.getFullYear();
    isMatch = dayDate.getDate() === dueDate.getDate() && dayDate.getMonth() === dueDate.getMonth() && yearsDiff >= 0 && yearsDiff % interval === 0;
    occIndex = Math.floor(yearsDiff / interval);
  } else if (rule === 'custom') {
    const unit = (task.recurring_unit || 'day').toLowerCase();
    if (unit.startsWith('day')) {
      isMatch = diffDays % interval === 0;
      occIndex = Math.floor(diffDays / interval);
    } else if (unit.startsWith('week')) {
      isMatch = dayDate.getDay() === dueDate.getDay() && Math.floor(diffDays / 7) % interval === 0;
      occIndex = Math.floor(diffDays / (7 * interval));
    } else if (unit.startsWith('month')) {
      const monthsDiff = (dayDate.getFullYear() - dueDate.getFullYear()) * 12 + (dayDate.getMonth() - dueDate.getMonth());
      isMatch = dayDate.getDate() === dueDate.getDate() && monthsDiff >= 0 && monthsDiff % interval === 0;
      occIndex = Math.floor(monthsDiff / interval);
    } else if (unit.startsWith('year')) {
      const yearsDiff = dayDate.getFullYear() - dueDate.getFullYear();
      isMatch = dayDate.getDate() === dueDate.getDate() && dayDate.getMonth() === dueDate.getMonth() && yearsDiff >= 0 && yearsDiff % interval === 0;
      occIndex = Math.floor(yearsDiff / interval);
    }
  }

  if (!isMatch) return false;

  // 2. Count cutoff
  if (task.recurring_end_type === 'count' && task.recurring_end_count && Number(task.recurring_end_count) > 0) {
    if (occIndex >= Number(task.recurring_end_count)) {
      return false;
    }
  }

  return true;
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

  // Adult/Admin accounts approve tasks in Approvals; only children mark tasks complete
  if (isAdultOrAdmin) {
    return { canToggle: false, reason: 'Only child family members can complete tasks. Adults approve completions in Approvals.' };
  }

  // If already completed (checked), allow unticking to reopen
  if (task.completed) {
    return { canToggle: true };
  }

  // Verify scheduled task day rule: tasks can only be claimed/completed during their scheduled task day
  const todayStr = getHouseholdTodayDateString();
  const taskDateStr = task.due_date ? task.due_date.trim().slice(0, 10) : '';

  if (taskDateStr !== todayStr) {
    return {
      canToggle: false,
      reason: `Tasks can only be completed on their scheduled task day (${taskDateStr || 'today'})`,
    };
  }

  // For Assigned: Child can only complete if assigned to them
  if (task.assignment_mode !== 'open') {
    const assignedIds = getTaskAssignedMemberIds(task);
    const isAssigned = currentMemberId ? assignedIds.includes(currentMemberId) : false;
    if (!isAssigned) {
      return { canToggle: false, reason: 'Only the assigned child family member can complete this task' };
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
