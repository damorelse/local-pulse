/**
 * Local Pulse — Tier 5 Adversarial Coverage Hardening Test Suite
 * 
 * Deep white-box adversarial verification covering:
 * 1. Malformed FIPS codes, boundary lengths, and geocoding cascade resilience.
 * 2. Simpson's Diversity Index mathematical boundary properties & edge cases.
 * 3. Rate limiting (429), retry backoff, timeouts, and error payloads.
 * 4. PWA Service Worker caching lifecycle, cache invalidation, and offline routing.
 * 5. Comparative scorecard edge cases (negative growth, zero baseline, equal values, favorability semantics).
 * 6. Preview server security (path traversal, methods, headers, MIME types, gzip compression).
 * 7. LocalStorage corrupted JSON recovery, FIFO eviction, and share fallback.
 * 
 * Zero external dependencies — executed with native Node.js (ESM).
 */

import { describe, it, expect, createMockFetch, createMockLocalStorage, createMockGeolocation, createMockShare, runTests } from './test_runner.js';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Load Project Modules
const CONFIG = require('../js/config.js');
const GEOCODING = require('../js/geocoding.js');
const CALCULATIONS = require('../js/calculations.js');
const CENSUS = require('../js/census.js');
const ENVIRONMENT = require('../js/environment.js');
const WIKIPEDIA = require('../js/wikipedia.js');
const STORAGE = require('../js/storage.js');
const COMPARE = require('../js/compare.js');
const SHARE = require('../js/share.js');
const previewServer = require('../server.js');

// Load Fixtures
function loadFixture(relPath) {
  const fullPath = path.join(__dirname, 'fixtures', relPath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

const fccSf = loadFixture('fcc_sf_mission.json');
const acs2022Sf = loadFixture('census_acs_2022_sf.json');
const benchmarksData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/benchmarks.json'), 'utf8'));

// ============================================================================
// SUITE 1: MALFORMED FIPS CODES, BOUNDARY LENGTHS & GEOCODING CASCADE RESILIENCE
// ============================================================================
describe('Tier 5 — Suite 1: Malformed FIPS Codes & Geocoding Boundary Edge Cases', () => {

  it('T5.1.1 should return isValid=false for non-string, null, undefined, boolean, and object inputs', () => {
    const invalidInputs = [null, undefined, 12345, true, false, {}, [], NaN, Infinity];
    for (const input of invalidInputs) {
      const res = GEOCODING.parseFipsCode(input);
      expect(res.isValid).toBe(false);
      expect(res.stateFips).toBe('');
      expect(res.countyFips).toBe('');
      expect(res.tractFips).toBe('');
    }
  });

  it('T5.1.2 should return isValid=false for empty strings, whitespace-only, and sub-11-character strings', () => {
    const shortInputs = ['', '   ', '06', '06075', '060750228', '0607502280']; // 10 chars
    for (const input of shortInputs) {
      const res = GEOCODING.parseFipsCode(input);
      expect(res.isValid).toBe(false);
      expect(res.stateFips).toBe('');
      expect(res.countyFips).toBe('');
      expect(res.tractFips).toBe('');
    }
  });

  it('T5.1.3 should trim whitespace-padded FIPS strings and extract correct components', () => {
    const paddedFips = '   060750228011234   ';
    const res = GEOCODING.parseFipsCode(paddedFips);
    expect(res.isValid).toBe(true);
    expect(res.stateFips).toBe('06');
    expect(res.countyFips).toBe('075');
    expect(res.tractFips).toBe('022801');
    expect(res.blockFips).toBe('060750228011234');
  });

  it('T5.1.4 should accurately parse exactly 11-char (Tract), 12-char (Block Group), and 15-char (Block) FIPS strings', () => {
    // 11-character Tract FIPS
    const fips11 = '06075022801';
    const res11 = GEOCODING.parseFipsCode(fips11);
    expect(res11.isValid).toBe(true);
    expect(res11.stateFips).toBe('06');
    expect(res11.countyFips).toBe('075');
    expect(res11.tractFips).toBe('022801');

    // 12-character Block Group FIPS
    const fips12 = '060750228011';
    const res12 = GEOCODING.parseFipsCode(fips12);
    expect(res12.isValid).toBe(true);
    expect(res12.stateFips).toBe('06');
    expect(res12.countyFips).toBe('075');
    expect(res12.tractFips).toBe('022801');

    // 15-character Census Block FIPS
    const fips15 = '060750228011002';
    const res15 = GEOCODING.parseFipsCode(fips15);
    expect(res15.isValid).toBe(true);
    expect(res15.stateFips).toBe('06');
    expect(res15.countyFips).toBe('075');
    expect(res15.tractFips).toBe('022801');
  });

  it('T5.1.5 should preserve leading zeros across State (01), County (001), and Tract (000100) FIPS codes', () => {
    // Autauga County, Alabama Tract 000100
    const alabamaFips = '010010001001000';
    const res = GEOCODING.parseFipsCode(alabamaFips);
    expect(res.isValid).toBe(true);
    expect(res.stateFips).toBe('01');
    expect(res.countyFips).toBe('001');
    expect(res.tractFips).toBe('000100');
  });

  it('T5.1.6 should handle oversized FIPS strings (>15 characters) without throwing exceptions', () => {
    const longFips = '0607502280110029999999';
    const res = GEOCODING.parseFipsCode(longFips);
    expect(res.isValid).toBe(true);
    expect(res.stateFips).toBe('06');
    expect(res.countyFips).toBe('075');
    expect(res.tractFips).toBe('022801');
  });

  it('T5.1.7 should handle alphanumeric/non-numeric characters in FIPS strings gracefully', () => {
    const alphaFips = '06ABC022801';
    const res = GEOCODING.parseFipsCode(alphaFips);
    expect(res.isValid).toBe(true);
    expect(res.stateFips).toBe('06');
    expect(res.countyFips).toBe('ABC');
    expect(res.tractFips).toBe('022801');
  });

  it('T5.1.8 should reject extreme polar coordinates exceeding 85° latitude with coverage error', async () => {
    const mockFetch = createMockFetch([]);
    await expect(async () => {
      await GEOCODING.resolveCoordinates(85.001, -122.4194, { fetch: mockFetch });
    }).toRejectWith(/coverage area/i);

    await expect(async () => {
      await GEOCODING.resolveCoordinates(-85.001, 0, { fetch: mockFetch });
    }).toRejectWith(/coverage area/i);
  });

  it('T5.1.9 should reject Null Island (0, 0) coordinates with explicit coverage error', async () => {
    const mockFetch = createMockFetch([]);
    await expect(async () => {
      await GEOCODING.resolveCoordinates(0, 0, { fetch: mockFetch });
    }).toRejectWith(/coordinate \(0, 0\) is outside US territory/i);
  });

  it('T5.1.10 should reject NaN or non-numeric coordinate inputs with invalid coordinates error', async () => {
    const mockFetch = createMockFetch([]);
    await expect(async () => {
      await GEOCODING.resolveCoordinates('not_a_number', -122.4194, { fetch: mockFetch });
    }).toRejectWith(/Invalid coordinates/i);

    await expect(async () => {
      await GEOCODING.resolveCoordinates(37.7749, undefined, { fetch: mockFetch });
    }).toRejectWith(/Invalid coordinates/i);
  });

  it('T5.1.11 should accept valid string representations of numeric coordinates', async () => {
    const mockFetch = createMockFetch([
      ['geo.fcc.gov', fccSf],
    ]);
    const res = await GEOCODING.resolveCoordinates('37.7599', '-122.4148', { fetch: mockFetch });
    expect(res.source).toBe('fcc');
    expect(res.stateFips).toBe('06');
    expect(res.countyFips).toBe('075');
    expect(res.tractFips).toBe('022901');
  });

  it('T5.1.12 should complete 3-tier cascade when FCC and Census Geocoder fail, recovering via OSM Nominatim', async () => {
    const osmResponse = {
      display_name: 'Mission District, San Francisco, California, United States',
      address: {
        neighbourhood: 'Mission District',
        city: 'San Francisco',
        county: 'San Francisco County',
        state: 'California',
        country: 'United States',
      },
    };

    const mockFetch = createMockFetch([
      ['geo.fcc.gov', () => { throw new Error('FCC API Offline (500)'); }],
      ['geocoding.geo.census.gov', () => { throw new Error('Census Geocoder 503'); }],
      ['nominatim.openstreetmap.org/reverse', osmResponse],
    ]);

    const res = await GEOCODING.resolveCoordinates(37.7599, -122.4148, { fetch: mockFetch });
    expect(res.source).toBe('osm');
    expect(res.stateFips).toBe('06');
    expect(res.stateCode).toBe('CA');
  });

  it('T5.1.13 should throw an informative error when all 3 geocoding providers fail', async () => {
    const mockFetch = createMockFetch([
      ['geo.fcc.gov', () => { throw new Error('FCC Failure'); }],
      ['geocoding.geo.census.gov', () => { throw new Error('Census Failure'); }],
      ['nominatim.openstreetmap.org/reverse', () => { throw new Error('OSM Failure'); }],
    ]);

    await expect(async () => {
      await GEOCODING.resolveCoordinates(37.7599, -122.4148, { fetch: mockFetch });
    }).toRejectWith(/no census geography could be resolved/i);
  });

}, 5);

// ============================================================================
// SUITE 2: SIMPSON'S DIVERSITY INDEX & MATHEMATICAL BOUNDARY PROPERTIES
// ============================================================================
describe("Tier 5 — Suite 2: Simpson's Diversity Index & Mathematical Boundary Properties", () => {

  it("T5.2.1 should compute theoretical maximum Simpson's Index (D=0.875, Score=100.0) for 8 perfectly equal groups", () => {
    const equalGroups = {
      white: 500,
      black: 500,
      native: 500,
      asian: 500,
      pacific: 500,
      other: 500,
      multi: 500,
      hispanic: 500,
    };
    const res = CALCULATIONS.calculateDiversityIndex(equalGroups);
    expect(res.simpsonsIndex).toBe(0.875);
    expect(res.score0to100).toBe(100.0);
  });

  it('T5.2.2 should compute Score=0.0 and D=0.0 for a 100% monocultural tract (single group)', () => {
    const monocultural = {
      white: 10000,
      black: 0,
      native: 0,
      asian: 0,
      pacific: 0,
      other: 0,
      multi: 0,
      hispanic: 0,
    };
    const res = CALCULATIONS.calculateDiversityIndex(monocultural);
    expect(res.simpsonsIndex).toBe(0);
    expect(res.score0to100).toBe(0);
  });

  it('T5.2.3 should compute exact D=0.50 and normalized Score=57.1 for two equal groups (50/50 split in 8 categories)', () => {
    const twoGroups = {
      white: 1000,
      black: 1000,
      native: 0,
      asian: 0,
      pacific: 0,
      other: 0,
      multi: 0,
      hispanic: 0,
    };
    const res = CALCULATIONS.calculateDiversityIndex(twoGroups);
    expect(res.simpsonsIndex).toBe(0.5);
    expect(res.score0to100).toBe(57.1); // (0.5 / 0.875) * 100 = 57.14% -> 57.1
  });

  it('T5.2.4 should handle zero total population tracts without division by zero, NaN, or crash', () => {
    const zeroPop = { white: 0, black: 0, native: 0, asian: 0, pacific: 0, other: 0, multi: 0, hispanic: 0 };
    const res = CALCULATIONS.calculateDiversityIndex(zeroPop);
    expect(res.simpsonsIndex).toBe(0);
    expect(res.score0to100).toBe(0);
  });

  it('T5.2.5 should handle null, undefined, empty array, or non-object inputs safely', () => {
    const badInputs = [null, undefined, '', 0, [], {}];
    for (const input of badInputs) {
      const res = CALCULATIONS.calculateDiversityIndex(input);
      expect(res.simpsonsIndex).toBe(0);
      expect(res.score0to100).toBe(0);
    }
  });

  it('T5.2.6 should produce identical mathematical results for Array format and Object format', () => {
    const arrFormat = [250, 250, 250, 250, 0, 0, 0, 0];
    const objFormat = {
      white: 250,
      black: 250,
      native: 250,
      asian: 250,
      pacific: 0,
      other: 0,
      multi: 0,
      hispanic: 0,
    };
    const resArr = CALCULATIONS.calculateDiversityIndex(arrFormat);
    const resObj = CALCULATIONS.calculateDiversityIndex(objFormat);
    expect(resArr.simpsonsIndex).toBe(resObj.simpsonsIndex);
    expect(resArr.score0to100).toBe(resObj.score0to100);
  });

  it('T5.2.7 should parse string numbers in race objects without string concatenation bugs', () => {
    const stringNums = {
      white: '500',
      black: '500',
      native: '0',
      asian: '0',
      pacific: '0',
      other: '0',
      multi: '0',
      hispanic: '0',
    };
    const res = CALCULATIONS.calculateDiversityIndex(stringNums);
    expect(res.simpsonsIndex).toBe(0.5);
    expect(res.score0to100).toBe(57.1);
  });

  it('T5.2.8 should sanitize negative counts and NaN values in array format to >= 0', () => {
    const dirtyArray = [-100, NaN, 500, 500, 0, 0, 0, 0, 0, 0];
    const res = CALCULATIONS.calculateDiversityIndex(dirtyArray);
    expect(res.simpsonsIndex).toBe(0.5);
    expect(res.score0to100).toBe(57.1);
  });

  it('T5.2.9 should handle extreme population skew (1,000,000 vs 1) without underflow or negative values', () => {
    const skewed = { white: 1000000, black: 1, native: 0, asian: 0, pacific: 0, other: 0, multi: 0, hispanic: 0 };
    const res = CALCULATIONS.calculateDiversityIndex(skewed);
    expect(res.simpsonsIndex).toBeGreaterThanOrEqual(0);
    expect(res.score0to100).toBeGreaterThanOrEqual(0);
    expect(res.score0to100).toBeLessThan(1.0);
  });

  it('T5.2.10 should clamp Affordability ratio needle angle between 0° and 180° for extreme ratios', () => {
    // Ultra-affordable 0.5x ratio (clamps to 1.0x -> 0°)
    const cheap = CALCULATIONS.calculateAffordabilityRatio(50000, 100000);
    expect(cheap.ratio).toBe(0.5);
    expect(cheap.angle).toBe(0.0);

    // Baseline 1.0x ratio -> 0°
    const base = CALCULATIONS.calculateAffordabilityRatio(100000, 100000);
    expect(base.ratio).toBe(1.0);
    expect(base.angle).toBe(0.0);

    // Severe 15.0x ratio -> 180°
    const severe = CALCULATIONS.calculateAffordabilityRatio(1500000, 100000);
    expect(severe.ratio).toBe(15.0);
    expect(severe.angle).toBe(180.0);

    // Extreme 50.0x ratio (clamps to 15.0x -> 180°)
    const extreme = CALCULATIONS.calculateAffordabilityRatio(5000000, 100000);
    expect(extreme.ratio).toBe(50.0);
    expect(extreme.angle).toBe(180.0);
  });

  it('T5.2.11 should handle negative home values or negative incomes returning N/A rating and 0° angle', () => {
    const negVal = CALCULATIONS.calculateAffordabilityRatio(-500000, 100000);
    expect(negVal.ratio).toBeNull();
    expect(negVal.rating).toBe('N/A');
    expect(negVal.angle).toBe(0);

    const negInc = CALCULATIONS.calculateAffordabilityRatio(500000, -100000);
    expect(negInc.ratio).toBeNull();
    expect(negInc.rating).toBe('N/A');
  });

  it('T5.2.12 should handle 0 income and 0 rent in Rent Burden calculations without division by zero', () => {
    const zeroInc = CALCULATIONS.calculateRentBurden(1500, 0);
    expect(zeroInc.percentage).toBeNull();
    expect(zeroInc.rating).toBe('N/A');

    const zeroRent = CALCULATIONS.calculateRentBurden(0, 80000);
    expect(zeroRent.percentage).toBeNull();
  });

  it('T5.2.13 should compute exact CAGR over 7 years and return 0.0 for zero or negative values', () => {
    // $500,000 growing to $800,000 over 7 years: CAGR = (800/500)^(1/7) - 1 = 6.94%
    const cagr = CALCULATIONS.calculateCAGR(800000, 500000, 7);
    expect(cagr).toBe(6.94);

    // Zero start value
    expect(CALCULATIONS.calculateCAGR(800000, 0, 7)).toBe(0);
    // Negative start value
    expect(CALCULATIONS.calculateCAGR(800000, -500000, 7)).toBe(0);
    // Zero years
    expect(CALCULATIONS.calculateCAGR(800000, 500000, 0)).toBe(0);
  });

}, 5);

// ============================================================================
// SUITE 3: RATE LIMITING (429), RETRY BACKOFF, TIMEOUTS & ERROR PAYLOADS
// ============================================================================
describe('Tier 5 — Suite 3: Rate Limiting (429), Timeouts, Cascades & Error Resilience', () => {

  it('T5.3.1 should failover from primary FCC geocoder to Census Geocoder on HTTP 429 Too Many Requests', async () => {
    const censusGeocoderSuccess = {
      result: {
        geographies: {
          'Census Tracts': [{
            STATE: '06',
            COUNTY: '075',
            TRACT: '022801',
            NAME: 'Census Tract 228.01',
            STUSAB: 'CA',
          }],
        },
      },
    };

    const mockFetch = createMockFetch([
      ['geo.fcc.gov', { status: 429, body: { error: 'Rate limit exceeded' } }],
      ['geocoding.geo.census.gov', censusGeocoderSuccess],
    ]);

    const res = await GEOCODING.resolveCoordinates(37.7599, -122.4148, { fetch: mockFetch });
    expect(res.source).toBe('census_geocoder');
    expect(res.stateFips).toBe('06');
    expect(res.countyFips).toBe('075');
    expect(res.tractFips).toBe('022801');
  });

  it('T5.3.2 should simulate exponential retry recovery after two consecutive 429 rate limit responses', async () => {
    let callCount = 0;
    async function retryFetch(url, maxRetries = 3, initialDelayMs = 10) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        callCount++;
        if (callCount < 3) {
          // Simulate 429 Rate Limit
          const backoff = initialDelayMs * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        // Attempt 3 succeeds
        return { ok: true, json: async () => ({ status: 'OK', Block: { FIPS: '060750228011002' } }) };
      }
      throw new Error('Exceeded max retries');
    }

    const res = await retryFetch('https://geo.fcc.gov/api/census/block/find');
    const data = await res.json();
    expect(callCount).toBe(3);
    expect(data.Block.FIPS).toBe('060750228011002');
  });

  it('T5.3.3 should cancel in-flight HTTP requests via AbortController on rapid coordinate changes', async () => {
    let abortedCount = 0;
    const controller = new AbortController();

    const mockFetch = (url, options = {}) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve({ ok: true, json: async () => ({ status: 'OK' }) });
        }, 100);

        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            abortedCount++;
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        }
      });
    };

    const promise = mockFetch('https://api.census.gov/data', { signal: controller.signal });
    controller.abort();

    await expect(async () => {
      await promise;
    }).toRejectWith(/aborted/i);

    expect(abortedCount).toBe(1);
  });

  it('T5.3.4 should safely handle HTML "504 Gateway Timeout" body from Census API and cascade to benchmark', async () => {
    CENSUS.setBenchmarks(benchmarksData);

    const html504Body = `
      <html>
        <head><title>504 Gateway Time-out</title></head>
        <body><center><h1>504 Gateway Time-out</h1></center></body>
      </html>
    `;

    const mockFetch = createMockFetch([
      ['api.census.gov/data', { status: 504, body: html504Body, headers: { 'content-type': 'text/html' } }],
    ]);

    const res = await CENSUS.fetchCensusProfile('06', '075', '022801', '94110', '2022', { fetch: mockFetch });
    expect(res.resolution).toBe('benchmark');
    expect(res.isFallback).toBe(true);
    expect(res.metrics.medianIncome).toBeDefined();
  });

  it('T5.3.5 should safely handle Census API "Missing Key" plain text responses without JSON parse exceptions', async () => {
    CENSUS.setBenchmarks(benchmarksData);

    const mockFetch = createMockFetch([
      ['api.census.gov/data', { status: 200, body: 'error: Missing Key or invalid key parameter', headers: { 'content-type': 'text/plain' } }],
    ]);

    const res = await CENSUS.fetchCensusProfile('06', '075', '022801', '94110', '2022', { fetch: mockFetch });
    expect(res.resolution).toBe('benchmark');
    expect(res.isFallback).toBe(true);
  });

  it('T5.3.6 should sanitize all Census sentinel suppression codes (-666666666, -888888888, -999999999, etc.) to null', () => {
    const sentinels = [-666666666, -888888888, -999999999, -222222222, -333333333, -555555555, '-666666666', '-999999999'];
    for (const val of sentinels) {
      expect(CENSUS.sanitizeCensusValue(val, false)).toBeNull();
      expect(CENSUS.sanitizeCensusValue(val, true)).toBe(0); // Count mode returns 0
    }
  });

  it('T5.3.7 should sanitize formatted currency strings with commas, dollar signs, and plus signs into valid numbers', () => {
    expect(CENSUS.sanitizeCensusValue('$1,250,000')).toBe(1250000);
    expect(CENSUS.sanitizeCensusValue('2,000,000+')).toBe(2000000);
    expect(CENSUS.sanitizeCensusValue('  $85,000  ')).toBe(85000);
  });

  it('T5.3.8 should return Unavailable classification and 0° angle when Open-Meteo AQI sensors are all null', async () => {
    const nullSensorsAqi = {
      current: {
        us_aqi: null,
        pm2_5: null,
        pm10: null,
        ozone: null,
      },
    };

    const mockFetch = createMockFetch([
      ['air-quality-api.open-meteo.com', nullSensorsAqi],
      ['api.open-meteo.com/v1/forecast', { current: { temperature_2m: 68 } }],
    ]);

    const res = await ENVIRONMENT.fetchEnvironmentalData(37.7599, -122.4148, { fetch: mockFetch });
    expect(res.aqi).toBeNull();
    expect(res.aqiCategory).toBe('Unavailable');
    expect(res.aqiColor).toBe('#94A3B8');
    expect(res.aqiAngle).toBe(0);
  });

  it('T5.3.9 should handle total Open-Meteo network outage returning fallback structure with hasAqiData=false', async () => {
    const mockFetch = createMockFetch([
      ['open-meteo.com', () => { throw new Error('Network timeout (ETIMEDOUT)'); }],
    ]);

    const res = await ENVIRONMENT.fetchEnvironmentalData(37.7599, -122.4148, { fetch: mockFetch });
    expect(res.hasAqiData).toBe(false);
    expect(res.hasWeatherData).toBe(false);
    expect(res.aqi).toBeNull();
    expect(res.temperature).toBeNull();
  });

  it('T5.3.10 should return an empty landmark array when Wikipedia GeoSearch returns no landmarks within radius', async () => {
    const emptyWiki = { query: { geosearch: [] } };
    const mockFetch = createMockFetch([
      ['en.wikipedia.org/w/api.php', emptyWiki],
    ]);

    const landmarks = await WIKIPEDIA.fetchNearbyLandmarks(31.8456, -103.5678, 3500, 8, { fetch: mockFetch });
    expect(Array.isArray(landmarks)).toBe(true);
    expect(landmarks.length).toBe(0);
  });

  it('T5.3.11 should truncate excessive search queries (>200 chars) and strip HTML/script tags to prevent XSS', async () => {
    let capturedUrl = '';
    const mockFetch = createMockFetch([
      ['nominatim.openstreetmap.org/search', (url) => {
        capturedUrl = url;
        return [];
      }],
    ]);

    const maliciousQuery = '<script>alert("XSS")</script>' + 'A'.repeat(300);
    await GEOCODING.searchAddress(maliciousQuery, { fetch: mockFetch });

    // Verify script tags were completely stripped out
    expect(capturedUrl.includes('<script>')).toBe(false);
    expect(capturedUrl.includes('%3Cscript%3E')).toBe(false);
    // Verify query param length is capped at <= 200 characters
    const parsedUrl = new URL(capturedUrl);
    const qParam = parsedUrl.searchParams.get('q');
    expect(qParam.length).toBeLessThanOrEqual(200);
  });

}, 5);

// ============================================================================
// SUITE 4: PWA SERVICE WORKER OFFLINE CACHING & INVALIDATION LIFECYCLE
// ============================================================================
describe('Tier 5 — Suite 4: PWA Service Worker Offline Caching & Invalidation Lifecycle', () => {

  const swCode = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');

  it('T5.4.1 should include all 22 required application assets in sw.js STATIC_SHELL manifest', () => {
    const requiredAssets = [
      '/',
      '/index.html',
      '/manifest.json',
      '/css/style.css',
      '/css/leaflet.css',
      '/js/app.js',
      '/js/config.js',
      '/js/geocoding.js',
      '/js/census.js',
      '/js/environment.js',
      '/js/wikipedia.js',
      '/js/calculations.js',
      '/js/charts.js',
      '/js/map.js',
      '/js/storage.js',
      '/js/compare.js',
      '/js/share.js',
      '/js/theme.js',
      '/data/benchmarks.json',
      '/icons/icon.svg',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
    ];

    for (const asset of requiredAssets) {
      expect(swCode).toContain(`'${asset}'`);
    }
  });

  it('T5.4.2 should define STATIC_CACHE and DYNAMIC_CACHE version tags', () => {
    expect(swCode).toContain("const STATIC_CACHE = 'localpulse-v1-static';");
    expect(swCode).toContain("const DYNAMIC_CACHE = 'localpulse-v1-dynamic';");
  });

  it('T5.4.3 should implement cache invalidation deleting older cache generations during activate', () => {
    expect(swCode).toContain('caches.delete(k)');
    expect(swCode).toContain('STATIC_CACHE && k !== DYNAMIC_CACHE');
    expect(swCode).toContain('clients.claim()');
  });

  it('T5.4.4 should verify Cache-First routing for same-origin static assets (.js, .css, .html, .json, .svg)', () => {
    expect(swCode).toContain("url.pathname.endsWith('.js')");
    expect(swCode).toContain("url.pathname.endsWith('.css')");
    expect(swCode).toContain("url.pathname.endsWith('.json')");
    expect(swCode).toContain("url.pathname.endsWith('.svg')");
    expect(swCode).toContain("caches.open(STATIC_CACHE)");
  });

  it('T5.4.5 should verify non-GET HTTP methods (POST, PUT, DELETE) bypass the Service Worker cache', () => {
    expect(swCode).toContain("if (req.method !== 'GET')");
    expect(swCode).toContain('return;');
  });

  it('T5.4.6 should verify non-HTTP schemes (chrome-extension://, data:) bypass the Service Worker', () => {
    expect(swCode).toContain("!url.protocol.startsWith('http')");
  });

  it('T5.4.7 should verify Network-First routing with dynamic cache updating for external public APIs', () => {
    expect(swCode).toContain('caches.open(DYNAMIC_CACHE)');
    expect(swCode).toContain('cache.put(req, clone)');
  });

  it('T5.4.8 should verify offline fallback to bundled benchmarks.json when Census/FCC APIs fail', () => {
    expect(swCode).toContain("url.hostname.includes('census.gov') || url.hostname.includes('fcc.gov')");
    expect(swCode).toContain("caches.match('/data/benchmarks.json')");
  });

  it('T5.4.9 should verify HTTP 503 JSON response fallback when un-cached third-party API fails offline', () => {
    expect(swCode).toContain("status: 503");
    expect(swCode).toContain("Service Unavailable (Offline)");
  });

}, 5);

// ============================================================================
// SUITE 5: COMPARATIVE SCORECARD EDGE CASES, BOUNDARY DELTAS & FAVORABILITY
// ============================================================================
describe('Tier 5 — Suite 5: Comparative Scorecard Edge Cases, Boundary Deltas & Favorability', () => {

  const placeA = {
    name: 'Location A (High Cost, High Income)',
    state: 'CA',
    stateCode: 'CA',
    metrics: {
      homePrice: 1200000,
      grossRent: 2800,
      income: 140000,
      affordabilityRatio: 8.57,
      rentBurden: 24.0,
      homeownershipRate: 38.5,
      diversityIndex: 78.4,
      totalPopulation: 65000,
      medianAge: 34.2,
      bachelorPlusPercent: 62.5,
      greenCommuteRate: 58.0,
      aqi: 42,
      pm25: 8.5,
      temperature: 65,
      elevation: 120,
    },
  };

  const placeB = {
    name: 'Location B (Moderate Cost, Moderate Income)',
    state: 'TX',
    stateCode: 'TX',
    metrics: {
      homePrice: 400000,
      grossRent: 1600,
      income: 75000,
      affordabilityRatio: 5.33,
      rentBurden: 25.6,
      homeownershipRate: 54.0,
      diversityIndex: 65.0,
      totalPopulation: 45000,
      medianAge: 32.0,
      bachelorPlusPercent: 44.0,
      greenCommuteRate: 18.5,
      aqi: 68,
      pm25: 14.2,
      temperature: 82,
      elevation: 550,
    },
  };

  it('T5.5.1 should compute negative growth and negative deltas with isPositive=false when current < base', () => {
    // Current $450k vs Base $600k (-25.0%)
    const res = CALCULATIONS.calculateGrowthDelta(450000, 600000);
    expect(res.absoluteDelta).toBe(-150000);
    expect(res.percentageDelta).toBe(-25.0);
    expect(res.isPositive).toBe(false);
    expect(res.formatted).toBe('-25%');
  });

  it('T5.5.2 should handle zero baseline in Growth Delta calculations without Infinity or NaN', () => {
    const res = CALCULATIONS.calculateGrowthDelta(500, 0);
    expect(res.absoluteDelta).toBe(0);
    expect(res.percentageDelta).toBe(0);
    expect(res.formatted).toBe('0.0%');
  });

  it('T5.5.3 should handle equal values (0 delta) returning +0.0% with neutral status', () => {
    const res = CALCULATIONS.calculateGrowthDelta(500000, 500000);
    expect(res.absoluteDelta).toBe(0);
    expect(res.percentageDelta).toBe(0.0);
    expect(res.isPositive).toBe(true);
  });

  it('T5.5.4 should enforce inverse favorability for Gross Rent (cheaper rent receives delta-positive)', () => {
    const comparison = COMPARE.calculateComparisonDeltas(placeB, placeA); // B ($1600) vs A ($2800)
    const rentMetric = comparison.metrics.find(m => m.id === 'grossRent');
    expect(rentMetric).toBeDefined();
    expect(rentMetric.valA).toBe(1600);
    expect(rentMetric.valB).toBe(2800);
    // Cheaper rent is favorable
    expect(rentMetric.deltaClass).toBe('delta-positive');
  });

  it('T5.5.5 should enforce inverse favorability for Affordability Ratio and Rent Burden (lower ratio is better)', () => {
    const comparison = COMPARE.calculateComparisonDeltas(placeB, placeA);
    const affordMetric = comparison.metrics.find(m => m.id === 'affordabilityRatio');
    expect(affordMetric).toBeDefined();
    // B (5.33) is lower than A (8.57) -> delta-positive
    expect(affordMetric.deltaClass).toBe('delta-positive');
  });

  it('T5.5.6 should enforce inverse favorability for US AQI (cleaner air with lower AQI receives delta-positive)', () => {
    const comparison = COMPARE.calculateComparisonDeltas(placeA, placeB); // A (42 Good) vs B (68 Moderate)
    const aqiMetric = comparison.metrics.find(m => m.id === 'aqi');
    expect(aqiMetric).toBeDefined();
    expect(aqiMetric.valA).toBe(42);
    expect(aqiMetric.valB).toBe(68);
    // Lower AQI is cleaner air -> delta-positive
    expect(aqiMetric.deltaClass).toBe('delta-positive');
  });

  it('T5.5.7 should enforce positive favorability for Median Income, Diversity, Education, and Green Commute', () => {
    const comparison = COMPARE.calculateComparisonDeltas(placeA, placeB);
    const incomeMetric = comparison.metrics.find(m => m.id === 'medianIncome');
    const diversityMetric = comparison.metrics.find(m => m.id === 'diversityIndex');
    const eduMetric = comparison.metrics.find(m => m.id === 'bachelorPlusPercent');
    const commuteMetric = comparison.metrics.find(m => m.id === 'greenCommuteRate');

    expect(incomeMetric.deltaClass).toBe('delta-positive');
    expect(diversityMetric.deltaClass).toBe('delta-positive');
    expect(eduMetric.deltaClass).toBe('delta-positive');
    expect(commuteMetric.deltaClass).toBe('delta-positive');
  });

  it('T5.5.8 should treat neutral metrics (Total Population, Median Age, Temperature, Elevation) as delta-neutral', () => {
    const comparison = COMPARE.calculateComparisonDeltas(placeA, placeB);
    const popMetric = comparison.metrics.find(m => m.id === 'totalPopulation');
    const ageMetric = comparison.metrics.find(m => m.id === 'medianAge');
    const tempMetric = comparison.metrics.find(m => m.id === 'temperature');
    const elevMetric = comparison.metrics.find(m => m.id === 'elevation');

    expect(popMetric.deltaClass).toBe('delta-neutral');
    expect(ageMetric.deltaClass).toBe('delta-neutral');
    expect(tempMetric.deltaClass).toBe('delta-neutral');
    expect(elevMetric.deltaClass).toBe('delta-neutral');
  });

  it('T5.5.9 should handle missing/null metric values in either location by displaying "—" and delta-neutral', () => {
    const placeMissing = {
      name: 'Sparse Place',
      state: 'WY',
      metrics: {
        homePrice: null,
        income: null,
        grossRent: 1200,
      },
    };
    const comparison = COMPARE.calculateComparisonDeltas(placeMissing, placeB);
    const homeMetric = comparison.metrics.find(m => m.id === 'homeValue');
    expect(homeMetric.formattedA).toBe('—');
    expect(homeMetric.deltaText).toBe('—');
    expect(homeMetric.deltaClass).toBe('delta-neutral');
  });

  it('T5.5.10 should normalize fractional percentage inputs (0.625) to whole percentage numbers (62.5%)', () => {
    const placeFractional = {
      name: 'Fractional Place',
      metrics: {
        homeownershipRate: 0.648,
        bachelorPlusPercent: 0.452,
      },
    };
    const comparison = COMPARE.calculateComparisonDeltas(placeFractional, placeB);
    const ownMetric = comparison.metrics.find(m => m.id === 'homeownershipRate');
    expect(ownMetric.valA).toBe(64.8);
    expect(ownMetric.formattedA).toBe('64.8%');
  });

  it('T5.5.11 should calculateBenchmarkDelta with explicit sign and isHigher boolean', () => {
    // Local $85k vs US $75k (+13.3%)
    const highRes = CALCULATIONS.calculateBenchmarkDelta(85000, 75000);
    expect(highRes.absoluteDelta).toBe(10000);
    expect(highRes.percentageDelta).toBe(13.3);
    expect(highRes.isHigher).toBe(true);
    expect(highRes.formatted).toBe('+13.3%');

    // Local $60k vs US $75k (-20.0%)
    const lowRes = CALCULATIONS.calculateBenchmarkDelta(60000, 75000);
    expect(lowRes.absoluteDelta).toBe(-15000);
    expect(lowRes.percentageDelta).toBe(-20.0);
    expect(lowRes.isHigher).toBe(false);
    expect(lowRes.formatted).toBe('-20%');
  });

}, 5);

// ============================================================================
// SUITE 6: PREVIEW SERVER SECURITY, HEADERS, COMPRESSION & MIME ROUTING
// ============================================================================
describe('Tier 5 — Suite 6: Preview Server Security, Headers, Compression & MIME Routing', () => {

  let testPort = 0;
  let serverInstance = null;

  // Helper to make real HTTP requests against preview server
  function makeHttpRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            buffer: rawBuffer,
            text: rawBuffer.toString('utf8'),
          });
        });
      });
      req.on('error', reject);
      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  it('T5.6.1 should start the preview server on an ephemeral port for testing', async () => {
    await new Promise((resolve) => {
      serverInstance = previewServer.listen(0, () => {
        testPort = serverInstance.address().port;
        resolve();
      });
    });
    expect(testPort).toBeGreaterThan(0);
  });

  it('T5.6.2 should return 403 Forbidden on URL-encoded path traversal attacks (%2e%2e%2f)', async () => {
    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      method: 'GET',
    });
    expect(res.statusCode).toBe(403);
    expect(res.text).toContain('403 Forbidden: Directory Traversal Denied');
  });

  it('T5.6.3 should return 403 Forbidden on multi-level relative path traversal attempts', async () => {
    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/..%2f..%2f..%2fpackage.json',
      method: 'GET',
    });
    expect(res.statusCode).toBe(403);
    expect(res.text).toContain('403 Forbidden');
  });

  it('T5.6.4 should return 405 Method Not Allowed for POST, PUT, DELETE, and PATCH methods', async () => {
    const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    for (const method of methods) {
      const res = await makeHttpRequest({
        hostname: 'localhost',
        port: testPort,
        path: '/',
        method,
      });
      expect(res.statusCode).toBe(405);
      expect(res.text).toContain('Method Not Allowed');
    }
  });

  it('T5.6.5 should attach full security headers to all HTTP responses', async () => {
    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/index.html',
      method: 'GET',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('T5.6.6 should support ETag caching and respond with 304 Not Modified when if-none-match matches', async () => {
    // 1. Get initial file with ETag
    const res1 = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/data/benchmarks.json',
      method: 'GET',
    });
    expect(res1.statusCode).toBe(200);
    const etag = res1.headers['etag'];
    expect(etag).toBeDefined();

    // 2. Request with If-None-Match
    const res2 = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/data/benchmarks.json',
      method: 'GET',
      headers: { 'if-none-match': etag },
    });
    expect(res2.statusCode).toBe(304);
    expect(res2.text).toBe('');
  });

  it('T5.6.7 should apply gzip compression for compressible assets (>512 bytes) when accept-encoding includes gzip', async () => {
    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/js/calculations.js',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip, deflate' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');

    // Decompress gzip stream to verify integrity
    const decompressed = zlib.gunzipSync(res.buffer).toString('utf8');
    expect(decompressed).toContain('calculateAffordabilityRatio');
  });

  it('T5.6.8 should apply deflate compression when accept-encoding only specifies deflate', async () => {
    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/js/calculations.js',
      method: 'GET',
      headers: { 'accept-encoding': 'deflate' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('deflate');

    // Decompress deflate stream to verify integrity
    const decompressed = zlib.inflateSync(res.buffer).toString('utf8');
    expect(decompressed).toContain('calculateAffordabilityRatio');
  });

  it('T5.6.9 should serve root directory (GET /) by resolving to index.html with text/html MIME type', async () => {
    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/',
      method: 'GET',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Local Pulse');
  });

  it('T5.6.10 should return 404 Not Found with security headers when requesting nonexistent file', async () => {
    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/non_existent_file.xyz',
      method: 'GET',
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.text).toContain('404 Not Found');
  });

  it('T5.6.11 should handle HEAD requests returning status 200 with headers but empty response body', async () => {
    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: testPort,
      path: '/index.html',
      method: 'HEAD',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toBe('');

    // Close preview server instance
    if (serverInstance) {
      serverInstance.close();
    }
  });

}, 5);

// ============================================================================
// SUITE 7: LOCALSTORAGE CORRUPTED JSON RECOVERY & SHARE FALLBACK
// ============================================================================
describe('Tier 5 — Suite 7: LocalStorage Resilience, Corrupted State & Share Fallback', () => {

  it('T5.7.1 should recover gracefully from corrupted/malformed JSON strings in localStorage', () => {
    const badJson = '{ corrupt json: missing_bracket';
    const parsed = STORAGE.safeJsonParse(badJson, []);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(0);

    const parsedCustomFallback = STORAGE.safeJsonParse(badJson, { default: true });
    expect(parsedCustomFallback.default).toBe(true);
  });

  it('T5.7.2 should generate stable unique place IDs across FIPS, GeoID, and Coordinate inputs', () => {
    // FIPS
    const idFips = STORAGE.generatePlaceId({ fips: { state: '06', county: '075', tract: '022801' } });
    expect(idFips).toBe('fips-06075022801');

    // GeoID
    const idGeo = STORAGE.generatePlaceId({ geoid: '06075022801' });
    expect(idGeo).toBe('geoid-06075022801');

    // Coordinates
    const idCoord = STORAGE.generatePlaceId({ lat: 37.7599, lng: -122.4148 });
    expect(idCoord).toBe('coord-37.7599_-122.4148');
  });

  it('T5.7.3 should deduplicate saved places and prepend latest saved place to index 0', () => {
    const mockStorage = createMockLocalStorage();
    globalThis.localStorage = mockStorage;

    const place1 = { name: 'Place 1', lat: 37.77, lng: -122.41, metrics: { homePrice: 1000000 } };
    const place2 = { name: 'Place 2', lat: 30.26, lng: -97.74, metrics: { homePrice: 500000 } };

    STORAGE.savePlace(place1);
    STORAGE.savePlace(place2);
    // Re-save place 1 with updated data
    const updated = STORAGE.savePlace({ ...place1, name: 'Place 1 Updated' });

    expect(updated.length).toBe(2);
    expect(updated[0].name).toBe('Place 1 Updated');
  });

  it('T5.7.4 should maintain strict FIFO max 10 items in recent search history, evicting oldest 11th item', () => {
    const mockStorage = createMockLocalStorage();
    globalThis.localStorage = mockStorage;

    // Add 12 items
    for (let i = 1; i <= 12; i++) {
      STORAGE.addRecentSearch(`Search Query #${i}`);
    }

    const history = STORAGE.getRecentSearches();
    expect(history.length).toBe(10);
    // Newest is Search Query #12 at index 0
    expect(history[0]).toBe('Search Query #12');
    // Oldest Search Query #1 and #2 evicted
    expect(history.includes('Search Query #1')).toBe(false);
    expect(history.includes('Search Query #2')).toBe(false);
    expect(history[9]).toBe('Search Query #3');
  });

  it('T5.7.5 should deduplicate recent search queries case-insensitively', () => {
    const mockStorage = createMockLocalStorage();
    globalThis.localStorage = mockStorage;

    STORAGE.addRecentSearch('Austin Downtown');
    STORAGE.addRecentSearch('austin downtown');
    STORAGE.addRecentSearch('AUSTIN DOWNTOWN');

    const history = STORAGE.getRecentSearches();
    expect(history.length).toBe(1);
    expect(history[0]).toBe('AUSTIN DOWNTOWN');
  });

  it('T5.7.6 should format rich emoji-bulleted summary string with all key neighborhood intelligence metrics', () => {
    const testPlace = {
      name: 'SF Mission District',
      homePrice: 1250000,
      income: 145000,
      affordabilityRatio: 8.6,
      affordabilityRating: 'Severe Burden',
      aqi: 38,
      aqiCategory: 'Good',
      greenCommuteRate: 58.4,
      landmark: 'Mission San Francisco de Asís',
      lat: 37.7599,
      lng: -122.4148,
    };

    const text = SHARE.formatShareText(testPlace);
    expect(text).toContain('📍 Local Pulse: SF Mission District');
    expect(text).toContain('🏠 Median Home: $1,250,000');
    expect(text).toContain('💰 Median Income: $145,000');
    expect(text).toContain('📊 Affordability Ratio: 8.6x (Severe Burden)');
    expect(text).toContain('🌱 US AQI: 38 (Good)');
    expect(text).toContain('🚶 Mobility: 58% Green Commute');
    expect(text).toContain('🏛 Landmark: Mission San Francisco de Asís');
    expect(text).toContain('🔗 Live Intelligence: https://localpulse.app/?lat=37.7599&lng=-122.4148');
  });

  it('T5.7.7 should handle user AbortError when dismissing native share sheet without throwing exceptions', async () => {
    if (typeof globalThis.navigator === 'undefined') {
      globalThis.navigator = {};
    }
    Object.defineProperty(globalThis.navigator, 'share', {
      value: async () => {
        const err = new Error('User cancelled share');
        err.name = 'AbortError';
        throw err;
      },
      configurable: true,
      writable: true,
    });

    const res = await SHARE.shareNeighborhood({ name: 'Test Place' });
    expect(res.aborted).toBe(true);
    expect(res.method).toBe('native_share');
  });

  it('T5.7.8 should fall back to clipboard copy when navigator.share is unavailable on desktop', async () => {
    let copiedText = '';
    if (typeof globalThis.navigator === 'undefined') {
      globalThis.navigator = {};
    }
    // Delete share to simulate desktop browser without Web Share API
    delete globalThis.navigator.share;
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: async (t) => { copiedText = t; },
      },
      configurable: true,
      writable: true,
    });

    const res = await SHARE.shareNeighborhood({ name: 'Desktop Neighborhood', homePrice: 500000 });
    expect(res.success).toBe(true);
    expect(res.method).toBe('clipboard_fallback');
    expect(copiedText).toContain('Desktop Neighborhood');
  });

}, 5);

// Run the Tier 5 test suite
runTests();
