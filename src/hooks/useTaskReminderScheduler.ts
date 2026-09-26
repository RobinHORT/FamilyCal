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

function parseTimestamp(dateOrDateTimeStr: string, timeStr?: string | null): number {
  if (!dateOrDateTimeStr) return NaN;

  if (dateOrDateTimeStr.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dateOrDateTimeStr)) {
    return new Date(dateOrDateTimeStr).getTime();
  }

  const datePart = dateOrDateTimeStr.includes('T')
    ? dateOrDateTimeStr.split('T')[0]
    : dateOrDateTimeStr.split(' ')[0];

  const timePart = timeStr && /^\d{1,2}:\d{2}/.test(timeStr)
    ? (timeStr.length === 5 ? `${timeStr}:00` : timeStr)
    : (dateOrDateTimeStr.includes('T') ? (dateOrDateTimeStr.split('T')[1] || '09:00:00') : '09:00:00');

  return new Date(`${datePart}T${timePart}`).getTime();
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
          if (
            event.reminder_minutes === null ||
            event.reminder_minutes === undefined ||
            !event.start_time
          ) {
            continue;
          }

          const startMs = parseTimestamp(event.start_time);
          if (isNaN(startMs)) continue;
          const reminderMs = Number(event.reminder_minutes) * 60 * 1000;
          const triggerMs = startMs - reminderMs;

          // Trigger if current time is within [triggerMs, triggerMs + 2 hours]
          if (now < triggerMs || now > triggerMs + twoHoursMs) {
            continue;
          }

          // ONLY MEMBERS INVOLVED RECEIVE THE NOTIFICATION
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
            // Specific subset of members assigned
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
          if (
            task.completed ||
            task.is_archived ||
            task.reminder_minutes === null ||
            task.reminder_minutes === undefined ||
            !task.due_date
          ) {
            continue;
          }

          const dueMs = parseTimestamp(task.due_date, task.due_time || '09:00:00');
          if (isNaN(dueMs)) continue;

          const reminderMs = Number(task.reminder_minutes) * 60 * 1000;
          const triggerMs = dueMs - reminderMs;

          // Trigger if current time is within [triggerMs, triggerMs + 2 hours]
          if (now < triggerMs || now > triggerMs + twoHoursMs) {
            continue;
          }

          let isAssigned = false;
          const assignedIds: string[] = Array.isArray(task.assigned_member_ids)
            ? task.assigned_member_ids
            : [];
          if (!task.assigned_member_id && assignedIds.length === 0) {
            isAssigned = true;
          } else {
            if (currentMemberId && (currentMemberId === task.assigned_member_id || assignedIds.includes(currentMemberId))) {
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
