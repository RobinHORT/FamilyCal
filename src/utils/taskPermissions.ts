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

export function isAdultOrAdminRole(user?: any, memberProfile?: any): boolean {
  if (user?.role === 'administrator' || user?.role === 'adult') return true;
  if (memberProfile?.role === 'administrator' || memberProfile?.role === 'adult') return true;
  return false;
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

  if (!isTaskDateActionable(task.due_date)) {
    const formattedDueDate = task.due_date.slice(0, 10);
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
  allTasks: Task[] = []
): { canClaim: boolean; reason?: string } {
  if (isViewer) {
    return { canClaim: false, reason: 'Viewers cannot claim tasks' };
  }
  if (!currentMemberId) {
    return { canClaim: false, reason: 'Please select or log in as a family member to claim' };
  }
  if (task.assignment_mode !== 'open') {
    return { canClaim: false, reason: 'Task is not open for claiming' };
  }

  const groupId = task.task_group_id || task.id;
  const relatedTasks = allTasks.filter(
    (t) => (t.task_group_id === groupId || t.parent_task_id === task.id || t.id === task.id)
  );

  const alreadyClaimed = relatedTasks.some((t) => t.assigned_member_id === currentMemberId);
  if (alreadyClaimed) {
    return { canClaim: false, reason: 'You have already claimed this task' };
  }

  const claimLimit = task.claim_limit !== undefined && task.claim_limit !== null ? Number(task.claim_limit) : 1;
  if (claimLimit === 1) {
    if (task.assigned_member_id) {
      return { canClaim: false, reason: 'This task has already been claimed' };
    }
  } else if (claimLimit > 1) {
    const claimedCount = relatedTasks.filter((t) => t.assigned_member_id !== null).length;
    if (claimedCount >= claimLimit) {
      return { canClaim: false, reason: 'Claim limit reached for this task' };
    }
  }

  return { canClaim: true };
}
