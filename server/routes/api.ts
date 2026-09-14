import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db, seedDefaultEventTypesForFamily, seedDefaultCalendarLayersForFamily, syncMemberBirthdaysToCalendarLayer } from '../db.js';
import {
  authenticateToken,
  requireAdmin,
  requirePermission,
  hasPermission,
  canUserEditEvent,
  canUserDeleteEvent,
  getUserMemberId,
  optionalAuth,
  generateToken,
  hashPassword,
  verifyPassword,
  TOKEN_COOKIE_NAME,
  AuthRequest,
} from '../auth.js';
import {
  PermissionKey,
  UserPermissions,
  resolveUserPermissions,
  isCustomPermissions,
  ALL_PERMISSION_KEYS,
  DEFAULT_MEMBER_PERMISSIONS,
  ADMIN_PERMISSIONS,
} from '../permissions.js';

// Helper to generate a unique username within a household
export function generateUniqueUsername(familyId: string, baseName: string, excludeUserId?: string): string {
  let cleanName = baseName.trim().replace(/[^\w\s-]/g, '').trim();
  if (!cleanName) {
    cleanName = 'Member';
  }

  let candidate = cleanName;
  let counter = 1;

  while (true) {
    const existing = db.prepare(`
      SELECT id FROM users 
      WHERE family_id = ? AND LOWER(username) = LOWER(?) ${excludeUserId ? 'AND id != ?' : ''}
    `).get(...(excludeUserId ? [familyId, candidate, excludeUserId] : [familyId, candidate]));

    if (!existing) {
      return candidate;
    }
    counter++;
    candidate = `${cleanName}${counter}`;
  }
}
import {
  getGoogleConfig,
  generateAuthUrl,
  handleOAuthCallback,
  discoverGoogleCalendars,
  syncTwoWay,
  disconnectGoogle,
  triggerEventSync,
  triggerGoogleDelete,
  resolveGoogleCalendarForEvent,
} from '../googleSync.js';

export const router = express.Router();

// ==========================================
// 1. AUTHENTICATION & ONBOARDING
// ==========================================

router.get('/auth/setup-status', (req: Request, res: Response) => {
  try {
    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    res.json({
      isSetupComplete: userCount > 0,
      userCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/register', (req: Request, res: Response) => {
  try {
    const { familyName, name, email, password, color, birthday } = req.body;
    if (!familyName || !name || !email || !password) {
      return res.status(400).json({ error: 'Family name, user name, email, and password are required.' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const now = new Date().toISOString();
    const familyId = 'fam_' + uuidv4().slice(0, 8);
    const userId = 'usr_' + uuidv4().slice(0, 8);
    const memberId = 'mem_' + uuidv4().slice(0, 8);
    const defaultCalId = 'cal_' + uuidv4().slice(0, 8);
    const passwordHash = hashPassword(password);
    const userColor = color || '#FF4FA3';
    const adminUsername = name.trim().split(' ')[0] || name.trim();

    // 1. Create Family
    db.prepare(`
      INSERT INTO families (id, name, timezone, created_at, updated_at)
      VALUES (?, ?, 'UTC', ?, ?)
    `).run(familyId, familyName.trim(), now, now);

    // 2. Create User
    db.prepare(`
      INSERT INTO users (id, family_id, email, username, password_hash, name, role, color, birthday, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'administrator', ?, ?, 1, ?, ?)
    `).run(userId, familyId, email.toLowerCase().trim(), adminUsername, passwordHash, name.trim(), userColor, birthday || null, now, now);

    // 3. Create Admin Family Member
    db.prepare(`
      INSERT INTO family_members (id, family_id, user_id, name, role, color, birthday, is_active, created_at)
      VALUES (?, ?, ?, ?, 'administrator', ?, ?, 1, ?)
    `).run(memberId, familyId, userId, name.trim(), userColor, birthday || null, now);

    // 4. Create Default Family Calendar
    db.prepare(`
      INSERT INTO calendars (id, family_id, name, color, description, is_default, source, is_read_only, sync_enabled, created_at, updated_at)
      VALUES (?, ?, 'Family Hub', ?, 'Main shared household calendar', 1, 'yimly', 0, 1, ?, ?)
    `).run(defaultCalId, familyId, userColor, now, now);

    seedDefaultEventTypesForFamily(familyId);
    seedDefaultCalendarLayersForFamily(familyId);

    const authUser = {
      id: userId,
      family_id: familyId,
      email: email.toLowerCase().trim(),
      username: adminUsername,
      name: name.trim(),
      role: 'administrator' as const,
      color: userColor,
      is_active: 1,
    };

    const token = generateToken(authUser);
    res.cookie(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      user: authUser,
      token,
      family: { id: familyId, name: familyName.trim() },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { email, username, loginIdentifier, password } = req.body;
    const identifier = (loginIdentifier || username || email || '').trim();
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username or email and password are required.' });
    }

    const cleanIdentifier = identifier.trim();
    // Search candidates by email or username (case-insensitive)
    const candidates = db.prepare(`
      SELECT * FROM users 
      WHERE (LOWER(email) = LOWER(?) OR (username IS NOT NULL AND LOWER(username) = LOWER(?)))
    `).all(cleanIdentifier, cleanIdentifier) as any[];

    if (!candidates.length) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    // Match candidate by password hash using existing bcrypt verify
    const user = candidates.find((u) => verifyPassword(password, u.password_hash));
    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    if (user.is_active === 0) {
      return res.status(403).json({ error: 'This login account has been disabled by the family administrator.' });
    }

    const authUser = {
      id: user.id,
      family_id: user.family_id,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      avatar_url: user.avatar_url,
      color: user.color,
      is_active: user.is_active,
    };

    const token = generateToken(authUser);
    res.cookie(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const family = db.prepare('SELECT id, name, timezone FROM families WHERE id = ?').get(user.family_id);

    res.json({
      user: authUser,
      token,
      family,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/logout', (req: Request, res: Response) => {
  res.clearCookie(TOKEN_COOKIE_NAME);
  res.json({ success: true, message: 'Logged out successfully.' });
});

router.get('/viewer/info', (req: Request, res: Response) => {
  try {
    const householdNameParam = (req.query.householdName || req.query.username || req.query.name || '').toString().trim();
    let family: any = null;

    if (householdNameParam) {
      family = db.prepare('SELECT id, name, viewer_password_hash FROM families WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(householdNameParam) as any;
    } else {
      family = db.prepare('SELECT id, name, viewer_password_hash FROM families ORDER BY created_at ASC LIMIT 1').get() as any;
    }

    if (!family) {
      return res.status(404).json({
        found: false,
        familyName: householdNameParam || '',
        hasViewerPassword: false,
        error: 'Household not found.',
      });
    }

    res.json({
      found: true,
      familyId: family.id,
      familyName: family.name,
      hasViewerPassword: Boolean(family.viewer_password_hash),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/viewer-login', (req: Request, res: Response) => {
  try {
    const { householdName, username, name, password } = req.body;
    const identifier = (householdName || username || name || '').trim();
    const inputPassword = (password || '').trim();

    if (!identifier) {
      return res.status(400).json({ error: 'Please enter the Household Name.' });
    }

    // Lookup matching household by Household Name (case-insensitive)
    const family = db.prepare('SELECT id, name, timezone, viewer_password_hash FROM families WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(identifier) as any;

    if (!family) {
      return res.status(404).json({ error: `Household "${identifier}" not found. Please check the Household Name.` });
    }

    // Check if Household Viewer Password is set by admin
    if (!family.viewer_password_hash) {
      return res.status(400).json({
        error: `No Household Viewer Password has been configured yet by the administrator for ${family.name}.`,
        code: 'NO_PASSWORD_CONFIGURED',
        hasViewerPassword: false,
      });
    }

    // Verify password against this household's specific password hash
    if (!inputPassword || !verifyPassword(inputPassword, family.viewer_password_hash)) {
      return res.status(401).json({ error: 'Incorrect Household Viewer password for this household. Please try again.' });
    }

    const JWT_SECRET = process.env.SESSION_SECRET || 'yimly-familycal-super-secret-key-2026';
    const viewerToken = jwt.sign(
      {
        isViewer: true,
        family_id: family.id,
        passwordHash: family.viewer_password_hash || '',
        name: family.name + ' Viewer',
        role: 'viewer',
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.cookie(TOKEN_COOKIE_NAME, viewerToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token: viewerToken,
      user: {
        id: 'viewer_' + family.id,
        family_id: family.id,
        name: family.name + ' Viewer',
        role: 'child',
        isViewer: true,
      },
      family: {
        id: family.id,
        name: family.name,
        timezone: family.timezone || 'UTC',
        has_viewer_password: Boolean(family.viewer_password_hash),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/auth/me', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const rawFamily = db.prepare('SELECT * FROM families WHERE id = ?').get(user.family_id) as any;
    const family = rawFamily
      ? {
          ...rawFamily,
          has_viewer_password: Boolean(rawFamily.viewer_password_hash),
        }
      : null;

    if (user.isViewer) {
      return res.json({
        user,
        family,
        memberProfile: null,
      });
    }

    const memberProfile = db.prepare('SELECT * FROM family_members WHERE family_id = ? AND user_id = ?').get(
      user.family_id,
      user.id
    );

    const resolvedPerms = user.resolvedPermissions || resolveUserPermissions(user.role, user.permissions);

    res.json({
      user: {
        ...user,
        permissions: resolvedPerms,
      },
      family,
      memberProfile,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. FAMILY & MEMBERS MANAGEMENT
// ==========================================

router.get('/family', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const rawFamily = db.prepare('SELECT * FROM families WHERE id = ?').get(req.user!.family_id) as any;
    const family = rawFamily
      ? {
          ...rawFamily,
          has_viewer_password: Boolean(rawFamily.viewer_password_hash),
        }
      : null;

    const rawMembers = db.prepare(`
      SELECT 
        m.*, 
        u.email as user_email,
        u.username as user_username,
        u.is_active as user_is_active,
        u.permissions as user_permissions,
        CASE WHEN u.id IS NOT NULL AND u.is_active = 1 THEN 1 ELSE 0 END as has_login
      FROM family_members m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.family_id = ? AND m.is_active = 1
      ORDER BY m.created_at ASC
    `).all(req.user!.family_id) as any[];

    const members = rawMembers.map((m) => {
      // Prioritize member's permissions or user's permissions
      const rawPerms = m.permissions || m.user_permissions || null;
      let parsedPerms: any = null;
      if (rawPerms) {
        try {
          parsedPerms = typeof rawPerms === 'string' ? JSON.parse(rawPerms) : rawPerms;
        } catch {
          parsedPerms = null;
        }
      }
      const resolved = resolveUserPermissions(m.role, parsedPerms);
      const isCustom = isCustomPermissions(parsedPerms, m.role);

      return {
        ...m,
        permissions: parsedPerms,
        resolved_permissions: resolved,
        is_custom_permissions: isCustom,
      };
    });

    res.json({ family, members });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/family/suggest-username', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const name = (req.query.name as string) || 'Member';
    const excludeUserId = req.query.excludeUserId as string | undefined;
    const username = generateUniqueUsername(req.user!.family_id, name, excludeUserId);
    res.json({ username });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/family', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { name, timezone, viewerPassword } = req.body;
    const now = new Date().toISOString();

    if (viewerPassword !== undefined) {
      if (typeof viewerPassword === 'string' && viewerPassword.trim().length > 0) {
        const passHash = hashPassword(viewerPassword.trim());
        db.prepare(`
          UPDATE families
          SET name = COALESCE(?, name), timezone = COALESCE(?, timezone), viewer_password_hash = ?, updated_at = ?
          WHERE id = ?
        `).run(name || null, timezone || null, passHash, now, req.user!.family_id);
      } else if (viewerPassword === '') {
        // Clear password
        db.prepare(`
          UPDATE families
          SET name = COALESCE(?, name), timezone = COALESCE(?, timezone), viewer_password_hash = NULL, updated_at = ?
          WHERE id = ?
        `).run(name || null, timezone || null, now, req.user!.family_id);
      }
    } else {
      db.prepare(`
        UPDATE families
        SET name = COALESCE(?, name), timezone = COALESCE(?, timezone), updated_at = ?
        WHERE id = ?
      `).run(name || null, timezone || null, now, req.user!.family_id);
    }

    const updated = db.prepare('SELECT * FROM families WHERE id = ?').get(req.user!.family_id) as any;
    res.json({
      ...updated,
      has_viewer_password: Boolean(updated.viewer_password_hash),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/family/members', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'members_manage')) {
      return res.status(403).json({ error: 'You do not have permission to add family members.' });
    }

    const { name, role, color, avatar_url, birthday, login, permissions } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Member name is required.' });
    }

    const memberRole = role || 'adult';
    const memberColor = color || '#FF4FA3';
    const now = new Date().toISOString();
    const memberId = 'mem_' + uuidv4().slice(0, 8);
    let linkedUserId: string | null = null;
    let permissionsJson: string | null = null;

    if (permissions && typeof permissions === 'object') {
      const sanitized: Record<string, boolean> = {};
      for (const k of ALL_PERMISSION_KEYS) {
        if (typeof permissions[k] === 'boolean') {
          sanitized[k] = permissions[k];
        }
      }
      permissionsJson = Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : null;
    }

    // Optional Member Login Account creation
    if (login && login.enabled) {
      if (req.user!.role !== 'administrator') {
        return res.status(403).json({ error: 'Only administrators can create member login accounts.' });
      }

      if (!login.password || login.password.trim().length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
      }

      const desiredUsername = (login.username && login.username.trim())
        ? login.username.trim()
        : generateUniqueUsername(req.user!.family_id, name.trim());

      const collision = db.prepare(
        'SELECT id FROM users WHERE family_id = ? AND LOWER(username) = LOWER(?)'
      ).get(req.user!.family_id, desiredUsername);

      if (collision) {
        return res.status(400).json({ error: `Username "${desiredUsername}" is already taken in this household.` });
      }

      const userId = 'usr_' + uuidv4().slice(0, 8);
      const passwordHash = hashPassword(login.password);
      const syntheticEmail = `${desiredUsername.toLowerCase().replace(/[^\w-]/g, '')}.${req.user!.family_id}@yimly.local`;

      db.prepare(`
        INSERT INTO users (id, family_id, email, username, password_hash, name, role, color, birthday, is_active, permissions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        userId,
        req.user!.family_id,
        syntheticEmail,
        desiredUsername,
        passwordHash,
        name.trim(),
        memberRole,
        memberColor,
        birthday || null,
        permissionsJson,
        now,
        now
      );

      linkedUserId = userId;
    }

    db.prepare(`
      INSERT INTO family_members (id, family_id, user_id, name, role, color, avatar_url, birthday, is_active, permissions, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      memberId,
      req.user!.family_id,
      linkedUserId,
      name.trim(),
      memberRole,
      memberColor,
      avatar_url || null,
      birthday || null,
      permissionsJson,
      now
    );

    const newMember = db.prepare(`
      SELECT 
        m.*, 
        u.email as user_email,
        u.username as user_username,
        u.is_active as user_is_active,
        u.permissions as user_permissions,
        CASE WHEN u.id IS NOT NULL AND u.is_active = 1 THEN 1 ELSE 0 END as has_login
      FROM family_members m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id = ?
    `).get(memberId) as any;

    const rawPerms = newMember.permissions || newMember.user_permissions || null;
    const parsedPerms = rawPerms ? JSON.parse(rawPerms) : null;

    if (birthday) {
      syncMemberBirthdaysToCalendarLayer(req.user!.family_id);
    }

    res.status(201).json({
      ...newMember,
      permissions: parsedPerms,
      resolved_permissions: resolveUserPermissions(newMember.role, parsedPerms),
      is_custom_permissions: isCustomPermissions(parsedPerms, newMember.role),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/family/members/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, color, avatar_url, birthday } = req.body;

    const existing = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    const isOwnProfile = existing.user_id === req.user!.id;
    if (!isOwnProfile && !hasPermission(req.user, 'members_manage')) {
      return res.status(403).json({ error: 'You do not have permission to edit this family member.' });
    }

    // Role changes require admin permission
    if (role && role !== existing.role && req.user!.role !== 'administrator') {
      return res.status(403).json({ error: 'Only administrators can change member roles.' });
    }

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedRole = role || existing.role;
    const updatedColor = color || existing.color;
    const updatedAvatar = avatar_url !== undefined ? avatar_url : existing.avatar_url;
    const updatedBirthday = birthday !== undefined ? birthday : existing.birthday;

    db.prepare(`
      UPDATE family_members
      SET name = ?, role = ?, color = ?, avatar_url = ?, birthday = ?
      WHERE id = ? AND family_id = ?
    `).run(updatedName, updatedRole, updatedColor, updatedAvatar, updatedBirthday, id, req.user!.family_id);

    // Keep linked user synchronized
    if (existing.user_id) {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE users
        SET name = ?, role = ?, color = ?, birthday = ?, updated_at = ?
        WHERE id = ? AND family_id = ?
      `).run(updatedName, updatedRole, updatedColor, updatedBirthday, now, existing.user_id, req.user!.family_id);
    }

    const updated = db.prepare(`
      SELECT 
        m.*, 
        u.email as user_email,
        u.username as user_username,
        u.is_active as user_is_active,
        u.permissions as user_permissions,
        CASE WHEN u.id IS NOT NULL AND u.is_active = 1 THEN 1 ELSE 0 END as has_login
      FROM family_members m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id = ?
    `).get(id) as any;

    const rawPerms = updated.permissions || updated.user_permissions || null;
    const parsedPerms = rawPerms ? JSON.parse(rawPerms) : null;

    if (birthday !== undefined) {
      syncMemberBirthdaysToCalendarLayer(req.user!.family_id);
    }

    res.json({
      ...updated,
      permissions: parsedPerms,
      resolved_permissions: resolveUserPermissions(updated.role, parsedPerms),
      is_custom_permissions: isCustomPermissions(parsedPerms, updated.role),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin-only member permissions management
router.put('/family/members/:id/permissions', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { permissions, resetToDefaults } = req.body;

    const member = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!member) {
      return res.status(404).json({ error: 'Family member not found.' });
    }

    let permissionsJson: string | null = null;

    if (resetToDefaults === true) {
      permissionsJson = null;
    } else if (permissions && typeof permissions === 'object') {
      const sanitized: Record<string, boolean> = {};
      for (const k of ALL_PERMISSION_KEYS) {
        if (typeof permissions[k] === 'boolean') {
          sanitized[k] = permissions[k];
        }
      }
      permissionsJson = Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : null;
    }

    db.prepare('UPDATE family_members SET permissions = ? WHERE id = ? AND family_id = ?').run(
      permissionsJson,
      id,
      req.user!.family_id
    );

    if (member.user_id) {
      const now = new Date().toISOString();
      db.prepare('UPDATE users SET permissions = ?, updated_at = ? WHERE id = ? AND family_id = ?').run(
        permissionsJson,
        now,
        member.user_id,
        req.user!.family_id
      );
    }

    const updated = db.prepare(`
      SELECT 
        m.*, 
        u.email as user_email,
        u.username as user_username,
        u.is_active as user_is_active,
        u.permissions as user_permissions,
        CASE WHEN u.id IS NOT NULL AND u.is_active = 1 THEN 1 ELSE 0 END as has_login
      FROM family_members m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id = ?
    `).get(id) as any;

    const rawPerms = updated.permissions || updated.user_permissions || null;
    const parsedPerms = rawPerms ? JSON.parse(rawPerms) : null;

    res.json({
      ...updated,
      permissions: parsedPerms,
      resolved_permissions: resolveUserPermissions(updated.role, parsedPerms),
      is_custom_permissions: isCustomPermissions(parsedPerms, updated.role),
      message: resetToDefaults
        ? 'Permissions reset to standard defaults.'
        : 'Permissions successfully updated.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin-only member login management (enable, disable, change username, reset password)
router.post('/family/members/:id/login', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, username, password } = req.body;

    const member = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!member) {
      return res.status(404).json({ error: 'Family member not found.' });
    }

    const now = new Date().toISOString();

    // CASE 1: Disable Login
    if (enabled === false) {
      if (member.user_id) {
        if (member.user_id === req.user!.id) {
          return res.status(400).json({ error: 'You cannot disable your own administrator login.' });
        }
        db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ? AND family_id = ?').run(
          now,
          member.user_id,
          req.user!.family_id
        );
      }
      return res.json({
        success: true,
        message: `Login disabled for ${member.name}.`,
        has_login: 0,
        user_is_active: 0,
        user_username: member.user_id ? (db.prepare('SELECT username FROM users WHERE id = ?').get(member.user_id) as any)?.username : null,
      });
    }

    // CASE 2: Enable or Update Login
    if (enabled === true) {
      if (member.user_id) {
        // Member already has an associated user account
        const existingUser = db.prepare('SELECT * FROM users WHERE id = ? AND family_id = ?').get(
          member.user_id,
          req.user!.family_id
        ) as any;

        if (!existingUser) {
          return res.status(404).json({ error: 'Linked user record not found.' });
        }

        let newUsername = existingUser.username;
        if (username && username.trim()) {
          const desired = username.trim();
          const collision = db.prepare(
            'SELECT id FROM users WHERE family_id = ? AND LOWER(username) = LOWER(?) AND id != ?'
          ).get(req.user!.family_id, desired, existingUser.id);
          if (collision) {
            return res.status(400).json({ error: `Username "${desired}" is already taken in this household.` });
          }
          newUsername = desired;
        }

        let newPasswordHash = existingUser.password_hash;
        if (password && password.trim()) {
          if (password.trim().length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
          }
          newPasswordHash = hashPassword(password);
        }

        db.prepare(`
          UPDATE users
          SET username = ?, password_hash = ?, is_active = 1, updated_at = ?
          WHERE id = ? AND family_id = ?
        `).run(newUsername, newPasswordHash, now, existingUser.id, req.user!.family_id);

        return res.json({
          success: true,
          message: `Login updated for ${member.name}.`,
          has_login: 1,
          user_is_active: 1,
          user_username: newUsername,
        });
      } else {
        // Create brand new user account for this family member
        if (!password || password.trim().length < 4) {
          return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
        }

        const desiredUsername = (username && username.trim())
          ? username.trim()
          : generateUniqueUsername(req.user!.family_id, member.name);

        const collision = db.prepare(
          'SELECT id FROM users WHERE family_id = ? AND LOWER(username) = LOWER(?)'
        ).get(req.user!.family_id, desiredUsername);
        if (collision) {
          return res.status(400).json({ error: `Username "${desiredUsername}" is already taken in this household.` });
        }

        const userId = 'usr_' + uuidv4().slice(0, 8);
        const passwordHash = hashPassword(password);
        const syntheticEmail = `${desiredUsername.toLowerCase().replace(/[^\w-]/g, '')}.${req.user!.family_id}@yimly.local`;

        db.prepare(`
          INSERT INTO users (id, family_id, email, username, password_hash, name, role, color, birthday, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          userId,
          req.user!.family_id,
          syntheticEmail,
          desiredUsername,
          passwordHash,
          member.name,
          member.role,
          member.color,
          member.birthday || null,
          now,
          now
        );

        db.prepare('UPDATE family_members SET user_id = ? WHERE id = ? AND family_id = ?').run(
          userId,
          id,
          req.user!.family_id
        );

        return res.json({
          success: true,
          message: `Login created for ${member.name}.`,
          has_login: 1,
          user_is_active: 1,
          user_username: desiredUsername,
        });
      }
    }

    res.status(400).json({ error: 'Invalid login configuration request.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/family/members/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!hasPermission(req.user, 'members_manage')) {
      return res.status(403).json({ error: 'You do not have permission to delete family members.' });
    }

    const member = db.prepare('SELECT * FROM family_members WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!member) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    if (member.user_id === req.user!.id) {
      return res.status(400).json({ error: 'You cannot remove your own account.' });
    }

    // Only administrators can remove other administrator accounts
    if (member.role === 'administrator' && req.user!.role !== 'administrator') {
      return res.status(403).json({ error: 'Only administrators can delete administrator accounts.' });
    }

    // Deactivate member
    db.prepare('UPDATE family_members SET is_active = 0 WHERE id = ? AND family_id = ?').run(
      id,
      req.user!.family_id
    );

    // If member has a linked user, disable that login account
    if (member.user_id) {
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ? AND family_id = ?').run(
        member.user_id,
        req.user!.family_id
      );
    }

    res.json({ success: true, message: 'Member and linked login deactivated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. CALENDARS
// ==========================================

router.get('/calendars', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const canViewAll = hasPermission(req.user, 'calendar_view');
    const myMemberId = getUserMemberId(req.user!.id, req.user!.family_id);

    let query = `
      SELECT 
        c.*,
        m.name as member_name,
        m.color as member_color
      FROM calendars c
      LEFT JOIN family_members m ON c.member_id = m.id AND m.family_id = c.family_id
      WHERE c.family_id = ? AND c.name != 'Family Hub'
    `;
    const params: any[] = [req.user!.family_id];

    if (!canViewAll && myMemberId) {
      query += ` AND (c.member_id = ? OR c.member_id IS NULL OR c.is_default = 1)`;
      params.push(myMemberId);
    }

    query += ` ORDER BY c.is_default DESC, c.name ASC`;

    const calendars = db.prepare(query).all(...params);
    res.json(calendars);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendars', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'calendar_create')) {
      return res.status(403).json({ error: 'You do not have permission to create calendars.' });
    }

    const { name, color, description, member_id } = req.body;
    if (!name || (typeof name === 'string' && !name.trim())) {
      return res.status(400).json({ error: 'Calendar name is required.' });
    }

    let targetMemberId: string | null = null;
    if (member_id !== undefined && member_id !== null && member_id !== '' && member_id !== 'null' && member_id !== 'unassigned') {
      if (!hasPermission(req.user, 'calendar_assign')) {
        return res.status(403).json({ error: 'You do not have permission to assign calendars to family members.' });
      }

      const validMember = db.prepare('SELECT id FROM family_members WHERE id = ? AND family_id = ? AND is_active = 1').get(
        member_id,
        req.user!.family_id
      ) as { id: string } | undefined;
      if (!validMember) {
        return res.status(400).json({ error: 'Selected family member does not exist in this household.' });
      }
      targetMemberId = validMember.id;
    }

    const calId = 'cal_' + uuidv4().slice(0, 8);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO calendars (id, family_id, member_id, name, color, description, is_default, source, is_read_only, sync_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 'yimly', 0, 1, ?, ?)
    `).run(calId, req.user!.family_id, targetMemberId, name.trim(), color || '#FF4FA3', description || null, now, now);

    const created = db.prepare(`
      SELECT 
        c.*,
        m.name as member_name,
        m.color as member_color
      FROM calendars c
      LEFT JOIN family_members m ON c.member_id = m.id AND m.family_id = c.family_id
      WHERE c.id = ?
    `).get(calId);

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/calendars/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'calendar_edit')) {
      return res.status(403).json({ error: 'You do not have permission to edit calendars.' });
    }

    const { id } = req.params;
    const { name, color, description, sync_enabled, is_read_only, member_id } = req.body;
    const now = new Date().toISOString();

    const existingCal = db.prepare('SELECT * FROM calendars WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!existingCal) {
      return res.status(404).json({ error: 'Calendar not found.' });
    }

    let isUpdatingMember = false;
    let targetMemberId: string | null = null;

    if (member_id !== undefined) {
      if (!hasPermission(req.user, 'calendar_assign')) {
        return res.status(403).json({ error: 'You do not have permission to assign calendars to family members.' });
      }

      isUpdatingMember = true;
      if (member_id && member_id !== 'null' && member_id !== 'unassigned') {
        const validMember = db.prepare('SELECT id FROM family_members WHERE id = ? AND family_id = ? AND is_active = 1').get(
          member_id,
          req.user!.family_id
        ) as { id: string } | undefined;
        if (!validMember) {
          return res.status(400).json({ error: 'Selected family member does not belong to your household.' });
        }
        targetMemberId = validMember.id;
      } else {
        targetMemberId = null;
      }
    }

    const trimmedName = name !== undefined && typeof name === 'string' && name.trim() ? name.trim() : null;

    db.prepare(`
      UPDATE calendars
      SET name = COALESCE(?, name),
          color = COALESCE(?, color),
          description = COALESCE(?, description),
          sync_enabled = COALESCE(?, sync_enabled),
          is_read_only = COALESCE(?, is_read_only),
          member_id = CASE WHEN ? = 1 THEN ? ELSE member_id END,
          updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(
      trimmedName,
      color || null,
      description !== undefined ? description : null,
      sync_enabled !== undefined ? (sync_enabled ? 1 : 0) : null,
      is_read_only !== undefined ? (is_read_only ? 1 : 0) : null,
      isUpdatingMember ? 1 : 0,
      targetMemberId,
      now,
      id,
      req.user!.family_id
    );

    // If member assignment was updated, update all existing events on this calendar accordingly
    if (isUpdatingMember) {
      if (targetMemberId) {
        db.prepare(`
          UPDATE events
          SET assigned_member_ids = ?
          WHERE calendar_id = ? AND family_id = ?
        `).run(JSON.stringify([targetMemberId]), id, req.user!.family_id);
      } else {
        db.prepare(`
          UPDATE events
          SET assigned_member_ids = '[]'
          WHERE calendar_id = ? AND family_id = ?
        `).run(id, req.user!.family_id);
      }
    }

    const updated = db.prepare(`
      SELECT 
        c.*,
        m.name as member_name,
        m.color as member_color
      FROM calendars c
      LEFT JOIN family_members m ON c.member_id = m.id AND m.family_id = c.family_id
      WHERE c.id = ? AND c.family_id = ?
    `).get(id, req.user!.family_id);

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/calendars/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'calendar_delete')) {
      return res.status(403).json({ error: 'You do not have permission to delete calendars.' });
    }

    const { id } = req.params;
    const cal = db.prepare('SELECT * FROM calendars WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!cal) return res.status(404).json({ error: 'Calendar not found.' });
    if (cal.is_default) {
      return res.status(400).json({ error: 'Cannot delete the default family calendar.' });
    }

    db.prepare('DELETE FROM calendars WHERE id = ? AND family_id = ?').run(id, req.user!.family_id);
    res.json({ success: true, message: 'Calendar deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3B. EVENT TYPES & PREASSIGNED BADGE COLOURS
// ==========================================

router.get('/event-types', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    seedDefaultEventTypesForFamily(req.user!.family_id);

    const types = db.prepare(`
      SELECT * FROM event_types
      WHERE family_id = ?
      ORDER BY is_default DESC, name ASC
    `).all(req.user!.family_id) as any[];

    res.json(types);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/event-types', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { name, color, icon } = req.body;
    if (!name || !color) {
      return res.status(400).json({ error: 'Name and colour are required for event type.' });
    }

    const id = 'et_' + uuidv4().slice(0, 8);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO event_types (id, family_id, name, color, icon, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      req.user!.family_id,
      name.trim(),
      color.trim(),
      icon?.trim() || '⭐',
      now,
      now
    );

    const created = db.prepare('SELECT * FROM event_types WHERE id = ?').get(id);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/event-types/:id', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color, icon } = req.body;

    const existing = db.prepare('SELECT * FROM event_types WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!existing) {
      return res.status(404).json({ error: 'Event type not found.' });
    }

    const now = new Date().toISOString();
    const newName = name?.trim() || existing.name;
    const newColor = color?.trim() || existing.color;
    const newIcon = icon !== undefined ? (icon.trim() || '⭐') : existing.icon;

    db.prepare(`
      UPDATE event_types
      SET name = ?, color = ?, icon = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(
      newName,
      newColor,
      newIcon,
      now,
      id,
      req.user!.family_id
    );

    // If name changed, update events using this event type to maintain consistency
    if (newName !== existing.name) {
      db.prepare('UPDATE events SET event_type = ? WHERE event_type = ? AND family_id = ?').run(
        newName,
        existing.name,
        req.user!.family_id
      );
    }

    const updated = db.prepare('SELECT * FROM event_types WHERE id = ?').get(id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/event-types/:id', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM event_types WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!existing) {
      return res.status(404).json({ error: 'Event type not found.' });
    }

    if (existing.name === 'Other') {
      return res.status(400).json({ error: 'Default "Other" event type cannot be deleted.' });
    }

    // Reassign any events using this type to default 'Other'
    db.prepare('UPDATE events SET event_type = "Other" WHERE event_type = ? AND family_id = ?').run(
      existing.name,
      req.user!.family_id
    );

    db.prepare('DELETE FROM event_types WHERE id = ? AND family_id = ?').run(
      id,
      req.user!.family_id
    );

    res.json({ success: true, message: 'Event type deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. EVENTS & RECURRENCE
// ==========================================

router.get('/events', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'event_view')) {
      return res.status(403).json({ error: 'You do not have permission to view calendar events.' });
    }

    const { start, end, member_id, calendar_id } = req.query as {
      start?: string;
      end?: string;
      member_id?: string;
      calendar_id?: string;
    };

    let query = `
      SELECT e.*, c.name as calendar_name, c.source as calendar_source
      FROM events e
      JOIN calendars c ON e.calendar_id = c.id
      WHERE e.family_id = ?
    `;
    const params: any[] = [req.user!.family_id];

    if (calendar_id) {
      query += ` AND e.calendar_id = ?`;
      params.push(calendar_id);
    }

    query += ` ORDER BY e.start_time ASC`;

    const rawEvents = db.prepare(query).all(...params) as any[];

    // Parse JSON member IDs and handle client filtering
    let events = rawEvents.map((evt) => {
      let assignedMemberIds: string[] = [];
      try {
        assignedMemberIds = JSON.parse(evt.assigned_member_ids || '[]');
      } catch {
        assignedMemberIds = [];
      }
      return {
        ...evt,
        event_type: evt.event_type || 'Other',
        all_day: Boolean(evt.all_day),
        assigned_member_ids: assignedMemberIds,
        reminder_minutes: evt.reminder_minutes !== null && evt.reminder_minutes !== undefined ? Number(evt.reminder_minutes) : null,
      };
    });

    if (member_id) {
      events = events.filter((e) => e.assigned_member_ids.includes(member_id));
    }

    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/events', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'event_create')) {
      return res.status(403).json({ error: 'You do not have permission to create calendar events.' });
    }

    const {
      calendar_id,
      title,
      description,
      location,
      color,
      event_type,
      start_time,
      end_time,
      all_day,
      recurring_rule,
      recurring_until,
      assigned_member_ids,
      reminder_minutes,
    } = req.body;

    if (!title || !start_time || !end_time) {
      return res.status(400).json({ error: 'Title, start time, and end time are required.' });
    }

    // Default to first non-Family-Hub calendar if not provided
    let targetCalId = calendar_id;
    if (!targetCalId) {
      const defaultCal = db.prepare("SELECT id FROM calendars WHERE family_id = ? AND name != 'Family Hub' ORDER BY is_default DESC, created_at ASC LIMIT 1").get(
        req.user!.family_id
      ) as { id: string } | undefined;
      targetCalId = defaultCal?.id;
    }

    const eventId = 'evt_' + uuidv4().slice(0, 8);
    const now = new Date().toISOString();

    let cal = db.prepare('SELECT * FROM calendars WHERE id = ? AND family_id = ?').get(
      targetCalId,
      req.user!.family_id
    ) as any;

    if (cal && cal.name === 'Family Hub') {
      const altCal = db.prepare("SELECT * FROM calendars WHERE family_id = ? AND name != 'Family Hub' ORDER BY is_default DESC, created_at ASC LIMIT 1").get(
        req.user!.family_id
      ) as any;
      if (altCal) {
        cal = altCal;
        targetCalId = altCal.id;
      }
    }

    // Automatically inherit member assignment from calendar if not explicitly provided
    let finalMemberIds: string[] = [];
    if (Array.isArray(assigned_member_ids) && assigned_member_ids.length > 0) {
      finalMemberIds = assigned_member_ids;
    } else if (cal?.member_id) {
      finalMemberIds = [cal.member_id];
    }

    // Member selection determines full event-card background colour
    let eventColor = color;
    if (finalMemberIds.length > 0) {
      const memberRow = db.prepare('SELECT color FROM family_members WHERE id = ?').get(finalMemberIds[0]) as any;
      if (memberRow?.color) {
        eventColor = memberRow.color;
      }
    }
    if (!eventColor) {
      eventColor = cal?.color || '#F8BBD0';
    }

    const finalEventType = (event_type && typeof event_type === 'string' && event_type.trim()) ? event_type.trim() : 'Other';
    const reminderMinutesVal = reminder_minutes !== undefined && reminder_minutes !== null && reminder_minutes !== ''
      ? Number(reminder_minutes)
      : null;

    const memberIdsJson = JSON.stringify(finalMemberIds);
    const isGoogleCal = cal?.source === 'google';
    const targetGoogle = resolveGoogleCalendarForEvent(req.user!.family_id, targetCalId, finalMemberIds);
    const syncStatus = targetGoogle ? 'pending' : (isGoogleCal ? 'pending' : 'local_only');

    db.prepare(`
      INSERT INTO events (
        id, family_id, calendar_id, title, description, location, color, event_type,
        start_time, end_time, all_day, recurring_rule, recurring_until,
        assigned_member_ids, reminder_minutes, sync_status, created_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      req.user!.family_id,
      targetCalId,
      title.trim(),
      description || null,
      location || null,
      eventColor,
      finalEventType,
      start_time,
      end_time,
      all_day ? 1 : 0,
      recurring_rule || 'none',
      recurring_until || null,
      memberIdsJson,
      reminderMinutesVal,
      syncStatus,
      req.user!.id,
      now,
      now
    );

    const created = db.prepare(`
      SELECT e.*, c.name as calendar_name, c.source as calendar_source
      FROM events e
      JOIN calendars c ON e.calendar_id = c.id
      WHERE e.id = ?
    `).get(eventId) as any;

    res.status(201).json({
      ...created,
      event_type: created.event_type || finalEventType,
      all_day: Boolean(created.all_day),
      assigned_member_ids: JSON.parse(created.assigned_member_ids || '[]'),
      reminder_minutes: created.reminder_minutes !== null && created.reminder_minutes !== undefined ? Number(created.reminder_minutes) : null,
    });

    // Non-blocking Google Calendar synchronization
    triggerEventSync({
      eventId,
      familyId: req.user!.family_id,
      action: 'create',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/events/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      calendar_id,
      title,
      description,
      location,
      color,
      event_type,
      start_time,
      end_time,
      all_day,
      recurring_rule,
      recurring_until,
      assigned_member_ids,
      reminder_minutes,
    } = req.body;

    const existing = db.prepare('SELECT * FROM events WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!existing) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    if (!canUserEditEvent(req.user!, existing)) {
      return res.status(403).json({ error: 'You do not have permission to edit this event.' });
    }

    const prevGoogleCalendarId = existing.google_calendar_id;
    const prevGoogleEventId = existing.google_event_id;

    const now = new Date().toISOString();
    const targetCalId = calendar_id || existing.calendar_id;
    const cal = db.prepare('SELECT * FROM calendars WHERE id = ?').get(targetCalId) as any;
    const effectiveMembers = assigned_member_ids !== undefined
      ? assigned_member_ids
      : JSON.parse(existing.assigned_member_ids || '[]');
    const targetGoogle = resolveGoogleCalendarForEvent(req.user!.family_id, targetCalId, effectiveMembers);
    const syncStatus = targetGoogle ? 'pending' : (cal?.source === 'google' ? 'pending' : existing.sync_status);

    // Member selection determines full event-card background colour
    let finalColor = color || null;
    if (assigned_member_ids && Array.isArray(assigned_member_ids) && assigned_member_ids.length > 0) {
      const memberRow = db.prepare('SELECT color FROM family_members WHERE id = ?').get(assigned_member_ids[0]) as any;
      if (memberRow?.color) {
        finalColor = memberRow.color;
      }
    }

    const finalEventType = event_type !== undefined ? (event_type?.trim() || 'Other') : null;
    const finalReminderMinutes = reminder_minutes !== undefined
      ? (reminder_minutes !== null && reminder_minutes !== '' ? Number(reminder_minutes) : null)
      : (existing.reminder_minutes !== null && existing.reminder_minutes !== undefined ? Number(existing.reminder_minutes) : null);

    db.prepare(`
      UPDATE events
      SET calendar_id = ?,
          title = COALESCE(?, title),
          description = ?,
          location = ?,
          color = COALESCE(?, color),
          event_type = COALESCE(?, event_type),
          start_time = COALESCE(?, start_time),
          end_time = COALESCE(?, end_time),
          all_day = ?,
          recurring_rule = COALESCE(?, recurring_rule),
          recurring_until = ?,
          assigned_member_ids = ?,
          reminder_minutes = ?,
          sync_status = ?,
          updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(
      targetCalId,
      title || null,
      description !== undefined ? description : existing.description,
      location !== undefined ? location : existing.location,
      finalColor,
      finalEventType,
      start_time || null,
      end_time || null,
      all_day !== undefined ? (all_day ? 1 : 0) : existing.all_day,
      recurring_rule || null,
      recurring_until !== undefined ? recurring_until : existing.recurring_until,
      assigned_member_ids ? JSON.stringify(assigned_member_ids) : existing.assigned_member_ids,
      finalReminderMinutes,
      syncStatus,
      now,
      id,
      req.user!.family_id
    );

    const updated = db.prepare(`
      SELECT e.*, c.name as calendar_name, c.source as calendar_source
      FROM events e
      JOIN calendars c ON e.calendar_id = c.id
      WHERE e.id = ?
    `).get(id) as any;

    res.json({
      ...updated,
      event_type: updated.event_type || 'Other',
      all_day: Boolean(updated.all_day),
      assigned_member_ids: JSON.parse(updated.assigned_member_ids || '[]'),
      reminder_minutes: updated.reminder_minutes !== null && updated.reminder_minutes !== undefined ? Number(updated.reminder_minutes) : null,
    });

    // Non-blocking Google Calendar synchronization
    triggerEventSync({
      eventId: id,
      familyId: req.user!.family_id,
      action: 'update',
      previousGoogleCalendarId: prevGoogleCalendarId,
      previousGoogleEventId: prevGoogleEventId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/events/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM events WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!existing) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    if (!canUserDeleteEvent(req.user!, existing)) {
      return res.status(403).json({ error: 'You do not have permission to delete this event.' });
    }

    // If linked to Google, record tombstone in pending_google_deletions to prevent accidental resurrection
    if (existing.google_event_id && existing.google_calendar_id) {
      db.prepare(`
        INSERT OR REPLACE INTO pending_google_deletions (id, family_id, google_calendar_id, google_event_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'del_' + uuidv4().slice(0, 8),
        req.user!.family_id,
        existing.google_calendar_id,
        existing.google_event_id,
        new Date().toISOString()
      );
    }

    db.prepare('DELETE FROM events WHERE id = ? AND family_id = ?').run(id, req.user!.family_id);
    res.json({ success: true, message: 'Event deleted.' });

    // Non-blocking immediate Google Calendar deletion
    if (existing.google_event_id && existing.google_calendar_id) {
      triggerGoogleDelete({
        familyId: req.user!.family_id,
        googleCalendarId: existing.google_calendar_id,
        googleEventId: existing.google_event_id,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. TASKS & TO-DOS
// ==========================================

function addDaysToDate(d: Date, days: number): Date {
  const res = new Date(d.getTime());
  res.setDate(res.getDate() + days);
  return res;
}

function addMonthsToDate(d: Date, months: number): Date {
  const res = new Date(d.getTime());
  const origDay = res.getDate();
  res.setMonth(res.getMonth() + months);
  // If month rollover overshot (e.g. Aug 31 -> Sep has 30 days -> overshoots to Oct 1)
  if (res.getDate() !== origDay) {
    res.setDate(0); // clamp to last day of target month
  }
  return res;
}

function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeNextTaskOccurrenceDate(
  currentDueDate: string | null | undefined,
  rule: string,
  interval?: number | null,
  unit?: string | null
): string {
  const now = new Date();
  const todayYMD = formatDateYMD(now);

  const stepInterval = Math.max(1, Number(interval) || 1);
  const normalizedUnit = (unit || 'day').toLowerCase();

  const advanceOneStep = (date: Date): Date => {
    switch (rule) {
      case 'daily':
        return addDaysToDate(date, 1);
      case 'weekly':
        return addDaysToDate(date, 7);
      case 'fortnightly':
        return addDaysToDate(date, 14);
      case 'monthly':
        return addMonthsToDate(date, 1);
      case 'custom':
        if (normalizedUnit.startsWith('month')) {
          return addMonthsToDate(date, stepInterval);
        } else if (normalizedUnit.startsWith('week')) {
          return addDaysToDate(date, stepInterval * 7);
        } else {
          return addDaysToDate(date, stepInterval);
        }
      default:
        return addDaysToDate(date, 1);
    }
  };

  let baseDate: Date;
  if (currentDueDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDueDate)) {
    const [y, m, d] = currentDueDate.split('-').map(Number);
    baseDate = new Date(y, m - 1, d);
  } else {
    baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  // Advance by at least one step from scheduled occurrence
  let nextDate = advanceOneStep(baseDate);
  let nextDateYMD = formatDateYMD(nextDate);

  // If the task is overdue and completed late, advance from the scheduled occurrence rather than creating duplicate catch-up tasks
  let safetyCount = 0;
  while (nextDateYMD < todayYMD && safetyCount < 1000) {
    nextDate = advanceOneStep(nextDate);
    nextDateYMD = formatDateYMD(nextDate);
    safetyCount++;
  }

  return nextDateYMD;
}

function advanceRecurringTaskIfApplicable(
  task: any,
  familyId: string,
  overrideRule?: string,
  overrideInterval?: number,
  overrideUnit?: string,
  nowIso?: string
) {
  const rule = overrideRule !== undefined ? overrideRule : (task.recurring_rule || 'none');
  const interval = overrideInterval !== undefined ? overrideInterval : (task.recurring_interval || 1);
  const unit = overrideUnit !== undefined ? overrideUnit : (task.recurring_unit || 'day');

  if (!rule || rule === 'none') {
    return null;
  }

  const nextDueDate = computeNextTaskOccurrenceDate(
    task.due_date,
    rule,
    interval,
    unit
  );

  const nextTaskId = 'tsk_' + uuidv4().slice(0, 8);
  const now = nowIso || new Date().toISOString();
  const cleanReminder = task.reminder_minutes !== undefined && task.reminder_minutes !== null && task.reminder_minutes !== ''
    ? Number(task.reminder_minutes)
    : null;

  db.prepare(`
    INSERT INTO tasks (
      id, family_id, title, description, due_date, due_time, reminder_minutes,
      completed, completed_at, is_archived, assigned_member_id, priority,
      recurring_rule, recurring_interval, recurring_unit, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextTaskId,
    familyId,
    task.title,
    task.description || null,
    nextDueDate,
    task.due_time || null,
    cleanReminder,
    task.assigned_member_id || null,
    task.priority || 'medium',
    rule,
    interval,
    unit,
    now,
    now
  );

  return db.prepare(`
    SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
    FROM tasks t
    LEFT JOIN family_members m ON t.assigned_member_id = m.id
    WHERE t.id = ?
  `).get(nextTaskId) as any;
}

function formatTaskRow(t: any) {
  let assignedIds: string[] = [];
  try {
    if (t.assigned_member_ids) {
      assignedIds = JSON.parse(t.assigned_member_ids);
    }
  } catch {
    assignedIds = [];
  }
  if (assignedIds.length === 0 && t.assigned_member_id) {
    assignedIds = [t.assigned_member_id];
  }

  const todayStr = new Date().toISOString().split('T')[0];

  return {
    ...t,
    completed: Boolean(t.completed),
    is_archived: Boolean(t.is_archived),
    assigned_member_ids: assignedIds,
    assigned_member_id: assignedIds[0] || t.assigned_member_id || null,
    due_date: t.due_date ? t.due_date.split('T')[0] : todayStr,
    recurring_rule: t.recurring_rule || 'none',
    recurring_interval: t.recurring_interval ? Number(t.recurring_interval) : 1,
    recurring_unit: t.recurring_unit || 'day',
  };
}

router.get('/tasks', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const tasks = db.prepare(`
      SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
      FROM tasks t
      LEFT JOIN family_members m ON t.assigned_member_id = m.id
      WHERE t.family_id = ?
      ORDER BY t.completed ASC, t.due_date ASC, t.created_at DESC
    `).all(req.user!.family_id);

    res.json(tasks.map(formatTaskRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      description,
      due_date,
      due_time,
      reminder_minutes,
      assigned_member_id,
      assigned_member_ids,
      priority,
      is_archived,
      recurring_rule,
      recurring_interval,
      recurring_unit,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const cleanDueDate = due_date ? due_date.split('T')[0] : todayStr;

    let finalMemberIds: string[] = [];
    if (Array.isArray(assigned_member_ids) && assigned_member_ids.length > 0) {
      finalMemberIds = assigned_member_ids;
    } else if (assigned_member_id) {
      finalMemberIds = [assigned_member_id];
    } else {
      // Find active family members as fallback
      const activeMembers = db.prepare(`SELECT id FROM family_members WHERE family_id = ? AND is_active = 1`).all(req.user!.family_id) as any[];
      finalMemberIds = activeMembers.map((m: any) => m.id);
    }

    if (finalMemberIds.length === 0) {
      return res.status(400).json({ error: 'Every task must be assigned to at least one family member.' });
    }

    const primaryMemberId = finalMemberIds[0];
    const taskId = 'tsk_' + uuidv4().slice(0, 8);
    const now = new Date().toISOString();
    const cleanReminder = reminder_minutes !== undefined && reminder_minutes !== null && reminder_minutes !== '' 
      ? Number(reminder_minutes) 
      : null;
    const rule = recurring_rule || 'none';
    const interval = recurring_interval ? Math.max(1, Number(recurring_interval)) : 1;
    const unit = recurring_unit || 'day';

    db.prepare(`
      INSERT INTO tasks (
        id, family_id, title, description, due_date, due_time, reminder_minutes,
        completed, is_archived, assigned_member_id, assigned_member_ids, priority,
        recurring_rule, recurring_interval, recurring_unit, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      req.user!.family_id,
      title.trim(),
      description || null,
      cleanDueDate,
      due_time || null,
      cleanReminder,
      is_archived ? 1 : 0,
      primaryMemberId,
      JSON.stringify(finalMemberIds),
      priority || 'medium',
      rule,
      interval,
      unit,
      now,
      now
    );

    const created = db.prepare(`
      SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
      FROM tasks t
      LEFT JOIN family_members m ON t.assigned_member_id = m.id
      WHERE t.id = ?
    `).get(taskId) as any;

    res.status(201).json(formatTaskRow(created));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/tasks/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const {
      title,
      description,
      due_date,
      due_time,
      reminder_minutes,
      assigned_member_id,
      assigned_member_ids,
      priority,
      completed,
      is_archived,
      recurring_rule,
      recurring_interval,
      recurring_unit,
    } = req.body;
    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().split('T')[0];

    const wasCompleted = Boolean(task.completed);
    const newCompleted = completed !== undefined ? (completed ? 1 : 0) : task.completed;
    const newCompletedAt = newCompleted ? (task.completed_at || now) : null;
    const newArchived = is_archived !== undefined ? (is_archived ? 1 : 0) : task.is_archived;
    const newReminder = reminder_minutes !== undefined 
      ? (reminder_minutes !== null && reminder_minutes !== '' ? Number(reminder_minutes) : null)
      : task.reminder_minutes;

    const newRule = recurring_rule !== undefined ? (recurring_rule || 'none') : (task.recurring_rule || 'none');
    const newInterval = recurring_interval !== undefined ? Math.max(1, Number(recurring_interval) || 1) : (task.recurring_interval || 1);
    const newUnit = recurring_unit !== undefined ? (recurring_unit || 'day') : (task.recurring_unit || 'day');

    let finalMemberIds: string[] = [];
    if (assigned_member_ids !== undefined) {
      finalMemberIds = Array.isArray(assigned_member_ids) ? assigned_member_ids : [];
    } else if (assigned_member_id !== undefined) {
      finalMemberIds = assigned_member_id ? [assigned_member_id] : [];
    } else {
      try {
        finalMemberIds = JSON.parse(task.assigned_member_ids || '[]');
      } catch {
        finalMemberIds = [];
      }
      if (finalMemberIds.length === 0 && task.assigned_member_id) {
        finalMemberIds = [task.assigned_member_id];
      }
    }

    if (finalMemberIds.length === 0) {
      return res.status(400).json({ error: 'Every task must be assigned to at least one family member.' });
    }

    const primaryMemberId = finalMemberIds[0];
    const cleanDueDate = due_date !== undefined ? (due_date ? due_date.split('T')[0] : todayStr) : task.due_date;

    db.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, due_date = ?, due_time = ?, reminder_minutes = ?,
          assigned_member_id = ?, assigned_member_ids = ?, priority = ?, completed = ?, completed_at = ?,
          is_archived = ?, recurring_rule = ?, recurring_interval = ?, recurring_unit = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(
      title !== undefined ? title.trim() : task.title,
      description !== undefined ? (description || null) : task.description,
      cleanDueDate,
      due_time !== undefined ? (due_time || null) : task.due_time,
      newReminder,
      primaryMemberId,
      JSON.stringify(finalMemberIds),
      priority !== undefined ? priority : task.priority,
      newCompleted,
      newCompletedAt,
      newArchived,
      newRule,
      newInterval,
      newUnit,
      now,
      id,
      req.user!.family_id
    );

    // If transitioned from incomplete to complete, advance recurring task
    if (!wasCompleted && newCompleted === 1) {
      const updatedForAdvance = {
        ...task,
        title: title !== undefined ? title.trim() : task.title,
        description: description !== undefined ? description : task.description,
        due_date: cleanDueDate,
        due_time: due_time !== undefined ? due_time : task.due_time,
        reminder_minutes: newReminder,
        assigned_member_id: primaryMemberId,
        priority: priority !== undefined ? priority : task.priority,
      };
      advanceRecurringTaskIfApplicable(
        updatedForAdvance,
        req.user!.family_id,
        newRule,
        newInterval,
        newUnit,
        now
      );
    }

    const updated = db.prepare(`
      SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
      FROM tasks t
      LEFT JOIN family_members m ON t.assigned_member_id = m.id
      WHERE t.id = ?
    `).get(id) as any;

    res.json(formatTaskRow(updated));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks/:id/toggle', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const wasCompleted = Boolean(task.completed);
    const willComplete = !wasCompleted;
    const newCompleted = willComplete ? 1 : 0;
    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().split('T')[0];

    // Find current requesting family member ID
    const currentMember = db.prepare(
      'SELECT id FROM family_members WHERE (user_id = ? OR id = ?) AND family_id = ?'
    ).get(req.user!.id, req.user!.id, req.user!.family_id) as any;
    const currentMemberId = currentMember?.id;

    // Verify member assignment rule
    let assignedIds: string[] = [];
    try {
      if (task.assigned_member_ids) {
        assignedIds = JSON.parse(task.assigned_member_ids);
      }
    } catch {
      assignedIds = [];
    }
    if (assignedIds.length === 0 && task.assigned_member_id) {
      assignedIds = [task.assigned_member_id];
    }

    if (currentMemberId && !assignedIds.includes(currentMemberId)) {
      return res.status(403).json({ error: 'Only assigned family members can complete this task.' });
    }

    // Verify date rule when ticking off
    const taskDueDateStr = task.due_date ? task.due_date.split('T')[0] : todayStr;
    if (willComplete && todayStr < taskDueDateStr) {
      return res.status(400).json({
        error: `Tasks cannot be completed before their due date (${taskDueDateStr}).`,
      });
    }

    db.prepare(`
      UPDATE tasks
      SET completed = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(newCompleted, willComplete ? now : null, now, id, req.user!.family_id);

    // If transitioned from incomplete to complete, advance recurring task
    if (!wasCompleted && willComplete) {
      advanceRecurringTaskIfApplicable(
        task,
        req.user!.family_id,
        task.recurring_rule,
        task.recurring_interval,
        task.recurring_unit,
        now
      );
    }

    const updated = db.prepare(`
      SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
      FROM tasks t
      LEFT JOIN family_members m ON t.assigned_member_id = m.id
      WHERE t.id = ?
    `).get(id) as any;

    res.json(formatTaskRow(updated));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks/:id/archive', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const newArchived = task.is_archived ? 0 : 1;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE tasks
      SET is_archived = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(newArchived, now, id, req.user!.family_id);

    const updated = db.prepare(`
      SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
      FROM tasks t
      LEFT JOIN family_members m ON t.assigned_member_id = m.id
      WHERE t.id = ?
    `).get(id) as any;

    res.json({
      ...updated,
      completed: Boolean(updated.completed),
      is_archived: Boolean(updated.is_archived),
      recurring_rule: updated.recurring_rule || 'none',
      recurring_interval: updated.recurring_interval ? Number(updated.recurring_interval) : 1,
      recurring_unit: updated.recurring_unit || 'day',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/tasks/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM tasks WHERE id = ? AND family_id = ?').run(id, req.user!.family_id);
    res.json({ success: true, message: 'Task deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. BIRTHDAYS
// ==========================================

router.get('/birthdays', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const members = db.prepare(`
      SELECT id, name, role, color, avatar_url, birthday
      FROM family_members
      WHERE family_id = ? AND is_active = 1 AND birthday IS NOT NULL AND birthday != ''
    `).all(req.user!.family_id) as Array<{
      id: string;
      name: string;
      role: string;
      color: string;
      avatar_url: string;
      birthday: string;
    }>;

    const today = new Date();
    const currentYear = today.getFullYear();

    const birthdays = members.map((m) => {
      const bDate = new Date(m.birthday);
      const birthMonth = bDate.getMonth();
      const birthDay = bDate.getDate();

      let nextBirthday = new Date(currentYear, birthMonth, birthDay);
      if (nextBirthday.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) {
        nextBirthday = new Date(currentYear + 1, birthMonth, birthDay);
      }

      const diffTime = nextBirthday.getTime() - today.getTime();
      const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const turningAge = nextBirthday.getFullYear() - bDate.getFullYear();

      return {
        member_id: m.id,
        name: m.name,
        role: m.role,
        color: m.color,
        avatar_url: m.avatar_url,
        birthday: m.birthday,
        next_birthday_date: nextBirthday.toISOString().slice(0, 10),
        days_until: daysUntil,
        turning_age: turningAge > 0 ? turningAge : undefined,
      };
    });

    birthdays.sort((a, b) => a.days_until - b.days_until);
    res.json(birthdays);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. GOOGLE CALENDAR INTEGRATION
// ==========================================

router.get('/calendar/google/config', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const config = getGoogleConfig();
    const accounts = db.prepare(`
      SELECT id, google_email, sync_status, sync_error, last_synced_at, created_at
      FROM google_accounts
      WHERE family_id = ?
    `).all(req.user!.family_id);

    res.json({
      isConfigured: config.isConfigured,
      redirectUri: config.redirectUri,
      hasClientId: Boolean(config.clientId),
      connectedAccounts: accounts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(['/calendar/google/auth-url', '/calendar/google/auth'], authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'google_calendar_manage')) {
      return res.status(403).json({ error: 'You do not have permission to manage Google Calendar integrations.' });
    }

    const { url, state } = generateAuthUrl(req.user!.id, req.user!.family_id);
    
    // If request accepts json
    if (req.headers.accept?.includes('application/json') || req.query.json === 'true') {
      return res.json({ url, state });
    }
    
    res.redirect(url);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/calendar/google/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

    if (error) {
      return res.redirect('/#integrations?sync_error=' + encodeURIComponent(error));
    }
    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state token.');
    }

    const result = await handleOAuthCallback(code, state);
    res.redirect('/#integrations?sync_ok=1&account=' + encodeURIComponent(result.googleEmail));
  } catch (err: any) {
    res.redirect('/#integrations?sync_error=' + encodeURIComponent(err.message));
  }
});

router.get('/calendar/google/accounts', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const accounts = db.prepare(`
      SELECT id, google_email, sync_status, sync_error, last_synced_at, created_at
      FROM google_accounts
      WHERE family_id = ?
    `).all(req.user!.family_id);

    res.json(accounts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar/google/discover', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'google_calendar_manage')) {
      return res.status(403).json({ error: 'You do not have permission to manage Google Calendar integrations.' });
    }

    const { account_id } = req.body;
    const account = db.prepare('SELECT id FROM google_accounts WHERE family_id = ? AND (id = ? OR ? IS NULL) LIMIT 1').get(
      req.user!.family_id,
      account_id || null,
      account_id || null
    ) as { id: string } | undefined;

    if (!account) {
      return res.status(404).json({ error: 'No connected Google account found.' });
    }

    const calendars = await discoverGoogleCalendars(req.user!.family_id, account.id);
    res.json({ success: true, count: calendars.length, calendars });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar/google/sync', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'google_calendar_manage')) {
      return res.status(403).json({ error: 'You do not have permission to manage Google Calendar integrations.' });
    }

    const { account_id } = req.body;
    const account = db.prepare('SELECT id FROM google_accounts WHERE family_id = ? AND (id = ? OR ? IS NULL) LIMIT 1').get(
      req.user!.family_id,
      account_id || null,
      account_id || null
    ) as { id: string } | undefined;

    if (!account) {
      return res.status(404).json({ error: 'No connected Google account found. Please connect Google Calendar first.' });
    }

    const outcome = await syncTwoWay(req.user!.family_id, account.id);
    res.json(outcome);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar/google/disconnect', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!hasPermission(req.user, 'google_calendar_manage')) {
      return res.status(403).json({ error: 'You do not have permission to manage Google Calendar integrations.' });
    }

    const { account_id } = req.body;
    const result = disconnectGoogle(req.user!.family_id, account_id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/calendar/google/logs', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM google_sync_logs
      WHERE family_id = ?
      ORDER BY created_at DESC
      LIMIT 25
    `).all(req.user!.family_id);

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. SYSTEM STATS & BACKUP EXPORT
// ==========================================

router.get('/system/stats', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const memberCount = (db.prepare('SELECT COUNT(*) as c FROM family_members WHERE family_id = ?').get(familyId) as any).c;
    const eventCount = (db.prepare('SELECT COUNT(*) as c FROM events WHERE family_id = ?').get(familyId) as any).c;
    const taskCount = (db.prepare('SELECT COUNT(*) as c FROM tasks WHERE family_id = ?').get(familyId) as any).c;
    const calCount = (db.prepare('SELECT COUNT(*) as c FROM calendars WHERE family_id = ?').get(familyId) as any).c;
    const gAccount = db.prepare('SELECT google_email, sync_status, last_synced_at FROM google_accounts WHERE family_id = ?').get(familyId) as any;

    res.json({
      status: 'healthy',
      version: '1.0.0',
      familyId,
      members: memberCount,
      events: eventCount,
      tasks: taskCount,
      calendars: calCount,
      googleSync: gAccount || { sync_status: 'not_connected' },
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backup/export', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId);
    const members = db.prepare('SELECT * FROM family_members WHERE family_id = ?').all(familyId);
    const calendars = db.prepare('SELECT * FROM calendars WHERE family_id = ?').all(familyId);
    const events = db.prepare('SELECT * FROM events WHERE family_id = ?').all(familyId);
    const tasks = db.prepare('SELECT * FROM tasks WHERE family_id = ?').all(familyId);

    const exportData = {
      app: 'Yimly FamilyCal',
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      family,
      members,
      calendars,
      events,
      tasks,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="yimly_familycal_backup_${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
