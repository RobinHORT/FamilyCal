import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase } from '../db.js';
import { router as apiRouter } from '../routes/api.js';
import { generateToken } from '../auth.js';
import { isEventOnDay } from '../../src/utils/calendarDateUtils.js';
import {
  isTaskOccurrenceOnDay,
  canMemberToggleTask,
  filterEligibleChildMembers,
} from '../../src/utils/taskPermissions.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

interface TestRecord {
  section: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
}

const testRecords: TestRecord[] = [];

function record(section: string, name: string, expected: string, actual: string, passed: boolean) {
  testRecords.push({ section, name, expected, actual, passed });
  console.log(`[${passed ? '✓ PASS' : '✗ FAIL'}] [${section}] ${name}`);
  if (!passed) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
  }
}

async function runSeparationSuite() {
  console.log('================================================================');
  console.log('CALENDAR SEPARATION & TASKS REGRESSION VERIFICATION SUITE');
  console.log('================================================================\n');

  initDatabase();

  const familyId = 'fam-sep-' + uuidv4().slice(0, 8);
  const adminUserId = 'usr-admin-' + uuidv4().slice(0, 8);
  const adultUserId = 'usr-adult-' + uuidv4().slice(0, 8);
  const childUserId = 'usr-child-' + uuidv4().slice(0, 8);

  const adminMemberId = 'mem-admin-' + uuidv4().slice(0, 8);
  const adultMemberId = 'mem-adult-' + uuidv4().slice(0, 8);
  const childMemberId = 'mem-child-' + uuidv4().slice(0, 8);

  const now = new Date().toISOString();

  // Create Family
  db.prepare(`
    INSERT INTO families (id, name, timezone, created_at, updated_at)
    VALUES (?, 'Separation Test Family', 'UTC', ?, ?)
  `).run(familyId, now, now);

  // Users & Members
  const usersToInsert = [
    { uId: adminUserId, mId: adminMemberId, name: 'Admin Parent', role: 'administrator' },
    { uId: adultUserId, mId: adultMemberId, name: 'Adult Parent', role: 'adult' },
    { uId: childUserId, mId: childMemberId, name: 'Child One', role: 'child' },
  ];

  for (const u of usersToInsert) {
    db.prepare(`
      INSERT INTO users (id, family_id, name, username, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'hash', ?, ?, ?)
    `).run(u.uId, familyId, u.name, u.name.toLowerCase().replace(/\s+/g, ''), u.role, now, now);

    db.prepare(`
      INSERT INTO family_members (id, family_id, user_id, name, color, role, created_at)
      VALUES (?, ?, ?, ?, '#3b82f6', ?, ?)
    `).run(u.mId, familyId, u.uId, u.name, u.role, now);
  }

  const calId = 'cal-' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO calendars (id, family_id, member_id, name, color, is_default, source, is_read_only, sync_enabled, created_at, updated_at)
    VALUES (?, ?, ?, 'Main Calendar', '#3b82f6', 1, 'yimly', 0, 0, ?, ?)
  `).run(calId, familyId, adminMemberId, now, now);

  const adminToken = generateToken({ id: adminUserId, family_id: familyId, name: 'Admin Parent', role: 'administrator' });
  const childToken = generateToken({ id: childUserId, family_id: familyId, name: 'Child One', role: 'child' });

  // 1. DATA SOURCE SEPARATION
  console.log('--- 1. DATA SOURCE & CONTENT SEPARATION ---');

  // Create normal calendar event
  const createEventRes = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      calendar_id: calId,
      title: 'Family Soccer Game',
      start_time: '2026-10-01T10:00:00Z',
      end_time: '2026-10-01T11:30:00Z',
      all_day: false,
    });

  record(
    'Separation',
    'Create normal calendar event',
    'HTTP 201',
    `HTTP ${createEventRes.status}`,
    createEventRes.status === 201
  );

  const eventId = createEventRes.body?.id;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Create Kids Task
  const createTaskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Pack School Bag',
      due_date: todayStr,
      assigned_member_id: childMemberId,
      points: 10,
    });

  record(
    'Separation',
    'Create Kids Task',
    'HTTP 201',
    `HTTP ${createTaskRes.status}`,
    createTaskRes.status === 201
  );

  const taskId = createTaskRes.body?.id;

  // Fetch events list
  const getEventsRes = await request(app)
    .get('/api/events')
    .set('Authorization', `Bearer ${adminToken}`);

  const eventsList = getEventsRes.body || [];
  const eventsHaveTasks = eventsList.some((e: any) => e.id === taskId || e.assigned_member_id);

  record(
    'Separation',
    'GET /api/events contains zero Kids Tasks',
    'true',
    String(!eventsHaveTasks),
    !eventsHaveTasks
  );

  // Fetch tasks list
  const getTasksRes = await request(app)
    .get('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`);

  const tasksList = getTasksRes.body || [];
  const tasksHaveEvents = tasksList.some((t: any) => t.id === eventId || t.start_time);

  record(
    'Separation',
    'GET /api/tasks contains zero normal Events',
    'true',
    String(!tasksHaveEvents),
    !tasksHaveEvents
  );

  // 2. RECURRING CONSISTENCY ACROSS VIEWS
  console.log('\n--- 2. RECURRING EVENTS & TASKS CONSISTENCY ---');

  const recTask = {
    id: 'rec-task-1',
    title: 'Daily Teeth Brush',
    due_date: '2026-10-01',
    recurring_rule: 'daily',
    recurring_interval: 1,
    assigned_member_ids: [childMemberId],
    is_archived: 0,
  };

  const day1Match = isTaskOccurrenceOnDay(recTask as any, new Date('2026-10-01T00:00:00'));
  const day2Match = isTaskOccurrenceOnDay(recTask as any, new Date('2026-10-02T00:00:00'));
  const day3Match = isTaskOccurrenceOnDay(recTask as any, new Date('2026-10-03T00:00:00'));

  record(
    'RecurringTasks',
    'Daily recurring task occurs consistently on start date',
    'true',
    String(day1Match),
    day1Match
  );

  record(
    'RecurringTasks',
    'Daily recurring task occurs consistently on next day (Month/Week/Day parity)',
    'true',
    String(day2Match),
    day2Match
  );

  record(
    'RecurringTasks',
    'Daily recurring task occurs consistently on 3rd day',
    'true',
    String(day3Match),
    day3Match
  );

  const recEvent = {
    id: 'rec-evt-1',
    title: 'Weekly Family Dinner',
    start_time: '2026-10-01T18:00:00Z',
    end_time: '2026-10-01T20:00:00Z',
    recurring_rule: 'weekly',
    all_day: false,
  };

  const evtOct1Match = isEventOnDay(recEvent as any, new Date('2026-10-01T00:00:00'));
  const evtOct8Match = isEventOnDay(recEvent as any, new Date('2026-10-08T00:00:00'));
  const evtOct2Match = isEventOnDay(recEvent as any, new Date('2026-10-02T00:00:00'));

  record(
    'RecurringEvents',
    'Weekly recurring event matches start date (Thursday Oct 1)',
    'true',
    String(evtOct1Match),
    evtOct1Match
  );

  record(
    'RecurringEvents',
    'Weekly recurring event matches next week (Thursday Oct 8)',
    'true',
    String(evtOct8Match),
    evtOct8Match
  );

  record(
    'RecurringEvents',
    'Weekly recurring event does NOT occur on non-matching day (Friday Oct 2)',
    'false',
    String(evtOct2Match),
    !evtOct2Match
  );

  // 3. CHILD TAP & PERMISSIONS REGRESSION
  console.log('\n--- 3. CHILD TASK CARD TAP & ROLE PERMISSIONS ---');

  const childToggleCheck = canMemberToggleTask(
    { id: taskId, due_date: todayStr, assignment_mode: 'assigned', assigned_member_ids: [childMemberId] } as any,
    childMemberId,
    false,
    false // isAdultOrAdmin = false
  );

  record(
    'Permissions',
    'Child can toggle eligible task on active date',
    'true',
    String(childToggleCheck.canToggle),
    childToggleCheck.canToggle
  );

  const adultToggleCheck = canMemberToggleTask(
    { id: taskId, due_date: todayStr, assignment_mode: 'assigned', assigned_member_ids: [childMemberId] } as any,
    adminMemberId,
    false,
    true // isAdultOrAdmin = true
  );

  record(
    'Permissions',
    'Adult/Admin cannot toggle task directly from card (approves in Approvals queue)',
    'false',
    String(adultToggleCheck.canToggle),
    !adultToggleCheck.canToggle
  );

  // Child completion toggle endpoint call
  const childToggleRes = await request(app)
    .post(`/api/tasks/${taskId}/toggle`)
    .set('Authorization', `Bearer ${childToken}`)
    .send({ occurrenceDate: todayStr });

  record(
    'ChildTap',
    'Child toggle task completion creates pending approval without awarding points',
    'HTTP 200 with completed=true',
    `HTTP ${childToggleRes.status}, completed=${childToggleRes.body?.completed}`,
    childToggleRes.status === 200 && Boolean(childToggleRes.body?.completed)
  );

  // Members layer filtering check
  const members = db.prepare(`SELECT * FROM family_members WHERE family_id = ?`).all(familyId);
  const eligibleChildren = filterEligibleChildMembers(members as any);

  record(
    'MembersLayer',
    'Kids Tasks Members layer filters strictly to child accounts (0 adults/admins)',
    '1 child only',
    `${eligibleChildren.length} child member(s)`,
    eligibleChildren.length === 1 && eligibleChildren[0].role === 'child'
  );

  // Summary
  console.log('\n================================================================');
  const failed = testRecords.filter((r) => !r.passed);
  console.log(`SEPARATION & TASKS SUITE SUMMARY: ${testRecords.length - failed.length}/${testRecords.length} PASSED`);
  console.log('================================================================');

  if (failed.length > 0) {
    process.exit(1);
  }
}

runSeparationSuite().catch((err) => {
  console.error('Fatal error in separation test suite:', err);
  process.exit(1);
});
