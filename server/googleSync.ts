import { db } from './db.js';
import { v4 as uuidv4 } from 'uuid';

interface GoogleAccountRow {
  id: string;
  user_id: string;
  family_id: string;
  google_email: string;
  google_user_id?: string;
  access_token: string;
  refresh_token?: string;
  token_expiry: number;
  scope?: string;
  sync_status: string;
  sync_error?: string;
  last_synced_at?: string;
}

interface GoogleCalendarApiItem {
  id: string;
  summary: string;
  description?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  accessRole?: string;
}

interface GoogleEventApiItem {
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

function formatGoogleAllDayEndDate(startStr: string, endStr: string): string {
  const s = startStr.slice(0, 10);
  const e = endStr.slice(0, 10);
  const base = e >= s ? e : s;
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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

export function generateAuthUrl(userId: string, familyId: string): { url: string; state: string } {
  const { clientId, redirectUri, isConfigured } = getGoogleConfig();
  
  const state = uuidv4();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

  db.prepare(`
    INSERT INTO oauth_states (id, state_token, user_id, family_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), state, userId, familyId, new Date().toISOString(), expiresAt);

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
    expires_at: number;
  } | undefined;

  if (!stateRow) {
    throw new Error('Invalid or expired OAuth state parameter (CSRF protection failed).');
  }

  if (Date.now() > stateRow.expires_at) {
    db.prepare('DELETE FROM oauth_states WHERE state_token = ?').run(stateToken);
    throw new Error('OAuth authorization session expired. Please retry.');
  }

  db.prepare('DELETE FROM oauth_states WHERE state_token = ?').run(stateToken);

  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured on server.');
  }

  // 1. Exchange code for access & refresh tokens
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
    throw new Error(`Google Token Exchange Failed: ${errorText}`);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const tokenExpiry = Date.now() + tokenData.expires_in * 1000;

  // 2. Fetch Google User Profile
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  let googleEmail = 'google-calendar@user';
  let googleUserId = '';
  if (profileResponse.ok) {
    const profile = (await profileResponse.json()) as { email: string; id: string };
    googleEmail = profile.email || googleEmail;
    googleUserId = profile.id || '';
  }

  // 3. Save or update Google Account
  const existingAccount = db.prepare('SELECT * FROM google_accounts WHERE family_id = ? AND google_email = ?').get(
    stateRow.family_id,
    googleEmail
  ) as unknown as GoogleAccountRow | undefined;

  let accountId: string;
  const now = new Date().toISOString();

  if (existingAccount) {
    accountId = existingAccount.id;
    const refreshToken = tokenData.refresh_token || existingAccount.refresh_token;
    db.prepare(`
      UPDATE google_accounts
      SET access_token = ?, refresh_token = ?, token_expiry = ?, scope = ?, sync_status = 'connected', sync_error = NULL, updated_at = ?
      WHERE id = ?
    `).run(tokenData.access_token, refreshToken || null, tokenExpiry, tokenData.scope || null, now, accountId);
  } else {
    accountId = 'gacc_' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO google_accounts (id, user_id, family_id, google_email, google_user_id, access_token, refresh_token, token_expiry, scope, sync_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?)
    `).run(
      accountId,
      stateRow.user_id,
      stateRow.family_id,
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
    await discoverGoogleCalendars(stateRow.family_id, accountId);
  } catch (err) {
    console.error('Initial calendar discovery warning:', err);
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
    db.prepare(`UPDATE google_accounts SET sync_status = 'error', sync_error = ? WHERE id = ?`).run(
      'Token refresh failed: ' + errorText,
      accountId
    );
    throw new Error(`Token refresh failed: ${errorText}`);
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

export async function discoverGoogleCalendars(familyId: string, accountId: string) {
  const accessToken = await getValidAccessToken(accountId);

  const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google Calendar list retrieval failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { items: GoogleCalendarApiItem[] };
  const items = data.items || [];
  const now = new Date().toISOString();

  const insertCal = db.prepare(`
    INSERT INTO calendars (id, family_id, name, color, description, is_default, source, google_calendar_id, is_read_only, sync_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 'google', ?, ?, 1, ?, ?)
  `);

  const updateCal = db.prepare(`
    UPDATE calendars
    SET is_read_only = ?, updated_at = ?
    WHERE family_id = ? AND google_calendar_id = ?
  `);

  for (const item of items) {
    const existing = db.prepare('SELECT id FROM calendars WHERE family_id = ? AND google_calendar_id = ?').get(
      familyId,
      item.id
    ) as { id: string } | undefined;

    const isReadOnly = item.accessRole === 'reader' || item.accessRole === 'freeBusyReader' ? 1 : 0;
    const color = item.backgroundColor || '#4285F4';

    if (existing) {
      updateCal.run(isReadOnly, now, familyId, item.id);
    } else {
      const calId = 'gcal_' + uuidv4().slice(0, 8);
      insertCal.run(
        calId,
        familyId,
        item.summary || 'Google Calendar',
        color,
        item.description || 'Imported from Google Calendar',
        item.id,
        isReadOnly,
        now,
        now
      );
    }
  }

  return items;
}

export async function syncTwoWay(familyId: string, accountId: string) {
  const now = new Date().toISOString();
  let totalEventsSynced = 0;
  const logId = 'log_' + uuidv4().slice(0, 8);

  try {
    const accessToken = await getValidAccessToken(accountId);

    // 0. Drain any pending deletions from Google before synchronizing
    const pendingDeletions = db.prepare(`
      SELECT * FROM pending_google_deletions WHERE family_id = ?
    `).all(familyId) as Array<{
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
        console.warn('[GoogleSync] Pending deletion retry warning:', err?.message || err);
      }
    }

    const remainingPendingDelIds = new Set(
      (
        db.prepare('SELECT google_event_id FROM pending_google_deletions WHERE family_id = ?').all(familyId) as any[]
      ).map((r) => r.google_event_id)
    );

    // Find all google calendars with sync enabled for this family
    const syncedCalendars = db.prepare(`
      SELECT id, name, color, google_calendar_id, is_read_only, member_id FROM calendars
      WHERE family_id = ? AND source = 'google' AND sync_enabled = 1 AND google_calendar_id IS NOT NULL
    `).all(familyId) as Array<{
      id: string;
      name: string;
      color: string;
      google_calendar_id: string;
      is_read_only: number;
      member_id?: string | null;
    }>;

    for (const cal of syncedCalendars) {
      // 1. Inbound: Fetch from Google Calendar API
      const timeMin = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // Past 60 days
      const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(); // Future 180 days

      const gUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        cal.google_calendar_id
      )}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=250`;

      const gRes = await fetch(gUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!gRes.ok) {
        console.warn(`Sync failed for calendar ${cal.name}:`, await gRes.text());
        continue;
      }

      const gData = (await gRes.json()) as { items: GoogleEventApiItem[] };
      const gEvents = gData.items || [];

      for (const item of gEvents) {
        // If event was deleted in FamilyCal, do NOT recreate it!
        if (remainingPendingDelIds.has(item.id)) {
          try {
            await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                cal.google_calendar_id
              )}/events/${encodeURIComponent(item.id)}`,
              {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
            db.prepare('DELETE FROM pending_google_deletions WHERE family_id = ? AND google_event_id = ?').run(
              familyId,
              item.id
            );
            remainingPendingDelIds.delete(item.id);
          } catch {}
          continue;
        }

        if (item.status === 'cancelled') {
          // Remove cancelled event locally
          db.prepare('DELETE FROM events WHERE family_id = ? AND google_event_id = ?').run(familyId, item.id);
          continue;
        }

        const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
        const startTime = item.start?.dateTime || item.start?.date || new Date().toISOString();
        const endTime = item.end?.dateTime || item.end?.date || startTime;
        const color = (item.colorId && GOOGLE_COLOR_MAP[item.colorId]) || cal.color || '#4285F4';

        const existing = db.prepare('SELECT id FROM events WHERE family_id = ? AND google_event_id = ?').get(
          familyId,
          item.id
        ) as { id: string } | undefined;

        const targetAssignedMemberIds = cal.member_id ? JSON.stringify([cal.member_id]) : '[]';

        if (existing) {
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

          // If the calendar is assigned to a member, ensure existing event is mapped to that member
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

      // 2. Outbound: Push local events marked as 'pending' on this Google calendar (if not read-only)
      if (cal.is_read_only === 0) {
        const pendingEvents = db.prepare(`
          SELECT * FROM events
          WHERE family_id = ? AND sync_status = 'pending' AND (
            calendar_id = ? OR
            (? IS NOT NULL AND assigned_member_ids LIKE ?)
          )
        `).all(familyId, cal.id, cal.member_id || null, `%"${cal.member_id}"%`) as Array<{
          id: string;
          title: string;
          description?: string;
          location?: string;
          color?: string;
          start_time: string;
          end_time: string;
          all_day: number;
          google_event_id?: string;
        }>;

        for (const pEvt of pendingEvents) {
          const gBody: any = {
            summary: pEvt.title,
            description: pEvt.description,
            location: pEvt.location,
          };

          if (pEvt.all_day) {
            gBody.start = { date: pEvt.start_time.slice(0, 10) };
            gBody.end = { date: formatGoogleAllDayEndDate(pEvt.start_time, pEvt.end_time) };
          } else {
            gBody.start = { dateTime: pEvt.start_time };
            gBody.end = { dateTime: pEvt.end_time };
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
              const resData = (await postRes.json()) as { id: string; etag?: string };
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
    const errorMsg = err?.message || String(err);
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
  }
}

export function disconnectGoogle(familyId: string, accountId?: string) {
  if (accountId) {
    db.prepare('DELETE FROM google_accounts WHERE family_id = ? AND id = ?').run(familyId, accountId);
  } else {
    db.prepare('DELETE FROM google_accounts WHERE family_id = ?').run(familyId);
  }

  // Optionally keep the imported events or mark them as local_only
  db.prepare(`
    UPDATE events
    SET sync_status = 'local_only', google_event_id = NULL
    WHERE family_id = ? AND calendar_id IN (SELECT id FROM calendars WHERE family_id = ? AND source = 'google')
  `).run(familyId, familyId);

  // Set calendars to local or remove them
  db.prepare(`UPDATE calendars SET sync_enabled = 0 WHERE family_id = ? AND source = 'google'`).run(familyId);

  return { success: true };
}

/**
 * Resolves the destination Google Calendar for an event based on its calendar and assigned members.
 */
export function resolveGoogleCalendarForEvent(
  familyId: string,
  calendarId: string,
  assignedMemberIds?: string[]
): { googleCalendarId: string; calendarId: string } | null {
  // 1. Direct calendar check: check if the event's calendar is a synced Google calendar
  const cal = db.prepare(`
    SELECT id, source, google_calendar_id, sync_enabled, is_read_only
    FROM calendars
    WHERE id = ? AND family_id = ?
  `).get(calendarId, familyId) as {
    id: string;
    source: string;
    google_calendar_id?: string;
    sync_enabled: number;
    is_read_only: number;
  } | undefined;

  if (cal && cal.source === 'google' && cal.google_calendar_id && cal.sync_enabled === 1 && cal.is_read_only === 0) {
    return { googleCalendarId: cal.google_calendar_id, calendarId: cal.id };
  }

  // 2. Member assignment check: if event is assigned to a member who has an active Google calendar
  if (assignedMemberIds && assignedMemberIds.length > 0) {
    for (const memberId of assignedMemberIds) {
      if (!memberId) continue;
      const memberCal = db.prepare(`
        SELECT id, google_calendar_id FROM calendars
        WHERE family_id = ? AND source = 'google' AND sync_enabled = 1 AND is_read_only = 0 AND member_id = ? AND google_calendar_id IS NOT NULL
        LIMIT 1
      `).get(familyId, memberId) as { id: string; google_calendar_id: string } | undefined;

      if (memberCal) {
        return { googleCalendarId: memberCal.google_calendar_id, calendarId: memberCal.id };
      }
    }
  }

  // 3. If the calendar itself is marked as 'google' and has a google_calendar_id
  if (cal && cal.source === 'google' && cal.google_calendar_id && cal.sync_enabled === 1 && cal.is_read_only === 0) {
    return { googleCalendarId: cal.google_calendar_id, calendarId: cal.id };
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

  // 3. Find connected Google account for this family
  const account = db.prepare(`
    SELECT id FROM google_accounts
    WHERE family_id = ? AND sync_status != 'disconnected'
    ORDER BY updated_at DESC LIMIT 1
  `).get(familyId) as { id: string } | undefined;

  if (!account) {
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
        const accessToken = await getValidAccessToken(account.id);
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(oldCalId)}/events/${encodeURIComponent(oldEvtId)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
      } catch (err: any) {
        console.warn(`[GoogleSync] Event ${eventId} cleanup warning:`, err?.message || err);
      }
    }

    db.prepare(`
      UPDATE events
      SET google_event_id = NULL, google_calendar_id = NULL, etag = NULL, sync_status = 'local_only', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), eventId);
    return;
  }

  // CASE 2: Event belongs to a target Google calendar
  try {
    const accessToken = await getValidAccessToken(account.id);
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
            throw new Error(`Google Calendar create after move failed: ${errText}`);
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
          // Event was removed from Google Calendar; recreate it
          const recreateRes = await fetch(
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
          if (recreateRes.ok) {
            const recData = (await recreateRes.json()) as { id: string; etag?: string };
            db.prepare(`
              UPDATE events
              SET google_event_id = ?, google_calendar_id = ?, etag = ?, sync_status = 'synced', updated_at = ?
              WHERE id = ?
            `).run(recData.id, target.googleCalendarId, recData.etag || null, now, eventId);
            return;
          }
        }

        if (!patchRes.ok) {
          const errText = await patchRes.text();
          throw new Error(`Google Calendar PATCH failed: ${errText}`);
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
        throw new Error(`Google Calendar POST failed: ${errText}`);
      }

      const postData = (await postRes.json()) as { id: string; etag?: string };
      db.prepare(`
        UPDATE events
        SET google_event_id = ?, google_calendar_id = ?, etag = ?, sync_status = 'synced', updated_at = ?
        WHERE id = ?
      `).run(postData.id, target.googleCalendarId, postData.etag || null, now, eventId);
    }
  } catch (err: any) {
    const cleanMsg = err?.message || String(err);
    console.error(`[GoogleSync] Event-triggered Google sync failed for event ${eventId}: ${cleanMsg}`);
    db.prepare("UPDATE events SET sync_status = 'pending' WHERE id = ?").run(eventId);
  }
}

/**
 * Immediately deletes a corresponding Google Calendar event when an event is deleted in FamilyCal.
 */
export async function deleteSingleEventFromGoogle(params: {
  familyId: string;
  googleCalendarId: string;
  googleEventId: string;
}): Promise<void> {
  const { familyId, googleCalendarId, googleEventId } = params;

  const account = db.prepare(`
    SELECT id FROM google_accounts
    WHERE family_id = ? AND sync_status != 'disconnected'
    ORDER BY updated_at DESC LIMIT 1
  `).get(familyId) as { id: string } | undefined;

  if (!account) {
    // Cannot reach Google; pending_google_deletions table keeps the tombstone for periodic reconciliation
    return;
  }

  try {
    const accessToken = await getValidAccessToken(account.id);
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
      console.warn(`[GoogleSync] Delete returned status ${res.status}: ${errText}`);
    }
  } catch (err: any) {
    console.error(`[GoogleSync] Event deletion from Google failed for ${googleEventId}: ${err?.message || err}`);
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
      console.error(`[GoogleSync] Background sync error for ${params.eventId}:`, err?.message || err);
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
}): void {
  setImmediate(async () => {
    try {
      await deleteSingleEventFromGoogle(params);
    } catch (err: any) {
      console.error(`[GoogleSync] Background delete error for ${params.googleEventId}:`, err?.message || err);
    }
  });
}
