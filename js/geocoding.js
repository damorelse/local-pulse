/**
 * Local Pulse Geocoding & FIPS Resolution Engine
 * Handles coordinate resolution, address searching/autocomplete, and reverse geocoding.
 * Primary: FCC Census Block API (100% CORS-safe).
 * Fallbacks: US Census Geocoder (JSON/JSONP) and OpenStreetMap Nominatim.
 */

import { CONFIG as importedConfig } from './config.js';

const CONFIG = importedConfig || (typeof window !== 'undefined' && (window.LocalPulseConfig || window.CONFIG)) || {
  API: {
    FCC_CENSUS_BLOCK: 'https://geo.fcc.gov/api/census/block/find',
    CENSUS_GEOCODER: 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates',
    OSM_NOMINATIM_SEARCH: 'https://nominatim.openstreetmap.org/search',
    OSM_NOMINATIM_REVERSE: 'https://nominatim.openstreetmap.org/reverse',
  },
  USER_AGENT: 'LocalPulsePWA/1.0',
};

// State Name / Abbreviation to 2-Digit FIPS Map
export const STATE_FIPS_MAP = {
  AL: '01', ALABAMA: '01',
  AK: '02', ALASKA: '02',
  AZ: '04', ARIZONA: '04',
  AR: '05', ARKANSAS: '05',
  CA: '06', CALIFORNIA: '06',
  CO: '08', COLORADO: '08',
  CT: '09', CONNECTICUT: '09',
  DE: '10', DELAWARE: '10',
  DC: '11', 'DISTRICT OF COLUMBIA': '11',
  FL: '12', FLORIDA: '12',
  GA: '13', GEORGIA: '13',
  HI: '15', HAWAII: '15',
  ID: '16', IDAHO: '16',
  IL: '17', ILLINOIS: '17',
  IN: '18', INDIANA: '18',
  IA: '19', IOWA: '19',
  KS: '20', KANSAS: '20',
  KY: '21', KENTUCKY: '21',
  LA: '22', LOUISIANA: '22',
  ME: '23', MAINE: '23',
  MD: '24', MARYLAND: '24',
  MA: '25', MASSACHUSETTS: '25',
  MI: '26', MICHIGAN: '26',
  MN: '27', MINNESOTA: '27',
  MS: '28', MISSISSIPPI: '28',
  MO: '29', MISSOURI: '29',
  MT: '30', MONTANA: '30',
  NE: '31', NEBRASKA: '31',
  NV: '32', NEVADA: '32',
  NH: '33', 'NEW HAMPSHIRE': '33',
  NJ: '34', 'NEW JERSEY': '34',
  NM: '35', 'NEW MEXICO': '35',
  NY: '36', 'NEW YORK': '36',
  NC: '37', 'NORTH CAROLINA': '37',
  ND: '38', 'NORTH DAKOTA': '38',
  OH: '39', OHIO: '39',
  OK: '40', OKLAHOMA: '40',
  OR: '41', OREGON: '41',
  PA: '42', PENNSYLVANIA: '42',
  RI: '44', 'RHODE ISLAND': '44',
  SC: '45', 'SOUTH CAROLINA': '45',
  SD: '46', 'SOUTH DAKOTA': '46',
  TN: '47', TENNESSEE: '47',
  TX: '48', TEXAS: '48',
  UT: '49', UTAH: '49',
  VT: '50', VERMONT: '50',
  VA: '51', VIRGINIA: '51',
  WA: '53', WASHINGTON: '53',
  WV: '54', 'WEST VIRGINIA': '54',
  WI: '55', WISCONSIN: '55',
  WY: '56', WYOMING: '56',
  PR: '72', 'PUERTO RICO': '72',
};

/**
 * Parses and validates a 15-character US Census Block FIPS string (SSCCCTTTTTTBBBB)
 *
 * @param {string} blockFips - 15-character string
 * @returns {{ stateFips: string, countyFips: string, tractFips: string, blockFips: string, isValid: boolean }}
 */
export function parseFipsCode(blockFips) {
  if (!blockFips || typeof blockFips !== 'string') {
    return { stateFips: '', countyFips: '', tractFips: '', blockFips: '', isValid: false };
  }
  const clean = blockFips.trim();
  if (clean.length < 11) {
    return { stateFips: '', countyFips: '', tractFips: '', blockFips: clean, isValid: false };
  }
  const stateFips = clean.slice(0, 2);
  const countyFips = clean.slice(2, 5);
  const tractFips = clean.slice(5, 11);
  return {
    stateFips,
    countyFips,
    tractFips,
    blockFips: clean,
    isValid: true,
  };
}

/**
 * Primary Geocoder: Resolves coordinates (lat, lng) to State, County, Tract FIPS
 * Uses FCC Census Block API with automated fallbacks to Census Geocoder and OSM Nominatim.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} [options] - Optional settings
 * @returns {Promise<{ stateFips: string, countyFips: string, tractFips: string, countyName: string, stateCode: string, blockFips: string, source: 'fcc'|'census_geocoder'|'osm' }>}
 */
export async function resolveCoordinates(lat, lng, options = {}) {
  const fetchFn = options.fetch || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  if (!fetchFn) {
    throw new Error('fetch is not available in current environment');
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (isNaN(latNum) || isNaN(lngNum)) {
    throw new Error('Invalid coordinates: latitude and longitude must be numbers');
  }

  // Boundary check (Extreme latitude bounds)
  if (Math.abs(latNum) > 85.0 || Math.abs(lngNum) > 180.0) {
    throw new Error('Location outside US Census coverage area: coordinates exceed valid geographical bounds');
  }

  // Check for Null Island (0, 0) or obvious non-US bounds
  if (latNum === 0 && lngNum === 0) {
    throw new Error('Location outside US Census coverage area: coordinate (0, 0) is outside US territory');
  }

  // 1. Primary: FCC Census Block API
  try {
    const fccUrl = `${CONFIG.API.FCC_CENSUS_BLOCK}?latitude=${latNum}&longitude=${lngNum}&format=json`;
    const res = await fetchFn(fccUrl, options.signal ? { signal: options.signal } : {});
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'OK' && data.Block && data.Block.FIPS) {
        const parsed = parseFipsCode(data.Block.FIPS);
        if (parsed.isValid) {
          return {
            stateFips: parsed.stateFips,
            countyFips: parsed.countyFips,
            tractFips: parsed.tractFips,
            blockFips: parsed.blockFips,
            countyName: data.County ? data.County.name : `County ${parsed.countyFips}`,
            stateCode: data.State ? data.State.code : 'US',
            source: 'fcc',
          };
        }
      }
    }
  } catch (fccErr) {
    if (fccErr.name === 'AbortError') throw fccErr;
    // Proceed to fallback
  }

  // 2. Fallback: US Census Geocoder Coordinates API
  try {
    const censusUrl = `${CONFIG.API.CENSUS_GEOCODER}?x=${lngNum}&y=${latNum}&benchmark=Public_AR_Current&vintage=4&format=json`;
    const res = await fetchFn(censusUrl, options.signal ? { signal: options.signal } : {});
    if (res.ok) {
      const data = await res.json();
      const tracts = data && data.result && data.result.geographies && data.result.geographies['Census Tracts'];
      if (Array.isArray(tracts) && tracts.length > 0) {
        const t = tracts[0];
        const stateFips = String(t.STATE).padStart(2, '0');
        const countyFips = String(t.COUNTY).padStart(3, '0');
        const tractFips = String(t.TRACT).padStart(6, '0');
        const geoid = t.GEOID || `${stateFips}${countyFips}${tractFips}`;
        return {
          stateFips,
          countyFips,
          tractFips,
          blockFips: geoid,
          countyName: t.NAME || `County ${countyFips}`,
          stateCode: t.STUSAB || 'US',
          source: 'census_geocoder',
        };
      }
    }
  } catch (censusErr) {
    if (censusErr.name === 'AbortError') throw censusErr;
    // Proceed to OSM fallback
  }

  // 3. Fallback: OSM Nominatim Reverse Geocoding
  try {
    const osmUrl = `${CONFIG.API.OSM_NOMINATIM_REVERSE}?lat=${latNum}&lon=${lngNum}&format=json&addressdetails=1`;
    const headers = { 'User-Agent': CONFIG.USER_AGENT || 'LocalPulsePWA/1.0' };
    const fetchOpts = { headers };
    if (options.signal) fetchOpts.signal = options.signal;
    const res = await fetchFn(osmUrl, fetchOpts);
    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const stateName = data.address.state || '';
        const stateUpper = stateName.toUpperCase().trim();
        const stateFips = STATE_FIPS_MAP[stateUpper] || null;

        if (stateFips) {
          return {
            stateFips,
            countyFips: '001',
            tractFips: '000100',
            blockFips: `${stateFips}0010001000000`,
            countyName: data.address.county || 'Local County',
            stateCode: stateUpper.length === 2 ? stateUpper : (Object.keys(STATE_FIPS_MAP).find(k => k.length === 2 && STATE_FIPS_MAP[k] === stateFips) || 'US'),
            source: 'osm',
          };
        }
      }
    }
  } catch (osmErr) {
    if (osmErr.name === 'AbortError') throw osmErr;
    // Fall through to error
  }

  throw new Error('Location outside US Census coverage area: no census geography could be resolved for coordinates');
}

/**
 * Searches for addresses, cities, or ZIP codes with live autocomplete via OSM Nominatim
 *
 * @param {string} query - Text query
 * @param {object} [options] - Optional settings
 * @returns {Promise<Array<{ displayName: string, lat: number, lng: number, address: object, type: string, importance: number }>>}
 */
export async function searchAddress(query, options = {}) {
  const fetchFn = options.fetch || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  if (!fetchFn) {
    throw new Error('fetch is not available in current environment');
  }

  if (!query || typeof query !== 'string') {
    return [];
  }

  // Sanitize query string: remove HTML/script tags and limit length
  const cleanQuery = query.replace(/<[^>]*>?/gm, '').trim().substring(0, 200);
  if (cleanQuery.length < 2) {
    return [];
  }

  const limit = Math.min(Math.max(Number(options.limit) || 6, 1), 10);
  const searchUrl = `${CONFIG.API.OSM_NOMINATIM_SEARCH}?q=${encodeURIComponent(cleanQuery)}&format=json&addressdetails=1&countrycodes=us&limit=${limit}`;
  const headers = { 'User-Agent': CONFIG.USER_AGENT || 'LocalPulsePWA/1.0' };
  const fetchOpts = { headers };
  if (options.signal) fetchOpts.signal = options.signal;

  try {
    const res = await fetchFn(searchUrl, fetchOpts);
    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map(item => {
      const addr = item.address || {};
      const neighborhood = addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || '';
      const city = addr.city || addr.town || addr.village || addr.municipality || '';
      const state = addr.state || '';
      const stateCode = addr.state_code ? addr.state_code.toUpperCase() : (STATE_FIPS_MAP[state.toUpperCase()] ? Object.keys(STATE_FIPS_MAP).find(k => k.length === 2 && STATE_FIPS_MAP[k] === STATE_FIPS_MAP[state.toUpperCase()]) : '');
      const zip = addr.postcode || '';

      return {
        displayName: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
        neighborhood,
        city,
        state,
        stateCode,
        zip,
        address: addr,
        type: item.type || 'place',
        importance: Number(item.importance) || 0,
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Reverse geocodes coordinates to a human-readable address and place name
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} [options] - Optional settings
 * @returns {Promise<{ displayName: string, neighborhood: string, city: string, county: string, state: string, stateCode: string, zip: string }>}
 */
export async function reverseGeocode(lat, lng, options = {}) {
  const fetchFn = options.fetch || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  if (!fetchFn) {
    throw new Error('fetch is not available in current environment');
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  const reverseUrl = `${CONFIG.API.OSM_NOMINATIM_REVERSE}?lat=${latNum}&lon=${lngNum}&format=json&addressdetails=1`;
  const headers = { 'User-Agent': CONFIG.USER_AGENT || 'LocalPulsePWA/1.0' };
  const fetchOpts = { headers };
  if (options.signal) fetchOpts.signal = options.signal;

  try {
    const res = await fetchFn(reverseUrl, fetchOpts);
    if (!res.ok) {
      return {
        displayName: `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`,
        neighborhood: 'Local Neighborhood',
        city: 'Unknown City',
        county: '',
        state: '',
        stateCode: 'US',
        zip: '',
      };
    }

    const data = await res.json();
    const addr = data.address || {};
    const neighborhood = addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || addr.hamlet || addr.isolated_dwelling || '';
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    const state = addr.state || '';
    const stateCode = addr.state_code ? addr.state_code.toUpperCase() : (STATE_FIPS_MAP[state.toUpperCase()] ? Object.keys(STATE_FIPS_MAP).find(k => k.length === 2 && STATE_FIPS_MAP[k] === STATE_FIPS_MAP[state.toUpperCase()]) : 'US');
    const zip = addr.postcode || '';

    return {
      displayName: data.display_name || `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`,
      neighborhood: neighborhood || city || 'Neighborhood',
      city,
      county: addr.county || '',
      state,
      stateCode,
      zip,
    };
  } catch (err) {
    return {
      displayName: `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`,
      neighborhood: 'Local Area',
      city: '',
      county: '',
      state: '',
      stateCode: 'US',
      zip: '',
    };
  }
}

const GEOCODING = {
  resolveCoordinates,
  searchAddress,
  reverseGeocode,
  parseFipsCode,
  STATE_FIPS_MAP,
};

export default GEOCODING;

if (typeof window !== 'undefined') {
  window.LocalPulseGeocoding = GEOCODING;
  window.GEOCODING = GEOCODING;
}
