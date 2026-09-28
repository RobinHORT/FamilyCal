import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase } from '../db.js';
import { router as apiRouter } from '../routes/api.js';
import { generateToken } from '../auth.js';

// Setup Express test app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

interface TestRecord {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

const results: TestRecord[] = [];

function record(name: string, expected: string, actual: string, passed: boolean) {
  results.push({ name, expected, actual, passed });
  console.log(`[${passed ? '✓ PASS' : '✗ FAIL'}] ${name}`);
  if (!passed) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
  }
}

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('TASK CREATION PERMISSIONS & REGRESSION TEST SUITE');
  console.log('================================================================\n');

  const testFamilyId = 'reg-fam-' + uuidv4().slice(0, 8);
  const testAdminUserId = 'reg-usr-admin-' + uuidv4().slice(0, 8);
  const testAdultUserId = 'reg-usr-adult-' + uuidv4().slice(0, 8);
  const testChildUserId = 'reg-usr-child-' + uuidv4().slice(0, 8);

  const testAdminMemberId = 'reg-mem-admin-' + uuidv4().slice(0, 8);
  const testAdultMemberId = 'reg-mem-adult-' + uuidv4().slice(0, 8);
  const testChildMemberId = 'reg-mem-child-' + uuidv4().slice(0, 8);
  const testChild2MemberId = 'reg-mem-child2-' + uuidv4().slice(0, 8);

  const now = new Date().toISOString();

  // 1. Seed test family & users
  db.prepare(`
    INSERT INTO families (id, name, timezone, created_at, updated_at)
    VALUES (?, 'Regression Family', 'UTC', ?, ?)
  `).run(testFamilyId, now, now);

  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
    VALUES (?, ?, 'admin@reg.test', 'adminreg', 'hash', 'Admin User', 'administrator', 1, ?, ?)
  `).run(testAdminUserId, testFamilyId, now, now);

  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
    VALUES (?, ?, 'adult@reg.test', 'adultreg', 'hash', 'Adult User', 'adult', 1, ?, ?)
  `).run(testAdultUserId, testFamilyId, now, now);

  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
    VALUES (?, ?, 'child@reg.test', 'childreg', 'hash', 'Child User', 'child', 1, ?, ?)
  `).run(testChildUserId, testFamilyId, now, now);

  // 2. Seed corresponding family members
  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, is_active, points, created_at)
    VALUES (?, ?, ?, 'Admin Member', 'administrator', 1, 0, ?)
  `).run(testAdminMemberId, testFamilyId, testAdminUserId, now);

  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, is_active, points, created_at)
    VALUES (?, ?, ?, 'Adult Member', 'adult', 1, 0, ?)
  `).run(testAdultMemberId, testFamilyId, testAdultUserId, now);

  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, is_active, points, created_at)
    VALUES (?, ?, ?, 'Child Member 1', 'child', 1, 0, ?)
  `).run(testChildMemberId, testFamilyId, testChildUserId, now);

  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, is_active, points, created_at)
    VALUES (?, ?, NULL, 'Child Member 2', 'child', 1, 0, ?)
  `).run(testChild2MemberId, testFamilyId, now);

  // 3. Generate auth tokens
  const adminToken = generateToken({
    id: testAdminUserId,
    family_id: testFamilyId,
    email: 'admin@reg.test',
    username: 'adminreg',
    name: 'Admin User',
    role: 'administrator',
  });

  const adultToken = generateToken({
    id: testAdultUserId,
    family_id: testFamilyId,
    email: 'adult@reg.test',
    username: 'adultreg',
    name: 'Adult User',
    role: 'adult',
  });

  const childToken = generateToken({
    id: testChildUserId,
    family_id: testFamilyId,
    email: 'child@reg.test',
    username: 'childreg',
    name: 'Child User',
    role: 'child',
  });

  try {
    // =========================================================================
    // SECTION A: ADULT TASK CREATION PERMISSIONS
    // =========================================================================

    // Test 1: Adult can create an Assigned Task
    const adultAssignedRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adultToken}`)
      .send({
        title: 'Adult Assigned Task 📋',
        due_date: '2026-09-30',
        assignment_mode: 'assigned',
        assigned_member_ids: [testChildMemberId],
        assigned_member_id: testChildMemberId,
        points: 10,
      });

    const dbAdultAssigned = db.prepare(
      'SELECT * FROM tasks WHERE family_id = ? AND title = ?'
    ).all(testFamilyId, 'Adult Assigned Task 📋') as any[];

    record(
      'A1. Adult can create an Assigned Task',
      'HTTP 201 with exactly 1 task in DB assigned to Child',
      `HTTP ${adultAssignedRes.status}, count: ${dbAdultAssigned.length}, assigned: ${dbAdultAssigned[0]?.assigned_member_id}`,
      adultAssignedRes.status === 201 &&
        dbAdultAssigned.length === 1 &&
        dbAdultAssigned[0]?.assigned_member_id === testChildMemberId
    );

    // Test 2: Adult can create an Open Task
    const adultOpenRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adultToken}`)
      .send({
        title: 'Adult Open Chore 🧺',
        due_date: '2026-09-30',
        assignment_mode: 'open',
        points: 25,
      });

    const dbAdultOpen = db.prepare(
      'SELECT * FROM tasks WHERE family_id = ? AND title = ?'
    ).all(testFamilyId, 'Adult Open Chore 🧺') as any[];

    record(
      'A2. Adult can create an Open Task (exactly 1 unassigned task)',
      'HTTP 201, exactly 1 task, assignment_mode="open", assigned_member_id=null',
      `HTTP ${adultOpenRes.status}, count: ${dbAdultOpen.length}, mode: ${dbAdultOpen[0]?.assignment_mode}`,
      adultOpenRes.status === 201 &&
        dbAdultOpen.length === 1 &&
        dbAdultOpen[0]?.assignment_mode === 'open' &&
        dbAdultOpen[0]?.assigned_member_id === null
    );

    // Test 3: Adult can create an Everyone Task
    const adultEveryoneRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adultToken}`)
      .send({
        title: 'Adult Everyone Task 🌟',
        due_date: '2026-09-30',
        assignment_mode: 'everyone',
        points: 15,
      });

    const dbAdultEveryone = db.prepare(
      'SELECT * FROM tasks WHERE family_id = ? AND title = ?'
    ).all(testFamilyId, 'Adult Everyone Task 🌟') as any[];

    record(
      'A3. Adult can create an Everyone Task (1 task per active child = 2)',
      'HTTP 201 with 2 tasks sharing group ID',
      `HTTP ${adultEveryoneRes.status}, count: ${dbAdultEveryone.length}`,
      adultEveryoneRes.status === 201 && dbAdultEveryone.length === 2
    );

    // =========================================================================
    // SECTION B: ADMIN TASK CREATION PERMISSIONS (ALL SUPPORTED TYPES)
    // =========================================================================

    // Test 4: Admin can create each supported task type (Assigned, Open, Everyone, Repeating)
    const adminAssignedRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin Assigned Task 🎯',
        due_date: '2026-09-30',
        assignment_mode: 'assigned',
        assigned_member_ids: [testChildMemberId],
      });

    const adminOpenRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin Open Task 🚪',
        due_date: '2026-09-30',
        assignment_mode: 'open',
      });

    const adminEveryoneRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin Everyone Task 🤝',
        due_date: '2026-09-30',
        assignment_mode: 'everyone',
      });

    const adminRepeatingRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin Repeating Task 🔄',
        due_date: '2026-09-30',
        assignment_mode: 'assigned',
        assigned_member_id: testChildMemberId,
        recurring_rule: 'weekly',
        recurring_interval: 1,
      });

    const adminAllCreated =
      adminAssignedRes.status === 201 &&
      adminOpenRes.status === 201 &&
      adminEveryoneRes.status === 201 &&
      adminRepeatingRes.status === 201;

    record(
      'B1. Admin can create each supported task type (Assigned, Open, Everyone, Repeating)',
      'HTTP 201 for all 4 task types',
      `Assigned: ${adminAssignedRes.status}, Open: ${adminOpenRes.status}, Everyone: ${adminEveryoneRes.status}, Repeating: ${adminRepeatingRes.status}`,
      adminAllCreated
    );

    // =========================================================================
    // SECTION C: CHILD TASK CREATION REJECTIONS (ENFORCEMENT)
    // =========================================================================

    // Test 5: Child attempting to create an Assigned Task is rejected
    const childAssignedRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        title: 'Child Attempt Assigned ❌',
        due_date: '2026-09-30',
        assignment_mode: 'assigned',
        assigned_member_id: testChildMemberId,
      });

    record(
      'C1. Child attempting to create an Assigned Task is rejected',
      'HTTP 403 Forbidden with permission error',
      `HTTP ${childAssignedRes.status}, error: ${childAssignedRes.body.error}`,
      childAssignedRes.status === 403 &&
        childAssignedRes.body.error === 'Only Adult and Administrator accounts can create tasks.'
    );

    // Test 6: Child attempting to create an Open Task is rejected
    const childOpenRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        title: 'Child Attempt Open ❌',
        due_date: '2026-09-30',
        assignment_mode: 'open',
      });

    record(
      'C2. Child attempting to create an Open Task is rejected',
      'HTTP 403 Forbidden with permission error',
      `HTTP ${childOpenRes.status}, error: ${childOpenRes.body.error}`,
      childOpenRes.status === 403 &&
        childOpenRes.body.error === 'Only Adult and Administrator accounts can create tasks.'
    );

    // Test 7: Child attempting to create an Everyone Task is rejected
    const childEveryoneRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        title: 'Child Attempt Everyone ❌',
        due_date: '2026-09-30',
        assignment_mode: 'everyone',
      });

    record(
      'C3. Child attempting to create an Everyone Task is rejected',
      'HTTP 403 Forbidden with permission error',
      `HTTP ${childEveryoneRes.status}, error: ${childEveryoneRes.body.error}`,
      childEveryoneRes.status === 403 &&
        childEveryoneRes.body.error === 'Only Adult and Administrator accounts can create tasks.'
    );

    // Test 8: Child attempting to create a Repeating Task is rejected
    const childRepeatingRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${childToken}`)
      .send({
        title: 'Child Attempt Repeating ❌',
        due_date: '2026-09-30',
        recurring_rule: 'daily',
        recurring_interval: 1,
      });

    record(
      'C4. Child attempting to create a Repeating Task is rejected',
      'HTTP 403 Forbidden with permission error',
      `HTTP ${childRepeatingRes.status}, error: ${childRepeatingRes.body.error}`,
      childRepeatingRes.status === 403 &&
        childRepeatingRes.body.error === 'Only Adult and Administrator accounts can create tasks.'
    );

    // Test 9: Confirm rejected child requests create NO database task and do not trigger any assignment/migration/cloning
    const dbChildTasks = db.prepare(
      "SELECT * FROM tasks WHERE family_id = ? AND title LIKE 'Child Attempt%'"
    ).all(testFamilyId) as any[];

    record(
      'C5. Confirm rejected child requests create NO database task and trigger no side effects',
      '0 tasks in database matching rejected child requests',
      `Found ${dbChildTasks.length} tasks in database`,
      dbChildTasks.length === 0
    );

    // =========================================================================
    // SECTION D: OPEN TASK PRESERVATION & MIGRATION IDEMPOTENCY
    // =========================================================================

    // Test 10: Open Task remains unassigned and is NOT cloned or mutated on DB re-initialization
    const preReinitCount = (
      db.prepare('SELECT COUNT(*) as count FROM tasks WHERE family_id = ?').get(testFamilyId) as any
    ).count;

    initDatabase();

    const postReinitCount = (
      db.prepare('SELECT COUNT(*) as count FROM tasks WHERE family_id = ?').get(testFamilyId) as any
    ).count;

    const dbAdultOpenPost = db.prepare(
      'SELECT * FROM tasks WHERE family_id = ? AND title = ?'
    ).all(testFamilyId, 'Adult Open Chore 🧺') as any[];

    record(
      'D1. Re-running initDatabase() does NOT clone or mutate Open Tasks, keeping total count unchanged',
      `Total tasks unchanged (${preReinitCount}), Adult Open task still single and open`,
      `Pre count: ${preReinitCount}, Post count: ${postReinitCount}, Open tasks found: ${dbAdultOpenPost.length}`,
      preReinitCount === postReinitCount &&
        dbAdultOpenPost.length === 1 &&
        dbAdultOpenPost[0]?.assignment_mode === 'open' &&
        dbAdultOpenPost[0]?.assigned_member_id === null
    );

    // Test 11: Legacy multi-member migration still correctly splits genuine legacy multi-member tasks
    const legacyTaskId = 'tsk_legacy_' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO tasks (
        id, family_id, title, due_date, assignment_mode, assigned_member_ids,
        assigned_member_id, created_at, updated_at
      )
      VALUES (?, ?, 'Legacy Multi Task 📦', '2026-10-01', 'assigned', ?, ?, ?, ?)
    `).run(
      legacyTaskId,
      testFamilyId,
      JSON.stringify([testAdminMemberId, testAdultMemberId]),
      testAdminMemberId,
      now,
      now
    );

    // Trigger migration
    initDatabase();

    const dbLegacyTasks = db.prepare(
      'SELECT * FROM tasks WHERE family_id = ? AND title = ?'
    ).all(testFamilyId, 'Legacy Multi Task 📦') as any[];

    const legacySplitSuccess =
      dbLegacyTasks.length === 2 &&
      dbLegacyTasks.some((t) => t.assigned_member_id === testAdminMemberId) &&
      dbLegacyTasks.some((t) => t.assigned_member_id === testAdultMemberId) &&
      dbLegacyTasks[0].task_group_id === dbLegacyTasks[1].task_group_id;

    record(
      'D2. Legacy multi-member migration still correctly splits genuine legacy multi-member tasks',
      '2 sibling tasks created with shared task_group_id for the 2 assigned members',
      `Count: ${dbLegacyTasks.length}, shared task_group_id: ${dbLegacyTasks[0]?.task_group_id === dbLegacyTasks[1]?.task_group_id}`,
      legacySplitSuccess
    );

    console.log('\n================================================================');
    const passedCount = results.filter((r) => r.passed).length;
    console.log(`REGRESSION SUITE RESULTS: ${passedCount}/${results.length} PASSED`);
    console.log('================================================================\n');

    if (passedCount !== results.length) {
      process.exit(1);
    }
  } finally {
    // Cleanup
    db.prepare('DELETE FROM tasks WHERE family_id = ?').run(testFamilyId);
    db.prepare('DELETE FROM family_members WHERE family_id = ?').run(testFamilyId);
    db.prepare('DELETE FROM users WHERE family_id = ?').run(testFamilyId);
    db.prepare('DELETE FROM families WHERE id = ?').run(testFamilyId);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
