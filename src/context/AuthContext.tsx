import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { User, Family, FamilyMember, PermissionKey, CalendarEvent } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  family: Family | null;
  memberProfile: FamilyMember | null;
  isLoading: boolean;
  isAdmin: boolean;
  hasPermission: (key: PermissionKey) => boolean;
  canEditEvent: (event?: CalendarEvent | null) => boolean;
  canDeleteEvent: (event?: CalendarEvent | null) => boolean;
  login: (identifier: string, pass: string) => Promise<void>;
  register: (data: { familyName: string; name: string; email: string; password: string; color?: string; birthday?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [memberProfile, setMemberProfile] = useState<FamilyMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
      setFamily(data.family);
      setMemberProfile(data.memberProfile || null);
    } catch {
      setUser(null);
      setFamily(null);
      setMemberProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const isAdmin = user?.role === 'administrator';

  const hasPermission = (key: PermissionKey): boolean => {
    if (!user) return false;
    if (user.role === 'administrator') return true;
    if (!user.permissions) return false;
    return Boolean(user.permissions[key]);
  };

  const canEditEvent = (event?: CalendarEvent | null): boolean => {
    if (!user || !event) return false;
    if (user.role === 'administrator') return true;
    if (hasPermission('event_edit_all')) return true;

    if (hasPermission('event_edit_own') && event.created_by === user.id) {
      return true;
    }

    if (hasPermission('event_edit_assigned') && memberProfile?.id) {
      if (Array.isArray(event.assigned_member_ids) && event.assigned_member_ids.includes(memberProfile.id)) {
        return true;
      }
    }

    return false;
  };

  const canDeleteEvent = (event?: CalendarEvent | null): boolean => {
    if (!user || !event) return false;
    if (user.role === 'administrator') return true;
    if (hasPermission('event_delete_all')) return true;

    if (hasPermission('event_delete_own') && event.created_by === user.id) {
      return true;
    }

    if (hasPermission('event_delete_assigned') && memberProfile?.id) {
      if (Array.isArray(event.assigned_member_ids) && event.assigned_member_ids.includes(memberProfile.id)) {
        return true;
      }
    }

    return false;
  };

  const login = async (identifier: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await api.login({ identifier, password: pass });
      if (res.token) {
        localStorage.setItem('yimly_jwt_token', res.token);
      }
      setUser(res.user);
      setFamily(res.family);
      await checkAuth();
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: {
    familyName: string;
    name: string;
    email: string;
    password: string;
    color?: string;
    birthday?: string;
  }) => {
    setIsLoading(true);
    try {
      const res = await api.register(data);
      if (res.token) {
        localStorage.setItem('yimly_jwt_token', res.token);
      }
      setUser(res.user);
      setFamily(res.family);
      await checkAuth();
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      localStorage.removeItem('yimly_jwt_token');
      setUser(null);
      setFamily(null);
      setMemberProfile(null);
    }
  };

  const refreshProfile = async () => {
    await checkAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        family,
        memberProfile,
        isLoading,
        isAdmin,
        hasPermission,
        canEditEvent,
        canDeleteEvent,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
