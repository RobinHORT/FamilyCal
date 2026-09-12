import React from 'react';
import { format } from 'date-fns';
import { CalendarEvent, EventType, FamilyMember } from '../../types';
import { getEventAssignmentInfo, getEventTypeInfo, getPastelColorInfo } from '../../utils/colors';
import { Users, Clock, MapPin, Repeat, Globe } from 'lucide-react';

interface EventCardProps {
  event: CalendarEvent;
  members: FamilyMember[];
  eventTypes?: EventType[];
  onClick?: () => void;
  className?: string;
  showDescription?: boolean;
  showLocation?: boolean;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  members,
  eventTypes,
  onClick,
  className = '',
  showDescription = false,
  showLocation = true,
}) => {
  const assignmentInfo = getEventAssignmentInfo(event, members);
  const eventType = getEventTypeInfo(event.title, event.event_type, eventTypes);

  const startD = new Date(event.start_time);
  const endD = new Date(event.end_time);
  const isGoogle = event.google_event_id || event.calendar_source === 'google';

  return (
    <div
      onClick={onClick}
      style={{
        background: assignmentInfo.isFamilyEvent
          ? assignmentInfo.segmentedGradient
          : assignmentInfo.primaryColorInfo.hex,
        borderColor: assignmentInfo.borderHex,
      }}
      className={`relative p-3.5 sm:p-4 rounded-2xl border shadow-2xs hover:shadow-md active:scale-99 transition-all cursor-pointer flex flex-col justify-between gap-2.5 group overflow-hidden ${className}`}
    >
      {/* Visible boundary dividers for multi-colour Family event card */}
      {assignmentInfo.isFamilyEvent && (
        <div className="absolute inset-0 flex pointer-events-none rounded-[inherit] overflow-hidden -z-0">
          {assignmentInfo.participatingMembers.map((m, idx) => (
            <div
              key={m.id || idx}
              className="flex-1 h-full border-r border-black/8 last:border-r-0"
            />
          ))}
        </div>
      )}

      {/* Card Header: Member / Family Label + Event Type Badge */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {assignmentInfo.isFamilyEvent ? (
            <>
              {/* Administrator colour reference avatar */}
              <div
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-2xs shrink-0"
                style={{ backgroundColor: assignmentInfo.adminColorInfo.dotHex }}
                title="Whole Family"
              >
                <Users className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <span className="text-xs font-extrabold text-slate-900 tracking-tight">
                Family
              </span>
              {/* Visual representation of all participating family members */}
              <div className="flex -space-x-1 items-center ml-0.5">
                {assignmentInfo.participatingMembers.map((m) => {
                  const mColor = getPastelColorInfo(m.color);
                  return (
                    <span
                      key={m.id}
                      title={m.name}
                      className="w-3.5 h-3.5 rounded-full border border-white/90 shadow-2xs shrink-0 flex items-center justify-center text-[7px] font-bold text-white"
                      style={{ backgroundColor: mColor.dotHex }}
                    >
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-2xs shrink-0"
                style={{ backgroundColor: assignmentInfo.primaryColorInfo.dotHex }}
              >
                {assignmentInfo.label.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-slate-800 tracking-tight truncate">
                {assignmentInfo.label}
              </span>
            </>
          )}
        </div>

        {/* Event Type Badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          {event.recurring_rule && event.recurring_rule !== 'none' && (
            <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/10 text-slate-800">
              <Repeat className="w-2.5 h-2.5" />
            </span>
          )}
          {isGoogle && (
            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-900">
              <Globe className="w-2.5 h-2.5" />
            </span>
          )}
          <div
            className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold text-white flex items-center gap-1 shadow-2xs"
            style={{ backgroundColor: eventType.bgHex }}
            title={eventType.name}
          >
            <span>{eventType.icon}</span>
            <span>{eventType.name}</span>
          </div>
        </div>
      </div>

      {/* Card Body: Title & Time */}
      <div className="relative z-10 flex flex-col">
        <h4 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-blue-900 transition-colors">
          {event.title}
        </h4>

        {showDescription && event.description && (
          <p className="text-xs text-slate-700 opacity-90 line-clamp-2 leading-relaxed mt-1">
            {event.description}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 opacity-90 mt-1">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 opacity-70" />
            <span>
              {event.all_day
                ? 'All Day'
                : `${format(startD, 'h:mm a')} – ${format(endD, 'h:mm a')}`}
            </span>
          </span>

          {showLocation && event.location && (
            <>
              <span className="opacity-40">•</span>
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 opacity-70" />
                <span className="truncate">{event.location}</span>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface EventPillProps {
  event: CalendarEvent;
  members: FamilyMember[];
  eventTypes?: EventType[];
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export const EventPill: React.FC<EventPillProps> = ({
  event,
  members,
  eventTypes,
  onClick,
  className = '',
}) => {
  const assignmentInfo = getEventAssignmentInfo(event, members);
  const eventType = getEventTypeInfo(event.title, event.event_type, eventTypes);

  return (
    <div
      onClick={onClick}
      style={{
        background: assignmentInfo.isFamilyEvent
          ? assignmentInfo.segmentedGradient
          : assignmentInfo.primaryColorInfo.hex,
        borderColor: assignmentInfo.borderHex,
      }}
      className={`relative px-1.5 py-0.5 rounded-md border text-[11px] font-bold text-slate-900 truncate flex items-center gap-1 shadow-2xs hover:shadow-xs transition-shadow cursor-pointer overflow-hidden ${className}`}
      title={`${event.title} (${assignmentInfo.label} • ${eventType.name})`}
    >
      {/* Divided boundary lines for family events on small pills */}
      {assignmentInfo.isFamilyEvent && (
        <div className="absolute inset-0 flex pointer-events-none rounded-[inherit] overflow-hidden -z-0">
          {assignmentInfo.participatingMembers.map((m, idx) => (
            <div
              key={m.id || idx}
              className="flex-1 h-full border-r border-black/8 last:border-r-0"
            />
          ))}
        </div>
      )}

      {/* Event Category Icon */}
      <span
        className="relative z-10 w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center text-[8px] text-white shadow-2xs"
        style={{ backgroundColor: eventType.bgHex }}
        title={eventType.name}
      >
        {eventType.icon}
      </span>

      {/* Event Title */}
      <span className="relative z-10 truncate font-extrabold text-slate-900 leading-none">
        {event.title}
      </span>
    </div>
  );
};
