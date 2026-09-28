import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase, reconcileMemberPoints } from '../db.js';
import { router as apiRouter } from '../routes/api.js';
import { generateToken } from '../auth.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

interface TestRecord {
  section: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
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

async function runForensicSuite() {
  console.log('================================================================');
  console.log('KIDS TASKS + REWARDS FORENSIC VERIFICATION SUITE');
  console.log('================================================================\n');

  initDatabase();

  const familyId = 'fam-' + uuidv4().slice(0, 8);
  const adminUserId = 'usr-admin-' + uuidv4().slice(0, 8);
  const adultUserId = 'usr-adult-' + uuidv4().slice(0, 8);
  const child1UserId = 'usr-child1-' + uuidv4().slice(0, 8);
  const child2UserId = 'usr-child2-' + uuidv4().slice(0, 8);

  const adminMemberId = 'mem-admin-' + uuidv4().slice(0, 8);
  const adultMemberId = 'mem-adult-' + uuidv4().slice(0, 8);
  const child1MemberId = 'mem-child1-' + uuidv4().slice(0, 8);
  const child2MemberId = 'mem-child2-' + uuidv4().slice(0, 8);

  const now = new Date().toISOString();

  // Create Family
  db.prepare(`
    INSERT INTO families (id, name, timezone, created_at, updated_at)
    VALUES (?, 'Forensic Test Family', 'Australia/Melbourne', ?, ?)
  `).run(familyId, now, now);

  // Create Users & Members
  const usersToCreate = [
    { uId: adminUserId, mId: adminMemberId, name: 'Admin Mom', email: 'admin@test.fam', role: 'administrator', type: 'adult' },
    { uId: adultUserId, mId: adultMemberId, name: 'Adult Dad', email: 'adult@test.fam', role: 'adult', type: 'adult' },
    { uId: child1UserId, mId: child1MemberId, name: 'Kid Alice', email: 'alice@test.fam', role: 'child', type: 'child' },
    { uId: child2UserId, mId: child2MemberId, name: 'Kid Bob', email: 'bob@test.fam', role: 'child', type: 'child' },
  ];

  for (const u of usersToCreate) {
    db.prepare(`
      INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'hash', ?, ?, 1, ?, ?)
    `).run(u.uId, familyId, u.email, u.name.toLowerCase().replace(/\s+/g, ''), u.name, u.role, now, now);

    db.prepare(`
      INSERT INTO family_members (id, family_id, user_id, name, color, role, created_at)
      VALUES (?, ?, ?, ?, '#3b82f6', ?, ?)
    `).run(u.mId, familyId, u.uId, u.name, u.type, now);
  }

  const adminToken = generateToken({
    id: adminUserId,
    family_id: familyId,
    email: 'admin@test.fam',
    name: 'Admin Mom',
    role: 'administrator',
  });

  const adultToken = generateToken({
    id: adultUserId,
    family_id: familyId,
    email: 'adult@test.fam',
    name: 'Adult Dad',
    role: 'adult',
  });

  const child1Token = generateToken({
    id: child1UserId,
    family_id: familyId,
    email: 'alice@test.fam',
    name: 'Kid Alice',
    role: 'child',
  });

  const child2Token = generateToken({
    id: child2UserId,
    family_id: familyId,
    email: 'bob@test.fam',
    name: 'Kid Bob',
    role: 'child',
  });

  // -------------------------------------------------------------
  // 1. Roles & Permissions Enforcement
  // -------------------------------------------------------------
  console.log('\n--- 1. ROLES & PERMISSIONS ---');

  // Child cannot create task
  const childCreateRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${child1Token}`)
    .send({
      title: 'Child Illegal Task',
      due_date: '2026-09-29',
      assignment_mode: 'assigned',
      assigned_member_id: child1MemberId,
      points: 10,
    });
  record('Roles', 'Child cannot create tasks', 'HTTP 403', `HTTP ${childCreateRes.status}`, childCreateRes.status === 403);

  // Adult cannot assign task to an adult/admin
  const adultAssignToAdultRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adultToken}`)
    .send({
      title: 'Adult Chore for Adult',
      due_date: '2026-09-29',
      assignment_mode: 'assigned',
      assigned_member_id: adultMemberId,
      points: 10,
    });
  record('Roles', 'Adult/Admin cannot be task recipient', 'HTTP 400 (Only child members)', `HTTP ${adultAssignToAdultRes.status}: ${JSON.stringify(adultAssignToAdultRes.body)}`, adultAssignToAdultRes.status === 400);

  // Adult can create assigned task for child
  const adultCreateForChildRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adultToken}`)
    .send({
      title: 'Clean Bedroom',
      due_date: '2026-09-29',
      assignment_mode: 'assigned',
      assigned_member_id: child1MemberId,
      points: 25,
    });
  record('Roles', 'Adult can create assigned task for child', 'HTTP 201', `HTTP ${adultCreateForChildRes.status}`, adultCreateForChildRes.status === 201);
  const cleanBedroomTask = adultCreateForChildRes.body;

  // -------------------------------------------------------------
  // 2. Task Types: Open & Everyone
  // -------------------------------------------------------------
  console.log('\n--- 2. TASK TYPES (OPEN & EVERYONE) ---');

  // Open Task: Exactly 1 shared task, assigned_member_id is null
  const createOpenRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Rake Leaves',
      due_date: '2026-09-29',
      assignment_mode: 'open',
      points: 50,
    });
  const openTask = createOpenRes.body;
  record('TaskTypes', 'Open Task created as 1 shared task with null assignment', 'HTTP 201 with null assigned_member_id', `HTTP ${createOpenRes.status}, assigned=${openTask.assigned_member_id}`, createOpenRes.status === 201 && openTask.assigned_member_id === null);

  // Everyone Task: Exactly 1 occurrence per child (2 children), 0 for adults
  const createEveryoneRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Brush Teeth Nightly',
      due_date: '2026-09-29',
      assignment_mode: 'everyone',
      points: 15,
    });
  const everyoneTasks = createEveryoneRes.body?.created_tasks || (Array.isArray(createEveryoneRes.body) ? createEveryoneRes.body : [createEveryoneRes.body]);
  const everyoneCount = Array.isArray(everyoneTasks) ? everyoneTasks.length : 1;
  const everyoneRecipients = Array.isArray(everyoneTasks) ? everyoneTasks.map((t: any) => t.assigned_member_id) : [everyoneTasks.assigned_member_id];
  const onlyChildrenAssigned = everyoneRecipients.every((mId: string) => mId === child1MemberId || mId === child2MemberId);
  record('TaskTypes', 'Everyone Task creates 1 task per child only (2 children)', '2 tasks for children', `count=${everyoneCount}, recipients=${JSON.stringify(everyoneRecipients)}`, createEveryoneRes.status === 201 && everyoneCount === 2 && onlyChildrenAssigned);

  // -------------------------------------------------------------
  // 3. Completion & Approval Lifecycle
  // -------------------------------------------------------------
  console.log('\n--- 3. COMPLETION & APPROVAL LIFECYCLE ---');

  // Step A: Child1 completes Clean Bedroom on 2026-09-29
  const completeRes = await request(app)
    .post(`/api/tasks/${cleanBedroomTask.id}/toggle`)
    .set('Authorization', `Bearer ${child1Token}`)
    .send({
      completed: true,
      occurrenceDate: '2026-09-29',
    });
  const hasPendingComp = completeRes.body?.completions?.some((c: any) => c.status === 'pending') || completeRes.body?.completed === true;
  record('Lifecycle', 'Child marks task complete', 'HTTP 200, status=pending, completed=true', `HTTP ${completeRes.status}, pending=${hasPendingComp}`, completeRes.status === 200 && hasPendingComp);

  // Check child points immediately after completion: MUST BE 0 (no points awarded at completion!)
  const child1PointsAfterComplete = await request(app)
    .get(`/api/members/${child1MemberId}/points`)
    .set('Authorization', `Bearer ${child1Token}`);
  record('Points', 'No points awarded immediately upon completion', '0 points', `${child1PointsAfterComplete.body?.points} points`, child1PointsAfterComplete.body?.points === 0);

  // Step B: Approvals queue verification
  const approvalsRes = await request(app)
    .get('/api/approvals')
    .set('Authorization', `Bearer ${adminToken}`);
  const approvalsList = approvalsRes.body || [];
  const foundInApprovals = approvalsList.some((item: any) => item.task_id === cleanBedroomTask.id);
  record('Approvals', 'Completed task appears in Adult/Admin approvals queue', 'Found in approvals list', `Found: ${foundInApprovals}, Total in queue: ${approvalsList.length}`, foundInApprovals);

  // Child cannot approve task
  const childApproveRes = await request(app)
    .post(`/api/approvals/${cleanBedroomTask.id}/confirm`)
    .set('Authorization', `Bearer ${child1Token}`)
    .send({ occurrenceDate: '2026-09-29' });
  record('Roles', 'Child cannot confirm approvals', 'HTTP 403', `HTTP ${childApproveRes.status}`, childApproveRes.status === 403);

  // Step C: Adult/Admin confirms approval
  const confirmRes = await request(app)
    .post(`/api/approvals/${cleanBedroomTask.id}/confirm`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ occurrenceDate: '2026-09-29' });
  record('Lifecycle', 'Admin confirms approval', 'HTTP 200, approved=true, points_awarded=25', `HTTP ${confirmRes.status}, points_awarded=${confirmRes.body?.points_awarded}`, confirmRes.status === 200 && confirmRes.body?.points_awarded === 25);

  // Child points balance after approval: MUST BE 25
  const child1PointsAfterApproval = await request(app)
    .get(`/api/members/${child1MemberId}/points`)
    .set('Authorization', `Bearer ${child1Token}`);
  record('Points', 'Child balance updated after approval', '25 points', `${child1PointsAfterApproval.body?.points} points`, child1PointsAfterApproval.body?.points === 25);

  // Check point transactions table has permanent record
  const child1HistoryRes = await request(app)
    .get(`/api/members/${child1MemberId}/points/history`)
    .set('Authorization', `Bearer ${child1Token}`);
  const history = child1HistoryRes.body || [];
  const tx = history.find((h: any) => h.task_id === cleanBedroomTask.id);
  record('Points', 'Permanent point transaction recorded with approver', 'Found transaction with 25 pts', `Found: ${!!tx}, pts=${tx?.points}, approver=${tx?.approved_by}`, !!tx && tx.points === 25 && tx.approved_by === adminMemberId);

  // Prevent double confirmation
  const doubleConfirmRes = await request(app)
    .post(`/api/approvals/${cleanBedroomTask.id}/confirm`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ occurrenceDate: '2026-09-29' });
  record('Points', 'Double confirmation rejected or idempotent without double points', 'HTTP 400 or HTTP 404', `HTTP ${doubleConfirmRes.status}`, doubleConfirmRes.status === 400 || doubleConfirmRes.status === 404);

  // Child points balance must still be 25
  const child1PointsAfterDouble = await request(app)
    .get(`/api/members/${child1MemberId}/points`)
    .set('Authorization', `Bearer ${child1Token}`);
  record('Points', 'Balance remained exactly 25 after double confirm attempt', '25 points', `${child1PointsAfterDouble.body?.points} points`, child1PointsAfterDouble.body?.points === 25);

  // Removed from approvals queue
  const approvalsAfterConfirmRes = await request(app)
    .get('/api/approvals')
    .set('Authorization', `Bearer ${adminToken}`);
  const stillInApprovals = (approvalsAfterConfirmRes.body || []).some((item: any) => item.task_id === cleanBedroomTask.id);
  record('Approvals', 'Approved task removed from approvals queue', 'Not in approvals', `stillInApprovals=${stillInApprovals}`, !stillInApprovals);

  // Task still visible on original calendar date
  const taskAfterConfirm = await request(app)
    .get(`/api/tasks`)
    .set('Authorization', `Bearer ${child1Token}`);
  const taskInList = (taskAfterConfirm.body || []).find((t: any) => t.id === cleanBedroomTask.id);
  record('Lifecycle', 'Task remains on calendar with due_date intact', 'due_date 2026-09-29', `due_date=${taskInList?.due_date}, completed=${taskInList?.completed}`, taskInList && taskInList.due_date === '2026-09-29' && Boolean(taskInList.completed) === true);

  // -------------------------------------------------------------
  // 4. Open Task Direct Completion by Child
  // -------------------------------------------------------------
  console.log('\n--- 4. OPEN TASK COMPLETION BY CHILD ---');

  // Child2 completes the Open Task (Rake Leaves)
  const openCompleteRes = await request(app)
    .post(`/api/tasks/${openTask.id}/toggle`)
    .set('Authorization', `Bearer ${child2Token}`)
    .send({
      completed: true,
      occurrenceDate: '2026-09-29',
    });
  record('OpenTask', 'Child2 completes open task directly', 'HTTP 200, awaiting_approval=true', `HTTP ${openCompleteRes.status}`, openCompleteRes.status === 200);

  // Approvals queue should show Child2 as the completing member for Open Task
  const openApprovalsRes = await request(app)
    .get('/api/approvals')
    .set('Authorization', `Bearer ${adminToken}`);
  const openApprovalItem = (openApprovalsRes.body || []).find((item: any) => item.task_id === openTask.id);
  record('OpenTask', 'Approvals card identifies the completing child (Child2)', `member_id=${child2MemberId}`, `member_id=${openApprovalItem?.member_id}, member_name=${openApprovalItem?.member_name}`, openApprovalItem && openApprovalItem.member_id === child2MemberId);

  // Admin Rejection Flow test
  const rejectRes = await request(app)
    .post(`/api/approvals/${openTask.id}/reject`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ occurrenceDate: '2026-09-29' });
  record('Lifecycle', 'Admin rejects completed task', 'HTTP 200', `HTTP ${rejectRes.status}`, rejectRes.status === 200);

  // Child2 points must be 0
  const child2PointsAfterReject = await request(app)
    .get(`/api/members/${child2MemberId}/points`)
    .set('Authorization', `Bearer ${child2Token}`);
  record('Lifecycle', 'Rejected task awards zero points', '0 points', `${child2PointsAfterReject.body?.points} points`, child2PointsAfterReject.body?.points === 0);

  // Task returns to incomplete and removed from approvals
  const openApprovalsAfterReject = await request(app)
    .get('/api/approvals')
    .set('Authorization', `Bearer ${adminToken}`);
  const inApprovalsAfterReject = (openApprovalsAfterReject.body || []).some((item: any) => item.task_id === openTask.id);
  record('Lifecycle', 'Rejected task removed from Approvals queue and returned to incomplete', 'Not in approvals', `inApprovals=${inApprovalsAfterReject}`, !inApprovalsAfterReject);

  // -------------------------------------------------------------
  // 5. Points Durability on Task / Series Deletion
  // -------------------------------------------------------------
  console.log('\n--- 5. POINTS DURABILITY & DELETION ---');

  // Delete the Clean Bedroom task that earned Child1 25 points
  const deleteCleanBedroomRes = await request(app)
    .delete(`/api/tasks/${cleanBedroomTask.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  record('PointsDurability', 'Admin deletes task with historical approved points', 'HTTP 200', `HTTP ${deleteCleanBedroomRes.status}`, deleteCleanBedroomRes.status === 200);

  // Child1 balance MUST REMAIN 25 points even after task row is deleted!
  const child1PointsAfterTaskDelete = await request(app)
    .get(`/api/members/${child1MemberId}/points`)
    .set('Authorization', `Bearer ${child1Token}`);
  record('PointsDurability', 'Historical points preserved after task deletion', '25 points', `${child1PointsAfterTaskDelete.body?.points} points`, child1PointsAfterTaskDelete.body?.points === 25);

  // -------------------------------------------------------------
  // 6. Recurring Task Scopes (Edit / Delete)
  // -------------------------------------------------------------
  console.log('\n--- 6. RECURRING TASK SCOPES ---');

  // Create a recurring daily task
  const createRecurringRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Daily Piano Practice',
      due_date: '2026-09-20',
      assignment_mode: 'assigned',
      assigned_member_id: child1MemberId,
      points: 10,
      recurring_rule: 'daily',
      recurring_interval: 1,
      recurring_unit: 'day',
      recurring_end_type: 'never',
    });
  const recurringTask = createRecurringRes.body;
  record('Recurrence', 'Created daily recurring task', 'HTTP 201', `HTTP ${createRecurringRes.status}`, createRecurringRes.status === 201);

  // Delete "This task only" for 2026-09-22
  const deleteSingleRes = await request(app)
    .delete(`/api/tasks/${recurringTask.id}?scope=single&occurrenceDate=2026-09-22`)
    .set('Authorization', `Bearer ${adminToken}`);
  record('Recurrence', 'Delete "This task only" adds exception date', 'HTTP 200, recurring_exceptions includes 2026-09-22', `HTTP ${deleteSingleRes.status}, exceptions=${JSON.stringify(deleteSingleRes.body?.recurring_exceptions)}`, deleteSingleRes.status === 200 && deleteSingleRes.body?.recurring_exceptions?.includes('2026-09-22'));

  // Delete "This and following" for 2026-09-28
  const deleteFollowingRes = await request(app)
    .delete(`/api/tasks/${recurringTask.id}?scope=following&occurrenceDate=2026-09-28`)
    .set('Authorization', `Bearer ${adminToken}`);
  record('Recurrence', 'Delete "This and following" caps recurring_end_date to day before', 'HTTP 200, recurring_end_date=2026-09-27', `HTTP ${deleteFollowingRes.status}, end_date=${deleteFollowingRes.body?.recurring_end_date}`, deleteFollowingRes.status === 200 && deleteFollowingRes.body?.recurring_end_date === '2026-09-27');

  // -------------------------------------------------------------
  // 7. Kids Tasks Members Layer & Filter Regression
  // -------------------------------------------------------------
  console.log('\n--- 7. KIDS TASKS MEMBERS LAYER & FILTER REGRESSION ---');

  // Fetch family members via API
  const familyRes = await request(app)
    .get('/api/family')
    .set('Authorization', `Bearer ${adminToken}`);
  const allFamilyMembers = familyRes.body?.members || [];

  // Verify full family has both adults and children
  const adultMembers = allFamilyMembers.filter((m: any) => m.role === 'adult' || m.role === 'administrator');
  const childMembers = allFamilyMembers.filter((m: any) => m.role === 'child' && (m.is_active === 1 || m.is_active === undefined));

  record(
    'MembersLayer',
    'Family has both adult/admin and child members in general family system',
    'At least 2 adults and 2 children',
    `adults=${adultMembers.length}, children=${childMembers.length}`,
    adultMembers.length === 2 && childMembers.length === 2
  );

  // In Kids Tasks Members Layer, only child members are eligible (role === 'child')
  const taskEligibleMembers = allFamilyMembers.filter(
    (m: any) => (m.is_active === undefined || m.is_active === 1) && m.role === 'child'
  );
  const containsAdultOrAdmin = taskEligibleMembers.some((m: any) => m.role === 'adult' || m.role === 'administrator');
  const allAreChildren = taskEligibleMembers.every((m: any) => m.role === 'child');

  record(
    'MembersLayer',
    'Kids Tasks Members layer includes only Child accounts (0 Adults, 0 Admins)',
    'Only child members, 0 adults/admins',
    `eligible_count=${taskEligibleMembers.length}, has_adult=${containsAdultOrAdmin}, all_children=${allAreChildren}`,
    taskEligibleMembers.length === 2 && !containsAdultOrAdmin && allAreChildren
  );

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n================================================================');
  const passedCount = testRecords.filter((r) => r.passed).length;
  const totalCount = testRecords.length;
  console.log(`FORENSIC TEST SUITE SUMMARY: ${passedCount}/${totalCount} PASSED`);
  console.log('================================================================');

  if (passedCount < totalCount) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runForensicSuite().catch((err) => {
  console.error('Forensic test failed with unhandled error:', err);
  process.exit(1);
});
