export type PermissionKey =
  | 'calendar_view'
  | 'calendar_create'
  | 'calendar_edit'
  | 'calendar_delete'
  | 'calendar_assign'
  | 'event_view'
  | 'event_create'
  | 'event_edit_own'
  | 'event_edit_assigned'
  | 'event_edit_all'
  | 'event_delete_own'
  | 'event_delete_assigned'
  | 'event_delete_all'
  | 'members_view'
  | 'members_manage'
  | 'google_calendar_manage';

export type UserPermissions = Record<PermissionKey, boolean>;

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  'calendar_view',
  'calendar_create',
  'calendar_edit',
  'calendar_delete',
  'calendar_assign',
  'event_view',
  'event_create',
  'event_edit_own',
  'event_edit_assigned',
  'event_edit_all',
  'event_delete_own',
  'event_delete_assigned',
  'event_delete_all',
  'members_view',
  'members_manage',
  'google_calendar_manage',
];

export const ADULT_MEMBER_PERMISSIONS: UserPermissions = {
  // Calendars
  calendar_view: true,
  calendar_create: true,
  calendar_edit: true,
  calendar_delete: false,
  calendar_assign: false,

  // Events
  event_view: true,
  event_create: true,
  event_edit_own: true,
  event_edit_assigned: true,
  event_edit_all: true,
  event_delete_own: true,
  event_delete_assigned: true,
  event_delete_all: false,

  // Family / Members
  members_view: true,
  members_manage: true,

  // Integrations
  google_calendar_manage: true,
};

export const CHILD_MEMBER_PERMISSIONS: UserPermissions = {
  // Calendars
  calendar_view: true,
  calendar_create: false,
  calendar_edit: false,
  calendar_delete: false,
  calendar_assign: false,

  // Events
  event_view: true,
  event_create: true,
  event_edit_own: true,
  event_edit_assigned: true,
  event_edit_all: false,
  event_delete_own: true,
  event_delete_assigned: false,
  event_delete_all: false,

  // Family / Members
  members_view: true,
  members_manage: false,

  // Integrations
  google_calendar_manage: false,
};

export const DEFAULT_MEMBER_PERMISSIONS: UserPermissions = CHILD_MEMBER_PERMISSIONS;

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

export const PERMISSION_DEFINITIONS: {
  key: PermissionKey;
  label: string;
  description: string;
  category: 'calendars' | 'events' | 'family' | 'google';
}[] = [
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
    key: 'event_edit_own',
    label: 'Edit own events',
    description: 'Edit events created by this member',
    category: 'events',
  },
  {
    key: 'event_edit_assigned',
    label: 'Edit events assigned to me',
    description: 'Edit events where this member is an assigned attendee',
    category: 'events',
  },
  {
    key: 'event_edit_all',
    label: 'Edit all events',
    description: 'Edit any event in the entire household',
    category: 'events',
  },
  {
    key: 'event_delete_own',
    label: 'Delete own events',
    description: 'Delete events created by this member',
    category: 'events',
  },
  {
    key: 'event_delete_assigned',
    label: 'Delete events assigned to me',
    description: 'Delete events where this member is an assigned attendee',
    category: 'events',
  },
  {
    key: 'event_delete_all',
    label: 'Delete all events',
    description: 'Delete any event in the entire household',
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
    description: 'Add, edit, or remove family members in the household',
    category: 'family',
  },

  // Google
  {
    key: 'google_calendar_manage',
    label: 'Manage Google Calendar connections',
    description: 'Connect, disconnect, and manage Google Calendar sync',
    category: 'google',
  },
];

export function resolveUserPermissions(
  role?: string | null,
  rawPermissions?: string | Partial<UserPermissions> | null
): UserPermissions {
  if (role === 'administrator') {
    return { ...ADMIN_PERMISSIONS };
  }

  const baseline = role === 'adult' ? ADULT_MEMBER_PERMISSIONS : CHILD_MEMBER_PERMISSIONS;

  let custom: Partial<UserPermissions> = {};
  if (rawPermissions) {
    if (typeof rawPermissions === 'string') {
      try {
        custom = JSON.parse(rawPermissions);
      } catch {
        custom = {};
      }
    } else if (typeof rawPermissions === 'object') {
      custom = rawPermissions;
    }
  }

  const resolved = {
    ...baseline,
    ...custom,
  };

  // Safe Role-Change Enforcement: A child must NEVER have these keys override to true
  if (role === 'child') {
    resolved.calendar_create = false;
    resolved.calendar_edit = false;
    resolved.calendar_delete = false;
    resolved.calendar_assign = false;
    resolved.members_manage = false;
    resolved.google_calendar_manage = false;
    resolved.event_edit_all = false;
    resolved.event_delete_all = false;
  }

  return resolved;
}

export function isCustomPermissions(
  rawPermissions?: string | Partial<UserPermissions> | null,
  role?: string | null
): boolean {
  if (role === 'administrator') {
    return false;
  }

  if (!rawPermissions) {
    return false;
  }

  const baseline = role === 'adult' ? ADULT_MEMBER_PERMISSIONS : CHILD_MEMBER_PERMISSIONS;
  const resolved = resolveUserPermissions(role, rawPermissions);
  for (const key of ALL_PERMISSION_KEYS) {
    if (resolved[key] !== baseline[key]) {
      return true;
    }
  }

  return false;
}
