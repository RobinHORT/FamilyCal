import cityTz from 'city-timezones';

export interface CityInfo {
  city: string;
  country: string;
  province?: string;
  timezone: string;
  code: string;
  pop?: number;
  displayName: string;
}

export interface TimezoneInfo {
  iana: string;
  code: string;
  city: string;
  country: string;
  province?: string;
  displayName: string;
  formattedOffset: string;
}

// Dictionary of known 3-letter city codes (IATA/popular)
const KNOWN_CITY_CODES: Record<string, string> = {
  'melbourne': 'MEL',
  'sydney': 'SYD',
  'suva': 'SUV',
  'los angeles': 'LAX',
  'new york': 'NYC',
  'tokyo': 'TYO',
  'brisbane': 'BNE',
  'adelaide': 'ADL',
  'perth': 'PER',
  'darwin': 'DRW',
  'hobart': 'HBA',
  'canberra': 'CBR',
  'auckland': 'AKL',
  'wellington': 'WLG',
  'christchurch': 'CHC',
  'london': 'LON',
  'paris': 'PAR',
  'berlin': 'BER',
  'rome': 'ROM',
  'amsterdam': 'AMS',
  'dublin': 'DUB',
  'madrid': 'MAD',
  'barcelona': 'BCN',
  'zurich': 'ZRH',
  'geneva': 'GVA',
  'vienna': 'VIE',
  'prague': 'PRG',
  'warsaw': 'WAW',
  'athens': 'ATH',
  'istanbul': 'IST',
  'moscow': 'MOW',
  'singapore': 'SIN',
  'hong kong': 'HKG',
  'bangkok': 'BKK',
  'kuala lumpur': 'KUL',
  'jakarta': 'JKT',
  'manila': 'MNL',
  'seoul': 'SEL',
  'beijing': 'BJS',
  'shanghai': 'SHA',
  'taipei': 'TPE',
  'delhi': 'DEL',
  'mumbai': 'BOM',
  'bangalore': 'BLR',
  'dubai': 'DXB',
  'abu dhabi': 'AUH',
  'doha': 'DOH',
  'riyadh': 'RUH',
  'tel aviv': 'TLV',
  'cairo': 'CAI',
  'johannesburg': 'JNB',
  'cape town': 'CPT',
  'toronto': 'YYZ',
  'vancouver': 'YVR',
  'montreal': 'YUL',
  'chicago': 'CHI',
  'san francisco': 'SFO',
  'seattle': 'SEA',
  'miami': 'MIA',
  'las vegas': 'LAS',
  'boston': 'BOS',
  'honolulu': 'HNL',
  'anchorage': 'ANC',
  'mexico city': 'MEX',
  'sao paulo': 'SAO',
  'rio de janeiro': 'RIO',
  'buenos aires': 'BUE',
  'santiago': 'SCL',
  'lima': 'LIM',
  'bogota': 'BOG',
};

/**
 * Returns a 3-letter city code for a given city name.
 */
export function getCityCode(cityName: string, ianaTz?: string): string {
  if (!cityName) return 'UTC';
  const norm = cityName.toLowerCase().trim();
  if (KNOWN_CITY_CODES[norm]) return KNOWN_CITY_CODES[norm];

  if (ianaTz) {
    const tzLower = ianaTz.toLowerCase();
    if (tzLower.includes('melbourne')) return 'MEL';
    if (tzLower.includes('sydney')) return 'SYD';
    if (tzLower.includes('brisbane')) return 'BNE';
    if (tzLower.includes('adelaide')) return 'ADL';
    if (tzLower.includes('perth')) return 'PER';
    if (tzLower.includes('darwin')) return 'DRW';
    if (tzLower.includes('hobart')) return 'HBA';
    if (tzLower.includes('fiji')) return 'SUV';
    if (tzLower.includes('los_angeles')) return 'LAX';
    if (tzLower.includes('new_york')) return 'NYC';
    if (tzLower.includes('tokyo')) return 'TYO';
    if (tzLower.includes('chicago')) return 'CHI';
  }

  const clean = cityName.replace(/[^a-zA-Z]/g, '');
  return clean.slice(0, 3).toUpperCase() || 'GMT';
}

/**
 * Finds the most relevant city for a given IANA timezone string.
 */
export function findCityByIana(ianaTz: string): CityInfo {
  const safeIana = ianaTz || 'Australia/Melbourne';
  const mapping = (cityTz as any).cityMapping as any[];

  let matches = mapping.filter((c) => c && c.timezone === safeIana);
  if (matches.length > 0) {
    matches.sort((a, b) => (b.pop || 0) - (a.pop || 0));
    const best = matches[0];
    const code = getCityCode(best.city, safeIana);
    return {
      city: best.city,
      country: best.country,
      province: best.province,
      timezone: safeIana,
      code,
      pop: best.pop,
      displayName: `${best.city} (${code}), ${best.country}`,
    };
  }

  // Fallback: match by city name from IANA string
  const rawCityName = safeIana.split('/').pop()?.replace(/_/g, ' ') || 'Melbourne';
  matches = mapping.filter(
    (c) => c && c.city && c.city.toLowerCase() === rawCityName.toLowerCase()
  );
  if (matches.length > 0) {
    matches.sort((a, b) => (b.pop || 0) - (a.pop || 0));
    const best = matches[0];
    const code = getCityCode(best.city, safeIana);
    return {
      city: best.city,
      country: best.country,
      province: best.province,
      timezone: safeIana,
      code,
      pop: best.pop,
      displayName: `${best.city} (${code}), ${best.country}`,
    };
  }

  // General fallback
  const code = getCityCode(rawCityName, safeIana);
  return {
    city: rawCityName,
    country: safeIana.split('/')[0] || 'Global',
    timezone: safeIana,
    code,
    displayName: `${rawCityName} (${code})`,
  };
}

/**
 * Formats current UTC offset for display (e.g. UTC+10:00).
 */
export function getFormattedOffset(ianaTz: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaTz,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart && tzPart.value) {
      return tzPart.value.replace('GMT', 'UTC');
    }
  } catch (err) {
    // Fallback if invalid tz
  }
  return 'UTC';
}

/**
 * Returns full timezone information object for an IANA timezone string.
 */
export function getTimezoneInfo(ianaTz: string): TimezoneInfo {
  const cityInfo = findCityByIana(ianaTz);
  const formattedOffset = getFormattedOffset(ianaTz);
  return {
    iana: ianaTz,
    code: cityInfo.code,
    city: cityInfo.city,
    country: cityInfo.country,
    province: cityInfo.province,
    displayName: cityInfo.displayName,
    formattedOffset,
  };
}

/**
 * Popular featured world cities shown when search query is empty.
 */
export function getPopularCities(): CityInfo[] {
  const popularSpecs = [
    { city: 'Melbourne', country: 'Australia', tz: 'Australia/Melbourne', code: 'MEL' },
    { city: 'Sydney', country: 'Australia', tz: 'Australia/Sydney', code: 'SYD' },
    { city: 'Brisbane', country: 'Australia', tz: 'Australia/Brisbane', code: 'BNE' },
    { city: 'Adelaide', country: 'Australia', tz: 'Australia/Adelaide', code: 'ADL' },
    { city: 'Perth', country: 'Australia', tz: 'Australia/Perth', code: 'PER' },
    { city: 'Darwin', country: 'Australia', tz: 'Australia/Darwin', code: 'DRW' },
    { city: 'Hobart', country: 'Australia', tz: 'Australia/Hobart', code: 'HBA' },
    { city: 'Canberra', country: 'Australia', tz: 'Australia/Sydney', code: 'CBR' },
    { city: 'Suva', country: 'Fiji', tz: 'Pacific/Fiji', code: 'SUV' },
    { city: 'Auckland', country: 'New Zealand', tz: 'Pacific/Auckland', code: 'AKL' },
    { city: 'Los Angeles', country: 'United States', tz: 'America/Los_Angeles', code: 'LAX' },
    { city: 'New York', country: 'United States', tz: 'America/New_York', code: 'NYC' },
    { city: 'Chicago', country: 'United States', tz: 'America/Chicago', code: 'CHI' },
    { city: 'San Francisco', country: 'United States', tz: 'America/Los_Angeles', code: 'SFO' },
    { city: 'London', country: 'United Kingdom', tz: 'Europe/London', code: 'LON' },
    { city: 'Paris', country: 'France', tz: 'Europe/Paris', code: 'PAR' },
    { city: 'Tokyo', country: 'Japan', tz: 'Asia/Tokyo', code: 'TYO' },
    { city: 'Singapore', country: 'Singapore', tz: 'Asia/Singapore', code: 'SIN' },
    { city: 'Hong Kong', country: 'Hong Kong', tz: 'Asia/Hong_Kong', code: 'HKG' },
    { city: 'Dubai', country: 'United Arab Emirates', tz: 'Asia/Dubai', code: 'DXB' },
  ];

  return popularSpecs.map((p) => ({
    city: p.city,
    country: p.country,
    timezone: p.tz,
    code: p.code,
    displayName: `${p.city} (${p.code}), ${p.country}`,
  }));
}

/**
 * Searches worldwide cities and places by city name, country, region, code, or timezone.
 */
export function searchCities(query: string): CityInfo[] {
  const q = query.toLowerCase().trim();
  if (!q) return getPopularCities();

  const mapping = ((cityTz as any).cityMapping as any[]) || [];

  const results = mapping.filter((c) => {
    if (!c || !c.timezone || !c.city) return false;
    const code = getCityCode(c.city, c.timezone).toLowerCase();
    const cityNorm = c.city.toLowerCase();
    const countryNorm = (c.country || '').toLowerCase();
    const provNorm = (c.province || '').toLowerCase();
    const tzNorm = c.timezone.toLowerCase();

    return (
      cityNorm.includes(q) ||
      countryNorm.includes(q) ||
      provNorm.includes(q) ||
      tzNorm.includes(q) ||
      code === q
    );
  });

  // Deduplicate by city + country + timezone
  const map = new Map<string, CityInfo>();
  for (const item of results) {
    const code = getCityCode(item.city, item.timezone);
    const key = `${item.city}_${item.country}_${item.timezone}`;
    const pop = item.pop || 0;

    if (!map.has(key) || pop > (map.get(key)?.pop || 0)) {
      map.set(key, {
        city: item.city,
        country: item.country,
        province: item.province,
        timezone: item.timezone,
        code,
        pop,
        displayName: `${item.city} (${code}), ${item.country}`,
      });
    }
  }

  const deduped = Array.from(map.values());
  // Sort by population and exact city/code matches
  deduped.sort((a, b) => {
    const aExact = a.city.toLowerCase() === q || a.code.toLowerCase() === q ? 1000 : 0;
    const bExact = b.city.toLowerCase() === q || b.code.toLowerCase() === q ? 1000 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.pop || 0) - (a.pop || 0);
  });

  return deduped;
}

/**
 * Converts a local date (YYYY-MM-DD) and time (HH:mm) in a target timezone into an exact UTC ISO string.
 */
export function localTimeToISO(dateStr: string, timeStr: string, ianaTz: string): string {
  if (!dateStr) return new Date().toISOString();
  const safeTime = timeStr || '09:00';
  const safeTz = ianaTz || 'Australia/Melbourne';

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = safeTime.split(':').map(Number);

  const utcGuess = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0));

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const getLocalOffsetMinutes = (d: Date): number => {
      const parts = formatter.formatToParts(d);
      const p: Record<string, string> = {};
      for (const part of parts) {
        p[part.type] = part.value;
      }
      const h = parseInt(p.hour === '24' ? '0' : p.hour, 10);
      const formattedLocalMs = Date.UTC(
        parseInt(p.year, 10),
        parseInt(p.month, 10) - 1,
        parseInt(p.day, 10),
        h,
        parseInt(p.minute, 10),
        parseInt(p.second, 10)
      );
      return (formattedLocalMs - d.getTime()) / 60000;
    };

    const offsetMinutes = getLocalOffsetMinutes(utcGuess);
    const exactUtcMs = utcGuess.getTime() - offsetMinutes * 60000;
    const exactDate = new Date(exactUtcMs);

    const exactOffset = getLocalOffsetMinutes(exactDate);
    if (exactOffset !== offsetMinutes) {
      return new Date(utcGuess.getTime() - exactOffset * 60000).toISOString();
    }
    return exactDate.toISOString();
  } catch (err) {
    return utcGuess.toISOString();
  }
}

/**
 * Converts a UTC ISO timestamp or Date into local date (YYYY-MM-DD) and time (HH:mm) in a target timezone.
 */
export function isoToLocalTime(
  isoStr: string | Date,
  ianaTz: string
): { dateStr: string; timeStr: string } {
  if (!isoStr) {
    const now = new Date();
    return {
      dateStr: now.toISOString().slice(0, 10),
      timeStr: '09:00',
    };
  }

  const d = typeof isoStr === 'string' ? new Date(isoStr) : isoStr;
  const safeTz = ianaTz || 'Australia/Melbourne';

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }

    const dateStr = `${p.year}-${p.month}-${p.day}`;
    const hourStr = p.hour === '24' ? '00' : p.hour.padStart(2, '0');
    const timeStr = `${hourStr}:${p.minute}`;

    return { dateStr, timeStr };
  } catch (err) {
    const iso = d.toISOString();
    return {
      dateStr: iso.slice(0, 10),
      timeStr: iso.slice(11, 16),
    };
  }
}

/**
 * Returns today's date in YYYY-MM-DD format for a given timezone.
 */
export function getEffectiveTodayDate(ianaTz: string): string {
  return isoToLocalTime(new Date(), ianaTz).dateStr;
}

/**
 * Formats a Date or ISO string into a localized time string (e.g. 7:00 AM) in a target timezone.
 */
export function formatTimeInTimezone(isoStr: string | Date, ianaTz: string): string {
  const d = typeof isoStr === 'string' ? new Date(isoStr) : isoStr;
  const safeTz = ianaTz || 'Australia/Melbourne';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: safeTz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch (err) {
    return isoToLocalTime(d, safeTz).timeStr;
  }
}
