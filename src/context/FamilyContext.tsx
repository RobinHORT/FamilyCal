import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Family, FamilyMember, BirthdayItem } from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { setGlobalColorSoftness } from '../utils/colors';

interface FamilyContextType {
  family: Family | null;
  members: FamilyMember[];
  birthdays: BirthdayItem[];
  selectedMemberFilter: string | null; // null = all members
  setSelectedMemberFilter: (id: string | null) => void;
  isLoading: boolean;
  colorSoftness: number;
  updateColorSoftness: (level: number) => Promise<void>;
  fetchFamilyData: () => Promise<void>;
  addMember: (data: Partial<FamilyMember> & { login?: { enabled: boolean; username?: string; password?: string } }) => Promise<FamilyMember>;
  updateMember: (id: string, data: Partial<FamilyMember>) => Promise<FamilyMember>;
  adjustMemberPoints: (id: string, data: { points?: number; delta?: number; notes?: string }) => Promise<any>;
  removeMember: (id: string) => Promise<void>;
  manageMemberLogin: (id: string, data: { enabled: boolean; username?: string; password?: string }) => Promise<any>;
  updateHousehold: (data: { name?: string; timezone?: string; viewerPassword?: string; colorSoftness?: number; color_softness?: number }) => Promise<void>;
  updateMemberPermissions: (id: string, data: { permissions?: Partial<import('../types').UserPermissions>; resetToDefaults?: boolean }) => Promise<FamilyMember>;
}

export const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [colorSoftness, setColorSoftnessState] = useState<number>(() => {
    const saved = localStorage.getItem('familycal_color_softness');
    const val = saved !== null ? parseInt(saved, 10) : 85;
    const finalVal = isNaN(val) ? 85 : val;
    setGlobalColorSoftness(finalVal);
    return finalVal;
  });

  const fetchFamilyData = useCallback(async () => {
    if (!user) {
      setFamily(null);
      setMembers([]);
      setBirthdays([]);
      return;
    }

    setIsLoading(true);
    try {
      const [familyRes, birthdaysRes] = await Promise.all([
        api.getFamily(),
        api.getBirthdays().catch(() => []),
      ]);
      setFamily(familyRes.family);
      setMembers(familyRes.members);
      setBirthdays(birthdaysRes);
    } catch (err) {
      console.warn('Family data fetch warning:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFamilyData();
  }, [fetchFamilyData]);

  // Keep global color softness synced whenever family data changes
  useEffect(() => {
    const dbSoftness = family?.color_softness ?? family?.colorSoftness;
    if (dbSoftness !== undefined && dbSoftness !== null) {
      const level = Math.max(0, Math.min(100, Math.round(dbSoftness)));
      setColorSoftnessState(level);
      setGlobalColorSoftness(level);
      localStorage.setItem('familycal_color_softness', String(level));
    } else {
      const saved = localStorage.getItem('familycal_color_softness');
      const val = saved !== null ? parseInt(saved, 10) : 85;
      const finalVal = isNaN(val) ? 85 : val;
      setColorSoftnessState(finalVal);
      setGlobalColorSoftness(finalVal);
    }
  }, [family?.color_softness, family?.colorSoftness]);

  const updateColorSoftness = async (level: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    setColorSoftnessState(clamped);
    setGlobalColorSoftness(clamped);
    localStorage.setItem('familycal_color_softness', String(clamped));

    try {
      const updated = await api.updateFamily({ colorSoftness: clamped });
      setFamily(updated);
    } catch (err) {
      console.error('Failed to persist color softness setting:', err);
    }
  };

  const addMember = async (data: Partial<FamilyMember> & { login?: { enabled: boolean; username?: string; password?: string } }) => {
    const newMember = await api.createMember(data);
    await fetchFamilyData();
    return newMember;
  };

  const updateMember = async (id: string, data: Partial<FamilyMember>) => {
    const updated = await api.updateMember(id, data);
    await fetchFamilyData();
    return updated;
  };

  const adjustMemberPoints = async (id: string, data: { points?: number; delta?: number; notes?: string }) => {
    const res = await api.adjustMemberPoints(id, data);
    await fetchFamilyData();
    return res;
  };

  const removeMember = async (id: string) => {
    await api.deleteMember(id);
    await fetchFamilyData();
  };

  const manageMemberLogin = async (id: string, data: { enabled: boolean; username?: string; password?: string }) => {
    const res = await api.manageMemberLogin(id, data);
    await fetchFamilyData();
    return res;
  };

  const updateHousehold = async (data: { name?: string; timezone?: string; viewerPassword?: string; colorSoftness?: number; color_softness?: number }) => {
    const updated = await api.updateFamily(data);
    setFamily(updated);
  };

  const updateMemberPermissions = async (id: string, data: { permissions?: Partial<import('../types').UserPermissions>; resetToDefaults?: boolean }) => {
    const updated = await api.updateMemberPermissions(id, data);
    await fetchFamilyData();
    return updated;
  };

  return (
    <FamilyContext.Provider
      value={{
        family,
        members,
        birthdays,
        selectedMemberFilter,
        setSelectedMemberFilter,
        isLoading,
        colorSoftness,
        updateColorSoftness,
        fetchFamilyData,
        addMember,
        updateMember,
        adjustMemberPoints,
        removeMember,
        manageMemberLogin,
        updateHousehold,
        updateMemberPermissions,
      }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  const context = useContext(FamilyContext);
  if (!context) {
    throw new Error('useFamily must be used within a FamilyProvider');
  }
  return context;
}
