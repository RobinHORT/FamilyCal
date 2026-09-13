import { useEffect, useRef } from 'react';
import { Task, CalendarEvent, User, FamilyMember } from '../types';
import {
  sendTaskDeviceNotification,
  sendEventDeviceNotification,
  isNotificationSupported,
} from '../utils/taskNotifications';

const NOTIFIED_STORAGE_KEY = 'familycal_notified_device_reminders';

function getNotifiedMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(NOTIFIED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotifiedMap(map: Record<string, number>) {
  try {
    localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function useTaskReminderScheduler(
  events: CalendarEvent[] = [],
  tasks: Task[] = [],
  currentUser: User | null = null,
  currentMemberProfile: FamilyMember | null = null,
  members: FamilyMember[] = []
) {
  const isCheckingRef = useRef(false);

  useEffect(() => {
    if (!isNotificationSupported()) return;

    const checkReminders = async () => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;

      try {
        if (Notification.permission !== 'granted') {
          return;
        }

        const now = Date.now();
        const notifiedMap = getNotifiedMap();
        let hasChanges = false;

        // Purge items older than 7 days
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        for (const key of Object.keys(notifiedMap)) {
          if (notifiedMap[key] < sevenDaysAgo) {
            delete notifiedMap[key];
            hasChanges = true;
          }
        }

        // Determine current user's family member ID
        const currentMember =
          currentMemberProfile ||
          members.find((m) => m.user_id === currentUser?.id) ||
          null;
        const currentMemberId = currentMember?.id || null;
        const activeMembers = members.filter((m) => m.is_active === 1);
        const twoHoursMs = 2 * 60 * 60 * 1000;

        // ----------------------------------------------------
        // 1. CALENDAR EVENTS REMINDERS
        // ----------------------------------------------------
        for (const event of events) {
          // Rule 1: Reminder configured? NO -> No device notification
          if (
            event.reminder_minutes === null ||
            event.reminder_minutes === undefined ||
            !event.start_time
          ) {
            continue;
          }

          const startDateObj = new Date(event.start_time);
          if (isNaN(startDateObj.getTime())) continue;

          const startMs = startDateObj.getTime();
          const reminderMs = Number(event.reminder_minutes) * 60 * 1000;
          const triggerMs = startMs - reminderMs;

          // Trigger if current time is within [triggerMs, triggerMs + 2 hours]
          if (now < triggerMs || now > triggerMs + twoHoursMs) {
            continue;
          }

          // Rule 2: ONLY MEMBERS INVOLVED RECEIVE THE NOTIFICATION
          const assignedIds = Array.isArray(event.assigned_member_ids)
            ? event.assigned_member_ids
            : [];

          let isInvolved = false;
          if (assignedIds.length === 0) {
            // Unrestricted household / Family Hub event -> all family members receive it
            isInvolved = true;
          } else if (
            activeMembers.length > 0 &&
            assignedIds.length >= activeMembers.length &&
            activeMembers.every((m) => assignedIds.includes(m.id))
          ) {
            // Whole family assigned -> all family members receive it
            isInvolved = true;
          } else {
            // Specific subset of members assigned (e.g. Amanda + Jakob)
            // Only members in assignedIds receive the device notification
            if (currentMemberId && assignedIds.includes(currentMemberId)) {
              isInvolved = true;
            } else {
              isInvolved = false;
            }
          }

          if (!isInvolved) {
            continue;
          }

          const reminderKey = `evt_${event.id}_${event.start_time}_${event.reminder_minutes}`;
          if (!notifiedMap[reminderKey]) {
            console.log(
              `[Event Reminder] Triggering device notification for "${event.title}" to member ${currentMember?.name || 'current'}`
            );
            const sent = await sendEventDeviceNotification(
              event,
              Number(event.reminder_minutes)
            );
            if (sent) {
              notifiedMap[reminderKey] = now;
              hasChanges = true;
            }
          }
        }

        // ----------------------------------------------------
        // 2. TASKS REMINDERS
        // ----------------------------------------------------
        for (const task of tasks) {
          // Rule 1: Reminder configured? NO -> No device notification
          // Ignore completed, archived, or tasks without reminder or due date
          if (
            task.completed ||
            task.is_archived ||
            task.reminder_minutes === null ||
            task.reminder_minutes === undefined ||
            !task.due_date
          ) {
            continue;
          }

          // Build due Date
          let dueDateTimeString = task.due_date;
          if (task.due_time && /^\d{1,2}:\d{2}/.test(task.due_time)) {
            const timePart =
              task.due_time.length === 5 ? `${task.due_time}:00` : task.due_time;
            dueDateTimeString = `${task.due_date}T${timePart}`;
          } else {
            dueDateTimeString = `${task.due_date}T09:00:00`;
          }

          const dueDateObj = new Date(dueDateTimeString);
          if (isNaN(dueDateObj.getTime())) continue;

          const dueMs = dueDateObj.getTime();
          const reminderMs = Number(task.reminder_minutes) * 60 * 1000;
          const triggerMs = dueMs - reminderMs;

          // Trigger if current time is within [triggerMs, triggerMs + 2 hours]
          if (now < triggerMs || now > triggerMs + twoHoursMs) {
            continue;
          }

          // Rule 2: ONLY MEMBERS INVOLVED RECEIVE THE NOTIFICATION
          let isAssigned = false;
          if (!task.assigned_member_id) {
            // Task assigned to Whole Family -> all family members receive it
            isAssigned = true;
          } else {
            // Specific member assigned -> only that member receives it
            if (currentMemberId && currentMemberId === task.assigned_member_id) {
              isAssigned = true;
            } else {
              isAssigned = false;
            }
          }

          if (!isAssigned) {
            continue;
          }

          const reminderKey = `tsk_${task.id}_${task.due_date}_${task.due_time || 'none'}_${task.reminder_minutes}`;
          if (!notifiedMap[reminderKey]) {
            console.log(
              `[Task Reminder] Triggering device notification for "${task.title}" to member ${currentMember?.name || 'current'}`
            );
            const sent = await sendTaskDeviceNotification(
              task,
              Number(task.reminder_minutes)
            );
            if (sent) {
              notifiedMap[reminderKey] = now;
              hasChanges = true;
            }
          }
        }

        if (hasChanges) {
          saveNotifiedMap(notifiedMap);
        }
      } catch (err) {
        console.error('Error in device reminder check loop:', err);
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Immediate check
    checkReminders();

    // Check periodically every 20 seconds
    const interval = setInterval(checkReminders, 20000);

    // Also check on window focus / visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkReminders();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [events, tasks, currentUser, currentMemberProfile, members]);
}
