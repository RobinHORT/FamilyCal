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

export interface CountryInfo {
  name: string;
  rawName: string;
  iso3: string;
  aliases: string[];
  timezones: string[];
  isSingleTimezone: boolean;
  primaryCityName: string;
  primaryCityCode: string;
  primaryTimezone: string;
  cities: CityInfo[];
  previewCities: string[];
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

// Curated country configuration for popular countries
const CURATED_COUNTRIES: Record<
  string,
  {
    displayName: string;
    iso3: string;
    aliases: string[];
    isSingleTimezone?: boolean;
    primaryTimezone?: string;
    primaryCityName?: string;
    primaryCityCode?: string;
    priorityCities: Array<{
      city: string;
      province?: string;
      timezone: string;
      code: string;
    }>;
  }
> = {
  Australia: {
    displayName: 'Australia',
    iso3: 'AUS',
    aliases: ['oz', 'aus', 'australian'],
    isSingleTimezone: false,
    priorityCities: [
      { city: 'Melbourne', province: 'Victoria', timezone: 'Australia/Melbourne', code: 'MEL' },
      { city: 'Sydney', province: 'New South Wales', timezone: 'Australia/Sydney', code: 'SYD' },
      { city: 'Brisbane', province: 'Queensland', timezone: 'Australia/Brisbane', code: 'BNE' },
      { city: 'Adelaide', province: 'South Australia', timezone: 'Australia/Adelaide', code: 'ADL' },
      { city: 'Perth', province: 'Western Australia', timezone: 'Australia/Perth', code: 'PER' },
      { city: 'Darwin', province: 'Northern Territory', timezone: 'Australia/Darwin', code: 'DRW' },
      { city: 'Hobart', province: 'Tasmania', timezone: 'Australia/Hobart', code: 'HBA' },
    ],
  },
  'United States of America': {
    displayName: 'United States',
    iso3: 'USA',
    aliases: ['usa', 'us', 'america', 'united states of america'],
    isSingleTimezone: false,
    priorityCities: [
      { city: 'New York', province: 'New York', timezone: 'America/New_York', code: 'NYC' },
      { city: 'Chicago', province: 'Illinois', timezone: 'America/Chicago', code: 'CHI' },
      { city: 'Denver', province: 'Colorado', timezone: 'America/Denver', code: 'DEN' },
      { city: 'Los Angeles', province: 'California', timezone: 'America/Los_Angeles', code: 'LAX' },
      { city: 'Anchorage', province: 'Alaska', timezone: 'America/Anchorage', code: 'ANC' },
      { city: 'Honolulu', province: 'Hawaii', timezone: 'Pacific/Honolulu', code: 'HNL' },
    ],
  },
  'New Zealand': {
    displayName: 'New Zealand',
    iso3: 'NZL',
    aliases: ['nz', 'kiwi', 'new zealand'],
    isSingleTimezone: true,
    primaryTimezone: 'Pacific/Auckland',
    primaryCityName: 'Auckland',
    primaryCityCode: 'AKL',
    priorityCities: [{ city: 'Auckland', timezone: 'Pacific/Auckland', code: 'AKL' }],
  },
  Fiji: {
    displayName: 'Fiji',
    iso3: 'FJI',
    aliases: ['fj', 'fijian'],
    isSingleTimezone: true,
    primaryTimezone: 'Pacific/Fiji',
    primaryCityName: 'Suva',
    primaryCityCode: 'SUV',
    priorityCities: [{ city: 'Suva', timezone: 'Pacific/Fiji', code: 'SUV' }],
  },
  Japan: {
    displayName: 'Japan',
    iso3: 'JPN',
    aliases: ['jp', 'japanese', 'nippon'],
    isSingleTimezone: true,
    primaryTimezone: 'Asia/Tokyo',
    primaryCityName: 'Tokyo',
    primaryCityCode: 'TYO',
    priorityCities: [{ city: 'Tokyo', timezone: 'Asia/Tokyo', code: 'TYO' }],
  },
  'United Kingdom': {
    displayName: 'United Kingdom',
    iso3: 'GBR',
    aliases: ['uk', 'britain', 'great britain', 'england', 'london'],
    isSingleTimezone: true,
    primaryTimezone: 'Europe/London',
    primaryCityName: 'London',
    primaryCityCode: 'LON',
    priorityCities: [{ city: 'London', timezone: 'Europe/London', code: 'LON' }],
  },
  Singapore: {
    displayName: 'Singapore',
    iso3: 'SGP',
    aliases: ['sg', 'singapore'],
    isSingleTimezone: true,
    primaryTimezone: 'Asia/Singapore',
    primaryCityName: 'Singapore',
    primaryCityCode: 'SIN',
    priorityCities: [{ city: 'Singapore', timezone: 'Asia/Singapore', code: 'SIN' }],
  },
  Canada: {
    displayName: 'Canada',
    iso3: 'CAN',
    aliases: ['ca', 'canadian'],
    isSingleTimezone: false,
    priorityCities: [
      { city: 'Toronto', province: 'Ontario', timezone: 'America/Toronto', code: 'YYZ' },
      { city: 'Vancouver', province: 'British Columbia', timezone: 'America/Vancouver', code: 'YVR' },
      { city: 'Edmonton', province: 'Alberta', timezone: 'America/Edmonton', code: 'YEA' },
      { city: 'Winnipeg', province: 'Manitoba', timezone: 'America/Winnipeg', code: 'YWG' },
      { city: 'Halifax', province: 'Nova Scotia', timezone: 'America/Halifax', code: 'YHZ' },
    ],
  },
  France: {
    displayName: 'France',
    iso3: 'FRA',
    aliases: ['fr', 'french'],
    isSingleTimezone: true,
    primaryTimezone: 'Europe/Paris',
    primaryCityName: 'Paris',
    primaryCityCode: 'PAR',
    priorityCities: [{ city: 'Paris', timezone: 'Europe/Paris', code: 'PAR' }],
  },
  Germany: {
    displayName: 'Germany',
    iso3: 'DEU',
    aliases: ['de', 'german', 'deutschland'],
    isSingleTimezone: true,
    primaryTimezone: 'Europe/Berlin',
    primaryCityName: 'Berlin',
    primaryCityCode: 'BER',
    priorityCities: [{ city: 'Berlin', timezone: 'Europe/Berlin', code: 'BER' }],
  },
  'United Arab Emirates': {
    displayName: 'United Arab Emirates',
    iso3: 'ARE',
    aliases: ['uae', 'emirates', 'dubai', 'abu dhabi'],
    isSingleTimezone: true,
    primaryTimezone: 'Asia/Dubai',
    primaryCityName: 'Dubai',
    primaryCityCode: 'DXB',
    priorityCities: [
      { city: 'Dubai', timezone: 'Asia/Dubai', code: 'DXB' },
      { city: 'Abu Dhabi', timezone: 'Asia/Dubai', code: 'AUH' },
    ],
  },
  China: {
    displayName: 'China',
    iso3: 'CHN',
    aliases: ['cn', 'chinese', 'prc'],
    isSingleTimezone: false,
    priorityCities: [
      { city: 'Beijing', timezone: 'Asia/Shanghai', code: 'BJS' },
      { city: 'Shanghai', timezone: 'Asia/Shanghai', code: 'SHA' },
      { city: 'Hong Kong', timezone: 'Asia/Hong_Kong', code: 'HKG' },
    ],
  },
  India: {
    displayName: 'India',
    iso3: 'IND',
    aliases: ['in', 'indian'],
    isSingleTimezone: true,
    primaryTimezone: 'Asia/Kolkata',
    primaryCityName: 'New Delhi',
    primaryCityCode: 'DEL',
    priorityCities: [
      { city: 'New Delhi', timezone: 'Asia/Kolkata', code: 'DEL' },
      { city: 'Mumbai', timezone: 'Asia/Kolkata', code: 'BOM' },
      { city: 'Bangalore', timezone: 'Asia/Kolkata', code: 'BLR' },
    ],
  },
  Ireland: {
    displayName: 'Ireland',
    iso3: 'IRL',
    aliases: ['ie', 'irish'],
    isSingleTimezone: true,
    primaryTimezone: 'Europe/Dublin',
    primaryCityName: 'Dublin',
    primaryCityCode: 'DUB',
    priorityCities: [{ city: 'Dublin', timezone: 'Europe/Dublin', code: 'DUB' }],
  },
  Italy: {
    displayName: 'Italy',
    iso3: 'ITA',
    aliases: ['it', 'italian'],
    isSingleTimezone: true,
    primaryTimezone: 'Europe/Rome',
    primaryCityName: 'Rome',
    primaryCityCode: 'ROM',
    priorityCities: [{ city: 'Rome', timezone: 'Europe/Rome', code: 'ROM' }],
  },
};

/**
  * Retrieves all aggregated CountryInfo objects worldwide.
  */
export function getCountries(): CountryInfo[] {
  const mapping = ((cityTz as any).cityMapping as any[]) || [];
  const countryMap = new Map<string, any[]>();

  mapping.forEach((c) => {
    if (!c || !c.country || !c.city || !c.timezone) return;
    const name = c.country;
    if (!countryMap.has(name)) {
      countryMap.set(name, []);
    }
    countryMap.get(name)!.push(c);
  });

  const popularOrder = [
    'Australia',
    'United States of America',
    'New Zealand',
    'Fiji',
    'Japan',
    'United Kingdom',
    'Singapore',
    'Canada',
    'France',
    'Germany',
    'United Arab Emirates',
    'China',
    'India',
    'Ireland',
    'Italy',
  ];

  const processed = new Map<string, CountryInfo>();

  // Process popular countries first in order
  for (const rawName of popularOrder) {
    if (CURATED_COUNTRIES[rawName]) {
      const cur = CURATED_COUNTRIES[rawName];
      const rawCities = countryMap.get(rawName) || [];
      const cities: CityInfo[] = [];

      // Add priority cities first
      cur.priorityCities.forEach((p) => {
        cities.push({
          city: p.city,
          country: cur.displayName,
          province: p.province,
          timezone: p.timezone,
          code: p.code,
          displayName: `${p.city} (${p.code})`,
        });
      });

      // Add remaining cities from dataset
      rawCities.forEach((item) => {
        const code = getCityCode(item.city, item.timezone);
        if (!cities.some((c) => c.city.toLowerCase() === item.city.toLowerCase())) {
          cities.push({
            city: item.city,
            country: cur.displayName,
            province: item.province,
            timezone: item.timezone,
            code,
            pop: item.pop || 0,
            displayName: `${item.city} (${code})`,
          });
        }
      });

      const timezones = Array.from(new Set(cities.map((c) => c.timezone)));
      const isSingle = cur.isSingleTimezone ?? (timezones.length === 1);
      const primaryCity = cities[0];

      const iso3 = cur.iso3 || rawCities[0]?.iso3 || cur.displayName.slice(0, 3).toUpperCase();

      processed.set(cur.displayName, {
        name: cur.displayName,
        rawName,
        iso3,
        aliases: cur.aliases || [],
        timezones,
        isSingleTimezone: isSingle,
        primaryCityName: cur.primaryCityName || primaryCity.city,
        primaryCityCode: cur.primaryCityCode || primaryCity.code,
        primaryTimezone: cur.primaryTimezone || primaryCity.timezone,
        cities,
        previewCities: cities.slice(0, 4).map((c) => c.city),
      });
    }
  }

  // Process all other countries in dataset
  countryMap.forEach((rawCities, rawName) => {
    let displayName = rawName;
    if (rawName === 'United States of America') displayName = 'United States';
    if (rawName === 'Korea, South') displayName = 'South Korea';
    if (rawName === 'Russian Federation') displayName = 'Russia';

    if (processed.has(displayName)) return;

    rawCities.sort((a, b) => (b.pop || 0) - (a.pop || 0));

    const cities: CityInfo[] = [];
    rawCities.forEach((item) => {
      const code = getCityCode(item.city, item.timezone);
      if (!cities.some((c) => c.city.toLowerCase() === item.city.toLowerCase())) {
        cities.push({
          city: item.city,
          country: displayName,
          province: item.province,
          timezone: item.timezone,
          code,
          pop: item.pop || 0,
          displayName: `${item.city} (${code})`,
        });
      }
    });

    if (cities.length === 0) return;

    const timezones = Array.from(new Set(cities.map((c) => c.timezone)));
    const isSingle = timezones.length === 1;
    const primaryCity = cities[0];
    const iso3 = rawCities[0]?.iso3 || displayName.slice(0, 3).toUpperCase();

    processed.set(displayName, {
      name: displayName,
      rawName,
      iso3,
      aliases: [rawName.toLowerCase(), displayName.toLowerCase()],
      timezones,
      isSingleTimezone: isSingle,
      primaryCityName: primaryCity.city,
      primaryCityCode: primaryCity.code,
      primaryTimezone: primaryCity.timezone,
      cities,
      previewCities: cities.slice(0, 3).map((c) => c.city),
    });
  });

  return Array.from(processed.values());
}

/**
 * Returns CountryInfo for a given IANA timezone string.
 */
export function getCountryForIana(ianaTz: string): CountryInfo | undefined {
  const safeIana = ianaTz || 'Australia/Melbourne';
  const allCountries = getCountries();

  for (const country of allCountries) {
    if (country.timezones.includes(safeIana)) {
      return country;
    }
  }

  for (const country of allCountries) {
    if (country.cities.some((c) => c.timezone === safeIana)) {
      return country;
    }
  }

  return undefined;
}

/**
 * Returns the compact friendly badge for a given IANA timezone string.
 * Single-timezone country: "JPN", "NZL", "FJI", "GBR"
 * Multi-timezone country: "AUS/MEL", "AUS/SYD", "USA/NYC", "USA/LAX"
 */
export function getTimezoneBadge(ianaTz: string): string {
  const safeIana = ianaTz || 'Australia/Melbourne';
  const country = getCountryForIana(safeIana);

  if (!country) {
    const city = findCityByIana(safeIana);
    return city.code || 'UTC';
  }

  if (country.isSingleTimezone) {
    return country.iso3;
  }

  const matchingCity = country.cities.find((c) => c.timezone === safeIana);
  if (matchingCity) {
    return `${country.iso3}/${matchingCity.code}`;
  }

  return `${country.iso3}/${country.primaryCityCode}`;
}

/**
 * Returns a friendly display label for a given IANA timezone string.
 * Single-timezone country: "Japan", "New Zealand", "Fiji"
 * Multi-timezone country: "Australia (Melbourne)", "United States (New York)"
 */
export function getTimezoneDisplayLabel(ianaTz: string): string {
  const safeIana = ianaTz || 'Australia/Melbourne';
  const country = getCountryForIana(safeIana);

  if (!country) {
    const city = findCityByIana(safeIana);
    return `${city.city}, ${city.country}`;
  }

  if (country.isSingleTimezone) {
    return country.name;
  }

  const matchingCity = country.cities.find((c) => c.timezone === safeIana);
  if (matchingCity) {
    return `${country.name} (${matchingCity.city})`;
  }

  return `${country.name} (${country.primaryCityName})`;
}

/**
 * Searches countries worldwide by country name, aliases, or city names.
 */
export function searchCountries(query: string): CountryInfo[] {
  const q = query.toLowerCase().trim();
  const allCountries = getCountries();
  if (!q) return allCountries;

  const matches = allCountries.filter((c) => {
    const nameMatch = c.name.toLowerCase().includes(q);
    const aliasMatch = c.aliases.some((a) => a.toLowerCase().includes(q));
    const cityMatch = c.cities.some(
      (ci) => ci.city.toLowerCase().includes(q) || ci.code.toLowerCase() === q
    );
    const codeMatch = c.primaryCityCode.toLowerCase() === q || c.iso3.toLowerCase() === q;

    return nameMatch || aliasMatch || cityMatch || codeMatch;
  });

  return matches.sort((a, b) => {
    const aExact =
      a.name.toLowerCase() === q ||
      a.aliases.some((al) => al.toLowerCase() === q) ||
      a.iso3.toLowerCase() === q;
    const bExact =
      b.name.toLowerCase() === q ||
      b.aliases.some((al) => al.toLowerCase() === q) ||
      b.iso3.toLowerCase() === q;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aStart =
      a.name.toLowerCase().startsWith(q) ||
      a.aliases.some((al) => al.toLowerCase().startsWith(q));
    const bStart =
      b.name.toLowerCase().startsWith(q) ||
      b.aliases.some((al) => al.toLowerCase().startsWith(q));
    if (aStart && !bStart) return -1;
    if (!aStart && bStart) return 1;

    return 0;
  });
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
