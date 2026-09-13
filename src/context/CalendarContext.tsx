import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { subMonths, addMonths, subWeeks, addWeeks, subDays, addDays } from 'date-fns';
import { Calendar, CalendarEvent, CalendarViewMode, GoogleAccount, EventType } from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useFamily } from './FamilyContext';

interface CalendarContextType {
  calendars: Calendar[];
  events: CalendarEvent[];
  filteredEvents: CalendarEvent[];
  eventTypes: EventType[];
  currentDate: Date;
  viewMode: CalendarViewMode;
  selectedEvent: CalendarEvent | null;
  isEventModalOpen: boolean;
  eventModalInitialDate: Date | null;
  selectedCalendarIds: string[]; // for multi-calendar layer toggle
  selectedMemberIds: string[]; // for multi-member layer toggle
  isSyncing: boolean;
  lastSyncedAt: string | null;
  googleAccounts: GoogleAccount[];
  isLoading: boolean;
  navigationDirection: number;
  setCurrentDate: (d: Date) => void;
  setViewMode: (v: CalendarViewMode) => void;
  goToPreviousPeriod: () => void;
  goToNextPeriod: () => void;
  goToToday: () => void;
  openCreateEventModal: (initialDate?: Date) => void;
  openEditEventModal: (event: CalendarEvent) => void;
  closeEventModal: () => void;
  toggleCalendarSelection: (id: string) => void;
  toggleMemberFilter: (id: string) => void;
  selectAllMembers: () => void;
  deselectAllMembers: () => void;
  selectAllCalendars: () => void;
  deselectAllCalendars: () => void;
  fetchCalendarData: () => Promise<void>;
  createEvent: (data: Partial<CalendarEvent>) => Promise<CalendarEvent>;
  updateEvent: (id: string, data: Partial<CalendarEvent>) => Promise<CalendarEvent>;
  deleteEvent: (id: string) => Promise<void>;
  createCalendar: (data: { name: string; color?: string; description?: string; member_id?: string | null }) => Promise<Calendar>;
  updateCalendar: (id: string, data: Partial<Calendar>) => Promise<Calendar>;
  deleteCalendar: (id: string) => Promise<void>;
  createEventType: (data: { name: string; color: string; icon?: string }) => Promise<EventType>;
  updateEventType: (id: string, data: Partial<EventType>) => Promise<EventType>;
  deleteEventType: (id: string) => Promise<void>;
  triggerGoogleSync: () => Promise<{ success: boolean; eventsSynced: number }>;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { members } = useFamily();

  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'week';
    }
    return 'month';
  });
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventModalInitialDate, setEventModalInitialDate] = useState<Date | null>(null);
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

  const fetchCalendarData = useCallback(async () => {
    if (!user) {
      setCalendars([]);
      setEvents([]);
      setEventTypes([]);
      return;
    }

    setIsLoading(true);
    try {
      const [calsRes, evtsRes, gAccountsRes, eventTypesRes] = await Promise.all([
        api.getCalendars(),
        api.getEvents(),
        api.getGoogleAccounts().catch(() => []),
        api.getEventTypes().catch(() => []),
      ]);

      const validCals = calsRes.filter(
        (c) => c.name !== 'Family Hub' && c.name.toLowerCase() !== 'family hub'
      );

      setCalendars(validCals);
      setEvents(evtsRes);
      setGoogleAccounts(gAccountsRes);
      setEventTypes(eventTypesRes);

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
      console.error('Failed to load calendar data:', err);
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

  const openCreateEventModal = (initialDate?: Date) => {
    setSelectedEvent(null);
    setEventModalInitialDate(initialDate || currentDate);
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
        currentDate,
        viewMode,
        selectedEvent,
        isEventModalOpen,
        eventModalInitialDate,
        selectedCalendarIds,
        selectedMemberIds,
        isSyncing,
        lastSyncedAt,
        googleAccounts,
        isLoading,
        navigationDirection,
        setCurrentDate,
        setViewMode,
        goToPreviousPeriod,
        goToNextPeriod,
        goToToday,
        openCreateEventModal,
        openEditEventModal,
        closeEventModal,
        toggleCalendarSelection,
        toggleMemberFilter,
        selectAllMembers,
        deselectAllMembers,
        selectAllCalendars,
        deselectAllCalendars,
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
