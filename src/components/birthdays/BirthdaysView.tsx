import React, { useState } from 'react';
import { useFamily } from '../../context/FamilyContext';
import { Cake, Calendar, Sparkles, Gift, Heart, User } from 'lucide-react';
import { format } from 'date-fns';

export const BirthdaysView: React.FC = () => {
  const { birthdays, members, updateMember } = useFamily();
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [newBirthdayDate, setNewBirthdayDate] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSetBirthday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId || !newBirthdayDate) return;

    setIsUpdating(true);
    try {
      await updateMember(selectedMemberId, { birthday: newBirthdayDate });
      setSelectedMemberId('');
      setNewBirthdayDate('');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div id="birthdays-view-container" className="flex flex-col flex-1 max-w-5xl mx-auto w-full space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#242C3D]/60">
        <div>
          <div className="flex items-center gap-2">
            <Cake className="w-6 h-6 text-[#FF4FA3]" />
            <h2 className="text-2xl font-bold text-white tracking-tight font-serif">
              Household Birthdays & Milestones
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Never miss a family birthday, anniversary, or special celebration.
          </p>
        </div>
      </div>

      {/* Set Birthday Form for Members Without Birthday */}
      <form
        onSubmit={handleSetBirthday}
        id="add-birthday-form"
        className="p-4 rounded-2xl bg-[#121620] border border-[#242C3D] shadow-md flex flex-wrap items-center gap-3"
      >
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <User className="w-4 h-4 text-[#FF4FA3]" />
          <select
            id="birthday-member-select"
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="w-full bg-[#1A202C] border border-[#242C3D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF4FA3]"
          >
            <option value="">Select Family Member...</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.birthday ? `(Current: ${m.birthday})` : '(No birthday set)'}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 min-w-[180px]">
          <Calendar className="w-4 h-4 text-[#FF4FA3]" />
          <input
            id="birthday-date-input"
            type="date"
            required
            value={newBirthdayDate}
            onChange={(e) => setNewBirthdayDate(e.target.value)}
            className="w-full bg-[#1A202C] border border-[#242C3D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF4FA3]"
          />
        </div>

        <button
          type="submit"
          id="birthday-save-btn"
          disabled={isUpdating || !selectedMemberId || !newBirthdayDate}
          className="px-5 py-2 rounded-xl bg-[#FF4FA3] hover:bg-[#e63e90] text-white text-xs font-bold transition-all shadow-md shadow-[#FF4FA3]/25 cursor-pointer disabled:opacity-50 shrink-0"
        >
          {isUpdating ? 'Saving...' : 'Set Birthday'}
        </button>
      </form>

      {/* Birthdays Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {birthdays.length === 0 ? (
          <div className="col-span-full p-12 text-center rounded-2xl bg-[#121620] border border-[#242C3D]/60 text-gray-500">
            <Gift className="w-10 h-10 mx-auto text-gray-600 mb-2" />
            <p className="text-sm font-semibold text-gray-300">No birthdays recorded yet.</p>
            <p className="text-xs text-gray-500 mt-1">
              Select a member above to add their birthday to the family calendar.
            </p>
          </div>
        ) : (
          birthdays.map((item) => {
            const isToday = item.days_until === 0;
            const isSoon = item.days_until > 0 && item.days_until <= 30;

            return (
              <div
                key={item.member_id}
                id={`birthday-card-${item.member_id}`}
                className={`p-5 rounded-3xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                  isToday
                    ? 'bg-gradient-to-br from-[#FF4FA3]/20 via-[#181F2E] to-[#121620] border-[#FF4FA3] shadow-lg shadow-[#FF4FA3]/20'
                    : isSoon
                    ? 'bg-[#121620] hover:bg-[#181F2E] border-[#FF4FA3]/40'
                    : 'bg-[#121620] hover:bg-[#181F2E] border-[#242C3D]'
                }`}
              >
                {/* Birthday Accent Pill */}
                {isToday && (
                  <div className="flex items-center gap-1 absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[#FF4FA3] text-white text-[10px] font-bold shadow-sm animate-pulse">
                    <Sparkles className="w-3 h-3" /> TODAY!
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold text-white shadow-md"
                    style={{ backgroundColor: item.color || '#FF4FA3' }}
                  >
                    {item.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{item.name}</h3>
                    <p className="text-xs text-gray-400 capitalize">{item.role}</p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-[#242C3D]/60 text-xs">
                  <div className="flex items-center justify-between text-gray-300">
                    <span className="text-gray-400">Birthday:</span>
                    <span className="font-semibold font-mono text-white">{item.birthday}</span>
                  </div>

                  {item.turning_age !== undefined && (
                    <div className="flex items-center justify-between text-gray-300">
                      <span className="text-gray-400">Turning:</span>
                      <span className="font-bold text-[#FF4FA3]">{item.turning_age} years old</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-gray-300">
                    <span className="text-gray-400">Countdown:</span>
                    <span
                      className={`font-semibold ${
                        isToday
                          ? 'text-[#FF4FA3] font-bold text-sm'
                          : isSoon
                          ? 'text-amber-400'
                          : 'text-gray-300'
                      }`}
                    >
                      {isToday
                        ? '🎉 Happy Birthday!'
                        : `${item.days_until} ${item.days_until === 1 ? 'day' : 'days'} away`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
