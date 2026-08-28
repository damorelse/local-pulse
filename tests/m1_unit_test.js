/**
 * Comprehensive Milestone 1 Unit & Verification Suite for Local Pulse
 * Tests config, geocoding, census, environment, wikipedia, calculations, and benchmarks.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const CONFIG = require('../js/config');
const GEOCODING = require('../js/geocoding');
const CALCULATIONS = require('../js/calculations');
const ENVIRONMENT = require('../js/environment');
const WIKIPEDIA = require('../js/wikipedia');
const CENSUS = require('../js/census');
const BENCHMARKS = require('../data/benchmarks.json');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✔ PASS\x1b[0m ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✔ PASS\x1b[0m ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

async function runSuite() {
  console.log('\n===============================================================');
  console.log('       LOCAL PULSE — MILESTONE 1 VERIFICATION SUITE');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // 1. CONFIG MODULE TESTS
  // -------------------------------------------------------------
  console.log('1. Testing js/config.js:');

  test('CONFIG exposes all required API endpoints', () => {
    assert.strictEqual(typeof CONFIG.API.FCC_CENSUS_BLOCK, 'string');
    assert.strictEqual(typeof CONFIG.API.CENSUS_GEOCODER, 'string');
    assert.strictEqual(typeof CONFIG.API.OSM_NOMINATIM_SEARCH, 'string');
    assert.strictEqual(typeof CONFIG.API.OSM_NOMINATIM_REVERSE, 'string');
    assert.strictEqual(typeof CONFIG.API.CENSUS_ACS_BASE, 'string');
    assert.strictEqual(typeof CONFIG.API.OPEN_METEO_AQI, 'string');
    assert.strictEqual(typeof CONFIG.API.OPEN_METEO_WEATHER, 'string');
    assert.strictEqual(typeof CONFIG.API.WIKIPEDIA_API, 'string');
  });

  test('CONFIG defines 5 popular US neighborhood presets', () => {
    assert.strictEqual(Array.isArray(CONFIG.PRESETS), true);
    assert.strictEqual(CONFIG.PRESETS.length >= 5, true);
    const ids = CONFIG.PRESETS.map(p => p.id);
    assert.ok(ids.includes('sf_mission'));
    assert.ok(ids.includes('austin_downtown'));
    assert.ok(ids.includes('nyc_williamsburg'));
    assert.ok(ids.includes('seattle_capitol_hill'));
    assert.ok(ids.includes('chicago_loop'));
  });

  test('CONFIG defines all 37 ACS Census variables', () => {
    assert.strictEqual(CONFIG.CENSUS_VARIABLE_CODES.length, 37);
    assert.ok(CONFIG.CENSUS_VARIABLES.medianIncome.code === 'B19013_001E');
    assert.ok(CONFIG.CENSUS_VARIABLES.medianHomeValue.code === 'B25077_001E');
    assert.ok(CONFIG.CENSUS_VARIABLES.medianGrossRent.code === 'B25064_001E');
    assert.ok(CONFIG.CENSUS_VARIABLES.totalPopulation.code === 'B01003_001E');
  });

  test('CONFIG defines EPA AQI categories and color thresholds', () => {
    assert.strictEqual(CONFIG.AQI_THRESHOLDS.length, 6);
    assert.strictEqual(CONFIG.AQI_THRESHOLDS[0].category, 'Good');
    assert.strictEqual(CONFIG.AQI_THRESHOLDS[0].color, '#10B981');
    assert.strictEqual(CONFIG.AQI_THRESHOLDS[5].category, 'Hazardous');
  });

  // -------------------------------------------------------------
  // 2. DATA / BENCHMARKS MATRIX TESTS
  // -------------------------------------------------------------
  console.log('\n2. Testing data/benchmarks.json:');

  test('Benchmarks file contains metadata and jurisdictions', () => {
    assert.ok(BENCHMARKS.metadata);
    assert.ok(BENCHMARKS.jurisdictions);
    assert.ok(BENCHMARKS.jurisdictions['US']);
    assert.ok(BENCHMARKS.jurisdictions['06']); // CA
    assert.ok(BENCHMARKS.jurisdictions['48']); // TX
    assert.ok(BENCHMARKS.jurisdictions['36']); // NY
    assert.ok(BENCHMARKS.jurisdictions['72']); // PR
  });

  test('Jurisdiction benchmarks contain 2022, 2020, and 2015 vintages with full demographic metrics', () => {
    const ca = BENCHMARKS.jurisdictions['06'];
    assert.ok(ca.vintages['2022']);
    assert.ok(ca.vintages['2020']);
    assert.ok(ca.vintages['2015']);
    assert.strictEqual(typeof ca.vintages['2022'].medianIncome, 'number');
    assert.strictEqual(typeof ca.vintages['2022'].medianHomeValue, 'number');
    assert.strictEqual(typeof ca.vintages['2022'].affordabilityRatio, 'number');
    assert.strictEqual(typeof ca.vintages['2022'].diversityIndex, 'number');
    assert.strictEqual(typeof ca.vintages['2022'].race, 'object');
    assert.strictEqual(typeof ca.vintages['2022'].education, 'object');
    assert.strictEqual(typeof ca.vintages['2022'].commute, 'object');
  });

  // -------------------------------------------------------------
  // 3. CALCULATIONS MODULE TESTS
  // -------------------------------------------------------------
  console.log('\n3. Testing js/calculations.js:');

  test('calculateAffordabilityRatio: accurate price-to-income and classifications', () => {
    const affordable = CALCULATIONS.calculateAffordabilityRatio(210000, 75000);
    assert.strictEqual(affordable.ratio, 2.8);
    assert.strictEqual(affordable.rating, 'Affordable');
    assert.strictEqual(affordable.color, '#10B981');

    const moderate = CALCULATIONS.calculateAffordabilityRatio(350000, 80000);
    assert.strictEqual(moderate.ratio, 4.38);
    assert.strictEqual(moderate.rating, 'Moderate');
    assert.strictEqual(moderate.color, '#F59E0B');

    const severe = CALCULATIONS.calculateAffordabilityRatio(1400000, 125000);
    assert.strictEqual(severe.ratio, 11.2);
    assert.strictEqual(severe.rating, 'Unaffordable');
    assert.strictEqual(severe.color, '#EF4444');

    const invalid = CALCULATIONS.calculateAffordabilityRatio(null, 100000);
    assert.strictEqual(invalid.ratio, null);
    assert.strictEqual(invalid.rating, 'N/A');

    const zeroIncome = CALCULATIONS.calculateAffordabilityRatio(500000, 0);
    assert.strictEqual(zeroIncome.ratio, null);
  });

  test('calculateRentBurden: HUD gross rent-to-income metric', () => {
    const affordable = CALCULATIONS.calculateRentBurden(1500, 75000);
    assert.strictEqual(affordable.percentage, 24.0);
    assert.strictEqual(affordable.rating, 'Affordable');

    const burdened = CALCULATIONS.calculateRentBurden(2000, 60000);
    assert.strictEqual(burdened.percentage, 40.0);
    assert.strictEqual(burdened.rating, 'Rent Burdened');

    const severe = CALCULATIONS.calculateRentBurden(2500, 45000);
    assert.strictEqual(severe.percentage, 66.7);
    assert.strictEqual(severe.rating, 'Severely Rent Burdened');

    const invalid = CALCULATIONS.calculateRentBurden(null, 50000);
    assert.strictEqual(invalid.percentage, null);
  });

  test("calculateDiversityIndex: Simpson's diversity formula normalized 0-100", () => {
    const equal8 = CALCULATIONS.calculateDiversityIndex([100, 100, 100, 100, 100, 100, 100, 100]);
    assert.strictEqual(equal8.simpsonsIndex, 0.875);
    assert.strictEqual(equal8.score0to100, 100);

    const mono = CALCULATIONS.calculateDiversityIndex([1000, 0, 0, 0, 0, 0, 0, 0]);
    assert.strictEqual(mono.simpsonsIndex, 0);
    assert.strictEqual(mono.score0to100, 0);

    const empty = CALCULATIONS.calculateDiversityIndex([]);
    assert.strictEqual(empty.score0to100, 0);
  });

  test('calculateGrowthDelta and calculateBenchmarkDelta', () => {
    const growth = CALCULATIONS.calculateGrowthDelta(1200000, 800000);
    assert.strictEqual(growth.absoluteDelta, 400000);
    assert.strictEqual(growth.percentageDelta, 50);
    assert.strictEqual(growth.formatted, '+50%');
    assert.strictEqual(growth.isPositive, true);

    const drop = CALCULATIONS.calculateGrowthDelta(75000, 100000);
    assert.strictEqual(drop.percentageDelta, -25);
    assert.strictEqual(drop.formatted, '-25%');
    assert.strictEqual(drop.isPositive, false);

    const bm = CALCULATIONS.calculateBenchmarkDelta(1285000, 281900);
    assert.strictEqual(bm.percentageDelta, 355.8);
    assert.strictEqual(bm.isHigher, true);
  });

  test('calculateCAGR compound growth calculation', () => {
    const cagr = CALCULATIONS.calculateCAGR(500000, 300000, 7);
    assert.strictEqual(cagr, 7.57);
    assert.strictEqual(CALCULATIONS.calculateCAGR(0, 300000, 7), 0);
  });

  // -------------------------------------------------------------
  // 4. GEOCODING MODULE TESTS
  // -------------------------------------------------------------
  console.log('\n4. Testing js/geocoding.js:');

  test('parseFipsCode splits 15-character FIPS correctly', () => {
    const res = GEOCODING.parseFipsCode('060750228013002');
    assert.strictEqual(res.stateFips, '06');
    assert.strictEqual(res.countyFips, '075');
    assert.strictEqual(res.tractFips, '022801');
    assert.strictEqual(res.isValid, true);

    const invalid = GEOCODING.parseFipsCode('123');
    assert.strictEqual(invalid.isValid, false);
  });

  await asyncTest('resolveCoordinates: primary FCC resolution', async () => {
    const mockFetch = async (url) => {
      if (url.includes('geo.fcc.gov')) {
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            Block: { FIPS: '060750228013002' },
            County: { FIPS: '06075', name: 'San Francisco County' },
            State: { FIPS: '06', code: 'CA', name: 'California' },
          }),
        };
      }
      throw new Error('Not reached');
    };

    const res = await GEOCODING.resolveCoordinates(37.7599, -122.4148, { fetch: mockFetch });
    assert.strictEqual(res.stateFips, '06');
    assert.strictEqual(res.countyFips, '075');
    assert.strictEqual(res.tractFips, '022801');
    assert.strictEqual(res.countyName, 'San Francisco County');
    assert.strictEqual(res.stateCode, 'CA');
    assert.strictEqual(res.source, 'fcc');
  });

  await asyncTest('resolveCoordinates: fallback to Census Geocoder when FCC fails', async () => {
    const mockFetch = async (url) => {
      if (url.includes('geo.fcc.gov')) {
        return { ok: false, status: 500 };
      }
      if (url.includes('geocoding.geo.census.gov')) {
        return {
          ok: true,
          json: async () => ({
            result: {
              geographies: {
                'Census Tracts': [
                  { STATE: '48', COUNTY: '453', TRACT: '001100', NAME: 'Census Tract 11, Travis County, Texas', STUSAB: 'TX', GEOID: '48453001100' },
                ],
              },
            },
          }),
        };
      }
      throw new Error('Not reached');
    };

    const res = await GEOCODING.resolveCoordinates(30.2672, -97.7431, { fetch: mockFetch });
    assert.strictEqual(res.stateFips, '48');
    assert.strictEqual(res.countyFips, '453');
    assert.strictEqual(res.tractFips, '001100');
    assert.strictEqual(res.source, 'census_geocoder');
  });

  await asyncTest('resolveCoordinates: throws error for Null Island (0, 0) or extreme out-of-bounds', async () => {
    let errorCaught = false;
    try {
      await GEOCODING.resolveCoordinates(0, 0, { fetch: async () => ({ ok: true }) });
    } catch (e) {
      errorCaught = true;
      assert.ok(e.message.includes('outside US Census coverage'));
    }
    assert.strictEqual(errorCaught, true);

    let polarError = false;
    try {
      await GEOCODING.resolveCoordinates(89.5, -100.0, { fetch: async () => ({ ok: true }) });
    } catch (e) {
      polarError = true;
      assert.ok(e.message.includes('outside US Census coverage'));
    }
    assert.strictEqual(polarError, true);
  });

  await asyncTest('searchAddress: parses search results and extracts structured address', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => [
        {
          display_name: 'Mission District, San Francisco, California, United States',
          lat: '37.7599',
          lon: '-122.4148',
          importance: 0.85,
          address: {
            neighbourhood: 'Mission District',
            city: 'San Francisco',
            state: 'California',
            postcode: '94110',
          },
        },
      ],
    });

    const results = await GEOCODING.searchAddress('Mission District San Francisco', { fetch: mockFetch });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].neighborhood, 'Mission District');
    assert.strictEqual(results[0].city, 'San Francisco');
    assert.strictEqual(results[0].stateCode, 'CA');
    assert.strictEqual(results[0].lat, 37.7599);
  });

  // -------------------------------------------------------------
  // 5. ENVIRONMENT MODULE TESTS
  // -------------------------------------------------------------
  console.log('\n5. Testing js/environment.js:');

  test('getAqiClassification maps AQI numbers to EPA color thresholds', () => {
    assert.strictEqual(ENVIRONMENT.getAqiClassification(35).category, 'Good');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(35).color, '#10B981');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(75).category, 'Moderate');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(75).color, '#F59E0B');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(125).category, 'Unhealthy for Sensitive Groups');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(125).color, '#F97316');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(175).category, 'Unhealthy');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(175).color, '#EF4444');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(250).category, 'Very Unhealthy');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(250).color, '#8B5CF6');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(400).category, 'Hazardous');
    assert.strictEqual(ENVIRONMENT.getAqiClassification(400).color, '#881337');
  });

  await asyncTest('fetchEnvironmentalData extracts AQI, weather, and elevation', async () => {
    const mockFetch = async (url) => {
      if (url.includes('air-quality')) {
        return {
          ok: true,
          json: async () => ({
            current: {
              us_aqi: 42,
              pm2_5: 9.8,
              pm10: 14.5,
              ozone: 32.0,
              nitrogen_dioxide: 11.2,
            },
            elevation: 25,
          }),
        };
      }
      if (url.includes('forecast')) {
        return {
          ok: true,
          json: async () => ({
            current: {
              temperature_2m: 68.5,
              apparent_temperature: 67.2,
              relative_humidity_2m: 62,
              weather_code: 1,
              wind_speed_10m: 8.4,
              precipitation: 0.0,
            },
            daily: {
              temperature_2m_max: [72.0],
              temperature_2m_min: [55.0],
            },
            elevation: 25,
          }),
        };
      }
      throw new Error('Not reached');
    };

    const res = await ENVIRONMENT.fetchEnvironmentalData(37.7599, -122.4148, { fetch: mockFetch });
    assert.strictEqual(res.aqi, 42);
    assert.strictEqual(res.aqiCategory, 'Good');
    assert.strictEqual(res.pm25, 9.8);
    assert.strictEqual(res.temperature, 69);
    assert.strictEqual(res.weatherDescription, 'Mainly clear');
    assert.strictEqual(res.elevation, 25);
    assert.strictEqual(res.elevationFeet, 82);
    assert.strictEqual(res.hasAqiData, true);
    assert.strictEqual(res.hasWeatherData, true);
  });

  // -------------------------------------------------------------
  // 6. WIKIPEDIA MODULE TESTS
  // -------------------------------------------------------------
  console.log('\n6. Testing js/wikipedia.js:');

  await asyncTest('fetchNearbyLandmarks extracts landmarks, summaries, distance and thumbnails', async () => {
    const mockFetch = async (url) => {
      if (url.includes('list=geosearch')) {
        return {
          ok: true,
          json: async () => ({
            query: {
              geosearch: [
                { pageid: 12345, title: 'Mission Dolores', lat: 37.764, lon: -122.426, dist: 850 },
                { pageid: 67890, title: 'Clarion Alley', lat: 37.763, lon: -122.418, dist: 420 },
              ],
            },
          }),
        };
      }
      if (url.includes('prop=pageimages|extracts')) {
        return {
          ok: true,
          json: async () => ({
            query: {
              pages: {
                12345: {
                  extract: 'Mission San Francisco de Asís, commonly known as Mission Dolores, is the oldest surviving structure in San Francisco.',
                  thumbnail: { source: 'https://example.com/mission_dolores.jpg' },
                },
                67890: {
                  extract: 'Clarion Alley is a small street in the Mission District notable for its community murals.',
                  thumbnail: null,
                },
              },
            },
          }),
        };
      }
      throw new Error('Not reached');
    };

    const landmarks = await WIKIPEDIA.fetchNearbyLandmarks(37.7599, -122.4148, 3500, 5, { fetch: mockFetch });
    assert.strictEqual(landmarks.length, 2);
    assert.strictEqual(landmarks[0].title, 'Mission Dolores');
    assert.strictEqual(landmarks[0].distanceMeters, 850);
    assert.strictEqual(landmarks[0].distanceMiles, 0.53);
    assert.strictEqual(landmarks[0].thumbnailUrl, 'https://example.com/mission_dolores.jpg');
    assert.ok(landmarks[0].summary.includes('Mission San Francisco de Asís'));
    assert.strictEqual(landmarks[1].title, 'Clarion Alley');
  });

  await asyncTest('fetchNearbyLandmarks handles empty search results in rural/remote areas gracefully', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ query: { geosearch: [] } }),
    });

    const landmarks = await WIKIPEDIA.fetchNearbyLandmarks(31.8493, -103.5786, 3500, 5, { fetch: mockFetch });
    assert.strictEqual(Array.isArray(landmarks), true);
    assert.strictEqual(landmarks.length, 0);
  });

  // -------------------------------------------------------------
  // 7. CENSUS MODULE TESTS & FALLBACK CASCADE
  // -------------------------------------------------------------
  console.log('\n7. Testing js/census.js & Fallback Cascade:');

  test('sanitizeCensusValue suppresses negative sentinels', () => {
    assert.strictEqual(CENSUS.sanitizeCensusValue(-666666666), null);
    assert.strictEqual(CENSUS.sanitizeCensusValue(-999999999), null);
    assert.strictEqual(CENSUS.sanitizeCensusValue('-888888888'), null);
    assert.strictEqual(CENSUS.sanitizeCensusValue(null), null);
    assert.strictEqual(CENSUS.sanitizeCensusValue(''), null);
    assert.strictEqual(CENSUS.sanitizeCensusValue(125000), 125000);
    assert.strictEqual(CENSUS.sanitizeCensusValue('125000'), 125000);
    assert.strictEqual(CENSUS.sanitizeCensusValue('$1,280,000'), 1280000);
  });

  await asyncTest('fetchCensusProfile: Level 1 Tract Resolution', async () => {
    const mockFetch = async (url) => {
      if (url.includes('for=tract:022801')) {
        const headerRow = CONFIG.CENSUS_VARIABLE_CODES;
        const valRow = headerRow.map(code => {
          if (code === 'B01003_001E') return '4850'; // Total Pop
          if (code === 'B01002_001E') return '35.4'; // Median Age
          if (code === 'B19013_001E') return '118400'; // Income
          if (code === 'B25077_001E') return '1285000'; // Home Val
          if (code === 'B25064_001E') return '2450'; // Rent
          if (code === 'B25003_001E') return '2200'; // Total Units
          if (code === 'B25003_002E') return '650'; // Owner Units
          if (code === 'B25003_003E') return '1550'; // Renter Units
          if (code === 'B03002_001E') return '4850';
          if (code === 'B03002_003E') return '2100'; // White NH
          if (code === 'B03002_004E') return '250'; // Black NH
          if (code === 'B03002_006E') return '850'; // Asian NH
          if (code === 'B03002_012E') return '1450'; // Hispanic
          if (code === 'B15003_001E') return '3600'; // Total 25+
          if (code === 'B15003_022E') return '1400'; // Bachelor
          if (code === 'B15003_023E') return '600'; // Master
          if (code === 'B08301_001E') return '2800'; // Total Workers
          if (code === 'B08301_010E') return '1100'; // Transit
          if (code === 'B08301_019E') return '450'; // Walk
          if (code === 'B08301_021E') return '800'; // WFH
          return '0';
        });
        return {
          ok: true,
          text: async () => JSON.stringify([headerRow, valRow]),
        };
      }
      throw new Error('Not reached');
    };

    const profile = await CENSUS.fetchCensusProfile('06', '075', '022801', '94110', '2022', { fetch: mockFetch });
    assert.strictEqual(profile.resolution, 'tract');
    assert.strictEqual(profile.metrics.totalPopulation, 4850);
    assert.strictEqual(profile.metrics.medianIncome, 118400);
    assert.strictEqual(profile.metrics.homeValue, 1285000);
    assert.strictEqual(profile.metrics.affordabilityRatio, 10.85);
    assert.strictEqual(profile.metrics.affordabilityRating, 'Unaffordable');
    assert.ok(profile.stateBenchmark);
    assert.ok(profile.usBenchmark);
  });

  await asyncTest('fetchCensusProfile: Level 2 ZCTA Cascade when Tract unmapped', async () => {
    const mockFetch = async (url) => {
      if (url.includes('for=tract:')) {
        // Tract returns 404 or empty
        return { ok: false, status: 404 };
      }
      if (url.includes('zip+code+tabulation+area:94110')) {
        const headerRow = CONFIG.CENSUS_VARIABLE_CODES;
        const valRow = headerRow.map(code => {
          if (code === 'B01003_001E') return '69500';
          if (code === 'B19013_001E') return '125000';
          if (code === 'B25077_001E') return '1350000';
          return '0';
        });
        return {
          ok: true,
          text: async () => JSON.stringify([headerRow, valRow]),
        };
      }
      throw new Error('Not reached');
    };

    const profile = await CENSUS.fetchCensusProfile('06', '075', '999999', '94110', '2022', { fetch: mockFetch });
    assert.strictEqual(profile.resolution, 'zcta');
    assert.strictEqual(profile.metrics.totalPopulation, 69500);
    assert.strictEqual(profile.metrics.medianIncome, 125000);
  });

  await asyncTest('fetchCensusProfile: Level 3 County Cascade when Tract & ZCTA missing', async () => {
    const mockFetch = async (url) => {
      if (url.includes('for=tract:') || url.includes('zip+code+tabulation+area:')) {
        return { ok: false, status: 404 };
      }
      if (url.includes('for=county:075')) {
        const headerRow = CONFIG.CENSUS_VARIABLE_CODES;
        const valRow = headerRow.map(code => {
          if (code === 'B01003_001E') return '870000';
          if (code === 'B19013_001E') return '126000';
          if (code === 'B25077_001E') return '1380000';
          return '0';
        });
        return {
          ok: true,
          text: async () => JSON.stringify([headerRow, valRow]),
        };
      }
      throw new Error('Not reached');
    };

    const profile = await CENSUS.fetchCensusProfile('06', '075', '999999', '', '2022', { fetch: mockFetch });
    assert.strictEqual(profile.resolution, 'county');
    assert.strictEqual(profile.metrics.totalPopulation, 870000);
  });

  await asyncTest('fetchCensusProfile: Level 4 Benchmark Cascade when API throttled / HTML Missing Key', async () => {
    const mockFetch = async () => {
      // Census API returning HTML error page
      return {
        ok: true,
        text: async () => '<html><head><title>Missing Key</title></head><body><h1>Missing Key</h1></body></html>',
      };
    };

    const profile = await CENSUS.fetchCensusProfile('06', '075', '022801', '94110', '2022', { fetch: mockFetch });
    assert.strictEqual(profile.resolution, 'benchmark');
    assert.strictEqual(profile.isFallback, true);
    assert.strictEqual(profile.metrics.name, 'California');
    assert.strictEqual(profile.metrics.medianIncome, 91551);
  });

  console.log('\n===============================================================');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
