import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import {
  db,
  seedDefaultEventTypesForFamily,
  seedDefaultCalendarLayersForFamily,
  syncMemberBirthdaysToCalendarLayer,
  reconcileMemberPoints,
  recordTaskCompletionPoints,
  getStockItems,
  getStockItemById,
  findStockItemByBarcode,
  createStockItem,
  updateStockItem,
  deleteStockItem,
  adjustStockItemQuantity,
  addBarcodeToStockItem,
  removeBarcodeFromStockItem,
  getShoppingListItems,
  addShoppingListItem,
  updateShoppingListItem,
  toggleShoppingListItem,
  deleteShoppingListItem,
  clearCompletedShoppingList,
} from '../db.js';
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
    const { name, timezone, viewerPassword, colorSoftness, color_softness } = req.body;
    const now = new Date().toISOString();
    const softnessVal = colorSoftness !== undefined ? colorSoftness : color_softness;

    if (softnessVal !== undefined) {
      db.prepare(`
        UPDATE families
        SET color_softness = ?, updated_at = ?
        WHERE id = ?
      `).run(Math.max(0, Math.min(100, Number(softnessVal))), now, req.user!.family_id);
    }

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
    } else if (name !== undefined || timezone !== undefined) {
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
  // Child occurrence tasks (spawned participant rows) must NEVER advance the series
  if (task.parent_task_id) {
    return null;
  }

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
  const nextGroupId = 'grp_' + uuidv4().slice(0, 8);
  const now = nowIso || new Date().toISOString();
  const cleanReminder = task.reminder_minutes !== undefined && task.reminder_minutes !== null && task.reminder_minutes !== ''
    ? Number(task.reminder_minutes)
    : null;

  db.prepare(`
    INSERT INTO tasks (
      id, family_id, task_group_id, title, description, due_date, due_time, reminder_minutes,
      completed, completed_at, is_archived, assigned_member_id, assigned_member_ids, priority,
      recurring_rule, recurring_interval, recurring_unit, assignment_mode, claim_limit, points,
      points_awarded, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    nextTaskId,
    familyId,
    nextGroupId,
    task.title,
    task.description || null,
    nextDueDate,
    task.due_time || null,
    cleanReminder,
    task.assigned_member_id || null,
    JSON.stringify(task.assigned_member_id ? [task.assigned_member_id] : []),
    task.priority || 'medium',
    rule,
    interval,
    unit,
    task.assignment_mode || 'assigned',
    task.claim_limit !== undefined && task.claim_limit !== null ? task.claim_limit : 1,
    task.points || 0,
    now,
    now
  );

  // Clear recurring_rule on the completed task so it remains as the historical completion record
  // for its due date without projecting duplicate ghost occurrences into future dates
  db.prepare(`
    UPDATE tasks
    SET recurring_rule = 'none', updated_at = ?
    WHERE id = ? AND family_id = ?
  `).run(now, task.id, familyId);

  return db.prepare(`
    SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
    FROM tasks t
    LEFT JOIN family_members m ON t.assigned_member_id = m.id
    WHERE t.id = ?
  `).get(nextTaskId) as any;
}

function isReqAdultOrAdmin(req: AuthRequest, currentMember?: any): boolean {
  if (req.user?.role === 'administrator' || req.user?.role === 'adult') return true;
  if (currentMember?.role === 'administrator' || currentMember?.role === 'adult') return true;
  return false;
}

function formatTaskRow(t: any) {
  if (!t) return t;
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
    task_group_id: t.task_group_id || null,
    parent_task_id: t.parent_task_id || null,
    assignment_mode: t.assignment_mode || 'assigned',
    claim_limit: t.claim_limit !== undefined && t.claim_limit !== null ? Number(t.claim_limit) : 1,
    points: t.points !== undefined && t.points !== null ? Number(t.points) : 0,
    points_awarded: t.points_awarded !== undefined && t.points_awarded !== null ? Number(t.points_awarded) : 0,
    completed: Boolean(t.completed),
    is_archived: Boolean(t.is_archived),
    assigned_member_ids: assignedIds,
    assigned_member_id: t.assigned_member_id || (t.assignment_mode === 'open' ? null : (assignedIds[0] || null)),
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
    if (req.user?.isViewer) {
      return res.status(403).json({ error: 'Viewers cannot create tasks.' });
    }

    const currentMember = db.prepare(
      'SELECT * FROM family_members WHERE (user_id = ? OR id = ?) AND family_id = ?'
    ).get(req.user!.id, req.user!.id, req.user!.family_id) as any;

    const isAdultAdmin = isReqAdultOrAdmin(req, currentMember);

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
      assignment_mode,
      claim_limit,
      points,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const cleanDueDate = due_date ? due_date.split('T')[0] : todayStr;
    const now = new Date().toISOString();
    const cleanReminder = reminder_minutes !== undefined && reminder_minutes !== null && reminder_minutes !== '' 
      ? Number(reminder_minutes) 
      : null;
    const rule = recurring_rule || 'none';
    const interval = recurring_interval ? Math.max(1, Number(recurring_interval)) : 1;
    const unit = recurring_unit || 'day';

    // Points and assignment mode logic:
    // Only Admin or Adult can set points or use open/everyone mode.
    // Children can only create assigned tasks with 0 points.
    const cleanPoints = isAdultAdmin ? Math.max(0, parseInt(points, 10) || 0) : 0;
    const cleanMode: 'assigned' | 'open' | 'everyone' = isAdultAdmin && (assignment_mode === 'open' || assignment_mode === 'everyone')
      ? assignment_mode
      : 'assigned';

    const cleanClaimLimit = cleanMode === 'open'
      ? (claim_limit === 0 || claim_limit === 'multiple' || claim_limit === null ? 0 : 1)
      : 1;

    // Handle Open assignment mode
    if (cleanMode === 'open') {
      const taskId = 'tsk_' + uuidv4().slice(0, 8);
      const taskGroupId = 'grp_' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO tasks (
          id, family_id, task_group_id, title, description, due_date, due_time, reminder_minutes,
          completed, completed_at, is_archived, assigned_member_id, assigned_member_ids, priority,
          recurring_rule, recurring_interval, recurring_unit, assignment_mode, claim_limit, points,
          points_awarded, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, '[]', ?, ?, ?, ?, 'open', ?, ?, 0, ?, ?)
      `).run(
        taskId,
        req.user!.family_id,
        taskGroupId,
        title.trim(),
        description || null,
        cleanDueDate,
        due_time || null,
        cleanReminder,
        is_archived ? 1 : 0,
        priority || 'medium',
        rule,
        interval,
        unit,
        cleanClaimLimit,
        cleanPoints,
        now,
        now
      );

      const createdRow = db.prepare(`
        SELECT t.*, NULL as member_name, NULL as member_color, NULL as member_avatar
        FROM tasks t
        WHERE t.id = ?
      `).get(taskId) as any;

      return res.status(201).json(formatTaskRow(createdRow));
    }

    // Handle Everyone or Assigned mode
    let targetMemberIds: string[] = [];

    if (cleanMode === 'everyone') {
      const activeMembers = db.prepare(
        `SELECT id FROM family_members WHERE family_id = ? AND is_active = 1`
      ).all(req.user!.family_id) as any[];

      targetMemberIds = activeMembers.map((m: any) => m.id);
      if (targetMemberIds.length === 0) {
        return res.status(400).json({ error: 'No active family members found.' });
      }
    } else {
      if (Array.isArray(assigned_member_ids) && assigned_member_ids.length > 0) {
        targetMemberIds = Array.from(new Set(assigned_member_ids.filter(Boolean)));
      } else if (assigned_member_id) {
        targetMemberIds = [assigned_member_id];
      } else if (currentMember?.id) {
        targetMemberIds = [currentMember.id];
      } else {
        const activeMembers = db.prepare(
          `SELECT id FROM family_members WHERE family_id = ? AND is_active = 1`
        ).all(req.user!.family_id) as any[];
        targetMemberIds = activeMembers.map((m: any) => m.id);
      }

      if (targetMemberIds.length === 0) {
        return res.status(400).json({ error: 'Please select at least one family member.' });
      }
    }

    // Shared group ID for multi-member tasks
    const taskGroupId = targetMemberIds.length > 1 ? ('grp_' + uuidv4().slice(0, 8)) : ('tsk_' + uuidv4().slice(0, 8));
    const createdTaskIds: string[] = [];

    const insertStmt = db.prepare(`
      INSERT INTO tasks (
        id, family_id, task_group_id, title, description, due_date, due_time, reminder_minutes,
        completed, completed_at, is_archived, assigned_member_id, assigned_member_ids, priority,
        recurring_rule, recurring_interval, recurring_unit, assignment_mode, claim_limit, points,
        points_awarded, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?)
    `);

    for (const memberId of targetMemberIds) {
      const taskId = 'tsk_' + uuidv4().slice(0, 8);
      createdTaskIds.push(taskId);

      insertStmt.run(
        taskId,
        req.user!.family_id,
        taskGroupId,
        title.trim(),
        description || null,
        cleanDueDate,
        due_time || null,
        cleanReminder,
        is_archived ? 1 : 0,
        memberId,
        JSON.stringify([memberId]),
        priority || 'medium',
        rule,
        interval,
        unit,
        cleanMode,
        cleanPoints,
        now,
        now
      );
    }

    const createdRows = db.prepare(`
      SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
      FROM tasks t
      LEFT JOIN family_members m ON t.assigned_member_id = m.id
      WHERE t.id IN (${createdTaskIds.map(() => '?').join(',')})
    `).all(...createdTaskIds) as any[];

    const formattedRows = createdRows.map(formatTaskRow);

    res.status(201).json({
      ...formattedRows[0],
      created_tasks: formattedRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/tasks/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.isViewer) {
      return res.status(403).json({ error: 'Viewers cannot modify tasks.' });
    }

    const { id } = req.params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const currentMember = db.prepare(
      'SELECT * FROM family_members WHERE (user_id = ? OR id = ?) AND family_id = ?'
    ).get(req.user!.id, req.user!.id, req.user!.family_id) as any;

    const isAdultAdmin = isReqAdultOrAdmin(req, currentMember);

    // Permission enforcement for children
    if (!isAdultAdmin) {
      if (task.assigned_member_id !== currentMember?.id) {
        return res.status(403).json({ error: 'You can only edit tasks assigned to you.' });
      }
    }

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
      points,
      points_awarded,
      claim_limit,
    } = req.body;

    const now = new Date().toISOString();
    const todayStr = new Date().toISOString().split('T')[0];

    const wasCompleted = Boolean(task.completed);
    const newCompleted = completed !== undefined ? (completed ? 1 : 0) : task.completed;
    const willComplete = Boolean(newCompleted);
    const newCompletedAt = willComplete ? (task.completed_at || now) : null;
    const newArchived = is_archived !== undefined ? (is_archived ? 1 : 0) : task.is_archived;
    const newReminder = reminder_minutes !== undefined 
      ? (reminder_minutes !== null && reminder_minutes !== '' ? Number(reminder_minutes) : null)
      : task.reminder_minutes;

    const newRule = recurring_rule !== undefined ? (recurring_rule || 'none') : (task.recurring_rule || 'none');
    const newInterval = recurring_interval !== undefined ? Math.max(1, Number(recurring_interval) || 1) : (task.recurring_interval || 1);
    const newUnit = recurring_unit !== undefined ? (recurring_unit || 'day') : (task.recurring_unit || 'day');

    const cleanDueDate = due_date !== undefined ? (due_date ? due_date.split('T')[0] : todayStr) : task.due_date;
    const cleanTitle = title !== undefined ? title.trim() : task.title;
    const cleanDesc = description !== undefined ? (description || null) : task.description;
    const cleanDueTime = due_time !== undefined ? (due_time || null) : task.due_time;
    const cleanPriority = priority !== undefined ? priority : task.priority;

    // Points updates (Adults/Admins only)
    const pointsChanged = isAdultAdmin && points !== undefined && Number(points) !== Number(task.points);
    const newPoints = isAdultAdmin && points !== undefined ? Math.max(0, parseInt(points, 10) || 0) : task.points;

    // If this is an open task with claim_limit update
    const newClaimLimit = isAdultAdmin && claim_limit !== undefined
      ? (claim_limit === 0 || claim_limit === 'multiple' || claim_limit === null ? 0 : 1)
      : task.claim_limit;

    // If this is an open task without assigned member, handle update directly
    if (task.assignment_mode === 'open' && !task.assigned_member_id) {
      db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, due_date = ?, due_time = ?, reminder_minutes = ?,
            priority = ?, is_archived = ?, recurring_rule = ?, recurring_interval = ?,
            recurring_unit = ?, claim_limit = ?, points = ?, updated_at = ?
        WHERE id = ? AND family_id = ?
      `).run(
        cleanTitle,
        cleanDesc,
        cleanDueDate,
        cleanDueTime,
        newReminder,
        cleanPriority,
        newArchived,
        newRule,
        newInterval,
        newUnit,
        newClaimLimit,
        newPoints,
        now,
        id,
        req.user!.family_id
      );

      const updatedRow = db.prepare(`
        SELECT t.*, NULL as member_name, NULL as member_color, NULL as member_avatar
        FROM tasks t
        WHERE t.id = ?
      `).get(id) as any;

      return res.json(formatTaskRow(updatedRow));
    }

    let taskGroupId = task.task_group_id;
    let siblingTasks: any[] = [];
    if (taskGroupId) {
      siblingTasks = db.prepare('SELECT * FROM tasks WHERE task_group_id = ? AND family_id = ?').all(
        taskGroupId,
        req.user!.family_id
      ) as any[];
    } else {
      siblingTasks = [task];
    }

    // Determine final member assignments if adult is editing
    let finalMemberIds: string[] = [];
    if (isAdultAdmin && assigned_member_ids !== undefined) {
      finalMemberIds = Array.isArray(assigned_member_ids) ? assigned_member_ids : [];
    } else if (isAdultAdmin && assigned_member_id !== undefined) {
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

    if (finalMemberIds.length === 0 && task.assigned_member_id) {
      finalMemberIds = [task.assigned_member_id];
    }

    // If member assignments are being modified by an adult
    if (isAdultAdmin && assigned_member_ids !== undefined) {
      const removedTasks = siblingTasks.filter((s) => !finalMemberIds.includes(s.assigned_member_id));
      for (const rem of removedTasks) {
        if (rem.assigned_member_id) {
          recordTaskCompletionPoints(req.user!.family_id, rem.assigned_member_id, rem.id, 0, false);
        }
        db.prepare('DELETE FROM tasks WHERE id = ? AND family_id = ?').run(rem.id, req.user!.family_id);
      }
    }

    // Update sibling tasks
    for (const s of siblingTasks) {
      const isTarget = s.id === id;
      const entryCompleted = isTarget && completed !== undefined ? (completed ? 1 : 0) : s.completed;
      const entryCompletedAt = isTarget && completed !== undefined ? (completed ? (s.completed_at || now) : null) : s.completed_at;

      db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, due_date = ?, due_time = ?, reminder_minutes = ?,
            priority = ?, completed = ?, completed_at = ?, is_archived = ?,
            recurring_rule = ?, recurring_interval = ?, recurring_unit = ?,
            points = ?, updated_at = ?
        WHERE id = ? AND family_id = ?
      `).run(
        cleanTitle,
        cleanDesc,
        cleanDueDate,
        cleanDueTime,
        newReminder,
        cleanPriority,
        entryCompleted,
        entryCompletedAt,
        newArchived,
        newRule,
        newInterval,
        newUnit,
        newPoints,
        now,
        s.id,
        req.user!.family_id
      );

      // Reconcile points if points changed or completed state changed
      if (s.assigned_member_id) {
        if (isTarget && completed !== undefined && Boolean(completed) !== Boolean(s.completed)) {
          recordTaskCompletionPoints(
            req.user!.family_id,
            s.assigned_member_id,
            s.id,
            newPoints,
            Boolean(completed)
          );
        } else if (pointsChanged && s.completed) {
          recordTaskCompletionPoints(
            req.user!.family_id,
            s.assigned_member_id,
            s.id,
            newPoints,
            true,
            'Points updated for task'
          );
        }
      }
    }

    // Manual points awarded adjustment if adult provided points_awarded
    if (isAdultAdmin && points_awarded !== undefined && points_awarded !== null && !isNaN(Number(points_awarded))) {
      const adjPoints = Math.max(0, parseInt(points_awarded, 10));
      if (task.assigned_member_id) {
        recordTaskCompletionPoints(
          req.user!.family_id,
          task.assigned_member_id,
          task.id,
          adjPoints,
          true,
          'Manual points awarded adjustment by adult/admin'
        );
      }
    }

    // If transitioned from incomplete to complete, advance recurring task
    if (!wasCompleted && newCompleted === 1) {
      const updatedForAdvance = {
        ...task,
        title: cleanTitle,
        description: cleanDesc,
        due_date: cleanDueDate,
        due_time: cleanDueTime,
        reminder_minutes: newReminder,
        assigned_member_id: task.assigned_member_id,
        priority: cleanPriority,
        points: newPoints,
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

function getEffectiveTodayDate(familyTimezone?: string): string {
  let realTodayStr = new Date().toISOString().split('T')[0];

  // Use the household's configured local timezone if available
  if (familyTimezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: familyTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());

      const year = parts.find((p) => p.type === 'year')?.value;
      const month = parts.find((p) => p.type === 'month')?.value;
      const day = parts.find((p) => p.type === 'day')?.value;

      if (year && month && day) {
        realTodayStr = `${year}-${month}-${day}`;
      }
    } catch {
      // Fallback
    }
  }

  return realTodayStr;
}

/**
 * Validate that a given date is a valid generated occurrence of a task
 */
function isValidTaskOccurrence(
  taskDueDateStr: string,
  occurrenceDateStr: string,
  rule: string,
  interval?: number,
  unit?: string
): boolean {
  if (!taskDueDateStr || !occurrenceDateStr) return false;

  const due = taskDueDateStr.trim().slice(0, 10);
  const occ = occurrenceDateStr.trim().slice(0, 10);

  if (occ === due) return true;
  if (occ < due) return false;

  if (!rule || rule === 'none') return false;

  // Local date parsing to avoid UTC offsets shifting the day
  const [dy, dm, dd] = due.split('-').map(Number);
  const [oy, om, od] = occ.split('-').map(Number);

  const dueDate = new Date(dy, dm - 1, dd);
  const occDate = new Date(oy, om - 1, od);

  if (isNaN(dueDate.getTime()) || isNaN(occDate.getTime())) return false;

  // Difference in calendar days
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((occDate.getTime() - dueDate.getTime()) / oneDay);

  if (diffDays < 0) return false;

  if (rule === 'daily') {
    return true;
  }

  if (rule === 'weekly') {
    return occDate.getDay() === dueDate.getDay();
  }

  if (rule === 'fortnightly') {
    return diffDays % 14 === 0;
  }

  if (rule === 'monthly') {
    return occDate.getDate() === dueDate.getDate();
  }

  if (rule === 'yearly') {
    return occDate.getDate() === dueDate.getDate() && occDate.getMonth() === dueDate.getMonth();
  }

  if (rule === 'custom') {
    const stepInterval = interval && interval > 0 ? Number(interval) : 1;
    const normalizedUnit = (unit || 'day').toLowerCase();

    if (normalizedUnit.startsWith('day')) {
      return diffDays % stepInterval === 0;
    }
    if (normalizedUnit.startsWith('week')) {
      return occDate.getDay() === dueDate.getDay() && (diffDays % (stepInterval * 7) === 0);
    }
    if (normalizedUnit.startsWith('month')) {
      if (occDate.getDate() !== dueDate.getDate()) return false;
      const monthsDiff = (occDate.getFullYear() - dueDate.getFullYear()) * 12 + (occDate.getMonth() - dueDate.getMonth());
      return monthsDiff >= 0 && monthsDiff % stepInterval === 0;
    }
  }

  return false;
}

router.post('/tasks/:id/claim', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.isViewer) {
      return res.status(403).json({ error: 'Viewers cannot claim tasks.' });
    }

    const { id } = req.params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // Determine current local date for household avoiding UTC timezone date-shift bugs.
    // CRITICAL: We NEVER pass client_date here to avoid client bypasses.
    const family = db.prepare('SELECT timezone FROM families WHERE id = ?').get(req.user!.family_id) as any;
    const todayStr = getEffectiveTodayDate(family?.timezone);

    // Identify if the task is recurring
    const isRecurring = task.recurring_rule && task.recurring_rule !== 'none';
    let effectiveDueDateStr: string;

    if (!isRecurring) {
      // ONE-TIME TASKS:
      // - Use the task's actual database "due_date"
      // - Ignore any client-supplied "occurrence_date" or "due_date" for claim validation
      if (!task.due_date) {
        return res.status(400).json({ error: 'Task has no due date.' });
      }
      effectiveDueDateStr = String(task.due_date).trim().slice(0, 10);
    } else {
      // RECURRING TASKS:
      // - Validate requested occurrence_date or due_date in the request body
      const occurrenceDate = req.body?.occurrence_date || req.body?.due_date;
      if (!occurrenceDate) {
        return res.status(400).json({ error: 'Occurrence date is required for claiming recurring tasks.' });
      }
      const requestedOccDateStr = String(occurrenceDate).trim().slice(0, 10);

      // Validate that this requested occurrence date is actually generated by the task's recurrence rule
      const isValid = isValidTaskOccurrence(
        task.due_date,
        requestedOccDateStr,
        task.recurring_rule,
        task.recurring_interval,
        task.recurring_unit
      );

      if (!isValid) {
        return res.status(400).json({ error: 'The requested date is not a valid occurrence for this recurring task.' });
      }

      effectiveDueDateStr = requestedOccDateStr;
    }

    // Securely reject future claims regardless of user role (member, admin, adult, etc.)
    if (effectiveDueDateStr > todayStr) {
      return res.status(400).json({
        error: `Tasks cannot be claimed before their due date (${effectiveDueDateStr}).`,
      });
    }

    if (task.assignment_mode !== 'open') {
      return res.status(400).json({ error: 'Only open tasks can be claimed.' });
    }

    const currentMember = db.prepare(
      'SELECT * FROM family_members WHERE (user_id = ? OR id = ?) AND family_id = ?'
    ).get(req.user!.id, req.user!.id, req.user!.family_id) as any;

    if (!currentMember) {
      return res.status(400).json({ error: 'Family member profile not found.' });
    }

    const now = new Date().toISOString();
    const groupId = task.task_group_id || task.id;

    // Check all tasks belonging to this open task group or referencing this parent task
    const groupTasks = db.prepare(`
      SELECT * FROM tasks
      WHERE (task_group_id = ? OR parent_task_id = ? OR id = ?) AND family_id = ?
    `).all(groupId, task.id, task.id, req.user!.family_id) as any[];

    // Check if this member has already claimed this specific occurrence
    const alreadyClaimed = groupTasks.some((t) => 
      t.assigned_member_id === currentMember.id && 
      t.due_date && t.due_date.trim().slice(0, 10) === effectiveDueDateStr
    );
    if (alreadyClaimed) {
      return res.status(409).json({ error: 'You have already claimed this task.' });
    }

    const claimLimit = task.claim_limit !== undefined && task.claim_limit !== null ? Number(task.claim_limit) : 1;

    // Direct UPDATE for non-recurring single-claim tasks.
    // For all recurring tasks (even with claimLimit === 1) or multi-claim tasks, we MUST spawn a child task (INSERT).
    if (!isRecurring && claimLimit === 1) {
      // Single person claim for ONE-TIME task: first eligible member to claim becomes owner
      // Use atomic conditional update to prevent double-claiming race conditions
      const result = db.prepare(`
        UPDATE tasks
        SET assigned_member_id = ?, assigned_member_ids = ?, claimed_at = ?, claimed_by = ?, due_date = ?, updated_at = ?
        WHERE id = ? AND family_id = ? AND assigned_member_id IS NULL
      `).run(
        currentMember.id,
        JSON.stringify([currentMember.id]),
        now,
        currentMember.id,
        effectiveDueDateStr,
        now,
        task.id,
        req.user!.family_id
      );

      if (result.changes === 0) {
        return res.status(409).json({ error: 'This task has already been claimed.' });
      }

      const updated = db.prepare(`
        SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
        FROM tasks t
        LEFT JOIN family_members m ON t.assigned_member_id = m.id
        WHERE t.id = ?
      `).get(task.id) as any;

      return res.json(formatTaskRow(updated));
    } else {
      // Recurring tasks OR multi-claim tasks: create an individual participant entry for this claimant
      // Use atomic conditional insert to prevent double-claiming race conditions and enforce claim limit
      const newParticipantTaskId = 'tsk_' + uuidv4().slice(0, 8);
      
      let insertQuery = '';
      let queryParams: any[] = [];

      if (claimLimit === 1) {
        // Single-claim: enforce that absolutely NO ONE has claimed this specific occurrence date yet
        insertQuery = `
          INSERT INTO tasks (
            id, family_id, task_group_id, parent_task_id, title, description, due_date, due_time,
            reminder_minutes, completed, completed_at, is_archived, assigned_member_id, assigned_member_ids,
            priority, recurring_rule, recurring_interval, recurring_unit, assignment_mode, claim_limit,
            points, points_awarded, claimed_at, claimed_by, created_at, updated_at
          )
          SELECT
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, 0, NULL, 0, ?, ?,
            ?, 'none', 1, 'day', 'open', 1,
            ?, 0, ?, ?, ?, ?
          WHERE NOT EXISTS (
            -- Ensure NO ONE has claimed this specific occurrence date yet
            SELECT 1 FROM tasks
            WHERE (task_group_id = ? OR parent_task_id = ? OR id = ?)
              AND due_date = ?
              AND assigned_member_id IS NOT NULL
              AND family_id = ?
          )
        `;

        queryParams = [
          newParticipantTaskId,
          req.user!.family_id,
          groupId,
          task.id,
          task.title,
          task.description || null,
          effectiveDueDateStr,
          task.due_time || null,
          task.reminder_minutes,
          currentMember.id,
          JSON.stringify([currentMember.id]),
          task.priority || 'medium',
          task.points || 0,
          now,
          currentMember.id,
          now,
          now,

          // WHERE NOT EXISTS block:
          groupId,
          task.id,
          task.id,
          effectiveDueDateStr,
          req.user!.family_id
        ];
      } else if (claimLimit <= 0) {
        // Multiple People mode (unlimited claims): any member can claim their own copy once
        insertQuery = `
          INSERT INTO tasks (
            id, family_id, task_group_id, parent_task_id, title, description, due_date, due_time,
            reminder_minutes, completed, completed_at, is_archived, assigned_member_id, assigned_member_ids,
            priority, recurring_rule, recurring_interval, recurring_unit, assignment_mode, claim_limit,
            points, points_awarded, claimed_at, claimed_by, created_at, updated_at
          )
          SELECT
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, 0, NULL, 0, ?, ?,
            ?, 'none', 1, 'day', 'open', 0,
            ?, 0, ?, ?, ?, ?
          WHERE NOT EXISTS (
            -- Ensure this user hasn't already claimed this task occurrence
            SELECT 1 FROM tasks
            WHERE (task_group_id = ? OR parent_task_id = ? OR id = ?)
              AND assigned_member_id = ?
              AND due_date = ?
              AND family_id = ?
          )
        `;

        queryParams = [
          newParticipantTaskId,
          req.user!.family_id,
          groupId,
          task.id,
          task.title,
          task.description || null,
          effectiveDueDateStr,
          task.due_time || null,
          task.reminder_minutes,
          currentMember.id,
          JSON.stringify([currentMember.id]),
          task.priority || 'medium',
          task.points || 0,
          now,
          currentMember.id,
          now,
          now,

          // WHERE NOT EXISTS block:
          groupId,
          task.id,
          task.id,
          currentMember.id,
          effectiveDueDateStr,
          req.user!.family_id
        ];
      } else {
        // Capped multi-claim (claimLimit > 1): up to N members can claim
        insertQuery = `
          INSERT INTO tasks (
            id, family_id, task_group_id, parent_task_id, title, description, due_date, due_time,
            reminder_minutes, completed, completed_at, is_archived, assigned_member_id, assigned_member_ids,
            priority, recurring_rule, recurring_interval, recurring_unit, assignment_mode, claim_limit,
            points, points_awarded, claimed_at, claimed_by, created_at, updated_at
          )
          SELECT
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, 0, NULL, 0, ?, ?,
            ?, 'none', 1, 'day', 'open', ?,
            ?, 0, ?, ?, ?, ?
          WHERE NOT EXISTS (
            -- 1. Ensure this user hasn't already claimed this task occurrence
            SELECT 1 FROM tasks
            WHERE (task_group_id = ? OR parent_task_id = ? OR id = ?)
              AND assigned_member_id = ?
              AND due_date = ?
              AND family_id = ?
          ) AND (
            -- 2. Ensure we haven't reached the claim limit for this occurrence
            SELECT COUNT(*) FROM tasks
            WHERE (task_group_id = ? OR parent_task_id = ? OR id = ?)
              AND assigned_member_id IS NOT NULL
              AND due_date = ?
              AND family_id = ?
          ) < ?
        `;

        queryParams = [
          newParticipantTaskId,
          req.user!.family_id,
          groupId,
          task.id,
          task.title,
          task.description || null,
          effectiveDueDateStr,
          task.due_time || null,
          task.reminder_minutes,
          currentMember.id,
          JSON.stringify([currentMember.id]),
          task.priority || 'medium',
          claimLimit,
          task.points || 0,
          now,
          currentMember.id,
          now,
          now,

          // First WHERE NOT EXISTS block:
          groupId,
          task.id,
          task.id,
          currentMember.id,
          effectiveDueDateStr,
          req.user!.family_id,

          // Second AND block:
          groupId,
          task.id,
          task.id,
          effectiveDueDateStr,
          req.user!.family_id,
          claimLimit
        ];
      }

      const result = db.prepare(insertQuery).run(...queryParams);

      if (result.changes === 0) {
        if (claimLimit === 1) {
          return res.status(409).json({ error: 'This task has already been claimed.' });
        }

        const alreadyClaimedCheck = db.prepare(`
          SELECT 1 FROM tasks
          WHERE (task_group_id = ? OR parent_task_id = ? OR id = ?)
            AND assigned_member_id = ?
            AND due_date = ?
            AND family_id = ?
        `).get(groupId, task.id, task.id, currentMember.id, effectiveDueDateStr, req.user!.family_id);

        if (alreadyClaimedCheck || claimLimit <= 0) {
          return res.status(409).json({ error: 'You have already claimed this task.' });
        } else {
          return res.status(409).json({ error: 'Claim limit for this task has been reached.' });
        }
      }

      const created = db.prepare(`
        SELECT t.*, m.name as member_name, m.color as member_color, m.avatar_url as member_avatar
        FROM tasks t
        LEFT JOIN family_members m ON t.assigned_member_id = m.id
        WHERE t.id = ?
      `).get(newParticipantTaskId) as any;

      return res.status(200).json(formatTaskRow(created));
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks/:id/unclaim', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.isViewer) {
      return res.status(403).json({ error: 'Viewers cannot unclaim tasks.' });
    }

    const { id } = req.params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const currentMember = db.prepare(
      'SELECT * FROM family_members WHERE (user_id = ? OR id = ?) AND family_id = ?'
    ).get(req.user!.id, req.user!.id, req.user!.family_id) as any;

    const isAdultAdmin = isReqAdultOrAdmin(req, currentMember);

    // If task has a parent_task_id (spawned participant row)
    if (task.parent_task_id) {
      if (!isAdultAdmin && task.assigned_member_id !== currentMember?.id) {
        return res.status(403).json({ error: 'You can only unclaim your own participation.' });
      }

      if (task.assigned_member_id) {
        recordTaskCompletionPoints(req.user!.family_id, task.assigned_member_id, task.id, 0, false);
      }

      db.prepare('DELETE FROM tasks WHERE id = ? AND family_id = ?').run(id, req.user!.family_id);
      return res.json({ success: true, message: 'Unclaimed successfully.' });
    }

    // Original open task with single claim
    if (task.assignment_mode === 'open') {
      if (!isAdultAdmin && task.assigned_member_id !== currentMember?.id) {
        return res.status(403).json({ error: 'You can only unclaim your own claimed task.' });
      }

      if (task.assigned_member_id) {
        recordTaskCompletionPoints(req.user!.family_id, task.assigned_member_id, task.id, 0, false);
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE tasks
        SET assigned_member_id = NULL, assigned_member_ids = '[]', claimed_at = NULL, claimed_by = NULL,
            completed = 0, completed_at = NULL, points_awarded = 0, updated_at = ?
        WHERE id = ? AND family_id = ?
      `).run(now, id, req.user!.family_id);

      const updated = db.prepare(`
        SELECT t.*, NULL as member_name, NULL as member_color, NULL as member_avatar
        FROM tasks t
        WHERE t.id = ?
      `).get(id) as any;

      return res.json(formatTaskRow(updated));
    }

    return res.status(400).json({ error: 'Task is not an open task.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks/:id/toggle', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.isViewer) {
      return res.status(403).json({ error: 'Viewers cannot modify tasks.' });
    }

    const { id } = req.params;
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const currentMember = db.prepare(
      'SELECT * FROM family_members WHERE (user_id = ? OR id = ?) AND family_id = ?'
    ).get(req.user!.id, req.user!.id, req.user!.family_id) as any;
    const currentMemberId = currentMember?.id;
    const isAdultAdmin = isReqAdultOrAdmin(req, currentMember);

    // Unclaimed open tasks cannot be completed
    if (task.assignment_mode === 'open' && !task.assigned_member_id) {
      return res.status(400).json({ error: 'This task is open and must be claimed before it can be completed.' });
    }

    const wasCompleted = Boolean(task.completed);
    const willComplete = !wasCompleted;
    const newCompleted = willComplete ? 1 : 0;
    const now = new Date().toISOString();
    const family = db.prepare('SELECT timezone FROM families WHERE id = ?').get(req.user!.family_id) as any;
    const todayStr = getEffectiveTodayDate(family?.timezone);

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

    // Permission enforcement:
    // Adult or Admin can complete or reopen on behalf of any member.
    // Children can only toggle their own tasks!
    if (!isAdultAdmin) {
      if (currentMemberId && !assignedIds.includes(currentMemberId)) {
        return res.status(403).json({ error: 'Only the assigned family member can complete this task.' });
      }

      // Verify date rule when ticking off
      const occurrenceDate = req.body?.occurrence_date || req.body?.due_date;
      const effectiveDueDateStr = occurrenceDate
        ? String(occurrenceDate).trim().slice(0, 10)
        : (task.due_date ? String(task.due_date).trim().slice(0, 10) : todayStr);

      if (willComplete && effectiveDueDateStr > todayStr) {
        return res.status(400).json({
          error: `Tasks cannot be completed before their due date (${effectiveDueDateStr}).`,
        });
      }
    }

    db.prepare(`
      UPDATE tasks
      SET completed = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(newCompleted, willComplete ? now : null, now, id, req.user!.family_id);

    // Award or reverse points
    const targetMemberId = task.assigned_member_id || (assignedIds.length > 0 ? assignedIds[0] : null);
    if (targetMemberId) {
      const pointsToAward = Number(task.points) || 0;
      recordTaskCompletionPoints(
        req.user!.family_id,
        targetMemberId,
        task.id,
        pointsToAward,
        willComplete
      );
    }

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

router.post('/tasks/:id/adjust-points', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.isViewer) {
      return res.status(403).json({ error: 'Viewers cannot modify points.' });
    }

    const currentMember = db.prepare(
      'SELECT * FROM family_members WHERE (user_id = ? OR id = ?) AND family_id = ?'
    ).get(req.user!.id, req.user!.id, req.user!.family_id) as any;

    if (!isReqAdultOrAdmin(req, currentMember)) {
      return res.status(403).json({ error: 'Only administrators and adults can adjust points.' });
    }

    const { id } = req.params;
    const { points_awarded, notes } = req.body;

    if (points_awarded === undefined || points_awarded === null || isNaN(Number(points_awarded))) {
      return res.status(400).json({ error: 'Valid points value is required.' });
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const cleanPoints = Math.max(0, parseInt(points_awarded, 10));
    const targetMemberId = task.assigned_member_id;

    if (!targetMemberId) {
      return res.status(400).json({ error: 'Cannot award points to an unassigned task.' });
    }

    recordTaskCompletionPoints(
      req.user!.family_id,
      targetMemberId,
      task.id,
      cleanPoints,
      true,
      notes || 'Manual points adjustment by adult/admin'
    );

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
    const allInGroup = req.query.allInGroup === 'true' || req.query.allInGroup === '1' || req.body?.allInGroup === true;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) return res.status(404).json({ error: 'Task not found.' });

    const newArchived = task.is_archived ? 0 : 1;
    const now = new Date().toISOString();

    if (allInGroup && task.task_group_id) {
      db.prepare(`
        UPDATE tasks
        SET is_archived = ?, updated_at = ?
        WHERE task_group_id = ? AND family_id = ?
      `).run(newArchived, now, task.task_group_id, req.user!.family_id);
    } else {
      db.prepare(`
        UPDATE tasks
        SET is_archived = ?, updated_at = ?
        WHERE id = ? AND family_id = ?
      `).run(newArchived, now, id, req.user!.family_id);
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

router.delete('/tasks/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.isViewer) {
      return res.status(403).json({ error: 'Viewers cannot delete tasks.' });
    }

    const { id } = req.params;
    const allInGroup = req.query.allInGroup === 'true' || req.query.allInGroup === '1';

    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND family_id = ?').get(
      id,
      req.user!.family_id
    ) as any;

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const currentMember = db.prepare(
      'SELECT * FROM family_members WHERE (user_id = ? OR id = ?) AND family_id = ?'
    ).get(req.user!.id, req.user!.id, req.user!.family_id) as any;

    if (!isReqAdultOrAdmin(req, currentMember) && task.assigned_member_id !== currentMember?.id) {
      return res.status(403).json({ error: 'You do not have permission to delete this task.' });
    }

    if (allInGroup && task.task_group_id) {
      const affectedTasks = db.prepare(
        'SELECT id, assigned_member_id FROM tasks WHERE task_group_id = ? AND family_id = ?'
      ).all(task.task_group_id, req.user!.family_id) as any[];

      db.prepare('DELETE FROM tasks WHERE task_group_id = ? AND family_id = ?').run(
        task.task_group_id,
        req.user!.family_id
      );

      for (const t of affectedTasks) {
        if (t.assigned_member_id) {
          reconcileMemberPoints(req.user!.family_id, t.assigned_member_id);
        }
      }
    } else {
      // If this task has child participant tasks, clean them up and reconcile their points
      const childTasks = db.prepare(
        'SELECT id, assigned_member_id FROM tasks WHERE parent_task_id = ? AND family_id = ?'
      ).all(id, req.user!.family_id) as any[];

      if (childTasks.length > 0) {
        db.prepare('DELETE FROM tasks WHERE parent_task_id = ? AND family_id = ?').run(id, req.user!.family_id);
        for (const ct of childTasks) {
          if (ct.assigned_member_id) {
            reconcileMemberPoints(req.user!.family_id, ct.assigned_member_id);
          }
        }
      }

      const memberId = task.assigned_member_id;
      db.prepare('DELETE FROM tasks WHERE id = ? AND family_id = ?').run(id, req.user!.family_id);
      if (memberId) {
        reconcileMemberPoints(req.user!.family_id, memberId);
      }
    }

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

// ==========================================
// 9. STOCK & INVENTORY
// ==========================================

// Get all stock items (ALWAYS sorted A-Z by canonical stock item name)
router.get('/stock', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const items = getStockItems(familyId);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lookup stock item by id
router.get('/stock/item/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const item = getStockItemById(familyId, req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Stock item not found' });
    }
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lookup stock item by scanned barcode
router.get('/stock/barcode/:barcode', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const result = findStockItemByBarcode(familyId, req.params.barcode);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new stock item
router.post('/stock', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const {
      name,
      category,
      quantity,
      unit,
      low_stock_threshold,
      target_stock,
      restock_target,
      shopping_trigger,
      expiry_days_threshold,
      auto_add_to_shopping,
      earliest_expiry_date,
      location,
      notes,
      is_favorite,
      barcode,
      brand_or_label,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Stock item name is required' });
    }

    const created = createStockItem(familyId, {
      name,
      category,
      quantity,
      unit,
      low_stock_threshold,
      target_stock: target_stock !== undefined ? target_stock : restock_target,
      restock_target: restock_target !== undefined ? restock_target : target_stock,
      shopping_trigger,
      expiry_days_threshold,
      auto_add_to_shopping,
      earliest_expiry_date,
      location,
      notes,
      is_favorite,
      barcode,
      brand_or_label,
    });

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update existing stock item
router.put('/stock/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const updated = updateStockItem(familyId, req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Stock item not found' });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete stock item
router.delete('/stock/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const success = deleteStockItem(familyId, req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Adjust stock quantity (Add Stock, Open Item, Use Stock, Finish/Used Up, Set Quantity, Consume Opened)
router.post('/stock/:id/adjust', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const memberId = getUserMemberId(req.user!.id, familyId);
    const { action, amount, barcode, expiry_date, opened_item_id, location } = req.body;

    if (!action || !['add', 'open', 'use', 'finish', 'used_up', 'set', 'shopping_purchase', 'consume_opened'].includes(action)) {
      return res.status(400).json({ error: 'Valid action (add, open, use, finish, used_up, set, shopping_purchase, consume_opened) is required' });
    }

    const updated = adjustStockItemQuantity(familyId, req.params.id, {
      action,
      amount: Number(amount) || 1,
      barcode,
      expiry_date,
      opened_item_id,
      member_id: memberId,
    });

    res.json(updated);
  } catch (err: any) {
    const status = err.message && (err.message.includes('Cannot') || err.message.includes('stock')) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Execute barcode scan action (Add Stock, Open Item, Finish/Used Up)
router.post('/stock/scan', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const memberId = getUserMemberId(req.user!.id, familyId);
    const { barcode, mode, amount, expiry_date } = req.body;

    if (!barcode || !barcode.trim()) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    const cleanBarcode = barcode.trim();
    const scanMode = mode || 'add';

    const lookup = findStockItemByBarcode(familyId, cleanBarcode);

    if (!lookup.found || !lookup.stockItem) {
      // Barcode is unmapped / new
      return res.json({
        success: false,
        isMapped: false,
        barcode: cleanBarcode,
        message: 'Barcode is not yet linked to any household stock item',
      });
    }

    const scanAmount = amount !== undefined ? Number(amount) : (lookup.mapping?.quantity_delta_per_scan || 1);

    // Barcode is mapped to a canonical stock item! Update quantity according to mode (add, open, finish)
    const updated = adjustStockItemQuantity(familyId, lookup.stockItem.id, {
      action: scanMode,
      amount: scanAmount,
      barcode: cleanBarcode,
      expiry_date,
      member_id: memberId,
    });

    res.json({
      success: true,
      isMapped: true,
      barcode: cleanBarcode,
      action: scanMode,
      delta: scanMode === 'add' ? scanAmount : -scanAmount,
      stockItem: updated,
      mapping: lookup.mapping,
    });
  } catch (err: any) {
    const status = err.message && (err.message.includes('Cannot') || err.message.includes('stock')) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Add barcode mapping to a canonical stock item
router.post('/stock/:id/barcodes', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const { barcode, brand_or_label, quantity_delta_per_scan } = req.body;

    if (!barcode || !barcode.trim()) {
      return res.status(400).json({ error: 'Barcode string is required' });
    }

    addBarcodeToStockItem(familyId, req.params.id, barcode, brand_or_label, quantity_delta_per_scan || 1);
    const updated = getStockItemById(familyId, req.params.id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete barcode mapping
router.delete('/stock/barcodes/:barcodeId', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const success = removeBarcodeFromStockItem(familyId, req.params.barcodeId);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 10. SHOPPING LIST
// ==========================================

// Get shopping list
router.get('/shopping-list', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const items = getShoppingListItems(familyId);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add item to shopping list
router.post('/shopping-list', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const memberId = getUserMemberId(req.user!.id, familyId);
    const { name, quantity, unit, category, stock_item_id, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const created = addShoppingListItem(familyId, {
      name,
      quantity,
      unit,
      category,
      stock_item_id,
      notes,
      added_by: memberId,
    });

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update shopping list item
router.put('/shopping-list/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const updated = updateShoppingListItem(familyId, req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle shopping list item completion
router.post('/shopping-list/:id/toggle', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const memberId = getUserMemberId(req.user!.id, familyId);
    const updated = toggleShoppingListItem(familyId, req.params.id, memberId || undefined);
    if (!updated) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete shopping list item
router.delete('/shopping-list/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const success = deleteShoppingListItem(familyId, req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all completed shopping list items
router.post('/shopping-list/clear-completed', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const familyId = req.user!.family_id;
    const cleared = clearCompletedShoppingList(familyId);
    res.json({ success: true, count: cleared });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

