import React, { useState } from 'react';
import { format, isToday, isTomorrow } from 'date-fns';
import { useCalendar } from '../../context/CalendarContext';
import { useFamily } from '../../context/FamilyContext';
import { CalendarEvent } from '../../types';
import { Search, Calendar as CalIcon, Plus } from 'lucide-react';
import { EventCard } from './EventCard';

export const AgendaView: React.FC = () => {
  const { filteredEvents, openEditEventModal, openCreateEventModal, eventTypes } = useCalendar();
  const { members } = useFamily();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter events based on search query
  const searchedEvents = filteredEvents.filter((evt) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      evt.title.toLowerCase().includes(query) ||
      (evt.description && evt.description.toLowerCase().includes(query)) ||
      (evt.location && evt.location.toLowerCase().includes(query))
    );
  });

  // Sort upcoming
  searchedEvents.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // Group by Day Date String (yyyy-MM-dd)
  const groupedEvents: Record<string, CalendarEvent[]> = {};
  for (const evt of searchedEvents) {
    const key = format(new Date(evt.start_time), 'yyyy-MM-dd');
    if (!groupedEvents[key]) {
      groupedEvents[key] = [];
    }
    groupedEvents[key].push(evt);
  }

  const dateKeys = Object.keys(groupedEvents);

  const getDayHeading = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEEE, MMMM d, yyyy');
  };

  return (
    <div id="calendar-agenda-view" className="flex flex-col flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
      {/* Search Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50/75 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="agenda-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search family events, places, notes..."
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-colors font-medium"
          />
        </div>

        <button
          onClick={() => openCreateEventModal()}
          className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Event</span>
        </button>
      </div>

      {/* Events Stream */}
      <div className="flex-1 overflow-y-auto max-h-[640px] p-4 pb-calendar-mobile md:pb-4 space-y-6 bg-white scrollbar-thin">
        {dateKeys.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <CalIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-600">No events found matching criteria.</p>
          </div>
        ) : (
          dateKeys.map((dateKey) => {
            const dayEvents = groupedEvents[dateKey];
            const dateObj = new Date(dateKey + 'T00:00:00');
            const isDayToday = isToday(dateObj);

            return (
              <div key={dateKey} className="space-y-2">
                {/* Date Group Heading */}
                <div className="flex items-center gap-2 sticky top-0 bg-white/95 backdrop-blur-xs py-1.5 z-10">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-xl ${
                      isDayToday ? 'bg-gray-900 text-white shadow-xs' : 'bg-gray-100 text-gray-800 border border-gray-200'
                    }`}
                  >
                    {getDayHeading(dateKey)}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">
                    {format(dateObj, 'MMM d, yyyy')}
                  </span>
                  <div className="flex-1 h-[1px] bg-gray-100" />
                </div>

                {/* Event Cards */}
                <div className="space-y-2.5 pl-1">
                  {dayEvents.map((evt) => (
                    <EventCard
                      key={evt.id}
                      event={evt}
                      members={members}
                      eventTypes={eventTypes}
                      onClick={() => openEditEventModal(evt)}
                      showDetails={true}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
