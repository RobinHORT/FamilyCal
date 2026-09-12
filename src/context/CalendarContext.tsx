import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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
  selectedCalendarIds: string[]; // for multi-calendar toggle
  isSyncing: boolean;
  lastSyncedAt: string | null;
  googleAccounts: GoogleAccount[];
  isLoading: boolean;
  setCurrentDate: (d: Date) => void;
  setViewMode: (v: CalendarViewMode) => void;
  openCreateEventModal: (initialDate?: Date) => void;
  openEditEventModal: (event: CalendarEvent) => void;
  closeEventModal: () => void;
  toggleCalendarSelection: (id: string) => void;
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
  const { selectedMemberFilter } = useFamily();

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

      setCalendars(calsRes);
      setEvents(evtsRes);
      setGoogleAccounts(gAccountsRes);
      setEventTypes(eventTypesRes);

      // Default select all calendars initially if not set
      setSelectedCalendarIds((prev) => {
        if (prev.length === 0 && calsRes.length > 0) {
          return calsRes.map((c) => c.id);
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

  // Compute filtered events based on member filter and calendar checkbox selection
  const filteredEvents = events.filter((evt) => {
    // 1. Calendar selection filter
    if (selectedCalendarIds.length > 0 && !selectedCalendarIds.includes(evt.calendar_id)) {
      return false;
    }
    // 2. Member filter
    if (selectedMemberFilter) {
      if (!evt.assigned_member_ids || !evt.assigned_member_ids.includes(selectedMemberFilter)) {
        return false;
      }
    }
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
        isSyncing,
        lastSyncedAt,
        googleAccounts,
        isLoading,
        setCurrentDate,
        setViewMode,
        openCreateEventModal,
        openEditEventModal,
        closeEventModal,
        toggleCalendarSelection,
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
