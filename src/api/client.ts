import { format } from 'date-fns';
import {
  User,
  Family,
  FamilyMember,
  Calendar,
  CalendarEvent,
  EventType,
  Task,
  BirthdayItem,
  GoogleConfigResponse,
  GoogleAccount,
  GoogleSyncLog,
  SystemStats,
  StockItem,
  StockBarcode,
  ShoppingListItem,
  Reward,
  RewardExchange,
} from '../types';

class ApiError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 2, delayMs = 300): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err: any) {
      const isNetworkError =
        err?.name === 'TypeError' ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('Load failed');
      if (attempt < retries && isNetworkError) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to fetch after retries');
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('yimly_jwt_token');
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetchWithRetry(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMsg = `Request failed (${response.status})`;
    try {
      const errorJson = await response.json();
      errorMsg = errorJson.error || errorJson.message || errorMsg;
    } catch {
      // ignore
    }
    if (response.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/viewer-login')) {
      // Clean up stale token on 401
      localStorage.removeItem('yimly_jwt_token');
    }
    throw new ApiError(errorMsg, response.status);
  }

  return response.json();
}

export const api = {
  // Auth
  getSetupStatus: () => fetchJson<{ isSetupComplete: boolean; userCount: number }>('/api/auth/setup-status'),
  
  register: (data: {
    familyName: string;
    name: string;
    email: string;
    password: string;
    color?: string;
    birthday?: string;
  }) => fetchJson<{ user: User; token: string; family: Family }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  login: (data: { email?: string; username?: string; identifier?: string; password: string }) =>
    fetchJson<{ user: User; token: string; family: Family }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email || data.identifier,
        username: data.username || data.identifier,
        loginIdentifier: data.identifier || data.username || data.email,
        password: data.password,
      }),
    }),

  logout: () =>
    fetchJson<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  getMe: () =>
    fetchJson<{ user: User; family: Family; memberProfile?: FamilyMember }>('/api/auth/me'),

  // Viewer & Auth
  getViewerInfo: (householdName?: string) =>
    fetchJson<{ familyId?: string; familyName?: string; hasViewerPassword?: boolean; found?: boolean }>(
      `/api/viewer/info${householdName ? `?householdName=${encodeURIComponent(householdName)}` : ''}`
    ),

  viewerLogin: (householdName: string, password?: string) =>
    fetchJson<{ user: User; token: string; family: Family }>('/api/auth/viewer-login', {
      method: 'POST',
      body: JSON.stringify({ householdName, username: householdName, password }),
    }),

  // Family & Members
  getFamily: () => fetchJson<{ family: Family; members: FamilyMember[] }>('/api/family'),
  
  suggestUsername: (name: string, excludeUserId?: string) =>
    fetchJson<{ username: string }>(`/api/family/suggest-username?name=${encodeURIComponent(name)}${excludeUserId ? `&excludeUserId=${encodeURIComponent(excludeUserId)}` : ''}`),

  updateFamily: (data: { name?: string; timezone?: string; viewerPassword?: string; colorSoftness?: number; color_softness?: number }) =>
    fetchJson<Family>('/api/family', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  createMember: (data: Partial<FamilyMember> & { login?: { enabled: boolean; username?: string; password?: string } }) =>
    fetchJson<FamilyMember>('/api/family/members', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMember: (id: string, data: Partial<FamilyMember>) =>
    fetchJson<FamilyMember>(`/api/family/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  adjustMemberPoints: (id: string, data: { points?: number; delta?: number; notes?: string }) =>
    fetchJson<{ success: boolean; member: FamilyMember; points: number }>(`/api/family/members/${id}/points`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  manageMemberLogin: (id: string, data: { enabled: boolean; username?: string; password?: string }) =>
    fetchJson<{ success: boolean; message: string; has_login: number; user_is_active: number; user_username?: string }>(
      `/api/family/members/${id}/login`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  deleteMember: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/family/members/${id}`, {
      method: 'DELETE',
    }),

  updateMemberPermissions: (id: string, data: { permissions?: Partial<import('../types').UserPermissions>; resetToDefaults?: boolean }) =>
    fetchJson<FamilyMember>(`/api/family/members/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Calendars
  getCalendars: () => fetchJson<Calendar[]>('/api/calendars'),

  createCalendar: (data: { name: string; color?: string; description?: string; member_id?: string | null }) =>
    fetchJson<Calendar>('/api/calendars', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCalendar: (id: string, data: Partial<Calendar>) =>
    fetchJson<Calendar>(`/api/calendars/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteCalendar: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/calendars/${id}`, {
      method: 'DELETE',
    }),

  // Events
  getEvents: (params?: { start?: string; end?: string; member_id?: string; calendar_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.start) query.set('start', params.start);
    if (params?.end) query.set('end', params.end);
    if (params?.member_id) query.set('member_id', params.member_id);
    if (params?.calendar_id) query.set('calendar_id', params.calendar_id);
    return fetchJson<CalendarEvent[]>(`/api/events?${query.toString()}`);
  },

  createEvent: (data: Partial<CalendarEvent>) =>
    fetchJson<CalendarEvent>('/api/events', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateEvent: (id: string, data: Partial<CalendarEvent>) =>
    fetchJson<CalendarEvent>(`/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteEvent: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/events/${id}`, {
      method: 'DELETE',
    }),

  // Event Types & Preassigned Badge Colours
  getEventTypes: () => fetchJson<EventType[]>('/api/event-types'),

  createEventType: (data: { name: string; color: string; icon?: string }) =>
    fetchJson<EventType>('/api/event-types', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateEventType: (id: string, data: Partial<EventType>) =>
    fetchJson<EventType>(`/api/event-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteEventType: (id: string) =>
    fetchJson<{ success: boolean; message?: string }>(`/api/event-types/${id}`, {
      method: 'DELETE',
    }),

  // Tasks
  getTasks: () => fetchJson<Task[]>('/api/tasks'),

  createTask: (data: Partial<Task>) =>
    fetchJson<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTask: (id: string, data: Partial<Task>) =>
    fetchJson<Task>(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  toggleTask: (id: string, occurrenceDate?: string, clientDate?: string) =>
    fetchJson<Task>(`/api/tasks/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({
        occurrence_date: occurrenceDate,
        client_date: clientDate || format(new Date(), 'yyyy-MM-dd'),
      }),
    }),

  claimTask: (id: string, occurrenceDate?: string, clientDate?: string) =>
    fetchJson<Task>(`/api/tasks/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({
        occurrence_date: occurrenceDate,
        client_date: clientDate || format(new Date(), 'yyyy-MM-dd'),
      }),
    }),

  unclaimTask: (id: string) =>
    fetchJson<{ success: boolean; message?: string } | Task>(`/api/tasks/${id}/unclaim`, {
      method: 'POST',
    }),

  adjustTaskPoints: (id: string, data: { points_awarded: number; notes?: string }) =>
    fetchJson<Task>(`/api/tasks/${id}/adjust-points`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  archiveTask: (id: string, options?: { allInGroup?: boolean }) =>
    fetchJson<Task>(`/api/tasks/${id}/archive${options?.allInGroup ? '?allInGroup=true' : ''}`, {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined,
    }),

  deleteTask: (id: string, options?: { allInGroup?: boolean }) =>
    fetchJson<{ success: boolean }>(`/api/tasks/${id}${options?.allInGroup ? '?allInGroup=true' : ''}`, {
      method: 'DELETE',
    }),

  // Birthdays
  getBirthdays: () => fetchJson<BirthdayItem[]>('/api/birthdays'),

  // Google Calendar Integration
  getGoogleConfig: () => fetchJson<GoogleConfigResponse>('/api/calendar/google/config'),
  
  getGoogleAuthUrl: () => fetchJson<{ url: string; state: string }>('/api/calendar/google/auth-url?json=true'),

  getGoogleAccounts: () => fetchJson<GoogleAccount[]>('/api/calendar/google/accounts'),

  discoverGoogleCalendars: (accountId?: string) =>
    fetchJson<{ success: boolean; count: number; calendars: any[] }>('/api/calendar/google/discover', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId }),
    }),

  syncGoogle: (accountId?: string) =>
    fetchJson<{ success: boolean; eventsSynced: number; syncedAt: string }>('/api/calendar/google/sync', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId }),
    }),

  disconnectGoogle: (accountId?: string) =>
    fetchJson<{ success: boolean }>('/api/calendar/google/disconnect', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId }),
    }),

  getGoogleLogs: () => fetchJson<GoogleSyncLog[]>('/api/calendar/google/logs'),

  // System Stats & Export
  getSystemStats: () => fetchJson<SystemStats>('/api/system/stats'),

  // Stock & Inventory
  getStockItems: () => fetchJson<StockItem[]>('/api/stock'),

  getStockItem: (id: string) => fetchJson<StockItem>(`/api/stock/item/${id}`),

  lookupBarcode: (barcode: string) =>
    fetchJson<{ found: boolean; barcode: string; stockItem: StockItem | null; mapping: StockBarcode | null }>(
      `/api/stock/barcode/${encodeURIComponent(barcode)}`
    ),

  createStockItem: (data: Partial<StockItem> & { barcode?: string; brand_or_label?: string }) =>
    fetchJson<StockItem>('/api/stock', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStockItem: (id: string, data: Partial<StockItem>) =>
    fetchJson<StockItem>(`/api/stock/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteStockItem: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/stock/${id}`, {
      method: 'DELETE',
    }),

  adjustStockQuantity: (
    id: string,
    data: {
      action: 'add' | 'open' | 'use' | 'finish' | 'used_up' | 'set' | 'shopping_purchase' | 'consume_opened';
      amount: number;
      barcode?: string;
      expiry_date?: string;
      opened_item_id?: string;
      location?: string;
    }
  ) =>
    fetchJson<StockItem>(`/api/stock/${id}/adjust`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  scanBarcode: (data: {
    barcode: string;
    mode: 'add' | 'open' | 'use' | 'finish' | 'used_up';
    amount?: number;
    expiry_date?: string;
    brand_or_label?: string;
  }) =>
    fetchJson<{
      success: boolean;
      isMapped: boolean;
      barcode: string;
      action?: 'add' | 'open' | 'use' | 'finish' | 'used_up';
      delta?: number;
      stockItem?: StockItem;
      mapping?: StockBarcode;
      message?: string;
    }>('/api/stock/scan', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  addBarcodeMapping: (stockItemId: string, barcode: string, brandOrLabel?: string, deltaPerScan: number = 1) =>
    fetchJson<StockItem>(`/api/stock/${stockItemId}/barcodes`, {
      method: 'POST',
      body: JSON.stringify({
        barcode,
        brand_or_label: brandOrLabel,
        quantity_delta_per_scan: deltaPerScan,
      }),
    }),

  deleteBarcodeMapping: (barcodeId: string) =>
    fetchJson<{ success: boolean }>(`/api/stock/barcodes/${barcodeId}`, {
      method: 'DELETE',
    }),

  // Shopping List
  getShoppingList: () => fetchJson<ShoppingListItem[]>('/api/shopping-list'),

  addShoppingListItem: (data: Partial<ShoppingListItem>) =>
    fetchJson<ShoppingListItem>('/api/shopping-list', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateShoppingListItem: (id: string, data: Partial<ShoppingListItem>) =>
    fetchJson<ShoppingListItem>(`/api/shopping-list/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  toggleShoppingListItem: (id: string) =>
    fetchJson<ShoppingListItem>(`/api/shopping-list/${id}/toggle`, {
      method: 'POST',
    }),

  deleteShoppingListItem: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/shopping-list/${id}`, {
      method: 'DELETE',
    }),

  clearCompletedShoppingList: () =>
    fetchJson<{ success: boolean; count: number }>('/api/shopping-list/clear-completed', {
      method: 'POST',
    }),

  // Rewards
  getRewards: () => fetchJson<Reward[]>('/api/rewards'),

  createReward: (data: { name: string; description?: string; points_cost: number; icon?: string; is_enabled?: boolean }) =>
    fetchJson<Reward>('/api/rewards', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateReward: (id: string, data: Partial<Reward>) =>
    fetchJson<Reward>(`/api/rewards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteReward: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/rewards/${id}`, {
      method: 'DELETE',
    }),

  getRewardExchanges: () => fetchJson<RewardExchange[]>('/api/rewards/exchanges'),

  exchangeReward: (reward_id: string) =>
    fetchJson<{ success: boolean; points: number }>('/api/rewards/exchange', {
      method: 'POST',
      body: JSON.stringify({ reward_id }),
    }),

  fulfillRewardExchange: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/rewards/exchanges/${id}/fulfill`, {
      method: 'POST',
    }),
};
