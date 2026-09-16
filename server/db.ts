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
      points INTEGER DEFAULT 0,
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
      reminder_minutes INTEGER,
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
      task_group_id TEXT,
      parent_task_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      due_time TEXT,
      reminder_minutes INTEGER,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      is_archived INTEGER DEFAULT 0,
      assigned_member_id TEXT,
      assigned_member_ids TEXT DEFAULT '[]',
      priority TEXT DEFAULT 'medium', -- low, medium, high
      recurring_rule TEXT DEFAULT 'none', -- none, daily, weekly, fortnightly, monthly, custom
      recurring_interval INTEGER DEFAULT 1,
      recurring_unit TEXT DEFAULT 'day',
      assignment_mode TEXT DEFAULT 'assigned', -- assigned, open, everyone
      claim_limit INTEGER DEFAULT 1, -- 1 = single person, 0 = multiple people
      points INTEGER DEFAULT 0,
      points_awarded INTEGER DEFAULT 0,
      claimed_at TEXT,
      claimed_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_member_id) REFERENCES family_members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS task_points_records (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_task_points_member_task ON task_points_records(member_id, task_id);
    CREATE INDEX IF NOT EXISTS idx_task_points_family_member ON task_points_records(family_id, member_id);

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

    CREATE TABLE IF NOT EXISTS stock_items (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Pantry Essentials',
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT DEFAULT 'packs',
      low_stock_threshold REAL DEFAULT 1,
      target_stock REAL DEFAULT 2,
      restock_target REAL DEFAULT 2,
      shopping_trigger TEXT DEFAULT 'low_stock',
      expiry_days_threshold INTEGER DEFAULT 2,
      auto_add_to_shopping INTEGER DEFAULT 1,
      earliest_expiry_date TEXT,
      location TEXT,
      notes TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock_barcodes (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      stock_item_id TEXT NOT NULL,
      barcode TEXT NOT NULL,
      brand_or_label TEXT,
      quantity_delta_per_scan REAL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE,
      UNIQUE(family_id, barcode)
    );

    CREATE TABLE IF NOT EXISTS stock_logs (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      stock_item_id TEXT NOT NULL,
      action TEXT NOT NULL,
      quantity_changed REAL NOT NULL,
      quantity_after REAL NOT NULL,
      barcode TEXT,
      expiry_date TEXT,
      member_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      stock_item_id TEXT,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT DEFAULT 'packs',
      category TEXT DEFAULT 'Pantry Essentials',
      is_completed INTEGER DEFAULT 0,
      is_auto_generated INTEGER DEFAULT 0,
      completed_at TEXT,
      completed_by TEXT,
      added_by TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_family_start ON events(family_id, start_time);
    CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);
    CREATE INDEX IF NOT EXISTS idx_events_google_id ON events(google_event_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_family ON tasks(family_id, completed);
    CREATE INDEX IF NOT EXISTS idx_members_family ON family_members(family_id);
    CREATE INDEX IF NOT EXISTS idx_stock_items_family_name ON stock_items(family_id, name);
    CREATE INDEX IF NOT EXISTS idx_stock_barcodes_lookup ON stock_barcodes(family_id, barcode);
    CREATE INDEX IF NOT EXISTS idx_stock_barcodes_item ON stock_barcodes(stock_item_id);
    CREATE INDEX IF NOT EXISTS idx_shopping_list_family ON shopping_list_items(family_id, is_completed);
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

    // Safe startup migration: Ensure color_softness column exists on families
    const familyCols = db.prepare(`PRAGMA table_info(families);`).all() as Array<{ name: string }>;
    const hasColorSoftness = familyCols.some((col) => col.name === 'color_softness');
    if (!hasColorSoftness) {
      db.prepare(`ALTER TABLE families ADD COLUMN color_softness INTEGER DEFAULT 0;`).run();
      console.log('Migration applied: added color_softness column to families table.');
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

  // Safe startup migration: Ensure is_archived and reminder_minutes columns exist on tasks in existing databases
  try {
    const taskCols = db.prepare(`PRAGMA table_info(tasks);`).all() as Array<{ name: string }>;
    const hasArchived = taskCols.some((col) => col.name === 'is_archived');
    if (!hasArchived) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN is_archived INTEGER DEFAULT 0;`).run();
      console.log('Migration applied: added is_archived column to tasks table.');
    }

    const hasReminderMinutes = taskCols.some((col) => col.name === 'reminder_minutes');
    if (!hasReminderMinutes) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN reminder_minutes INTEGER;`).run();
      console.log('Migration applied: added reminder_minutes column to tasks table.');
    }

    const hasRecurringRule = taskCols.some((col) => col.name === 'recurring_rule');
    if (!hasRecurringRule) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN recurring_rule TEXT DEFAULT 'none';`).run();
      console.log('Migration applied: added recurring_rule column to tasks table.');
    }

    const hasRecurringInterval = taskCols.some((col) => col.name === 'recurring_interval');
    if (!hasRecurringInterval) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN recurring_interval INTEGER DEFAULT 1;`).run();
      console.log('Migration applied: added recurring_interval column to tasks table.');
    }

    const hasRecurringUnit = taskCols.some((col) => col.name === 'recurring_unit');
    if (!hasRecurringUnit) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN recurring_unit TEXT DEFAULT 'day';`).run();
      console.log('Migration applied: added recurring_unit column to tasks table.');
    }

    const hasAssignedMemberIds = taskCols.some((col) => col.name === 'assigned_member_ids');
    if (!hasAssignedMemberIds) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN assigned_member_ids TEXT DEFAULT '[]';`).run();
      console.log('Migration applied: added assigned_member_ids column to tasks table.');
    }

    const hasTaskGroupId = taskCols.some((col) => col.name === 'task_group_id');
    if (!hasTaskGroupId) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN task_group_id TEXT;`).run();
      console.log('Migration applied: added task_group_id column to tasks table.');
    }
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(task_group_id);`).run();

    // Populate assigned_member_ids and split tasks assigned to multiple members into individual entries
    const tasksToUpdate = db.prepare(`SELECT * FROM tasks`).all() as any[];
    const todayStr = new Date().toISOString().split('T')[0];

    for (const t of tasksToUpdate) {
      let ids: string[] = [];
      try {
        if (t.assigned_member_ids) {
          ids = JSON.parse(t.assigned_member_ids);
        }
      } catch {
        ids = [];
      }

      if (ids.length === 0 && t.assigned_member_id) {
        ids = [t.assigned_member_id];
      }

      if (ids.length === 0) {
        // Find active family members for this family
        const activeMembers = db.prepare(`SELECT id FROM family_members WHERE family_id = ? AND is_active = 1`).all(t.family_id) as any[];
        if (activeMembers.length > 0) {
          ids = activeMembers.map((m: any) => m.id);
        }
      }

      const cleanDueDate = t.due_date ? t.due_date.split('T')[0] : (t.created_at ? t.created_at.split('T')[0] : todayStr);

      if (ids.length > 1) {
        // Multi-member task: assign a shared task_group_id and ensure an individual task entry per member
        const taskGroupId = t.task_group_id || ('grp_' + uuidv4().slice(0, 8));
        const firstMemberId = ids[0];

        // Update current row for first member
        db.prepare(`
          UPDATE tasks
          SET task_group_id = ?, assigned_member_id = ?, assigned_member_ids = ?, due_date = ?
          WHERE id = ?
        `).run(taskGroupId, firstMemberId, JSON.stringify([firstMemberId]), cleanDueDate, t.id);

        // For remaining members, insert separate rows if not already present
        for (const remMemberId of ids.slice(1)) {
          const existingSibling = db.prepare(`
            SELECT id FROM tasks WHERE task_group_id = ? AND assigned_member_id = ?
          `).get(taskGroupId, remMemberId);

          if (!existingSibling) {
            const siblingTaskId = 'tsk_' + uuidv4().slice(0, 8);
            db.prepare(`
              INSERT INTO tasks (
                id, family_id, task_group_id, title, description, due_date, due_time,
                reminder_minutes, completed, completed_at, is_archived, assigned_member_id,
                assigned_member_ids, priority, recurring_rule, recurring_interval,
                recurring_unit, created_at, updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              siblingTaskId,
              t.family_id,
              taskGroupId,
              t.title,
              t.description || null,
              cleanDueDate,
              t.due_time || null,
              t.reminder_minutes,
              t.completed || 0,
              t.completed_at || null,
              t.is_archived || 0,
              remMemberId,
              JSON.stringify([remMemberId]),
              t.priority || 'medium',
              t.recurring_rule || 'none',
              t.recurring_interval || 1,
              t.recurring_unit || 'day',
              t.created_at,
              t.updated_at
            );
          }
        }
      } else {
        // Single-member task
        const primaryMemberId = ids.length > 0 ? ids[0] : null;
        const taskGroupId = t.task_group_id || t.id;
        db.prepare(`
          UPDATE tasks
          SET task_group_id = ?, assigned_member_ids = ?, assigned_member_id = ?, due_date = ?
          WHERE id = ?
        `).run(taskGroupId, JSON.stringify(primaryMemberId ? [primaryMemberId] : []), primaryMemberId, cleanDueDate, t.id);
      }
    }
  } catch (taskMigErr) {
    console.warn('Tasks table migration check warning:', taskMigErr);
  }

  // Safe startup migration: Ensure assignment_mode, claim_limit, points, points_awarded, parent_task_id, claimed_at, claimed_by exist on tasks
  try {
    const taskCols = db.prepare(`PRAGMA table_info(tasks);`).all() as Array<{ name: string }>;
    
    const hasAssignmentMode = taskCols.some((col) => col.name === 'assignment_mode');
    if (!hasAssignmentMode) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN assignment_mode TEXT DEFAULT 'assigned';`).run();
      console.log('Migration applied: added assignment_mode column to tasks table.');
    }

    const hasClaimLimit = taskCols.some((col) => col.name === 'claim_limit');
    if (!hasClaimLimit) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN claim_limit INTEGER DEFAULT 1;`).run();
      console.log('Migration applied: added claim_limit column to tasks table.');
    }

    const hasPoints = taskCols.some((col) => col.name === 'points');
    if (!hasPoints) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN points INTEGER DEFAULT 0;`).run();
      console.log('Migration applied: added points column to tasks table.');
    }

    const hasPointsAwarded = taskCols.some((col) => col.name === 'points_awarded');
    if (!hasPointsAwarded) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN points_awarded INTEGER DEFAULT 0;`).run();
      console.log('Migration applied: added points_awarded column to tasks table.');
    }

    const hasParentTaskId = taskCols.some((col) => col.name === 'parent_task_id');
    if (!hasParentTaskId) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN parent_task_id TEXT;`).run();
      console.log('Migration applied: added parent_task_id column to tasks table.');
    }

    const hasClaimedAt = taskCols.some((col) => col.name === 'claimed_at');
    if (!hasClaimedAt) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN claimed_at TEXT;`).run();
      console.log('Migration applied: added claimed_at column to tasks table.');
    }

    const hasClaimedBy = taskCols.some((col) => col.name === 'claimed_by');
    if (!hasClaimedBy) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN claimed_by TEXT;`).run();
      console.log('Migration applied: added claimed_by column to tasks table.');
    }

    // Safe startup migration: Ensure points column exists on family_members
    const memberCols = db.prepare(`PRAGMA table_info(family_members);`).all() as Array<{ name: string }>;
    const hasMemberPoints = memberCols.some((col) => col.name === 'points');
    if (!hasMemberPoints) {
      db.prepare(`ALTER TABLE family_members ADD COLUMN points INTEGER DEFAULT 0;`).run();
      console.log('Migration applied: added points column to family_members table.');
    }

    // Ensure task_points_records table and index exist
    db.prepare(`
      CREATE TABLE IF NOT EXISTS task_points_records (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        points_awarded INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
    `).run();
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_task_points_member_task ON task_points_records(member_id, task_id);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_task_points_family_member ON task_points_records(family_id, member_id);`).run();
  } catch (pointsMigErr) {
    console.warn('Points & assignment migration check warning:', pointsMigErr);
  }

  // Safe startup migration: Ensure event_type column exists on events in existing databases
  try {
    const eventCols = db.prepare(`PRAGMA table_info(events);`).all() as Array<{ name: string }>;
    const hasEventType = eventCols.some((col) => col.name === 'event_type');
    if (!hasEventType) {
      db.prepare(`ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'Other';`).run();
      console.log('Migration applied: added event_type column to events table.');
    }

    const hasEventReminder = eventCols.some((col) => col.name === 'reminder_minutes');
    if (!hasEventReminder) {
      db.prepare(`ALTER TABLE events ADD COLUMN reminder_minutes INTEGER;`).run();
      console.log('Migration applied: added reminder_minutes column to events table.');
    }

    // Assign default 'Other' to any existing event that has no event type
    db.prepare(`UPDATE events SET event_type = 'Other' WHERE event_type IS NULL OR TRIM(event_type) = '';`).run();

    // Check families table columns for viewer_password_hash
    try {
      const famCols = db.prepare(`PRAGMA table_info(families);`).all() as Array<{ name: string }>;
      const hasViewerPassword = famCols.some((col) => col.name === 'viewer_password_hash');
      if (!hasViewerPassword) {
        db.prepare(`ALTER TABLE families ADD COLUMN viewer_password_hash TEXT;`).run();
        console.log('Migration applied: added viewer_password_hash column to families table.');
      }
    } catch (famMigErr) {
      console.warn('Family table migration check warning:', famMigErr);
    }

    // Check stock_items columns for target_stock, restock_target, shopping_trigger, expiry_days_threshold, and auto_add_to_shopping
    try {
      const stockCols = db.prepare(`PRAGMA table_info(stock_items);`).all() as Array<{ name: string }>;
      const hasRestockTarget = stockCols.some((col) => col.name === 'restock_target');
      if (!hasRestockTarget) {
        db.prepare(`ALTER TABLE stock_items ADD COLUMN restock_target REAL DEFAULT 2;`).run();
        console.log('Migration applied: added restock_target column to stock_items table.');
      }

      const hasTargetStock = stockCols.some((col) => col.name === 'target_stock');
      if (!hasTargetStock) {
        db.prepare(`ALTER TABLE stock_items ADD COLUMN target_stock REAL DEFAULT 2;`).run();
        db.prepare(`UPDATE stock_items SET target_stock = restock_target WHERE restock_target IS NOT NULL;`).run();
        console.log('Migration applied: added target_stock column to stock_items table.');
      }

      const hasShoppingTrigger = stockCols.some((col) => col.name === 'shopping_trigger');
      if (!hasShoppingTrigger) {
        db.prepare(`ALTER TABLE stock_items ADD COLUMN shopping_trigger TEXT DEFAULT 'low_stock';`).run();
        db.prepare(`UPDATE stock_items SET shopping_trigger = 'none' WHERE auto_add_to_shopping = 0;`).run();
        console.log('Migration applied: added shopping_trigger column to stock_items table.');
      }

      const hasExpiryDaysThreshold = stockCols.some((col) => col.name === 'expiry_days_threshold');
      if (!hasExpiryDaysThreshold) {
        db.prepare(`ALTER TABLE stock_items ADD COLUMN expiry_days_threshold INTEGER DEFAULT 2;`).run();
        console.log('Migration applied: added expiry_days_threshold column to stock_items table.');
      }

      const hasAutoAdd = stockCols.some((col) => col.name === 'auto_add_to_shopping');
      if (!hasAutoAdd) {
        db.prepare(`ALTER TABLE stock_items ADD COLUMN auto_add_to_shopping INTEGER DEFAULT 1;`).run();
        console.log('Migration applied: added auto_add_to_shopping column to stock_items table.');
      }

      const hasOpenedItems = stockCols.some((col) => col.name === 'opened_items');
      if (!hasOpenedItems) {
        db.prepare(`ALTER TABLE stock_items ADD COLUMN opened_items TEXT DEFAULT '[]';`).run();
        console.log('Migration applied: added opened_items column to stock_items table.');
      }
    } catch (stockMigErr) {
      console.warn('Stock table migration check warning:', stockMigErr);
    }

    // Check shopping_list_items columns for is_auto_generated
    try {
      const shopCols = db.prepare(`PRAGMA table_info(shopping_list_items);`).all() as Array<{ name: string }>;
      const hasAutoGenerated = shopCols.some((col) => col.name === 'is_auto_generated');
      if (!hasAutoGenerated) {
        db.prepare(`ALTER TABLE shopping_list_items ADD COLUMN is_auto_generated INTEGER DEFAULT 0;`).run();
        console.log('Migration applied: added is_auto_generated column to shopping_list_items table.');
      }
    } catch (shopMigErr) {
      console.warn('Shopping list migration check warning:', shopMigErr);
    }

    // Make sure all existing families have default event types seeded
    const existingFamilies = db.prepare('SELECT id FROM families').all() as Array<{ id: string }>;
    for (const fam of existingFamilies) {
      seedDefaultEventTypesForFamily(fam.id);
      seedDefaultCalendarLayersForFamily(fam.id);
      seedDefaultStockForFamily(fam.id);
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

export function seedDefaultCalendarLayersForFamily(familyId: string) {
  try {
    const now = new Date().toISOString();
    const insertCal = db.prepare(`
      INSERT INTO calendars (id, family_id, member_id, name, color, description, is_default, source, is_read_only, sync_enabled, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, ?, 0, 'yimly', 0, 1, ?, ?)
    `);

    // 1. Birthdays Layer
    let birthdayCal = db.prepare(`
      SELECT id FROM calendars WHERE family_id = ? AND (name LIKE '%Birthday%' OR name LIKE '%🎂%')
    `).get(familyId) as { id: string } | undefined;

    if (!birthdayCal) {
      const bCalId = 'cal_birthdays_' + uuidv4().slice(0, 6);
      insertCal.run(bCalId, familyId, '🎂 Birthdays', '#EC4899', 'Family birthdays and milestone celebrations', now, now);
      birthdayCal = { id: bCalId };
    }

    // 2. Bin Calendar Layer
    let binCal = db.prepare(`
      SELECT id FROM calendars WHERE family_id = ? AND (name LIKE '%Bin%' OR name LIKE '%🗑️%')
    `).get(familyId) as { id: string } | undefined;

    if (!binCal) {
      const binCalId = 'cal_bins_' + uuidv4().slice(0, 6);
      insertCal.run(binCalId, familyId, '🗑️ Bin Calendar', '#10B981', 'Household waste, recycling, and organics collection days', now, now);
      binCal = { id: binCalId };
    }

    // 3. Public Holidays Layer
    let holidayCal = db.prepare(`
      SELECT id FROM calendars WHERE family_id = ? AND (name LIKE '%Holiday%' OR name LIKE '%🇦🇺%')
    `).get(familyId) as { id: string } | undefined;

    if (!holidayCal) {
      const hCalId = 'cal_holidays_' + uuidv4().slice(0, 6);
      insertCal.run(hCalId, familyId, '🇦🇺 Public Holidays', '#8B5CF6', 'National and regional public holidays', now, now);
      holidayCal = { id: hCalId };
    }

    // Seed events for Public Holidays if none exist on this calendar
    const existingHolidayEvents = (db.prepare('SELECT COUNT(*) as count FROM events WHERE calendar_id = ?').get(holidayCal.id) as { count: number }).count;
    if (existingHolidayEvents === 0) {
      const currentYear = new Date().getFullYear();
      const insertEvent = db.prepare(`
        INSERT INTO events (id, family_id, calendar_id, title, description, location, color, event_type, start_time, end_time, all_day, recurring_rule, assigned_member_ids, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Holiday', ?, ?, 1, 'yearly', '[]', 'local_only', ?, ?)
      `);

      const holidays = [
        { title: "New Year's Day 🎆", month: 0, day: 1 },
        { title: 'Australia Day 🇦🇺', month: 0, day: 26 },
        { title: 'Good Friday ✝️', month: 3, day: 3 },
        { title: 'Easter Monday 🐰', month: 3, day: 6 },
        { title: 'ANZAC Day 🌺', month: 3, day: 25 },
        { title: "King's Birthday 👑", month: 5, day: 8 },
        { title: 'Labor Day 🛠️', month: 9, day: 5 },
        { title: 'Christmas Day 🎄', month: 11, day: 25 },
        { title: 'Boxing Day 🎁', month: 11, day: 26 },
      ];

      for (const h of holidays) {
        const start = new Date(currentYear, h.month, h.day, 0, 0, 0);
        const end = new Date(currentYear, h.month, h.day, 23, 59, 59);
        insertEvent.run(
          'evt_hol_' + uuidv4().slice(0, 8),
          familyId,
          holidayCal.id,
          h.title,
          'Official Public Holiday',
          'National',
          '#8B5CF6',
          start.toISOString(),
          end.toISOString(),
          now,
          now
        );
      }
    }

    // Seed events for Bin Calendar if none exist
    const existingBinEvents = (db.prepare('SELECT COUNT(*) as count FROM events WHERE calendar_id = ?').get(binCal.id) as { count: number }).count;
    if (existingBinEvents === 0) {
      const insertEvent = db.prepare(`
        INSERT INTO events (id, family_id, calendar_id, title, description, location, color, event_type, start_time, end_time, all_day, recurring_rule, assigned_member_ids, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Other', ?, ?, 0, 'weekly', '[]', 'local_only', ?, ?)
      `);

      const nowD = new Date();
      // Next Tuesday
      const daysUntilTuesday = (2 + 7 - nowD.getDay()) % 7 || 7;
      const nextTuesday = new Date(nowD);
      nextTuesday.setDate(nowD.getDate() + daysUntilTuesday);
      nextTuesday.setHours(7, 0, 0, 0);
      const nextTuesdayEnd = new Date(nextTuesday);
      nextTuesdayEnd.setHours(7, 30, 0, 0);

      insertEvent.run(
        'evt_bin_' + uuidv4().slice(0, 8),
        familyId,
        binCal.id,
        'General Waste & Recycling Bin 🗑️♻️',
        'Put out red-lid landfill bin and yellow-lid recycling bin by 7:00 AM.',
        'Kerbside',
        '#10B981',
        nextTuesday.toISOString(),
        nextTuesdayEnd.toISOString(),
        now,
        now
      );

      const nextNextTuesday = new Date(nextTuesday);
      nextNextTuesday.setDate(nextTuesday.getDate() + 7);
      const nextNextTuesdayEnd = new Date(nextNextTuesday);
      nextNextTuesdayEnd.setHours(7, 30, 0, 0);

      insertEvent.run(
        'evt_bin_' + uuidv4().slice(0, 8),
        familyId,
        binCal.id,
        'Green Organics Bin 🌿',
        'Put out green-lid garden & organic food waste bin by 7:00 AM.',
        'Kerbside',
        '#059669',
        nextNextTuesday.toISOString(),
        nextNextTuesdayEnd.toISOString(),
        now,
        now
      );
    }

    // Sync member birthdays into 🎂 Birthdays calendar
    syncMemberBirthdaysToCalendarLayer(familyId, birthdayCal.id);
  } catch (err) {
    console.warn('seedDefaultCalendarLayersForFamily error:', err);
  }
}

export function syncMemberBirthdaysToCalendarLayer(familyId: string, birthdayCalId?: string) {
  try {
    let calId = birthdayCalId;
    if (!calId) {
      const bCal = db.prepare(`
        SELECT id FROM calendars WHERE family_id = ? AND (name LIKE '%Birthday%' OR name LIKE '%🎂%')
      `).get(familyId) as { id: string } | undefined;
      if (!bCal) return;
      calId = bCal.id;
    }

    const membersWithBirthdays = db.prepare(`
      SELECT id, name, birthday, color FROM family_members
      WHERE family_id = ? AND is_active = 1 AND birthday IS NOT NULL AND birthday != ''
    `).all(familyId) as Array<{ id: string; name: string; birthday: string; color: string }>;

    const now = new Date().toISOString();
    const currentYear = new Date().getFullYear();

    for (const m of membersWithBirthdays) {
      const bDate = new Date(m.birthday);
      if (isNaN(bDate.getTime())) continue;

      const title = `${m.name}'s Birthday 🎂🎉`;
      const existing = db.prepare(`
        SELECT id FROM events WHERE calendar_id = ? AND title LIKE ?
      `).get(calId, `${m.name}'s Birthday%`) as { id: string } | undefined;

      const start = new Date(currentYear, bDate.getMonth(), bDate.getDate(), 0, 0, 0);
      const end = new Date(currentYear, bDate.getMonth(), bDate.getDate(), 23, 59, 59);

      if (!existing) {
        db.prepare(`
          INSERT INTO events (id, family_id, calendar_id, title, description, location, color, event_type, start_time, end_time, all_day, recurring_rule, assigned_member_ids, sync_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, '#EC4899', 'Birthday', ?, ?, 1, 'yearly', '[]', 'local_only', ?, ?)
        `).run(
          'evt_bday_' + uuidv4().slice(0, 8),
          familyId,
          calId,
          title,
          `Celebration of ${m.name}'s birthday!`,
          'Home',
          start.toISOString(),
          end.toISOString(),
          now,
          now
        );
      }
    }
  } catch (err) {
    console.warn('syncMemberBirthdaysToCalendarLayer error:', err);
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
    INSERT INTO tasks (
      id, family_id, task_group_id, title, description, due_date, due_time,
      completed, assigned_member_id, assigned_member_ids, priority,
      assignment_mode, claim_limit, points, points_awarded, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const t1Id = 'tsk_' + uuidv4().slice(0, 8);
  insertTask.run(
    t1Id,
    familyId,
    t1Id,
    'Pick up groceries for pizza night 🛒',
    'Flour, mozzarella, tomatoes, pepperoni, fresh basil',
    makeIsoDate(0, 15, 0).slice(0, 10),
    '15:00',
    0,
    member2Id,
    JSON.stringify([member2Id]),
    'high',
    'assigned',
    1,
    15,
    0,
    now,
    now
  );

  const t2Id = 'tsk_' + uuidv4().slice(0, 8);
  insertTask.run(
    t2Id,
    familyId,
    t2Id,
    'Sign Maya permission slip for zoo field trip 📝',
    'Must be returned by Friday morning',
    makeIsoDate(2, 9, 0).slice(0, 10),
    '09:00',
    0,
    memberAdminId,
    JSON.stringify([memberAdminId]),
    'medium',
    'assigned',
    1,
    10,
    0,
    now,
    now
  );

  const t3Id = 'tsk_' + uuidv4().slice(0, 8);
  insertTask.run(
    t3Id,
    familyId,
    t3Id,
    'Pack soccer gear into trunk 🎒',
    'Clean socks and ball',
    makeIsoDate(1, 14, 0).slice(0, 10),
    '14:00',
    1,
    member3Id,
    JSON.stringify([member3Id]),
    'low',
    'assigned',
    1,
    20,
    20,
    now,
    now
  );

  // Seed open community chore
  const tOpenId = 'tsk_' + uuidv4().slice(0, 8);
  insertTask.run(
    tOpenId,
    familyId,
    'grp_open_' + uuidv4().slice(0, 6),
    'Wash and vacuum the family car 🚗🧼',
    'Wipe down dashboard, vacuum seats, and rinse outside.',
    makeIsoDate(3, 11, 0).slice(0, 10),
    '11:00',
    0,
    null,
    JSON.stringify([]),
    'medium',
    'open',
    1,
    30,
    0,
    now,
    now
  );

  // Record initial points for member 3 (completed task)
  recordTaskCompletionPoints(familyId, member3Id, t3Id, 20, true, 'Initial seed task completion');
}

export function reconcileMemberPoints(familyId: string, memberId: string): number {
  try {
    const result = db.prepare(`
      SELECT COALESCE(SUM(points_awarded), 0) as total
      FROM task_points_records
      WHERE family_id = ? AND member_id = ? AND completed = 1
    `).get(familyId, memberId) as any;

    const totalPoints = result ? Number(result.total) || 0 : 0;
    db.prepare(`UPDATE family_members SET points = ? WHERE id = ?`).run(totalPoints, memberId);
    return totalPoints;
  } catch (err) {
    console.error('Error reconciling member points:', err);
    return 0;
  }
}

export function recordTaskCompletionPoints(
  familyId: string,
  memberId: string,
  taskId: string,
  pointsToAward: number,
  isCompleted: boolean,
  notes?: string
) {
  const now = new Date().toISOString();
  const existing = db.prepare(
    'SELECT * FROM task_points_records WHERE member_id = ? AND task_id = ?'
  ).get(memberId, taskId) as any;

  if (existing) {
    db.prepare(`
      UPDATE task_points_records
      SET points_awarded = ?, completed = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(isCompleted ? pointsToAward : 0, isCompleted ? 1 : 0, notes || null, now, existing.id);
  } else if (isCompleted) {
    const recordId = 'pts_' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO task_points_records (id, family_id, member_id, task_id, points_awarded, completed, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(recordId, familyId, memberId, taskId, pointsToAward, notes || null, now, now);
  }

  // Also sync tasks.points_awarded
  db.prepare('UPDATE tasks SET points_awarded = ? WHERE id = ?').run(isCompleted ? pointsToAward : 0, taskId);

  // Recalculate member total points
  reconcileMemberPoints(familyId, memberId);
}

// ==========================================
// STOCK & SHOPPING LIST DATABASE OPERATIONS
// ==========================================

export function seedDefaultStockForFamily(familyId: string) {
  try {
    const count = (db.prepare('SELECT COUNT(*) as count FROM stock_items WHERE family_id = ?').get(familyId) as { count: number }).count;
    if (count > 0) return;

    const now = new Date().toISOString();
    const futureDate = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    const insertStock = db.prepare(`
      INSERT INTO stock_items (id, family_id, name, category, quantity, unit, low_stock_threshold, earliest_expiry_date, location, notes, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBarcode = db.prepare(`
      INSERT INTO stock_barcodes (id, family_id, stock_item_id, barcode, brand_or_label, quantity_delta_per_scan, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const insertShop = db.prepare(`
      INSERT INTO shopping_list_items (id, family_id, stock_item_id, name, quantity, unit, category, is_completed, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);

    // 1. Milk (Example in prompt: Barcode 123 & 456 both map to canonical stock item "Milk")
    const milkId = 'stk_' + uuidv4().slice(0, 8);
    insertStock.run(milkId, familyId, 'Milk', 'Dairy & Fridge', 2, 'bottles', 1, futureDate(7), 'Fridge', 'Full cream and light milk varieties', 1, now, now);
    insertBarcode.run('sbc_' + uuidv4().slice(0, 8), familyId, milkId, '9300601234567', 'Devondale Full Cream 2L', now, now);
    insertBarcode.run('sbc_' + uuidv4().slice(0, 8), familyId, milkId, '9300601987654', 'A2 Light Milk 2L', now, now);
    insertBarcode.run('sbc_' + uuidv4().slice(0, 8), familyId, milkId, '12345678', 'Quick Milk Demo', now, now);

    // 2. Free Range Eggs
    const eggsId = 'stk_' + uuidv4().slice(0, 8);
    insertStock.run(eggsId, familyId, 'Free Range Eggs (12pk)', 'Dairy & Fridge', 1, 'cartons', 1, futureDate(18), 'Fridge', 'Large cage-free eggs', 1, now, now);
    insertBarcode.run('sbc_' + uuidv4().slice(0, 8), familyId, eggsId, '9310055001234', 'Manning Valley 12pk 700g', now, now);

    // 3. Sourdough Bread
    const breadId = 'stk_' + uuidv4().slice(0, 8);
    insertStock.run(breadId, familyId, 'Sourdough Bread', 'Bakery', 1, 'loaves', 1, futureDate(4), 'Pantry', 'Freshly sliced artisan loaf', 1, now, now);
    insertBarcode.run('sbc_' + uuidv4().slice(0, 8), familyId, breadId, '9312345678901', 'Artisan Bakery Sourdough', now, now);

    // 4. Butter
    const butterId = 'stk_' + uuidv4().slice(0, 8);
    insertStock.run(butterId, familyId, 'Butter', 'Dairy & Fridge', 1, 'packs', 1, futureDate(35), 'Fridge', 'Salted grass-fed butter', 0, now, now);
    insertBarcode.run('sbc_' + uuidv4().slice(0, 8), familyId, butterId, '9300605001112', 'Western Star Salted 250g', now, now);

    // 5. Dishwashing Tablets
    const dishId = 'stk_' + uuidv4().slice(0, 8);
    insertStock.run(dishId, familyId, 'Dishwashing Tablets', 'Household & Cleaning', 18, 'packs', 5, null, 'Cupboard', 'All-in-one powerball tabs', 1, now, now);
    insertBarcode.run('sbc_' + uuidv4().slice(0, 8), familyId, dishId, '9300601334455', 'Finish Quantum 40pk', now, now);

    // 6. Bananas
    const bananaId = 'stk_' + uuidv4().slice(0, 8);
    insertStock.run(bananaId, familyId, 'Bananas', 'Fresh Produce', 5, 'pieces', 2, futureDate(5), 'Pantry', 'Cavendish yellow bananas', 0, now, now);

    // 7. Penne Pasta (500g)
    const pastaId = 'stk_' + uuidv4().slice(0, 8);
    insertStock.run(pastaId, familyId, 'Penne Pasta (500g)', 'Pantry Essentials', 3, 'boxes', 1, futureDate(360), 'Pantry', 'Durum wheat semolina', 0, now, now);
    insertBarcode.run('sbc_' + uuidv4().slice(0, 8), familyId, pastaId, '8001234567890', 'Barilla Penne Rigate 500g', now, now);

    // 8. Olive Oil (1L)
    const oilId = 'stk_' + uuidv4().slice(0, 8);
    insertStock.run(oilId, familyId, 'Olive Oil (1L)', 'Pantry Essentials', 1, 'bottles', 1, futureDate(180), 'Pantry', 'Extra Virgin Cold Pressed', 0, now, now);

    // Seed default Shopping List items
    insertShop.run('shop_' + uuidv4().slice(0, 8), familyId, null, 'Greek Yoghurt (1kg)', 1, 'tubs', 'Dairy & Fridge', 'Natural unsweetened', now, now);
    insertShop.run('shop_' + uuidv4().slice(0, 8), familyId, null, 'Pink Lady Apples', 6, 'pieces', 'Fresh Produce', 'Crisp lunchbox snacks', now, now);
    insertShop.run('shop_' + uuidv4().slice(0, 8), familyId, milkId, 'Milk (2L Bottle)', 2, 'bottles', 'Dairy & Fridge', 'Replenish family milk stock', now, now);
  } catch (err) {
    console.warn('seedDefaultStockForFamily error:', err);
  }
}

/**
 * Evaluate and synchronize automatic shopping list triggers for household stock items.
 * Triggers supported:
 * 1. Low Stock: current stock <= low_stock_threshold -> requirement = target_stock - current_stock
 * 2. Zero Stock: current stock <= 0 -> requirement = target_stock (or 1)
 * 3. Before Expiry: earliest_expiry_date within expiry_days_threshold (days) -> requirement created, stock kept intact
 * 4. Low Stock + Before Expiry: either condition activates shopping list entry (single canonical entry, never duplicated)
 * 5. None: stock tracked without auto-shopping
 *
 * Ticked shopping items act as a temporary purchased state and are cleared when Add Stock increases inventory.
 */
export function evaluateStockShoppingTriggers(familyId: string) {
  try {
    const stockItems = db.prepare(`SELECT * FROM stock_items WHERE family_id = ?`).all(familyId) as any[];
    if (!stockItems || stockItems.length === 0) return;

    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    const todayDate = new Date(todayStr + 'T00:00:00Z');

    for (const item of stockItems) {
      const targetStock = Number(item.target_stock !== undefined && item.target_stock !== null ? item.target_stock : (item.restock_target ?? 2));
      const lowThreshold = Number(item.low_stock_threshold !== undefined && item.low_stock_threshold !== null ? item.low_stock_threshold : 1);
      const triggerMode: string = item.shopping_trigger || (item.auto_add_to_shopping === 0 ? 'none' : 'low_stock');
      const expiryDays = Number(item.expiry_days_threshold !== undefined && item.expiry_days_threshold !== null ? item.expiry_days_threshold : 2);
      const currentQty = Number(item.quantity || 0);

      // Query active (uncompleted) and ticked (purchased) items for this canonical stock item
      const activeItems = db.prepare(`
        SELECT id, quantity, is_auto_generated, notes
        FROM shopping_list_items
        WHERE family_id = ? AND is_completed = 0 AND (stock_item_id = ? OR LOWER(name) = LOWER(?))
        ORDER BY created_at ASC
      `).all(familyId, item.id, item.name) as Array<{ id: string; quantity: number; is_auto_generated: number; notes: string | null }>;

      const tickedItems = db.prepare(`
        SELECT id, quantity, is_auto_generated
        FROM shopping_list_items
        WHERE family_id = ? AND is_completed = 1 AND (stock_item_id = ? OR LOWER(name) = LOWER(?))
        ORDER BY created_at ASC
      `).all(familyId, item.id, item.name) as Array<{ id: string; quantity: number; is_auto_generated: number }>;

      if (triggerMode === 'none') {
        // Remove any auto-generated uncompleted shopping entries
        for (const act of activeItems) {
          if (act.is_auto_generated) {
            db.prepare(`DELETE FROM shopping_list_items WHERE id = ?`).run(act.id);
          }
        }
        continue;
      }

      // Condition 1 & 2: Stock replenishment
      // Only active if targetStock > 0. If targetStock is 0, stock-level replenishment does not trigger.
      const isLowStock = targetStock > 0 && currentQty < targetStock && (triggerMode === 'low_stock' || triggerMode === 'low_stock_and_expiry') && currentQty <= lowThreshold;
      const isZeroStock = targetStock > 0 && currentQty < targetStock && triggerMode === 'zero_stock' && currentQty <= 0;

      // Condition 3: Before expiry (evaluating opened batches)
      let isExpiringSoon = false;
      let earliestDaysUntilExpiry: number | null = null;
      let earliestExpiringDateStr: string | null = null;

      if (triggerMode === 'before_expiry' || triggerMode === 'low_stock_and_expiry') {
        let openedList: any[] = [];
        try {
          if (item.opened_items) {
            openedList = typeof item.opened_items === 'string' ? JSON.parse(item.opened_items) : item.opened_items;
          }
        } catch (e) {
          openedList = [];
        }

        if (Array.isArray(openedList)) {
          for (const opn of openedList) {
            if (opn.expiry_date && typeof opn.expiry_date === 'string' && opn.expiry_date.trim()) {
              const expDateStr = opn.expiry_date.trim();
              const expDate = new Date(expDateStr + 'T00:00:00Z');
              const diffTime = expDate.getTime() - todayDate.getTime();
              const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              if (days <= expiryDays) {
                isExpiringSoon = true;
                if (earliestDaysUntilExpiry === null || days < earliestDaysUntilExpiry) {
                  earliestDaysUntilExpiry = days;
                  earliestExpiringDateStr = expDateStr;
                }
              }
            }
          }
        }
      }

      const isTriggered = isLowStock || isZeroStock || isExpiringSoon;

      // Calculate required quantity & informative trigger reason
      let neededQty = 1;
      let triggerReason = 'Auto added: stock replenishment';
      if (isLowStock && isExpiringSoon) {
        neededQty = Math.max(1, targetStock - currentQty);
        triggerReason = `Auto added: low stock (${currentQty}/${targetStock} ${item.unit}) & expiring ${earliestDaysUntilExpiry! <= 0 ? 'today/expired' : 'in ' + earliestDaysUntilExpiry + 'd'}`;
      } else if (isLowStock) {
        neededQty = Math.max(1, targetStock - currentQty);
        triggerReason = `Auto added: low stock (${currentQty}/${targetStock} ${item.unit})`;
      } else if (isZeroStock) {
        neededQty = Math.max(1, targetStock > 0 ? targetStock : 1);
        triggerReason = `Auto added: zero stock (${targetStock} ${item.unit} target)`;
      } else if (isExpiringSoon) {
        neededQty = Math.max(1, targetStock > currentQty ? targetStock - currentQty : (targetStock > 0 ? targetStock : 1));
        triggerReason = `Auto added: expiring ${earliestDaysUntilExpiry! <= 0 ? 'today/expired' : 'in ' + earliestDaysUntilExpiry + 'd'} (${earliestExpiringDateStr})`;
      }

      const totalTickedQty = tickedItems.reduce((sum, t) => sum + Number(t.quantity || 0), 0);

      if (isTriggered) {
        if (tickedItems.length > 0) {
          // A ticked item is already present (purchased, awaiting physical Add Stock confirmation)
          if (neededQty > totalTickedQty) {
            const deltaNeeded = neededQty - totalTickedQty;
            if (activeItems.length > 0) {
              db.prepare(`
                UPDATE shopping_list_items
                SET quantity = ?, unit = ?, category = ?, stock_item_id = ?, notes = ?, updated_at = ?
                WHERE id = ?
              `).run(deltaNeeded, item.unit, item.category, item.id, triggerReason, now, activeItems[0].id);

              for (let i = 1; i < activeItems.length; i++) {
                db.prepare(`DELETE FROM shopping_list_items WHERE id = ?`).run(activeItems[i].id);
              }
            } else {
              const shopId = 'shop_' + uuidv4().slice(0, 8);
              db.prepare(`
                INSERT INTO shopping_list_items (id, family_id, stock_item_id, name, quantity, unit, category, is_completed, is_auto_generated, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
              `).run(shopId, familyId, item.id, item.name, deltaNeeded, item.unit, item.category, triggerReason, now, now);
            }
          } else {
            // Ticked purchased items fully satisfy the target quantity; clean up active duplicates
            for (const act of activeItems) {
              if (act.is_auto_generated) {
                db.prepare(`DELETE FROM shopping_list_items WHERE id = ?`).run(act.id);
              }
            }
          }
        } else {
          // No ticked item: synchronize the single active requirement
          if (activeItems.length > 0) {
            db.prepare(`
              UPDATE shopping_list_items
              SET quantity = ?, unit = ?, category = ?, stock_item_id = ?, notes = ?, updated_at = ?
              WHERE id = ?
            `).run(neededQty, item.unit, item.category, item.id, triggerReason, now, activeItems[0].id);

            // Clean up any extraneous active duplicates
            for (let i = 1; i < activeItems.length; i++) {
              db.prepare(`DELETE FROM shopping_list_items WHERE id = ?`).run(activeItems[i].id);
            }
          } else {
            const shopId = 'shop_' + uuidv4().slice(0, 8);
            db.prepare(`
              INSERT INTO shopping_list_items (id, family_id, stock_item_id, name, quantity, unit, category, is_completed, is_auto_generated, notes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
            `).run(shopId, familyId, item.id, item.name, neededQty, item.unit, item.category, triggerReason, now, now);
          }
        }
      } else {
        // Not triggered: remove auto-generated active item if stock is satisfied (or >= target)
        for (const act of activeItems) {
          if (act.is_auto_generated) {
            db.prepare(`DELETE FROM shopping_list_items WHERE id = ?`).run(act.id);
          }
        }
      }
    }
  } catch (err) {
    console.warn('evaluateStockShoppingTriggers error:', err);
  }
}

export function processExpiredOpenedStock(familyId: string) {
  try {
    const stockItems = db.prepare(`SELECT * FROM stock_items WHERE family_id = ?`).all(familyId) as any[];
    if (!stockItems || stockItems.length === 0) return;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isoNow = now.toISOString();

    for (const item of stockItems) {
      if (!item.opened_items) continue;
      let openedList: any[] = [];
      try {
        openedList = JSON.parse(item.opened_items);
      } catch (e) {
        openedList = [];
      }
      if (!Array.isArray(openedList) || openedList.length === 0) continue;

      let changed = false;
      const remainingOpened: any[] = [];

      for (const opn of openedList) {
        if (opn.expiry_date && typeof opn.expiry_date === 'string' && opn.expiry_date.trim()) {
          const expStr = opn.expiry_date.trim();
          if (expStr <= todayStr) {
            // Expired today or in the past! Remove it from opened stock.
            changed = true;
            const logId = 'stl_' + uuidv4().slice(0, 8);
            db.prepare(`
              INSERT INTO stock_logs (id, family_id, stock_item_id, action, quantity_changed, quantity_after, barcode, expiry_date, member_id, created_at)
              VALUES (?, ?, ?, 'consume_opened', ?, ?, NULL, ?, NULL, ?)
            `).run(
              logId,
              familyId,
              item.id,
              -(Number(opn.quantity) || 1),
              item.quantity,
              opn.expiry_date,
              isoNow
            );
            continue; // Exclude from remainingOpened
          }
        }
        remainingOpened.push(opn);
      }

      if (changed) {
        db.prepare(`
          UPDATE stock_items
          SET opened_items = ?, updated_at = ?
          WHERE id = ? AND family_id = ?
        `).run(JSON.stringify(remainingOpened), isoNow, item.id, familyId);
      }
    }
  } catch (err) {
    console.warn('processExpiredOpenedStock error:', err);
  }
}

/**
 * Get all stock items for a family.
 * MANDATORY REQUIREMENT: Stock items are ALWAYS sorted A–Z by the canonical stock item name.
 */
export function getStockItems(familyId: string) {
  processExpiredOpenedStock(familyId);
  evaluateStockShoppingTriggers(familyId);

  const items = db.prepare(`
    SELECT * FROM stock_items
    WHERE family_id = ?
    ORDER BY LOWER(name) ASC, name ASC
  `).all(familyId) as any[];

  if (!items || items.length === 0) return [];

  const barcodes = db.prepare(`
    SELECT * FROM stock_barcodes
    WHERE family_id = ?
    ORDER BY created_at ASC
  `).all(familyId) as any[];

  const barcodeMap = new Map<string, any[]>();
  for (const b of barcodes) {
    if (!barcodeMap.has(b.stock_item_id)) {
      barcodeMap.set(b.stock_item_id, []);
    }
    barcodeMap.get(b.stock_item_id)!.push(b);
  }

  return items.map((item) => {
    let openedItems: any[] = [];
    try {
      if (item.opened_items) {
        openedItems = JSON.parse(item.opened_items);
      }
    } catch (e) {
      openedItems = [];
    }
    const openedQuantity = openedItems.reduce((acc: number, curr: any) => acc + (Number(curr.quantity) || 0), 0);

    return {
      ...item,
      is_favorite: Boolean(item.is_favorite),
      opened_items: openedItems,
      opened_quantity: openedQuantity,
      barcodes: barcodeMap.get(item.id) || [],
    };
  });
}

export function getStockItemById(familyId: string, id: string) {
  const item = db.prepare(`
    SELECT * FROM stock_items
    WHERE family_id = ? AND id = ?
  `).get(familyId, id) as any;

  if (!item) return null;

  const barcodes = db.prepare(`
    SELECT * FROM stock_barcodes
    WHERE family_id = ? AND stock_item_id = ?
    ORDER BY created_at ASC
  `).all(familyId, id) as any[];

  let openedItems: any[] = [];
  try {
    if (item.opened_items) {
      openedItems = JSON.parse(item.opened_items);
    }
  } catch (e) {
    openedItems = [];
  }
  const openedQuantity = openedItems.reduce((acc: number, curr: any) => acc + (Number(curr.quantity) || 0), 0);

  return {
    ...item,
    is_favorite: Boolean(item.is_favorite),
    opened_items: openedItems,
    opened_quantity: openedQuantity,
    barcodes,
  };
}

/**
 * Barcode lookup:
 * A barcode identifies what was scanned.
 * The canonical stock item name determines what inventory item it belongs to.
 * Multiple different barcodes can map to the same stock item.
 */
export function findStockItemByBarcode(familyId: string, barcode: string) {
  const cleanBarcode = barcode.trim();
  const mapping = db.prepare(`
    SELECT * FROM stock_barcodes
    WHERE family_id = ? AND barcode = ?
  `).get(familyId, cleanBarcode) as any;

  if (!mapping) {
    return {
      found: false,
      barcode: cleanBarcode,
      stockItem: null,
      mapping: null,
    };
  }

  const stockItem = getStockItemById(familyId, mapping.stock_item_id);
  return {
    found: true,
    barcode: cleanBarcode,
    stockItem,
    mapping,
  };
}

export function createStockItem(familyId: string, data: {
  name: string;
  category?: string;
  quantity?: number;
  opened_items?: any[];
  unit?: string;
  low_stock_threshold?: number;
  target_stock?: number;
  restock_target?: number;
  shopping_trigger?: string;
  expiry_days_threshold?: number;
  auto_add_to_shopping?: boolean | number;
  earliest_expiry_date?: string | null;
  location?: string | null;
  notes?: string | null;
  is_favorite?: boolean | number;
  barcode?: string;
  brand_or_label?: string;
}) {
  const id = 'stk_' + uuidv4().slice(0, 8);
  const now = new Date().toISOString();
  const name = data.name.trim();
  const category = data.category || 'Pantry Essentials';
  const quantity = Math.max(0, Number(data.quantity) || 0);
  const openedItemsJson = JSON.stringify(data.opened_items || []);
  const unit = data.unit || 'packs';
  const lowThreshold = data.low_stock_threshold !== undefined ? Number(data.low_stock_threshold) : 1;
  const targetStock = data.target_stock !== undefined ? Math.max(0, Number(data.target_stock)) : (data.restock_target !== undefined ? Math.max(0, Number(data.restock_target)) : Math.max(2, lowThreshold * 2));
  const shoppingTrigger = data.shopping_trigger || (data.auto_add_to_shopping === 0 || data.auto_add_to_shopping === false ? 'none' : 'low_stock');
  const expiryDaysThreshold = data.expiry_days_threshold !== undefined ? Math.max(0, Number(data.expiry_days_threshold)) : 2;
  const autoAddToShopping = shoppingTrigger !== 'none' ? 1 : 0;
  const expiry = data.earliest_expiry_date || null;
  const location = data.location || null;
  const notes = data.notes || null;
  const isFavorite = data.is_favorite ? 1 : 0;

  db.prepare(`
    INSERT INTO stock_items (id, family_id, name, category, quantity, opened_items, unit, low_stock_threshold, target_stock, restock_target, shopping_trigger, expiry_days_threshold, auto_add_to_shopping, earliest_expiry_date, location, notes, is_favorite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, familyId, name, category, quantity, openedItemsJson, unit, lowThreshold, targetStock, targetStock, shoppingTrigger, expiryDaysThreshold, autoAddToShopping, expiry, location, notes, isFavorite, now, now);

  if (data.barcode && data.barcode.trim()) {
    addBarcodeToStockItem(familyId, id, data.barcode.trim(), data.brand_or_label);
  }

  evaluateStockShoppingTriggers(familyId);

  return getStockItemById(familyId, id);
}

export function updateStockItem(familyId: string, id: string, data: {
  name?: string;
  category?: string;
  quantity?: number;
  opened_items?: any[];
  unit?: string;
  low_stock_threshold?: number;
  target_stock?: number;
  restock_target?: number;
  shopping_trigger?: string;
  expiry_days_threshold?: number;
  auto_add_to_shopping?: boolean | number;
  earliest_expiry_date?: string | null;
  location?: string | null;
  notes?: string | null;
  is_favorite?: boolean | number;
}) {
  const existing = getStockItemById(familyId, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const name = data.name !== undefined ? data.name.trim() : existing.name;
  const category = data.category !== undefined ? data.category : existing.category;
  const quantity = data.quantity !== undefined ? Math.max(0, Number(data.quantity)) : existing.quantity;
  const openedItemsJson = data.opened_items !== undefined ? JSON.stringify(data.opened_items) : JSON.stringify(existing.opened_items || []);
  const unit = data.unit !== undefined ? data.unit : existing.unit;
  const lowThreshold = data.low_stock_threshold !== undefined ? Number(data.low_stock_threshold) : (existing.low_stock_threshold ?? 1);
  const targetStock = data.target_stock !== undefined ? Math.max(0, Number(data.target_stock)) : (data.restock_target !== undefined ? Math.max(0, Number(data.restock_target)) : (existing.target_stock !== undefined && existing.target_stock !== null ? existing.target_stock : (existing.restock_target !== undefined && existing.restock_target !== null ? existing.restock_target : Math.max(2, lowThreshold * 2))));
  const shoppingTrigger = data.shopping_trigger !== undefined ? data.shopping_trigger : (data.auto_add_to_shopping !== undefined ? (data.auto_add_to_shopping ? 'low_stock' : 'none') : (existing.shopping_trigger || 'low_stock'));
  const expiryDaysThreshold = data.expiry_days_threshold !== undefined ? Math.max(0, Number(data.expiry_days_threshold)) : (existing.expiry_days_threshold ?? 2);
  const autoAddToShopping = shoppingTrigger !== 'none' ? 1 : 0;
  const expiry = data.earliest_expiry_date !== undefined ? data.earliest_expiry_date : existing.earliest_expiry_date;
  const location = data.location !== undefined ? data.location : existing.location;
  const notes = data.notes !== undefined ? data.notes : existing.notes;
  const isFavorite = data.is_favorite !== undefined ? (data.is_favorite ? 1 : 0) : (existing.is_favorite ? 1 : 0);

  db.prepare(`
    UPDATE stock_items
    SET name = ?, category = ?, quantity = ?, opened_items = ?, unit = ?, low_stock_threshold = ?, target_stock = ?, restock_target = ?, shopping_trigger = ?, expiry_days_threshold = ?, auto_add_to_shopping = ?, earliest_expiry_date = ?, location = ?, notes = ?, is_favorite = ?, updated_at = ?
    WHERE id = ? AND family_id = ?
  `).run(name, category, quantity, openedItemsJson, unit, lowThreshold, targetStock, targetStock, shoppingTrigger, expiryDaysThreshold, autoAddToShopping, expiry, location, notes, isFavorite, now, id, familyId);

  evaluateStockShoppingTriggers(familyId);

  return getStockItemById(familyId, id);
}

export function deleteStockItem(familyId: string, id: string) {
  const res = db.prepare(`DELETE FROM stock_items WHERE id = ? AND family_id = ?`).run(id, familyId);
  return res.changes > 0;
}

export function adjustStockItemQuantity(
  familyId: string,
  id: string,
  options: {
    action: 'add' | 'open' | 'use' | 'finish' | 'used_up' | 'set' | 'shopping_purchase' | 'consume_opened';
    amount: number;
    barcode?: string;
    expiry_date?: string | null;
    opened_item_id?: string | null;
    member_id?: string | null;
  }
) {
  processExpiredOpenedStock(familyId);

  const item = getStockItemById(familyId, id);
  if (!item) throw new Error('Stock item not found');

  const now = new Date().toISOString();
  let newQuantity = item.quantity;
  const amount = Math.max(1, Number(options.amount) || 1);
  let openedItems: any[] = item.opened_items || [];
  const action = options.action;

  if (action === 'add' || action === 'shopping_purchase') {
    newQuantity = item.quantity + amount;
  } else if (action === 'open' || action === 'use') {
    if (item.quantity < amount) {
      throw new Error(`Cannot open ${amount} ${item.unit || 'units'}. Only ${item.quantity} unopened ${item.unit || 'units'} available in stock.`);
    }
    newQuantity = item.quantity - amount;

    if (options.expiry_date && options.expiry_date.trim()) {
      openedItems = [
        ...openedItems,
        {
          id: 'opn_' + uuidv4().slice(0, 8),
          quantity: amount,
          expiry_date: options.expiry_date.trim(),
          opened_at: now,
        },
      ];
    }
  } else if (action === 'finish' || action === 'used_up') {
    let remainingToDeduct = amount;
    if (openedItems.length > 0) {
      const sortedOpened = [...openedItems].sort((a, b) => {
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return a.expiry_date.localeCompare(b.expiry_date);
      });

      const updatedOpened: any[] = [];
      for (const opn of sortedOpened) {
        if (remainingToDeduct <= 0) {
          updatedOpened.push(opn);
        } else {
          const opnQty = Number(opn.quantity) || 1;
          if (opnQty <= remainingToDeduct) {
            remainingToDeduct -= opnQty;
          } else {
            updatedOpened.push({
              ...opn,
              quantity: opnQty - remainingToDeduct,
            });
            remainingToDeduct = 0;
          }
        }
      }
      openedItems = updatedOpened;
    }
    if (remainingToDeduct > 0) {
      newQuantity = Math.max(0, item.quantity - remainingToDeduct);
    }
  } else if (action === 'consume_opened') {
    if (options.opened_item_id) {
      openedItems = openedItems.filter((opn) => opn.id !== options.opened_item_id);
    } else if (openedItems.length > 0) {
      openedItems = openedItems.slice(1);
    }
  } else if (action === 'set') {
    newQuantity = Math.max(0, amount);
  }

  db.prepare(`
    UPDATE stock_items
    SET quantity = ?, opened_items = ?, updated_at = ?
    WHERE id = ? AND family_id = ?
  `).run(newQuantity, JSON.stringify(openedItems), now, id, familyId);

  // Record log
  const logId = 'stl_' + uuidv4().slice(0, 8);
  const logQtyDelta = (action === 'add' || action === 'set' || action === 'shopping_purchase') ? amount : -amount;
  db.prepare(`
    INSERT INTO stock_logs (id, family_id, stock_item_id, action, quantity_changed, quantity_after, barcode, expiry_date, member_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    logId,
    familyId,
    id,
    action,
    logQtyDelta,
    newQuantity,
    options.barcode || null,
    options.expiry_date || null,
    options.member_id || null,
    now
  );

  if (action === 'add' || action === 'set' || action === 'shopping_purchase') {
    db.prepare(`
      DELETE FROM shopping_list_items
      WHERE family_id = ? AND is_completed = 1 AND (stock_item_id = ? OR LOWER(name) = LOWER(?))
    `).run(familyId, item.id, item.name);
  }

  evaluateStockShoppingTriggers(familyId);

  return getStockItemById(familyId, id);
}

export function addBarcodeToStockItem(
  familyId: string,
  stockItemId: string,
  barcode: string,
  brandOrLabel?: string,
  quantityDeltaPerScan: number = 1
) {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) throw new Error('Barcode cannot be empty');

  const now = new Date().toISOString();
  const existing = db.prepare(`
    SELECT * FROM stock_barcodes
    WHERE family_id = ? AND barcode = ?
  `).get(familyId, cleanBarcode) as any;

  if (existing) {
    // Re-link existing barcode to this stock item
    db.prepare(`
      UPDATE stock_barcodes
      SET stock_item_id = ?, brand_or_label = ?, quantity_delta_per_scan = ?, updated_at = ?
      WHERE id = ?
    `).run(stockItemId, brandOrLabel || existing.brand_or_label, quantityDeltaPerScan, now, existing.id);
    return existing.id;
  } else {
    const id = 'sbc_' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO stock_barcodes (id, family_id, stock_item_id, barcode, brand_or_label, quantity_delta_per_scan, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, familyId, stockItemId, cleanBarcode, brandOrLabel || null, quantityDeltaPerScan, now, now);
    return id;
  }
}

export function removeBarcodeFromStockItem(familyId: string, barcodeId: string) {
  const res = db.prepare(`DELETE FROM stock_barcodes WHERE id = ? AND family_id = ?`).run(barcodeId, familyId);
  return res.changes > 0;
}

// ==========================================
// SHOPPING LIST OPERATIONS
// ==========================================

export function getShoppingListItems(familyId: string) {
  evaluateStockShoppingTriggers(familyId);

  const items = db.prepare(`
    SELECT s.*, si.name as stock_item_name, si.quantity as stock_item_quantity, si.unit as stock_item_unit
    FROM shopping_list_items s
    LEFT JOIN stock_items si ON s.stock_item_id = si.id
    WHERE s.family_id = ?
    ORDER BY s.is_completed ASC, LOWER(s.name) ASC, s.name ASC
  `).all(familyId) as any[];

  return items.map((i) => ({
    ...i,
    is_completed: Boolean(i.is_completed),
    is_auto_generated: Boolean(i.is_auto_generated),
  }));
}

export function addShoppingListItem(familyId: string, data: {
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  stock_item_id?: string | null;
  notes?: string | null;
  added_by?: string | null;
}) {
  const id = 'shop_' + uuidv4().slice(0, 8);
  const now = new Date().toISOString();
  const name = data.name.trim();
  const quantity = Math.max(1, Number(data.quantity) || 1);
  const unit = data.unit || 'packs';
  const category = data.category || 'Pantry Essentials';
  const stockItemId = data.stock_item_id || null;
  const notes = data.notes || null;
  const addedBy = data.added_by || null;

  db.prepare(`
    INSERT INTO shopping_list_items (id, family_id, stock_item_id, name, quantity, unit, category, is_completed, is_auto_generated, notes, added_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
  `).run(id, familyId, stockItemId, name, quantity, unit, category, notes, addedBy, now, now);

  return db.prepare(`SELECT * FROM shopping_list_items WHERE id = ?`).get(id) as any;
}

export function updateShoppingListItem(familyId: string, id: string, data: {
  name?: string;
  quantity?: number;
  unit?: string;
  category?: string;
  notes?: string | null;
  is_completed?: boolean | number;
  stock_item_id?: string | null;
}) {
  const existing = db.prepare(`SELECT * FROM shopping_list_items WHERE id = ? AND family_id = ?`).get(id, familyId) as any;
  if (!existing) return null;

  const now = new Date().toISOString();
  const name = data.name !== undefined ? data.name.trim() : existing.name;
  const quantity = data.quantity !== undefined ? Math.max(1, Number(data.quantity)) : existing.quantity;
  const unit = data.unit !== undefined ? data.unit : existing.unit;
  const category = data.category !== undefined ? data.category : existing.category;
  const notes = data.notes !== undefined ? data.notes : existing.notes;
  const stockItemId = data.stock_item_id !== undefined ? data.stock_item_id : existing.stock_item_id;
  const isCompleted = data.is_completed !== undefined ? (data.is_completed ? 1 : 0) : existing.is_completed;
  const completedAt = isCompleted && !existing.is_completed ? now : (!isCompleted ? null : existing.completed_at);

  db.prepare(`
    UPDATE shopping_list_items
    SET name = ?, quantity = ?, unit = ?, category = ?, notes = ?, stock_item_id = ?, is_completed = ?, completed_at = ?, updated_at = ?
    WHERE id = ? AND family_id = ?
  `).run(name, quantity, unit, category, notes, stockItemId, isCompleted, completedAt, now, id, familyId);

  return db.prepare(`SELECT * FROM shopping_list_items WHERE id = ?`).get(id) as any;
}

export function toggleShoppingListItem(familyId: string, id: string, memberId?: string) {
  const existing = db.prepare(`SELECT * FROM shopping_list_items WHERE id = ? AND family_id = ?`).get(id, familyId) as any;
  if (!existing) return null;

  const now = new Date().toISOString();
  const newStatus = existing.is_completed ? 0 : 1;
  const completedAt = newStatus ? now : null;
  const completedBy = newStatus ? (memberId || null) : null;

  // IMPORTANT: Ticking a Shopping List item MUST NOT increase Stock, MUST NOT change Stock quantity, and MUST NOT create a stock entry.
  db.prepare(`
    UPDATE shopping_list_items
    SET is_completed = ?, completed_at = ?, completed_by = ?, updated_at = ?
    WHERE id = ? AND family_id = ?
  `).run(newStatus, completedAt, completedBy, now, id, familyId);

  return db.prepare(`SELECT * FROM shopping_list_items WHERE id = ?`).get(id) as any;
}

export function deleteShoppingListItem(familyId: string, id: string) {
  const res = db.prepare(`DELETE FROM shopping_list_items WHERE id = ? AND family_id = ?`).run(id, familyId);
  return res.changes > 0;
}

export function clearCompletedShoppingList(familyId: string) {
  const res = db.prepare(`DELETE FROM shopping_list_items WHERE family_id = ? AND is_completed = 1`).run(familyId);
  return res.changes;
}


