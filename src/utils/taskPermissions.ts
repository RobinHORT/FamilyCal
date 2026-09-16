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
 * Returns today's date formatted as YYYY-MM-DD in the household's configured local timezone.
 * Falls back to local system calendar date.
 */
export function getHouseholdTodayDateString(householdTimezone?: string | null): string {
  if (householdTimezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: householdTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());

      const year = parts.find((p) => p.type === 'year')?.value;
      const month = parts.find((p) => p.type === 'month')?.value;
      const day = parts.find((p) => p.type === 'day')?.value;

      if (year && month && day) {
        return `${year}-${month}-${day}`;
      }
    } catch {
      // Fallback if invalid timezone
    }
  }

  // Fallback to local system calendar date
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  // If task is open and unclaimed
  if (task.assignment_mode === 'open' && !task.assigned_member_id) {
    return { canToggle: false, reason: 'This task is open and must be claimed before it can be completed' };
  }

  // Adults and Administrators can complete or reopen on behalf of any family member
  if (isAdultOrAdmin) {
    return { canToggle: true };
  }

  const assignedIds = getTaskAssignedMemberIds(task);
  const isAssigned = currentMemberId ? assignedIds.includes(currentMemberId) : false;

  if (!isAssigned) {
    return { canToggle: false, reason: 'Only the assigned family member can complete this task' };
  }

  if (!task.due_date) {
    return { canToggle: false, reason: 'Task requires a due date' };
  }

  // If reopening a completed task, allow assigned member
  if (task.completed) {
    return { canToggle: true };
  }

  if (!isTaskDateActionable(task.due_date, householdTimezone)) {
    const formattedDueDate = task.due_date.trim().slice(0, 10);
    return {
      canToggle: false,
      reason: `Task cannot be completed before its due date (${formattedDueDate})`,
    };
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
  if (isViewer) {
    return { canClaim: false, reason: 'Viewers cannot claim tasks' };
  }
  if (!currentMemberId) {
    return { canClaim: false, reason: 'Please select or log in as a family member to claim' };
  }

  // Before the task's due date: the task CANNOT be claimed.
  // On the due date: the task CAN be claimed.
  // After the due date: the task CAN still be claimed.
  // This applies to both assigned tasks and Open Tasks.
  // For recurring tasks, each occurrence must use its own due date.
  if (task.due_date && !isTaskDateActionable(task.due_date, householdTimezone)) {
    const formattedDueDate = task.due_date.trim().slice(0, 10);
    return {
      canClaim: false,
      reason: `Task cannot be claimed before its due date (${formattedDueDate})`,
    };
  }

  if (task.assignment_mode !== 'open') {
    return { canClaim: false, reason: 'Task is not open for claiming' };
  }

  const groupId = task.task_group_id || task.id;
  const targetDueDate = task.due_date ? task.due_date.trim().slice(0, 10) : undefined;
  const relatedTasks = allTasks.filter(
    (t) => (t.task_group_id === groupId || t.parent_task_id === task.id || t.id === task.id)
  );

  const alreadyClaimed = relatedTasks.some((t) => 
    t.assigned_member_id === currentMemberId &&
    (!targetDueDate || (t.due_date && t.due_date.trim().slice(0, 10) === targetDueDate))
  );
  if (alreadyClaimed) {
    return { canClaim: false, reason: 'You have already claimed this task' };
  }

  const claimLimit = task.claim_limit !== undefined && task.claim_limit !== null ? Number(task.claim_limit) : 1;
  if (claimLimit === 1) {
    if (task.assigned_member_id) {
      return { canClaim: false, reason: 'This task has already been claimed' };
    }
    const isClaimedByAnyoneOnThisDate = relatedTasks.some((t) => 
      t.assigned_member_id !== null &&
      (!targetDueDate || (t.due_date && t.due_date.trim().slice(0, 10) === targetDueDate))
    );
    if (isClaimedByAnyoneOnThisDate) {
      return { canClaim: false, reason: 'This task has already been claimed' };
    }
  } else if (claimLimit > 1) {
    const claimedCount = relatedTasks.filter((t) => 
      t.assigned_member_id !== null &&
      (!targetDueDate || (t.due_date && t.due_date.trim().slice(0, 10) === targetDueDate))
    ).length;
    if (claimedCount >= claimLimit) {
      return { canClaim: false, reason: 'Claim limit reached for this task' };
    }
  }

  return { canClaim: true };
}
