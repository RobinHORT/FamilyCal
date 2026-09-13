import { Task, CalendarEvent } from '../types';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return Notification.permission;
  }
}

export function formatReminderLabel(reminderMinutes?: number | null): string {
  if (reminderMinutes === null || reminderMinutes === undefined) {
    return 'No reminder';
  }
  if (reminderMinutes === 0) {
    return 'At time of event / task';
  }
  if (reminderMinutes === 5) {
    return '5 minutes before';
  }
  if (reminderMinutes === 15) {
    return '15 minutes before';
  }
  if (reminderMinutes === 30) {
    return '30 minutes before';
  }
  if (reminderMinutes === 60) {
    return '1 hour before';
  }
  if (reminderMinutes === 1440) {
    return '1 day before';
  }
  if (reminderMinutes < 60) {
    return `${reminderMinutes} minutes before`;
  }
  const hours = Math.round(reminderMinutes / 60);
  return `${hours} hour${hours > 1 ? 's' : ''} before`;
}

export function formatDueNotificationText(reminderMinutes: number): string {
  if (reminderMinutes === 0) {
    return 'Due now';
  }
  if (reminderMinutes === 5) {
    return 'Due in 5 minutes';
  }
  if (reminderMinutes === 15) {
    return 'Due in 15 minutes';
  }
  if (reminderMinutes === 30) {
    return 'Due in 30 minutes';
  }
  if (reminderMinutes === 60) {
    return 'Due in 1 hour';
  }
  if (reminderMinutes === 1440) {
    return 'Due in 1 day';
  }
  if (reminderMinutes < 60) {
    return `Due in ${reminderMinutes} minutes`;
  }
  const hours = Math.round(reminderMinutes / 60);
  return `Due in ${hours} hours`;
}

export function formatEventDueNotificationText(reminderMinutes: number): string {
  if (reminderMinutes === 0) {
    return 'Starts now';
  }
  if (reminderMinutes === 5) {
    return 'Starts in 5 minutes';
  }
  if (reminderMinutes === 15) {
    return 'Starts in 15 minutes';
  }
  if (reminderMinutes === 30) {
    return 'Starts in 30 minutes';
  }
  if (reminderMinutes === 60) {
    return 'Starts in 1 hour';
  }
  if (reminderMinutes === 1440) {
    return 'Starts in 1 day';
  }
  if (reminderMinutes < 60) {
    return `Starts in ${reminderMinutes} minutes`;
  }
  const hours = Math.round(reminderMinutes / 60);
  return `Starts in ${hours} hours`;
}

export async function sendTaskDeviceNotification(
  task: Task,
  reminderMinutes: number
): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const dueNotice = formatDueNotificationText(reminderMinutes);
  const title = 'FamilyCal';
  const body = `${task.title}\n${dueNotice}`;
  const deepLinkUrl = `/?tab=tasks&taskId=${encodeURIComponent(task.id)}`;

  const notificationOptions: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/favicon-32x32.png',
    tag: `task-reminder-${task.id}`,
    data: {
      taskId: task.id,
      url: deepLinkUrl,
    },
    requireInteraction: true,
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, notificationOptions);
        return true;
      }
    }

    // Fallback if service worker is not active or ready yet
    const notification = new Notification(title, notificationOptions);
    notification.onclick = (e) => {
      e.preventDefault();
      window.focus();
      window.location.href = deepLinkUrl;
      notification.close();
    };
    return true;
  } catch (err) {
    console.error('Failed to trigger task device notification:', err);
    try {
      const notification = new Notification(title, notificationOptions);
      notification.onclick = (e) => {
        e.preventDefault();
        window.focus();
        window.location.href = deepLinkUrl;
        notification.close();
      };
      return true;
    } catch (fallbackErr) {
      console.error('Task notification fallback failed:', fallbackErr);
      return false;
    }
  }
}

export async function sendEventDeviceNotification(
  event: CalendarEvent,
  reminderMinutes: number
): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const eventNotice = formatEventDueNotificationText(reminderMinutes);
  const title = 'FamilyCal';
  const body = `${event.title}\n${eventNotice}`;
  const deepLinkUrl = `/?tab=calendar&eventId=${encodeURIComponent(event.id)}`;

  const notificationOptions: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/favicon-32x32.png',
    tag: `event-reminder-${event.id}`,
    data: {
      eventId: event.id,
      url: deepLinkUrl,
    },
    requireInteraction: true,
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, notificationOptions);
        return true;
      }
    }

    // Fallback if service worker is not active or ready yet
    const notification = new Notification(title, notificationOptions);
    notification.onclick = (e) => {
      e.preventDefault();
      window.focus();
      window.location.href = deepLinkUrl;
      notification.close();
    };
    return true;
  } catch (err) {
    console.error('Failed to trigger event device notification:', err);
    try {
      const notification = new Notification(title, notificationOptions);
      notification.onclick = (e) => {
        e.preventDefault();
        window.focus();
        window.location.href = deepLinkUrl;
        notification.close();
      };
      return true;
    } catch (fallbackErr) {
      console.error('Event notification fallback failed:', fallbackErr);
      return false;
    }
  }
}
