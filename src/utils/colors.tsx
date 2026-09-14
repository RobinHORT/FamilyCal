import React from 'react';
import { Check } from 'lucide-react';
import { FamilyMember, CalendarEvent } from '../types';

export interface EventTypeInfo {
  id?: string;
  name: string;
  bgHex: string;
  textHex: string;
  icon: string;
}

export const PREDEFINED_EVENT_TYPES: EventTypeInfo[] = [
  { id: 'school', name: 'School', bgHex: '#EAB308', textHex: '#FFFFFF', icon: '🎓' },
  { id: 'sport', name: 'Sport', bgHex: '#3B82F6', textHex: '#FFFFFF', icon: '⚽' },
  { id: 'appointment', name: 'Appointment', bgHex: '#10B981', textHex: '#FFFFFF', icon: '🩺' },
  { id: 'work', name: 'Work', bgHex: '#F97316', textHex: '#FFFFFF', icon: '💼' },
  { id: 'birthday', name: 'Birthday', bgHex: '#EC4899', textHex: '#FFFFFF', icon: '🎁' },
  { id: 'holiday', name: 'Holiday', bgHex: '#8B5CF6', textHex: '#FFFFFF', icon: '🏖️' },
  { id: 'social', name: 'Social', bgHex: '#C084FC', textHex: '#FFFFFF', icon: '🍸' },
  { id: 'important', name: 'Important', bgHex: '#EF4444', textHex: '#FFFFFF', icon: '⚡' },
  { id: 'other', name: 'Other', bgHex: '#64748B', textHex: '#FFFFFF', icon: '⭐' },
];

export function getEventTypeInfo(
  title?: string,
  explicitType?: string,
  customTypes?: Array<{ id?: string; name: string; color: string; icon?: string }>
): EventTypeInfo {
  // 1. If explicitType is provided and customTypes exist, match against customTypes first
  if (explicitType && customTypes && customTypes.length > 0) {
    const matchedCustom = customTypes.find(
      (ct) => ct.name.toLowerCase() === explicitType.toLowerCase() || ct.id === explicitType
    );
    if (matchedCustom) {
      return {
        id: matchedCustom.id,
        name: matchedCustom.name,
        bgHex: matchedCustom.color,
        textHex: '#FFFFFF',
        icon: matchedCustom.icon || '⭐',
      };
    }
  }

  // 2. If explicitType is provided, match against predefined event types
  if (explicitType) {
    const matched = PREDEFINED_EVENT_TYPES.find(
      (dt) => dt.name.toLowerCase() === explicitType.toLowerCase() || dt.id === explicitType.toLowerCase()
    );
    if (matched) return matched;
  }

  // 3. Keyword matching for backwards compatibility / smart inference with existing events
  const t = (title || '').toLowerCase();
  if (t.includes('school') || t.includes('excursion') || t.includes('class') || t.includes('homework') || t.includes('exam')) {
    return PREDEFINED_EVENT_TYPES[0]; // School (Yellow)
  }
  if (t.includes('sport') || t.includes('football') || t.includes('basketball') || t.includes('match') || t.includes('training') || t.includes('soccer') || t.includes('tennis') || t.includes('dance') || t.includes('swim')) {
    if (t.includes('dance')) return { ...PREDEFINED_EVENT_TYPES[1], icon: '🎵' };
    return PREDEFINED_EVENT_TYPES[1]; // Sport (Blue)
  }
  if (t.includes('doctor') || t.includes('appointment') || t.includes('dentist') || t.includes('clinic') || t.includes('checkup')) {
    return PREDEFINED_EVENT_TYPES[2]; // Appointment (Green)
  }
  if (t.includes('work') || t.includes('meeting') || t.includes('client') || t.includes('presentation')) {
    return PREDEFINED_EVENT_TYPES[3]; // Work (Orange)
  }
  if (t.includes('birthday') || t.includes('party')) {
    return PREDEFINED_EVENT_TYPES[4]; // Birthday (Pink)
  }
  if (t.includes('holiday') || t.includes('trip') || t.includes('fishing') || t.includes('vacation') || t.includes('camp')) {
    return PREDEFINED_EVENT_TYPES[5]; // Holiday (Purple)
  }
  if (t.includes('social') || t.includes('lunch') || t.includes('gaming') || t.includes('friends') || t.includes('dinner') || t.includes('family time')) {
    return PREDEFINED_EVENT_TYPES[6]; // Social (Lilac)
  }
  if (t.includes('important') || t.includes('urgent') || t.includes('tax') || t.includes('deadline')) {
    return PREDEFINED_EVENT_TYPES[7]; // Important (Red)
  }

  // Default: Other (Grey)
  return PREDEFINED_EVENT_TYPES[8];
}

export interface PastelColor {
  id: string;
  name: string;
  hex: string;
  textHex: string;
  borderHex: string;
  dotHex: string;
  bgSoft: string;
}

export const PASTEL_COLORS: PastelColor[] = [
  {
    id: 'pastel-pink',
    name: 'Pastel Pink',
    hex: '#F8BBD0',
    textHex: '#831843',
    borderHex: '#F472B6',
    dotHex: '#DB2777',
    bgSoft: '#FDF2F8',
  },
  {
    id: 'soft-rose',
    name: 'Soft Rose',
    hex: '#F5C2C7',
    textHex: '#881337',
    borderHex: '#FB7185',
    dotHex: '#E11D48',
    bgSoft: '#FFF1F2',
  },
  {
    id: 'peach',
    name: 'Peach',
    hex: '#FFD1B3',
    textHex: '#7C2D12',
    borderHex: '#FB923C',
    dotHex: '#EA580C',
    bgSoft: '#FFF7ED',
  },
  {
    id: 'soft-apricot',
    name: 'Soft Apricot',
    hex: '#FFD8A8',
    textHex: '#78350F',
    borderHex: '#FBBF24',
    dotHex: '#D97706',
    bgSoft: '#FFFBEB',
  },
  {
    id: 'butter-yellow',
    name: 'Butter Yellow',
    hex: '#FFF0B3',
    textHex: '#713F12',
    borderHex: '#FACC15',
    dotHex: '#CA8A04',
    bgSoft: '#FEFCE8',
  },
  {
    id: 'pastel-lemon',
    name: 'Pastel Lemon',
    hex: '#FFF4C2',
    textHex: '#713F12',
    borderHex: '#FDE047',
    dotHex: '#EAB308',
    bgSoft: '#FEFCE8',
  },
  {
    id: 'mint',
    name: 'Mint',
    hex: '#BFE8D0',
    textHex: '#064E3B',
    borderHex: '#34D399',
    dotHex: '#059669',
    bgSoft: '#ECFDF5',
  },
  {
    id: 'soft-sage',
    name: 'Soft Sage',
    hex: '#C9E4C5',
    textHex: '#14532D',
    borderHex: '#4ADE80',
    dotHex: '#16A34A',
    bgSoft: '#F0FDF4',
  },
  {
    id: 'pastel-aqua',
    name: 'Pastel Aqua',
    hex: '#BFE7E5',
    textHex: '#134E4A',
    borderHex: '#2DD4BF',
    dotHex: '#0D9488',
    bgSoft: '#F0FDFA',
  },
  {
    id: 'powder-blue',
    name: 'Powder Blue',
    hex: '#BDD7F2',
    textHex: '#1E3A8A',
    borderHex: '#60A5FA',
    dotHex: '#2563EB',
    bgSoft: '#EFF6FF',
  },
  {
    id: 'periwinkle',
    name: 'Periwinkle',
    hex: '#C7CCF5',
    textHex: '#312E81',
    borderHex: '#818CF8',
    dotHex: '#4F46E5',
    bgSoft: '#EEF2FF',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    hex: '#D8C7F2',
    textHex: '#4C1D95',
    borderHex: '#A78BFA',
    dotHex: '#7C3AED',
    bgSoft: '#F5F3FF',
  },
  {
    id: 'lilac-pink',
    name: 'Lilac Pink',
    hex: '#E8C7E8',
    textHex: '#581C87',
    borderHex: '#C084FC',
    dotHex: '#9333EA',
    bgSoft: '#FAF5FF',
  },
  {
    id: 'soft-sand',
    name: 'Soft Sand',
    hex: '#E8D5C4',
    textHex: '#451A03',
    borderHex: '#D6D3D1',
    dotHex: '#78716C',
    bgSoft: '#FAFAF9',
  },
  {
    id: 'mist-grey',
    name: 'Mist Grey',
    hex: '#D9DEE5',
    textHex: '#1E293B',
    borderHex: '#94A3B8',
    dotHex: '#475569',
    bgSoft: '#F8FAFC',
  },
];

export const DEFAULT_PASTEL_COLOR = PASTEL_COLORS[0]; // Pastel Pink

let currentGlobalColorSoftness = 0;

export function setGlobalColorSoftness(softness: number) {
  if (typeof softness === 'number' && !isNaN(softness)) {
    currentGlobalColorSoftness = Math.max(0, Math.min(100, Math.round(softness)));
  }
}

export function getGlobalColorSoftness(): number {
  return currentGlobalColorSoftness;
}

export function parseHex(hexStr: string): { r: number; g: number; b: number } | null {
  if (!hexStr) return null;
  let hex = hexStr.replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) return null;
  const num = parseInt(hex, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function interpolateColor(color1: string, color2: string, factor: number = 0): string {
  if (factor <= 0) return color1;
  if (factor >= 1) return color2;

  const c1 = parseHex(color1);
  const c2 = parseHex(color2);

  if (!c1 || !c2) return color1;

  const r = Math.round(c1.r + (c2.r - c1.r) * factor);
  const g = Math.round(c1.g + (c2.g - c1.g) * factor);
  const b = Math.round(c1.b + (c2.b - c1.b) * factor);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

/**
 * Returns raw unsoftened base color info for a color string.
 */
export function getBasePastelColorInfo(colorStr?: string | null): PastelColor {
  if (!colorStr) return DEFAULT_PASTEL_COLOR;
  
  const normalized = colorStr.toUpperCase();
  const matched = PASTEL_COLORS.find(
    (c) => c.hex.toUpperCase() === normalized || c.name.toLowerCase() === colorStr.toLowerCase()
  );
  
  if (matched) return matched;

  // Map legacy saturated colors to closest pastel
  const legacyMap: Record<string, number> = {
    '#FF4FA3': 0, // Pastel Pink
    '#EC4899': 1, // Soft Rose
    '#F59E0B': 2, // Peach
    '#EF4444': 1, // Soft Rose
    '#10B981': 6, // Mint
    '#06B6D4': 8, // Pastel Aqua
    '#3B82F6': 9, // Powder Blue
    '#8B5CF6': 11, // Lavender
    '#4285F4': 9, // Powder Blue
  };

  if (legacyMap[normalized] !== undefined) {
    return PASTEL_COLORS[legacyMap[normalized]];
  }

  // Fallback custom color object with dark readable text
  return {
    id: 'custom',
    name: 'Custom',
    hex: colorStr,
    textHex: '#0F172A',
    borderHex: '#CBD5E1',
    dotHex: colorStr,
    bgSoft: colorStr,
  };
}

/**
 * Returns color info for any color string, dynamically interpolated according to the global Member Colour Softness level.
 * At 0% softness, returns solid hex. At 100% softness, returns soft pastel bgSoft.
 */
export function getPastelColorInfo(colorStr?: string | null, softnessOverride?: number): PastelColor {
  const base = getBasePastelColorInfo(colorStr);
  const softness = softnessOverride !== undefined ? softnessOverride : getGlobalColorSoftness();

  if (softness <= 0) {
    return base;
  }

  const factor = Math.max(0, Math.min(1, softness / 100));
  const interpolatedHex = interpolateColor(base.hex, base.bgSoft, factor);
  const interpolatedBgSoft = interpolateColor(base.bgSoft, base.bgSoft, factor);
  const interpolatedBorder = interpolateColor(base.borderHex, base.bgSoft, factor * 0.4);

  return {
    ...base,
    hex: interpolatedHex,
    bgSoft: interpolatedBgSoft,
    borderHex: interpolatedBorder,
  };
}

export interface EventAssignmentInfo {
  isFamilyEvent: boolean;
  label: string;
  participatingMembers: FamilyMember[];
  adminMember: FamilyMember;
  adminColorInfo: PastelColor;
  primaryColorInfo: PastelColor;
  borderHex: string;
  segmentedGradient: string;
  singleMember: FamilyMember | null;
}

/**
 * Creates equal-width vertical segments gradient from an array of pastel hex colors.
 * Example for 4 colors:
 * linear-gradient(to right, #F8BBD0 0.00%, #F8BBD0 25.00%, #C5E2F7 25.00%, #C5E2F7 50.00%, #E1D4F9 50.00%, #E1D4F9 75.00%, #BFE8D0 75.00%, #BFE8D0 100.00%)
 */
export function getFamilyGradient(colors: string[]): string {
  if (!colors || colors.length === 0) return '#F8BBD0';
  if (colors.length === 1) return colors[0];

  const count = colors.length;
  const stops = colors.map((hex, i) => {
    const startPct = ((i / count) * 100).toFixed(2);
    const endPct = (((i + 1) / count) * 100).toFixed(2);
    return `${hex} ${startPct}%, ${hex} ${endPct}%`;
  });

  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * Resolves event assignment info:
 * - If assigned to 1 member: Individual event (member colour = entire card background).
 * - If assigned to multiple members or whole family: Family event (divided multi-colour background, Family label, admin colour reference).
 */
export function getEventAssignmentInfo(
  evt: Partial<CalendarEvent>,
  allMembers: FamilyMember[]
): EventAssignmentInfo {
  const adminMember =
    allMembers.find((m) => m.role === 'administrator') ||
    allMembers[0] || {
      id: 'admin',
      family_id: '',
      name: 'Family',
      role: 'administrator' as const,
      color: '#F8BBD0',
      is_active: 1,
    };
  const adminColorInfo = getPastelColorInfo(adminMember?.color || '#F8BBD0');

  // Parse assigned_member_ids
  let rawIds = evt.assigned_member_ids;
  let assignedIds: string[] = [];
  if (Array.isArray(rawIds)) {
    assignedIds = rawIds;
  } else if (typeof rawIds === 'string') {
    try {
      assignedIds = JSON.parse(rawIds);
    } catch {
      assignedIds = [];
    }
  }

  // Filter members that actually exist in the family
  let participatingMembers: FamilyMember[] = allMembers.filter((m) =>
    assignedIds.includes(m.id)
  );

  // If no assigned member IDs provided:
  if (participatingMembers.length === 0) {
    if ((evt as any).member_id) {
      const singleM = allMembers.find((m) => m.id === (evt as any).member_id);
      if (singleM) {
        participatingMembers = [singleM];
      }
    }
  }

  const isFamilyEvent = participatingMembers.length > 1;

  if (isFamilyEvent) {
    // Multi-member event:
    // Multi-colour background divided into equal sections based on participating members
    const memberHexList = participatingMembers.map((m) => getPastelColorInfo(m.color).hex);
    const segmentedGradient = getFamilyGradient(memberHexList);

    return {
      isFamilyEvent: true,
      label: 'Family',
      singleMember: null,
      participatingMembers,
      adminMember,
      adminColorInfo,
      primaryColorInfo: adminColorInfo,
      borderHex: adminColorInfo.borderHex,
      segmentedGradient,
    };
  }

  // Single member event
  if (participatingMembers.length === 1) {
    const singleMember = participatingMembers[0];
    const memberColor = singleMember.color || evt.member_color || evt.color;
    const colorInfo = getPastelColorInfo(memberColor);

    return {
      isFamilyEvent: false,
      label: singleMember.name,
      singleMember,
      participatingMembers: [singleMember],
      adminMember,
      adminColorInfo,
      primaryColorInfo: colorInfo,
      borderHex: colorInfo.borderHex,
      segmentedGradient: colorInfo.hex,
    };
  }

  // Non-login Family Calendar Layer event (e.g., 🎂 Birthdays, 🗑️ Bin Calendar, 🇦🇺 Public Holidays, or custom layers):
  // Dedicated layer colour without combining members' colours!
  const layerColor = evt.color || (evt as any).calendar_color || '#8B5CF6';
  const colorInfo = getPastelColorInfo(layerColor);
  const layerLabel = (evt as any).calendar_name || (evt.event_type && evt.event_type !== 'Other' ? evt.event_type : 'Family');

  return {
    isFamilyEvent: false,
    label: layerLabel,
    singleMember: null,
    participatingMembers: [],
    adminMember,
    adminColorInfo,
    primaryColorInfo: colorInfo,
    borderHex: colorInfo.borderHex,
    segmentedGradient: colorInfo.hex,
  };
}

interface PastelColorPickerProps {
  selectedColor: string;
  onSelectColor: (hex: string) => void;
  disabled?: boolean;
}

export const PastelColorPicker: React.FC<PastelColorPickerProps> = ({
  selectedColor,
  onSelectColor,
  disabled = false,
}) => {
  const currentNormalized = (selectedColor || '').toUpperCase();

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-15 gap-2 pt-1">
        {PASTEL_COLORS.map((c) => {
          const isSelected =
            currentNormalized === c.hex.toUpperCase() ||
            (selectedColor === '#FF4FA3' && c.hex === '#F8BBD0');

          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectColor(c.hex)}
              title={c.name}
              style={{ backgroundColor: c.hex }}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-black/10 transition-all flex items-center justify-center cursor-pointer shadow-xs ${
                isSelected
                  ? 'ring-2 ring-[#0F172A] ring-offset-2 scale-110 shadow-sm'
                  : 'hover:scale-105 hover:shadow-sm opacity-90 hover:opacity-100'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isSelected && (
                <Check className="w-4 h-4 text-[#0F172A] stroke-[2.5]" />
              )}
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-gray-500 font-medium">
        Selected: <span className="font-semibold text-gray-800">{getPastelColorInfo(selectedColor).name}</span>
      </div>
    </div>
  );
};
