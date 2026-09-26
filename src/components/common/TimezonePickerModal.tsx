import React, { useState, useMemo } from 'react';
import { Search, X, Check, Clock, Globe } from 'lucide-react';
import {
  UTC_OFFSET_OPTIONS,
  UtcOffsetOption,
  formatTimeInTimezone,
  parseUtcOffsetMinutes,
  formatUtcOffsetLabel,
} from '../../utils/timezoneData';

interface TimezonePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTimezone: string;
  onSelectTimezone: (tzOffsetLabel: string) => void;
  title?: string;
  subtitle?: string;
}

export const TimezonePickerModal: React.FC<TimezonePickerModalProps> = ({
  isOpen,
  onClose,
  selectedTimezone,
  onSelectTimezone,
  title = 'Timezone',
  subtitle = 'Select a UTC offset for displaying calendar times',
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const selectedMinutes = parseUtcOffsetMinutes(selectedTimezone);
  const selectedLabel = formatUtcOffsetLabel(selectedMinutes);

  const filteredOffsets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return UTC_OFFSET_OPTIONS;

    return UTC_OFFSET_OPTIONS.filter((opt) => {
      const labelNorm = opt.label.toLowerCase();
      const rawNum = opt.label.replace(/[^0-9+-:]/g, '');
      return (
        labelNorm.includes(q) ||
        rawNum.includes(q) ||
        String(opt.offsetMinutes).includes(q)
      );
    });
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleSelect = (opt: UtcOffsetOption) => {
    onSelectTimezone(opt.label);
    onClose();
    setSearchQuery('');
  };

  const handleModalClose = () => {
    onClose();
    setSearchQuery('');
  };

  const now = new Date();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={handleModalClose}
    >
      <div
        id="timezone-picker-modal-dialog"
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shadow-2xs">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
                {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={handleModalClose}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative mt-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search UTC offset (e.g. +10, -7, 5:30)..."
              className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Offsets List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 divide-y divide-gray-50">
          {filteredOffsets.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
              <p className="text-xs font-semibold">No offsets found matching "{searchQuery}"</p>
              <p className="text-[11px] text-gray-400 mt-1">Try searching +10, -7, or 5:30</p>
            </div>
          ) : (
            filteredOffsets.map((opt) => {
              const isSelected = opt.offsetMinutes === selectedMinutes || opt.label === selectedLabel;
              const currentTimeStr = formatTimeInTimezone(now, opt.offsetMinutes);

              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-blue-50/80 border border-blue-200/80 text-blue-900 shadow-2xs'
                      : 'hover:bg-gray-50 border border-transparent hover:border-gray-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span
                      className={`px-2.5 py-1 rounded-xl text-xs font-black tracking-wider shrink-0 shadow-2xs ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-700 text-slate-700'
                      }`}
                    >
                      {opt.label}
                    </span>

                    <span className="text-xs font-semibold text-slate-600">
                      {opt.offsetMinutes === 0
                        ? 'Coordinated Universal Time (UTC)'
                        : `${opt.offsetMinutes > 0 ? '+' : ''}${Math.floor(opt.offsetMinutes / 60)}h ${
                            opt.offsetMinutes % 60 !== 0 ? `${Math.abs(opt.offsetMinutes % 60)}m` : ''
                          }`}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-end gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{currentTimeStr}</span>
                      </div>
                    </div>

                    {isSelected ? (
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border border-gray-200 group-hover:border-blue-300 opacity-0 group-hover:opacity-100 transition-all" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
