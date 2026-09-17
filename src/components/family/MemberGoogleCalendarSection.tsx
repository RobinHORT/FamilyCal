import React, { useState } from 'react';
import { Calendar, Globe, RefreshCw, Unlink, AlertCircle } from 'lucide-react';
import { FamilyMember } from '../../types';
import { useCalendar } from '../../context/CalendarContext';
import { api } from '../../api/client';

interface MemberGoogleCalendarSectionProps {
  member: FamilyMember;
  currentMember: FamilyMember | null;
  isAdmin: boolean;
}

export const MemberGoogleCalendarSection: React.FC<MemberGoogleCalendarSectionProps> = ({
  member,
  currentMember,
  isAdmin,
}) => {
  const { googleAccounts, calendars, fetchCalendarData } = useCalendar();
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Check if member matches current user or admin
  const isOwnConnection =
    (currentMember && currentMember.id === member.id) ||
    (currentMember?.user_id && member.user_id && currentMember.user_id === member.user_id);

  const canManage = isOwnConnection || isAdmin;

  // Find account associated with this member
  const account = googleAccounts.find(
    (acc) => acc.member_id === member.id || (member.user_id && acc.user_id === member.user_id)
  );

  // Find calendars associated with this member and source 'google'
  const memberGoogleCalendars = calendars.filter(
    (cal) => cal.source === 'google' && (cal.member_id === member.id || (!cal.member_id && account))
  );

  const handleConnect = async () => {
    setActionError(null);
    setIsActionLoading(true);
    try {
      const { url } = await api.getGoogleAuthUrl(member.id);
      window.location.href = url;
    } catch (err: any) {
      setActionError(err.message || 'Failed to initialize Google login');
      setIsActionLoading(false);
    }
  };

  const handleDiscover = async () => {
    setActionError(null);
    setIsActionLoading(true);
    try {
      await api.discoverGoogleCalendars(account?.id, member.id);
      await fetchCalendarData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to manage Google Calendars');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect Google Calendar for ${member.name}?`)) return;
    setActionError(null);
    setIsActionLoading(true);
    try {
      await api.disconnectGoogle(account?.id, member.id);
      await fetchCalendarData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to disconnect Google Calendar');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleToggleCalendar = async (calId: string, enabled: boolean) => {
    try {
      await api.updateCalendar(calId, { sync_enabled: enabled ? 1 : 0 });
      await fetchCalendarData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update calendar settings');
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Calendar className="w-4 h-4 text-gray-500" />
        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Calendars</h4>
      </div>

      <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <div className="text-xs font-bold text-gray-900">Google Calendar</div>
              {account ? (
                <div className="text-[11px] text-gray-500">
                  Connected as: <span className="font-medium text-gray-800">{account.google_email}</span>
                </div>
              ) : (
                <div className="text-[11px] text-gray-500">
                  Connect {member.name}&apos;s Google account to sync calendars.
                </div>
              )}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {!canManage && (
          <p className="text-[11px] text-gray-500 italic">
            Only {member.name} can manage their own Google account connection.
          </p>
        )}

        {account ? (
          <div className="space-y-3 pt-1">
            {memberGoogleCalendars.length > 0 && (
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Google Calendars
                </label>
                <div className="space-y-1.5">
                  {memberGoogleCalendars.map((cal) => (
                    <label
                      key={cal.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-white border border-gray-200/80 hover:border-gray-300 text-xs text-gray-800 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cal.color || '#4285F4' }}
                        />
                        <span className="truncate font-medium text-gray-800">{cal.name}</span>
                      </div>
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={cal.sync_enabled === 1}
                        onChange={(e) => handleToggleCalendar(cal.id, e.target.checked)}
                        className="w-4 h-4 rounded text-gray-900 focus:ring-gray-900 cursor-pointer disabled:opacity-50"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {canManage && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={handleDiscover}
                  className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isActionLoading ? 'animate-spin' : ''}`} />
                  <span>Manage Google Calendars</span>
                </button>
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Disconnect Google</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          canManage && (
            <div className="pt-1">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleConnect}
                className="px-3.5 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Connect Google</span>
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
};
