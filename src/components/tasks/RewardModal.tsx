import React, { useState, useEffect } from 'react';
import { X, Trash2, Gift, Star } from 'lucide-react';
import { Reward } from '../../types';
import { api } from '../../api/client';

interface RewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  reward: Reward | null;
  onSaved: () => void;
}

export const RewardModal: React.FC<RewardModalProps> = ({
  isOpen,
  onClose,
  reward,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pointsCost, setPointsCost] = useState<number>(100);
  const [icon, setIcon] = useState('⭐');
  const [isEnabled, setIsEnabled] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (reward) {
      setName(reward.name);
      setDescription(reward.description || '');
      setPointsCost(reward.points_cost);
      setIcon(reward.icon || '⭐');
      setIsEnabled(Boolean(reward.is_enabled));
    } else {
      setName('');
      setDescription('');
      setPointsCost(300);
      setIcon('⭐');
      setIsEnabled(true);
    }
    setError(null);
  }, [isOpen, reward]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Reward name is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (reward) {
        await api.updateReward(reward.id, {
          name: name.trim(),
          description: description.trim() || null,
          points_cost: Math.max(0, pointsCost || 0),
          icon: icon.trim() || null,
          is_enabled: isEnabled,
        });
      } else {
        await api.createReward({
          name: name.trim(),
          description: description.trim() || undefined,
          points_cost: Math.max(0, pointsCost || 0),
          icon: icon.trim() || undefined,
          is_enabled: isEnabled,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to save reward:', err);
      setError(err.message || 'Failed to save reward.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!reward) return;
    if (!window.confirm(`Are you sure you want to delete "${reward.name}"? Existing IOUs will not be removed.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      await api.deleteReward(reward.id);
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete reward:', err);
      setError(err.message || 'Failed to delete reward.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-3xl border border-gray-200/90 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/60">
              <Gift className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-gray-900 font-serif">
              {reward ? 'Edit Reward' : 'New Reward'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
              {error}
            </div>
          )}

          {/* Reward Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Reward Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Device Time, $5 Money, Choose Movie"
              className="w-full px-3 py-2 text-xs font-medium border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 bg-white"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Description / Details
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 1 hour, $5, Choose a movie"
              className="w-full px-3 py-2 text-xs font-medium border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 bg-white"
            />
          </div>

          {/* Points Cost & Icon */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Points Cost *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={pointsCost}
                  onChange={(e) => setPointsCost(parseInt(e.target.value, 10) || 0)}
                  className="w-full pl-7 pr-3 py-2 text-xs font-bold border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 bg-white"
                  required
                />
                <Star className="w-3.5 h-3.5 text-amber-500 absolute left-2.5 top-2.5 fill-current" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Icon / Emoji
              </label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="⭐ or 📱 or 💵"
                className="w-full px-3 py-2 text-xs font-medium border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 bg-white"
              />
            </div>
          </div>

          {/* Enabled Toggle */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-gray-700">Available to members</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            {reward ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : reward ? 'Save Changes' : 'Create Reward'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
