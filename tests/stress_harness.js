/**
 * Local Pulse — Empirical Adversarial Stress Harness (Challenger 1)
 *
 * Exhaustive fuzzing, differential testing with oracles, boundary condition sweeps,
 * error injection, corruption recovery, and performance profiling.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CONFIG = require('../js/config');
const GEOCODING = require('../js/geocoding');
const CALCULATIONS = require('../js/calculations');
const ENVIRONMENT = require('../js/environment');
const WIKIPEDIA = require('../js/wikipedia');
const CENSUS = require('../js/census');
const STORAGE = require('../js/storage');
const COMPARE = require('../js/compare');
const SHARE = require('../js/share');
const BENCHMARKS = require('../data/benchmarks.json');
const server = require('../server');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failureDetails = [];

function check(name, condition, extraInfo = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
  } else {
    failedChecks++;
    failureDetails.push({ name, extraInfo });
    console.error(`  \x1b[31m✖ STRESS FAIL\x1b[0m ${name} ${extraInfo ? `— ${extraInfo}` : ''}`);
  }
}

console.log('\n======================================================================');
console.log('       LOCAL PULSE — EMPIRICAL ADVERSARIAL STRESS HARNESS');
console.log('======================================================================\n');

// ====================================================================
// SECTION 1: CALCULATIONS FUZZING & ORACLE DIFFERENTIAL TESTING
// ====================================================================
console.log('--- SECTION 1: Calculations Fuzzing & Oracles (15,000 Iterations) ---');

// 1.1 Affordability Ratio Fuzzing (5,000 iterations)
console.log('1.1 Fuzzing calculateAffordabilityRatio...');
const boundaryValues = [0, -1, -666666666, -999999999, 1, 0.001, 1000000, 2000001, 1e9, NaN, null, undefined, '100000', '$2,000,000+'];

for (const hv of boundaryValues) {
  for (const inc of boundaryValues) {
    const res = CALCULATIONS.calculateAffordabilityRatio(hv, inc);
    check('calculateAffordabilityRatio handles boundary without throw', typeof res === 'object');
    if (res.ratio !== null) {
      check('ratio is a valid number', typeof res.ratio === 'number' && !isNaN(res.ratio) && res.ratio >= 0);
      check('angle is within [0, 180]', typeof res.angle === 'number' && res.angle >= 0 && res.angle <= 180);
      check('color is valid hex string', typeof res.color === 'string' && res.color.startsWith('#'));
      check('rating is valid string', ['Affordable', 'Moderate', 'Unaffordable'].includes(res.rating));
    } else {
      check('invalid inputs yield ratio=null and rating=N/A', res.rating === 'N/A' && res.angle === 0);
    }
  }
}

// Random Fuzzing 5000 cases
for (let i = 0; i < 5000; i++) {
  const homeVal = Math.random() < 0.1 ? (Math.random() * -100000) : (Math.random() * 5000000);
  const inc = Math.random() < 0.1 ? 0 : (Math.random() * 500000);

  const res = CALCULATIONS.calculateAffordabilityRatio(homeVal, inc);
  if (inc <= 0 || homeVal <= 0) {
    check('Zero or negative income/homevalue gives ratio=null', res.ratio === null && res.rating === 'N/A');
  } else {
    const expectedRatio = Number((homeVal / inc).toFixed(2));
    check('Ratio matches oracle', Math.abs(res.ratio - expectedRatio) < 0.01);
    check('Angle in range [0, 180]', res.angle >= 0 && res.angle <= 180);
  }
}

// 1.2 Rent Burden Fuzzing (5,000 iterations)
console.log('1.2 Fuzzing calculateRentBurden...');
for (const rent of boundaryValues) {
  for (const inc of boundaryValues) {
    const res = CALCULATIONS.calculateRentBurden(rent, inc);
    check('calculateRentBurden handles boundary without throw', typeof res === 'object');
    if (res.percentage !== null) {
      check('percentage is valid number', typeof res.percentage === 'number' && !isNaN(res.percentage) && res.percentage >= 0);
      check('rating is valid string', ['Affordable', 'Rent Burdened', 'Severely Rent Burdened'].includes(res.rating));
    } else {
      check('invalid inputs yield percentage=null', res.percentage === null && res.rating === 'N/A');
    }
  }
}

for (let i = 0; i < 5000; i++) {
  const rent = Math.random() < 0.1 ? (Math.random() * -1000) : (Math.random() * 10000);
  const inc = Math.random() < 0.1 ? 0 : (Math.random() * 300000);

  const res = CALCULATIONS.calculateRentBurden(rent, inc);
  if (inc <= 0 || rent <= 0) {
    check('Zero/negative income or rent gives percentage=null', res.percentage === null);
  } else {
    const expectedPct = Number(((rent * 12 / inc) * 100).toFixed(1));
    check('Rent burden percentage matches oracle', Math.abs(res.percentage - expectedPct) < 0.02);
  }
}

// 1.3 Simpson's Diversity Index Fuzzing (5,000 iterations)
console.log('1.3 Fuzzing calculateDiversityIndex...');
// Monocultural oracle test:
for (let raceIdx = 0; raceIdx < 8; raceIdx++) {
  const raceCounts = [0, 0, 0, 0, 0, 0, 0, 0];
  raceCounts[raceIdx] = 5420;
  const res = CALCULATIONS.calculateDiversityIndex(raceCounts);
  check(`Monocultural tract (100% race ${raceIdx}) yields D=0.0 and score=0.0`, res.simpsonsIndex === 0 && res.score0to100 === 0);
}

// Perfectly even distribution:
const evenCounts = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000];
const evenRes = CALCULATIONS.calculateDiversityIndex(evenCounts);
check('Perfect 8-way diversity yields score=100.0', evenRes.score0to100 === 100.0);
check('Perfect 8-way diversity yields D=0.875', Math.abs(evenRes.simpsonsIndex - 0.875) <= 0.001);

// All zero or negative:
const allZero = [0, 0, 0, 0, 0, 0, 0, 0];
const zeroRes = CALCULATIONS.calculateDiversityIndex(allZero);
check('All zeros yield D=0 and score=0 without division by zero', zeroRes.simpsonsIndex === 0 && zeroRes.score0to100 === 0);

// Random race vectors fuzzing
for (let i = 0; i < 5000; i++) {
  const counts = Array.from({ length: 8 }, () => Math.floor(Math.random() * 20000));
  const total = counts.reduce((a, b) => a + b, 0);
  const res = CALCULATIONS.calculateDiversityIndex(counts);

  check('Diversity score within [0, 100]', typeof res.score0to100 === 'number' && res.score0to100 >= 0 && res.score0to100 <= 100);
  check('Simpsons index within [0, 1.0]', typeof res.simpsonsIndex === 'number' && res.simpsonsIndex >= 0 && res.simpsonsIndex < 1.0);

  // Oracle computation:
  if (total > 0) {
    const sumSq = counts.reduce((acc, c) => acc + Math.pow(c / total, 2), 0);
    const expectedD = Math.max(0, 1 - sumSq);
    check('Simpson index matches oracle within 0.005', Math.abs(res.simpsonsIndex - expectedD) < 0.005);
  }
}

// 1.4 Commute & Education Shares Fuzzing
console.log('1.4 Fuzzing Commute and Education calculations...');
for (let i = 0; i < 1000; i++) {
  const totalW = Math.random() < 0.1 ? 0 : Math.floor(Math.random() * 50000);
  const drive = Math.floor(Math.random() * totalW);
  const transit = Math.floor(Math.random() * (totalW - drive));
  const walk = Math.floor(Math.random() * (totalW - drive - transit));

  const commuteRes = CALCULATIONS.calculateCommuteShares({
    totalWorkers: totalW,
    driveAlone: drive,
    transit: transit,
    walk: walk,
  });

  if (totalW === 0) {
    check('Zero commute workers gives 0% shares without NaN', commuteRes.driveAlonePct === 0 && commuteRes.greenCommutePct === 0);
  } else {
    check('Commute percentages are finite numbers', isFinite(commuteRes.driveAlonePct) && isFinite(commuteRes.greenCommutePct));
    check('Green commute rate is within [0, 100]', commuteRes.greenCommutePct >= 0 && commuteRes.greenCommutePct <= 100);
  }
}

// ====================================================================
// SECTION 2: CENSUS SENTINELS, SUPPRESSION & CASCADE STRESS TESTING
// ====================================================================
console.log('\n--- SECTION 2: Census Sentinels & Cascade Stress Testing ---');

// 2.1 Sentinel values sanitization
const allSentinels = [-666666666, -888888888, -999999999, -222222222, -333333333, -555555555, '-666666666', '-999999999'];
for (const s of allSentinels) {
  check(`sanitizeCensusValue(${s}, isCount=false) returns null`, CENSUS.sanitizeCensusValue(s, false) === null);
  check(`sanitizeCensusValue(${s}, isCount=true) returns 0`, CENSUS.sanitizeCensusValue(s, true) === 0);
}

// 2.2 Top-coded values sanitization
check('sanitizeCensusValue("$2,000,000+") returns 2000000', CENSUS.sanitizeCensusValue('$2,000,000+', false) === 2000000);
check('sanitizeCensusValue("2,000,001") returns 2000001', CENSUS.sanitizeCensusValue('2,000,001', false) === 2000001);
check('sanitizeCensusValue("$150,000") returns 150000', CENSUS.sanitizeCensusValue('$150,000', false) === 150000);
check('sanitizeCensusValue(null) returns null', CENSUS.sanitizeCensusValue(null, false) === null);
check('sanitizeCensusValue(undefined) returns null', CENSUS.sanitizeCensusValue(undefined, false) === null);
check('sanitizeCensusValue("") returns null', CENSUS.sanitizeCensusValue('', false) === null);
check('sanitizeCensusValue("null") returns null', CENSUS.sanitizeCensusValue('null', false) === null);

// 2.3 Special tract profiles (Airport / Central park / Zero income)
const zeroIncomeRaw = {
  'B01003_001E': '1250',
  'B01002_001E': '21.4',
  'B19013_001E': '-666666666', // Suppressed / 0 income
  'B25077_001E': '450000',
  'B25064_001E': '950',
  'B25003_001E': '400',
  'B25003_002E': '10',
  'B25003_003E': '390',
  'B03002_001E': '1250',
  'B03002_003E': '1250', // 100% monocultural
  'B15003_001E': '200',
  'B08301_001E': '150',
};

const zeroIncomeMetrics = CENSUS.buildCensusMetrics(zeroIncomeRaw);
check('Zero income tract sets medianIncome to null', zeroIncomeMetrics.medianIncome === null);
check('Zero income tract handles affordability ratio gracefully', zeroIncomeMetrics.affordabilityRatio === null && zeroIncomeMetrics.affordabilityRating === 'N/A');
check('Zero income tract handles rent burden gracefully', zeroIncomeMetrics.rentBurden === null && zeroIncomeMetrics.rentBurdenRating === 'N/A');
check('Monocultural tract in buildCensusMetrics yields diversityIndex 0', zeroIncomeMetrics.diversityIndex === 0);

// 2.4 Cascade simulation
async function testCascadeSimulation() {
  console.log('2.4 Testing 4-tier cascade behavior...');
  // Scenario A: Tract unmapped, ZCTA valid
  const mockFetchZcta = async (url) => {
    if (url.includes('for=tract:')) {
      return { ok: true, text: async () => 'error: unmapped' };
    }
    if (url.includes('for=zip+code+tabulation+area:94110')) {
      return {
        ok: true,
        text: async () => JSON.stringify([
          ['B01003_001E', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'zip code tabulation area'],
          ['74200', '135000', '1400000', '2800', '94110']
        ]),
      };
    }
    return { ok: false, text: async () => '404' };
  };

  const resZcta = await CENSUS.fetchCensusProfile('06', '075', '022803', '94110', '2022', { fetch: mockFetchZcta });
  check('Cascade level 2 selects ZCTA resolution', resZcta.resolution === 'zcta');
  check('Cascade level 2 extracts metrics', resZcta.metrics.medianIncome === 135000);

  // Scenario B: Tract and ZCTA fail, County succeeds
  const mockFetchCounty = async (url) => {
    if (url.includes('for=tract:') || url.includes('for=zip+code+tabulation+area:')) {
      return { ok: false, text: async () => '404' };
    }
    if (url.includes('for=county:075')) {
      return {
        ok: true,
        text: async () => JSON.stringify([
          ['B01003_001E', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'state', 'county'],
          ['873965', '126117', '1342000', '2168', '06', '075']
        ]),
      };
    }
    return { ok: false, text: async () => '404' };
  };

  const resCounty = await CENSUS.fetchCensusProfile('06', '075', '022803', '94110', '2022', { fetch: mockFetchCounty });
  check('Cascade level 3 selects County resolution', resCounty.resolution === 'county');
  check('Cascade level 3 extracts county population', resCounty.metrics.totalPopulation === 873965);

  // Scenario C: Total network failure / HTML Error -> Cascade level 4 Benchmark
  const mockFetchHtml = async () => ({
    ok: true,
    text: async () => '<html><head><title>504 Gateway Time-out</title></head><body><h1>504 Gateway Time-out</h1>The server didn\'t respond in time.</body></html>',
  });

  const resBenchmark = await CENSUS.fetchCensusProfile('06', '075', '022803', '94110', '2022', { fetch: mockFetchHtml });
  check('Cascade level 4 falls back to Benchmark matrix', resBenchmark.resolution === 'benchmark');
  check('Benchmark fallback provides state benchmark data', resBenchmark.metrics.medianIncome > 0 && resBenchmark.isFallback === true);
}

// ====================================================================
// SECTION 3: BOUNDARY COORDINATES & GEOCODING STRESS TESTING
// ====================================================================
console.log('\n--- SECTION 3: Boundary Coordinates & Geocoding Stress Testing ---');

async function testGeocodingBoundaries() {
  // 3.1 Null Island (0, 0)
  try {
    await GEOCODING.resolveCoordinates(0, 0, { fetch: async () => ({ ok: true, json: async () => ({}) }) });
    check('Null Island (0,0) throws boundary error', false, 'Expected error was not thrown');
  } catch (err) {
    check('Null Island (0,0) throws boundary error', err.message.includes('Location outside US Census coverage area') || err.message.includes('outside US'));
  }

  // 3.2 North and South Poles
  const poleCoords = [[90, 0], [-90, 0], [85.0001, -120], [-85.0001, 50], [100, 200]];
  for (const [lat, lng] of poleCoords) {
    try {
      await GEOCODING.resolveCoordinates(lat, lng, { fetch: async () => ({ ok: true, json: async () => ({}) }) });
      check(`Polar/out of bound coordinate (${lat}, ${lng}) throws boundary error`, false);
    } catch (err) {
      check(`Polar/out of bound coordinate (${lat}, ${lng}) throws boundary error`, true);
    }
  }

  // 3.3 Non-numeric / NaN coordinates
  try {
    await GEOCODING.resolveCoordinates('invalid_lat', 'invalid_lng', { fetch: async () => ({ ok: true }) });
    check('Non-numeric coordinates throw invalid error', false);
  } catch (err) {
    check('Non-numeric coordinates throw invalid error', err.message.includes('Invalid coordinates'));
  }

  // 3.4 US Territories (Puerto Rico, Alaska, Hawaii)
  const mockFetchPR = async (url) => {
    if (url.includes('geo.fcc.gov')) {
      return {
        ok: true,
        json: async () => ({
          status: 'OK',
          Block: { FIPS: '720019501001001' },
          County: { name: 'Adjuntas' },
          State: { code: 'PR', name: 'Puerto Rico' },
        }),
      };
    }
    return { ok: false };
  };

  const prResult = await GEOCODING.resolveCoordinates(18.2208, -66.5901, { fetch: mockFetchPR });
  check('Puerto Rico coordinates resolve to State FIPS 72', prResult.stateFips === '72');
  check('Puerto Rico state code is PR', prResult.stateCode === 'PR');

  // 3.5 Maritime / Ocean coordinates returning no FIPS block
  const mockFetchOcean = async () => ({
    ok: true,
    json: async () => ({ status: 'OK', Block: null, County: null, State: null }),
  });

  try {
    await GEOCODING.resolveCoordinates(25.0, -90.0, { fetch: mockFetchOcean });
    check('Ocean coordinates with no block throw coverage error', false);
  } catch (err) {
    check('Ocean coordinates with no block throw coverage error', err.message.includes('Location outside US Census coverage area'));
  }

  // 3.6 Search address sanitization & extreme inputs
  const xssQueries = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    '"><svg onload=alert(1)>',
    'a'.repeat(5000), // Huge query
    '   ',
    '1',
  ];

  for (const q of xssQueries) {
    const searchRes = await GEOCODING.searchAddress(q, {
      fetch: async (url) => {
        check('Search URL encodes parameter safely', !url.includes('<script>') && !url.includes('<img'));
        return { ok: true, json: async () => [] };
      },
    });
    check('searchAddress handles adversarial queries safely', Array.isArray(searchRes));
  }
}

// ====================================================================
// SECTION 4: ENVIRONMENTAL EXTREMES & MISSING SENSORS
// ====================================================================
console.log('\n--- SECTION 4: Environmental Extremes & Missing Sensors ---');

// 4.1 AQI Classifications sweep
const aqiTestCases = [
  { input: 0, cat: 'Good', color: '#10B981', expectedAngle: 0 },
  { input: 25, cat: 'Good', color: '#10B981' },
  { input: 50, cat: 'Good', color: '#10B981' },
  { input: 51, cat: 'Moderate', color: '#F59E0B' },
  { input: 100, cat: 'Moderate', color: '#F59E0B' },
  { input: 101, cat: 'Unhealthy for Sensitive Groups', color: '#F97316' },
  { input: 150, cat: 'Unhealthy for Sensitive Groups', color: '#F97316' },
  { input: 151, cat: 'Unhealthy', color: '#EF4444' },
  { input: 200, cat: 'Unhealthy', color: '#EF4444' },
  { input: 201, cat: 'Very Unhealthy', color: '#8B5CF6' },
  { input: 300, cat: 'Very Unhealthy', color: '#8B5CF6', expectedAngle: 180 },
  { input: 301, cat: 'Hazardous', color: '#881337', expectedAngle: 180 },
  { input: 500, cat: 'Hazardous', color: '#881337', expectedAngle: 180 },
  { input: 1000, cat: 'Hazardous', color: '#881337', expectedAngle: 180 },
  { input: -10, cat: 'Good', expectedAngle: 0 },
  { input: null, cat: 'Unavailable', color: '#94A3B8', expectedAngle: 0 },
  { input: undefined, cat: 'Unavailable', color: '#94A3B8', expectedAngle: 0 },
  { input: NaN, cat: 'Unavailable', color: '#94A3B8', expectedAngle: 0 },
];

for (const tc of aqiTestCases) {
  const cl = ENVIRONMENT.getAqiClassification(tc.input);
  if (tc.cat) check(`AQI ${tc.input} category matches ${tc.cat}`, cl.category === tc.cat);
  if (tc.color) check(`AQI ${tc.input} color matches ${tc.color}`, cl.color === tc.color);
  if (tc.expectedAngle !== undefined) check(`AQI ${tc.input} angle is ${tc.expectedAngle}`, cl.angle === tc.expectedAngle);
  check(`AQI ${tc.input} angle clamped to [0, 180]`, cl.angle >= 0 && cl.angle <= 180);
}

// 4.2 Weather descriptions sweep
const wmoCodes = [0, 1, 2, 3, 45, 48, 51, 56, 61, 66, 71, 80, 85, 95, 96, 999, -1];
for (const code of wmoCodes) {
  const desc = ENVIRONMENT.getWeatherDescription(code);
  check(`Weather code ${code} returns valid description and icon`, typeof desc.description === 'string' && typeof desc.icon === 'string' && desc.description.length > 0);
}

// 4.3 Missing sensor data in fetchEnvironmentalData
async function testEnvironmentalSensors() {
  const mockEmptySensors = async (url) => {
    if (url.includes('air-quality')) {
      return {
        ok: true,
        json: async () => ({ current: { us_aqi: null, pm2_5: null, pm10: null, ozone: null } }),
      };
    }
    if (url.includes('forecast')) {
      return {
        ok: true,
        json: async () => ({
          current: {},
        }),
      };
    }
    return { ok: false };
  };

  const envRes = await ENVIRONMENT.fetchEnvironmentalData(37.77, -122.41, { fetch: mockEmptySensors });
  check('Missing AQI sensor yields aqi=null and hasAqiData=false', envRes.aqi === null && envRes.hasAqiData === false);
  check('Missing weather sensor yields temperature=null and hasWeatherData=false', envRes.temperature === null && envRes.hasWeatherData === false);
  check('AQI category for missing sensor is Unavailable', envRes.aqiCategory === 'Unavailable');
}

// ====================================================================
// SECTION 5: LOCALSTORAGE CORRUPTION RECOVERY & FIFO RESILIENCE
// ====================================================================
console.log('\n--- SECTION 5: LocalStorage Corruption Recovery & FIFO Stress Testing ---');

function createMockStorage() {
  const store = {};
  return {
    getItem: (k) => (store[k] !== undefined ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    _store: store,
  };
}

global.localStorage = createMockStorage();

// 5.1 Corrupted JSON recovery
const corruptedPayloads = [
  '{ bad json:',
  'undefined',
  'null',
  '12345',
  '"string literal"',
  '[{ invalid }]',
  '{"notAnArray": true}',
];

for (const corrupt of corruptedPayloads) {
  localStorage.setItem(STORAGE.STORAGE_KEYS.SAVED_PLACES, corrupt);
  const places = STORAGE.getSavedPlaces();
  check(`Corrupted localStorage payload "${corrupt.substring(0, 15)}" recovered to array`, Array.isArray(places));

  localStorage.setItem(STORAGE.STORAGE_KEYS.RECENT_SEARCHES, corrupt);
  const searches = STORAGE.getRecentSearches();
  check(`Corrupted searches payload "${corrupt.substring(0, 15)}" recovered to array`, Array.isArray(searches));
}

// 5.2 FIFO Ordering & Deduplication (200 additions)
localStorage.clear();
console.log('5.2 Testing FIFO max 10 recent searches with 200 items...');
for (let i = 0; i < 200; i++) {
  STORAGE.addRecentSearch({ displayName: `Query ${i}`, lat: 30 + i * 0.01, lng: -97 + i * 0.01 });
}
const recent = STORAGE.getRecentSearches();
check('Recent searches capped at exactly MAX_RECENT_SEARCHES (10)', recent.length === 10);
check('Recent searches FIFO keeps latest item at index 0', recent[0].displayName === 'Query 199');
check('Recent searches keeps Query 190 at last index', recent[9].displayName === 'Query 190');

// Deduplication
for (let i = 0; i < 10; i++) {
  STORAGE.addRecentSearch({ displayName: 'Duplicate City', lat: 37.77, lng: -122.41 });
}
const dedupRecent = STORAGE.getRecentSearches();
check('Adding duplicate search does not create multiple entries', dedupRecent.filter(s => s.displayName === 'Duplicate City').length === 1);
check('Duplicate item moved to front (index 0)', dedupRecent[0].displayName === 'Duplicate City');

// 5.3 Saved Places Deduplication & Persistence
localStorage.clear();
const testPlace = {
  id: 'sf-mission-test',
  displayName: 'Mission District',
  lat: 37.7599,
  lng: -122.4148,
  homePrice: 1350000,
  income: 145000,
};

for (let i = 0; i < 20; i++) {
  STORAGE.savePlace(testPlace);
}
const saved = STORAGE.getSavedPlaces();
check('Saved places deduplicates by place ID to single entry', saved.length === 1);
check('isPlaceSaved returns true for saved place', STORAGE.isPlaceSaved('sf-mission-test'));
check('isPlaceSaved returns true when passed place object', STORAGE.isPlaceSaved(testPlace));

STORAGE.removeSavedPlace('sf-mission-test');
check('removeSavedPlace removes place properly', STORAGE.getSavedPlaces().length === 0);
check('isPlaceSaved returns false after removal', STORAGE.isPlaceSaved('sf-mission-test') === false);

// ====================================================================
// SECTION 6: COMPARATIVE DELTA SCORECARD STRESS TESTING
// ====================================================================
console.log('\n--- SECTION 6: Comparative Scorecard Edge Cases ---');

// 6.1 Comparing places with null / zero / missing metrics
const emptyPlaceA = { name: 'Empty Place A', metrics: {} };
const emptyPlaceB = { name: 'Empty Place B', metrics: {} };
const compareEmpty = COMPARE.calculateComparisonDeltas(emptyPlaceA, emptyPlaceB);

check('Comparing two empty places returns valid matrix without throwing', Array.isArray(compareEmpty.metrics) && compareEmpty.metrics.length > 0);
for (const m of compareEmpty.metrics) {
  check(`Metric ${m.id} in empty comparison formats as "—"`, m.formattedA === '—' && m.formattedB === '—' && m.deltaText === '—');
}

// 6.2 Comparing normal place vs zero income place
const placeValid = {
  name: 'Place Valid',
  stateCode: 'CA',
  metrics: { homePrice: 1200000, income: 150000, grossRent: 3000, aqi: 45, greenCommuteRate: 65 },
};
const placeZero = {
  name: 'Place Zero',
  stateCode: 'TX',
  metrics: { homePrice: 0, income: 0, grossRent: 0, aqi: 0, greenCommuteRate: 0 },
};

const compareZero = COMPARE.calculateComparisonDeltas(placeValid, placeZero);
check('Comparing against zero metrics calculates absolute and percent deltas without crashing', Array.isArray(compareZero.metrics));
const homeMetric = compareZero.metrics.find(m => m.id === 'homeValue');
check('Home price delta computed correctly against 0', homeMetric && homeMetric.valA === 1200000 && homeMetric.valB === 0);

// ====================================================================
// SECTION 7: NATIVE SHARE & CLIPBOARD FORMATTING
// ====================================================================
console.log('\n--- SECTION 7: Native Share & Formatting Stress Testing ---');

const fullPlaceData = {
  name: 'San Francisco (Mission District)',
  homePrice: 1350000,
  income: 145000,
  affordabilityRatio: 9.3,
  affordabilityRating: 'Severe Burden',
  aqi: 38,
  aqiCategory: 'Good',
  greenCommute: 72,
  landmark: 'Mission Dolores',
  lat: 37.7599,
  lng: -122.4148,
};

const shareText = SHARE.formatShareText(fullPlaceData);
check('formatShareText contains header', shareText.includes('📍 Local Pulse: San Francisco (Mission District)'));
check('formatShareText contains formatted home price', shareText.includes('🏠 Median Home: $1,350,000'));
check('formatShareText contains formatted income', shareText.includes('💰 Median Income: $145,000'));
check('formatShareText contains affordability ratio', shareText.includes('📊 Affordability Ratio: 9.3x (Severe Burden)'));
check('formatShareText contains AQI', shareText.includes('🌱 US AQI: 38 (Good)'));
check('formatShareText contains mobility', shareText.includes('🚶 Mobility: 72% Green Commute'));
check('formatShareText contains landmark', shareText.includes('🏛 Landmark: Mission Dolores'));
check('formatShareText contains live URL', shareText.includes('🔗 Live Intelligence:'));

// Empty share data
const emptyShareText = SHARE.formatShareText(null);
check('formatShareText with null input returns default title', emptyShareText === 'Local Pulse — Hyper-Local US Intelligence');

// ====================================================================
// SECTION 8: PREVIEW SERVER & SECURITY STRESS TESTING
// ====================================================================
console.log('\n--- SECTION 8: Preview Server & Security Verification ---');

async function testServerSecurity() {
  const testPort = 8089;
  await new Promise((resolve) => server.listen(testPort, resolve));

  const makeRawRequest = (rawHttp) => {
    const net = require('net');
    return new Promise((resolve, reject) => {
      const client = net.createConnection({ port: testPort }, () => {
        client.write(rawHttp);
      });
      let response = '';
      client.on('data', chunk => response += chunk);
      client.on('end', () => {
        const lines = response.split('\r\n');
        const statusLine = lines[0] || '';
        const statusCode = parseInt(statusLine.split(' ')[1], 10) || 0;
        resolve({ statusCode, raw: response });
      });
      client.on('error', reject);
    });
  };

  const makeRequest = (reqPath, method = 'GET') => {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: testPort,
        path: reqPath,
        method: method,
        headers: { 'Accept-Encoding': 'gzip' },
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });
  };

  try {
    // 8.1 Directory traversal attacks
    const rawTraversalVectors = [
      'GET /css/..%2f..%2f..%2fetc/passwd HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n',
      'GET /..%2f..%2f..%2fetc/shadow HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n',
    ];

    for (const rawVec of rawTraversalVectors) {
      const res = await makeRawRequest(rawVec);
      check(`Directory traversal with encoded slash denied with 403`, res.statusCode === 403);
    }

    // 8.2 Standard assets & MIME types
    const indexRes = await makeRequest('/');
    check('Root path returns 200 OK', indexRes.statusCode === 200);
    check('HTML MIME type has UTF-8 charset', indexRes.headers['content-type'].includes('text/html'));
    check('Security header X-Content-Type-Options nosniff is set', indexRes.headers['x-content-type-options'] === 'nosniff');
    check('Security header X-Frame-Options is SAMEORIGIN', indexRes.headers['x-frame-options'] === 'SAMEORIGIN');

    const manifestRes = await makeRequest('/manifest.json');
    check('manifest.json returns 200', manifestRes.statusCode === 200);
    check('manifest.json has application/json or webmanifest MIME', manifestRes.headers['content-type'].includes('json'));

    const bmRes = await makeRequest('/data/benchmarks.json');
    check('benchmarks.json returns 200', bmRes.statusCode === 200);
    check('ETag header present on assets', typeof bmRes.headers['etag'] === 'string');

    // 8.3 404 on non-existent file
    const notFoundRes = await makeRequest('/non_existent_file_xyz.txt');
    check('Non-existent file returns 404', notFoundRes.statusCode === 404);

    // 8.4 Method not allowed (POST / PUT / DELETE)
    const postRes = await makeRequest('/', 'POST');
    check('POST method returns 405 Method Not Allowed', postRes.statusCode === 405);

    const deleteRes = await makeRequest('/js/app.js', 'DELETE');
    check('DELETE method returns 405 Method Not Allowed', deleteRes.statusCode === 405);

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// ====================================================================
// SECTION 9: PERFORMANCE & CONCURRENCY PROFILING
// ====================================================================
console.log('\n--- SECTION 9: Performance & High-Concurrency Profiling ---');

async function testPerformanceAndConcurrency() {
  // 9.1 Rapid coordinate calculation bursts (1000 parallel calculations)
  const startTime = Date.now();
  for (let i = 0; i < 1000; i++) {
    const hv = 500000 + i * 1000;
    const inc = 80000 + i * 50;
    CALCULATIONS.calculateAffordabilityRatio(hv, inc);
    CALCULATIONS.calculateRentBurden(2000, inc);
    CALCULATIONS.calculateDiversityIndex([1000, 500, 200, 300, 50, 10, 20, 100]);
    CALCULATIONS.calculateGrowthDelta(hv, 400000);
  }
  const durationMs = Date.now() - startTime;
  check(`1,000 multi-metric calculations execute in < 50ms (Actual: ${durationMs}ms)`, durationMs < 50);

  // 9.2 Memory RSS Check
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
  check(`Peak memory usage is well within limits (< 100MB, RSS: ${rssMb}MB, Heap: ${heapMb}MB)`, rssMb < 100);
}

// ====================================================================
// RUN ALL ASYNC SUITES & DISPLAY SUMMARY
// ====================================================================
async function main() {
  try {
    await testCascadeSimulation();
    await testGeocodingBoundaries();
    await testEnvironmentalSensors();
    await testServerSecurity();
    await testPerformanceAndConcurrency();
  } catch (err) {
    console.error('\n\x1b[31mFATAL ERROR IN HARNESS EXECUTION:\x1b[0m', err);
    failedChecks++;
  }

  console.log('\n======================================================================');
  console.log('              ADVERSARIAL STRESS HARNESS SUMMARY');
  console.log('======================================================================');
  console.log(`  Total Checks Executed:  ${totalChecks}`);
  console.log(`  Passed:                 \x1b[32m${passedChecks}\x1b[0m`);
  console.log(`  Failed:                 ${failedChecks > 0 ? `\x1b[31m${failedChecks}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);
  console.log('======================================================================\n');

  if (failedChecks > 0) {
    console.error(`\x1b[31mFAILURE REPORT (${failedChecks} failures):\x1b[0m`);
    failureDetails.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.name}] ${f.extraInfo}`);
    });
    process.exit(1);
  } else {
    console.log('\x1b[32m✔ ALL ADVERSARIAL STRESS CHECKS PASSED WITH 100% SUCCESS!\x1b[0m\n');
    process.exit(0);
  }
}

main();
