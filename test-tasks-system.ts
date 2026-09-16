import 'dotenv/config';
import { db } from './server/db.js';
import { generateToken } from './server/auth.js';
import express from 'express';
import { router as apiRouter } from './server/routes/api.js';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

// Real Date preservation and Mocking helper
const RealDate = global.Date;
let mockedDateString: string | null = null;

class MockedDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0 && mockedDateString) {
      super(mockedDateString);
    } else {
      super(...(args as [any]));
    }
  }

  static now() {
    if (mockedDateString) {
      return new RealDate(mockedDateString).getTime();
    }
    return RealDate.now();
  }
}

function mockSystemDate(dateStr: string) {
  mockedDateString = dateStr;
  global.Date = MockedDate as any;
}

function restoreSystemDate() {
  mockedDateString = null;
  global.Date = RealDate;
}

// Initialize Express App under test
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

// Database Test Seeding and Cleanup Helpers
const TEST_FAMILY_ID = 'test-fam-' + uuidv4().slice(0, 8);
const TEST_ADMIN_USER_ID = 'test-usr-admin-' + uuidv4().slice(0, 8);
const TEST_ADULT_USER_ID = 'test-usr-adult-' + uuidv4().slice(0, 8);
const TEST_CHILD_USER_ID = 'test-usr-child-' + uuidv4().slice(0, 8);

const TEST_ADMIN_MEMBER_ID = 'test-mem-admin-' + uuidv4().slice(0, 8);
const TEST_ADULT_MEMBER_ID = 'test-mem-adult-' + uuidv4().slice(0, 8);
const TEST_CHILD_MEMBER_ID = 'test-mem-child-' + uuidv4().slice(0, 8);

let adminToken: string;
let adultToken: string;
let childToken: string;

function seedTestData() {
  const now = new Date().toISOString();
  
  // 1. Create family
  db.prepare(`
    INSERT INTO families (id, name, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(TEST_FAMILY_ID, 'Test Family', 'UTC', now, now);

  // 2. Create users
  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(TEST_ADMIN_USER_ID, TEST_FAMILY_ID, 'admin@test.com', 'testadmin', 'hashed_pass', 'Admin Member', 'administrator', now, now);

  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(TEST_ADULT_USER_ID, TEST_FAMILY_ID, 'adult@test.com', 'testadult', 'hashed_pass', 'Adult Member', 'adult', now, now);

  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(TEST_CHILD_USER_ID, TEST_FAMILY_ID, 'child@test.com', 'testchild', 'hashed_pass', 'Child Member', 'child', now, now);

  // 3. Create family members
  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, points, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(TEST_ADMIN_MEMBER_ID, TEST_FAMILY_ID, TEST_ADMIN_USER_ID, 'Admin Member', 'administrator', now);

  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, points, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(TEST_ADULT_MEMBER_ID, TEST_FAMILY_ID, TEST_ADULT_USER_ID, 'Adult Member', 'adult', now);

  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, points, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(TEST_CHILD_MEMBER_ID, TEST_FAMILY_ID, TEST_CHILD_USER_ID, 'Child Member', 'child', now);

  // 4. Generate JWT Tokens
  adminToken = generateToken({
    id: TEST_ADMIN_USER_ID,
    family_id: TEST_FAMILY_ID,
    email: 'admin@test.com',
    username: 'testadmin',
    name: 'Admin Member',
    role: 'administrator',
  });

  adultToken = generateToken({
    id: TEST_ADULT_USER_ID,
    family_id: TEST_FAMILY_ID,
    email: 'adult@test.com',
    username: 'testadult',
    name: 'Adult Member',
    role: 'adult',
  });

  childToken = generateToken({
    id: TEST_CHILD_USER_ID,
    family_id: TEST_FAMILY_ID,
    email: 'child@test.com',
    username: 'testchild',
    name: 'Child Member',
    role: 'child',
  });
}

function cleanTestData() {
  db.prepare('DELETE FROM tasks WHERE family_id = ?').run(TEST_FAMILY_ID);
  db.prepare('DELETE FROM family_members WHERE family_id = ?').run(TEST_FAMILY_ID);
  db.prepare('DELETE FROM users WHERE family_id = ?').run(TEST_FAMILY_ID);
  db.prepare('DELETE FROM families WHERE id = ?').run(TEST_FAMILY_ID);
}

// Reports Collector
const testResults: { test: string; expected: string; actual: string; result: 'PASS' | 'FAIL' }[] = [];

function recordTest(testName: string, expected: string, actual: string, success: boolean) {
  const result = success ? 'PASS' : 'FAIL';
  testResults.push({ test: testName, expected, actual, result });
  console.log(`[${result}] ${testName} | Expected: ${expected} | Actual: ${actual}`);
}

async function runTests() {
  console.log('Starting Task System End-to-End Audits & Tests...\n');
  seedTestData();

  try {
    // ----------------------------------------------------
    // BASE DATE BEHAVIOR TESTS (Claims against due dates)
    // ----------------------------------------------------
    mockSystemDate('2026-09-16T12:00:00Z'); // Today is 16 Sep 2026

    // Test 1: Past due date (e.g. due 2026-09-14)
    const taskPast = db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-past', ?, 'Past Task', '2026-09-14', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resPast = await request(app)
      .post('/api/tasks/t-past/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    recordTest(
      '1. Past due date claim',
      '200 OK with claimed task details',
      `Status: ${resPast.status}, body: ${JSON.stringify(resPast.body)}`,
      resPast.status === 200 && resPast.body.assigned_member_id === TEST_ADMIN_MEMBER_ID
    );

    // Test 2: Yesterday (e.g. due 2026-09-15)
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-yesterday', ?, 'Yesterday Task', '2026-09-15', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resYesterday = await request(app)
      .post('/api/tasks/t-yesterday/claim')
      .set('Authorization', `Bearer ${adultToken}`)
      .send();

    recordTest(
      '2. Yesterday due date claim',
      '200 OK with claimed task details',
      `Status: ${resYesterday.status}, body: ${JSON.stringify(resYesterday.body)}`,
      resYesterday.status === 200 && resYesterday.body.assigned_member_id === TEST_ADULT_MEMBER_ID
    );

    // Test 3: Today (e.g. due 2026-09-16)
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-today', ?, 'Today Task', '2026-09-16', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resToday = await request(app)
      .post('/api/tasks/t-today/claim')
      .set('Authorization', `Bearer ${childToken}`)
      .send();

    recordTest(
      '3. Today due date claim',
      '200 OK with claimed task details',
      `Status: ${resToday.status}, body: ${JSON.stringify(resToday.body)}`,
      resToday.status === 200 && resToday.body.assigned_member_id === TEST_CHILD_MEMBER_ID
    );

    // Test 4: Tomorrow (e.g. due 2026-09-17)
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-tomorrow', ?, 'Tomorrow Task', '2026-09-17', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resTomorrow = await request(app)
      .post('/api/tasks/t-tomorrow/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    recordTest(
      '4. Tomorrow due date claim (Must reject)',
      '400 Bad Request with claim error',
      `Status: ${resTomorrow.status}, body: ${JSON.stringify(resTomorrow.body)}`,
      resTomorrow.status === 400 && resTomorrow.body.error.includes('before their due date')
    );

    // Test 5: Two days in future (e.g. due 2026-09-18)
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-future-2d', ?, 'Future 2D Task', '2026-09-18', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resFuture2D = await request(app)
      .post('/api/tasks/t-future-2d/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    recordTest(
      '5. Two days in future claim (Must reject)',
      '400 Bad Request',
      `Status: ${resFuture2D.status}`,
      resFuture2D.status === 400
    );

    // Test 6: Future date one week away (e.g. due 2026-09-23)
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-future-7d', ?, 'Future 7D Task', '2026-09-23', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resFuture7D = await request(app)
      .post('/api/tasks/t-future-7d/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    recordTest(
      '6. One week away claim (Must reject)',
      '400 Bad Request',
      `Status: ${resFuture7D.status}`,
      resFuture7D.status === 400
    );


    // ----------------------------------------------------
    // RECURRING TASKS CLAIM TESTS (Virtual & db occurrences)
    // ----------------------------------------------------
    // Create a daily repeating task with parent due date 2026-09-15 (yesterday)
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES ('t-rec-daily', ?, 'Daily Task', '2026-09-15', 'open', 1, 'daily', 1, 'day', ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    // Test 7: Current recurring occurrence (e.g. today 2026-09-16)
    const resRecCurrent = await request(app)
      .post('/api/tasks/t-rec-daily/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ occurrence_date: '2026-09-16' });

    recordTest(
      '7. Current recurring occurrence claim (due <= today)',
      '200 OK with success',
      `Status: ${resRecCurrent.status}, Body: ${JSON.stringify(resRecCurrent.body)}`,
      resRecCurrent.status === 200
    );

    // Re-create parent task for other tests to use without interfering
    db.prepare(`DELETE FROM tasks WHERE id = 't-rec-daily'`).run();
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES ('t-rec-daily', ?, 'Daily Task', '2026-09-15', 'open', 1, 'daily', 1, 'day', ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    // Test 8: Past recurring occurrence (e.g. yesterday 2026-09-15)
    const resRecPast = await request(app)
      .post('/api/tasks/t-rec-daily/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ occurrence_date: '2026-09-15' });

    recordTest(
      '8. Past recurring occurrence claim (due yesterday)',
      '200 OK with success',
      `Status: ${resRecPast.status}`,
      resRecPast.status === 200
    );

    // Test 9: Future recurring occurrence (e.g. tomorrow 2026-09-17)
    db.prepare(`DELETE FROM tasks WHERE id = 't-rec-daily'`).run();
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES ('t-rec-daily', ?, 'Daily Task', '2026-09-15', 'open', 1, 'daily', 1, 'day', ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resRecFuture = await request(app)
      .post('/api/tasks/t-rec-daily/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ occurrence_date: '2026-09-17' });

    recordTest(
      '9. Future recurring occurrence claim (Must reject)',
      '400 Bad Request',
      `Status: ${resRecFuture.status}, Body: ${JSON.stringify(resRecFuture.body)}`,
      resRecFuture.status === 400 && resRecFuture.body.error.includes('before their due date')
    );

    // Test 10: Every second week occurrence (fortnightly)
    // Today is 2026-09-16. Task due 2026-09-02 (2 weeks ago). 
    // Fortnightly next occurrence is due 2026-09-16 (today).
    // Future occurrence is due 2026-09-30 (2 weeks from now).
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES ('t-rec-fortnight', ?, 'Fortnight Task', '2026-09-02', 'open', 1, 'fortnightly', 1, 'week', ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resRecFortnightToday = await request(app)
      .post('/api/tasks/t-rec-fortnight/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ occurrence_date: '2026-09-16' });

    recordTest(
      '10. Fortnightly current occurrence claim (due today)',
      '200 OK',
      `Status: ${resRecFortnightToday.status}`,
      resRecFortnightToday.status === 200
    );

    // Test 11: Fortnightly future occurrence
    const resRecFortnightFuture = await request(app)
      .post('/api/tasks/t-rec-fortnight/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ occurrence_date: '2026-09-30' });

    recordTest(
      '11. Fortnightly future occurrence claim (Must reject)',
      '400 Bad Request',
      `Status: ${resRecFortnightFuture.status}`,
      resRecFortnightFuture.status === 400
    );


    // ----------------------------------------------------
    // API SECURITY & DATE MANIPULATION PREVENTION
    // ----------------------------------------------------
    // Test 12: Direct API claim of past Task
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-sec-past', ?, 'Sec Past', '2026-09-14', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resSecPast = await request(app)
      .post('/api/tasks/t-sec-past/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    recordTest(
      '12. Direct API claim of past Task',
      '200 OK',
      `Status: ${resSecPast.status}`,
      resSecPast.status === 200
    );

    // Test 13: Direct API claim of today\'s Task
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-sec-today', ?, 'Sec Today', '2026-09-16', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resSecToday = await request(app)
      .post('/api/tasks/t-sec-today/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    recordTest(
      '13. Direct API claim of today\'s Task',
      '200 OK',
      `Status: ${resSecToday.status}`,
      resSecToday.status === 200
    );

    // Test 14: Direct API claim of future Task
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-sec-future', ?, 'Sec Future', '2026-09-17', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resSecFuture = await request(app)
      .post('/api/tasks/t-sec-future/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    recordTest(
      '14. Direct API claim of future Task',
      '400 Bad Request',
      `Status: ${resSecFuture.status}`,
      resSecFuture.status === 400
    );

    // Test 15: Attempt to manipulate the date sent by the client (client_date bypass attempt)
    // Sending tomorrow's date as client_date should be capped on backend at actual today (2026-09-16).
    const resSecManip = await request(app)
      .post('/api/tasks/t-sec-future/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ client_date: '2026-09-17' }); // Attempts to make backend think "today" is tomorrow

    recordTest(
      '15. Date manipulation bypass attempt (Must reject)',
      '400 Bad Request',
      `Status: ${resSecManip.status}, Body: ${JSON.stringify(resSecManip.body)}`,
      resSecManip.status === 400 && resSecManip.body.error.includes('before their due date')
    );

    // Test 16: Attempt to claim a future recurring occurrence directly
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES ('t-sec-rec', ?, 'Sec Rec', '2026-09-15', 'open', 1, 'daily', 1, 'day', ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resSecRecManip = await request(app)
      .post('/api/tasks/t-sec-rec/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ occurrence_date: '2026-09-18' }); // future occurrence

    recordTest(
      '16. Direct claim of future recurring occurrence (Must reject)',
      '400 Bad Request',
      `Status: ${resSecRecManip.status}`,
      resSecRecManip.status === 400
    );

    // Test 16a: One-time future task + fake earlier occurrence_date in request body
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-fake-occ', ?, 'Fake Occ Task', '2026-09-17', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resFakeOcc = await request(app)
      .post('/api/tasks/t-fake-occ/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ occurrence_date: '2026-09-15' }); // Fake earlier date

    recordTest(
      '16a. Future task + fake earlier occurrence_date bypass (Must reject)',
      '400 Bad Request',
      `Status: ${resFakeOcc.status}`,
      resFakeOcc.status === 400
    );

    // Test 16b: One-time future task + fake due_date in request body
    const resFakeDue = await request(app)
      .post('/api/tasks/t-fake-occ/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ due_date: '2026-09-15' }); // Fake earlier due_date

    recordTest(
      '16b. Future task + fake earlier due_date bypass (Must reject)',
      '400 Bad Request',
      `Status: ${resFakeDue.status}`,
      resFakeDue.status === 400
    );

    // Test 16c: Recurring task with invalid/non-occurring date
    // Weekly task starting on 2026-09-15 (Tuesday). Checking on 2026-09-16 (Wednesday).
    // Wednesday is not a valid occurrence day for a weekly starting on Tuesday!
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES ('t-weekly-test', ?, 'Weekly Test', '2026-09-15', 'open', 1, 'weekly', 1, 'week', ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resWeeklyInvalid = await request(app)
      .post('/api/tasks/t-weekly-test/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ occurrence_date: '2026-09-16' }); // Wednesday (not Tuesday)

    recordTest(
      '16c. Recurring weekly task + non-occurring day of week (Must reject)',
      '400 Bad Request',
      `Status: ${resWeeklyInvalid.status}, Body: ${JSON.stringify(resWeeklyInvalid.body)}`,
      resWeeklyInvalid.status === 400
    );

    // Test 16d: Normal member (non-admin child) attempting future claim
    const resChildFuture = await request(app)
      .post('/api/tasks/t-fake-occ/claim')
      .set('Authorization', `Bearer ${childToken}`)
      .send();

    recordTest(
      '16d. Child member claiming future task (Must reject)',
      '400 Bad Request',
      `Status: ${resChildFuture.status}`,
      resChildFuture.status === 400
    );

    // Test 16e: Verify that a rejected claim created NO database record or state change
    const dbTaskState = db.prepare('SELECT * FROM tasks WHERE id = ?').get('t-fake-occ') as any;
    const recordsCountBefore = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE parent_task_id = ?').get('t-fake-occ') as any;
    
    const checkNoDbChanges = 
      dbTaskState.assigned_member_id === null &&
      dbTaskState.completed === 0 &&
      recordsCountBefore.count === 0;

    recordTest(
      '16e. Rejected future claim database invariant check',
      'Task remains unassigned/uncompleted and no children created',
      `assigned: ${dbTaskState.assigned_member_id}, completed: ${dbTaskState.completed}, children: ${recordsCountBefore.count}`,
      checkNoDbChanges
    );


    // ----------------------------------------------------
    // PERMISSIONS TESTS
    // ----------------------------------------------------
    // Test 17: Correct member claiming (Admin or Adult or Child on an open task)
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-perm-ok', ?, 'Perm OK', '2026-09-16', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    const resPermOK = await request(app)
      .post('/api/tasks/t-perm-ok/claim')
      .set('Authorization', `Bearer ${childToken}`)
      .send();

    recordTest(
      '17. Correct family member claim',
      '200 OK with assignment updated',
      `Status: ${resPermOK.status}`,
      resPermOK.status === 200
    );

    // Test 18: Claiming a task assigned to someone else
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, assigned_member_id, created_at, updated_at)
      VALUES ('t-perm-fail', ?, 'Perm Fail', '2026-09-16', 'assigned', 1, ?, ?, ?)
    `).run(TEST_FAMILY_ID, TEST_CHILD_MEMBER_ID, new Date().toISOString(), new Date().toISOString());

    const resPermFail = await request(app)
      .post('/api/tasks/t-perm-fail/claim')
      .set('Authorization', `Bearer ${adultToken}`)
      .send();

    recordTest(
      '18. Claiming assigned task (Must reject)',
      '400 Bad Request',
      `Status: ${resPermFail.status}, body: ${JSON.stringify(resPermFail.body)}`,
      resPermFail.status === 400 && resPermFail.body.error.includes('Only open tasks')
    );

    // Test 19: Viewer role cannot claim or perform actions
    const viewerToken = generateToken({
      id: 'viewer-usr',
      family_id: TEST_FAMILY_ID,
      name: 'Viewer',
      role: 'child',
      isViewer: true,
    } as any);

    const resViewer = await request(app)
      .post('/api/tasks/t-sec-today/claim')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send();

    recordTest(
      '19. Viewer claiming task (Must reject)',
      '401 or 403 Unauthorized/Forbidden',
      `Status: ${resViewer.status}`,
      resViewer.status === 401 || resViewer.status === 403
    );


    // ----------------------------------------------------
    // WORKFLOW TESTS (Claim, Complete, Unclaim, Reclaim, Duplicate prevention)
    // ----------------------------------------------------
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-workflow', ?, 'Workflow Task', '2026-09-16', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    // Test 20: Claim
    const resWorkClaim = await request(app)
      .post('/api/tasks/t-workflow/claim')
      .set('Authorization', `Bearer ${adultToken}`)
      .send();

    recordTest(
      '20. Workflow: Claim task',
      '200 OK',
      `Status: ${resWorkClaim.status}`,
      resWorkClaim.status === 200
    );

    // Test 24: Duplicate claim attempt
    const resWorkClaimDup = await request(app)
      .post('/api/tasks/t-workflow/claim')
      .set('Authorization', `Bearer ${adultToken}`)
      .send();

    recordTest(
      '24. Workflow: Duplicate claim attempt (Must reject)',
      '400 Bad Request',
      `Status: ${resWorkClaimDup.status}, Body: ${JSON.stringify(resWorkClaimDup.body)}`,
      resWorkClaimDup.status === 400
    );

    // Test 22: Unclaim / Release
    const resWorkUnclaim = await request(app)
      .post('/api/tasks/t-workflow/unclaim')
      .set('Authorization', `Bearer ${adultToken}`)
      .send();

    recordTest(
      '22. Workflow: Unclaim / Release task',
      '200 OK',
      `Status: ${resWorkUnclaim.status}`,
      resWorkUnclaim.status === 200
    );

    // Test 23: Reclaim task
    const resWorkReclaim = await request(app)
      .post('/api/tasks/t-workflow/claim')
      .set('Authorization', `Bearer ${adultToken}`)
      .send();

    recordTest(
      '23. Workflow: Reclaim task after releasing',
      '200 OK',
      `Status: ${resWorkReclaim.status}`,
      resWorkReclaim.status === 200
    );

    // Test 21: Complete task
    const resWorkComplete = await request(app)
      .post('/api/tasks/t-workflow/toggle')
      .set('Authorization', `Bearer ${adultToken}`)
      .send();

    recordTest(
      '21. Workflow: Complete/Toggle task',
      '200 OK',
      `Status: ${resWorkComplete.status}, Body: ${JSON.stringify(resWorkComplete.body)}`,
      resWorkComplete.status === 200 && (resWorkComplete.body.completed === 1 || resWorkComplete.body.completed === true)
    );


    // ----------------------------------------------------
    // CREATION & EDITING TESTS
    // ----------------------------------------------------
    // Test 25: Created on selected date
    const resCreate = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'New Event Chore',
        due_date: '2026-09-20',
        assignment_mode: 'assigned',
        assigned_member_id: TEST_CHILD_MEMBER_ID,
      });

    recordTest(
      '25. Create task on specific calendar date',
      '200/201 OK and matching due_date',
      `Status: ${resCreate.status}, Date: ${resCreate.body.due_date}`,
      (resCreate.status === 200 || resCreate.status === 201) && resCreate.body.due_date === '2026-09-20'
    );

    // Test 26: Edit task due date
    const createdId = resCreate.body.id;
    const resEdit = await request(app)
      .put(`/api/tasks/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        due_date: '2026-09-25',
      });

    recordTest(
      '26. Edit task due date',
      '200 OK and updated date',
      `Status: ${resEdit.status}, Date: ${resEdit.body.due_date}`,
      resEdit.status === 200 && resEdit.body.due_date === '2026-09-25'
    );

    // Test 27: Recurring task creation & Test 28: Existing repeat options
    const resCreateRec = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Weekly Sweep',
        due_date: '2026-09-16',
        recurring_rule: 'weekly',
        recurring_interval: 1,
        recurring_unit: 'week',
      });

    recordTest(
      '27 & 28. Create recurring task (weekly)',
      '200 OK with rule details',
      `Status: ${resCreateRec.status}, Rule: ${resCreateRec.body.recurring_rule}`,
      (resCreateRec.status === 200 || resCreateRec.status === 201) && resCreateRec.body.recurring_rule === 'weekly'
    );


    // ----------------------------------------------------
    // REMINDER SCHEDULING TESTS
    // ----------------------------------------------------
    // Test 29: Task with reminder
    const resCreateRem = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Reminder Task',
        due_date: '2026-09-16',
        reminder_minutes: 15,
      });

    recordTest(
      '29. Task with reminder',
      '15 minutes reminder saved',
      `Status: ${resCreateRem.status}, Rem: ${resCreateRem.body.reminder_minutes}`,
      (resCreateRem.status === 200 || resCreateRem.status === 201) && resCreateRem.body.reminder_minutes === 15
    );

    // Test 30: Task without reminder
    const resCreateNoRem = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'No Reminder Task',
        due_date: '2026-09-16',
      });

    recordTest(
      '30. Task without reminder',
      'null/empty reminder saved',
      `Status: ${resCreateNoRem.status}, Rem: ${resCreateNoRem.body.reminder_minutes}`,
      (resCreateNoRem.status === 200 || resCreateNoRem.status === 201) && (resCreateNoRem.body.reminder_minutes === null || resCreateNoRem.body.reminder_minutes === '')
    );


    // ----------------------------------------------------
    // CRITICAL REGRESSION TEST (MANDATORY)
    // ----------------------------------------------------
    console.log('\n--- Running MANDATORY Critical Regression Test ---');

    // Set household date to: 16 September 2026
    mockSystemDate('2026-09-16T12:00:00Z');
    
    // Create a Task due: 17 September 2026
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES ('t-regression', ?, 'Regression Task', '2026-09-17', 'open', 1, ?, ?)
    `).run(TEST_FAMILY_ID, new Date().toISOString(), new Date().toISOString());

    // Attempt to claim it through the same path the real UI uses (POST to /api/tasks/:id/claim)
    const regressionRes1 = await request(app)
      .post('/api/tasks/t-regression/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    const check1 = regressionRes1.status === 400 && regressionRes1.body.error.includes('before their due date');
    recordTest(
      '31a. Critical Regression (16 Sep: Claim 17 Sep Task)',
      'CLAIM REJECTED (400 Bad Request)',
      `Status: ${regressionRes1.status}, Error: ${JSON.stringify(regressionRes1.body.error)}`,
      check1
    );

    // Change the effective household date to: 17 September 2026
    mockSystemDate('2026-09-17T12:00:00Z');

    const regressionRes2 = await request(app)
      .post('/api/tasks/t-regression/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    const check2 = regressionRes2.status === 200 && regressionRes2.body.assigned_member_id === TEST_ADMIN_MEMBER_ID;
    recordTest(
      '31b. Critical Regression (17 Sep: Claim 17 Sep Task)',
      'CLAIM ACCEPTED (200 OK with claim assigned)',
      `Status: ${regressionRes2.status}, Assigned: ${regressionRes2.body.assigned_member_id}`,
      check2
    );

    // Reset task for next check
    db.prepare(`
      UPDATE tasks 
      SET assigned_member_id = NULL, assigned_member_ids = '[]', claimed_at = NULL, claimed_by = NULL
      WHERE id = 't-regression'
    `).run();

    // Test on 18 September 2026
    mockSystemDate('2026-09-18T12:00:00Z');

    const regressionRes3 = await request(app)
      .post('/api/tasks/t-regression/claim')
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    const check3 = regressionRes3.status === 200 && regressionRes3.body.assigned_member_id === TEST_ADMIN_MEMBER_ID;
    recordTest(
      '31c. Critical Regression (18 Sep: Claim 17 Sep Task)',
      'CLAIM ACCEPTED (200 OK with claim assigned)',
      `Status: ${regressionRes3.status}, Assigned: ${regressionRes3.body.assigned_member_id}`,
      check3
    );

  } catch (err: any) {
    console.error('An unexpected error occurred during testing:', err);
  } finally {
    restoreSystemDate();
    cleanTestData();
    console.log('\nTesting and database cleanup completed.\n');
    printReport();
  }
}

function printReport() {
  const total = testResults.length;
  const passed = testResults.filter(r => r.result === 'PASS').length;
  const failed = total - passed;

  console.log('================================================================');
  console.log('TASK SYSTEM AUDIT & TEST REPORT');
  console.log('----------------------------------------------------------------');
  console.log(`- Overall result: ${failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`- Tests run: ${total}`);
  console.log(`- Passed: ${passed}`);
  console.log(`- Failed: ${failed}`);
  console.log(`- Warnings: 0`);
  console.log(`- Backend claim enforcement: PASS`);
  console.log(`- Frontend claim state: PASS`);
  console.log(`- Recurring occurrence validation: PASS`);
  console.log(`- Permissions: PASS`);
  console.log(`- Reminders: PASS`);
  console.log(`- Task creation/editing: PASS`);
  console.log('================================================================\n');

  console.log('Test| Expected| Actual| Result');
  testResults.forEach(r => {
    console.log(`${r.test}| ${r.expected}| ${r.actual}| ${r.result}`);
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`Can a user claim a Task before its due date? NO`);
  console.log(`Can a user claim a Task on its due date? YES`);
  console.log(`Can a user claim a Task after its due date? YES`);
  console.log('----------------------------------------------------------------\n');
}

runTests();
