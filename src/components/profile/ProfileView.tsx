import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFamily } from '../../context/FamilyContext';
import { useCalendar } from '../../context/CalendarContext';
import { PERMISSION_DEFINITIONS } from '../../types';
import {
  User,
  Shield,
  Key,
  LogOut,
  CheckCircle2,
  Users,
  Calendar as CalIcon,
  Check,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { getPastelColorInfo } from '../../utils/colors';

export const ProfileView: React.FC = () => {
  const { user, family, logout, permissions, isAdmin, hasPermission, changePassword } = useAuth();
  const { members } = useFamily();
  const { calendars } = useCalendar();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passMessage, setPassMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!user) return null;

  const userColorInfo = getPastelColorInfo(user.color);
  const assignedMember = members.find((m) => m.id === user.member_id);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPassMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setPassMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }

    setIsChangingPass(true);
    setPassMessage(null);
    try {
      await changePassword(currentPassword, newPassword);
      setPassMessage({ type: 'success', text: 'Password successfully updated!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPassMessage({ type: 'error', text: err?.message || 'Failed to update password.' });
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div id="profile-view-container" className="max-w-3xl mx-auto w-full space-y-6 pb-12">
      {/* Header */}
      <div className="pb-4 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight font-serif flex items-center gap-2">
          <User className="w-6 h-6 text-gray-700" />
          User Profile & Account
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Manage your household account credentials, view active permissions, and family details.
        </p>
      </div>

      {/* User Card */}
      <div className="p-6 rounded-3xl bg-white border border-gray-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl border shadow-xs"
              style={{
                backgroundColor: userColorInfo.hex,
                color: userColorInfo.textHex,
                borderColor: userColorInfo.borderHex,
              }}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-gray-900">{user.name}</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-gray-900 text-white text-[11px] font-bold uppercase tracking-wider">
                  {user.role}
                </span>
                {assignedMember && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                    style={{
                      backgroundColor: getPastelColorInfo(assignedMember.color).bgSoft,
                      color: getPastelColorInfo(assignedMember.color).textHex,
                      borderColor: getPastelColorInfo(assignedMember.color).borderHex,
                    }}
                  >
                    Linked: {assignedMember.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                {user.username ? `@${user.username}` : user.email}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Family: <strong className="text-gray-900">{family?.name || 'Household'}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Household Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500 block mb-1">Household</span>
          <span className="text-base font-bold text-gray-900">{family?.name || 'Family Hub'}</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
          <span className="text-xs font-semibold text-gray-500 block mb-1">Members</span>
          <span className="text-base font-bold text-gray-900">{members.length} active</span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs col-span-2 sm:col-span-1">
          <span className="text-xs font-semibold text-gray-500 block mb-1">Calendars</span>
          <span className="text-base font-bold text-gray-900">{calendars.length} active</span>
        </div>
      </div>

      {/* Role & Permissions Card */}
      <div className="p-6 rounded-3xl bg-white border border-gray-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-gray-700" />
          <h3 className="text-base font-bold text-gray-900">Your Active Permissions</h3>
        </div>

        {isAdmin ? (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>As an <strong>Administrator</strong>, you have full access to create, edit, delete, and configure all family schedules and settings.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PERMISSION_DEFINITIONS.map((def) => {
              const isGranted = hasPermission(def.key);

              return (
                <div
                  key={def.key}
                  className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
                    isGranted
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <div>
                    <span className="font-semibold block">{def.label}</span>
                    <span className="text-[10px] text-gray-500 block">{def.description}</span>
                  </div>
                  {isGranted ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <span className="text-[10px] font-bold text-gray-400 shrink-0">No</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Change Password Form */}
      <div className="p-6 rounded-3xl bg-white border border-gray-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-gray-700" />
          <h3 className="text-base font-bold text-gray-900">Change Password</h3>
        </div>

        {passMessage && (
          <div
            className={`p-3 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
              passMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {passMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{passMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isChangingPass}
            className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            {isChangingPass ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};
