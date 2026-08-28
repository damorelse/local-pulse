/**
 * Local Pulse — LocalStorage Persistence & History Engine
 * Persists bookmarked places, recent search history (FIFO max 10), and user preferences.
 * Includes safe JSON parsing with automated corrupted storage recovery.
 */

export const STORAGE_KEYS = {
  SAVED_PLACES: 'localpulse_saved_places',
  SAVED_PLACES_FALLBACK: 'lp_saved_places',
  RECENT_SEARCHES: 'localpulse_recent_searches',
  RECENT_SEARCHES_FALLBACK: 'lp_recent_searches',
  THEME: 'localpulse_theme',
  VINTAGE: 'localpulse_vintage',
  COMPARE_ITEMS: 'lp_compare_items',
};

export const MAX_RECENT_SEARCHES = 10;

/**
 * Safe JSON parse wrapper with fallback
 * @param {string|null} jsonString
 * @param {any} fallback
 * @returns {any}
 */
export function safeJsonParse(jsonString, fallback = []) {
  if (!jsonString || typeof jsonString !== 'string') {
    return fallback;
  }
  try {
    const parsed = JSON.parse(jsonString);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Safe localStorage getter
 * @param {string} key
 * @param {any} fallback
 * @returns {any}
 */
export function getStorageItem(key, fallback = null) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Safe localStorage setter
 * @param {string} key
 * @param {string} value
 * @returns {boolean}
 */
export function setStorageItem(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`[LocalPulse Storage] Failed to set item for key "${key}":`, e);
    return false;
  }
}

/**
 * Generates a stable unique identifier for a place
 * @param {object} place
 * @returns {string}
 */
export function generatePlaceId(place) {
  if (!place) return `place-${Date.now()}`;
  if (place.id) return String(place.id);
  if (place.fips) {
    const s = place.fips.state || '';
    const c = place.fips.county || '';
    const t = place.fips.tract || '';
    if (s || c || t) return `fips-${s}${c}${t}`;
  }
  if (place.geoid) return `geoid-${place.geoid}`;
  if (place.lat !== undefined && place.lng !== undefined) {
    return `coord-${Number(place.lat).toFixed(4)}_${Number(place.lng).toFixed(4)}`;
  }
  return `place-${(place.name || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
}

/**
 * Get all bookmarked places from localStorage
 * @returns {Array<object>}
 */
export function getSavedPlaces() {
  const raw = getStorageItem(STORAGE_KEYS.SAVED_PLACES) || getStorageItem(STORAGE_KEYS.SAVED_PLACES_FALLBACK);
  const parsed = safeJsonParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Save or update a bookmarked place (deduplicates by ID and prepends to top)
 * @param {object} place
 * @returns {Array<object>} Updated list of saved places
 */
export function savePlace(place) {
  if (!place || typeof place !== 'object') {
    return getSavedPlaces();
  }

  const placeId = generatePlaceId(place);
  const existing = getSavedPlaces();

  const normalizedPlace = {
    id: placeId,
    name: place.name || place.displayName || 'Saved Location',
    displayName: place.displayName || place.name || 'Saved Location',
    formattedAddress: place.formattedAddress || place.displayName || place.name || '',
    neighborhood: place.neighborhood || '',
    city: place.city || '',
    state: place.state || '',
    stateCode: place.stateCode || 'US',
    zip: place.zip || '',
    lat: Number(place.lat) || 0,
    lng: Number(place.lng) || 0,
    fips: place.fips || {
      state: place.stateFips || '',
      county: place.countyFips || '',
      tract: place.tractFips || '',
      zcta: place.zcta || place.zip || '',
    },
    metrics: place.metrics || {
      homePrice: place.homePrice || place.homeValue || null,
      income: place.income || place.medianIncome || null,
      grossRent: place.grossRent || place.rent || null,
      affordabilityRatio: place.affordabilityRatio || null,
      affordabilityRating: place.affordabilityRating || '',
      aqi: place.aqi || null,
      aqiCategory: place.aqiCategory || '',
      diversityIndex: place.diversityIndex || null,
      medianAge: place.medianAge || null,
      totalPopulation: place.totalPopulation || null,
      bachelorPlusPercent: place.bachelorPlusPercent || null,
      greenCommuteRate: place.greenCommuteRate || place.greenCommute || null,
    },
    timestamp: Date.now(),
  };

  // Deduplicate: filter out any existing item with same id
  const filtered = existing.filter(p => p.id !== placeId);
  filtered.unshift(normalizedPlace);

  const jsonString = JSON.stringify(filtered);
  setStorageItem(STORAGE_KEYS.SAVED_PLACES, jsonString);
  setStorageItem(STORAGE_KEYS.SAVED_PLACES_FALLBACK, jsonString);

  return filtered;
}

/**
 * Remove a bookmarked place by ID
 * @param {string} id
 * @returns {Array<object>} Updated list of saved places
 */
export function removeSavedPlace(id) {
  if (!id) return getSavedPlaces();
  const existing = getSavedPlaces();
  const filtered = existing.filter(p => p.id !== String(id));

  const jsonString = JSON.stringify(filtered);
  setStorageItem(STORAGE_KEYS.SAVED_PLACES, jsonString);
  setStorageItem(STORAGE_KEYS.SAVED_PLACES_FALLBACK, jsonString);

  return filtered;
}

/**
 * Check if a place is bookmarked
 * @param {string|object} idOrPlace
 * @returns {boolean}
 */
export function isPlaceSaved(idOrPlace) {
  if (!idOrPlace) return false;
  const id = typeof idOrPlace === 'object' ? generatePlaceId(idOrPlace) : String(idOrPlace);
  const existing = getSavedPlaces();
  return existing.some(p => p.id === id);
}

/**
 * Clear all saved places
 * @returns {Array<object>} Empty array
 */
export function clearAllSavedPlaces() {
  setStorageItem(STORAGE_KEYS.SAVED_PLACES, '[]');
  setStorageItem(STORAGE_KEYS.SAVED_PLACES_FALLBACK, '[]');
  return [];
}

/**
 * Get recent search history (max 10 items)
 * @returns {Array<object|string>}
 */
export function getRecentSearches() {
  const raw = getStorageItem(STORAGE_KEYS.RECENT_SEARCHES) || getStorageItem(STORAGE_KEYS.RECENT_SEARCHES_FALLBACK);
  const parsed = safeJsonParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Add an item to recent search history (FIFO max 10, deduplicated)
 * @param {string|object} searchItem
 * @returns {Array<object|string>} Updated recent searches
 */
export function addRecentSearch(searchItem) {
  if (!searchItem) return getRecentSearches();

  const existing = getRecentSearches();
  let queryKey = '';

  if (typeof searchItem === 'string') {
    queryKey = searchItem.trim();
    if (!queryKey) return existing;
  } else if (typeof searchItem === 'object') {
    queryKey = searchItem.displayName || searchItem.name || searchItem.query || '';
    if (!queryKey && searchItem.lat !== undefined) {
      queryKey = `${searchItem.lat.toFixed(4)}, ${searchItem.lng.toFixed(4)}`;
    }
  }

  if (!queryKey) return existing;

  // Normalize item to store
  const itemToStore = typeof searchItem === 'string'
    ? searchItem
    : {
        name: queryKey,
        displayName: queryKey,
        lat: searchItem.lat,
        lng: searchItem.lng,
        timestamp: Date.now(),
      };

  // Filter duplicates
  const filtered = existing.filter(item => {
    const existingKey = typeof item === 'string' ? item : (item.displayName || item.name || '');
    return existingKey.toLowerCase() !== queryKey.toLowerCase();
  });

  filtered.unshift(itemToStore);
  const capped = filtered.slice(0, MAX_RECENT_SEARCHES);

  const jsonString = JSON.stringify(capped);
  setStorageItem(STORAGE_KEYS.RECENT_SEARCHES, jsonString);
  setStorageItem(STORAGE_KEYS.RECENT_SEARCHES_FALLBACK, jsonString);

  return capped;
}

/**
 * Clear recent search history
 * @returns {Array} Empty array
 */
export function clearRecentSearches() {
  setStorageItem(STORAGE_KEYS.RECENT_SEARCHES, '[]');
  setStorageItem(STORAGE_KEYS.RECENT_SEARCHES_FALLBACK, '[]');
  return [];
}

/**
 * Get compare selection items
 */
export function getCompareItems() {
  const raw = getStorageItem(STORAGE_KEYS.COMPARE_ITEMS);
  return safeJsonParse(raw, []);
}

/**
 * Set compare selection items
 */
export function setCompareItems(items) {
  const arr = Array.isArray(items) ? items : [];
  setStorageItem(STORAGE_KEYS.COMPARE_ITEMS, JSON.stringify(arr));
  return arr;
}

const STORAGE = {
  getSavedPlaces,
  savePlace,
  removeSavedPlace,
  isPlaceSaved,
  clearAllSavedPlaces,
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
  getCompareItems,
  setCompareItems,
  generatePlaceId,
  safeJsonParse,
  getStorageItem,
  setStorageItem,
  STORAGE_KEYS,
  MAX_RECENT_SEARCHES,
};

export default STORAGE;

if (typeof window !== 'undefined') {
  window.LocalPulseStorage = STORAGE;
  window.STORAGE = STORAGE;
}
