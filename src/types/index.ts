export type UserRole = 'administrator' | 'adult' | 'child';

export type PermissionKey =
  | 'calendar_view'
  | 'calendar_create'
  | 'calendar_edit'
  | 'calendar_delete'
  | 'calendar_assign'
  | 'event_view'
  | 'event_create'
  | 'event_edit_all'
  | 'event_edit_own'
  | 'event_edit_assigned'
  | 'event_delete_all'
  | 'event_delete_own'
  | 'event_delete_assigned'
  | 'members_view'
  | 'members_manage'
  | 'google_calendar_manage';

export interface UserPermissions {
  calendar_view: boolean;
  calendar_create: boolean;
  calendar_edit: boolean;
  calendar_delete: boolean;
  calendar_assign: boolean;
  event_view: boolean;
  event_create: boolean;
  event_edit_all: boolean;
  event_edit_own: boolean;
  event_edit_assigned: boolean;
  event_delete_all: boolean;
  event_delete_own: boolean;
  event_delete_assigned: boolean;
  members_view: boolean;
  members_manage: boolean;
  google_calendar_manage: boolean;
}

export interface User {
  id: string;
  family_id: string;
  email?: string | null;
  username?: string | null;
  name: string;
  role: UserRole;
  avatar_url?: string;
  color?: string;
  birthday?: string;
  is_active?: number;
  permissions?: UserPermissions;
  isViewer?: boolean;
}

export interface Family {
  id: string;
  name: string;
  timezone: string;
  color_softness?: number;
  colorSoftness?: number;
  has_viewer_password?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id?: string | null;
  name: string;
  role: UserRole;
  color: string;
  avatar_url?: string | null;
  birthday?: string | null;
  is_active: number;
  user_email?: string | null;
  user_username?: string | null;
  user_is_active?: number | null;
  user_permissions?: string | null;
  permissions?: Partial<UserPermissions> | null;
  resolved_permissions?: UserPermissions;
  is_custom_permissions?: boolean;
  has_login?: number | boolean;
  points?: number;
}

export interface Calendar {
  id: string;
  family_id: string;
  member_id?: string | null;
  member_name?: string | null;
  member_color?: string | null;
  name: string;
  color: string;
  description?: string | null;
  is_default: number;
  source: 'yimly' | 'google';
  google_calendar_id?: string | null;
  is_read_only: number;
  sync_enabled: number;
}

export type RecurrenceRule = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type SyncStatus = 'local_only' | 'synced' | 'pending';

export interface EventType {
  id: string;
  family_id: string;
  name: string;
  color: string;
  icon?: string;
  is_default: number | boolean;
}

export interface CalendarEvent {
  id: string;
  family_id: string;
  calendar_id: string;
  calendar_name?: string;
  calendar_source?: 'yimly' | 'google';
  title: string;
  description?: string | null;
  location?: string | null;
  color: string;
  event_type?: string;
  start_time: string; // ISO String
  end_time: string;   // ISO String
  all_day: boolean;
  recurring_rule: RecurrenceRule;
  recurring_until?: string | null;
  assigned_member_ids: string[];
  reminder_minutes?: number | null;
  google_event_id?: string | null;
  google_calendar_id?: string | null;
  sync_status: SyncStatus;
  created_by?: string | null;
  member_color?: string | null;
  member_name?: string | null;
}

export type Priority = 'low' | 'medium' | 'high';
export type TaskRecurrenceRule = 'none' | 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'custom';
export type TaskAssignmentMode = 'assigned' | 'open' | 'everyone';

export interface Task {
  id: string;
  family_id: string;
  task_group_id?: string | null;
  parent_task_id?: string | null;
  assignment_mode?: TaskAssignmentMode;
  claim_limit?: number | null;
  points?: number;
  points_awarded?: number;
  claimed_at?: string | null;
  claimed_by?: string | null;
  title: string;
  description?: string | null;
  due_date: string;
  due_time?: string | null;
  reminder_minutes?: number | null;
  completed: boolean;
  completed_at?: string | null;
  is_archived?: boolean | number;
  assigned_member_id?: string | null;
  assigned_member_ids?: string[];
  member_name?: string | null;
  member_color?: string | null;
  member_avatar?: string | null;
  priority: Priority;
  recurring_rule?: TaskRecurrenceRule | null;
  recurring_interval?: number | null;
  recurring_unit?: 'day' | 'week' | 'month' | null;
  created_at?: string;
  updated_at?: string;
}

export interface BirthdayItem {
  member_id: string;
  name: string;
  role: UserRole;
  color: string;
  avatar_url?: string | null;
  birthday: string;
  next_birthday_date: string;
  days_until: number;
  turning_age?: number;
}

export interface GoogleAccount {
  id: string;
  google_email: string;
  sync_status: string;
  sync_error?: string | null;
  last_synced_at?: string | null;
  created_at: string;
}

export interface GoogleSyncLog {
  id: string;
  sync_type: string;
  status: string;
  events_synced: number;
  details?: string | null;
  created_at: string;
}

export interface GoogleConfigResponse {
  isConfigured: boolean;
  redirectUri: string;
  hasClientId: boolean;
  connectedAccounts: GoogleAccount[];
}

// Stock & Inventory Types
export type ShoppingTriggerMode = 'low_stock' | 'zero_stock' | 'before_expiry' | 'low_stock_and_expiry' | 'none';

export interface OpenedStockItem {
  id: string;
  quantity: number;
  expiry_date?: string | null;
  opened_at: string;
}

export interface StockBarcode {
  id: string;
  family_id: string;
  stock_item_id: string;
  barcode: string;
  brand_or_label?: string | null;
  quantity_delta_per_scan: number;
  created_at: string;
  updated_at: string;
}

export interface StockItem {
  id: string;
  family_id: string;
  name: string; // Canonical stock item name
  category: string;
  quantity: number; // Unopened / sealed stock
  opened_quantity?: number; // Total count of currently opened stock
  opened_items?: OpenedStockItem[]; // Array of opened item records with independent expiry dates
  unit: string;
  low_stock_threshold: number;
  target_stock?: number;
  restock_target?: number;
  shopping_trigger?: ShoppingTriggerMode;
  expiry_days_threshold?: number;
  auto_add_to_shopping?: boolean | number;
  earliest_expiry_date?: string | null;
  location?: string | null;
  notes?: string | null;
  is_favorite?: number | boolean;
  barcodes?: StockBarcode[];
  created_at: string;
  updated_at: string;
}

export interface StockLog {
  id: string;
  family_id: string;
  stock_item_id: string;
  stock_item_name?: string;
  action: 'add' | 'use' | 'adjust' | 'shopping_purchase';
  quantity_changed: number;
  quantity_after: number;
  barcode?: string | null;
  expiry_date?: string | null;
  member_id?: string | null;
  member_name?: string | null;
  created_at: string;
}

export interface ShoppingListItem {
  id: string;
  family_id: string;
  stock_item_id?: string | null;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  is_completed: number | boolean;
  is_auto_generated?: number | boolean;
  completed_at?: string | null;
  completed_by?: string | null;
  added_by?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export const STOCK_UNITS = [
  'packs',
  'bottles',
  'boxes',
  'bags',
  'cans',
  'tubs',
  'jars',
  'cartons',
  'rolls',
  'loaves',
  'pieces',
  'items',
  'kg',
  'g',
  'L',
  'mL',
] as const;

export const STOCK_CATEGORIES = [
  'Dairy & Fridge',
  'Pantry Essentials',
  'Fresh Produce',
  'Bakery',
  'Meat & Seafood',
  'Frozen Foods',
  'Snacks & Treats',
  'Beverages',
  'Household & Cleaning',
  'Personal Care & Health',
  'Baby & Kids',
  'Pet Supplies',
  'Other',
] as const;

export interface SystemStats {
  status: string;
  version: string;
  familyId: string;
  members: number;
  events: number;
  tasks: number;
  calendars: number;
  googleSync: {
    google_email?: string;
    sync_status?: string;
    last_synced_at?: string;
  };
  serverTime: string;
}

export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

export const DEFAULT_MEMBER_PERMISSIONS: UserPermissions = {
  calendar_view: true,
  calendar_create: false,
  calendar_edit: false,
  calendar_delete: false,
  calendar_assign: false,
  event_view: true,
  event_create: true,
  event_edit_own: true,
  event_edit_assigned: true,
  event_edit_all: false,
  event_delete_own: true,
  event_delete_assigned: false,
  event_delete_all: false,
  members_view: true,
  members_manage: false,
  google_calendar_manage: false,
};

export const ADMIN_PERMISSIONS: UserPermissions = {
  calendar_view: true,
  calendar_create: true,
  calendar_edit: true,
  calendar_delete: true,
  calendar_assign: true,
  event_view: true,
  event_create: true,
  event_edit_own: true,
  event_edit_assigned: true,
  event_edit_all: true,
  event_delete_own: true,
  event_delete_assigned: true,
  event_delete_all: true,
  members_view: true,
  members_manage: true,
  google_calendar_manage: true,
};

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
  category: 'calendars' | 'events' | 'family' | 'google';
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Calendars
  {
    key: 'calendar_view',
    label: 'View calendars',
    description: 'View household and assigned calendars',
    category: 'calendars',
  },
  {
    key: 'calendar_create',
    label: 'Create calendars',
    description: 'Create new calendars for the household',
    category: 'calendars',
  },
  {
    key: 'calendar_edit',
    label: 'Edit calendars',
    description: 'Change calendar names, colors, and settings',
    category: 'calendars',
  },
  {
    key: 'calendar_delete',
    label: 'Delete calendars',
    description: 'Delete existing calendars from the household',
    category: 'calendars',
  },
  {
    key: 'calendar_assign',
    label: 'Assign calendars to members',
    description: 'Change calendar member assignments and ownership',
    category: 'calendars',
  },

  // Events
  {
    key: 'event_view',
    label: 'View events',
    description: 'View calendar events across the household',
    category: 'events',
  },
  {
    key: 'event_create',
    label: 'Create events',
    description: 'Create new events on available calendars',
    category: 'events',
  },
  {
    key: 'event_edit_all',
    label: 'Edit all events',
    description: 'Edit any event in the entire household',
    category: 'events',
  },
  {
    key: 'event_edit_assigned',
    label: 'Edit events assigned to me',
    description: 'Edit events where this member is an assigned attendee',
    category: 'events',
  },
  {
    key: 'event_edit_own',
    label: 'Edit own events',
    description: 'Edit events created by this member',
    category: 'events',
  },
  {
    key: 'event_delete_all',
    label: 'Delete all events',
    description: 'Delete any event in the entire household',
    category: 'events',
  },
  {
    key: 'event_delete_assigned',
    label: 'Delete events assigned to me',
    description: 'Delete events where this member is an assigned attendee',
    category: 'events',
  },
  {
    key: 'event_delete_own',
    label: 'Delete own events',
    description: 'Delete events created by this member',
    category: 'events',
  },

  // Family
  {
    key: 'members_view',
    label: 'View family members',
    description: 'View the list of family members and household profile',
    category: 'family',
  },
  {
    key: 'members_manage',
    label: 'Manage family members',
    description: 'Add, edit, remove family members and configure logins/permissions',
    category: 'family',
  },

  // Integrations
  {
    key: 'google_calendar_manage',
    label: 'Manage Google Integrations',
    description: 'Connect Google accounts and manage two-way synchronization',
    category: 'google',
  },
];
