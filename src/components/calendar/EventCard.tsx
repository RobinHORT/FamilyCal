import React from 'react';
import { format } from 'date-fns';
import { CalendarEvent, EventType, FamilyMember, Task } from '../../types';
import { getEventAssignmentInfo, getEventTypeInfo, getPastelColorInfo } from '../../utils/colors';
import { useCalendar } from '../../context/CalendarContext';
import { formatTimeInTimezone } from '../../utils/timezoneData';
import { Users, Clock, MapPin, Repeat, Globe, CheckCircle2, Circle } from 'lucide-react';

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
  const { viewingTimezone } = useCalendar();
  const assignmentInfo = getEventAssignmentInfo(event, members);
  const eventType = getEventTypeInfo(event.title, event.event_type, eventTypes);

  const startFormatted = formatTimeInTimezone(event.start_time, viewingTimezone);
  const endFormatted = formatTimeInTimezone(event.end_time, viewingTimezone);
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
      className={`relative p-3.5 sm:p-4 rounded-2xl border shadow-2xs hover:shadow-md active:scale-99 transition-all cursor-pointer flex flex-col justify-between gap-2.5 group overflow-hidden w-full max-w-full min-w-0 box-border ${className}`}
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
      <div className="relative z-10 flex items-center justify-between gap-2 w-full max-w-full min-w-0 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-full">
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
              <span className="text-xs font-extrabold text-slate-900 tracking-tight shrink-0">
                Family
              </span>
              {/* Visual representation of all participating family members */}
              <div className="flex -space-x-1 items-center ml-0.5 shrink-0">
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
                {assignmentInfo.singleMember
                  ? assignmentInfo.singleMember.name.slice(0, 1).toUpperCase()
                  : assignmentInfo.label.includes('🎂') || assignmentInfo.label.toLowerCase().includes('birthday')
                  ? '🎂'
                  : assignmentInfo.label.includes('🗑️') || assignmentInfo.label.toLowerCase().includes('bin')
                  ? '🗑️'
                  : assignmentInfo.label.includes('🇦🇺') || assignmentInfo.label.toLowerCase().includes('holiday')
                  ? '🏖️'
                  : assignmentInfo.label.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-slate-800 tracking-tight truncate min-w-0 flex-1">
                {assignmentInfo.label}
              </span>
            </>
          )}
        </div>

        {/* Event Type Badge */}
        <div className="flex items-center gap-1.5 shrink-0 max-w-full">
          {event.recurring_rule && event.recurring_rule !== 'none' && (
            <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/10 text-slate-800 shrink-0">
              <Repeat className="w-2.5 h-2.5" />
            </span>
          )}
          {isGoogle && (
            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-900 shrink-0">
              <Globe className="w-2.5 h-2.5" />
            </span>
          )}
          <div
            className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold text-white flex items-center gap-1 shadow-2xs max-w-[140px] sm:max-w-none min-w-0"
            style={{ backgroundColor: eventType.bgHex }}
            title={eventType.name}
          >
            <span className="shrink-0">{eventType.icon}</span>
            <span className="truncate">{eventType.name}</span>
          </div>
        </div>
      </div>

      {/* Card Body: Title & Time */}
      <div className="relative z-10 flex flex-col min-w-0 w-full max-w-full">
        <h4 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-blue-900 transition-colors w-full min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
          {event.title}
        </h4>

        {showDescription && event.description && (
          <p className="text-xs text-slate-700 opacity-90 line-clamp-2 leading-relaxed mt-1 w-full min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
            {event.description}
          </p>
        )}

        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs font-semibold text-slate-700 opacity-90 mt-1 w-full min-w-0 max-w-full">
          <span className="flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3 opacity-70 shrink-0" />
            <span className="whitespace-nowrap">
              {event.all_day
                ? 'All Day'
                : `${startFormatted} – ${endFormatted}`}
            </span>
          </span>

          {showLocation && event.location && (
            <>
              <span className="opacity-40 hidden sm:inline shrink-0">•</span>
              <span className="flex items-center gap-1 min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                <MapPin className="w-3 h-3 opacity-70 shrink-0" />
                <span className="truncate break-words [overflow-wrap:anywhere]">{event.location}</span>
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
  showTitle?: boolean;
  isMultiDayStart?: boolean;
  isMultiDayMiddle?: boolean;
  isMultiDayEnd?: boolean;
  isStartOfWeek?: boolean;
  isEndOfWeek?: boolean;
}

export const EventPill: React.FC<EventPillProps> = ({
  event,
  members,
  eventTypes,
  onClick,
  className = '',
  showTitle = true,
  isMultiDayStart = false,
  isMultiDayMiddle = false,
  isMultiDayEnd = false,
  isStartOfWeek = false,
  isEndOfWeek = false,
}) => {
  const assignmentInfo = getEventAssignmentInfo(event, members);
  const eventType = getEventTypeInfo(event.title, event.event_type, eventTypes);

  const isMultiDay = isMultiDayStart || isMultiDayMiddle || isMultiDayEnd || isStartOfWeek || isEndOfWeek;

  let roundedClasses = 'rounded-md';
  let borderClasses = 'border';
  let marginClasses = '';

  if (isMultiDay) {
    if (isMultiDayMiddle) {
      roundedClasses = 'rounded-none';
      borderClasses = 'border-y border-x-0';
      marginClasses = '-mx-[5px] sm:-mx-[7px] z-10';
    } else if (isMultiDayStart && isMultiDayEnd) {
      roundedClasses = 'rounded-md';
      marginClasses = '';
    } else if (isMultiDayStart) {
      roundedClasses = isStartOfWeek ? 'rounded-none' : 'rounded-l-md rounded-r-none';
      borderClasses = isStartOfWeek ? 'border-y border-x-0' : 'border-y border-l border-r-0';
      marginClasses = '-mr-[5px] sm:-mr-[7px] z-10';
    } else if (isMultiDayEnd) {
      roundedClasses = isEndOfWeek ? 'rounded-none' : 'rounded-r-md rounded-l-none';
      borderClasses = isEndOfWeek ? 'border-y border-x-0' : 'border-y border-r border-l-0';
      marginClasses = '-ml-[5px] sm:-ml-[7px] z-10';
    }
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: assignmentInfo.isFamilyEvent
          ? assignmentInfo.segmentedGradient
          : assignmentInfo.primaryColorInfo.hex,
        borderColor: assignmentInfo.borderHex,
      }}
      className={`relative px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-slate-900 truncate flex items-center gap-1 shadow-2xs hover:shadow-xs transition-shadow overflow-hidden h-5 sm:h-5.5 ${
        onClick ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'
      } ${roundedClasses} ${borderClasses} ${marginClasses} ${className}`}
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

      {showTitle && (
        <span className="relative z-10 truncate font-extrabold text-slate-900 leading-none">
          {event.title} {isStartOfWeek && !isMultiDayStart ? '(cont.)' : ''}
        </span>
      )}
    </div>
  );
};

export interface MultiDayEventBarProps {
  event: CalendarEvent;
  startCol: number;
  endCol: number;
  spanCount: number;
  isStartOfWeek: boolean;
  isEndOfWeek: boolean;
  members: FamilyMember[];
  eventTypes?: EventType[];
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export const MultiDayEventBar: React.FC<MultiDayEventBarProps> = ({
  event,
  startCol,
  endCol,
  spanCount,
  isStartOfWeek,
  isEndOfWeek,
  members,
  eventTypes,
  onClick,
  className = '',
}) => {
  const assignmentInfo = getEventAssignmentInfo(event, members);
  const eventType = getEventTypeInfo(event.title, event.event_type, eventTypes);

  // Rounding matches Google Calendar continuous multi-day pills across week boundaries
  let roundedClass = 'rounded-md';
  if (spanCount > 1 || isStartOfWeek || isEndOfWeek) {
    if (isStartOfWeek && isEndOfWeek) {
      roundedClass = 'rounded-none';
    } else if (isStartOfWeek) {
      roundedClass = 'rounded-r-md rounded-l-none';
    } else if (isEndOfWeek) {
      roundedClass = 'rounded-l-md rounded-r-none';
    } else {
      roundedClass = 'rounded-md';
    }
  }

  // Google Calendar title rule: title only appears on the first segment
  const isFirstSegment = !isStartOfWeek;

  return (
    <div
      onClick={onClick}
      style={{
        gridColumnStart: startCol + 1,
        gridColumnEnd: endCol + 2,
        background: assignmentInfo.isFamilyEvent
          ? assignmentInfo.segmentedGradient
          : assignmentInfo.primaryColorInfo.hex,
        borderColor: assignmentInfo.borderHex,
      }}
      className={`relative h-5 sm:h-5.5 flex items-center select-none group z-10 border shadow-2xs hover:shadow-xs transition-shadow ${roundedClass} ${
        onClick ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'
      } ${className}`}
      title={`${event.title} (${assignmentInfo.label} • ${eventType.name})`}
    >
      {/* Visual boundary lines for multi-member family event */}
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

      {/* Title Layer: displayed only on the first segment */}
      {isFirstSegment && (
        <div className="relative z-10 px-1.5 sm:px-2 w-full truncate font-extrabold text-slate-900 text-[10px] sm:text-[11px] leading-none">
          {event.title}
        </div>
      )}
    </div>
  );
};

export interface MultiDayTaskBarProps {
  task: Task;
  startCol: number;
  endCol: number;
  spanCount: number;
  isStartOfWeek: boolean;
  isEndOfWeek: boolean;
  members: FamilyMember[];
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export const MultiDayTaskBar: React.FC<MultiDayTaskBarProps> = ({
  task,
  startCol,
  endCol,
  spanCount,
  isStartOfWeek,
  isEndOfWeek,
  members,
  onClick,
  className = '',
}) => {
  const assignmentInfo = getEventAssignmentInfo(task as any, members);

  // Rounding matches Google Calendar continuous multi-day pills across week boundaries
  let roundedClass = 'rounded-md';
  if (spanCount > 1 || isStartOfWeek || isEndOfWeek) {
    if (isStartOfWeek && isEndOfWeek) {
      roundedClass = 'rounded-none';
    } else if (isStartOfWeek) {
      roundedClass = 'rounded-r-md rounded-l-none';
    } else if (isEndOfWeek) {
      roundedClass = 'rounded-l-md rounded-r-none';
    } else {
      roundedClass = 'rounded-md';
    }
  }

  // Google Calendar title rule: title only appears on the first segment
  const isFirstSegment = !isStartOfWeek;

  return (
    <div
      onClick={onClick}
      style={{
        gridColumnStart: startCol + 1,
        gridColumnEnd: endCol + 2,
        background: assignmentInfo.isFamilyEvent
          ? assignmentInfo.segmentedGradient
          : assignmentInfo.primaryColorInfo.hex,
        borderColor: assignmentInfo.borderHex,
      }}
      className={`relative h-5 sm:h-5.5 flex items-center select-none group z-10 border shadow-2xs hover:shadow-xs transition-shadow ${roundedClass} ${
        task.completed ? 'opacity-75' : ''
      } ${
        onClick ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'
      } ${className}`}
      title={`${task.title} (${assignmentInfo.label})`}
    >
      {/* Visual boundary lines for multi-member family task */}
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

      {/* Title & Checkbox Layer: displayed only on the first segment */}
      {isFirstSegment && (
        <div className="relative z-10 px-1.5 sm:px-2 w-full truncate font-extrabold text-slate-900 text-[10px] sm:text-[11px] leading-none flex items-center gap-1">
          <span className="shrink-0 p-0 text-slate-800">
            {task.completed ? (
              <CheckCircle2 className="w-2.5 h-2.5 fill-blue-600 text-white" />
            ) : (
              <Circle className="w-2.5 h-2.5 stroke-[2.2]" />
            )}
          </span>
          <span className={`truncate ${task.completed ? 'line-through text-slate-700' : 'text-slate-900'}`}>
            {task.title}
          </span>
        </div>
      )}
    </div>
  );
};
