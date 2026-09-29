import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase } from '../db.js';
import { router as apiRouter } from '../routes/api.js';
import { generateToken } from '../auth.js';
import bcrypt from 'bcryptjs';
import {
  resolveUserPermissions,
  ADMIN_PERMISSIONS,
  ADULT_MEMBER_PERMISSIONS,
  CHILD_MEMBER_PERMISSIONS,
} from '../permissions.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

interface TestRecord {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
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

async function runTests() {
  console.log('================================================================');
  console.log('FAMILY MANAGEMENT & PERMISSIONS REGRESSION SUITE');
  console.log('================================================================\n');

  // Prepare database
  initDatabase();

  const familyId = 'test-fam-' + uuidv4().slice(0, 8);
  const now = new Date().toISOString();

  // Create household
  db.prepare(`
    INSERT INTO families (id, name, timezone, created_at, updated_at)
    VALUES (?, 'Test Family', 'Australia/Melbourne', ?, ?)
  `).run(familyId, now, now);

  // Setup multiple members
  const adminUser = { id: 'usr-adm-' + uuidv4().slice(0, 8), email: 'admin@test.com', name: 'Admin Mom', role: 'administrator' as const };
  const adultUserWithPerms = { id: 'usr-ad-ok-' + uuidv4().slice(0, 8), email: 'adult_ok@test.com', name: 'Adult Dad', role: 'adult' as const };
  const adultUserNoPerms = { id: 'usr-ad-no-' + uuidv4().slice(0, 8), email: 'adult_no@test.com', name: 'Adult Uncle', role: 'adult' as const };
  const childUser = { id: 'usr-ch-' + uuidv4().slice(0, 8), email: 'child@test.com', name: 'Kid Alice', role: 'child' as const };

  const passHash = bcrypt.hashSync('Password123!', 10);

  // Helper to insert users & members
  const insertUser = (u: any, is_active = 1, perms: string | null = null) => {
    db.prepare(`
      INSERT INTO users (id, family_id, email, username, password_hash, name, role, is_active, permissions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(u.id, familyId, u.email, u.name.replace(' ', '').toLowerCase(), passHash, u.name, u.role, is_active, perms, now, now);
  };

  const insertMember = (id: string, u: any, is_active = 1, perms: string | null = null) => {
    db.prepare(`
      INSERT INTO family_members (id, family_id, user_id, name, role, is_active, permissions, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, familyId, u.id, u.name, u.role, is_active, perms, now);
  };

  const adminMemId = 'mem-adm-' + uuidv4().slice(0, 8);
  const adultOkMemId = 'mem-ad-ok-' + uuidv4().slice(0, 8);
  const adultNoMemId = 'mem-ad-no-' + uuidv4().slice(0, 8);
  const childMemId = 'mem-ch-' + uuidv4().slice(0, 8);

  insertUser(adminUser);
  insertMember(adminMemId, adminUser);

  insertUser(adultUserWithPerms);
  insertMember(adultOkMemId, adultUserWithPerms); // default adult permissions has members_manage = true

  // For Adult without permission, we will save custom permissions override with members_manage = false
  const noPermsJson = JSON.stringify({ members_manage: false });
  insertUser(adultUserNoPerms, 1, noPermsJson);
  insertMember(adultNoMemId, adultUserNoPerms, 1, noPermsJson);

  insertUser(childUser);
  insertMember(childMemId, childUser); // default child permissions has members_manage = false

  // Generate tokens
  const adminToken = generateToken({ ...adminUser, family_id: familyId } as any);
  const adultOkToken = generateToken({ ...adultUserWithPerms, family_id: familyId } as any);
  const adultNoToken = generateToken({ ...adultUserNoPerms, family_id: familyId } as any);
  const childToken = generateToken({ ...childUser, family_id: familyId } as any);

  // 1. PERMISSION PRESETS VERIFICATION
  console.log('--- 1. PERMISSION PRESETS ---');

  record(
    'Admin defaults are full permissions',
    'all permissions true',
    `calendar_create: ${ADMIN_PERMISSIONS.calendar_create}, members_manage: ${ADMIN_PERMISSIONS.members_manage}`,
    Object.values(ADMIN_PERMISSIONS).every(v => v === true)
  );

  const presetsDiffer = JSON.stringify(ADULT_MEMBER_PERMISSIONS) !== JSON.stringify(CHILD_MEMBER_PERMISSIONS);
  record(
    'Adult Defaults differ from Child Defaults',
    'true',
    String(presetsDiffer),
    presetsDiffer
  );

  record(
    'Adult preset contains members_manage & calendar_create',
    'true',
    `members_manage: ${ADULT_MEMBER_PERMISSIONS.members_manage}, calendar_create: ${ADULT_MEMBER_PERMISSIONS.calendar_create}`,
    ADULT_MEMBER_PERMISSIONS.members_manage === true && ADULT_MEMBER_PERMISSIONS.calendar_create === true
  );

  record(
    'Child preset lacks members_manage & calendar_create',
    'false',
    `members_manage: ${CHILD_MEMBER_PERMISSIONS.members_manage}, calendar_create: ${CHILD_MEMBER_PERMISSIONS.calendar_create}`,
    CHILD_MEMBER_PERMISSIONS.members_manage === false && CHILD_MEMBER_PERMISSIONS.calendar_create === false
  );

  // 2. ROLE DEMOTION SAFEGUARD VERIFICATION
  console.log('--- 2. ROLE CHANGE / DEMOTION SAFEGUARDS ---');

  // Let's test that resolveUserPermissions forces members_manage to false for a child even if custom perms say true
  const unsafeChildPerms = { members_manage: true, calendar_create: true };
  const resolvedChildPerms = resolveUserPermissions('child', unsafeChildPerms);

  record(
    'Demoted Child cannot retain members_manage or calendar_create via custom overrides',
    'false',
    `members_manage: ${resolvedChildPerms.members_manage}, calendar_create: ${resolvedChildPerms.calendar_create}`,
    resolvedChildPerms.members_manage === false && resolvedChildPerms.calendar_create === false
  );

  const resolvedAdultPromoted = resolveUserPermissions('adult', null);
  record(
    'Promoted Child receives correct Adult baseline defaults',
    'true',
    `members_manage: ${resolvedAdultPromoted.members_manage}`,
    resolvedAdultPromoted.members_manage === true
  );

  const resolvedAdmin = resolveUserPermissions('administrator', { members_manage: false });
  record(
    'Administrator role remains completely unrestricted regardless of custom payload',
    'true',
    `members_manage: ${resolvedAdmin.members_manage}`,
    resolvedAdmin.members_manage === true
  );

  // 3. FAMILY SETTINGS AUTHORIZATION (PUT /api/family)
  console.log('--- 3. FAMILY SETTINGS AUTHORIZATION ---');

  // Admin can update household timezone & name
  const adminPutRes = await request(app)
    .put('/api/family')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Admin Named Family', timezone: 'Europe/Paris' });

  record(
    'Admin can update household family settings',
    'HTTP 200',
    `HTTP ${adminPutRes.status}`,
    adminPutRes.status === 200 && adminPutRes.body.name === 'Admin Named Family' && adminPutRes.body.timezone === 'Europe/Paris'
  );

  // Authorised Adult can update
  const adultOkPutRes = await request(app)
    .put('/api/family')
    .set('Authorization', `Bearer ${adultOkToken}`)
    .send({ name: 'Adult Named Family', timezone: 'America/New_York' });

  record(
    'Authorised Adult with members_manage can update family settings',
    'HTTP 200',
    `HTTP ${adultOkPutRes.status}`,
    adultOkPutRes.status === 200 && adultOkPutRes.body.name === 'Adult Named Family' && adultOkPutRes.body.timezone === 'America/New_York'
  );

  // Unauthorized Adult receives 403
  const adultNoPutRes = await request(app)
    .put('/api/family')
    .set('Authorization', `Bearer ${adultNoToken}`)
    .send({ name: 'Hack Named Family' });

  record(
    'Adult with members_manage revoked is blocked with 403',
    'HTTP 403',
    `HTTP ${adultNoPutRes.status}`,
    adultNoPutRes.status === 403
  );

  // Child receives 403
  const childPutRes = await request(app)
    .put('/api/family')
    .set('Authorization', `Bearer ${childToken}`)
    .send({ name: 'Kid Named Family' });

  record(
    'Child is strictly blocked with 403',
    'HTTP 403',
    `HTTP ${childPutRes.status}`,
    childPutRes.status === 403
  );

  // 4. GLOBAL SOFTNESS VERIFICATION
  console.log('--- 4. GLOBAL SOFTNESS ---');

  // Admin and Adult can edit softness
  const adminSoftnessRes = await request(app)
    .put('/api/family')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ colorSoftness: 50 });

  record(
    'Admin can adjust Global Softness setting',
    'HTTP 200',
    `HTTP ${adminSoftnessRes.status}`,
    adminSoftnessRes.status === 200 && adminSoftnessRes.body.color_softness === 50
  );

  const adultNoSoftnessRes = await request(app)
    .put('/api/family')
    .set('Authorization', `Bearer ${adultNoToken}`)
    .send({ colorSoftness: 75 });

  record(
    'Adult without members_manage can still edit softness (allowed for Adults)',
    'HTTP 200',
    `HTTP ${adultNoSoftnessRes.status}`,
    adultNoSoftnessRes.status === 200 && adultNoSoftnessRes.body.color_softness === 75
  );

  // Child cannot save softness
  const childSoftnessRes = await request(app)
    .put('/api/family')
    .set('Authorization', `Bearer ${childToken}`)
    .send({ colorSoftness: 10 });

  record(
    'Child cannot modify Global Softness setting (blocked with 403)',
    'HTTP 403',
    `HTTP ${childSoftnessRes.status}`,
    childSoftnessRes.status === 403
  );

  // 5. HOUSEHOLD TIMEZONE SEMANTICS
  console.log('--- 5. TIMEZONE SEMANTICS & PERSISTENCE ---');

  const getFamDb = () => db.prepare('SELECT timezone FROM families WHERE id = ?').get(familyId) as { timezone: string };
  record(
    'Timezone persisted to families table',
    'America/New_York',
    getFamDb().timezone,
    getFamDb().timezone === 'America/New_York'
  );

  // 6. DEACTIVATION & DATA RETENTION
  console.log('--- 6. LOGIN DEACTIVATION & DATA RETENTION ---');

  // Admin soft-deletes/deactivates the Adult account without permission
  const deleteRes = await request(app)
    .delete(`/api/family/members/${adultNoMemId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  record(
    'Deactivating member returns HTTP 200',
    'HTTP 200',
    `HTTP ${deleteRes.status}`,
    deleteRes.status === 200
  );

  const dbMember = db.prepare('SELECT is_active FROM family_members WHERE id = ?').get(adultNoMemId) as { is_active: number };
  record(
    'Member is_active flag set to 0 (soft-deleted)',
    '0',
    String(dbMember.is_active),
    dbMember.is_active === 0
  );

  const dbUser = db.prepare('SELECT is_active FROM users WHERE id = ?').get(adultUserNoPerms.id) as { is_active: number };
  record(
    'Linked login is_active flag set to 0',
    '0',
    String(dbUser.is_active),
    dbUser.is_active === 0
  );

  // Attempt login for deactivated user
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adultUserNoPerms.email, password: 'Password123!' });

  record(
    'Disabled/Inactive user login rejected with HTTP 403',
    'HTTP 403',
    `HTTP ${loginRes.status}`,
    loginRes.status === 403
  );

  console.log('\n================================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`FINAL RESULT: ${results.filter(r => r.passed).length}/${results.length} PASSED`);
  console.log('================================================================');

  if (!allPassed) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
