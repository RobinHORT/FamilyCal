import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase } from '../db.js';
import { router as apiRouter } from '../routes/api.js';
import { generateToken } from '../auth.js';

// Setup Express application instance for testing
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

// Test Suite Helper Interfaces
interface TestCaseResult {
  requirementNumber: number;
  description: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

const testResults: TestCaseResult[] = [];

function recordTest(
  requirementNumber: number,
  description: string,
  passed: boolean,
  expected: string,
  actual: string,
  details?: string
) {
  testResults.push({
    requirementNumber,
    description,
    passed,
    expected,
    actual,
    details,
  });

  const statusSymbol = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`[Req ${requirementNumber}] ${statusSymbol}: ${description}`);
  if (!passed || details) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    if (details) console.log(`   Details:  ${details}`);
  }
}

// Date helpers
function addDays(baseDateStr: string, days: number): string {
  const d = new Date(baseDateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function getLocalToday(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function runClaimVerificationSuite() {
  console.log('\n================================================================');
  console.log('TASK CLAIMING SPECIFICATION VERIFICATION SUITE (15 REQUIREMENTS)');
  console.log('Rule: CURRENT FAMILY LOCAL DATE >= THE ACTUAL TASK OCCURRENCE DUE DATE');
  console.log('================================================================\n');

  initDatabase();

  const suiteSuffix = uuidv4().slice(0, 8);
  const PRIMARY_TZ = 'America/Los_Angeles';
  const PRIMARY_FAM_ID = `audit-fam-${suiteSuffix}`;
  const nowStr = new Date().toISOString();
  const localToday = getLocalToday(PRIMARY_TZ);
  const yesterday = addDays(localToday, -1);
  const tomorrow = addDays(localToday, 1);
  const twoWeeksAgo = addDays(localToday, -14);
  const twoWeeksFuture = addDays(localToday, 14);

  // 1. Seed Primary Family
  db.prepare(`
    INSERT INTO families (id, name, timezone, created_at, updated_at)
    VALUES (?, 'Verification Family', ?, ?, ?)
  `).run(PRIMARY_FAM_ID, PRIMARY_TZ, nowStr, nowStr);

  // Seed Primary Users and Members (Adult 1, Adult 2, Adult 3)
  const users = [
    { id: `usr-1-${suiteSuffix}`, email: `u1-${suiteSuffix}@test.com`, name: 'Member One' },
    { id: `usr-2-${suiteSuffix}`, email: `u2-${suiteSuffix}@test.com`, name: 'Member Two' },
    { id: `usr-3-${suiteSuffix}`, email: `u3-${suiteSuffix}@test.com`, name: 'Member Three' },
  ];

  const members: { id: string; userId: string; token: string; name: string }[] = [];

  for (const u of users) {
    db.prepare(`
      INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'hash', ?, 'adult', 1, ?, ?)
    `).run(u.id, PRIMARY_FAM_ID, u.email, u.email.split('@')[0], u.name, nowStr, nowStr);

    const memId = `mem-${u.id}`;
    db.prepare(`
      INSERT INTO family_members (id, family_id, user_id, name, role, color, points, created_at)
      VALUES (?, ?, ?, ?, 'adult', '#FF4FA3', 0, ?)
    `).run(memId, PRIMARY_FAM_ID, u.id, u.name, nowStr);

    const token = generateToken({
      id: u.id,
      family_id: PRIMARY_FAM_ID,
      email: u.email,
      username: u.email.split('@')[0],
      name: u.name,
      role: 'adult',
    });

    members.push({ id: memId, userId: u.id, token, name: u.name });
  }

  const [member1, member2, member3] = members;

  // --------------------------------------------------------------------------
  // REQUIREMENT 1: A one-off task due tomorrow cannot be claimed today
  // --------------------------------------------------------------------------
  {
    const taskId = `req1-task-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES (?, ?, 'Task Due Tomorrow', ?, 'open', 1, ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, tomorrow, nowStr, nowStr);

    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({});

    const passed = res.status === 400 && typeof res.body?.error === 'string' && res.body.error.toLowerCase().includes('cannot be claimed');
    recordTest(
      1,
      'A one-off task due tomorrow cannot be claimed today',
      passed,
      'HTTP 400 Bad Request with rejection message',
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 2: A one-off task due today can be claimed
  // --------------------------------------------------------------------------
  {
    const taskId = `req2-task-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES (?, ?, 'Task Due Today', ?, 'open', 1, ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, localToday, nowStr, nowStr);

    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({});

    const passed = res.status === 200 && res.body?.assigned_member_id === member1.id;
    recordTest(
      2,
      'A one-off task due today can be claimed',
      passed,
      `HTTP 200 with assigned_member_id = ${member1.id}`,
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 3: A one-off task due yesterday can still be claimed
  // --------------------------------------------------------------------------
  {
    const taskId = `req3-task-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES (?, ?, 'Task Due Yesterday', ?, 'open', 1, ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, yesterday, nowStr, nowStr);

    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({});

    const passed = res.status === 200 && res.body?.assigned_member_id === member1.id;
    recordTest(
      3,
      'A one-off task due yesterday can still be claimed',
      passed,
      `HTTP 200 with assigned_member_id = ${member1.id}`,
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 4: A future recurring occurrence cannot be claimed
  // --------------------------------------------------------------------------
  {
    const taskId = `req4-rec-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES (?, ?, 'Daily Recurring Task', ?, 'open', 1, 'daily', 1, 'day', ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, yesterday, nowStr, nowStr);

    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ occurrence_date: tomorrow });

    const passed = res.status === 400 && typeof res.body?.error === 'string';
    recordTest(
      4,
      'A future recurring occurrence cannot be claimed',
      passed,
      'HTTP 400 Bad Request',
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 5: A current recurring occurrence can be claimed
  // --------------------------------------------------------------------------
  {
    const taskId = `req5-rec-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES (?, ?, 'Daily Recurring Task Today', ?, 'open', 1, 'daily', 1, 'day', ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, yesterday, nowStr, nowStr);

    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ occurrence_date: localToday });

    const passed = res.status === 200 && res.body?.assigned_member_id === member1.id && res.body?.due_date === localToday;
    recordTest(
      5,
      'A current recurring occurrence can be claimed',
      passed,
      `HTTP 200 with spawned occurrence row for date ${localToday}`,
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 6: An overdue recurring occurrence can still be claimed
  // --------------------------------------------------------------------------
  {
    const taskId = `req6-rec-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES (?, ?, 'Daily Overdue Recurring Task', ?, 'open', 1, 'daily', 1, 'day', ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, yesterday, nowStr, nowStr);

    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ occurrence_date: yesterday });

    const passed = res.status === 200 && res.body?.assigned_member_id === member1.id && res.body?.due_date === yesterday;
    recordTest(
      6,
      'An overdue recurring occurrence can still be claimed',
      passed,
      `HTTP 200 with spawned occurrence row for date ${yesterday}`,
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 7: A non-occurring date for a recurring task cannot be claimed
  // --------------------------------------------------------------------------
  {
    // Weekly task anchored on Friday '2026-09-04'
    const taskId = `req7-weekly-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES (?, ?, 'Weekly Friday Task', '2026-09-04', 'open', 1, 'weekly', 1, 'week', ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, nowStr, nowStr);

    // Attempt to claim Saturday '2026-09-05' (non-occurring step)
    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ occurrence_date: '2026-09-05' });

    const passed = res.status === 400 && typeof res.body?.error === 'string' && res.body.error.toLowerCase().includes('occurrence');
    recordTest(
      7,
      'A non-occurring date for a recurring task cannot be claimed',
      passed,
      'HTTP 400 Bad Request rejecting invalid recurrence date step',
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 8: Changing occurrence_date in the request cannot make a future task claimable
  // --------------------------------------------------------------------------
  {
    const taskId = `req8-task-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES (?, ?, 'Future One-off Task', ?, 'open', 1, ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, tomorrow, nowStr, nowStr);

    // Payload tries to fool server with past occurrence_date
    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ occurrence_date: yesterday });

    const passed = res.status === 400;
    recordTest(
      8,
      'Changing occurrence_date in request cannot make a future task claimable',
      passed,
      'HTTP 400 Bad Request (server uses authoritative DB due_date)',
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 9: Changing due_date in the request cannot make a future task claimable
  // --------------------------------------------------------------------------
  {
    const taskId = `req9-task-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES (?, ?, 'Future One-off Task', ?, 'open', 1, ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, tomorrow, nowStr, nowStr);

    // Payload tries to overwrite due_date in body
    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ due_date: yesterday });

    const passed = res.status === 400;
    recordTest(
      9,
      'Changing due_date in request cannot make a future task claimable',
      passed,
      'HTTP 400 Bad Request (server ignores client due_date payload)',
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 10: Sending a fake client "today" date cannot make a future task claimable
  // --------------------------------------------------------------------------
  {
    const taskId = `req10-task-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES (?, ?, 'Future One-off Task', ?, 'open', 1, ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, tomorrow, nowStr, nowStr);

    // Client passes fake today / client_date parameters
    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ client_date: addDays(localToday, 10), today: addDays(localToday, 10), clientDate: addDays(localToday, 10) });

    const passed = res.status === 400;
    recordTest(
      10,
      'Sending a fake client "today" date cannot make a future task claimable',
      passed,
      'HTTP 400 Bad Request (server uses timezone from DB)',
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 11: Viewing a different calendar date cannot make a future task claimable
  // --------------------------------------------------------------------------
  {
    const taskId = `req11-task-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES (?, ?, 'Future One-off Task', ?, 'open', 1, ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, tomorrow, nowStr, nowStr);

    // Client passes calendar view context parameters
    const res = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ selected_date: addDays(localToday, 7), calendar_view_date: addDays(localToday, 7) });

    const passed = res.status === 400;
    recordTest(
      11,
      'Viewing a different calendar date cannot make a future task claimable',
      passed,
      'HTTP 400 Bad Request',
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 12: Repeated/concurrent claim requests cannot exceed the claim limit (Atomic Concurrency)
  // --------------------------------------------------------------------------
  {
    const taskId = `req12-concur-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES (?, ?, 'Concurrent Claim Task', ?, 'open', 1, ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, localToday, nowStr, nowStr);

    // Launch 15 concurrent claim requests from member1, member2, and member3 simultaneously
    const promises = [];
    for (let i = 0; i < 15; i++) {
      const mem = members[i % members.length];
      promises.push(
        request(app)
          .post(`/api/tasks/${taskId}/claim`)
          .set('Authorization', `Bearer ${mem.token}`)
          .send({})
      );
    }

    const responses = await Promise.all(promises);
    const successCount = responses.filter(r => r.status === 200).length;
    const conflictCount = responses.filter(r => r.status === 409).length;

    // Verify in database: exactly 1 member is assigned
    const dbTask = db.prepare('SELECT assigned_member_id FROM tasks WHERE id = ?').get(taskId) as { assigned_member_id: string | null };
    const passed = successCount === 1 && conflictCount === 14 && Boolean(dbTask?.assigned_member_id);

    recordTest(
      12,
      'Repeated/concurrent claim requests cannot exceed claim limit (Atomic Concurrency)',
      passed,
      'Exactly 1 success (200) and 14 conflicts (409) for limit=1',
      `Success: ${successCount}, Conflicts: ${conflictCount}, DB Assigned: ${dbTask?.assigned_member_id}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 13: Claiming one recurring occurrence does not claim or disable other valid occurrences
  // --------------------------------------------------------------------------
  {
    const taskId = `req13-rec-isol-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES (?, ?, 'Daily Isolation Task', ?, 'open', 1, 'daily', 1, 'day', ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, yesterday, nowStr, nowStr);

    // Claim yesterday's occurrence with Member 1
    const resYesterday = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ occurrence_date: yesterday });

    // Claim today's occurrence with Member 2
    const resToday = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member2.token}`)
      .send({ occurrence_date: localToday });

    // Verify parent template is still recurring and independent
    const parentTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    const occurrences = db.prepare('SELECT id, due_date, assigned_member_id FROM tasks WHERE parent_task_id = ?').all(taskId) as any[];

    const passed = resYesterday.status === 200 &&
      resToday.status === 200 &&
      parentTask?.recurring_rule === 'daily' &&
      occurrences.length === 2;

    recordTest(
      13,
      'Claiming one recurring occurrence does not claim or disable other valid occurrences',
      passed,
      'Both distinct occurrences claimed independently; parent template intact',
      `Yesterday: ${resYesterday.status}, Today: ${resToday.status}, Child Rows Spawned: ${occurrences.length}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 14: The "every second week" (fortnightly) recurrence specifically behaves correctly
  // --------------------------------------------------------------------------
  {
    const taskId = `req14-fortnight-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, recurring_rule, recurring_interval, recurring_unit, created_at, updated_at)
      VALUES (?, ?, 'Fortnightly Task', ?, 'open', 1, 'fortnightly', 1, 'week', ?, ?)
    `).run(taskId, PRIMARY_FAM_ID, twoWeeksAgo, nowStr, nowStr);

    // 14a: Overdue occurrence (2 weeks ago) -> allowed
    const resOverdue = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ occurrence_date: twoWeeksAgo });

    // 14b: Current occurrence (today) -> allowed
    const resToday = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member2.token}`)
      .send({ occurrence_date: localToday });

    // 14c: Invalid intermediate non-step occurrence (1 week ago) -> rejected
    const oneWeekAgo = addDays(localToday, -7);
    const resInvalidStep = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member3.token}`)
      .send({ occurrence_date: oneWeekAgo });

    // 14d: Future occurrence (+14 days) -> rejected
    const resFuture = await request(app)
      .post(`/api/tasks/${taskId}/claim`)
      .set('Authorization', `Bearer ${member1.token}`)
      .send({ occurrence_date: twoWeeksFuture });

    const passed = resOverdue.status === 200 &&
      resToday.status === 200 &&
      resInvalidStep.status === 400 &&
      resFuture.status === 400;

    recordTest(
      14,
      'The "every second week" recurrence specifically behaves correctly',
      passed,
      'Overdue: 200, Current: 200, Intermediate (7d non-step): 400, Future (+14d): 400',
      `Overdue: ${resOverdue.status}, Today: ${resToday.status}, 7d-step: ${resInvalidStep.status}, Future: ${resFuture.status}`
    );
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 15: Date comparisons remain correct around midnight in family's configured timezone
  // --------------------------------------------------------------------------
  {
    const AUCKLAND_TZ = 'Pacific/Auckland';
    const aucklandFamId = `audit-fam-ak-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO families (id, name, timezone, created_at, updated_at)
      VALUES (?, 'Auckland Family', ?, ?, ?)
    `).run(aucklandFamId, AUCKLAND_TZ, nowStr, nowStr);

    const aucklandToday = getLocalToday(AUCKLAND_TZ);
    const akUser = `usr-ak-${suiteSuffix}`;
    const akMem = `mem-ak-${suiteSuffix}`;

    db.prepare(`
      INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
      VALUES (?, ?, 'ak@test.com', 'akuser', 'hash', 'Auckland Member', 'adult', 1, ?, ?)
    `).run(akUser, aucklandFamId, nowStr, nowStr);

    db.prepare(`
      INSERT INTO family_members (id, family_id, user_id, name, role, color, points, created_at)
      VALUES (?, ?, ?, 'Auckland Member', 'adult', '#4FA3FF', 0, ?)
    `).run(akMem, aucklandFamId, akUser, nowStr);

    const akToken = generateToken({
      id: akUser,
      family_id: aucklandFamId,
      email: 'ak@test.com',
      username: 'akuser',
      name: 'Auckland Member',
      role: 'adult',
    });

    const akTaskId = `req15-task-ak-${suiteSuffix}`;
    db.prepare(`
      INSERT INTO tasks (id, family_id, title, due_date, assignment_mode, claim_limit, created_at, updated_at)
      VALUES (?, ?, 'Auckland Today Task', ?, 'open', 1, ?, ?)
    `).run(akTaskId, aucklandFamId, aucklandToday, nowStr, nowStr);

    const res = await request(app)
      .post(`/api/tasks/${akTaskId}/claim`)
      .set('Authorization', `Bearer ${akToken}`)
      .send({});

    const passed = res.status === 200 && res.body?.assigned_member_id === akMem;

    recordTest(
      15,
      'Date comparisons remain correct around midnight in family configured timezone',
      passed,
      `HTTP 200 claiming task with Auckland date (${aucklandToday})`,
      `HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );

    // Clean up Auckland test data
    db.prepare('DELETE FROM tasks WHERE family_id = ?').run(aucklandFamId);
    db.prepare('DELETE FROM family_members WHERE family_id = ?').run(aucklandFamId);
    db.prepare('DELETE FROM users WHERE family_id = ?').run(aucklandFamId);
    db.prepare('DELETE FROM families WHERE id = ?').run(aucklandFamId);
  }

  // --------------------------------------------------------------------------
  // Clean up primary test data
  // --------------------------------------------------------------------------
  db.prepare('DELETE FROM tasks WHERE family_id = ?').run(PRIMARY_FAM_ID);
  db.prepare('DELETE FROM family_members WHERE family_id = ?').run(PRIMARY_FAM_ID);
  db.prepare('DELETE FROM users WHERE family_id = ?').run(PRIMARY_FAM_ID);
  db.prepare('DELETE FROM families WHERE id = ?').run(PRIMARY_FAM_ID);

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  const passedCount = testResults.filter(t => t.passed).length;
  const totalCount = testResults.length;

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passedCount}/${totalCount} REQUIREMENTS VERIFIED AND PASSED`);
  console.log('================================================================\n');

  if (passedCount !== totalCount) {
    throw new Error(`Verification failed: Only ${passedCount}/${totalCount} requirements passed.`);
  }
}

// Execute suite if run directly
runClaimVerificationSuite()
  .then(() => {
    console.log('Test suite completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });

export { runClaimVerificationSuite };
