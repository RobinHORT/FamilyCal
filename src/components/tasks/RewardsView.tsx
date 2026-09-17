import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Star, Gift, Check, AlertCircle, Edit3, Trash2 } from 'lucide-react';
import { Reward, RewardExchange, FamilyMember } from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useFamily } from '../../context/FamilyContext';
import { isAdultOrAdminRole } from '../../utils/taskPermissions';
import { RewardModal } from './RewardModal';

function formatOwedDetail(description: string | null | undefined, quantity: number, rewardName: string): string {
  const text = (description || rewardName || '').trim();

  // Pattern: "$5" or "$10"
  const moneyMatch = text.match(/^\$(\d+(?:\.\d+)?)/);
  if (moneyMatch) {
    const val = parseFloat(moneyMatch[1]);
    return `$${val * quantity} owed`;
  }

  // Pattern: "1 hour" or "2 hours" or "30 mins"
  const timeMatch = text.match(/^(\d+)\s*(hour|hr|minute|min)s?/i);
  if (timeMatch) {
    const val = parseInt(timeMatch[1], 10);
    const unit = timeMatch[2].toLowerCase();
    const total = val * quantity;
    const unitLabel = total === 1 ? unit : `${unit}s`;
    return `${total} ${unitLabel} owed`;
  }

  if (description && description.trim()) {
    return `${description} (${quantity} owed)`;
  }
  return `${quantity} owed`;
}

export const RewardsView: React.FC = () => {
  const { user, memberProfile, isAdmin } = useAuth();
  const { members, fetchFamilyData } = useFamily();

  // Determine current logged-in member & role
  const currentMember = useMemo(() => {
    if (!user) return null;
    return members.find((m) => m.user_id === user.id) || null;
  }, [user, members]);

  const isAdultOrAdmin = useMemo(() => {
    if (isAdmin || user?.role === 'administrator' || user?.role === 'admin' || user?.role === 'adult') return true;
    const role = currentMember?.role || memberProfile?.role;
    if (role === 'administrator' || role === 'admin' || role === 'adult') return true;
    return isAdultOrAdminRole(user, memberProfile || currentMember);
  }, [user, currentMember, memberProfile, isAdmin]);

  // Data state
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [exchanges, setExchanges] = useState<RewardExchange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exchangingId, setExchangingId] = useState<string | null>(null);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  // Modal state
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);

  const loadRewardsData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [rewardsData, exchangesData] = await Promise.all([
        api.getRewards(),
        api.getRewardExchanges(),
      ]);
      setRewards(rewardsData);
      setExchanges(exchangesData);
    } catch (err: any) {
      console.warn('Failed to load rewards data:', err);
      setError(err.message || 'Failed to load rewards.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRewardsData();
  }, [loadRewardsData]);

  // Current points balance
  const memberPoints = currentMember?.points ?? 0;

  // Handle Exchange
  const handleExchange = async (reward: Reward) => {
    if (memberPoints < reward.points_cost) return;

    setExchangingId(reward.id);
    setError(null);
    try {
      await api.exchangeReward(reward.id);
      await Promise.all([loadRewardsData(), fetchFamilyData()]);
    } catch (err: any) {
      console.error('Failed to exchange reward:', err);
      setError(err.message || 'Failed to exchange reward.');
    } finally {
      setExchangingId(null);
    }
  };

  // Handle Fulfill / Remove IOU (Adult/Admin only)
  const handleFulfill = async (exchangeId: string) => {
    setFulfillingId(exchangeId);
    setError(null);
    try {
      await api.fulfillRewardExchange(exchangeId);
      await Promise.all([loadRewardsData(), fetchFamilyData()]);
    } catch (err: any) {
      console.error('Failed to fulfill reward:', err);
      setError(err.message || 'Failed to fulfill reward.');
    } finally {
      setFulfillingId(null);
    }
  };

  // Group exchanges by member for Adults/Admins view
  const exchangesByMember = useMemo(() => {
    const map = new Map<string, { memberName: string; memberColor?: string; items: RewardExchange[] }>();

    for (const exc of exchanges) {
      const mId = exc.member_id || 'unknown';
      const mName = exc.member_name || members.find((m) => m.id === mId)?.name || 'Member';
      const mColor = exc.member_color || members.find((m) => m.id === mId)?.color || '#3b82f6';

      if (!map.has(mId)) {
        map.set(mId, { memberName: mName, memberColor: mColor, items: [] });
      }
      map.get(mId)!.items.push(exc);
    }

    return Array.from(map.values());
  }, [exchanges, members]);

  return (
    <div id="rewards-view-container" className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-5 pb-24 md:pb-12">
      {/* 1. TOP HEADER & COMPACT POINTS BAR */}
      <div className="flex items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200/90 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight font-serif">Rewards</h1>
          <p className="text-xs text-gray-500 font-medium">Earn points from tasks and exchange them for rewards</p>
        </div>

        {/* Adult/Admin "+" Button for Rewards */}
        {isAdultOrAdmin && (
          <button
            type="button"
            id="btn-add-reward"
            onClick={() => {
              setEditingReward(null);
              setIsRewardModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Create Reward</span>
          </button>
        )}
      </div>

      {/* Member Compact Points Balance Row */}
      <div id="member-points-row" className="bg-amber-50/80 border border-amber-200/80 rounded-xl px-4 py-3 flex items-center justify-between shadow-2xs">
        <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">Member Balance</span>
        <span className="text-sm sm:text-base font-bold text-amber-900 flex items-center gap-1.5">
          <span>⭐</span>
          <span>{memberPoints} points</span>
        </span>
      </div>

      {error && (
        <div className="p-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. AVAILABLE REWARDS (For Members and Adults) */}
      <div id="section-available-rewards" className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-gray-500 tracking-wider uppercase">AVAILABLE</h2>
          {isAdultOrAdmin && (
            <button
              type="button"
              id="btn-add-reward-available"
              onClick={() => {
                setEditingReward(null);
                setIsRewardModalOpen(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Reward</span>
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-xs text-gray-400 font-medium bg-white rounded-xl border border-gray-200/90">
            Loading available rewards...
          </div>
        ) : rewards.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500 font-medium bg-white rounded-xl border border-gray-200/90">
            No rewards available yet.
          </div>
        ) : (
          <div className="space-y-2">
            {rewards
              .filter((r) => isAdultOrAdmin || r.is_enabled)
              .map((reward) => {
                const canAfford = memberPoints >= reward.points_cost;
                const isExchanging = exchangingId === reward.id;

                return (
                  <div
                    key={reward.id}
                    id={`reward-item-${reward.id}`}
                    className={`bg-white rounded-xl border border-gray-200/90 px-4 py-3 shadow-2xs flex items-center justify-between gap-3 ${
                      !reward.is_enabled ? 'opacity-60 bg-gray-50' : ''
                    }`}
                  >
                    {/* Left: Icon, Name & Description */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {reward.icon && <span className="text-base shrink-0">{reward.icon}</span>}
                        <h3 className="text-sm font-bold text-gray-900 truncate tracking-tight">{reward.name}</h3>
                        {!reward.is_enabled && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500 rounded-md border border-gray-200">
                            Disabled
                          </span>
                        )}
                      </div>
                      {reward.description && (
                        <p className="text-xs text-gray-500 font-medium pt-0.5 truncate">{reward.description}</p>
                      )}
                    </div>

                    {/* Right: Points Cost & Exchange/Edit Button */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs sm:text-sm font-bold text-amber-900 bg-amber-50 border border-amber-200/70 px-2.5 py-1 rounded-lg">
                        {reward.points_cost} pts
                      </span>

                      {/* Member Exchange Button */}
                      <button
                        type="button"
                        id={`btn-exchange-${reward.id}`}
                        onClick={() => handleExchange(reward)}
                        disabled={!canAfford || isExchanging || !reward.is_enabled}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer ${
                          canAfford && reward.is_enabled
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                        }`}
                      >
                        {isExchanging ? 'Exchanging...' : 'Exchange'}
                      </button>

                      {/* Adult Edit Button */}
                      {isAdultOrAdmin && (
                        <button
                          type="button"
                          id={`btn-edit-reward-${reward.id}`}
                          onClick={() => {
                            setEditingReward(reward);
                            setIsRewardModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* 3. MY REWARDS / OUTSTANDING IOUS */}
      {!isAdultOrAdmin ? (
        /* Member View: "MY REWARDS" */
        <div id="section-my-rewards" className="space-y-2 pt-2">
          <h2 className="text-xs font-bold text-gray-500 tracking-wider uppercase px-1">MY REWARDS</h2>

          {exchanges.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-500 font-medium bg-white rounded-xl border border-gray-200/90">
              You have no outstanding exchanged rewards.
            </div>
          ) : (
            <div className="space-y-2">
              {exchanges.map((exc) => {
                const owedText = formatOwedDetail(exc.reward_description, exc.quantity, exc.reward_name);

                return (
                  <div
                    key={exc.id}
                    id={`my-iou-${exc.id}`}
                    className="bg-white rounded-xl border border-gray-200/90 px-4 py-3 shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-gray-900 truncate tracking-tight">
                        {exc.reward_name}
                      </h3>
                      <p className="text-xs text-gray-500 font-medium pt-0.5">
                        {owedText}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <span className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg">
                        ×{exc.quantity}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Adult / Admin View: "MEMBERS' REWARDS" / OUTSTANDING IOUs */
        <div id="section-adult-iou-management" className="space-y-3 pt-2">
          <h2 className="text-xs font-bold text-gray-500 tracking-wider uppercase px-1">MEMBERS' REWARDS</h2>

          {exchangesByMember.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-500 font-medium bg-white rounded-xl border border-gray-200/90">
              No outstanding rewards IOUs to fulfill.
            </div>
          ) : (
            <div className="space-y-4">
              {exchangesByMember.map((group) => (
                <div key={group.memberName} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: group.memberColor || '#3b82f6' }}
                    />
                    <h3 className="text-xs font-bold text-gray-700">{group.memberName}</h3>
                  </div>

                  <div className="space-y-2">
                    {group.items.map((exc) => {
                      const owedText = formatOwedDetail(exc.reward_description, exc.quantity, exc.reward_name);
                      const isFulfilling = fulfillingId === exc.id;

                      return (
                        <div
                          key={exc.id}
                          id={`admin-iou-${exc.id}`}
                          className="bg-white rounded-xl border border-gray-200/90 px-4 py-3 shadow-2xs flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-gray-900 truncate tracking-tight">
                                {exc.reward_name}
                              </h4>
                              <span className="px-2 py-0.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-md">
                                ×{exc.quantity}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 font-medium pt-0.5">
                              {owedText}
                            </p>
                          </div>

                          <button
                            type="button"
                            id={`btn-fulfill-${exc.id}`}
                            onClick={() => handleFulfill(exc.id)}
                            disabled={isFulfilling}
                            className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 border border-rose-200/80 bg-rose-50/50 hover:bg-rose-100/60 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            {isFulfilling ? 'Fulfilling...' : 'Remove'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reward Creation/Editing Modal */}
      <RewardModal
        isOpen={isRewardModalOpen}
        onClose={() => setIsRewardModalOpen(false)}
        reward={editingReward}
        onSaved={loadRewardsData}
      />
    </div>
  );
};
