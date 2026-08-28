/**
 * Local Pulse Census Data Engine
 * Queries US Census Bureau ACS 5-Year API across 2022, 2020, and 2015 vintages.
 * Sanitizes sentinel suppression values (-666666666, etc.), handles missing keys gracefully,
 * and implements a 4-tier Hierarchical Fallback Cascade: Tract -> ZCTA -> County -> Benchmark Matrix.
 */

import { CONFIG as importedConfig } from './config.js';
import {
  calculateAffordabilityRatio,
  calculateRentBurden,
  calculateDiversityIndex
} from './calculations.js';

const CONFIG = importedConfig || (typeof window !== 'undefined' && (window.LocalPulseConfig || window.CONFIG)) || {
  API: { CENSUS_ACS_BASE: 'https://api.census.gov/data' },
  DEFAULT_VINTAGE: '2022',
  SENTINEL_VALUES: [-666666666, -888888888, -999999999, -222222222, -333333333, -555555555],
  RESOLUTIONS: {
    TRACT: { key: 'tract', name: 'Census Tract', badge: '📍 Census Tract (Hyperlocal)' },
    ZCTA: { key: 'zcta', name: 'ZIP Code Tabulation Area', badge: '📮 ZIP Code (ZCTA)' },
    COUNTY: { key: 'county', name: 'County Level', badge: '🏛️ County Level' },
    BENCHMARK: { key: 'benchmark', name: 'State/National Benchmark', badge: '⚡ Benchmark Estimate' },
  },
};

const CALC = {
  calculateAffordabilityRatio,
  calculateRentBurden,
  calculateDiversityIndex,
};

// Pre-loaded in-memory cache for benchmarks matrix
let cachedBenchmarks = null;

/**
 * Sets or loads pre-bundled benchmarks matrix
 *
 * @param {object} benchmarkData
 */
export function setBenchmarks(benchmarkData) {
  cachedBenchmarks = benchmarkData;
}

/**
 * Loads pre-bundled benchmarks from data/benchmarks.json or cache
 *
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function loadBenchmarks(options = {}) {
  if (cachedBenchmarks) {
    return cachedBenchmarks;
  }

  if (typeof window !== 'undefined' && window.BENCHMARKS) {
    cachedBenchmarks = window.BENCHMARKS;
    return cachedBenchmarks;
  }

  // Node.js environment (safely retrieve built-in modules without static imports in browser)
  if (typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function') {
    try {
      const fs = process.getBuiltinModule('node:fs') || process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('node:path') || process.getBuiltinModule('path');
      if (fs && path) {
        const cwd = process.cwd();
        const candidatePaths = [
          path.resolve(cwd, 'data/benchmarks.json'),
          path.resolve(cwd, '../data/benchmarks.json'),
        ];
        for (const bmPath of candidatePaths) {
          if (fs.existsSync(bmPath)) {
            cachedBenchmarks = JSON.parse(fs.readFileSync(bmPath, 'utf-8'));
            return cachedBenchmarks;
          }
        }
      }
    } catch (e) {
      // Continue
    }
  }

  // Browser fetch environment
  const fetchFn = options.fetch || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  if (fetchFn) {
    try {
      let res = await fetchFn('data/benchmarks.json').catch(() => null);
      if (!res || !res.ok) {
        res = await fetchFn('./data/benchmarks.json').catch(() => null);
      }
      if (!res || !res.ok) {
        res = await fetchFn('/data/benchmarks.json').catch(() => null);
      }
      if (res && res.ok) {
        cachedBenchmarks = await res.json();
        return cachedBenchmarks;
      }
    } catch (e) {
      // Continue
    }
  }

  return { jurisdictions: {} };
}

/**
 * Sanitizes Census numeric sentinel values and negative error codes
 *
 * @param {any} val - Raw value from Census API
 * @param {boolean} [isCount=false] - If true, return 0 instead of null for empty counts
 * @returns {number|null}
 */
export function sanitizeCensusValue(val, isCount = false) {
  if (val === null || val === undefined || val === '') {
    return isCount ? 0 : null;
  }

  // Clean string numbers (e.g. "2,000,000+" or "$100,000")
  if (typeof val === 'string') {
    const clean = val.replace(/[$,+]/g, '').trim();
    if (clean === '' || clean === 'null') return isCount ? 0 : null;
    val = clean;
  }

  const num = Number(val);
  if (isNaN(num)) {
    return isCount ? 0 : null;
  }

  // Check against standard Census sentinel suppression codes
  const sentinels = CONFIG.SENTINEL_VALUES || [-666666666, -888888888, -999999999, -222222222];
  if (sentinels.includes(num)) {
    return isCount ? 0 : null;
  }

  // Negative values in Census estimates generally represent suppression or invalid values
  if (num < 0) {
    return isCount ? 0 : null;
  }

  return num;
}

/**
 * Parses 2D Census API response matrix [[header1, header2], [val1, val2]] into key-value map
 *
 * @param {Array<Array<string>>} censusRows
 * @returns {object|null}
 */
export function parseCensusRows(censusRows) {
  if (!Array.isArray(censusRows) || censusRows.length < 2) {
    return null;
  }

  const headers = censusRows[0];
  const values = censusRows[1];
  const map = {};

  for (let i = 0; i < headers.length; i++) {
    map[headers[i]] = values[i];
  }

  return map;
}

/**
 * Builds normalized CensusMetrics object from raw variable map
 *
 * @param {object} rawMap - Key-value map of variable codes to raw values
 * @returns {object} CensusMetrics
 */
export function buildCensusMetrics(rawMap) {
  const getVal = (code, isCount = false) => sanitizeCensusValue(rawMap[code], isCount);

  const totalPop = getVal('B01003_001E');
  const medianAge = getVal('B01002_001E');
  const medianIncome = getVal('B19013_001E');
  const homeVal = getVal('B25077_001E');
  const grossRent = getVal('B25064_001E');
  const yearBuilt = getVal('B25035_001E');

  const totalUnits = getVal('B25003_001E', true) || 0;
  const ownerUnits = getVal('B25003_002E', true) || 0;
  const renterUnits = getVal('B25003_003E', true) || 0;
  const ownPct = totalUnits > 0 ? Number(((ownerUnits / totalUnits) * 100).toFixed(1)) : null;

  // Race breakdown
  const raceTotal = getVal('B03002_001E', true) || totalPop || 0;
  const white = getVal('B03002_003E', true) || 0;
  const black = getVal('B03002_004E', true) || 0;
  const native = getVal('B03002_005E', true) || 0;
  const asian = getVal('B03002_006E', true) || 0;
  const pacific = getVal('B03002_007E', true) || 0;
  const other = getVal('B03002_008E', true) || 0;
  const multi = getVal('B03002_009E', true) || 0;
  const hispanic = getVal('B03002_012E', true) || 0;

  const race = {
    total: raceTotal,
    white,
    black,
    native,
    asian,
    pacific,
    other,
    multi,
    hispanic,
  };

  const diversity = CALC.calculateDiversityIndex(race);

  // Education breakdown
  const total25Plus = getVal('B15003_001E', true) || 0;
  const hs = (getVal('B15003_017E', true) || 0) + (getVal('B15003_018E', true) || 0);
  const associate = getVal('B15003_021E', true) || 0;
  const bachelor = getVal('B15003_022E', true) || 0;
  const master = getVal('B15003_023E', true) || 0;
  const prof = getVal('B15003_024E', true) || 0;
  const doc = getVal('B15003_025E', true) || 0;
  const grad = master + prof + doc;
  const bachPlus = bachelor + grad;

  const education = {
    total25Plus,
    highSchool: hs,
    associate,
    bachelor,
    master,
    professional: prof,
    doctorate: doc,
    graduate: grad,
    bachelorPlus: bachPlus,
    bachelorPlusPercent: total25Plus > 0 ? Number(((bachPlus / total25Plus) * 100).toFixed(1)) : 0,
  };

  // Commute breakdown
  const totalWorkers = getVal('B08301_001E', true) || 0;
  const driveAlone = getVal('B08301_003E', true) || 0;
  const carpool = getVal('B08301_004E', true) || 0;
  const transit = getVal('B08301_010E', true) || 0;
  const bike = getVal('B08301_018E', true) || 0;
  const walk = getVal('B08301_019E', true) || 0;
  const wfh = getVal('B08301_021E', true) || 0;
  const aggTravelTime = getVal('B08013_001E', true) || 0;
  const commuters = getVal('B08012_001E', true) || (totalWorkers - wfh);

  const meanTravelTime = commuters > 0 ? Number((aggTravelTime / commuters).toFixed(1)) : 0;
  const greenCommuteRate = totalWorkers > 0 ? Number((((transit + walk + bike + wfh) / totalWorkers) * 100).toFixed(1)) : 0;

  const commute = {
    totalWorkers,
    driveAlone,
    carpool,
    transit,
    bike,
    walk,
    wfh,
    meanTravelTime,
    greenCommuteRate,
  };

  const affordability = CALC.calculateAffordabilityRatio(homeVal, medianIncome);
  const rentBurden = CALC.calculateRentBurden(grossRent, medianIncome);

  return {
    totalPopulation: totalPop,
    medianAge,
    medianIncome,
    homeValue: homeVal,
    medianHomeValue: homeVal,
    grossRent,
    medianGrossRent: grossRent,
    medianYearBuilt: yearBuilt,
    ownerUnits,
    renterUnits,
    homeownershipRate: ownPct,
    affordabilityRatio: affordability.ratio,
    affordabilityRating: affordability.rating,
    affordabilityColor: affordability.color,
    affordabilityAngle: affordability.angle,
    rentBurden: rentBurden.percentage,
    rentBurdenRating: rentBurden.rating,
    diversityIndex: diversity.score0to100,
    simpsonsIndex: diversity.simpsonsIndex,
    race,
    education,
    commute,
  };
}

/**
 * Loads benchmark baseline for a state or US national
 *
 * @param {string} stateFips - 2-digit State FIPS or state code
 * @param {string} vintage - Survey vintage ('2022', '2020', '2015')
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function loadJurisdictionBenchmark(stateFips, vintage = '2022', options = {}) {
  const benchmarks = await loadBenchmarks(options);
  const jur = (benchmarks.jurisdictions && (benchmarks.jurisdictions[stateFips] || benchmarks.jurisdictions['US'] || benchmarks.jurisdictions['00'])) || null;

  if (jur && jur.vintages && jur.vintages[vintage]) {
    return jur.vintages[vintage];
  }
  if (jur && jur.vintages && jur.vintages['2022']) {
    return jur.vintages['2022'];
  }

  // Default hard-fallback structure
  return {
    vintage,
    name: 'United States',
    stateCode: 'US',
    stateFips: '00',
    totalPopulation: 331893745,
    medianAge: 38.8,
    medianIncome: 75149,
    homeValue: 281900,
    grossRent: 1268,
    ownerUnits: 84000000,
    renterUnits: 44000000,
    homeownershipRate: 64.8,
    affordabilityRatio: 3.75,
    rentBurden: 20.2,
    diversityIndex: 68.5,
    race: { total: 331893745, white: 195000000, black: 41800000, native: 2300000, asian: 19600000, pacific: 660000, other: 2300000, multi: 6900000, hispanic: 62700000 },
    education: { total25Plus: 225000000, highSchool: 63000000, associate: 20000000, bachelorPlus: 77000000, bachelorPlusPercent: 34.3 },
    commute: { totalWorkers: 159000000, driveAlone: 114000000, carpool: 13500000, transit: 6600000, walk: 4000000, bike: 800000, wfh: 24000000, meanTravelTime: 26.7, greenCommuteRate: 22.3 },
  };
}

/**
 * Helper to execute a Census API query with HTML error and non-200 protection
 *
 * @param {string} url
 * @param {Function} fetchFn
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
async function queryCensusUrl(url, fetchFn, options = {}) {
  try {
    const fetchOpts = {};
    if (options.signal) fetchOpts.signal = options.signal;
    const res = await fetchFn(url, fetchOpts);
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
    // Detect HTML error responses (e.g. Missing Key or Gateway timeout)
    if (text.trim().startsWith('<') || text.includes('Missing Key') || text.includes('error')) {
      return null;
    }
    const json = JSON.parse(text);
    return parseCensusRows(json);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return null;
  }
}

/**
 * Fetches Census Demographic & Economic Profile with 4-Tier Fallback Cascade:
 * Level 1: Tract -> Level 2: ZCTA -> Level 3: County -> Level 4: Bundled Benchmark
 *
 * @param {string} stateFips - 2-digit State FIPS
 * @param {string} countyFips - 3-digit County FIPS
 * @param {string} tractFips - 6-digit Tract FIPS
 * @param {string} [zcta] - 5-digit ZIP code tabulation area
 * @param {string} [vintage='2022'] - Survey vintage ('2022', '2020', '2015')
 * @param {object} [options] - Optional settings (fetch, apiKey, signal)
 * @returns {Promise<{ vintage: string, resolution: 'tract'|'zcta'|'county'|'benchmark', resolutionBadge: string, metrics: object, raw: object, stateBenchmark: object, usBenchmark: object }>}
 */
export async function fetchCensusProfile(stateFips, countyFips, tractFips, zcta = '', vintage = '2022', options = {}) {
  const fetchFn = options.fetch || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  const validVintage = CONFIG.VINTAGES && CONFIG.VINTAGES.includes(vintage) ? vintage : CONFIG.DEFAULT_VINTAGE || '2022';
  const apiKeyParam = options.apiKey ? `&key=${options.apiKey}` : '';

  const varList = (CONFIG.CENSUS_VARIABLE_CODES || [
    'B01003_001E', 'B01002_001E', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'B25035_001E',
    'B25003_001E', 'B25003_002E', 'B25003_003E',
    'B03002_001E', 'B03002_003E', 'B03002_004E', 'B03002_005E', 'B03002_006E', 'B03002_007E', 'B03002_008E', 'B03002_009E', 'B03002_012E',
    'B15003_001E', 'B15003_017E', 'B15003_018E', 'B15003_019E', 'B15003_020E', 'B15003_021E', 'B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E',
    'B08301_001E', 'B08301_003E', 'B08301_004E', 'B08301_010E', 'B08301_018E', 'B08301_019E', 'B08301_021E',
    'B08013_001E', 'B08012_001E',
  ]).join(',');

  const baseUrl = `${CONFIG.API.CENSUS_ACS_BASE}/${validVintage}/acs/acs5`;

  // Concurrently load State & US Benchmarks for zero-latency comparisons
  const [stateBm, usBm] = await Promise.all([
    loadJurisdictionBenchmark(stateFips || 'US', validVintage, options),
    loadJurisdictionBenchmark('US', validVintage, options),
  ]);

  let rawMap = null;
  let resolution = 'benchmark';

  if (fetchFn && stateFips) {
    // LEVEL 1: Tract Level Query
    if (countyFips && tractFips) {
      const tractUrl = `${baseUrl}?get=${varList}&for=tract:${tractFips}&in=state:${stateFips}+county:${countyFips}${apiKeyParam}`;
      rawMap = await queryCensusUrl(tractUrl, fetchFn, options);
      if (rawMap && (rawMap['B01003_001E'] !== undefined || rawMap['B19013_001E'] !== undefined)) {
        // Check if tract is residential or populated
        const pop = sanitizeCensusValue(rawMap['B01003_001E'], true);
        if (pop > 0 || rawMap['B19013_001E'] !== undefined) {
          resolution = 'tract';
        }
      }
    }

    // LEVEL 2: ZCTA Level Query (if tract unmapped, non-residential, or failed)
    if (!rawMap && zcta && zcta.length === 5) {
      const zctaUrl = `${baseUrl}?get=${varList}&for=zip+code+tabulation+area:${zcta}${apiKeyParam}`;
      rawMap = await queryCensusUrl(zctaUrl, fetchFn, options);
      if (rawMap && rawMap['B01003_001E'] !== undefined) {
        resolution = 'zcta';
      }
    }

    // LEVEL 3: County Level Query (if tract and ZCTA failed)
    if (!rawMap && countyFips) {
      const countyUrl = `${baseUrl}?get=${varList}&for=county:${countyFips}&in=state:${stateFips}${apiKeyParam}`;
      rawMap = await queryCensusUrl(countyUrl, fetchFn, options);
      if (rawMap && rawMap['B01003_001E'] !== undefined) {
        resolution = 'county';
      }
    }
  }

  // LEVEL 4: Pre-bundled Benchmark Matrix Fallback
  if (!rawMap) {
    resolution = 'benchmark';
    const benchmarkMetrics = stateBm || usBm;
    return {
      vintage: validVintage,
      resolution: 'benchmark',
      resolutionBadge: CONFIG.RESOLUTIONS.BENCHMARK.badge,
      metrics: benchmarkMetrics,
      raw: {},
      stateBenchmark: stateBm,
      usBenchmark: usBm,
      isFallback: true,
    };
  }

  const metrics = buildCensusMetrics(rawMap);
  const resConfig = CONFIG.RESOLUTIONS[resolution.toUpperCase()] || CONFIG.RESOLUTIONS.TRACT;

  return {
    vintage: validVintage,
    resolution,
    resolutionBadge: resConfig.badge,
    metrics,
    raw: rawMap,
    stateBenchmark: stateBm,
    usBenchmark: usBm,
    isFallback: resolution === 'benchmark',
  };
}

/**
 * Concurrently fetch multiple survey vintages with throttled batching
 *
 * @param {string} stateFips
 * @param {string} countyFips
 * @param {string} tractFips
 * @param {string} zcta
 * @param {Array<string>} vintages
 * @param {object} [options]
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchVintageBatch(stateFips, countyFips, tractFips, zcta = '', vintages = ['2022'], options = {}) {
  const results = {};
  const queue = [...vintages];
  const CONCURRENCY = 4;

  const workers = Array.from({ length: Math.min(queue.length, CONCURRENCY) }, async () => {
    while (queue.length > 0) {
      if (options.signal && options.signal.aborted) break;
      const v = queue.shift();
      try {
        const profile = await fetchCensusProfile(stateFips, countyFips, tractFips, zcta, v, options);
        results[v] = profile;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        results[v] = null;
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Multi-vintage timeseries pipeline with IndexedDB persistence and tiered lazy loading
 *
 * @param {string} stateFips
 * @param {string} countyFips
 * @param {string} tractFips
 * @param {string} zcta
 * @param {object} [options]
 * @returns {Promise<{ key: string, vintages: object, timeseries: object, isComplete: boolean, fetchHistorical: Function }>}
 */
export async function fetchMultiVintageTimeseries(stateFips, countyFips, tractFips, zcta = '', options = {}) {
  const cacheKey = `fips-${stateFips || '00'}-${countyFips || '000'}-${tractFips || '000000'}`;
  
  // 1. Check IndexedDB cached timeseries
  if (typeof window !== 'undefined' && window.LocalPulseStorage && typeof window.LocalPulseStorage.getTimeseries === 'function') {
    const cached = await window.LocalPulseStorage.getTimeseries(cacheKey).catch(() => null);
    if (cached && cached.vintages && Object.keys(cached.vintages).length >= 10) {
      return {
        key: cacheKey,
        vintages: cached.vintages,
        timeseries: cached.timeseries,
        isComplete: true,
        fetchHistorical: async () => cached,
      };
    }
  }

  // 2. Phase 1: Fetch Anchor Vintages (2023, 2022, 2020, 2015) for instant paint
  const anchors = CONFIG.ANCHOR_VINTAGES || ['2023', '2022', '2020', '2015'];
  const anchorProfiles = await fetchVintageBatch(stateFips, countyFips, tractFips, zcta, anchors, options);

  const buildTimeSeries = (allVintages) => {
    const allYears = (CONFIG.VINTAGES || ['2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2014', '2013', '2012', '2011', '2010', '2009'])
      .map(Number)
      .sort((a, b) => a - b);

    const ts = {
      years: allYears,
      homeValue: [],
      medianIncome: [],
      grossRent: [],
      affordabilityRatio: [],
      rentBurden: [],
    };

    for (const yr of allYears) {
      const p = allVintages[String(yr)];
      const m = (p && p.metrics) || {};
      ts.homeValue.push(m.homeValue ?? null);
      ts.medianIncome.push(m.medianIncome ?? null);
      ts.grossRent.push(m.grossRent ?? null);
      ts.affordabilityRatio.push(m.affordabilityRatio ?? null);
      ts.rentBurden.push(m.rentBurden ?? null);
    }
    return ts;
  };

  const initialTimeseries = buildTimeSeries(anchorProfiles);

  const container = {
    key: cacheKey,
    vintages: anchorProfiles,
    timeseries: initialTimeseries,
    isComplete: false,
    fetchHistorical: async () => {
      if (container.isComplete) return container;
      const allYears = CONFIG.VINTAGES || ['2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2014', '2013', '2012', '2011', '2010', '2009'];
      const remainingYears = allYears.filter(y => !anchorProfiles[y]);
      const historicalProfiles = await fetchVintageBatch(stateFips, countyFips, tractFips, zcta, remainingYears, options);

      Object.assign(container.vintages, historicalProfiles);
      container.timeseries = buildTimeSeries(container.vintages);
      container.isComplete = true;

      // Persist to IndexedDB
      if (typeof window !== 'undefined' && window.LocalPulseStorage && typeof window.LocalPulseStorage.saveTimeseries === 'function') {
        await window.LocalPulseStorage.saveTimeseries(cacheKey, {
          vintages: container.vintages,
          timeseries: container.timeseries,
        }).catch(() => {});
      }

      return container;
    }
  };

  return container;
}

const CENSUS = {
  fetchCensusProfile,
  fetchVintageBatch,
  fetchMultiVintageTimeseries,
  sanitizeCensusValue,
  parseCensusRows,
  buildCensusMetrics,
  loadJurisdictionBenchmark,
  loadBenchmarks,
  setBenchmarks,
};

export default CENSUS;

if (typeof window !== 'undefined') {
  window.LocalPulseCensus = CENSUS;
  window.CENSUS = CENSUS;
}
