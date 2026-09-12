import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { useAuth } from '../../context/AuthContext';
import {
  FamilyMember,
  UserRole,
  PermissionKey,
  UserPermissions,
  PERMISSION_DEFINITIONS,
  DEFAULT_MEMBER_PERMISSIONS,
  ADMIN_PERMISSIONS,
} from '../../types';
import {
  Users,
  Plus,
  Shield,
  UserCheck,
  Baby,
  Edit2,
  Trash2,
  Globe,
  Palette,
  Calendar,
  X,
  Check,
  Key,
  Lock,
  User,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sliders,
  Settings,
} from 'lucide-react';
import { PastelColorPicker, getPastelColorInfo } from '../../utils/colors';

export const FamilyView: React.FC = () => {
  const {
    family,
    members,
    addMember,
    updateMember,
    removeMember,
    manageMemberLogin,
    updateHousehold,
    updateMemberPermissions,
  } = useFamily();
  const { user, hasPermission } = useAuth();

  // Household settings edit state
  const [isEditingHousehold, setIsEditingHousehold] = useState(false);
  const [householdName, setHouseholdName] = useState(family?.name || '');
  const [householdTimezone, setHouseholdTimezone] = useState(family?.timezone || 'UTC');

  // Member Modal State
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState<UserRole>('adult');
  const [memberColor, setMemberColor] = useState('#F8BBD0');
  const [memberBirthday, setMemberBirthday] = useState('');
  const [newMemberCreateLogin, setNewMemberCreateLogin] = useState(false);
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manage Login Modal State (Admin only)
  const [loginModalMember, setLoginModalMember] = useState<FamilyMember | null>(null);
  const [loginEnabled, setLoginEnabled] = useState(true);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);

  // Permissions Modal State (Admin only)
  const [permModalMember, setPermModalMember] = useState<FamilyMember | null>(null);
  const [memberPermissions, setMemberPermissions] = useState<UserPermissions>({ ...DEFAULT_MEMBER_PERMISSIONS });
  const [permSubmitting, setPermSubmitting] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [permSuccess, setPermSuccess] = useState<string | null>(null);

  const isAdmin = user?.role === 'administrator';
  const canManageMembers = isAdmin || hasPermission('members_manage');

  const openAddModal = () => {
    setEditingMember(null);
    setMemberName('');
    setMemberRole('adult');
    setMemberColor('#F8BBD0');
    setMemberBirthday('');
    setNewMemberCreateLogin(false);
    setNewMemberUsername('');
    setNewMemberPassword('');
    setError(null);
    setIsMemberModalOpen(true);
  };

  const openEditModal = (m: FamilyMember) => {
    setEditingMember(m);
    setMemberName(m.name);
    setMemberRole(m.role);
    setMemberColor(m.color || '#F8BBD0');
    setMemberBirthday(m.birthday || '');
    setError(null);
    setIsMemberModalOpen(true);
  };

  const openLoginModal = (m: FamilyMember) => {
    setLoginModalMember(m);
    const hasUser = !!m.user_id;
    const isActive = m.user_is_active === 1 || (hasUser && m.user_is_active !== 0);
    setLoginEnabled(hasUser ? isActive : true);
    setLoginUsername(m.user_username || m.name.trim().split(' ')[0] || m.name.trim());
    setLoginPassword('');
    setShowLoginPassword(false);
    setLoginError(null);
    setLoginSuccess(null);
  };

  const openPermissionsModal = (m: FamilyMember) => {
    setPermModalMember(m);
    const base = m.role === 'administrator' ? ADMIN_PERMISSIONS : DEFAULT_MEMBER_PERMISSIONS;
    const resolved = m.resolved_permissions || base;
    setMemberPermissions({ ...resolved });
    setPermError(null);
    setPermSuccess(null);
  };

  const handleTogglePermission = (key: PermissionKey) => {
    setMemberPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleResetPermissions = (preset: 'admin' | 'adult' | 'child') => {
    if (preset === 'admin') {
      setMemberPermissions({ ...ADMIN_PERMISSIONS });
    } else if (preset === 'child') {
      setMemberPermissions({
        ...DEFAULT_MEMBER_PERMISSIONS,
        calendar_create: false,
        calendar_edit: false,
        calendar_delete: false,
        calendar_assign: false,
        event_create: true,
        event_edit_all: false,
        event_edit_assigned: true,
        event_edit_own: true,
        event_delete_all: false,
        event_delete_assigned: false,
        event_delete_own: true,
        members_manage: false,
        google_calendar_manage: false,
      });
    } else {
      setMemberPermissions({ ...DEFAULT_MEMBER_PERMISSIONS });
    }
  };

  const handlePermissionsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permModalMember) return;
    setPermSubmitting(true);
    setPermError(null);
    setPermSuccess(null);
    try {
      await updateMemberPermissions(permModalMember.id, {
        permissions: memberPermissions,
      });
      setPermSuccess('Permissions updated successfully.');
      setTimeout(() => {
        setPermModalMember(null);
      }, 1200);
    } catch (err: any) {
      setPermError(err?.message || 'Failed to update permissions.');
    } finally {
      setPermSubmitting(false);
    }
  };

  const handleSaveHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdName.trim()) return;
    await updateHousehold({ name: householdName.trim(), timezone: householdTimezone });
    setIsEditingHousehold(false);
  };

  const handleMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim()) {
      setError('Member name is required.');
      return;
    }

    if (!editingMember && newMemberCreateLogin) {
      if (!newMemberPassword || newMemberPassword.length < 4) {
        setError('Password must be at least 4 characters long.');
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingMember) {
        await updateMember(editingMember.id, {
          name: memberName.trim(),
          role: memberRole,
          color: memberColor,
          birthday: memberBirthday || null,
        });
      } else {
        await addMember({
          name: memberName.trim(),
          role: memberRole,
          color: memberColor,
          birthday: memberBirthday || null,
          login: newMemberCreateLogin
            ? {
                enabled: true,
                username: newMemberUsername.trim() || memberName.trim().split(' ')[0] || memberName.trim(),
                password: newMemberPassword,
              }
            : undefined,
        });
      }
      setIsMemberModalOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save member.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginModalMember) return;

    if (loginEnabled && (!loginModalMember.user_id || !loginModalMember.has_login)) {
      if (!loginPassword || loginPassword.length < 4) {
        setLoginError('Password must be at least 4 characters long.');
        return;
      }
    }

    if (loginEnabled && loginPassword && loginPassword.length < 4) {
      setLoginError('Password must be at least 4 characters long.');
      return;
    }

    setLoginSubmitting(true);
    setLoginError(null);
    setLoginSuccess(null);

    try {
      const res = await manageMemberLogin(loginModalMember.id, {
        enabled: loginEnabled,
        username: loginUsername.trim() || undefined,
        password: loginPassword.trim() || undefined,
      });
      setLoginSuccess(res.message || 'Login settings updated successfully.');
      setTimeout(() => {
        setLoginModalMember(null);
      }, 1200);
    } catch (err: any) {
      setLoginError(err?.message || 'Failed to update login settings.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleDeleteMember = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove ${name} from the household?`)) {
      try {
        await removeMember(id);
      } catch (err: any) {
        alert(err?.message || 'Failed to remove member.');
      }
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'administrator':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-900 border border-pink-200">
            <Shield className="w-3 h-3 text-pink-700" /> Admin
          </span>
        );
      case 'child':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-900 border border-cyan-200">
            <Baby className="w-3 h-3 text-cyan-700" /> Child
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
            <UserCheck className="w-3 h-3 text-emerald-700" /> Adult
          </span>
        );
    }
  };

  return (
    <div id="family-view-container" className="flex flex-col flex-1 max-w-5xl mx-auto w-full space-y-6 pb-12">
      {/* Household Profile Card */}
      <div className="p-6 rounded-3xl bg-white border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#F8BBD0] border border-[#F472B6]/40 flex items-center justify-center shadow-2xs">
              <Users className="w-5 h-5 text-[#831843]" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight font-serif">
              {family?.name || 'Household Family'}
            </h2>
          </div>
          <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-gray-400" /> Timezone: {family?.timezone || 'UTC'}
            <span>•</span>
            <span>{members.length} Household {members.length === 1 ? 'Member' : 'Members'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageMembers && (
            isEditingHousehold ? (
              <form onSubmit={handleSaveHousehold} className="flex items-center gap-2">
                <input
                  type="text"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-gray-900 text-white hover:bg-gray-800 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingHousehold(false)}
                  className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:text-gray-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setHouseholdName(family?.name || '');
                  setHouseholdTimezone(family?.timezone || 'UTC');
                  setIsEditingHousehold(true);
                }}
                className="px-4 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-semibold border border-gray-200 transition-colors cursor-pointer"
              >
                Edit Household
              </button>
            )
          )}

          {canManageMembers && (
            <button
              id="add-family-member-btn"
              onClick={openAddModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Member</span>
            </button>
          )}
        </div>
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((member) => {
          const isCurrentUser = member.user_id === user?.id;
          const canEditThisMember = isAdmin || isCurrentUser || canManageMembers;
          const colorInfo = getPastelColorInfo(member.color);

          return (
            <div
              key={member.id}
              id={`member-card-${member.id}`}
              style={{ backgroundColor: colorInfo.bgSoft, borderColor: colorInfo.borderHex }}
              onClick={() => {
                if (canEditThisMember) openEditModal(member);
              }}
              className={`p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-all ${
                canEditThisMember ? 'cursor-pointer' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shadow-xs border relative"
                    style={{
                      backgroundColor: colorInfo.hex,
                      color: colorInfo.textHex,
                      borderColor: colorInfo.borderHex,
                    }}
                  >
                    {member.name.slice(0, 1).toUpperCase()}
                    {isCurrentUser && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" title="You" />
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                      {member.name}
                      {isCurrentUser && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          You
                        </span>
                      )}
                    </h3>
                    <div className="mt-1">
                      {getRoleBadge(member.role)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openPermissionsModal(member);
                      }}
                      className="p-1.5 rounded-xl hover:bg-black/5 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                      title="Manage Permissions"
                      id={`manage-perms-btn-${member.id}`}
                    >
                      <Sliders className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openLoginModal(member);
                      }}
                      className="p-1.5 rounded-xl hover:bg-black/5 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                      title="Manage Member Login"
                      id={`manage-login-btn-${member.id}`}
                    >
                      <Key className="w-4 h-4" />
                    </button>
                  )}
                  {canEditThisMember && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(member);
                      }}
                      className="p-1.5 rounded-xl hover:bg-black/5 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                      title="Settings"
                      aria-label="Settings"
                      id={`member-settings-btn-${member.id}`}
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                  {members.length > 1 && !isCurrentUser && isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMember(member.id, member.name);
                      }}
                      className="p-1.5 rounded-xl hover:bg-red-100 text-gray-500 hover:text-red-700 transition-colors cursor-pointer"
                      title="Remove Member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Member details */}
              <div className="pt-3 border-t border-black/10 space-y-2 text-xs text-gray-700">
                {member.birthday ? (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-gray-600">
                      <Calendar className="w-3.5 h-3.5 text-pink-600" /> Birthday:
                    </span>
                    <span className="font-semibold text-gray-900">{member.birthday}</span>
                  </div>
                ) : (
                  <div className="text-gray-400 text-[11px]">No birthday registered</div>
                )}

                {/* Member Login Details */}
                <div className="pt-2 border-t border-black/5 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] text-gray-600">
                    <Lock className="w-3 h-3 text-pink-600" /> Login:
                  </span>
                  {member.user_id ? (
                    member.user_is_active === 0 ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                        Disabled
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono text-emerald-800 font-bold">
                          {member.user_username || member.name}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" title="Active login" />
                      </div>
                    )
                  ) : (
                    <span className="text-[11px] text-gray-400 italic">
                      No login account
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Member Settings / Edit Modal */}
      {isMemberModalOpen && (
        <div
          id="member-settings-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto overflow-x-hidden"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 20px, 28px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 20px, 28px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px) + 12px, 12px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px) + 12px, 12px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMemberModalOpen(false);
          }}
        >
          <div
            id="member-settings-dialog"
            className="relative bg-white border border-gray-200 rounded-3xl w-full max-w-md shadow-2xl animate-in fade-in sm:zoom-in-95 flex flex-col max-h-[calc(100dvh-max(env(safe-area-inset-top,0px)+env(safe-area-inset-bottom,0px)+3rem,4rem))] my-auto overflow-hidden"
          >
            {/* Modal Header (Fixed at top of modal, never clipped) */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 shrink-0 bg-white rounded-t-3xl">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold border shadow-2xs shrink-0"
                  style={{
                    backgroundColor: getPastelColorInfo(memberColor).hex,
                    color: getPastelColorInfo(memberColor).textHex,
                    borderColor: getPastelColorInfo(memberColor).borderHex,
                  }}
                >
                  {memberName.trim()
                    ? memberName.trim().slice(0, 1).toUpperCase()
                    : editingMember
                    ? editingMember.name.slice(0, 1).toUpperCase()
                    : 'M'}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 font-serif truncate">
                    {editingMember ? 'Member Settings' : 'Add Family Member'}
                  </h3>
                  {editingMember && (
                    <p className="text-[11px] text-gray-500 truncate">
                      {editingMember.name} • <span className="capitalize">{editingMember.role}</span>
                    </p>
                  )}
                </div>
              </div>
              <button
                id="close-member-settings-btn"
                type="button"
                onClick={() => setIsMemberModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleMemberSubmit}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* Scrollable Form Body */}
              <div
                className="flex-1 overflow-y-auto overflow-x-hidden px-5 sm:px-6 py-4 space-y-4"
                style={{
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
                }}
              >
                {error && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={memberName}
                    onChange={(e) => {
                      setMemberName(e.target.value);
                      if (!newMemberUsername) {
                        setNewMemberUsername(e.target.value.trim().split(' ')[0] || '');
                      }
                    }}
                    placeholder="e.g. Robin, Sophie, Leo..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Family Role
                  </label>
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as UserRole)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900 font-medium"
                  >
                    <option value="adult">Adult</option>
                    <option value="administrator">Administrator</option>
                    <option value="child">Child</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5 text-gray-500" /> Member Pastel Color
                  </label>
                  <PastelColorPicker selectedColor={memberColor} onSelectColor={setMemberColor} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" /> Birthday (Optional)
                  </label>
                  <input
                    type="date"
                    value={memberBirthday}
                    onChange={(e) => setMemberBirthday(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>

                {/* Administrator option to create login for new member */}
                {!editingMember && isAdmin && (
                  <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-800 flex items-center gap-1.5 cursor-pointer">
                        <Key className="w-3.5 h-3.5 text-[#DB2777]" />
                        <span>Create Member Login Account</span>
                      </label>
                      <input
                        type="checkbox"
                        id="new-member-login-checkbox"
                        checked={newMemberCreateLogin}
                        onChange={(e) => {
                          setNewMemberCreateLogin(e.target.checked);
                          if (e.target.checked && !newMemberUsername) {
                            setNewMemberUsername(memberName.trim().split(' ')[0] || memberName.trim());
                          }
                        }}
                        className="w-4 h-4 rounded text-gray-900 focus:ring-gray-900 cursor-pointer"
                      />
                    </div>

                    {newMemberCreateLogin && (
                      <div className="space-y-2.5 pt-1">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                            Username (e.g. Dad, Mum, Kid) *
                          </label>
                          <input
                            type="text"
                            required={newMemberCreateLogin}
                            value={newMemberUsername}
                            onChange={(e) => setNewMemberUsername(e.target.value)}
                            placeholder="e.g. Dad"
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                            Password (min 4 characters) *
                          </label>
                          <input
                            type="password"
                            required={newMemberCreateLogin}
                            value={newMemberPassword}
                            onChange={(e) => setNewMemberPassword(e.target.value)}
                            placeholder="Set login password"
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fixed Modal Footer */}
              <div
                className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-gray-100 bg-gray-50/90 backdrop-blur-xs flex items-center justify-end gap-2.5"
                style={{
                  paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Saving...' : editingMember ? 'Save Settings' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Manage Permissions Modal */}
      {permModalMember && (
        <div
          id="member-permissions-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto overflow-x-hidden"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 20px, 28px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 20px, 28px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px) + 12px, 12px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px) + 12px, 12px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPermModalMember(null);
          }}
        >
          <div
            id="member-permissions-dialog"
            className="relative bg-white border border-gray-200 rounded-3xl w-full max-w-lg shadow-2xl animate-in fade-in sm:zoom-in-95 flex flex-col max-h-[calc(100dvh-max(env(safe-area-inset-top,0px)+env(safe-area-inset-bottom,0px)+3rem,4rem))] my-auto overflow-hidden"
          >
            {/* Fixed Modal Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 shrink-0 bg-white rounded-t-3xl">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold border shadow-2xs shrink-0"
                  style={{
                    backgroundColor: getPastelColorInfo(permModalMember.color).hex,
                    color: getPastelColorInfo(permModalMember.color).textHex,
                    borderColor: getPastelColorInfo(permModalMember.color).borderHex,
                  }}
                >
                  {permModalMember.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5 font-serif truncate">
                    <Sliders className="w-4 h-4 text-gray-700 shrink-0" />
                    Member Permissions
                  </h3>
                  <p className="text-[11px] text-gray-500 truncate">
                    {permModalMember.name} • <span className="capitalize">{permModalMember.role}</span>
                  </p>
                </div>
              </div>
              <button
                id="close-member-permissions-btn"
                type="button"
                onClick={() => setPermModalMember(null)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handlePermissionsSubmit}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* Scrollable Form Body */}
              <div
                className="flex-1 overflow-y-auto overflow-x-hidden px-5 sm:px-6 py-4 space-y-4"
                style={{
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
                }}
              >
                {permError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{permError}</span>
                  </div>
                )}

                {permSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{permSuccess}</span>
                  </div>
                )}

                {/* Role Presets */}
                <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-gray-600 font-semibold">Quick Presets:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleResetPermissions('adult')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-gray-100 text-[11px] font-semibold text-emerald-800 border border-gray-200 shadow-2xs transition-colors cursor-pointer"
                    >
                      Adult Defaults
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetPermissions('child')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-gray-100 text-[11px] font-semibold text-cyan-800 border border-gray-200 shadow-2xs transition-colors cursor-pointer"
                    >
                      Child Defaults
                    </button>
                    {permModalMember.role === 'administrator' && (
                      <button
                        type="button"
                        onClick={() => handleResetPermissions('admin')}
                        className="px-2.5 py-1 rounded-lg bg-gray-900 text-white hover:bg-gray-800 text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                      >
                        Full Admin
                      </button>
                    )}
                  </div>
                </div>

                {/* Categorized Permissions */}
                {(['calendars', 'events', 'family', 'google'] as const).map((cat) => {
                  const catDefs = PERMISSION_DEFINITIONS.filter((d) => d.category === cat);
                  const catTitles: Record<string, string> = {
                    calendars: 'Calendar Management',
                    events: 'Events & Schedule',
                    family: 'Family & Household',
                    google: 'Google Calendar Integrations',
                  };

                  return (
                    <div key={cat} className="space-y-2">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        {catTitles[cat]}
                      </h4>
                      <div className="space-y-1.5 bg-gray-50 p-3 rounded-2xl border border-gray-200">
                        {catDefs.map((def) => {
                          const isChecked = Boolean(memberPermissions[def.key]);
                          return (
                            <label
                              key={def.key}
                              className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-white cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleTogglePermission(def.key)}
                                className="mt-0.5 w-4 h-4 rounded text-gray-900 focus:ring-gray-900 cursor-pointer"
                              />
                              <div className="flex-1">
                                <span className="text-xs font-semibold text-gray-900 block">
                                  {def.label}
                                </span>
                                <span className="text-[11px] text-gray-500 block leading-tight">
                                  {def.description}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Fixed Modal Footer */}
              <div
                className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-gray-100 bg-gray-50/90 backdrop-blur-xs flex items-center justify-end gap-2.5"
                style={{
                  paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))',
                }}
              >
                <button
                  type="button"
                  onClick={() => setPermModalMember(null)}
                  className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={permSubmitting}
                  className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {permSubmitting ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Manage Login Modal */}
      {loginModalMember && (
        <div
          id="member-login-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto overflow-x-hidden"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 20px, 28px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 20px, 28px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px) + 12px, 12px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px) + 12px, 12px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setLoginModalMember(null);
          }}
        >
          <div
            id="member-login-dialog"
            className="relative bg-white border border-gray-200 rounded-3xl w-full max-w-md shadow-2xl animate-in fade-in sm:zoom-in-95 flex flex-col max-h-[calc(100dvh-max(env(safe-area-inset-top,0px)+env(safe-area-inset-bottom,0px)+3rem,4rem))] my-auto overflow-hidden"
          >
            {/* Fixed Modal Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 shrink-0 bg-white rounded-t-3xl">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold border shadow-2xs shrink-0"
                  style={{
                    backgroundColor: getPastelColorInfo(loginModalMember.color).hex,
                    color: getPastelColorInfo(loginModalMember.color).textHex,
                    borderColor: getPastelColorInfo(loginModalMember.color).borderHex,
                  }}
                >
                  {loginModalMember.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 font-serif truncate">
                    Manage Member Login
                  </h3>
                  <p className="text-[11px] text-gray-500 truncate">
                    {loginModalMember.name} • {loginModalMember.role}
                  </p>
                </div>
              </div>
              <button
                id="close-member-login-btn"
                type="button"
                onClick={() => setLoginModalMember(null)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleLoginSubmit}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* Scrollable Form Body */}
              <div
                className="flex-1 overflow-y-auto overflow-x-hidden px-5 sm:px-6 py-4 space-y-4"
                style={{
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
                }}
              >
                {loginError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                {loginSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{loginSuccess}</span>
                  </div>
                )}

                {/* Enable / Disable toggle */}
                <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-gray-900 block">
                      Login Account Enabled
                    </label>
                    <p className="text-[11px] text-gray-500">
                      {loginEnabled
                        ? 'Member can sign into FamilyCal with their credentials'
                        : 'Login access is disabled for this member'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="member-login-enabled-toggle"
                    checked={loginEnabled}
                    disabled={loginModalMember.user_id === user?.id}
                    onChange={(e) => setLoginEnabled(e.target.checked)}
                    className="w-5 h-5 rounded text-gray-900 focus:ring-gray-900 cursor-pointer disabled:opacity-50"
                  />
                </div>

                {loginModalMember.user_id === user?.id && (
                  <p className="text-[11px] text-amber-700 px-1">
                    Note: This is your active administrator account.
                  </p>
                )}

                {loginEnabled && (
                  <>
                    {/* Username Field */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-gray-500" /> Username *
                      </label>
                      <input
                        type="text"
                        required
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="e.g. Dad, Mum, Kid"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Used by this family member to sign into FamilyCal.
                      </p>
                    </div>

                    {/* Password Field */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-gray-500" />
                        {loginModalMember.has_login
                          ? 'Set New Password (optional)'
                          : 'Initial Password *'}
                      </label>
                      <div className="relative">
                        <input
                          type={showLoginPassword ? 'text' : 'password'}
                          required={!loginModalMember.has_login}
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder={
                            loginModalMember.has_login
                              ? 'Leave blank to keep existing password'
                              : 'Min 4 characters'
                          }
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 pr-10 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700 cursor-pointer"
                        >
                          {showLoginPassword ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {loginModalMember.has_login
                          ? 'Admin can reset this member’s password at any time.'
                          : 'Set an initial password for this member.'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Fixed Modal Footer */}
              <div
                className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-gray-100 bg-gray-50/90 backdrop-blur-xs flex items-center justify-end gap-2.5"
                style={{
                  paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))',
                }}
              >
                <button
                  type="button"
                  onClick={() => setLoginModalMember(null)}
                  className="px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loginSubmitting}
                  className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {loginSubmitting ? 'Saving...' : 'Save Login Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
