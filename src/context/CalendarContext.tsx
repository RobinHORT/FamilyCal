import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { subMonths, addMonths, subWeeks, addWeeks, subDays, addDays } from 'date-fns';
import { Calendar, CalendarEvent, CalendarViewMode, GoogleAccount, EventType, Task } from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { useTaskReminderScheduler } from '../hooks/useTaskReminderScheduler';
import { getHouseholdTodayDateString } from '../utils/taskPermissions';

interface CalendarContextType {
  calendars: Calendar[];
  events: CalendarEvent[];
  filteredEvents: CalendarEvent[];
  eventTypes: EventType[];
  tasks: Task[];
  currentDate: Date;
  selectedCalendarDate: Date;
  viewMode: CalendarViewMode;
  selectedEvent: CalendarEvent | null;
  isEventModalOpen: boolean;
  eventModalInitialDate: Date | null;
  isAddChoiceModalOpen: boolean;
  addChoiceInitialDate: Date | null;
  isTaskModalOpen: boolean;
  taskModalInitialDate: Date | null;
  editingTask: Task | null;
  selectedCalendarIds: string[]; // for multi-calendar layer toggle
  selectedMemberIds: string[]; // for multi-member layer toggle
  isSyncing: boolean;
  lastSyncedAt: string | null;
  googleAccounts: GoogleAccount[];
  isLoading: boolean;
  navigationDirection: number;
  setCurrentDate: (d: Date) => void;
  setSelectedCalendarDate: (d: Date) => void;
  setViewMode: (v: CalendarViewMode) => void;
  goToPreviousPeriod: () => void;
  goToNextPeriod: () => void;
  goToToday: () => void;
  openAddChoiceModal: (initialDate?: Date) => void;
  closeAddChoiceModal: () => void;
  openCreateEventModal: (initialDate?: Date) => void;
  openEditEventModal: (event: CalendarEvent) => void;
  closeEventModal: () => void;
  openCreateTaskModal: (initialDate?: Date) => void;
  openEditTaskModal: (task: Task) => void;
  closeTaskModal: () => void;
  toggleCalendarSelection: (id: string) => void;
  toggleMemberFilter: (id: string) => void;
  selectAllMembers: () => void;
  deselectAllMembers: () => void;
  selectAllCalendars: () => void;
  deselectAllCalendars: () => void;
  fetchCalendarData: () => Promise<void>;
  fetchTasks: () => Promise<void>;
  createEvent: (data: Partial<CalendarEvent>) => Promise<CalendarEvent>;
  updateEvent: (id: string, data: Partial<CalendarEvent>) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
  createCalendar: (data: { name: string; color?: string; description?: string; member_id?: string | null }) => Promise<Calendar>;
  updateCalendar: (id: string, data: Partial<Calendar>) => Promise<Calendar>;
  deleteCalendar: (id: string) => Promise<void>;
  createEventType: (data: { name: string; color: string; icon?: string }) => Promise<EventType>;
  updateEventType: (id: string, data: Partial<EventType>) => Promise<EventType>;
  deleteEventType: (id: string) => Promise<void>;
  createTask: (data: Partial<Task>) => Promise<Task>;
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>;
  toggleTask: (id: string, occurrenceDate?: string, clientDate?: string) => Promise<Task>;
  claimTask: (id: string, occurrenceDate?: string, clientDate?: string) => Promise<Task>;
  unclaimTask: (id: string) => Promise<any>;
  adjustTaskPoints: (id: string, data: { points_awarded: number; notes?: string }) => Promise<Task>;
  archiveTask: (id: string, options?: { allInGroup?: boolean }) => Promise<Task>;
  deleteTask: (id: string, options?: { allInGroup?: boolean }) => Promise<void>;
  triggerGoogleSync: () => Promise<{ success: boolean; eventsSynced: number }>;
  viewingTimezone: string;
  setViewingTimezone: (tz: string) => void;
  isTimezonePickerOpen: boolean;
  openTimezonePicker: () => void;
  closeTimezonePicker: () => void;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { user, memberProfile, refreshProfile } = useAuth();
  const { family, members, fetchFamilyData } = useFamily();

  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'week';
    }
    return 'month';
  });
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventModalInitialDate, setEventModalInitialDate] = useState<Date | null>(null);
  
  // Add Choice Modal (+ popup with Event vs Task)
  const [isAddChoiceModalOpen, setIsAddChoiceModalOpen] = useState(false);
  const [addChoiceInitialDate, setAddChoiceInitialDate] = useState<Date | null>(null);

  // Task Modal state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalInitialDate, setTaskModalInitialDate] = useState<Date | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [navigationDirection, setNavigationDirection] = useState<number>(0);

  // Timezone state: Viewing Timezone (top nav badge) defaults to household Main Timezone
  const [viewingTimezone, setViewingTimezoneState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('familycal_viewing_timezone');
      if (saved) return saved;
    }
    return 'Australia/Melbourne';
  });
  const [isTimezonePickerOpen, setIsTimezonePickerOpen] = useState(false);

  // Keep viewing timezone aligned with family setting if user hasn't explicitly set a custom one
  useEffect(() => {
    if (family?.timezone && typeof window !== 'undefined') {
      const saved = localStorage.getItem('familycal_viewing_timezone');
      if (!saved) {
        setViewingTimezoneState(family.timezone);
      }
    }
  }, [family?.timezone]);

  const setViewingTimezone = useCallback((tz: string) => {
    setViewingTimezoneState(tz);
    if (typeof window !== 'undefined') {
      localStorage.setItem('familycal_viewing_timezone', tz);
    }
  }, []);

  const openTimezonePicker = useCallback(() => setIsTimezonePickerOpen(true), []);
  const closeTimezonePicker = useCallback(() => setIsTimezonePickerOpen(false), []);

  const goToPreviousPeriod = useCallback(() => {
    setNavigationDirection(-1);
    setCurrentDate((prev) => {
      if (viewMode === 'month') return subMonths(prev, 1);
      if (viewMode === 'week') return subWeeks(prev, 1);
      if (viewMode === 'day') return subDays(prev, 1);
      return subMonths(prev, 1);
    });
  }, [viewMode]);

  const goToNextPeriod = useCallback(() => {
    setNavigationDirection(1);
    setCurrentDate((prev) => {
      if (viewMode === 'month') return addMonths(prev, 1);
      if (viewMode === 'week') return addWeeks(prev, 1);
      if (viewMode === 'day') return addDays(prev, 1);
      return addMonths(prev, 1);
    });
  }, [viewMode]);

  const goToToday = useCallback(() => {
    setNavigationDirection(0);
    setCurrentDate(new Date());
  }, []);

  // Automatic Device Reminder Scheduler: checks and fires real device notifications on due reminders
  // only to members involved in the Event or Task using the household's authoritative timezone
  useTaskReminderScheduler(events, tasks, user, memberProfile, members, family?.timezone || 'Australia/Melbourne');

  // Deep-link handler: open event modal if ?eventId=... is in URL
  useEffect(() => {
    if (typeof window === 'undefined' || events.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const targetEventId = params.get('eventId');
    if (targetEventId) {
      const match = events.find((e) => e.id === targetEventId);
      if (match) {
        try {
          const d = new Date(match.start_time);
          if (!isNaN(d.getTime())) {
            setCurrentDate(d);
            setSelectedCalendarDate(d);
          }
        } catch {}
        setSelectedEvent(match);
        setIsEventModalOpen(true);
        // Clean URL parameter without reload
        const url = new URL(window.location.href);
        url.searchParams.delete('eventId');
        window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''));
      }
    }
  }, [events]);

  // Synchronize member layer filter when members load
  useEffect(() => {
    if (members.length > 0) {
      setSelectedMemberIds((prev) => {
        if (prev.length === 0) {
          return members.filter((m) => m.is_active === 1).map((m) => m.id);
        }
        return prev;
      });
    }
  }, [members]);

  const fetchTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      return;
    }
    try {
      const data = await api.getTasks();
      setTasks(data);
    } catch (err) {
      console.warn('Tasks fetch warning:', err);
    }
  }, [user]);

  const fetchCalendarData = useCallback(async () => {
    if (!user) {
      setCalendars([]);
      setEvents([]);
      setEventTypes([]);
      setTasks([]);
      return;
    }

    setIsLoading(true);
    try {
      const [calsRes, evtsRes, gAccountsRes, eventTypesRes, tasksRes] = await Promise.all([
        api.getCalendars(),
        api.getEvents(),
        api.getGoogleAccounts().catch(() => []),
        api.getEventTypes().catch(() => []),
        api.getTasks().catch(() => []),
      ]);

      const validCals = calsRes.filter(
        (c) => c.name !== 'Family Hub' && c.name.toLowerCase() !== 'family hub'
      );

      setCalendars(validCals);
      setEvents(evtsRes);
      setGoogleAccounts(gAccountsRes);
      setEventTypes(eventTypesRes);
      setTasks(tasksRes);

      // Default select all calendars initially if not set
      setSelectedCalendarIds((prev) => {
        if (prev.length === 0 && validCals.length > 0) {
          return validCals.map((c) => c.id);
        }
        return prev;
      });

      if (gAccountsRes.length > 0 && gAccountsRes[0].last_synced_at) {
        setLastSyncedAt(gAccountsRes[0].last_synced_at);
      }
    } catch (err) {
      console.warn('Calendar data fetch warning:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  // Compute filtered events based on member layer selection and calendar checkbox selection
  const filteredEvents = events.filter((evt) => {
    // 1. Calendar selection filter: Event's calendar must be enabled
    if (selectedCalendarIds.length > 0 && !selectedCalendarIds.includes(evt.calendar_id)) {
      return false;
    }

    // 2. Member filter:
    let rawIds = evt.assigned_member_ids;
    let assignedIds: string[] = [];
    if (Array.isArray(rawIds)) {
      assignedIds = rawIds;
    } else if (typeof rawIds === 'string') {
      try {
        assignedIds = JSON.parse(rawIds);
      } catch {
        assignedIds = [];
      }
    }

    // If event has assigned members, it is visible if ANY of those members are selected
    if (assignedIds.length > 0) {
      return assignedIds.some((id) => selectedMemberIds.includes(id));
    }

    // If event has a single member_id
    if ((evt as any).member_id) {
      return selectedMemberIds.includes((evt as any).member_id);
    }

    // If event has NO assigned members (e.g. non-login calendar layers like Birthdays, Bin Calendar, Public Holidays):
    // It is shown whenever its calendar layer is enabled!
    return true;
  });

  const openAddChoiceModal = (initialDate?: Date) => {
    setAddChoiceInitialDate(initialDate || selectedCalendarDate || currentDate);
    setIsAddChoiceModalOpen(true);
  };

  const closeAddChoiceModal = () => {
    setIsAddChoiceModalOpen(false);
    setAddChoiceInitialDate(null);
  };

  const openCreateEventModal = (initialDate?: Date) => {
    setSelectedEvent(null);
    setEventModalInitialDate(initialDate || selectedCalendarDate || currentDate);
    setIsEventModalOpen(true);
  };

  const openEditEventModal = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventModalInitialDate(new Date(event.start_time));
    setIsEventModalOpen(true);
  };

  const closeEventModal = () => {
    setIsEventModalOpen(false);
    setSelectedEvent(null);
    setEventModalInitialDate(null);
  };

  const openCreateTaskModal = (initialDate?: Date) => {
    setEditingTask(null);
    setTaskModalInitialDate(initialDate || selectedCalendarDate || currentDate);
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setTaskModalInitialDate(task.due_date ? new Date(task.due_date) : new Date());
    setIsTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    setIsTaskModalOpen(false);
    setEditingTask(null);
    setTaskModalInitialDate(null);
  };

  const toggleCalendarSelection = (id: string) => {
    setSelectedCalendarIds((prev) =>
      prev.includes(id) ? prev.filter((calId) => calId !== id) : [...prev, id]
    );
  };

  const toggleMemberFilter = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  const selectAllMembers = () => {
    setSelectedMemberIds(members.filter((m) => m.is_active === 1).map((m) => m.id));
  };

  const deselectAllMembers = () => {
    setSelectedMemberIds([]);
  };

  const selectAllCalendars = () => {
    setSelectedCalendarIds(calendars.map((c) => c.id));
  };

  const deselectAllCalendars = () => {
    setSelectedCalendarIds([]);
  };

  const createEvent = async (data: Partial<CalendarEvent>) => {
    const created = await api.createEvent(data);
    await fetchCalendarData();
    return created;
  };

  const updateEvent = async (id: string, data: Partial<CalendarEvent>) => {
    const updated = await api.updateEvent(id, data);
    await fetchCalendarData();
    return updated;
  };

  const deleteEvent = async (id: string) => {
    await api.deleteEvent(id);
    await fetchCalendarData();
  };

  const createCalendar = async (data: { name: string; color?: string; description?: string; member_id?: string | null }) => {
    const created = await api.createCalendar(data);
    await fetchCalendarData();
    setSelectedCalendarIds((prev) => [...prev, created.id]);
    return created;
  };

  const updateCalendar = async (id: string, data: Partial<Calendar>) => {
    const updated = await api.updateCalendar(id, data);
    await fetchCalendarData();
    return updated;
  };

  const deleteCalendar = async (id: string) => {
    await api.deleteCalendar(id);
    await fetchCalendarData();
  };

  const createEventType = async (data: { name: string; color: string; icon?: string }) => {
    const created = await api.createEventType(data);
    await fetchCalendarData();
    return created;
  };

  const updateEventType = async (id: string, data: Partial<EventType>) => {
    const updated = await api.updateEventType(id, data);
    await fetchCalendarData();
    return updated;
  };

  const deleteEventType = async (id: string) => {
    await api.deleteEventType(id);
    await fetchCalendarData();
  };

  const createTask = async (data: Partial<Task>) => {
    const created = await api.createTask(data);
    await fetchTasks();
    await Promise.all([fetchFamilyData().catch(() => {}), refreshProfile().catch(() => {})]);
    return created;
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    const updated = await api.updateTask(id, data);
    await fetchTasks();
    await Promise.all([fetchFamilyData().catch(() => {}), refreshProfile().catch(() => {})]);
    return updated;
  };

  const toggleTask = async (id: string, occurrenceDate?: string, clientDate?: string) => {
    const householdTodayStr = getHouseholdTodayDateString(family?.timezone);
    const updated = await api.toggleTask(id, occurrenceDate, clientDate || householdTodayStr);
    await fetchTasks();
    await Promise.all([fetchFamilyData().catch(() => {}), refreshProfile().catch(() => {})]);
    return updated;
  };

  const claimTask = async (id: string, occurrenceDate?: string, clientDate?: string) => {
    const householdTodayStr = getHouseholdTodayDateString(family?.timezone);
    const claimed = await api.claimTask(id, occurrenceDate, clientDate || householdTodayStr);
    await fetchTasks();
    await Promise.all([fetchFamilyData().catch(() => {}), refreshProfile().catch(() => {})]);
    return claimed;
  };

  const unclaimTask = async (id: string) => {
    const res = await api.unclaimTask(id);
    await fetchTasks();
    await Promise.all([fetchFamilyData().catch(() => {}), refreshProfile().catch(() => {})]);
    return res;
  };

  const adjustTaskPoints = async (id: string, data: { points_awarded: number; notes?: string }) => {
    const updated = await api.adjustTaskPoints(id, data);
    await fetchTasks();
    await Promise.all([fetchFamilyData().catch(() => {}), refreshProfile().catch(() => {})]);
    return updated;
  };

  const archiveTask = async (id: string, options?: { allInGroup?: boolean }) => {
    const updated = await api.archiveTask(id, options);
    await fetchTasks();
    return updated;
  };

  const deleteTask = async (id: string, options?: { allInGroup?: boolean }) => {
    const targetTask = tasks.find((t) => t.id === id);
    const taskGroupId = targetTask?.task_group_id;

    // Optimistically remove immediately from local state for instant UI update
    setTasks((prev) =>
      prev.filter((t) => {
        if (t.id === id || t.parent_task_id === id) return false;
        if (options?.allInGroup && taskGroupId && t.task_group_id === taskGroupId) return false;
        return true;
      })
    );

    try {
      await api.deleteTask(id, options);
    } finally {
      await fetchTasks();
      await Promise.all([fetchFamilyData().catch(() => {}), refreshProfile().catch(() => {})]);
    }
  };

  const triggerGoogleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await api.syncGoogle();
      setLastSyncedAt(res.syncedAt);
      await fetchCalendarData();
      return res;
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <CalendarContext.Provider
      value={{
        calendars,
        events,
        filteredEvents,
        eventTypes,
        tasks,
        currentDate,
        selectedCalendarDate,
        viewMode,
        selectedEvent,
        isEventModalOpen,
        eventModalInitialDate,
        isAddChoiceModalOpen,
        addChoiceInitialDate,
        isTaskModalOpen,
        taskModalInitialDate,
        editingTask,
        selectedCalendarIds,
        selectedMemberIds,
        isSyncing,
        lastSyncedAt,
        googleAccounts,
        isLoading,
        navigationDirection,
        setCurrentDate,
        setSelectedCalendarDate,
        setViewMode,
        goToPreviousPeriod,
        goToNextPeriod,
        goToToday,
        openAddChoiceModal,
        closeAddChoiceModal,
        openCreateEventModal,
        openEditEventModal,
        closeEventModal,
        openCreateTaskModal,
        openEditTaskModal,
        closeTaskModal,
        toggleCalendarSelection,
        toggleMemberFilter,
        selectAllMembers,
        deselectAllMembers,
        selectAllCalendars,
        deselectAllCalendars,
        fetchCalendarData,
        fetchTasks,
        createEvent,
        updateEvent,
        deleteEvent,
        createCalendar,
        updateCalendar,
        deleteCalendar,
        createEventType,
        updateEventType,
        deleteEventType,
        createTask,
        updateTask,
        toggleTask,
        claimTask,
        unclaimTask,
        adjustTaskPoints,
        archiveTask,
        deleteTask,
        triggerGoogleSync,
        viewingTimezone,
        setViewingTimezone,
        isTimezonePickerOpen,
        openTimezonePicker,
        closeTimezonePicker,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider');
  }
  return context;
}
