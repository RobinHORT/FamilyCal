import React from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCalendar } from '../../context/CalendarContext';

export const MiniCalendar: React.FC = () => {
  const { currentDate, setCurrentDate, events } = useCalendar();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  return (
    <div id="mini-calendar-widget" className="p-3 bg-[#121620] rounded-2xl border border-[#242C3D]/60 text-sm">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="font-semibold text-white tracking-wide">
          {format(currentDate, 'MMMM yyyy')}
        </span>
        <div className="flex items-center gap-1">
          <button
            id="mini-cal-prev-btn"
            onClick={prevMonth}
            className="p-1 rounded-lg hover:bg-[#1A202C] text-gray-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            id="mini-cal-next-btn"
            onClick={nextMonth}
            className="p-1 rounded-lg hover:bg-[#1A202C] text-gray-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
          <div key={idx} className="text-[11px] font-medium text-gray-500 py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isSelected = isSameDay(day, currentDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isCurrentToday = isToday(day);
          
          const hasEvents = events.some((evt) => {
            const evtDate = new Date(evt.start_time);
            return isSameDay(evtDate, day);
          });

          return (
            <button
              key={day.toISOString()}
              id={`mini-date-${format(day, 'yyyy-MM-dd')}`}
              onClick={() => setCurrentDate(day)}
              className={`relative h-8 w-8 mx-auto flex flex-col items-center justify-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#FF4FA3] text-white shadow-lg shadow-[#FF4FA3]/25 font-bold scale-105'
                  : isCurrentToday
                  ? 'border border-[#FF4FA3] text-[#FF4FA3] hover:bg-[#FF4FA3]/10'
                  : isCurrentMonth
                  ? 'text-gray-200 hover:bg-[#1A202C]'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              <span>{format(day, 'd')}</span>
              {hasEvents && !isSelected && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#FF4FA3]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
