import { db } from './db.js';
import { v4 as uuidv4 } from 'uuid';

export interface GoogleAccountRow {
  id: string;
  user_id: string;
  family_id: string;
  member_id?: string | null;
  google_email: string;
  google_user_id?: string;
  access_token: string;
  refresh_token?: string;
  token_expiry: number;
  scope?: string;
  sync_status: string;
  sync_error?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface GoogleCalendarApiItem {
  id: string;
  summary: string;
  description?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  accessRole?: string;
}

export interface GoogleEventApiItem {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  recurrence?: string[];
  status?: string;
  etag?: string;
  updated?: string;
}

// In-memory concurrency locks to prevent race conditions and duplicate event creation
const activeEventSyncs = new Set<string>();
const activeAccountSyncs = new Set<string>();

// Standard Google Calendar Color Palette Mapping
const GOOGLE_COLOR_MAP: Record<string, string> = {
  '1': '#7986CB', // Lavender
  '2': '#33B679', // Sage
  '3': '#8E24AA', // Grape
  '4': '#E67C73', // Flamingo
  '5': '#F6BF26', // Banana
  '6': '#F4511E', // Tangerine
  '7': '#039BE5', // Peacock
  '8': '#616161', // Graphite
  '9': '#3F51B5', // Blueberry
  '10': '#0B8043', // Basil
  '11': '#D50000', // Tomato
};

export function sanitizeLog(input: any): string {
  if (!input) return '';
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return str
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]')
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[REDACTED]"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, '"refresh_token":"[REDACTED]"')
    .replace(/client_secret=[^&\s]+/gi, 'client_secret=[REDACTED]');
}

export function formatGoogleAllDayEndDate(startStr: string, endStr: string): string {
  const s = startStr.slice(0, 10);
  const e = endStr.slice(0, 10);
  const base = e >= s ? e : s;
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function formatGoogleRecurrence(rule?: string, until?: string): string[] | undefined {
  if (!rule || rule === 'none') return undefined;
  let freq: string;
  switch (rule) {
    case 'daily': freq = 'DAILY'; break;
    case 'weekly': freq = 'WEEKLY'; break;
    case 'fortnightly':
      return ['RRULE:FREQ=WEEKLY;INTERVAL=2' + (until ? `;UNTIL=${until.replace(/[-:]/g, '').slice(0, 8)}T235959Z` : '')];
    case 'monthly': freq = 'MONTHLY'; break;
    case 'yearly': freq = 'YEARLY'; break;
    default: return undefined;
  }
  let rrule = `RRULE:FREQ=${freq}`;
  if (until) {
    const cleanUntil = until.replace(/[-:]/g, '').slice(0, 8);
    rrule += `;UNTIL=${cleanUntil}T235959Z`;
  }
  return [rrule];
}

export function parseGoogleRecurrence(rruleList?: string[]): { rule: string; until?: string } {
  if (!rruleList || rruleList.length === 0) return { rule: 'none' };
  const rrule = rruleList.find((r) => r.startsWith('RRULE:')) || rruleList[0];
  if (!rrule) return { rule: 'none' };

  let rule = 'none';
  if (rrule.includes('INTERVAL=2') && rrule.includes('FREQ=WEEKLY')) {
    rule = 'fortnightly';
  } else if (rrule.includes('FREQ=DAILY')) {
    rule = 'daily';
  } else if (rrule.includes('FREQ=WEEKLY')) {
    rule = 'weekly';
  } else if (rrule.includes('FREQ=MONTHLY')) {
    rule = 'monthly';
  } else if (rrule.includes('FREQ=YEARLY')) {
    rule = 'yearly';
  }

  let until: string | undefined = undefined;
  const untilMatch = rrule.match(/UNTIL=([0-9]{8})/);
  if (untilMatch && untilMatch[1]) {
    const raw = untilMatch[1];
    until = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  return { rule, until };
}

export function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const appUrl = process.env.APP_URL || 'https://familycal.robinhort.link';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl.replace(/\/$/, '')}/api/v1/calendar/google/callback`;

  return {
    clientId,
    clientSecret,
    redirectUri,
    isConfigured: Boolean(clientId && clientSecret),
  };
}

export function generateAuthUrl(userId: string, familyId: string, memberId?: string | null): { url: string; state: string } {
  const { clientId, redirectUri } = getGoogleConfig();
  
  const state = uuidv4();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

  db.prepare(`
    INSERT INTO oauth_states (id, state_token, user_id, family_id, member_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), state, userId, familyId, memberId || null, new Date().toISOString(), expiresAt);

  const scope = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId || 'pending-setup',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope,
    access_type: 'offline',
    prompt: 'consent',
    state: state,
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
  };
}

export async function handleOAuthCallback(code: string, stateToken: string) {
  const stateRow = db.prepare('SELECT * FROM oauth_states WHERE state_token = ?').get(stateToken) as {
    user_id: string;
    family_id: string;
    member_id?: string | null;
    expires_at: number;
  } | undefined;

  if (!stateRow) {
    throw new Error('Invalid or expired OAuth state token.');
  }

  if (Date.now() > stateRow.expires_at) {
    db.prepare('DELETE FROM oauth_states WHERE state_token = ?').run(stateToken);
    throw new Error('OAuth authorization flow expired. Please try connecting again.');
  }

  db.prepare('DELETE FROM oauth_states WHERE state_token = ?').run(stateToken);

  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured on server.');
  }

  // 1. Exchange authorization code for access and refresh tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Google token exchange failed (${tokenResponse.status}): ${sanitizeLog(errorText)}`);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const tokenExpiry = Date.now() + tokenData.expires_in * 1000;

  // 2. Fetch authenticated user's email address
  let googleEmail = 'google-user@familycal.app';
  let googleUserId: string | null = null;
  try {
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userinfoResponse.ok) {
      const userInfo = (await userinfoResponse.json()) as { email?: string; id?: string };
      if (userInfo.email) googleEmail = userInfo.email;
      if (userInfo.id) googleUserId = userInfo.id;
    }
  } catch (err: any) {
    console.warn('Could not fetch user profile email:', sanitizeLog(err?.message || err));
  }

  // 3. Store or update account in database
  const memberId = stateRow.member_id || null;
  let existingAccount: GoogleAccountRow | undefined;

  if (memberId) {
    existingAccount = db.prepare(
      'SELECT * FROM google_accounts WHERE family_id = ? AND member_id = ?'
    ).get(stateRow.family_id, memberId) as unknown as GoogleAccountRow | undefined;
  }

  if (!existingAccount) {
    existingAccount = db.prepare(
      'SELECT * FROM google_accounts WHERE family_id = ? AND google_email = ?'
    ).get(stateRow.family_id, googleEmail) as unknown as GoogleAccountRow | undefined;
  }

  let accountId: string;
  const now = new Date().toISOString();

  if (existingAccount) {
    accountId = existingAccount.id;
    const refreshToken = tokenData.refresh_token || existingAccount.refresh_token;
    db.prepare(`
      UPDATE google_accounts
      SET user_id = ?, member_id = ?, google_email = ?, access_token = ?, refresh_token = ?, token_expiry = ?, scope = ?, sync_status = 'connected', sync_error = NULL, updated_at = ?
      WHERE id = ?
    `).run(
      stateRow.user_id,
      memberId || existingAccount.member_id || null,
      googleEmail,
      tokenData.access_token,
      refreshToken || null,
      tokenExpiry,
      tokenData.scope || null,
      now,
      accountId
    );
  } else {
    accountId = 'gacc_' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO google_accounts (id, user_id, family_id, member_id, google_email, google_user_id, access_token, refresh_token, token_expiry, scope, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?)
    `).run(
      accountId,
      stateRow.user_id,
      stateRow.family_id,
      memberId || null,
      googleEmail,
      googleUserId,
      tokenData.access_token,
      tokenData.refresh_token || null,
      tokenExpiry,
      tokenData.scope || null,
      now,
      now
    );
  }

  // 4. Initial Discovery of Google Calendars
  try {
    await discoverGoogleCalendars(stateRow.family_id, accountId, memberId);
  } catch (err: any) {
    console.error('Initial calendar discovery warning:', sanitizeLog(err?.message || err));
  }

  return { accountId, googleEmail };
}

export async function getValidAccessToken(accountId: string): Promise<string> {
  const account = db.prepare('SELECT * FROM google_accounts WHERE id = ?').get(accountId) as unknown as GoogleAccountRow | undefined;
  if (!account) {
    throw new Error('Google account not found.');
  }

  // If token is still valid for > 2 minutes, return it
  if (account.token_expiry && Date.now() < account.token_expiry - 120000) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error('Refresh token missing. Please reconnect Google Calendar.');
  }

  const { clientId, clientSecret } = getGoogleConfig();
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured on server.');
  }

  const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    const sanitizedErr = sanitizeLog(errorText);
    db.prepare(`UPDATE google_accounts SET sync_status = 'error', sync_error = ? WHERE id = ?`).run(
      'Token refresh failed: ' + sanitizedErr,
      accountId
    );
    throw new Error(`Token refresh failed: ${sanitizedErr}`);
  }

  const refreshData = (await refreshResponse.json()) as { access_token: string; expires_in: number };
  const newExpiry = Date.now() + refreshData.expires_in * 1000;

  db.prepare(`
    UPDATE google_accounts
    SET access_token = ?, token_expiry = ?, sync_status = 'connected', sync_error = NULL, updated_at = ?
    WHERE id = ?
  `).run(refreshData.access_token, newExpiry, new Date().toISOString(), accountId);

  return refreshData.access_token;
}

export async function discoverGoogleCalendars(familyId: string, accountId: string, memberId?: string | null) {
  if (!memberId) {
    const acc = db.prepare('SELECT member_id FROM google_accounts WHERE id = ?').get(accountId) as { member_id?: string } | undefined;
    if (acc?.member_id) memberId = acc.member_id;
  }

  const accessToken = await getValidAccessToken(accountId);

  // Paginated retrieval of calendarList
  const allItems: GoogleCalendarApiItem[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = `https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    }`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar list retrieval failed (${response.status}): ${sanitizeLog(errText)}`);
    }

    const data = (await response.json()) as { items?: GoogleCalendarApiItem[]; nextPageToken?: string };
    if (data.items) {
      allItems.push(...data.items);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  const now = new Date().toISOString();
  const discoveredCalIds = new Set(allItems.map((i) => i.id));

  const insertCal = db.prepare(`
    INSERT INTO calendars (id, family_id, member_id, name, color, description, is_default, source, google_calendar_id, google_account_id, is_read_only, sync_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'google', ?, ?, ?, 1, ?, ?)
  `);

  for (const item of allItems) {
    const existing = db.prepare(
      'SELECT id, member_id, google_account_id FROM calendars WHERE family_id = ? AND google_calendar_id = ?'
    ).get(familyId, item.id) as { id: string; member_id?: string | null; google_account_id?: string | null } | undefined;

    const isReadOnly = item.accessRole === 'reader' || item.accessRole === 'freeBusyReader' ? 1 : 0;
    const color = item.backgroundColor || '#4285F4';

    if (existing) {
      db.prepare(`
        UPDATE calendars
        SET name = ?, color = COALESCE(?, color), is_read_only = ?, google_account_id = ?, member_id = COALESCE(?, member_id), updated_at = ?
        WHERE id = ?
      `).run(
        item.summary || 'Google Calendar',
        color,
        isReadOnly,
        accountId,
        memberId || null,
        now,
        existing.id
      );
    } else {
      const calId = 'gcal_' + uuidv4().slice(0, 8);
      insertCal.run(
        calId,
        familyId,
        memberId || null,
        item.summary || 'Google Calendar',
        color,
        item.description || 'Imported from Google Calendar',
        item.id,
        accountId,
        isReadOnly,
        now,
        now
      );
    }
  }

  // Vanished calendar handling: if a calendar was previously synced for this account but vanished from Google,
  // disable sync_enabled without deleting local data
  const existingAccountCals = db.prepare(`
    SELECT id, google_calendar_id FROM calendars
    WHERE family_id = ? AND source = 'google' AND google_account_id = ?
  `).all(familyId, accountId) as Array<{ id: string; google_calendar_id: string }>;

  for (const cal of existingAccountCals) {
    if (cal.google_calendar_id && !discoveredCalIds.has(cal.google_calendar_id)) {
      db.prepare('UPDATE calendars SET sync_enabled = 0, updated_at = ? WHERE id = ?').run(now, cal.id);
    }
  }

  return allItems;
}

export async function syncTwoWay(familyId: string, accountId: string) {
  const syncKey = `${familyId}:${accountId}`;
  if (activeAccountSyncs.has(syncKey)) {
    console.log(`[GoogleSync] Two-way sync already running for account ${accountId}, skipping duplicate invocation.`);
    return { success: true, eventsSynced: 0, syncedAt: new Date().toISOString(), inProgress: true };
  }

  activeAccountSyncs.add(syncKey);
  const now = new Date().toISOString();
  let totalEventsSynced = 0;
  const logId = 'log_' + uuidv4().slice(0, 8);

  try {
    const accountRow = db.prepare('SELECT member_id FROM google_accounts WHERE id = ?').get(accountId) as { member_id?: string | null } | undefined;
    const accountMemberId = accountRow?.member_id || null;
    const accessToken = await getValidAccessToken(accountId);

    // 0. Drain pending deletions for this account (or unassigned account tombstones)
    const pendingDeletions = db.prepare(`
      SELECT * FROM pending_google_deletions
      WHERE family_id = ? AND (google_account_id = ? OR google_account_id IS NULL)
    `).all(familyId, accountId) as Array<{
      id: string;
      google_calendar_id: string;
      google_event_id: string;
    }>;

    for (const del of pendingDeletions) {
      try {
        const delRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            del.google_calendar_id
          )}/events/${encodeURIComponent(del.google_event_id)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        if (delRes.status === 204 || delRes.status === 404 || delRes.status === 410) {
          db.prepare('DELETE FROM pending_google_deletions WHERE id = ?').run(del.id);
        }
      } catch (err: any) {
        console.warn('[GoogleSync] Pending deletion retry warning:', sanitizeLog(err?.message || err));
        // Keep tombstone for subsequent retry
      }
    }

    const remainingPendingDelIds = new Set(
      (
        db.prepare('SELECT google_event_id FROM pending_google_deletions WHERE family_id = ?').all(familyId) as any[]
      ).map((r) => r.google_event_id)
    );

    // Find all google calendars with sync enabled for THIS account
    const syncedCalendars = db.prepare(`
      SELECT id, name, color, google_calendar_id, is_read_only, member_id, google_account_id FROM calendars
      WHERE family_id = ? AND source = 'google' AND sync_enabled = 1 AND google_calendar_id IS NOT NULL
        AND (
          google_account_id = ? OR
          (google_account_id IS NULL AND (? IS NULL OR member_id = ? OR member_id IS NULL))
        )
    `).all(familyId, accountId, accountMemberId, accountMemberId) as Array<{
      id: string;
      name: string;
      color: string;
      google_calendar_id: string;
      is_read_only: number;
      member_id?: string | null;
      google_account_id?: string | null;
    }>;

    for (const cal of syncedCalendars) {
      // 1. Inbound: Fetch from Google Calendar API with full pagination and showDeleted=true
      const timeMin = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // Past 60 days
      const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(); // Future 180 days

      let pageToken: string | undefined = undefined;
      const gEvents: GoogleEventApiItem[] = [];

      do {
        const gUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          cal.google_calendar_id
        )}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(
          timeMax
        )}&singleEvents=true&showDeleted=true&maxResults=250${
          pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
        }`;

        const gRes = await fetch(gUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!gRes.ok) {
          console.warn(`Sync failed for calendar ${cal.name}:`, sanitizeLog(await gRes.text()));
          break;
        }

        const gData = (await gRes.json()) as { items?: GoogleEventApiItem[]; nextPageToken?: string };
        if (gData.items) {
          gEvents.push(...gData.items);
        }
        pageToken = gData.nextPageToken;
      } while (pageToken);

      for (const item of gEvents) {
        // If event was deleted in FamilyCal, delete it on Google and do NOT recreate it!
        if (remainingPendingDelIds.has(item.id)) {
          try {
            const delRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                cal.google_calendar_id
              )}/events/${encodeURIComponent(item.id)}`,
              {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
            if (delRes.status === 204 || delRes.status === 404 || delRes.status === 410) {
              db.prepare('DELETE FROM pending_google_deletions WHERE family_id = ? AND google_event_id = ?').run(
                familyId,
                item.id
              );
              remainingPendingDelIds.delete(item.id);
            }
          } catch {}
          continue;
        }

        // If event was deleted in Google Calendar, remove it locally in FamilyCal
        if (item.status === 'cancelled') {
          db.prepare('DELETE FROM events WHERE family_id = ? AND google_event_id = ?').run(familyId, item.id);
          continue;
        }

        const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
        let startTime = item.start?.dateTime || item.start?.date || new Date().toISOString();
        let endTime = item.end?.dateTime || item.end?.date || startTime;

        if (isAllDay && item.start?.date) {
          const sStr = item.start.date.slice(0, 10);
          startTime = `${sStr}T00:00:00Z`;
          if (item.end?.date) {
            // Google all-day end.date is exclusive. Convert to inclusive end date for FamilyCal
            const eD = new Date(item.end.date.slice(0, 10) + 'T00:00:00Z');
            eD.setUTCDate(eD.getUTCDate() - 1);
            const inclusiveEndStr = eD.toISOString().slice(0, 10);
            const finalEndStr = inclusiveEndStr >= sStr ? inclusiveEndStr : sStr;
            endTime = `${finalEndStr}T23:59:59Z`;
          } else {
            endTime = `${sStr}T23:59:59Z`;
          }
        }
        const color = (item.colorId && GOOGLE_COLOR_MAP[item.colorId]) || cal.color || '#4285F4';

        const existing = db.prepare(`
          SELECT id, updated_at, etag, sync_status, assigned_member_ids
          FROM events
          WHERE family_id = ? AND google_event_id = ? AND (calendar_id = ? OR google_calendar_id = ?)
        `).get(familyId, item.id, cal.id, cal.google_calendar_id) as {
          id: string;
          updated_at: string;
          etag?: string | null;
          sync_status: string;
          assigned_member_ids?: string | null;
        } | undefined;

        const targetAssignedMemberIds = cal.member_id ? JSON.stringify([cal.member_id]) : '[]';

        if (existing) {
          // Conflict Detection: If local has unsynced pending changes, don't silently overwrite them with older Google data!
          if (existing.sync_status === 'pending') {
            const googleUnchanged = Boolean(item.etag && existing.etag && item.etag === existing.etag);
            const localUpdatedAt = new Date(existing.updated_at).getTime();
            const googleUpdatedAt = item.updated ? new Date(item.updated).getTime() : 0;
            const localIsNewer = !isNaN(localUpdatedAt) && !isNaN(googleUpdatedAt) && localUpdatedAt >= googleUpdatedAt;

            if (googleUnchanged || localIsNewer) {
              // Local changes take precedence. Keep local edits and pending status so outbound sync pushes them.
              continue;
            }
          }

          // Google changes take precedence (or event is not pending)
          db.prepare(`
            UPDATE events
            SET title = ?, description = ?, location = ?, color = ?, start_time = ?, end_time = ?, all_day = ?, etag = ?, sync_status = 'synced', updated_at = ?
            WHERE id = ?
          `).run(
            item.summary || '(Untitled Event)',
            item.description || null,
            item.location || null,
            color,
            startTime,
            endTime,
            isAllDay ? 1 : 0,
            item.etag || null,
            now,
            existing.id
          );

          // If the calendar is assigned to a member, ensure existing event retains/maps to that member if currently unassigned
          if (cal.member_id) {
            db.prepare(`
              UPDATE events
              SET assigned_member_ids = ?
              WHERE id = ? AND (assigned_member_ids = '[]' OR assigned_member_ids IS NULL)
            `).run(targetAssignedMemberIds, existing.id);
          }
        } else {
          const eventId = 'evt_' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO events (id, family_id, calendar_id, title, description, location, color, start_time, end_time, all_day, recurring_rule, assigned_member_ids, google_event_id, google_calendar_id, etag, sync_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?, 'synced', ?, ?)
          `).run(
            eventId,
            familyId,
            cal.id,
            item.summary || '(Untitled Event)',
            item.description || null,
            item.location || null,
            color,
            startTime,
            endTime,
            isAllDay ? 1 : 0,
            targetAssignedMemberIds,
            item.id,
            cal.google_calendar_id,
            item.etag || null,
            now,
            now
          );
        }
        totalEventsSynced++;
      }

      // 2. Outbound: Push local events marked as 'pending' destined specifically for this Google calendar (if not read-only)
      if (cal.is_read_only === 0) {
        const candidatePendingEvents = db.prepare(`
          SELECT * FROM events
          WHERE family_id = ? AND sync_status = 'pending'
        `).all(familyId) as any[];

        for (const pEvt of candidatePendingEvents) {
          let memberIds: string[] = [];
          try {
            memberIds = JSON.parse(pEvt.assigned_member_ids || '[]');
          } catch {
            memberIds = [];
          }

          const target = resolveGoogleCalendarForEvent(familyId, pEvt.calendar_id, memberIds);
          if (!target || target.calendarId !== cal.id) {
            // This event does NOT belong to this calendar; skip to prevent cross-calendar event hijacking
            continue;
          }

          const gBody: any = {
            summary: pEvt.title || '(Untitled Event)',
            description: pEvt.description || undefined,
            location: pEvt.location || undefined,
          };

          if (pEvt.all_day) {
            gBody.start = { date: pEvt.start_time.slice(0, 10) };
            gBody.end = { date: formatGoogleAllDayEndDate(pEvt.start_time, pEvt.end_time) };
          } else {
            gBody.start = { dateTime: pEvt.start_time };
            gBody.end = { dateTime: pEvt.end_time };
          }

          const recurrence = formatGoogleRecurrence(pEvt.recurring_rule, pEvt.recurring_until);
          if (recurrence) {
            gBody.recurrence = recurrence;
          }

          if (pEvt.google_event_id) {
            // Update on Google
            const patchRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                cal.google_calendar_id
              )}/events/${encodeURIComponent(pEvt.google_event_id)}`,
              {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(gBody),
              }
            );

            if (patchRes.status === 404 || patchRes.status === 410) {
              // Event was deleted in Google Calendar. Do NOT resurrect with POST! Delete locally.
              db.prepare('DELETE FROM events WHERE id = ?').run(pEvt.id);
              continue;
            }

            if (patchRes.ok) {
              const resData = (await patchRes.json()) as { etag?: string };
              db.prepare(`UPDATE events SET sync_status = 'synced', etag = ?, updated_at = ? WHERE id = ?`).run(
                resData.etag || null,
                now,
                pEvt.id
              );
            }
          } else {
            // Insert on Google
            const postRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                cal.google_calendar_id
              )}/events`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(gBody),
              }
            );
            if (postRes.ok) {
              const resData = (await postRes.json()) as { id?: string; etag?: string };
              if (resData.id) {
                db.prepare(`
                  UPDATE events
                  SET google_event_id = ?, google_calendar_id = ?, etag = ?, sync_status = 'synced', updated_at = ?
                  WHERE id = ?
                `).run(resData.id, cal.google_calendar_id, resData.etag || null, now, pEvt.id);
              }
            }
          }
        }
      }
    }

    // Update last sync on account
    db.prepare(`
      UPDATE google_accounts
      SET sync_status = 'connected', sync_error = NULL, last_synced_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, accountId);

    // Record success log
    db.prepare(`
      INSERT INTO google_sync_logs (id, family_id, account_id, sync_type, status, events_synced, details, created_at)
      VALUES (?, ?, ?, 'full', 'success', ?, ?, ?)
    `).run(logId, familyId, accountId, totalEventsSynced, `Synchronized ${totalEventsSynced} events across calendars.`, now);

    return { success: true, eventsSynced: totalEventsSynced, syncedAt: now };
  } catch (err: any) {
    const errorMsg = sanitizeLog(err?.message || String(err));
    db.prepare(`
      UPDATE google_accounts
      SET sync_status = 'error', sync_error = ?, updated_at = ?
      WHERE id = ?
    `).run(errorMsg, now, accountId);

    db.prepare(`
      INSERT INTO google_sync_logs (id, family_id, account_id, sync_type, status, events_synced, details, created_at)
      VALUES (?, ?, ?, 'full', 'failed', ?, ?, ?)
    `).run(logId, familyId, accountId, 0, `Sync failed: ${errorMsg}`, now);

    throw err;
  } finally {
    activeAccountSyncs.delete(syncKey);
  }
}

export function disconnectGoogle(familyId: string, accountId?: string, memberId?: string) {
  let targetAccountId = accountId;
  if (!targetAccountId && memberId) {
    const acc = db.prepare('SELECT id FROM google_accounts WHERE family_id = ? AND member_id = ?').get(familyId, memberId) as { id: string } | undefined;
    targetAccountId = acc?.id;
  }

  if (targetAccountId) {
    db.prepare('DELETE FROM google_accounts WHERE family_id = ? AND id = ?').run(familyId, targetAccountId);
    db.prepare(`
      UPDATE events
      SET sync_status = 'local_only', google_event_id = NULL
      WHERE family_id = ? AND calendar_id IN (
        SELECT id FROM calendars WHERE family_id = ? AND (google_account_id = ? OR member_id = ?) AND source = 'google'
      )
    `).run(familyId, familyId, targetAccountId, memberId || null);

    db.prepare(`
      UPDATE calendars
      SET sync_enabled = 0
      WHERE family_id = ? AND (google_account_id = ? OR member_id = ?) AND source = 'google'
    `).run(familyId, targetAccountId, memberId || null);
  } else {
    db.prepare('DELETE FROM google_accounts WHERE family_id = ?').run(familyId);
    db.prepare(`
      UPDATE events
      SET sync_status = 'local_only', google_event_id = NULL
      WHERE family_id = ? AND calendar_id IN (SELECT id FROM calendars WHERE family_id = ? AND source = 'google')
    `).run(familyId, familyId);

    db.prepare(`UPDATE calendars SET sync_enabled = 0 WHERE family_id = ? AND source = 'google'`).run(familyId);
  }

  return { success: true };
}

/**
 * Resolves the destination Google Calendar for an event based on its calendar and assigned members.
 */
export function resolveGoogleCalendarForEvent(
  familyId: string,
  calendarId: string,
  assignedMemberIds?: string[]
): { googleCalendarId: string; calendarId: string; googleAccountId?: string | null; isReadOnly?: number } | null {
  // 1. Direct calendar check: check if the event's calendar is a synced Google calendar
  const cal = db.prepare(`
    SELECT id, source, google_calendar_id, google_account_id, sync_enabled, is_read_only
    FROM calendars
    WHERE id = ? AND family_id = ?
  `).get(calendarId, familyId) as {
    id: string;
    source: string;
    google_calendar_id?: string;
    google_account_id?: string | null;
    sync_enabled: number;
    is_read_only: number;
  } | undefined;

  if (cal && cal.source === 'google' && cal.google_calendar_id && cal.sync_enabled === 1) {
    return {
      googleCalendarId: cal.google_calendar_id,
      calendarId: cal.id,
      googleAccountId: cal.google_account_id,
      isReadOnly: cal.is_read_only,
    };
  }

  // 2. Member assignment check: if event is assigned to a member who has an active Google calendar
  if (assignedMemberIds && assignedMemberIds.length > 0) {
    for (const memberId of assignedMemberIds) {
      if (!memberId) continue;
      const memberCal = db.prepare(`
        SELECT id, google_calendar_id, google_account_id, is_read_only FROM calendars
        WHERE family_id = ? AND source = 'google' AND sync_enabled = 1 AND member_id = ? AND google_calendar_id IS NOT NULL
        LIMIT 1
      `).get(familyId, memberId) as { id: string; google_calendar_id: string; google_account_id?: string | null; is_read_only: number } | undefined;

      if (memberCal) {
        return {
          googleCalendarId: memberCal.google_calendar_id,
          calendarId: memberCal.id,
          googleAccountId: memberCal.google_account_id,
          isReadOnly: memberCal.is_read_only,
        };
      }
    }
  }

  return null;
}

/**
 * Syncs a single FamilyCal event to Google Calendar (idempotent, handles create/update/move).
 */
export async function syncSingleEventToGoogle(params: {
  eventId: string;
  familyId: string;
  action: 'create' | 'update';
  previousGoogleCalendarId?: string | null;
  previousGoogleEventId?: string | null;
}): Promise<void> {
  const { eventId, familyId, previousGoogleCalendarId, previousGoogleEventId } = params;

  if (!eventId) {
    return;
  }

  // Concurrency guard: avoid duplicate concurrent creation/updates for the same event
  if (activeEventSyncs.has(eventId)) {
    return;
  }
  activeEventSyncs.add(eventId);

  try {
    // 1. Fetch current event from database
    const evt = db.prepare('SELECT * FROM events WHERE id = ? AND family_id = ?').get(eventId, familyId) as any;
    if (!evt) {
      // Event was deleted before sync fired
      return;
    }

    // Parse assigned members
    let memberIds: string[] = [];
    try {
      memberIds = JSON.parse(evt.assigned_member_ids || '[]');
    } catch {
      memberIds = [];
    }

    // 2. Resolve destination Google calendar
    const target = resolveGoogleCalendarForEvent(familyId, evt.calendar_id, memberIds);

    // 3. Resolve destination Google account strictly for this calendar
    let targetAccountId: string | null = null;
    if (target?.googleAccountId) {
      targetAccountId = target.googleAccountId;
    } else if (target?.calendarId) {
      const calRow = db.prepare('SELECT google_account_id, member_id FROM calendars WHERE id = ?').get(target.calendarId) as any;
      if (calRow?.google_account_id) {
        targetAccountId = calRow.google_account_id;
      } else if (calRow?.member_id) {
        const acc = db.prepare('SELECT id FROM google_accounts WHERE family_id = ? AND member_id = ? AND sync_status != "disconnected" LIMIT 1').get(familyId, calRow.member_id) as any;
        if (acc?.id) targetAccountId = acc.id;
      }
    }

    if (!targetAccountId) {
      const defaultAcc = db.prepare(`
        SELECT id FROM google_accounts
        WHERE family_id = ? AND sync_status != 'disconnected'
        ORDER BY updated_at DESC LIMIT 1
      `).get(familyId) as { id: string } | undefined;
      targetAccountId = defaultAcc?.id || null;
    }

    if (!targetAccountId) {
      // No connected Google account; if target was desired, keep pending for later sync
      if (target) {
        db.prepare("UPDATE events SET sync_status = 'pending' WHERE id = ?").run(eventId);
      } else {
        db.prepare("UPDATE events SET sync_status = 'local_only' WHERE id = ?").run(eventId);
      }
      return;
    }

    // CASE 1: Event does not belong to a synced Google calendar (or was unassigned)
    if (!target) {
      const oldCalId = previousGoogleCalendarId || evt.google_calendar_id;
      const oldEvtId = previousGoogleEventId || evt.google_event_id;

      if (oldCalId && oldEvtId) {
        try {
          const accessToken = await getValidAccessToken(targetAccountId);
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(oldCalId)}/events/${encodeURIComponent(oldEvtId)}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
        } catch (err: any) {
          console.warn(`[GoogleSync] Event ${eventId} cleanup warning:`, sanitizeLog(err?.message || err));
        }
      }

      db.prepare(`
        UPDATE events
        SET google_event_id = NULL, google_calendar_id = NULL, etag = NULL, sync_status = 'local_only', updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), eventId);
      return;
    }

    // Guard: Read-only calendar check
    if (target.isReadOnly === 1) {
      console.log(`[GoogleSync] Event ${eventId} targets read-only Google calendar ${target.googleCalendarId}; skipping write.`);
      db.prepare("UPDATE events SET sync_status = 'local_only' WHERE id = ?").run(eventId);
      return;
    }

    // CASE 2: Event belongs to a target Google calendar
    const accessToken = await getValidAccessToken(targetAccountId);
    const now = new Date().toISOString();

    const gBody: any = {
      summary: evt.title || '(Untitled Event)',
      description: evt.description || undefined,
      location: evt.location || undefined,
    };

    if (evt.all_day) {
      gBody.start = { date: evt.start_time.slice(0, 10) };
      gBody.end = { date: formatGoogleAllDayEndDate(evt.start_time, evt.end_time) };
    } else {
      gBody.start = { dateTime: evt.start_time };
      gBody.end = { dateTime: evt.end_time };
    }

    const recurrence = formatGoogleRecurrence(evt.recurring_rule, evt.recurring_until);
    if (recurrence) {
      gBody.recurrence = recurrence;
    }

    const currentGoogleEventId = evt.google_event_id || previousGoogleEventId;
    const currentGoogleCalendarId = evt.google_calendar_id || previousGoogleCalendarId;

    // Subcase 2A: Event ALREADY linked to Google (Idempotent update or move)
    if (currentGoogleEventId) {
      // Check if target calendar changed (e.g. member or calendar reassigned)
      if (currentGoogleCalendarId && currentGoogleCalendarId !== target.googleCalendarId) {
        let moved = false;
        try {
          const moveRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
              currentGoogleCalendarId
            )}/events/${encodeURIComponent(currentGoogleEventId)}/move?destination=${encodeURIComponent(
              target.googleCalendarId
            )}`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          if (moveRes.ok) {
            moved = true;
          }
        } catch {}

        if (moved) {
          const patchRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
              target.googleCalendarId
            )}/events/${encodeURIComponent(currentGoogleEventId)}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(gBody),
            }
          );
          const patchData = (await patchRes.json()) as { etag?: string };
          db.prepare(`
            UPDATE events
            SET google_calendar_id = ?, etag = ?, sync_status = 'synced', updated_at = ?
            WHERE id = ?
          `).run(target.googleCalendarId, patchData.etag || null, now, eventId);
          return;
        } else {
          // Move not supported or failed across calendars: remove from old calendar and insert in new
          try {
            await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                currentGoogleCalendarId
              )}/events/${encodeURIComponent(currentGoogleEventId)}`,
              {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
          } catch {}

          const postRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(target.googleCalendarId)}/events`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(gBody),
            }
          );

          if (!postRes.ok) {
            const errText = await postRes.text();
            throw new Error(`Google Calendar create after move failed: ${sanitizeLog(errText)}`);
          }

          const postData = (await postRes.json()) as { id: string; etag?: string };
          db.prepare(`
            UPDATE events
            SET google_event_id = ?, google_calendar_id = ?, etag = ?, sync_status = 'synced', updated_at = ?
            WHERE id = ?
          `).run(postData.id, target.googleCalendarId, postData.etag || null, now, eventId);
          return;
        }
      } else {
        // Same Google calendar: PATCH existing event
        const patchRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            target.googleCalendarId
          )}/events/${encodeURIComponent(currentGoogleEventId)}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(gBody),
          }
        );

        if (patchRes.status === 404 || patchRes.status === 410) {
          // Event was deleted in Google Calendar. Do NOT resurrect! Delete locally.
          db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
          return;
        }

        if (!patchRes.ok) {
          const errText = await patchRes.text();
          throw new Error(`Google Calendar PATCH failed: ${sanitizeLog(errText)}`);
        }

        const resData = (await patchRes.json()) as { etag?: string };
        db.prepare(`
          UPDATE events
          SET google_calendar_id = ?, etag = ?, sync_status = 'synced', updated_at = ?
          WHERE id = ?
        `).run(target.googleCalendarId, resData.etag || null, now, eventId);
        return;
      }
    } else {
      // Subcase 2B: Brand new event - POST to Google
      const postRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(target.googleCalendarId)}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(gBody),
        }
      );

      if (!postRes.ok) {
        const errText = await postRes.text();
        throw new Error(`Google Calendar POST failed: ${sanitizeLog(errText)}`);
      }

      const postData = (await postRes.json()) as { id?: string; etag?: string };
      if (postData.id) {
        db.prepare(`
          UPDATE events
          SET google_event_id = ?, google_calendar_id = ?, etag = ?, sync_status = 'synced', updated_at = ?
          WHERE id = ?
        `).run(postData.id, target.googleCalendarId, postData.etag || null, now, eventId);
      }
    }
  } catch (err: any) {
    const cleanMsg = sanitizeLog(err?.message || String(err));
    console.error(`[GoogleSync] Event-triggered Google sync failed for event ${eventId}: ${cleanMsg}`);
    if (eventId) {
      db.prepare("UPDATE events SET sync_status = 'pending' WHERE id = ?").run(eventId);
    }
  } finally {
    activeEventSyncs.delete(eventId);
  }
}

/**
 * Immediately deletes a corresponding Google Calendar event when an event is deleted in FamilyCal.
 */
export async function deleteSingleEventFromGoogle(params: {
  familyId: string;
  googleCalendarId: string;
  googleEventId: string;
  googleAccountId?: string | null;
}): Promise<void> {
  const { familyId, googleCalendarId, googleEventId, googleAccountId } = params;

  let accountId = googleAccountId || null;
  if (!accountId) {
    const cal = db.prepare(`
      SELECT google_account_id FROM calendars
      WHERE family_id = ? AND google_calendar_id = ?
    `).get(familyId, googleCalendarId) as { google_account_id?: string | null } | undefined;

    if (cal?.google_account_id) {
      accountId = cal.google_account_id;
    }
  }

  if (!accountId) {
    const account = db.prepare(`
      SELECT id FROM google_accounts
      WHERE family_id = ? AND sync_status != 'disconnected'
      ORDER BY updated_at DESC LIMIT 1
    `).get(familyId) as { id: string } | undefined;
    accountId = account?.id || null;
  }

  if (!accountId) {
    // Cannot reach Google; pending_google_deletions table keeps the tombstone for periodic reconciliation
    return;
  }

  try {
    const accessToken = await getValidAccessToken(accountId);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        googleCalendarId
      )}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (res.status === 204 || res.status === 404 || res.status === 410) {
      db.prepare('DELETE FROM pending_google_deletions WHERE family_id = ? AND google_event_id = ?').run(
        familyId,
        googleEventId
      );
    } else {
      const errText = await res.text();
      console.warn(`[GoogleSync] Delete returned status ${res.status}: ${sanitizeLog(errText)}`);
    }
  } catch (err: any) {
    console.error(`[GoogleSync] Event deletion from Google failed for ${googleEventId}: ${sanitizeLog(err?.message || err)}`);
  }
}

/**
 * Non-blocking trigger wrapper for event creation and updates.
 */
export function triggerEventSync(params: {
  eventId: string;
  familyId: string;
  action: 'create' | 'update';
  previousGoogleCalendarId?: string | null;
  previousGoogleEventId?: string | null;
}): void {
  setImmediate(async () => {
    try {
      await syncSingleEventToGoogle(params);
    } catch (err: any) {
      console.error(`[GoogleSync] Background sync error for ${params.eventId}:`, sanitizeLog(err?.message || err));
    }
  });
}

/**
 * Non-blocking trigger wrapper for event deletions.
 */
export function triggerGoogleDelete(params: {
  familyId: string;
  googleCalendarId: string;
  googleEventId: string;
  googleAccountId?: string | null;
}): void {
  setImmediate(async () => {
    try {
      await deleteSingleEventFromGoogle(params);
    } catch (err: any) {
      console.error(`[GoogleSync] Background delete error for ${params.googleEventId}:`, sanitizeLog(err?.message || err));
    }
  });
}
