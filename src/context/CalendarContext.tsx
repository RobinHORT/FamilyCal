import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import {
  Calendar,
  CalendarEvent,
  EventType,
  CalendarViewMode,
  GoogleAccount,
  Task,
} from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { useTaskReminderScheduler } from '../hooks/useTaskReminderScheduler';

interface CalendarContextType {
  calendars: Calendar[];
  events: CalendarEvent[];
  filteredEvents: CalendarEvent[];
  eventTypes: EventType[];
  tasks: Task[];
  filteredTasks: Task[];
  currentDate: Date;
  selectedCalendarDate: Date;
  viewMode: CalendarViewMode;
  selectedEvent: CalendarEvent | null;
  isEventModalOpen: boolean;
  eventModalInitialDate: Date | null;
  
  // Add Choice Modal (+ popup with Event vs Task)
  isAddChoiceModalOpen: boolean;
  addChoiceInitialDate: Date | null;
  openAddChoiceModal: (initialDate?: Date) => void;
  closeAddChoiceModal: () => void;

  // Task Modal state
  isTaskModalOpen: boolean;
  taskModalInitialDate: Date | null;
  editingTask: Task | null;
  openCreateTaskModal: (initialDate?: Date) => void;
  openEditTaskModal: (task: Task) => void;
  closeTaskModal: () => void;

  selectedCalendarIds: string[];
  selectedMemberIds: string[];
  isSyncing: boolean;
  lastSyncedAt: string | null;
  googleAccounts: GoogleAccount[];
  isLoading: boolean;
  navigationDirection: number;
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>;
  setSelectedCalendarDate: (date: Date) => void;
  setViewMode: (mode: CalendarViewMode) => void;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  setIsEventModalOpen: (open: boolean) => void;
  openCreateEventModal: (initialDate?: Date) => void;
  openEditEventModal: (event: CalendarEvent) => void;
  closeEventModal: () => void;
  setSelectedCalendarIds: React.Dispatch<React.SetStateAction<string[]>>;
  toggleCalendarSelection: (calendarId: string) => void;
  setSelectedMemberIds: React.Dispatch<React.SetStateAction<string[]>>;
  toggleMemberFilter: (memberId: string) => void;
  selectAllMembers: () => void;
  deselectAllMembers: () => void;
  selectAllCalendars: () => void;
  deselectAllCalendars: () => void;
  goToPreviousPeriod: () => void;
  goToNextPeriod: () => void;
  goToToday: () => void;
  fetchCalendarData: () => Promise<void>;
  createEvent: (data: Partial<CalendarEvent>) => Promise<CalendarEvent>;
  updateEvent: (id: string, data: Partial<CalendarEvent>) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
  createCalendar: (data: Partial<Calendar>) => Promise<Calendar>;
  updateCalendar: (id: string, data: Partial<Calendar>) => Promise<Calendar>;
  deleteCalendar: (id: string) => Promise<void>;
  createEventType: (data: Partial<EventType>) => Promise<EventType>;
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
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
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

  // Automatic Device Reminder Scheduler
  useTaskReminderScheduler(events, tasks, user, memberProfile, members);

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
          setCurrentDate(d);
          setSelectedEvent(match);
          setIsEventModalOpen(true);
        } catch {}
      }
    }
  }, [events]);

  const fetchCalendarData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [calsRes, evtsRes, typesRes, tasksRes, googleRes] = await Promise.all([
        api.getCalendars(),
        api.getEvents(),
        api.getEventTypes(),
        api.getTasks(),
        api.getGoogleAccounts().catch(() => []),
      ]);
      setCalendars(calsRes);
      setEvents(evtsRes);
      setEventTypes(typesRes);
      setTasks(tasksRes);
      setGoogleAccounts(googleRes);

      // Initialize selected calendars if empty
      setSelectedCalendarIds((prev) => {
        if (prev.length === 0 && calsRes.length > 0) {
          return calsRes.map((c: Calendar) => c.id);
        }
        return prev;
      });

      // Initialize selected members to all active members by default
      setSelectedMemberIds((prev) => {
        if (prev.length === 0 && members.length > 0) {
          return members.filter((m) => m.is_active !== 0).map((m) => m.id);
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to fetch calendar data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, members]);

  // When members list is loaded or updated, make sure all active members are included in filter
  useEffect(() => {
    if (members && members.length > 0) {
      setSelectedMemberIds((prev) => {
        if (prev.length === 0) {
          return members.filter((m) => m.is_active !== 0).map((m) => m.id);
        }
        return prev;
      });
    }
  }, [members]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const toggleCalendarSelection = useCallback((calendarId: string) => {
    setSelectedCalendarIds((prev) =>
      prev.includes(calendarId) ? prev.filter((id) => id !== calendarId) : [...prev, calendarId]
    );
  }, []);

  const toggleMemberFilter = useCallback((memberId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  }, []);

  const selectAllMembers = useCallback(() => {
    setSelectedMemberIds(members.filter((m) => m.is_active !== 0).map((m) => m.id));
  }, [members]);

  const deselectAllMembers = useCallback(() => {
    setSelectedMemberIds([]);
  }, []);

  const selectAllCalendars = useCallback(() => {
    setSelectedCalendarIds(calendars.map((c) => c.id));
  }, [calendars]);

  const deselectAllCalendars = useCallback(() => {
    setSelectedCalendarIds([]);
  }, []);

  const openCreateEventModal = useCallback((initialDate?: Date) => {
    setSelectedEvent(null);
    setEventModalInitialDate(initialDate || new Date());
    setIsEventModalOpen(true);
  }, []);

  const openEditEventModal = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventModalInitialDate(null);
    setIsEventModalOpen(true);
  }, []);

  const closeEventModal = useCallback(() => {
    setIsEventModalOpen(false);
    setSelectedEvent(null);
    setEventModalInitialDate(null);
  }, []);

  const openAddChoiceModal = useCallback((initialDate?: Date) => {
    setAddChoiceInitialDate(initialDate || new Date());
    setIsAddChoiceModalOpen(true);
  }, []);

  const closeAddChoiceModal = useCallback(() => {
    setIsAddChoiceModalOpen(false);
    setAddChoiceInitialDate(null);
  }, []);

  const openCreateTaskModal = useCallback((initialDate?: Date) => {
    setEditingTask(null);
    setTaskModalInitialDate(initialDate || new Date());
    setIsTaskModalOpen(true);
  }, []);

  const openEditTaskModal = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskModalInitialDate(null);
    setIsTaskModalOpen(true);
  }, []);

  const closeTaskModal = useCallback(() => {
    setIsTaskModalOpen(false);
    setEditingTask(null);
    setTaskModalInitialDate(null);
  }, []);

  const createEvent = async (data: Partial<CalendarEvent>) => {
    const newEvent = await api.createEvent(data);
    setEvents((prev) => [...prev, newEvent]);
    return newEvent;
  };

  const updateEvent = async (id: string, data: Partial<CalendarEvent>) => {
    const updated = await api.updateEvent(id, data);
    setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
    return updated;
  };

  const deleteEvent = async (id: string) => {
    await api.deleteEvent(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const createCalendar = async (data: Partial<Calendar>) => {
    const newCal = await api.createCalendar(data as any);
    setCalendars((prev) => [...prev, newCal]);
    setSelectedCalendarIds((prev) => [...prev, newCal.id]);
    return newCal;
  };

  const updateCalendar = async (id: string, data: Partial<Calendar>) => {
    const updated = await api.updateCalendar(id, data);
    setCalendars((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  };

  const deleteCalendar = async (id: string) => {
    await api.deleteCalendar(id);
    setCalendars((prev) => prev.filter((c) => c.id !== id));
    setSelectedCalendarIds((prev) => prev.filter((calId) => calId !== id));
  };

  const createEventType = async (data: Partial<EventType>) => {
    const newType = await api.createEventType(data as any);
    setEventTypes((prev) => [...prev, newType]);
    return newType;
  };

  const updateEventType = async (id: string, data: Partial<EventType>) => {
    const updated = await api.updateEventType(id, data);
    setEventTypes((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return updated;
  };

  const deleteEventType = async (id: string) => {
    await api.deleteEventType(id);
    setEventTypes((prev) => prev.filter((t) => t.id !== id));
  };

  const createTask = async (data: Partial<Task>) => {
    const newTask = await api.createTask(data);
    setTasks((prev) => [...prev, newTask]);
    return newTask;
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    const updated = await api.updateTask(id, data);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return updated;
  };

  const toggleTask = async (id: string, occurrenceDate?: string) => {
    const updated = await api.toggleTask(id, occurrenceDate);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    await refreshProfile();
    return updated;
  };

  const claimTask = async (id: string, occurrenceDate?: string) => {
    const updated = await api.claimTask(id, occurrenceDate);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    await refreshProfile();
    return updated;
  };

  const unclaimTask = async (id: string) => {
    const result = await api.unclaimTask(id);
    await fetchCalendarData();
    return result;
  };

  const adjustTaskPoints = async (id: string, data: { points_awarded: number; notes?: string }) => {
    const updated = await api.adjustTaskPoints(id, data);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    await refreshProfile();
    return updated;
  };

  const archiveTask = async (id: string, options?: { allInGroup?: boolean }) => {
    const updated = await api.archiveTask(id, options);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return updated;
  };

  const deleteTask = async (id: string, options?: { allInGroup?: boolean }) => {
    await api.deleteTask(id, options);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const triggerGoogleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await api.syncGoogle();
      setLastSyncedAt(new Date().toISOString());
      await fetchCalendarData();
      return res;
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter events based on selected calendars AND assigned member filters
  const filteredEvents = events.filter((evt) => {
    // 1. Check if calendar is selected
    const calSelected = selectedCalendarIds.includes(evt.calendar_id);
    if (!calSelected) return false;

    // 2. Check assigned member filters
    const assignedIds = Array.isArray(evt.assigned_member_ids) ? evt.assigned_member_ids : [];
    if (assignedIds.length === 0) {
      return true;
    }

    return assignedIds.some((mId) => selectedMemberIds.includes(mId));
  });

  // Filter tasks based on assigned member filters
  const filteredTasks = tasks.filter((task) => {
    if (task.is_archived) return false;
    const assignedIds: string[] = Array.isArray(task.assigned_member_ids)
      ? task.assigned_member_ids
      : (task.assigned_member_id ? [task.assigned_member_id] : []);

    if (assignedIds.length === 0) return true;
    return assignedIds.some((mId) => selectedMemberIds.includes(mId));
  });

  return (
    <CalendarContext.Provider
      value={{
        calendars,
        events,
        filteredEvents,
        eventTypes,
        tasks,
        filteredTasks,
        currentDate,
        selectedCalendarDate,
        viewMode,
        selectedEvent,
        isEventModalOpen,
        eventModalInitialDate,
        isAddChoiceModalOpen,
        addChoiceInitialDate,
        openAddChoiceModal,
        closeAddChoiceModal,
        isTaskModalOpen,
        taskModalInitialDate,
        editingTask,
        openCreateTaskModal,
        openEditTaskModal,
        closeTaskModal,
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
        setSelectedEvent,
        setIsEventModalOpen,
        openCreateEventModal,
        openEditEventModal,
        closeEventModal,
        setSelectedCalendarIds,
        toggleCalendarSelection,
        setSelectedMemberIds,
        toggleMemberFilter,
        selectAllMembers,
        deselectAllMembers,
        selectAllCalendars,
        deselectAllCalendars,
        goToPreviousPeriod,
        goToNextPeriod,
        goToToday,
        fetchCalendarData,
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
