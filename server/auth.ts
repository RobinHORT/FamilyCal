import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import {
  PermissionKey,
  UserPermissions,
  resolveUserPermissions,
  ADMIN_PERMISSIONS,
} from './permissions.js';

const JWT_SECRET = process.env.SESSION_SECRET || 'yimly-familycal-super-secret-key-2026';
const TOKEN_COOKIE_NAME = 'yimly_token';

export interface AuthUser {
  id: string;
  family_id: string;
  email?: string | null;
  username?: string | null;
  name: string;
  role: 'administrator' | 'adult' | 'child';
  avatar_url?: string;
  color?: string;
  is_active?: number;
  permissions?: string | UserPermissions | null;
  resolvedPermissions?: UserPermissions;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function hasPermission(user: AuthUser | undefined, perm: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === 'administrator') return true;
  const permissions = user.resolvedPermissions || resolveUserPermissions(user.role, user.permissions);
  return permissions[perm] === true;
}

export function getUserMemberId(userId: string, familyId: string): string | null {
  const row = db.prepare('SELECT id FROM family_members WHERE user_id = ? AND family_id = ?').get(userId, familyId) as { id: string } | undefined;
  return row ? row.id : null;
}

export function canUserEditEvent(user: AuthUser, event: any): boolean {
  if (user.role === 'administrator') return true;
  const perms = user.resolvedPermissions || resolveUserPermissions(user.role, user.permissions);

  // If user has full edit access
  if (perms.event_edit_all) return true;

  // If user created the event
  if (perms.event_edit_own && event.created_by === user.id) return true;

  // If event is assigned to the user's family member profile
  if (perms.event_edit_assigned) {
    const memberId = getUserMemberId(user.id, user.family_id);
    if (memberId) {
      let assignedIds: string[] = [];
      try {
        assignedIds = typeof event.assigned_member_ids === 'string'
          ? JSON.parse(event.assigned_member_ids)
          : (Array.isArray(event.assigned_member_ids) ? event.assigned_member_ids : []);
      } catch {
        assignedIds = [];
      }
      if (assignedIds.includes(memberId)) return true;
    }
  }

  return false;
}

export function canUserDeleteEvent(user: AuthUser, event: any): boolean {
  if (user.role === 'administrator') return true;
  const perms = user.resolvedPermissions || resolveUserPermissions(user.role, user.permissions);

  // If user has full delete access
  if (perms.event_delete_all) return true;

  // If user created the event
  if (perms.event_delete_own && event.created_by === user.id) return true;

  // If event is assigned to the user's family member profile
  if (perms.event_delete_assigned) {
    const memberId = getUserMemberId(user.id, user.family_id);
    if (memberId) {
      let assignedIds: string[] = [];
      try {
        assignedIds = typeof event.assigned_member_ids === 'string'
          ? JSON.parse(event.assigned_member_ids)
          : (Array.isArray(event.assigned_member_ids) ? event.assigned_member_ids : []);
      } catch {
        assignedIds = [];
      }
      if (assignedIds.includes(memberId)) return true;
    }
  }

  return false;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      family_id: user.family_id,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      avatar_url: user.avatar_url,
      color: user.color,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  // Check Cookie
  if (req.cookies && req.cookies[TOKEN_COOKIE_NAME]) {
    token = req.cookies[TOKEN_COOKIE_NAME];
  }

  // Check Authorization Header
  const authHeader = req.headers['authorization'];
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 401 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    
    // Verify user still exists in database and account is active
    const user = db.prepare('SELECT id, family_id, email, username, name, role, avatar_url, color, is_active, permissions FROM users WHERE id = ?').get(decoded.id) as unknown as (AuthUser & { is_active: number }) | undefined;
    if (!user || user.is_active === 0) {
      return res.status(401).json({ error: 'User no longer exists or login is disabled', code: 401 });
    }

    user.resolvedPermissions = resolveUserPermissions(user.role, user.permissions);
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token', code: 401 });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', code: 401 });
  }
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ error: 'Administrator access required', code: 403 });
  }
  next();
}

export function requirePermission(permission: PermissionKey) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 401 });
    }
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        error: `You do not have permission to perform this action. Required permission: ${permission}`,
        code: 403,
        permission,
      });
    }
    next();
  };
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  let token: string | undefined;
  if (req.cookies && req.cookies[TOKEN_COOKIE_NAME]) {
    token = req.cookies[TOKEN_COOKIE_NAME];
  }
  const authHeader = req.headers['authorization'];
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
      const user = db.prepare('SELECT id, family_id, email, username, name, role, avatar_url, color, is_active, permissions FROM users WHERE id = ?').get(decoded.id) as unknown as (AuthUser & { is_active: number }) | undefined;
      if (user && user.is_active !== 0) {
        user.resolvedPermissions = resolveUserPermissions(user.role, user.permissions);
        req.user = user;
      }
    } catch {
      // ignore
    }
  }
  next();
}

export { TOKEN_COOKIE_NAME };

