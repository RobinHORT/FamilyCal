import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { GoogleConfigResponse, GoogleAccount, GoogleSyncLog, SystemStats } from '../../types';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import {
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Download,
  Database,
  ExternalLink,
  Shield,
  Layers,
  Clock,
  Trash2,
  Calendar as CalIcon,
  UserCheck,
  Users,
  Pencil,
} from 'lucide-react';
import { format } from 'date-fns';
import { EditCalendarModal } from '../calendar/EditCalendarModal';
import { Calendar } from '../../types';
import { getPastelColorInfo } from '../../utils/colors';

export const IntegrationsView: React.FC = () => {
  const { calendars, updateCalendar, fetchCalendarData } = useCalendar();
  const { members } = useFamily();
  const [googleConfig, setGoogleConfig] = useState<GoogleConfigResponse | null>(null);
  const [syncLogs, setSyncLogs] = useState<GoogleSyncLog[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [updatingCalId, setUpdatingCalId] = useState<string | null>(null);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [configRes, logsRes, statsRes] = await Promise.all([
        api.getGoogleConfig(),
        api.getGoogleLogs().catch(() => []),
        api.getSystemStats().catch(() => null),
      ]);
      setGoogleConfig(configRes);
      setSyncLogs(logsRes);
      setSystemStats(statsRes);
    } catch (err) {
      console.error('Failed to load integrations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAssignCalendar = async (calId: string, memberId: string | null) => {
    setUpdatingCalId(calId);
    try {
      const updated = await updateCalendar(calId, { member_id: memberId });
      const memberName = members.find((m) => m.id === memberId)?.name;
      setSyncMessage(
        `Assigned "${updated.name}" to ${memberName || 'Shared Household'}. Existing events updated.`
      );
      await fetchCalendarData();
    } catch (err: any) {
      setSyncMessage(`Failed to update calendar assignment: ${err?.message}`);
    } finally {
      setUpdatingCalId(null);
    }
  };

  const googleCalendars = calendars.filter((c) => c.source === 'google');

  const handleConnectGoogle = async () => {
    try {
      const res = await api.getGoogleAuthUrl();
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      alert(err?.message || 'Google OAuth is not configured in server environment yet.');
    }
  };

  const handleManualSync = async (accountId?: string) => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await api.syncGoogle(accountId);
      setSyncMessage(`Successfully synced ${res.eventsSynced} events with Google Calendar!`);
      await loadAll();
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err?.message || 'Error communicating with Google API'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDiscoverCalendars = async (accountId?: string) => {
    setIsSyncing(true);
    try {
      const res = await api.discoverGoogleCalendars(accountId);
      setSyncMessage(`Discovered and linked ${res.count} calendars from Google.`);
      await loadAll();
    } catch (err: any) {
      setSyncMessage(`Discovery error: ${err?.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async (accountId?: string) => {
    if (confirm('Are you sure you want to disconnect this Google Account?')) {
      try {
        await api.disconnectGoogle(accountId);
        await loadAll();
      } catch (err: any) {
        alert(err?.message || 'Failed to disconnect account.');
      }
    }
  };

  const handleExportBackup = () => {
    const token = localStorage.getItem('yimly_jwt_token');
    window.open(`/api/system/export${token ? `?token=${token}` : ''}`, '_blank');
  };

  const connectedAccounts = googleConfig?.connectedAccounts || [];

  return (
    <div id="integrations-view-container" className="flex flex-col flex-1 max-w-5xl mx-auto w-full space-y-6 pb-12">
      {/* View Header */}
      <div className="pb-4 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight font-serif">
          Integrations & System Settings
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Configure Google Calendar synchronization, export household backups, and check system health.
        </p>
      </div>

      {syncMessage && (
        <div className="p-3.5 rounded-2xl bg-pink-50 border border-pink-200 text-pink-900 text-xs font-semibold flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-pink-600 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Google Calendar Card */}
      <div className="p-6 rounded-3xl bg-white border border-gray-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 font-serif">
                Google Calendar Integration
                {connectedAccounts.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                    Connected
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500">
                Two-way sync between Yimly FamilyCal and your family Google Calendars.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-1">
                <Shield className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Adheres to Google API Services User Data Policy.</span>
                <a
                  href="/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    window.history.pushState(null, '', '/privacy');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  className="text-pink-600 hover:underline font-semibold ml-0.5 cursor-pointer"
                >
                  Privacy Policy
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {connectedAccounts.length > 0 ? (
              <button
                onClick={() => handleManualSync()}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            ) : (
              <button
                onClick={handleConnectGoogle}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Connect Google Calendar</span>
              </button>
            )}
          </div>
        </div>

        {/* Connected Accounts List */}
        {connectedAccounts.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              Connected Accounts
            </h4>
            <div className="space-y-2">
              {connectedAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <div>
                      <span className="text-xs font-bold text-gray-900 font-mono">{acc.google_email}</span>
                      <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>
                          Last Synced:{' '}
                          {acc.last_synced_at
                            ? format(new Date(acc.last_synced_at), 'MMM d, yyyy HH:mm')
                            : 'Never'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDiscoverCalendars(acc.id)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold border border-gray-200 shadow-2xs transition-colors cursor-pointer"
                    >
                      Discover Calendars
                    </button>
                    <button
                      onClick={() => handleDisconnect(acc.id)}
                      className="p-1.5 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                      title="Disconnect Account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discovered Google Calendars & Member Assignment */}
        {googleCalendars.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                <CalIcon className="w-3.5 h-3.5 text-pink-600" />
                Discovered Google Calendars ({googleCalendars.length})
              </h4>
              <span className="text-[11px] text-gray-500">
                Assign each calendar to a family member or keep as Shared Household
              </span>
            </div>

            <div className="space-y-2.5">
              {googleCalendars.map((cal) => {
                const assignedMember = members.find((m) => m.id === cal.member_id);
                const colorInfo = getPastelColorInfo(cal.color);

                return (
                  <div
                    key={cal.id}
                    className="p-3.5 sm:p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 border"
                        style={{ backgroundColor: colorInfo.hex, borderColor: colorInfo.borderHex }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-900 truncate">{cal.name}</span>
                          {assignedMember ? (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0 border"
                              style={{
                                backgroundColor: getPastelColorInfo(assignedMember.color).bgSoft,
                                color: getPastelColorInfo(assignedMember.color).textHex,
                                borderColor: getPastelColorInfo(assignedMember.color).borderHex,
                              }}
                            >
                              <UserCheck className="w-3 h-3" />
                              {assignedMember.name}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-white text-gray-600 border border-gray-200 text-[10px] font-bold shrink-0">
                              Shared Household
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">
                          Google ID: {cal.google_calendar_id || cal.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 w-full sm:w-auto justify-between sm:justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                      <button
                        id={`edit-google-cal-${cal.id}`}
                        type="button"
                        onClick={() => setEditingCalendar(cal)}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-gray-100 border border-gray-200 text-xs text-gray-700 transition-colors cursor-pointer flex items-center gap-1.5 font-semibold shadow-2xs"
                        title="Edit friendly name and settings"
                      >
                        <Pencil className="w-3.5 h-3.5 text-pink-600" />
                        <span>Edit</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <label htmlFor={`assign-cal-${cal.id}`} className="text-[11px] text-gray-600 font-semibold whitespace-nowrap">
                          Assigned:
                        </label>
                        <select
                          id={`assign-cal-${cal.id}`}
                          value={cal.member_id || ''}
                          disabled={updatingCalId === cal.id}
                          onChange={(e) => handleAssignCalendar(cal.id, e.target.value || null)}
                          className="bg-white border border-gray-200 text-xs text-gray-900 rounded-xl px-3 py-1.5 focus:outline-none focus:border-gray-900 cursor-pointer disabled:opacity-50 font-medium shadow-2xs"
                        >
                          <option value="">Shared Household</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.role.charAt(0).toUpperCase() + m.role.slice(1)})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* OAuth Domain Instructions Box */}
        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-gray-800 font-semibold">
            <Shield className="w-4 h-4 text-pink-600" />
            <span>Google Cloud Console OAuth 2.0 Setup</span>
          </div>
          <p className="text-gray-600 leading-relaxed">
            To enable Google Calendar sync on your custom domain, configure your Google Client ID & Secret and authorize this Redirect URI:
          </p>
          <div className="p-2.5 rounded-xl bg-white border border-gray-200 font-mono text-gray-800 select-all break-all text-[11px]">
            {googleConfig?.redirectUri || 'https://familycal.robinhort.link/api/v1/calendar/google/callback'}
          </div>
        </div>
      </div>

      {/* Backup & Export Card */}
      <div className="p-6 rounded-3xl bg-white border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-2xs">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 font-serif">Full Household Backup Export</h3>
            <p className="text-xs text-gray-500">
              Download your complete family schedule, members, events, and tasks as JSON.
            </p>
          </div>
        </div>

        <button
          onClick={handleExportBackup}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export JSON Backup</span>
        </button>
      </div>

      {/* Container Health & Diagnostic Stats */}
      {systemStats && (
        <div className="p-6 rounded-3xl bg-white border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-gray-700" />
            <h3 className="text-base font-bold text-gray-900 font-serif">System Diagnostics</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-gray-500 block mb-1">Status</span>
              <span className="font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {systemStats.status.toUpperCase()}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-gray-500 block mb-1">Total Events</span>
              <span className="font-bold text-gray-900 font-mono text-sm">{systemStats.events}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-gray-500 block mb-1">Total Tasks</span>
              <span className="font-bold text-gray-900 font-mono text-sm">{systemStats.tasks}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200">
              <span className="text-gray-500 block mb-1">App Version</span>
              <span className="font-bold text-pink-700 font-mono text-sm">v{systemStats.version}</span>
            </div>
          </div>
        </div>
      )}

      {/* Edit Calendar Modal */}
      <EditCalendarModal
        calendar={editingCalendar}
        isOpen={!!editingCalendar}
        onClose={() => setEditingCalendar(null)}
      />
    </div>
  );
};
