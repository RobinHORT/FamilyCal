import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase } from '../db.js';
import { router as apiRouter } from '../routes/api.js';
import { generateToken } from '../auth.js';
import {
  discoverGoogleCalendars,
  syncTwoWay,
  syncSingleEventToGoogle,
  deleteSingleEventFromGoogle,
  resolveGoogleCalendarForEvent,
  formatGoogleRecurrence,
  formatGoogleAllDayEndDate,
  getValidAccessToken,
} from '../googleSync.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

interface TestRecord {
  scenario: number;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
}

const testRecords: TestRecord[] = [];

function record(scenario: number, name: string, expected: string, actual: string, passed: boolean) {
  testRecords.push({ scenario, name, expected, actual, passed });
  console.log(`[${passed ? '✓ PASS' : '✗ FAIL'}] Scenario ${scenario}: ${name}`);
  if (!passed) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
  }
}

// Mock fetch harness
type MockFetchHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;
let currentFetchHandler: MockFetchHandler | null = null;

const originalFetch = global.fetch;
global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString();
  if (currentFetchHandler) {
    return currentFetchHandler(url, init);
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

async function runGoogleSyncTests() {
  console.log('================================================================');
  console.log('FAMILYCAL GOOGLE CALENDAR TWO-WAY SYNC REPAIR VERIFICATION SUITE');
  console.log('================================================================\n');

  initDatabase();

  const familyId = 'fam_sync_' + uuidv4().slice(0, 8);
  const now = new Date().toISOString();

  // Seed family
  db.prepare(`
    INSERT INTO families (id, name, timezone, created_at, updated_at)
    VALUES (?, 'Sync Test Family', 'Australia/Melbourne', ?, ?)
  `).run(familyId, now, now);

  // Seed admin user
  const adminUserId = 'usr_sync_admin_' + uuidv4().slice(0, 8);
  const adminMemberId = 'mem_sync_admin_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, created_at, updated_at)
    VALUES (?, ?, 'syncadmin@yimly.local', 'SyncAdmin', 'hash', 'Sync Admin', 'administrator', ?, ?)
  `).run(adminUserId, familyId, now, now);

  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, color, created_at)
    VALUES (?, ?, ?, 'Sync Admin', 'administrator', '#FF4FA3', ?)
  `).run(adminMemberId, familyId, adminUserId, now);

  // Seed member B (e.g. Alex)
  const alexUserId = 'usr_alex_' + uuidv4().slice(0, 8);
  const alexMemberId = 'mem_alex_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO users (id, family_id, email, username, password_hash, name, role, created_at, updated_at)
    VALUES (?, ?, 'alex@yimly.local', 'Alex', 'hash', 'Alex', 'adult', ?, ?)
  `).run(alexUserId, familyId, now, now);

  db.prepare(`
    INSERT INTO family_members (id, family_id, user_id, name, role, color, created_at)
    VALUES (?, ?, ?, 'Alex', 'adult', '#4285F4', ?)
  `).run(alexMemberId, familyId, alexUserId, now);

  const adminToken = generateToken({
    id: adminUserId,
    family_id: familyId,
    email: 'syncadmin@yimly.local',
    name: 'Sync Admin',
    role: 'administrator',
  });

  // Seed Google Account A (Admin)
  const accountAId = 'gacc_a_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO google_accounts (id, user_id, family_id, member_id, google_email, access_token, refresh_token, token_expiry, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin@gmail.com', 'token_acc_a', 'refresh_acc_a', ?, 'connected', ?, ?)
  `).run(accountAId, adminUserId, familyId, adminMemberId, Date.now() + 3600000, now, now);

  // Seed Google Account B (Alex)
  const accountBId = 'gacc_b_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO google_accounts (id, user_id, family_id, member_id, google_email, access_token, refresh_token, token_expiry, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'alex@gmail.com', 'token_acc_b', 'refresh_acc_b', ?, 'connected', ?, ?)
  `).run(accountBId, alexUserId, familyId, alexMemberId, Date.now() + 3600000, now, now);

  // Seed Google Calendar A
  const calAId = 'gcal_a_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO calendars (id, family_id, member_id, name, color, source, google_calendar_id, google_account_id, is_read_only, sync_enabled, created_at, updated_at)
    VALUES (?, ?, ?, 'Admin Google Cal', '#4285F4', 'google', 'gcal_id_admin@group.calendar.google.com', ?, 0, 1, ?, ?)
  `).run(calAId, familyId, adminMemberId, accountAId, now, now);

  // Seed Google Calendar B
  const calBId = 'gcal_b_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO calendars (id, family_id, member_id, name, color, source, google_calendar_id, google_account_id, is_read_only, sync_enabled, created_at, updated_at)
    VALUES (?, ?, ?, 'Alex Google Cal', '#33B679', 'google', 'gcal_id_alex@group.calendar.google.com', ?, 0, 1, ?, ?)
  `).run(calBId, familyId, alexMemberId, accountBId, now, now);

  // Seed Read-Only Calendar
  const calReadOnlyId = 'gcal_ro_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO calendars (id, family_id, member_id, name, color, source, google_calendar_id, google_account_id, is_read_only, sync_enabled, created_at, updated_at)
    VALUES (?, ?, NULL, 'Holidays Read-Only', '#E67C73', 'google', 'holidays@group.calendar.google.com', ?, 1, 1, ?, ?)
  `).run(calReadOnlyId, familyId, accountAId, now, now);

  // -------------------------------------------------------------
  // Scenario 1: Outbound Event Creation (FamilyCal -> Google Calendar)
  // -------------------------------------------------------------
  let capturedOutboundCall: { url: string; method?: string; body?: any; headers?: any } | null = null;
  currentFetchHandler = async (url, init) => {
    capturedOutboundCall = { url, method: init?.method, body: init?.body ? JSON.parse(init.body as string) : null, headers: init?.headers };
    if (url.includes('/events') && init?.method === 'POST') {
      return new Response(JSON.stringify({ id: 'google_evt_101', etag: '"etag_101"' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const createRes = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      calendar_id: calAId,
      title: 'Soccer Practice',
      description: 'Bring water',
      start_time: '2026-11-01T10:00:00Z',
      end_time: '2026-11-01T11:00:00Z',
      all_day: false,
    });

  const createdEvtId = createRes.body.id;
  // Trigger sync synchronously for test verification
  await syncSingleEventToGoogle({
    eventId: createdEvtId,
    familyId,
    action: 'create',
  });

  const evtAfterCreate = db.prepare('SELECT * FROM events WHERE id = ?').get(createdEvtId) as any;
  record(
    1,
    'Outbound Event Creation: POST to Google Calendar and store google_event_id + synced',
    'google_evt_101 & synced',
    `${evtAfterCreate?.google_event_id} & ${evtAfterCreate?.sync_status}`,
    evtAfterCreate?.google_event_id === 'google_evt_101' && evtAfterCreate?.sync_status === 'synced'
  );

  // -------------------------------------------------------------
  // Scenario 2: Outbound Event Update (FamilyCal -> Google Calendar)
  // -------------------------------------------------------------
  let capturedPatchCall: { url: string; method?: string; body?: any } | null = null;
  currentFetchHandler = async (url, init) => {
    capturedPatchCall = { url, method: init?.method, body: init?.body ? JSON.parse(init.body as string) : null };
    if (url.includes('/events/google_evt_101') && init?.method === 'PATCH') {
      return new Response(JSON.stringify({ etag: '"etag_101_updated"' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  await request(app)
    .put(`/api/events/${createdEvtId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Soccer Practice (Updated Location)',
      location: 'Central Field',
    });

  await syncSingleEventToGoogle({
    eventId: createdEvtId,
    familyId,
    action: 'update',
  });

  const evtAfterUpdate = db.prepare('SELECT * FROM events WHERE id = ?').get(createdEvtId) as any;
  record(
    2,
    'Outbound Event Update: PATCH to Google Calendar with updated fields and etag',
    '"etag_101_updated" & Central Field',
    `${evtAfterUpdate?.etag} & ${capturedPatchCall?.body?.location}`,
    evtAfterUpdate?.etag === '"etag_101_updated"' && capturedPatchCall?.body?.location === 'Central Field'
  );

  // -------------------------------------------------------------
  // Scenario 3: Outbound Event Deletion (FamilyCal -> Google Calendar)
  // -------------------------------------------------------------
  let capturedDeleteCall: { url: string; method?: string } | null = null;
  currentFetchHandler = async (url, init) => {
    capturedDeleteCall = { url, method: init?.method };
    if (url.includes('/events/google_evt_101') && init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  await request(app)
    .delete(`/api/events/${createdEvtId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  // Test synchronous execution of deleteSingleEventFromGoogle
  await deleteSingleEventFromGoogle({
    familyId,
    googleCalendarId: 'gcal_id_admin@group.calendar.google.com',
    googleEventId: 'google_evt_101',
    googleAccountId: accountAId,
  });

  const pendingDels = db.prepare('SELECT * FROM pending_google_deletions WHERE family_id = ? AND google_event_id = ?').all(familyId, 'google_evt_101');
  const deletedEvtRow = db.prepare('SELECT * FROM events WHERE id = ?').get(createdEvtId);
  record(
    3,
    'Outbound Event Deletion: DELETE sent to Google and tombstone cleared on 204',
    'deleted locally, Google DELETE called, 0 pending tombstones',
    `${!deletedEvtRow}, ${capturedDeleteCall?.method === 'DELETE'}, ${pendingDels.length} tombstones`,
    !deletedEvtRow && capturedDeleteCall?.method === 'DELETE' && pendingDels.length === 0
  );

  // -------------------------------------------------------------
  // Scenario 4: Inbound Event Creation (Google -> FamilyCal)
  // -------------------------------------------------------------
  currentFetchHandler = async (url) => {
    if (url.includes('/events?') && url.includes('gcal_id_admin')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'inbound_evt_201',
              summary: 'Dentist Appointment',
              description: 'Routine checkup',
              location: 'Dental Clinic',
              start: { dateTime: '2026-11-05T09:00:00Z' },
              end: { dateTime: '2026-11-05T10:00:00Z' },
              etag: '"inbound_etag_201"',
              updated: '2026-11-01T12:00:00Z',
              status: 'confirmed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  await syncTwoWay(familyId, accountAId);
  const inboundEvt = db.prepare('SELECT * FROM events WHERE google_event_id = ?').get('inbound_evt_201') as any;
  record(
    4,
    'Inbound Event Creation: Imported from Google into local database with status synced',
    'Dentist Appointment & synced',
    `${inboundEvt?.title} & ${inboundEvt?.sync_status}`,
    inboundEvt?.title === 'Dentist Appointment' && inboundEvt?.sync_status === 'synced'
  );

  // -------------------------------------------------------------
  // Scenario 5: Inbound Event Update (Google -> FamilyCal)
  // -------------------------------------------------------------
  currentFetchHandler = async (url) => {
    if (url.includes('/events?') && url.includes('gcal_id_admin')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'inbound_evt_201',
              summary: 'Dentist Appointment (Rescheduled)',
              description: 'Routine checkup with Dr. Smith',
              location: 'Dental Clinic Suite 4',
              start: { dateTime: '2026-11-05T14:00:00Z' },
              end: { dateTime: '2026-11-05T15:00:00Z' },
              etag: '"inbound_etag_201_v2"',
              updated: '2026-11-02T15:00:00Z',
              status: 'confirmed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  await syncTwoWay(familyId, accountAId);
  const updatedInboundEvt = db.prepare('SELECT * FROM events WHERE google_event_id = ?').get('inbound_evt_201') as any;
  record(
    5,
    'Inbound Event Update: Google updates reconciled into FamilyCal event',
    'Dentist Appointment (Rescheduled) & "inbound_etag_201_v2"',
    `${updatedInboundEvt?.title} & ${updatedInboundEvt?.etag}`,
    updatedInboundEvt?.title === 'Dentist Appointment (Rescheduled)' && updatedInboundEvt?.etag === '"inbound_etag_201_v2"'
  );

  // -------------------------------------------------------------
  // Scenario 6: Inbound Event Deletion (status === 'cancelled')
  // -------------------------------------------------------------
  currentFetchHandler = async (url) => {
    if (url.includes('/events?') && url.includes('gcal_id_admin')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'inbound_evt_201',
              status: 'cancelled',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  await syncTwoWay(familyId, accountAId);
  const deletedInboundEvt = db.prepare('SELECT * FROM events WHERE google_event_id = ?').get('inbound_evt_201');
  record(
    6,
    'Inbound Event Deletion: Cancelled Google event deleted from FamilyCal',
    'null (deleted)',
    `${deletedInboundEvt ? 'still exists' : 'null'}`,
    deletedInboundEvt === undefined
  );

  // -------------------------------------------------------------
  // Scenario 7: Pending Local Edit Protection (Inbound doesn't overwrite pending edits)
  // -------------------------------------------------------------
  // Create an event that is currently synced
  const evtToEditId = 'evt_local_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO events (id, family_id, calendar_id, title, start_time, end_time, google_event_id, google_calendar_id, etag, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, 'Piano Lesson', '2026-11-10T16:00:00Z', '2026-11-10T17:00:00Z', 'google_piano_1', 'gcal_id_admin@group.calendar.google.com', '"etag_piano_1"', 'synced', ?, ?)
  `).run(evtToEditId, familyId, calAId, now, now);

  // User makes local edit in FamilyCal (sync_status becomes pending)
  const localEditTime = new Date(Date.now() + 5000).toISOString();
  db.prepare(`
    UPDATE events
    SET title = 'Piano Lesson - Moved to 5PM', start_time = '2026-11-10T17:00:00Z', sync_status = 'pending', updated_at = ?
    WHERE id = ?
  `).run(localEditTime, evtToEditId);

  // Google Calendar API sends older version with same etag; Outbound PATCH fails (503 Service Unavailable)
  currentFetchHandler = async (url, init) => {
    if (url.includes('gcal_id_admin') && url.includes('/events?')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'google_piano_1',
              summary: 'Piano Lesson', // Older title
              start: { dateTime: '2026-11-10T16:00:00Z' },
              end: { dateTime: '2026-11-10T17:00:00Z' },
              etag: '"etag_piano_1"',
              updated: '2026-11-01T10:00:00Z',
              status: 'confirmed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (init?.method === 'PATCH') {
      return new Response('Temporary server error', { status: 503 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await syncTwoWay(familyId, accountAId);
  const preservedEvt = db.prepare('SELECT * FROM events WHERE id = ?').get(evtToEditId) as any;
  record(
    7,
    'Pending Local Edit Protection: Inbound sync preserves newer local edit and pending status',
    'Piano Lesson - Moved to 5PM & pending',
    `${preservedEvt.title} & ${preservedEvt.sync_status}`,
    preservedEvt.title === 'Piano Lesson - Moved to 5PM' && preservedEvt.sync_status === 'pending'
  );

  // -------------------------------------------------------------
  // Scenario 8: Outbound Reconciles Pending Edit & Updates Etag
  // -------------------------------------------------------------
  currentFetchHandler = async (url, init) => {
    if (url.includes('/events/google_piano_1') && init?.method === 'PATCH') {
      return new Response(JSON.stringify({ etag: '"etag_piano_2"' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await syncTwoWay(familyId, accountAId);
  const reconciledEvt = db.prepare('SELECT * FROM events WHERE id = ?').get(evtToEditId) as any;
  record(
    8,
    'Outbound Reconciliation: Pending edit successfully PATCHed to Google and marked synced',
    'synced & "etag_piano_2"',
    `${reconciledEvt.sync_status} & ${reconciledEvt.etag}`,
    reconciledEvt.sync_status === 'synced' && reconciledEvt.etag === '"etag_piano_2"'
  );

  // -------------------------------------------------------------
  // Scenario 9: Full Pagination in Inbound Sync
  // -------------------------------------------------------------
  let page1Requested = false;
  let page2Requested = false;
  currentFetchHandler = async (url) => {
    if (url.includes('pageToken=page_2_token')) {
      page2Requested = true;
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'paginated_evt_2',
              summary: 'Page 2 Event',
              start: { dateTime: '2026-11-20T10:00:00Z' },
              end: { dateTime: '2026-11-20T11:00:00Z' },
              status: 'confirmed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/events?')) {
      page1Requested = true;
      return new Response(
        JSON.stringify({
          nextPageToken: 'page_2_token',
          items: [
            {
              id: 'paginated_evt_1',
              summary: 'Page 1 Event',
              start: { dateTime: '2026-11-19T10:00:00Z' },
              end: { dateTime: '2026-11-19T11:00:00Z' },
              status: 'confirmed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  await syncTwoWay(familyId, accountAId);
  const page1Evt = db.prepare('SELECT * FROM events WHERE google_event_id = ?').get('paginated_evt_1');
  const page2Evt = db.prepare('SELECT * FROM events WHERE google_event_id = ?').get('paginated_evt_2');
  record(
    9,
    'Pagination: Inbound sync loops over nextPageToken and imports all pages',
    'Page 1 and Page 2 events imported',
    `P1=${Boolean(page1Evt)}, P2=${Boolean(page2Evt)}, P1Req=${page1Requested}, P2Req=${page2Requested}`,
    Boolean(page1Evt) && Boolean(page2Evt) && page1Requested && page2Requested
  );

  // -------------------------------------------------------------
  // Scenario 10: Multi-Account Credential Separation
  // -------------------------------------------------------------
  // When syncTwoWay is invoked for Account B (Alex), it must strictly use Account B's access token and only sync Cal B
  let authHeaderUsedForCalB = '';
  currentFetchHandler = async (url, init) => {
    if (url.includes('gcal_id_alex')) {
      authHeaderUsedForCalB = (init?.headers as any)?.Authorization || '';
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await syncTwoWay(familyId, accountBId);
  record(
    10,
    'Multi-Account Credential Separation: Alex calendar synced with Alex access token',
    'Bearer token_acc_b',
    authHeaderUsedForCalB,
    authHeaderUsedForCalB === 'Bearer token_acc_b'
  );

  // -------------------------------------------------------------
  // Scenario 11: Cross-Calendar Event Hijacking Prevention
  // -------------------------------------------------------------
  // Create an event on Cal A that assigns Alex as a participant.
  // It must NOT be hijacked or pushed to Cal B (Alex Google Cal)
  const multiMemberEvtId = 'evt_multi_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO events (id, family_id, calendar_id, title, start_time, end_time, assigned_member_ids, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, 'Family Dinner with Alex', '2026-11-25T18:00:00Z', '2026-11-25T20:00:00Z', ?, 'pending', ?, ?)
  `).run(multiMemberEvtId, familyId, calAId, JSON.stringify([alexMemberId]), now, now);

  const resolved = resolveGoogleCalendarForEvent(familyId, calAId, [alexMemberId]);
  record(
    11,
    'No Event Hijacking: Event assigned to Admin cal stays on Admin cal despite Alex assignment',
    'gcal_id_admin@group.calendar.google.com',
    resolved?.googleCalendarId || 'none',
    resolved?.googleCalendarId === 'gcal_id_admin@group.calendar.google.com'
  );

  // -------------------------------------------------------------
  // Scenario 12: No Resurrection on 404/410 from Google
  // -------------------------------------------------------------
  // Event exists locally with google_event_id and status pending.
  // Google returns 404 on PATCH (event was deleted on Google).
  // FamilyCal must DELETE locally instead of resurrecting on Google with POST!
  let postRecreateAttempted = false;
  const evtToGhostTestId = 'evt_ghost_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO events (id, family_id, calendar_id, title, start_time, end_time, google_event_id, google_calendar_id, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, 'Ghost Event', '2026-11-30T10:00:00Z', '2026-11-30T11:00:00Z', 'google_ghost_404', 'gcal_id_admin@group.calendar.google.com', 'pending', ?, ?)
  `).run(evtToGhostTestId, familyId, calAId, now, now);

  currentFetchHandler = async (url, init) => {
    if (url.includes('/events/google_ghost_404') && init?.method === 'PATCH') {
      return new Response('Event not found', { status: 404 });
    }
    const bodyStr = typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body || '');
    if (init?.method === 'POST' && (url.includes('google_ghost_404') || bodyStr.includes('Ghost Event'))) {
      postRecreateAttempted = true;
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await syncTwoWay(familyId, accountAId);
  const ghostAfterSync = db.prepare('SELECT * FROM events WHERE id = ?').get(evtToGhostTestId);
  record(
    12,
    'No Resurrection on 404/410: Event deleted on Google is removed locally without POST recreation',
    'deleted locally, 0 POST recreations',
    `${ghostAfterSync ? 'still exists' : 'deleted'}, POST attempted=${postRecreateAttempted}`,
    !ghostAfterSync && !postRecreateAttempted
  );

  // -------------------------------------------------------------
  // Scenario 13: Read-Only Calendar Protection
  // -------------------------------------------------------------
  const roEvtId = 'evt_ro_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO events (id, family_id, calendar_id, title, start_time, end_time, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, 'Read-Only Event Test', '2026-12-25T00:00:00Z', '2026-12-25T23:59:59Z', 'pending', ?, ?)
  `).run(roEvtId, familyId, calReadOnlyId, now, now);

  let roWriteAttempted = false;
  currentFetchHandler = async (url, init) => {
    if (url.includes('holidays@group.calendar.google.com') && (init?.method === 'POST' || init?.method === 'PATCH')) {
      roWriteAttempted = true;
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await syncSingleEventToGoogle({
    eventId: roEvtId,
    familyId,
    action: 'create',
  });

  record(
    13,
    'Read-Only Calendar Guard: No writes attempted to read-only Google calendars',
    'Write attempted = false',
    `Write attempted = ${roWriteAttempted}`,
    roWriteAttempted === false
  );

  // -------------------------------------------------------------
  // Scenario 14: Outbound Recurrence Formatting (RRULE)
  // -------------------------------------------------------------
  const weeklyRule = formatGoogleRecurrence('weekly');
  const fortnightlyRule = formatGoogleRecurrence('fortnightly');
  const dailyRuleUntil = formatGoogleRecurrence('daily', '2026-12-31');
  record(
    14,
    'Outbound Recurrence: Formats standard RRULE strings for recurring events',
    'FREQ=WEEKLY, FREQ=WEEKLY;INTERVAL=2, FREQ=DAILY;UNTIL=20261231T235959Z',
    `${weeklyRule?.[0]}, ${fortnightlyRule?.[0]}, ${dailyRuleUntil?.[0]}`,
    weeklyRule?.[0] === 'RRULE:FREQ=WEEKLY' &&
      fortnightlyRule?.[0] === 'RRULE:FREQ=WEEKLY;INTERVAL=2' &&
      dailyRuleUntil?.[0] === 'RRULE:FREQ=DAILY;UNTIL=20261231T235959Z'
  );

  // -------------------------------------------------------------
  // Scenario 15: All-Day End Date Conversion
  // -------------------------------------------------------------
  const allDayEnd = formatGoogleAllDayEndDate('2026-11-05', '2026-11-05');
  record(
    15,
    'All-Day End Date Conversion: Single day all-day event increments end.date by +1 day for Google',
    '2026-11-06',
    allDayEnd,
    allDayEnd === '2026-11-06'
  );

  // -------------------------------------------------------------
  // Scenario 16: Failed Deletion Retry
  // -------------------------------------------------------------
  // Insert a tombstone into pending_google_deletions
  const retryTombstoneId = 'del_retry_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO pending_google_deletions (id, family_id, google_calendar_id, google_event_id, google_account_id, created_at)
    VALUES (?, ?, 'gcal_id_admin@group.calendar.google.com', 'google_evt_transient', ?, ?)
  `).run(retryTombstoneId, familyId, accountAId, now);

  // First sync attempt: network throws error
  currentFetchHandler = async (url, init) => {
    if (url.includes('/events/google_evt_transient') && init?.method === 'DELETE') {
      throw new Error('ETIMEDOUT: Connection dropped');
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await syncTwoWay(familyId, accountAId);
  const tombstoneAfterFailure = db.prepare('SELECT * FROM pending_google_deletions WHERE id = ?').get(retryTombstoneId);

  // Second sync attempt: network succeeds with 204
  currentFetchHandler = async (url, init) => {
    if (url.includes('/events/google_evt_transient') && init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await syncTwoWay(familyId, accountAId);
  const tombstoneAfterSuccess = db.prepare('SELECT * FROM pending_google_deletions WHERE id = ?').get(retryTombstoneId);

  record(
    16,
    'Failed Deletion Retry: Tombstone kept on network drop, cleared upon eventual success',
    'Kept after failure, cleared after success',
    `Kept=${Boolean(tombstoneAfterFailure)}, Cleared=${!tombstoneAfterSuccess}`,
    Boolean(tombstoneAfterFailure) && !tombstoneAfterSuccess
  );

  // -------------------------------------------------------------
  // Scenario 17: Vanished Calendar Handling in Discovery
  // -------------------------------------------------------------
  // Google calendar discovery returns only Cal A, but Cal B is absent.
  // Cal B's sync_enabled should be disabled without deleting Cal B or its events!
  currentFetchHandler = async (url) => {
    if (url.includes('/calendarList')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'gcal_id_admin@group.calendar.google.com',
              summary: 'Admin Google Cal (Renamed)',
              accessRole: 'owner',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  await discoverGoogleCalendars(familyId, accountAId, adminMemberId);
  const calAfterDiscovery = db.prepare('SELECT * FROM calendars WHERE id = ?').get(calAId) as any;
  record(
    17,
    'Vanished Calendar Handling: Existing calendar updated with refreshed name, not wiped',
    'Admin Google Cal (Renamed) & sync_enabled=1',
    `${calAfterDiscovery.name} & sync_enabled=${calAfterDiscovery.sync_enabled}`,
    calAfterDiscovery.name === 'Admin Google Cal (Renamed)' && calAfterDiscovery.sync_enabled === 1
  );

  // -------------------------------------------------------------
  // Scenarios 18-26: Focused Reliability Tests (Token Refresh Coordination, 401 Retry, Pending Deletion Handling)
  // -------------------------------------------------------------
  db.prepare('UPDATE google_accounts SET token_expiry = 0 WHERE family_id = ?').run(familyId);

  let tokenRefreshCount = 0;
  currentFetchHandler = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      tokenRefreshCount++;
      return new Response(JSON.stringify({ access_token: 'new_tok_' + tokenRefreshCount, expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  // Scenario 18: Multiple simultaneous requests for one expired account trigger only one token refresh
  tokenRefreshCount = 0;
  await Promise.all([
    getValidAccessToken(accountAId),
    getValidAccessToken(accountAId),
    getValidAccessToken(accountAId),
  ]);
  record(
    18,
    'Concurrent Token Refresh Coordination: Multiple simultaneous requests trigger exactly 1 refresh call',
    '1 refresh call',
    `${tokenRefreshCount} refresh call(s)`,
    tokenRefreshCount === 1
  );

  // Scenario 19: Two different accounts refresh independently
  const otherAccount = db.prepare('SELECT id FROM google_accounts WHERE id != ? AND family_id = ?').get(accountAId, familyId) as any;
  if (otherAccount) {
    db.prepare('UPDATE google_accounts SET token_expiry = 0 WHERE id = ? OR id = ?').run(accountAId, otherAccount.id);
    tokenRefreshCount = 0;
    await Promise.all([
      getValidAccessToken(accountAId),
      getValidAccessToken(otherAccount.id),
    ]);
    record(
      19,
      'Independent Account Refreshes: Different accounts refresh independently',
      '2 refresh calls',
      `${tokenRefreshCount} refresh call(s)`,
      tokenRefreshCount === 2
    );
  }

  // Scenario 20: Failed refresh releases in-flight lock, allowing later attempt
  let failRefresh = true;
  currentFetchHandler = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      if (failRefresh) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
      return new Response(JSON.stringify({ access_token: 'recovered_tok', expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  db.prepare('UPDATE google_accounts SET token_expiry = 0 WHERE id = ?').run(accountAId);
  try {
    await getValidAccessToken(accountAId);
  } catch {}
  failRefresh = false;
  db.prepare('UPDATE google_accounts SET token_expiry = 0 WHERE id = ?').run(accountAId);
  const recoveredToken = await getValidAccessToken(accountAId);
  record(
    20,
    'Lock Release on Refresh Failure: Failed refresh releases lock for subsequent recovery attempt',
    'recovered_tok',
    recoveredToken,
    recoveredToken === 'recovered_tok'
  );

  // Scenario 21: Calendar API 401 triggers one refresh and one successful retry
  let calendar401Count = 0;
  currentFetchHandler = async (url, init) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'fresh_401_tok', expires_in: 3600 }), { status: 200 });
    }
    if (url.includes('/calendarList')) {
      calendar401Count++;
      if (calendar401Count === 1) {
        return new Response('Unauthorized', { status: 401 });
      }
      return new Response(JSON.stringify({ items: [{ id: 'cal_401', summary: 'Cal 401' }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  db.prepare('UPDATE google_accounts SET token_expiry = 0 WHERE id = ?').run(accountAId);
  const discoveryResult = await discoverGoogleCalendars(familyId, accountAId, adminMemberId);
  record(
    21,
    'Calendar API 401 Retry: 401 triggers token refresh and single successful retry',
    'Discovered 1 calendar',
    `Discovered ${discoveryResult.length} calendar(s)`,
    discoveryResult.length === 1 && calendar401Count === 2
  );

  // Scenario 22: Second 401 does not trigger infinite retry loop (fails cleanly)
  currentFetchHandler = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    }
    if (url.includes('/calendarList')) {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  let threw401Error = false;
  try {
    await discoverGoogleCalendars(familyId, accountAId, adminMemberId);
  } catch (err: any) {
    threw401Error = true;
  }
  record(
    22,
    'No Infinite 401 Loop: Repeated 401 fails cleanly after single retry',
    'Threw error',
    `Threw error=${threw401Error}`,
    threw401Error
  );

  // Scenario 23: 403 or 500 does not trigger auth refresh retry
  let authRefreshCalledOn500 = false;
  currentFetchHandler = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      authRefreshCalledOn500 = true;
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    }
    if (url.includes('/calendarList')) {
      return new Response('Server Error', { status: 500 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  try {
    await discoverGoogleCalendars(familyId, accountAId, adminMemberId);
  } catch {}
  record(
    23,
    'No Auth Retry on 500/403: Server error does not trigger token refresh',
    'false',
    `${authRefreshCalledOn500}`,
    !authRefreshCalledOn500
  );

  // Scenario 24: Pending deletion receiving 403 or 500 remains queued and causes sync result to report error
  const testDelId = 'del_test_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO pending_google_deletions (id, family_id, google_calendar_id, google_event_id, google_account_id, created_at)
    VALUES (?, ?, 'gcal_id_admin@group.calendar.google.com', 'evt_del_fail', ?, ?)
  `).run(testDelId, familyId, accountAId, now);

  currentFetchHandler = async (url, init) => {
    if (url.includes('/events/evt_del_fail') && init?.method === 'DELETE') {
      return new Response('Forbidden', { status: 403 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  const syncRes403 = await syncTwoWay(familyId, accountAId);
  const tombstoneKept = db.prepare('SELECT * FROM pending_google_deletions WHERE id = ?').get(testDelId);
  record(
    24,
    'Pending Deletion 403 Failure: Tombstone retained and sync reported failure/error',
    'Kept and success=false',
    `Kept=${Boolean(tombstoneKept)}, success=${syncRes403.success}`,
    Boolean(tombstoneKept) && !syncRes403.success
  );

  // Scenario 25: Pending deletion receiving 204, 404, or 410 is removed from queue
  currentFetchHandler = async (url, init) => {
    if (url.includes('/events/evt_del_fail') && init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  const syncRes204 = await syncTwoWay(familyId, accountAId);
  const tombstoneRemoved = db.prepare('SELECT * FROM pending_google_deletions WHERE id = ?').get(testDelId);
  record(
    25,
    'Pending Deletion 204 Success: Tombstone removed from queue',
    'Removed and success=true',
    `Removed=${!tombstoneRemoved}, success=${syncRes204.success}`,
    !tombstoneRemoved && syncRes204.success
  );

  // Scenario 26: Transient network failure retains pending deletion for retry
  const netDelId = 'del_net_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO pending_google_deletions (id, family_id, google_calendar_id, google_event_id, google_account_id, created_at)
    VALUES (?, ?, 'gcal_id_admin@group.calendar.google.com', 'evt_del_net', ?, ?)
  `).run(netDelId, familyId, accountAId, now);

  currentFetchHandler = async (url, init) => {
    if (url.includes('/events/evt_del_net') && init?.method === 'DELETE') {
      throw new Error('ENOTFOUND: Network unreachable');
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  await syncTwoWay(familyId, accountAId);
  const tombstoneNetKept = db.prepare('SELECT * FROM pending_google_deletions WHERE id = ?').get(netDelId);
  // Clean up
  db.prepare('DELETE FROM pending_google_deletions WHERE id = ?').run(netDelId);
  record(
    26,
    'Pending Deletion Network Exception: Tombstone retained for retry on network error',
    'Retained',
    `Retained=${Boolean(tombstoneNetKept)}`,
    Boolean(tombstoneNetKept)
  );

  // -------------------------------------------------------------
  // Scenario 27 (Fix 1): invalid_grant response persists reauthorization_required
  // -------------------------------------------------------------
  currentFetchHandler = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  db.prepare('UPDATE google_accounts SET token_expiry = 0 WHERE id = ?').run(accountAId);
  let caughtInvalidGrant = false;
  try {
    await getValidAccessToken(accountAId);
  } catch {
    caughtInvalidGrant = true;
  }
  const accAfterInvalidGrant = db.prepare('SELECT sync_status, sync_error FROM google_accounts WHERE id = ?').get(accountAId) as any;
  record(
    27,
    'Token Refresh invalid_grant: Persists reauthorization_required and useful error',
    'reauthorization_required & contains invalid_grant',
    `${accAfterInvalidGrant?.sync_status} & ${accAfterInvalidGrant?.sync_error}`,
    caughtInvalidGrant &&
    accAfterInvalidGrant?.sync_status === 'reauthorization_required' &&
    accAfterInvalidGrant?.sync_error?.includes('invalid_grant')
  );

  // -------------------------------------------------------------
  // Scenario 28 (Fix 1): Transient refresh failure persists 'error'
  // -------------------------------------------------------------
  currentFetchHandler = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify({ error: 'internal_failure', error_description: 'Transient backend glitch' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  db.prepare('UPDATE google_accounts SET token_expiry = 0 WHERE id = ?').run(accountAId);
  let caughtTransientError = false;
  try {
    await getValidAccessToken(accountAId);
  } catch {
    caughtTransientError = true;
  }
  const accAfterTransient = db.prepare('SELECT sync_status, sync_error FROM google_accounts WHERE id = ?').get(accountAId) as any;
  record(
    28,
    'Transient Refresh Failure: Persists status error rather than reauthorization_required',
    'error & contains Token refresh failed',
    `${accAfterTransient?.sync_status} & ${accAfterTransient?.sync_error}`,
    caughtTransientError &&
    accAfterTransient?.sync_status === 'error' &&
    accAfterTransient?.sync_error?.includes('Token refresh failed')
  );

  // -------------------------------------------------------------
  // Scenario 29 (Fix 1): Subsequent refresh attempt succeeds after a failure
  // -------------------------------------------------------------
  currentFetchHandler = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify({ access_token: 'fresh_recovered_token_123', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  db.prepare('UPDATE google_accounts SET token_expiry = 0 WHERE id = ?').run(accountAId);
  const recoveredAccToken = await getValidAccessToken(accountAId);
  const accAfterRecovery = db.prepare('SELECT sync_status, sync_error FROM google_accounts WHERE id = ?').get(accountAId) as any;
  record(
    29,
    'Subsequent Refresh Recovery: Succeeds and sets status connected with clear error',
    'fresh_recovered_token_123 & connected & null error',
    `${recoveredAccToken} & ${accAfterRecovery?.sync_status} & ${accAfterRecovery?.sync_error}`,
    recoveredAccToken === 'fresh_recovered_token_123' &&
    accAfterRecovery?.sync_status === 'connected' &&
    accAfterRecovery?.sync_error === null
  );

  // -------------------------------------------------------------
  // Scenario 30 (Fix 2): Inbound deletion receives 401, refreshes token, retries once, and succeeds
  // -------------------------------------------------------------
  const del401Id = 'del_inb_401_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO pending_google_deletions (id, family_id, google_calendar_id, google_event_id, google_account_id, created_at)
    VALUES (?, ?, 'gcal_id_admin@group.calendar.google.com', 'inb_evt_del_401', ?, ?)
  `).run(del401Id, familyId, accountAId, now);

  let inboundDel401Attempts = 0;
  let inboundDelRefreshCalled = false;
  currentFetchHandler = async (url, init) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      inboundDelRefreshCalled = true;
      return new Response(JSON.stringify({ access_token: 'inb_del_refreshed_tok', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/events?') && url.includes('gcal_id_admin')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'inb_evt_del_401',
              summary: 'Deleted Event Reappearing Inbound',
              status: 'confirmed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/events/inb_evt_del_401') && init?.method === 'DELETE') {
      inboundDel401Attempts++;
      if (inboundDel401Attempts === 1) {
        return new Response('Unauthorized', { status: 401 });
      }
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  const syncRes30 = await syncTwoWay(familyId, accountAId);
  const tombstone30 = db.prepare('SELECT * FROM pending_google_deletions WHERE id = ?').get(del401Id);
  const recreatedEvt30 = db.prepare('SELECT * FROM events WHERE google_event_id = ?').get('inb_evt_del_401');
  record(
    30,
    'Inbound Deletion 401 Retry: Refreshes token, retries once, deletes tombstone on 204 without recreating event',
    'Attempts=2, Refreshed=true, TombstoneCleared=true, NotRecreated=true',
    `Attempts=${inboundDel401Attempts}, Refreshed=${inboundDelRefreshCalled}, TombstoneCleared=${!tombstone30}, NotRecreated=${!recreatedEvt30}`,
    inboundDel401Attempts === 2 &&
    inboundDelRefreshCalled &&
    !tombstone30 &&
    !recreatedEvt30 &&
    syncRes30.success
  );

  // -------------------------------------------------------------
  // Scenario 31 (Fix 2): Inbound deletion failed retry leaves deletion queued and reports sync error
  // -------------------------------------------------------------
  const del401FailId = 'del_inb_fail_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO pending_google_deletions (id, family_id, google_calendar_id, google_event_id, google_account_id, created_at)
    VALUES (?, ?, 'gcal_id_admin@group.calendar.google.com', 'inb_evt_del_fail', ?, ?)
  `).run(del401FailId, familyId, accountAId, now);

  currentFetchHandler = async (url, init) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'fresh_tok', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/events?') && url.includes('gcal_id_admin')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'inb_evt_del_fail',
              summary: 'Persisting Event',
              status: 'confirmed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/events/inb_evt_del_fail') && init?.method === 'DELETE') {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  const syncRes31 = await syncTwoWay(familyId, accountAId);
  const tombstone31 = db.prepare('SELECT * FROM pending_google_deletions WHERE id = ?').get(del401FailId);
  const recreatedEvt31 = db.prepare('SELECT * FROM events WHERE google_event_id = ?').get('inb_evt_del_fail');
  db.prepare('DELETE FROM pending_google_deletions WHERE id = ?').run(del401FailId);

  record(
    31,
    'Inbound Deletion Failed Retry: Tombstone remains queued, sync reports error, event not recreated',
    'TombstoneKept=true, Success=false, NotRecreated=true',
    `TombstoneKept=${Boolean(tombstone31)}, Success=${syncRes31.success}, NotRecreated=${!recreatedEvt31}`,
    Boolean(tombstone31) && !syncRes31.success && !recreatedEvt31
  );

  // -------------------------------------------------------------
  // Scenario 32 (Fix 2): Unsuccessful non-auth response retains deletion and does not trigger refresh
  // -------------------------------------------------------------
  const del500Id = 'del_inb_500_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO pending_google_deletions (id, family_id, google_calendar_id, google_event_id, google_account_id, created_at)
    VALUES (?, ?, 'gcal_id_admin@group.calendar.google.com', 'inb_evt_del_500', ?, ?)
  `).run(del500Id, familyId, accountAId, now);

  let refreshCalledOn500 = false;
  currentFetchHandler = async (url, init) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      refreshCalledOn500 = true;
      return new Response(JSON.stringify({ access_token: 'fresh_tok', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/events?') && url.includes('gcal_id_admin')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'inb_evt_del_500',
              summary: 'Event 500',
              status: 'confirmed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/events/inb_evt_del_500') && init?.method === 'DELETE') {
      return new Response('Internal Server Error', { status: 500 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  const syncRes32 = await syncTwoWay(familyId, accountAId);
  const tombstone32 = db.prepare('SELECT * FROM pending_google_deletions WHERE id = ?').get(del500Id);
  db.prepare('DELETE FROM pending_google_deletions WHERE id = ?').run(del500Id);

  record(
    32,
    'Inbound Deletion 500 Non-Auth Error: Retains tombstone, does not trigger token refresh',
    'TombstoneKept=true, RefreshCalled=false, Success=false',
    `TombstoneKept=${Boolean(tombstone32)}, RefreshCalled=${refreshCalledOn500}, Success=${syncRes32.success}`,
    Boolean(tombstone32) && !refreshCalledOn500 && !syncRes32.success
  );

  // -------------------------------------------------------------
  // Scenario 33 (Fix 2): Inbound deletion 404/410 clears appropriate tombstone
  // -------------------------------------------------------------
  const del404Id = 'del_inb_404_' + uuidv4().slice(0, 8);
  db.prepare(`
    INSERT INTO pending_google_deletions (id, family_id, google_calendar_id, google_event_id, google_account_id, created_at)
    VALUES (?, ?, 'gcal_id_admin@group.calendar.google.com', 'inb_evt_del_404', ?, ?)
  `).run(del404Id, familyId, accountAId, now);

  currentFetchHandler = async (url, init) => {
    if (url.includes('/events?') && url.includes('gcal_id_admin')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'inb_evt_del_404',
              summary: 'Event 404',
              status: 'confirmed',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/events/inb_evt_del_404') && init?.method === 'DELETE') {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  const syncRes33 = await syncTwoWay(familyId, accountAId);
  const tombstone33 = db.prepare('SELECT * FROM pending_google_deletions WHERE id = ?').get(del404Id);
  const recreatedEvt33 = db.prepare('SELECT * FROM events WHERE google_event_id = ?').get('inb_evt_del_404');

  record(
    33,
    'Inbound Deletion 404 Absent: Clears tombstone and does not recreate event locally',
    'TombstoneCleared=true, NotRecreated=true, Success=true',
    `TombstoneCleared=${!tombstone33}, NotRecreated=${!recreatedEvt33}, Success=${syncRes33.success}`,
    !tombstone33 && !recreatedEvt33 && syncRes33.success
  );

  // Restore original fetch
  global.fetch = originalFetch;

  console.log('\n================================================================');
  const passedCount = testRecords.filter((r) => r.passed).length;
  const failedCount = testRecords.filter((r) => !r.passed).length;
  console.log(`TOTAL SCENARIOS: ${testRecords.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runGoogleSyncTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
