import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'yimly_familycal.db');

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency and resilience
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      timezone TEXT DEFAULT 'UTC',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      email TEXT,
      username TEXT,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'administrator',
      avatar_url TEXT,
      color TEXT DEFAULT '#FF4FA3',
      birthday TEXT,
      is_active INTEGER DEFAULT 1,
      permissions TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS family_members (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      user_id TEXT,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'adult', -- administrator, adult, child
      color TEXT DEFAULT '#FF4FA3',
      avatar_url TEXT,
      birthday TEXT,
      is_active INTEGER DEFAULT 1,
      permissions TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS calendars (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      member_id TEXT, -- NULL for shared household calendar, or references family_members(id)
      name TEXT NOT NULL,
      color TEXT DEFAULT '#FF4FA3',
      description TEXT,
      is_default INTEGER DEFAULT 0,
      source TEXT DEFAULT 'yimly', -- 'yimly' | 'google'
      google_calendar_id TEXT,
      is_read_only INTEGER DEFAULT 0,
      sync_enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      color TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      all_day INTEGER DEFAULT 0,
      recurring_rule TEXT DEFAULT 'none', -- none, daily, weekly, monthly, yearly
      recurring_until TEXT,
      assigned_member_ids TEXT DEFAULT '[]', -- JSON array of member IDs
      google_event_id TEXT,
      google_calendar_id TEXT,
      etag TEXT,
      sync_status TEXT DEFAULT 'local_only', -- local_only, synced, pending
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS event_types (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT DEFAULT '⭐',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      due_time TEXT,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      assigned_member_id TEXT,
      priority TEXT DEFAULT 'medium', -- low, medium, high
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_member_id) REFERENCES family_members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS google_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      family_id TEXT NOT NULL,
      google_email TEXT NOT NULL,
      google_user_id TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expiry INTEGER NOT NULL,
      scope TEXT,
      sync_status TEXT DEFAULT 'connected', -- connected, syncing, error
      sync_error TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS google_sync_logs (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      account_id TEXT,
      sync_type TEXT NOT NULL, -- inbound, outbound, full
      status TEXT NOT NULL, -- success, failed, partial
      events_synced INTEGER DEFAULT 0,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      id TEXT PRIMARY KEY,
      state_token TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      family_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_google_deletions (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      google_calendar_id TEXT NOT NULL,
      google_event_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_family_start ON events(family_id, start_time);
    CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);
    CREATE INDEX IF NOT EXISTS idx_events_google_id ON events(google_event_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_family ON tasks(family_id, completed);
    CREATE INDEX IF NOT EXISTS idx_members_family ON family_members(family_id);
  `);

  // Safe startup migration: Ensure member_id column exists on calendars in existing databases
  try {
    const calendarCols = db.prepare(`PRAGMA table_info(calendars);`).all() as Array<{ name: string }>;
    const hasMemberId = calendarCols.some((col) => col.name === 'member_id');
    if (!hasMemberId) {
      db.prepare(`ALTER TABLE calendars ADD COLUMN member_id TEXT REFERENCES family_members(id) ON DELETE SET NULL;`).run();
      console.log('Migration applied: added member_id column to calendars table.');
    }
  } catch (migErr) {
    console.warn('Calendar member_id migration check warning:', migErr);
  }

  // Safe startup migration: Ensure username and is_active columns exist on users in existing databases
  try {
    const userCols = db.prepare(`PRAGMA table_info(users);`).all() as Array<{ name: string }>;
    const hasUsername = userCols.some((col) => col.name === 'username');
    if (!hasUsername) {
      db.prepare(`ALTER TABLE users ADD COLUMN username TEXT;`).run();
      console.log('Migration applied: added username column to users table.');
    }

    const hasIsActive = userCols.some((col) => col.name === 'is_active');
    if (!hasIsActive) {
      db.prepare(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;`).run();
      db.prepare(`UPDATE users SET is_active = 1 WHERE is_active IS NULL;`).run();
      console.log('Migration applied: added is_active column to users table.');
    }

    const hasUserPermissions = userCols.some((col) => col.name === 'permissions');
    if (!hasUserPermissions) {
      db.prepare(`ALTER TABLE users ADD COLUMN permissions TEXT;`).run();
      console.log('Migration applied: added permissions column to users table.');
    }

    // Safe startup migration: Ensure permissions column exists on family_members
    const memberCols = db.prepare(`PRAGMA table_info(family_members);`).all() as Array<{ name: string }>;
    const hasMemberPermissions = memberCols.some((col) => col.name === 'permissions');
    if (!hasMemberPermissions) {
      db.prepare(`ALTER TABLE family_members ADD COLUMN permissions TEXT;`).run();
      console.log('Migration applied: added permissions column to family_members table.');
    }

    // Backfill username for existing administrator if null
    db.prepare(`
      UPDATE users 
      SET username = 'Alex' 
      WHERE username IS NULL AND (email = 'admin@yimly.local' OR name LIKE '%Alex%');
    `).run();
  } catch (userMigErr) {
    console.warn('User table migration check warning:', userMigErr);
  }

  // Safe startup migration: Ensure event_type column exists on events in existing databases
  try {
    const eventCols = db.prepare(`PRAGMA table_info(events);`).all() as Array<{ name: string }>;
    const hasEventType = eventCols.some((col) => col.name === 'event_type');
    if (!hasEventType) {
      db.prepare(`ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'Other';`).run();
      console.log('Migration applied: added event_type column to events table.');
    }

    // Assign default 'Other' to any existing event that has no event type
    db.prepare(`UPDATE events SET event_type = 'Other' WHERE event_type IS NULL OR TRIM(event_type) = '';`).run();

    // Make sure all existing families have default event types seeded
    const existingFamilies = db.prepare('SELECT id FROM families').all() as Array<{ id: string }>;
    for (const fam of existingFamilies) {
      seedDefaultEventTypesForFamily(fam.id);
    }
  } catch (eventMigErr) {
    console.warn('Event table migration check warning:', eventMigErr);
  }

  // Create indexes after columns exist
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_calendars_member ON calendars(member_id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_family_username ON users(family_id, username);
      CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(family_id, event_type);
      CREATE INDEX IF NOT EXISTS idx_event_types_family ON event_types(family_id);
    `);
  } catch (idxErr) {
    console.warn('Index creation warning:', idxErr);
  }

  seedInitialDataIfEmpty();
}

export function seedDefaultEventTypesForFamily(familyId: string) {
  try {
    const existing = (db.prepare('SELECT COUNT(*) as count FROM event_types WHERE family_id = ?').get(familyId) as { count: number }).count;
    if (existing > 0) return;

    const now = new Date().toISOString();
    const defaultTypes = [
      { name: 'School', color: '#EAB308', icon: '🎓' },
      { name: 'Sport', color: '#3B82F6', icon: '⚽' },
      { name: 'Appointment', color: '#10B981', icon: '🩺' },
      { name: 'Work', color: '#F97316', icon: '💼' },
      { name: 'Birthday', color: '#EC4899', icon: '🎁' },
      { name: 'Holiday', color: '#8B5CF6', icon: '🏖️' },
      { name: 'Social', color: '#C084FC', icon: '🍸' },
      { name: 'Important', color: '#EF4444', icon: '⚡' },
      { name: 'Other', color: '#64748B', icon: '⭐' },
    ];

    const insertStmt = db.prepare(`
      INSERT INTO event_types (id, family_id, name, color, icon, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);

    for (const t of defaultTypes) {
      insertStmt.run('et_' + uuidv4().slice(0, 8), familyId, t.name, t.color, t.icon, now, now);
    }
  } catch (err) {
    console.warn('seedDefaultEventTypesForFamily error:', err);
  }
}

function seedInitialDataIfEmpty() {
  const usersCount = (db.prepare('SELECT COUNT(*) as count FROM users;').get() as { count: number }).count;
  if (usersCount > 0) return;

  const now = new Date().toISOString();
  const familyId = 'fam_' + uuidv4().slice(0, 8);
  const userId = 'usr_' + uuidv4().slice(0, 8);
  const defaultPasswordHash = bcrypt.hashSync('yimly123', 10);

  // 1. Create Default Family
  db.prepare(`
    INSERT INTO families (id, name, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(familyId, 'The Yimly Family', 'America/New_York', now, now);

  // 2. Create Admin User with username 'Alex'
  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, avatar_url, color, birthday, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    userId,
    familyId,
    'admin@yimly.local',
    'Alex',
    defaultPasswordHash,
    'Alex Yimly',
    'administrator',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    '#FF4FA3',
    '1988-04-15',
    now,
    now
  );

  // 3. Create Family Members
  const memberAdminId = 'mem_' + uuidv4().slice(0, 8);
  const member2Id = 'mem_' + uuidv4().slice(0, 8);
  const member3Id = 'mem_' + uuidv4().slice(0, 8);
  const member4Id = 'mem_' + uuidv4().slice(0, 8);

  const insertMember = db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, color, avatar_url, birthday, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  insertMember.run(memberAdminId, familyId, userId, 'Alex', 'administrator', '#FF4FA3', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', '1988-04-15', now);
  insertMember.run(member2Id, familyId, null, 'Jordan', 'adult', '#06B6D4', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', '1990-08-22', now);
  insertMember.run(member3Id, familyId, null, 'Maya', 'child', '#F59E0B', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', '2016-11-09', now);
  insertMember.run(member4Id, familyId, null, 'Leo', 'child', '#10B981', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80', '2019-02-18', now);

  // 4. Create Standard Calendars
  const calFamilyId = 'cal_' + uuidv4().slice(0, 8);
  const calSchoolId = 'cal_' + uuidv4().slice(0, 8);
  const calSportsId = 'cal_' + uuidv4().slice(0, 8);

  const insertCal = db.prepare(`
    INSERT INTO calendars (id, family_id, name, color, description, is_default, source, is_read_only, sync_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'yimly', 0, 1, ?, ?)
  `);

  insertCal.run(calFamilyId, familyId, 'Family Hub', '#FF4FA3', 'Shared household events and activities', 1, now, now);
  insertCal.run(calSchoolId, familyId, 'School & Lessons', '#F59E0B', 'School schedules, classes, and activities', 0, now, now);
  insertCal.run(calSportsId, familyId, 'Sports & Fitness', '#10B981', 'Practices, games, and gym sessions', 0, now, now);

  seedDefaultEventTypesForFamily(familyId);

  // 5. Seed Helpful Sample Events for current month & week
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = today.getDate();

  const makeIsoDate = (dOffset: number, hour: number, minute: number = 0) => {
    const target = new Date(today);
    target.setDate(today.getDate() + dOffset);
    target.setHours(hour, minute, 0, 0);
    return target.toISOString();
  };

  const insertEvent = db.prepare(`
    INSERT INTO events (id, family_id, calendar_id, title, description, location, color, event_type, start_time, end_time, all_day, recurring_rule, assigned_member_ids, sync_status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only', ?, ?, ?)
  `);

  // Event 1: Today Dinner
  insertEvent.run(
    'evt_' + uuidv4().slice(0, 8),
    familyId,
    calFamilyId,
    'Family Dinner & Movie Night 🍕🎬',
    'Pizza making and watching the new animated movie together.',
    'Home Living Room',
    '#FF4FA3',
    'Social',
    makeIsoDate(0, 18, 30),
    makeIsoDate(0, 21, 0),
    0,
    'weekly',
    JSON.stringify([memberAdminId, member2Id, member3Id, member4Id]),
    userId,
    now,
    now
  );

  // Event 2: Tomorrow Soccer Practice
  insertEvent.run(
    'evt_' + uuidv4().slice(0, 8),
    familyId,
    calSportsId,
    'Maya Soccer Practice ⚽',
    'Bring water bottle and shin guards. Coach Dan.',
    'Community Park Field 2',
    '#10B981',
    'Sport',
    makeIsoDate(1, 16, 0),
    makeIsoDate(1, 17, 30),
    0,
    'weekly',
    JSON.stringify([member3Id, member2Id]),
    userId,
    now,
    now
  );

  // Event 3: All-day School event in 3 days
  insertEvent.run(
    'evt_' + uuidv4().slice(0, 8),
    familyId,
    calSchoolId,
    'School Science Fair 🔬',
    'Leo and Maya presenting their solar system model.',
    'Oak Elementary Gym',
    '#F59E0B',
    'School',
    makeIsoDate(3, 8, 0),
    makeIsoDate(3, 15, 0),
    1,
    'none',
    JSON.stringify([member3Id, member4Id]),
    userId,
    now,
    now
  );

  // Event 4: Dentist appointment in 5 days
  insertEvent.run(
    'evt_' + uuidv4().slice(0, 8),
    familyId,
    calFamilyId,
    'Dental Checkup (Alex & Jordan) 🦷',
    'Annual cleaning with Dr. Harris',
    'Downtown Dental Clinic',
    '#06B6D4',
    'Appointment',
    makeIsoDate(5, 10, 0),
    makeIsoDate(5, 11, 30),
    0,
    'none',
    JSON.stringify([memberAdminId, member2Id]),
    userId,
    now,
    now
  );

  // 6. Seed Helpful Initial Tasks
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, family_id, title, description, due_date, due_time, completed, assigned_member_id, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertTask.run(
    'tsk_' + uuidv4().slice(0, 8),
    familyId,
    'Pick up groceries for pizza night 🛒',
    'Flour, mozzarella, tomatoes, pepperoni, fresh basil',
    makeIsoDate(0, 15, 0).slice(0, 10),
    '15:00',
    0,
    member2Id,
    'high',
    now,
    now
  );

  insertTask.run(
    'tsk_' + uuidv4().slice(0, 8),
    familyId,
    'Sign Maya permission slip for zoo field trip 📝',
    'Must be returned by Friday morning',
    makeIsoDate(2, 9, 0).slice(0, 10),
    '09:00',
    0,
    memberAdminId,
    'medium',
    now,
    now
  );

  insertTask.run(
    'tsk_' + uuidv4().slice(0, 8),
    familyId,
    'Pack soccer gear into trunk 🎒',
    'Clean socks and ball',
    makeIsoDate(1, 14, 0).slice(0, 10),
    '14:00',
    1,
    member3Id,
    'low',
    now,
    now
  );
}
