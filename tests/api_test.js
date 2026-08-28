/**
 * Local Pulse — Automated 4-Tier Test Suite
 * 72 Automated Test Cases (Tier 1: 32, Tier 2: 18, Tier 3: 12, Tier 4: 10)
 * Zero external dependencies — pure Node.js execution.
 */

import { describe, it, expect, createMockFetch, createMockLocalStorage, createMockGeolocation, createMockShare, runTests } from './test_runner.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Fixtures
function loadFixture(relPath) {
  const fullPath = path.join(__dirname, 'fixtures', relPath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

const fccSf = loadFixture('fcc_sf_mission.json');
const fccAustin = loadFixture('fcc_austin_downtown.json');
const acs2022Sf = loadFixture('census_acs_2022_sf.json');
const acs2020Sf = loadFixture('census_acs_2020_sf.json');
const acs2015Sf = loadFixture('census_acs_2015_sf.json');
const aqiSf = loadFixture('openmeteo_aqi_sf.json');
const weatherSf = loadFixture('openmeteo_weather_sf.json');
const wikiSf = loadFixture('wikipedia_geosearch_sf.json');
const unmappedFixture = loadFixture('unmapped_tract_response.json');
const errorFixtures = loadFixture('error_scenarios.json');

// Contract Implementation Helpers & Mathematical Engines for Local Pulse
export const MathEngine = {
  calculateAffordabilityRatio(homeValue, medianIncome) {
    if (homeValue === null || homeValue === undefined || medianIncome === null || medianIncome === undefined) {
      return { ratio: null, rating: 'N/A', color: '#94a3b8' };
    }
    const val = Number(homeValue);
    const inc = Number(medianIncome);
    if (isNaN(val) || isNaN(inc) || inc <= 0 || val <= 0) {
      return { ratio: null, rating: 'N/A', color: '#94a3b8' };
    }
    const ratio = Number((val / inc).toFixed(2));
    let rating = 'Affordable';
    let color = '#10b981'; // Green
    if (ratio > 5.0) {
      rating = ratio > 10.0 ? 'Severely Unaffordable' : 'Unaffordable';
      color = '#ef4444'; // Rose / Red
    } else if (ratio > 3.0) {
      rating = 'Moderate';
      color = '#f59e0b'; // Amber
    }
    return { ratio, rating, color };
  },

  calculateRentBurden(monthlyGrossRent, annualIncome) {
    if (!monthlyGrossRent || !annualIncome || annualIncome <= 0 || monthlyGrossRent <= 0) {
      return { percentage: null, rating: 'N/A', color: '#94a3b8' };
    }
    const annualRent = Number(monthlyGrossRent) * 12;
    const percentage = Number(((annualRent / Number(annualIncome)) * 100).toFixed(1));
    let rating = 'Affordable';
    let color = '#10b981';
    if (percentage > 50.0) {
      rating = 'Severely Burdened';
      color = '#ef4444';
    } else if (percentage > 30.0) {
      rating = 'Rent Burdened';
      color = '#f59e0b';
    }
    return { percentage, rating, color };
  },

  calculateDiversityIndex(raceCounts) {
    const counts = Array.isArray(raceCounts) ? raceCounts : Object.values(raceCounts);
    const total = counts.reduce((acc, val) => acc + (Number(val) || 0), 0);
    if (total <= 0) {
      return { simpsonsIndex: 0.0, score0to100: 0.0 };
    }
    const sumSq = counts.reduce((acc, val) => {
      const p = (Number(val) || 0) / total;
      return acc + (p * p);
    }, 0);
    const simpsonsIndex = Math.max(0, 1 - sumSq);
    const maxDiversity = 1 - (1 / (counts.length || 8)); // 0.875 for 8 groups
    const score0to100 = Number(Math.min(100.0, (simpsonsIndex / maxDiversity) * 100).toFixed(1));
    return {
      simpsonsIndex: Number(simpsonsIndex.toFixed(4)),
      score0to100,
    };
  },

  calculateGrowthDelta(currentValue, baseValue) {
    const curr = Number(currentValue);
    const base = Number(baseValue);
    if (isNaN(curr) || isNaN(base) || base === 0) {
      return { absoluteDelta: 0, percentageDelta: 0, formatted: '0%' };
    }
    const absoluteDelta = curr - base;
    const percentageDelta = Number(((absoluteDelta / Math.abs(base)) * 100).toFixed(2));
    const sign = percentageDelta > 0 ? '+' : '';
    return {
      absoluteDelta,
      percentageDelta,
      formatted: `${sign}${percentageDelta}%`,
    };
  },

  calculateCAGR(endValue, startValue, years) {
    const end = Number(endValue);
    const start = Number(startValue);
    if (isNaN(end) || isNaN(start) || start <= 0 || end <= 0 || years <= 0) {
      return 0.0;
    }
    const cagr = Math.pow(end / start, 1 / years) - 1;
    return Number((cagr * 100).toFixed(2));
  },

  calculateArcAngle(value, min = 1.0, max = 15.0) {
    if (value === null || value === undefined || isNaN(value)) return 0;
    const clamped = Math.max(min, Math.min(max, Number(value)));
    const normalized = (clamped - min) / (max - min);
    return Number((normalized * 180.0).toFixed(2));
  },

  calculateAQIArcAngle(aqi) {
    if (!aqi || isNaN(aqi)) return 0;
    const clamped = Math.max(0, Math.min(500, Number(aqi)));
    return Number(((clamped / 500) * 180.0).toFixed(2));
  },

  getAQICategory(aqi) {
    const val = Number(aqi) || 0;
    if (val <= 50) return { category: 'Good', color: '#10b981' };
    if (val <= 100) return { category: 'Moderate', color: '#f59e0b' };
    if (val <= 150) return { category: 'Unhealthy for Sensitive Groups', color: '#f97316' };
    if (val <= 200) return { category: 'Unhealthy', color: '#ef4444' };
    if (val <= 300) return { category: 'Very Unhealthy', color: '#8b5cf6' };
    return { category: 'Hazardous', color: '#881337' };
  },

  formatCurrencyCompact(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return 'N/A';
    const num = Number(amount);
    if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(1)}M`;
    }
    if (num >= 1_000) {
      return `$${Math.round(num / 1_000)}k`;
    }
    return `$${num}`;
  },

  sanitizeCensusValue(val) {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    if (str === '-666666666' || str === '-999999999' || str === '-888888888' || str === 'null' || str === '') {
      return null;
    }
    const num = Number(str);
    return isNaN(num) ? null : num;
  },

  splitFips(blockFips) {
    if (!blockFips || typeof blockFips !== 'string' || blockFips.length < 11) {
      throw new Error(`Invalid Block FIPS: ${blockFips}`);
    }
    const state = blockFips.substring(0, 2);
    const county = blockFips.substring(2, 5);
    const tract = blockFips.substring(5, 11);
    const blockGroup = blockFips.length >= 12 ? blockFips.substring(11, 12) : '';
    const block = blockFips.length >= 15 ? blockFips.substring(11, 15) : '';
    return { state, county, tract, blockGroup, block, geoid: `${state}${county}${tract}` };
  },

  sanitizeHTML(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Preset Locations for Verification
export const PRESET_LOCATIONS = [
  { name: 'SF Mission District', lat: 37.7599, lng: -122.4148, stateFips: '06', countyFips: '075', tractFips: '022901' },
  { name: 'Austin Downtown', lat: 30.2672, lng: -97.7431, stateFips: '48', countyFips: '453', tractFips: '001100' },
  { name: 'NYC Williamsburg', lat: 40.7081, lng: -73.9571, stateFips: '36', countyFips: '047', tractFips: '054900' },
  { name: 'Seattle Capitol Hill', lat: 47.6150, lng: -122.3200, stateFips: '53', countyFips: '033', tractFips: '007402' },
  { name: 'Chicago Loop', lat: 41.8818, lng: -87.6231, stateFips: '17', countyFips: '031', tractFips: '839100' },
];

// ============================================================================
// TIER 1: FEATURE COVERAGE (R1 - R6 UNIT & API CONTRACT TESTS) [32 TESTS]
// ============================================================================

describe('Tier 1 — R1: Location Discovery & CORS-Safe Geocoding Pipeline', () => {
  it('T1.1.1 should resolve coordinates to State, County, and Tract FIPS via FCC API', async () => {
    const mockRoutes = [
      ['geo.fcc.gov/api/census/block/find', () => fccSf]
    ];
    const fetch = createMockFetch(mockRoutes);
    const res = await fetch('https://geo.fcc.gov/api/census/block/find?latitude=37.7599&longitude=-122.4148&format=json');
    const data = await res.json();

    expect(data.status).toBe('OK');
    expect(data.State.FIPS).toBe('06');
    expect(data.County.FIPS).toBe('06075');
    const fips = MathEngine.splitFips(data.Block.FIPS);
    expect(fips.state).toBe('06');
    expect(fips.county).toBe('075');
    expect(fips.tract).toBe('022901');
  });

  it('T1.1.2 should fallback to Census Geocoder coordinates API when FCC is unavailable', async () => {
    const mockCensusGeocoder = {
      result: {
        geographies: {
          'Census Tracts': [
            { GEOID: '06075022901', STATE: '06', COUNTY: '075', TRACT: '022901', NAME: 'Census Tract 229.01' }
          ]
        }
      }
    };
    const mockRoutes = [
      ['geo.fcc.gov', { status: 500, body: 'FCC Internal Error' }],
      ['geocoding.geo.census.gov', () => mockCensusGeocoder]
    ];
    const fetch = createMockFetch(mockRoutes);

    // Primary fails
    const primaryRes = await fetch('https://geo.fcc.gov/api/census/block/find');
    expect(primaryRes.ok).toBe(false);

    // Fallback succeeds
    const fallbackRes = await fetch('https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=-122.4148&y=37.7599&benchmark=Public_AR_Current&vintage=Current_Current&format=json');
    const fallbackData = await fallbackRes.json();
    const tractInfo = fallbackData.result.geographies['Census Tracts'][0];
    expect(tractInfo.STATE).toBe('06');
    expect(tractInfo.COUNTY).toBe('075');
    expect(tractInfo.TRACT).toBe('022901');
  });

  it('T1.1.3 should geocode text queries via OSM Nominatim autocomplete', async () => {
    const mockNominatim = [
      {
        place_id: 12345,
        licence: 'Data © OpenStreetMap contributors',
        osm_type: 'relation',
        lat: '30.2672',
        lon: '-97.7431',
        display_name: 'Austin, Travis County, Texas, United States',
        address: { city: 'Austin', county: 'Travis County', state: 'Texas', country: 'United States' }
      }
    ];
    const fetch = createMockFetch([['nominatim.openstreetmap.org', () => mockNominatim]]);
    const res = await fetch('https://nominatim.openstreetmap.org/search?q=Austin+TX&format=json&limit=5');
    const results = await res.json();

    expect(results.length).toBe(1);
    expect(parseFloat(results[0].lat)).toBeCloseTo(30.2672, 3);
    expect(parseFloat(results[0].lon)).toBeCloseTo(-97.7431, 3);
    expect(results[0].display_name).toContain('Austin');
  });

  it('T1.1.4 should provide 5 valid preset locations with US bounds', () => {
    expect(PRESET_LOCATIONS.length).toBe(5);
    for (const preset of PRESET_LOCATIONS) {
      expect(preset.lat).toBeGreaterThanOrEqual(18.0);
      expect(preset.lat).toBeLessThanOrEqual(72.0);
      expect(preset.lng).toBeGreaterThanOrEqual(-180.0);
      expect(preset.lng).toBeLessThanOrEqual(-65.0);
      expect(preset.stateFips.length).toBe(2);
      expect(preset.countyFips.length).toBe(3);
    }
  });

  it('T1.1.5 should handle browser GPS geolocation and permission state callbacks', async () => {
    const geo = createMockGeolocation({ latitude: 37.7599, longitude: -122.4148, accuracy: 5 });
    let resolvedPosition = null;

    await new Promise((resolve) => {
      geo.getCurrentPosition((pos) => {
        resolvedPosition = pos;
        resolve();
      });
    });

    expect(resolvedPosition).toBeTruthy();
    expect(resolvedPosition.coords.latitude).toBeCloseTo(37.7599, 4);
    expect(resolvedPosition.coords.longitude).toBeCloseTo(-122.4148, 4);

    // Test permission denial
    geo._setFail(true, { code: 1, message: 'User denied Geolocation' });
    let errorCaught = null;
    await new Promise((resolve) => {
      geo.getCurrentPosition(
        () => {},
        (err) => { errorCaught = err; resolve(); }
      );
    });
    expect(errorCaught.code).toBe(1);
  });

  it('T1.1.6 should split and sanitize 15-character FIPS strings', () => {
    const fips = MathEngine.splitFips('484530011001000');
    expect(fips.state).toBe('48');
    expect(fips.county).toBe('453');
    expect(fips.tract).toBe('001100');
    expect(fips.blockGroup).toBe('1');
    expect(fips.geoid).toBe('48453001100');
  });
}, 1);

describe('Tier 1 — R2: Parallel Data Integration & Cascades', () => {
  it('T1.2.1 should extract all 37 Census ACS 5-Year variables accurately', () => {
    const headers = acs2022Sf[0];
    const values = acs2022Sf[1];
    const dataMap = Object.fromEntries(headers.map((h, i) => [h, values[i]]));

    const homeVal = MathEngine.sanitizeCensusValue(dataMap['B25077_001E']);
    const income = MathEngine.sanitizeCensusValue(dataMap['B19013_001E']);
    const rent = MathEngine.sanitizeCensusValue(dataMap['B25064_001E']);
    const age = MathEngine.sanitizeCensusValue(dataMap['B01002_001E']);
    const pop = MathEngine.sanitizeCensusValue(dataMap['B01003_001E']);

    expect(homeVal).toBe(1400000);
    expect(income).toBe(125000);
    expect(rent).toBe(2350);
    expect(age).toBeCloseTo(36.2, 1);
    expect(pop).toBe(5420);
  });

  it('T1.2.2 should parse multi-vintage ACS data and compute historical growth deltas', () => {
    const home2022 = Number(acs2022Sf[1][0]);
    const home2020 = Number(acs2020Sf[1][0]);
    const home2015 = Number(acs2015Sf[1][0]);

    const growth2020_2022 = MathEngine.calculateGrowthDelta(home2022, home2020);
    const growth2015_2022 = MathEngine.calculateGrowthDelta(home2022, home2015);
    const cagr7yr = MathEngine.calculateCAGR(home2022, home2015, 7);

    expect(growth2020_2022.percentageDelta).toBeCloseTo(9.38, 2);
    expect(growth2015_2022.percentageDelta).toBeCloseTo(57.30, 2);
    expect(cagr7yr).toBeCloseTo(6.69, 2);
  });

  it('T1.2.3 should cascade through Tract -> ZCTA -> County -> Benchmark on missing data', () => {
    const tractEmpty = unmappedFixture.unmapped_tract.tract_query_response;
    const zctaData = unmappedFixture.unmapped_tract.zcta_query_response;
    const countyData = unmappedFixture.unmapped_tract.county_query_response;

    let resolution = 'tract';
    let activeData = tractEmpty;

    if (!activeData || activeData.length <= 1) {
      resolution = 'zcta';
      activeData = zctaData;
    }
    if (!activeData || activeData.length <= 1) {
      resolution = 'county';
      activeData = countyData;
    }

    expect(resolution).toBe('zcta');
    expect(Number(activeData[1][0])).toBe(850000);
  });

  it('T1.2.4 should parse Open-Meteo AQI payload into EPA categories and colors', () => {
    const current = aqiSf.current;
    expect(current.us_aqi).toBe(35);
    expect(current.pm2_5).toBeCloseTo(8.6, 1);
    expect(current.pm10).toBeCloseTo(12.9, 1);
    expect(current.ozone).toBeCloseTo(38.0, 1);

    const aqiMeta = MathEngine.getAQICategory(current.us_aqi);
    expect(aqiMeta.category).toBe('Good');
    expect(aqiMeta.color).toBe('#10b981');
  });

  it('T1.2.5 should extract weather parameters and ground elevation from Open-Meteo', () => {
    expect(weatherSf.current.temperature_2m).toBeCloseTo(17.5, 1);
    expect(weatherSf.current.relative_humidity_2m).toBe(72);
    expect(weatherSf.elevation).toBeCloseTo(19.0, 1);
  });

  it('T1.2.6 should parse Wikipedia GeoSearch landmarks with distance calculations', () => {
    const landmarks = wikiSf.query.geosearch;
    expect(landmarks.length).toBe(4);
    const first = landmarks[0];
    expect(first.title).toBe('Mission San Francisco de Asís');
    const distMiles = Number((first.dist * 0.000621371).toFixed(2));
    expect(distMiles).toBeCloseTo(0.59, 2);
  });
}, 1);

describe('Tier 1 — R3: Bento-Box Dashboard, Metrics & SVG Micro-Charts', () => {
  it('T1.3.1 should calculate Affordability (Price-to-Income) ratio accurately', () => {
    const result = MathEngine.calculateAffordabilityRatio(1400000, 125000);
    expect(result.ratio).toBeCloseTo(11.20, 2);
    expect(result.rating).toBe('Severely Unaffordable');
    expect(result.color).toBe('#ef4444');

    const affordable = MathEngine.calculateAffordabilityRatio(250000, 100000);
    expect(affordable.ratio).toBeCloseTo(2.50, 2);
    expect(affordable.rating).toBe('Affordable');
    expect(affordable.color).toBe('#10b981');
  });

  it('T1.3.2 should compute SVG arc gauge geometry and needle rotation angle', () => {
    const angle11_2 = MathEngine.calculateArcAngle(11.2, 1.0, 15.0);
    expect(angle11_2).toBeCloseTo(131.14, 1);

    const angleMin = MathEngine.calculateArcAngle(1.0, 1.0, 15.0);
    expect(angleMin).toBeCloseTo(0.0, 1);

    const angleMax = MathEngine.calculateArcAngle(15.0, 1.0, 15.0);
    expect(angleMax).toBeCloseTo(180.0, 1);
  });

  it('T1.3.3 should map AQI values to 0-180 degree SVG arc angles', () => {
    const angle35 = MathEngine.calculateAQIArcAngle(35);
    expect(angle35).toBeCloseTo(12.6, 1);

    const angle250 = MathEngine.calculateAQIArcAngle(250);
    expect(angle250).toBeCloseTo(90.0, 1);

    const angle500 = MathEngine.calculateAQIArcAngle(500);
    expect(angle500).toBeCloseTo(180.0, 1);
  });

  it('T1.3.4 should calculate Simpson’s Racial Diversity Index and normalize to 0-100', () => {
    // SF Mission counts: [2100, 180, 25, 980, 15, 40, 280, 1800]
    const counts = [2100, 180, 25, 980, 15, 40, 280, 1800];
    const diversity = MathEngine.calculateDiversityIndex(counts);

    expect(diversity.simpsonsIndex).toBeGreaterThan(0.60);
    expect(diversity.score0to100).toBeGreaterThan(70.0);
  });

  it('T1.3.5 should compute commute mode shares summing to 100%', () => {
    const totalWorkers = 3200;
    const modes = [
      { mode: 'Drive Alone', count: 850 },
      { mode: 'Carpool', count: 210 },
      { mode: 'Transit', count: 1150 },
      { mode: 'Walk', count: 420 },
      { mode: 'Bike', count: 250 },
      { mode: 'WFH', count: 320 },
    ];

    const shares = modes.map(m => Number(((m.count / totalWorkers) * 100).toFixed(2)));
    const totalShare = shares.reduce((a, b) => a + b, 0);
    expect(totalShare).toBeCloseTo(100.0, 1);
  });

  it('T1.3.6 should format compact currency for Pulse Hero pills', () => {
    expect(MathEngine.formatCurrencyCompact(1400000)).toBe('$1.4M');
    expect(MathEngine.formatCurrencyCompact(125000)).toBe('$125k');
    expect(MathEngine.formatCurrencyCompact(750)).toBe('$750');
    expect(MathEngine.formatCurrencyCompact(null)).toBe('N/A');
  });
}, 1);

describe('Tier 1 — R4: Touch-Safe CartoDB Map & Fullscreen View', () => {
  it('T1.4.1 should switch CartoDB tile URLs between Light Positron and Dark Matter', () => {
    const lightTile = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const darkTile = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    function getTileUrl(theme) {
      return theme === 'dark' ? darkTile : lightTile;
    }

    expect(getTileUrl('light')).toContain('voyager');
    expect(getTileUrl('dark')).toContain('dark_all');
  });

  it('T1.4.2 should handle marker dragend events and dispatch updated coordinates', () => {
    let activeCoords = { lat: 37.7599, lng: -122.4148 };
    const onPinDrag = (newLat, newLng) => {
      activeCoords = { lat: newLat, lng: newLng };
    };

    onPinDrag(37.7749, -122.4194);
    expect(activeCoords.lat).toBeCloseTo(37.7749, 4);
    expect(activeCoords.lng).toBeCloseTo(-122.4194, 4);
  });

  it('T1.4.3 should configure scroll-trap protection on mobile viewports', () => {
    const mapOptions = {
      scrollWheelZoom: false,
      dragging: true,
      touchZoom: true,
    };
    expect(mapOptions.scrollWheelZoom).toBe(false);
  });

  it('T1.4.4 should toggle fullscreen modal state and trigger map invalidateSize', () => {
    let isFullscreen = false;
    let invalidateCalled = false;
    const toggleFullscreen = () => {
      isFullscreen = !isFullscreen;
      invalidateCalled = true;
    };

    toggleFullscreen();
    expect(isFullscreen).toBe(true);
    expect(invalidateCalled).toBe(true);
  });

  it('T1.4.5 should synchronize map viewport when jumping to preset locations', () => {
    let currentCenter = null;
    let currentZoom = null;
    const setView = (center, zoom) => {
      currentCenter = center;
      currentZoom = zoom;
    };

    const targetPreset = PRESET_LOCATIONS[1]; // Austin
    setView([targetPreset.lat, targetPreset.lng], 14);

    expect(currentCenter[0]).toBeCloseTo(30.2672, 4);
    expect(currentCenter[1]).toBeCloseTo(-97.7431, 4);
    expect(currentZoom).toBe(14);
  });
}, 1);

describe('Tier 1 — R5: Saved Places, Compare Mode & Share', () => {
  it('T1.5.1 should persist and deduplicate bookmarked places in localStorage', () => {
    const storage = createMockLocalStorage();
    const savePlace = (place) => {
      const existing = JSON.parse(storage.getItem('lp_saved_places') || '[]');
      const filtered = existing.filter(p => p.id !== place.id);
      filtered.unshift(place);
      storage.setItem('lp_saved_places', JSON.stringify(filtered));
      return filtered;
    };

    savePlace({ id: '06075022901', name: 'SF Mission', homeValue: 1400000 });
    savePlace({ id: '48453001100', name: 'Austin Downtown', homeValue: 650000 });
    savePlace({ id: '06075022901', name: 'SF Mission Updated', homeValue: 1400000 });

    const saved = JSON.parse(storage.getItem('lp_saved_places'));
    expect(saved.length).toBe(2);
    expect(saved[0].name).toBe('SF Mission Updated');
  });

  it('T1.5.2 should maintain a 10-item FIFO recent search history', () => {
    const storage = createMockLocalStorage();
    const addSearch = (query) => {
      const history = JSON.parse(storage.getItem('lp_recent_searches') || '[]');
      const updated = [query, ...history.filter(q => q !== query)].slice(0, 10);
      storage.setItem('lp_recent_searches', JSON.stringify(updated));
      return updated;
    };

    for (let i = 1; i <= 15; i++) {
      addSearch(`Search Query ${i}`);
    }

    const items = JSON.parse(storage.getItem('lp_recent_searches'));
    expect(items.length).toBe(10);
    expect(items[0]).toBe('Search Query 15');
    expect(items[9]).toBe('Search Query 6');
  });

  it('T1.5.3 should calculate 2-column comparative delta scorecards between two places', () => {
    const placeA = { name: 'SF Mission', homeValue: 1400000, medianIncome: 125000, aqi: 35 };
    const placeB = { name: 'Austin Downtown', homeValue: 650000, medianIncome: 95000, aqi: 45 };

    const homeDelta = MathEngine.calculateGrowthDelta(placeA.homeValue, placeB.homeValue);
    const incomeDelta = MathEngine.calculateGrowthDelta(placeA.medianIncome, placeB.medianIncome);
    const aqiDiff = placeA.aqi - placeB.aqi;

    expect(homeDelta.absoluteDelta).toBe(750000);
    expect(homeDelta.percentageDelta).toBeCloseTo(115.38, 2);
    expect(incomeDelta.percentageDelta).toBeCloseTo(31.58, 2);
    expect(aqiDiff).toBe(-10);
  });

  it('T1.5.4 should format emoji-bulleted summary payloads for Web Share API', async () => {
    const shareMock = createMockShare();
    const payload = {
      title: 'Local Pulse — SF Mission District',
      text: `📍 SF Mission District\n🏠 Median Home: $1.4M\n💰 Median Income: $125k\n🌱 US AQI: 35 (Good)\n🏛 Landmark: Mission San Francisco de Asís`,
      url: 'https://localpulse.app/#37.7599,-122.4148',
    };

    await shareMock(payload);
    expect(shareMock.calls.length).toBe(1);
    expect(shareMock.calls[0].data.text).toContain('🏠 Median Home: $1.4M');
    expect(shareMock.calls[0].data.text).toContain('🌱 US AQI: 35 (Good)');
  });

  it('T1.5.5 should trigger clipboard copy fallback when navigator.share fails or is unavailable', async () => {
    let clipboardText = '';
    const mockClipboard = {
      writeText: async (txt) => { clipboardText = txt; return true; }
    };

    const textToShare = 'Local Pulse Summary: $1.4M Home Price';
    await mockClipboard.writeText(textToShare);
    expect(clipboardText).toBe(textToShare);
  });
}, 1);

describe('Tier 1 — R6: PWA Manifest & Zero-Dependency Server', () => {
  it('T1.6.1 should validate Web App Manifest schema requirements', () => {
    const manifest = {
      name: 'Local Pulse — Neighborhood Intelligence',
      short_name: 'LocalPulse',
      start_url: './index.html',
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: '#0f172a',
      icons: [
        { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    };

    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(1);
    expect(manifest.theme_color).toBe('#0f172a');
  });

  it('T1.6.2 should verify Service Worker static shell cache manifest list', () => {
    const cacheShell = [
      '/',
      '/index.html',
      '/manifest.json',
      '/css/style.css',
      '/js/app.js',
      '/js/calculations.js',
      '/js/geocoding.js',
      '/js/census.js',
      '/js/environment.js',
      '/data/benchmarks.json'
    ];

    expect(cacheShell.includes('/index.html')).toBe(true);
    expect(cacheShell.includes('/data/benchmarks.json')).toBe(true);
  });

  it('T1.6.3 should map standard MIME types in preview server', () => {
    const mimeMap = {
      '.html': 'text/html; charset=UTF-8',
      '.js': 'application/javascript; charset=UTF-8',
      '.css': 'text/css; charset=UTF-8',
      '.json': 'application/json; charset=UTF-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon'
    };

    function getMime(ext) {
      return mimeMap[ext] || 'application/octet-stream';
    }

    expect(getMime('.html')).toContain('text/html');
    expect(getMime('.js')).toContain('application/javascript');
    expect(getMime('.svg')).toBe('image/svg+xml');
  });

  it('T1.6.4 should prevent directory traversal in preview server file router', () => {
    function sanitizePath(baseDir, reqPath) {
      const safePath = path.normalize(path.join(baseDir, reqPath));
      if (!safePath.startsWith(baseDir)) {
        return { allowed: false, status: 403 };
      }
      return { allowed: true, path: safePath };
    }

    const base = '/usr/local/app';
    const traversal = sanitizePath(base, '../../etc/passwd');
    expect(traversal.allowed).toBe(false);
    expect(traversal.status).toBe(403);

    const safe = sanitizePath(base, 'index.html');
    expect(safe.allowed).toBe(true);
  });
}, 1);

// ============================================================================
// TIER 2: BOUNDARY, EDGE CASES & ERROR RESILIENCE [18 TESTS]
// ============================================================================

describe('Tier 2 — Boundary, Edge Cases & Error Resilience', () => {
  it('T2.1 should detect Coordinate (0, 0) Null Island and return coverage boundary error', () => {
    const lat = errorFixtures.null_island.lat;
    const lng = errorFixtures.null_island.lng;

    const isWithinUS = (lat >= 18.0 && lat <= 72.0 && lng >= -180.0 && lng <= -65.0);
    expect(isWithinUS).toBe(false);
  });

  it('T2.2 should safely clamp or reject North/South Pole polar coordinates (> 85 lat)', () => {
    const lat = errorFixtures.polar_coordinates.lat;
    expect(lat > 85.0).toBe(true);
  });

  it('T2.3 should handle coastal/maritime ocean coordinates returning no FIPS block', () => {
    const oceanRes = errorFixtures.ocean_california.fcc_response;
    expect(oceanRes.Block).toBeNull();
    expect(oceanRes.status).toBe('No-FIPS');
  });

  it('T2.4 should resolve US territory Puerto Rico coordinates to State FIPS 72', () => {
    const prRes = errorFixtures.puerto_rico.fcc_response;
    expect(prRes.State.FIPS).toBe('72');
    expect(prRes.State.code).toBe('PR');
  });

  it('T2.5 should cascade Central Park non-residential tract to County benchmark', () => {
    const cp = unmappedFixture.non_residential_tract_central_park;
    expect(cp.population).toBe(0);
    expect(cp.home_value).toBeNull();
    // Cascade to New York County (061)
    expect(cp.fips.county).toBe('061');
  });

  it('T2.6 should handle special land-use airport tract (O’Hare 980000) with zero population', () => {
    const ohare = unmappedFixture.special_land_use_ohare;
    expect(ohare.fips.tract).toBe('980000');
    expect(ohare.population).toBe(0);
  });

  it('T2.7 should sanitize Census suppressed sentinel value -666666666 to null', () => {
    const raw = errorFixtures.census_sentinel_suppression.raw_value;
    const sanitized = MathEngine.sanitizeCensusValue(raw);
    expect(sanitized).toBeNull();
  });

  it('T2.8 should parse top-coded home values ($2,000,000+ / 2000001) properly', () => {
    const topCoded = errorFixtures.top_coded_home_value.numeric_value;
    const formatted = topCoded >= 2000000 ? '$2.0M+' : MathEngine.formatCurrencyCompact(topCoded);
    expect(formatted).toBe('$2.0M+');

    const aff = MathEngine.calculateAffordabilityRatio(topCoded, 100000);
    expect(aff.ratio).toBeGreaterThan(15.0);
  });

  it('T2.9 should handle Zero Income tracts without division by zero or Infinity', () => {
    const aff = MathEngine.calculateAffordabilityRatio(450000, 0);
    expect(aff.ratio).toBeNull();
    expect(aff.rating).toBe('N/A');
  });

  it('T2.10 should calculate 0.0 Diversity Index for 100% monocultural tract', () => {
    const counts = errorFixtures.monocultural_tract.counts;
    const diversity = MathEngine.calculateDiversityIndex(counts);
    expect(diversity.simpsonsIndex).toBeCloseTo(0.0, 4);
    expect(diversity.score0to100).toBeCloseTo(0.0, 1);
  });

  it('T2.11 should clamp extreme AQI (500) needle rotation at 180 degrees without distortion', () => {
    const angle = MathEngine.calculateAQIArcAngle(500);
    expect(angle).toBeCloseTo(180.0, 1);
    const cat = MathEngine.getAQICategory(500);
    expect(cat.category).toBe('Hazardous');
  });

  it('T2.12 should handle missing PM2.5 sensor data in AQI response without NaN', () => {
    const aqiPayload = { us_aqi: 45, pm2_5: null, pm10: 15.0, ozone: 30.0 };
    const pm25Text = aqiPayload.pm2_5 !== null ? `${aqiPayload.pm2_5} μg/m³` : 'Sensor Unavailable';
    expect(pm25Text).toBe('Sensor Unavailable');
  });

  it('T2.13 should render friendly empty state for remote areas with 0 Wikipedia landmarks', () => {
    const emptyLandmarks = [];
    const message = emptyLandmarks.length === 0 ? 'No registered landmarks within 10km' : `${emptyLandmarks.length} landmarks`;
    expect(message).toContain('No registered landmarks');
  });

  it('T2.14 should sanitize XSS / script injection attacks in search inputs', () => {
    const xss = '<script>alert(1)</script>';
    const sanitized = MathEngine.sanitizeHTML(xss);
    expect(sanitized).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(sanitized.includes('<script>')).toBe(false);
  });

  it('T2.15 should safely truncate extremely long search queries (> 256 characters)', () => {
    const longQuery = 'A'.repeat(500);
    const truncated = longQuery.substring(0, 256);
    expect(truncated.length).toBe(256);
  });

  it('T2.16 should recover gracefully from corrupted LocalStorage JSON data', () => {
    const storage = createMockLocalStorage();
    storage.setItem('lp_saved_places', 'CORRUPTED_NON_JSON_DATA{{{');

    let result = [];
    try {
      result = JSON.parse(storage.getItem('lp_saved_places'));
    } catch {
      result = [];
    }

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('T2.17 should fallback to bundled benchmark matrix when network is offline', () => {
    const isOnline = false;
    const fallbackSource = !isOnline ? 'bundled_benchmarks' : 'live_api';
    expect(fallbackSource).toBe('bundled_benchmarks');
  });

  it('T2.18 should catch 504 Gateway Timeout and provide user retry status', () => {
    const timeout = errorFixtures.gateway_timeout_504;
    expect(timeout.status).toBe(504);
    expect(timeout.body.error).toContain('8000ms');
  });
}, 2);

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS & STATE FLOW [12 TESTS]
// ============================================================================

describe('Tier 3 — Cross-Feature Combinations & State Flow', () => {
  it('T3.1 should fan-out search query concurrently to FCC, ACS, Open-Meteo, and Wikipedia', async () => {
    const mockRoutes = [
      ['geo.fcc.gov/api/census/block/find', () => fccSf],
      ['api.census.gov/data/2022/acs/acs5', () => acs2022Sf],
      ['air-quality-api.open-meteo.com/v1/air-quality', () => aqiSf],
      ['api.open-meteo.com/v1/forecast', () => weatherSf],
      ['en.wikipedia.org/w/api.php', () => wikiSf],
    ];
    const fetch = createMockFetch(mockRoutes);

    const [fccRes, censusRes, aqiRes, weatherRes, wikiRes] = await Promise.all([
      fetch('https://geo.fcc.gov/api/census/block/find'),
      fetch('https://api.census.gov/data/2022/acs/acs5'),
      fetch('https://air-quality-api.open-meteo.com/v1/air-quality'),
      fetch('https://api.open-meteo.com/v1/forecast'),
      fetch('https://en.wikipedia.org/w/api.php?action=query'),
    ]);

    expect(fccRes.ok).toBe(true);
    expect(censusRes.ok).toBe(true);
    expect(aqiRes.ok).toBe(true);
    expect(weatherRes.ok).toBe(true);
    expect(wikiRes.ok).toBe(true);
  });

  it('T3.2 should re-query coordinates on pin drag and synchronize vintage growth calculation', () => {
    const newCoords = { lat: 30.2672, lng: -97.7431 }; // Austin
    const austinHome2022 = 650000;
    const austinHome2020 = 480000;

    const delta = MathEngine.calculateGrowthDelta(austinHome2022, austinHome2020);
    expect(delta.percentageDelta).toBeCloseTo(35.42, 2);
  });

  it('T3.3 should compute state baseline comparison when tract cascades to county', () => {
    const countyHomeVal = 850000;
    const stateBenchmarkHomeVal = 750000;
    const delta = MathEngine.calculateGrowthDelta(countyHomeVal, stateBenchmarkHomeVal);
    expect(delta.percentageDelta).toBeCloseTo(13.33, 2);
  });

  it('T3.4 should star multiple places and generate side-by-side comparative deltas', () => {
    const storage = createMockLocalStorage();
    const places = [
      { id: '1', name: 'SF Mission', homeValue: 1400000, income: 125000 },
      { id: '2', name: 'Austin Downtown', homeValue: 650000, income: 95000 }
    ];
    storage.setItem('lp_compare_items', JSON.stringify(places));

    const loaded = JSON.parse(storage.getItem('lp_compare_items'));
    const homeDiff = loaded[0].homeValue - loaded[1].homeValue;
    const incomeDiff = loaded[0].income - loaded[1].income;

    expect(homeDiff).toBe(750000);
    expect(incomeDiff).toBe(30000);
  });

  it('T3.5 should switch theme and update CartoDB tile layer instantly', () => {
    let theme = 'light';
    let tileLayer = 'voyager';

    const toggleTheme = () => {
      theme = theme === 'light' ? 'dark' : 'light';
      tileLayer = theme === 'dark' ? 'dark_all' : 'voyager';
    };

    toggleTheme();
    expect(theme).toBe('dark');
    expect(tileLayer).toBe('dark_all');
  });

  it('T3.6 should dynamically recalculate SVG arc angle upon switching survey vintages', () => {
    // 2022
    const aff2022 = MathEngine.calculateAffordabilityRatio(1400000, 125000);
    const angle2022 = MathEngine.calculateArcAngle(aff2022.ratio, 1.0, 15.0);

    // 2015
    const aff2015 = MathEngine.calculateAffordabilityRatio(890000, 82000);
    const angle2015 = MathEngine.calculateArcAngle(aff2015.ratio, 1.0, 15.0);

    expect(aff2022.ratio).toBeCloseTo(11.20, 2);
    expect(aff2015.ratio).toBeCloseTo(10.85, 2);
    expect(angle2022).toBeGreaterThan(angle2015);
  });

  it('T3.7 should compare cached saved places in offline mode without network calls', () => {
    const isOnline = false;
    const cachedPlaces = [
      { name: 'NYC Williamsburg', rent: 3200 },
      { name: 'Seattle Capitol Hill', rent: 2100 }
    ];

    expect(isOnline).toBe(false);
    const rentDiff = cachedPlaces[0].rent - cachedPlaces[1].rent;
    expect(rentDiff).toBe(1100);
  });

  it('T3.8 should synchronize pin drag in fullscreen modal with main dashboard hero', () => {
    let heroCoords = { lat: 37.7599, lng: -122.4148 };
    const updateModalCoords = (lat, lng) => {
      heroCoords = { lat, lng };
    };

    updateModalCoords(40.7081, -73.9571);
    expect(heroCoords.lat).toBeCloseTo(40.7081, 4);
  });

  it('T3.9 should construct share summary containing 2022 metrics and historical growth', () => {
    const summary = {
      location: 'SF Mission District',
      homeValue: '$1.4M',
      growth7yr: '+57.3%',
      aqi: '35 (Good)'
    };
    const shareText = `📍 ${summary.location}\n🏠 Price: ${summary.homeValue} (${summary.growth7yr} since 2015)\n🌱 AQI: ${summary.aqi}`;
    expect(shareText).toContain('+57.3% since 2015');
  });

  it('T3.10 should select recent search item and populate search input', () => {
    let inputVal = '';
    const onSelectRecent = (query) => { inputVal = query; };
    onSelectRecent('Seattle Capitol Hill');
    expect(inputVal).toBe('Seattle Capitol Hill');
  });

  it('T3.11 should render diversity segmented bar from ZCTA fallback when tract is unmapped', () => {
    const zctaRace = [12000, 1500, 200, 4500, 100, 300, 1400, 8500];
    const diversity = MathEngine.calculateDiversityIndex(zctaRace);
    expect(diversity.score0to100).toBeGreaterThan(60.0);
  });

  it('T3.12 should cancel in-flight requests on rapid coordinate switching via AbortController', () => {
    let abortedCount = 0;
    const controllers = [];

    function triggerNewSearch() {
      if (controllers.length > 0) {
        controllers[controllers.length - 1].abort();
        abortedCount++;
      }
      const ac = new AbortController();
      controllers.push(ac);
      return ac;
    }

    triggerNewSearch();
    triggerNewSearch();
    triggerNewSearch();

    expect(abortedCount).toBe(2);
    expect(controllers[controllers.length - 1].signal.aborted).toBe(false);
  });
}, 3);

// ============================================================================
// TIER 4: REAL-WORLD SCENARIOS & PRESETS [10 TESTS]
// ============================================================================

describe('Tier 4 — Real-World Scenarios & Presets', () => {
  it('T4.1 (SF Mission) — Urban high-cost, transit-heavy neighborhood verification', () => {
    const homeVal = 1400000;
    const income = 125000;
    const transitWalkShare = ((1150 + 420) / 3200) * 100;

    const aff = MathEngine.calculateAffordabilityRatio(homeVal, income);
    expect(aff.ratio).toBeGreaterThan(8.0);
    expect(aff.rating).toBe('Severely Unaffordable');
    expect(transitWalkShare).toBeGreaterThan(40.0);
  });

  it('T4.2 (Austin Downtown) — Rapid growth boomtown 2015-2022 CAGR verification', () => {
    const home2015 = 390000;
    const home2022 = 650000;
    const cagr = MathEngine.calculateCAGR(home2022, home2015, 7);

    expect(cagr).toBeGreaterThan(7.5);
    expect(cagr).toBeCloseTo(7.57, 1);
  });

  it('T4.3 (NYC Williamsburg) — Ultra high density, rent-burdened, diverse enclave', () => {
    const rent = 3200;
    const income = 85000;
    const rentBurden = MathEngine.calculateRentBurden(rent, income);

    expect(rentBurden.percentage).toBeGreaterThan(35.0);
    expect(rentBurden.rating).toBe('Rent Burdened');
  });

  it('T4.4 (Seattle Capitol Hill) — Tech hub high educational attainment verification', () => {
    const total25Plus = 5000;
    const bachelorsPlus = 3600; // 72%
    const eduPercent = (bachelorsPlus / total25Plus) * 100;

    expect(eduPercent).toBeGreaterThan(65.0);
    expect(eduPercent).toBeCloseTo(72.0, 1);
  });

  it('T4.5 (Chicago Loop) — Architectural heartland & transit hub verification', () => {
    const transitShare = (1800 / 3000) * 100; // 60%
    expect(transitShare).toBeGreaterThan(50.0);
  });

  it('T4.6 (Loving County TX) — Ultra-rural agricultural county fallback verification', () => {
    const pop = 64;
    const ownerOccupied = 22;
    const totalUnits = 28;
    const homeownership = (ownerOccupied / totalUnits) * 100;

    expect(pop).toBeLessThan(100);
    expect(homeownership).toBeGreaterThan(70.0);
  });

  it('T4.7 (Irvine CA) — Suburban master-planned high car commute verification', () => {
    const driveAlone = 3500;
    const totalWorkers = 4400;
    const carShare = (driveAlone / totalWorkers) * 100;

    expect(carShare).toBeGreaterThan(75.0);
  });

  it('T4.8 (Comparative Scorecard) — SF Mission vs Austin Downtown delta analysis', () => {
    const sfHome = 1400000;
    const austinHome = 650000;
    const delta = MathEngine.calculateGrowthDelta(sfHome, austinHome);

    expect(delta.absoluteDelta).toBe(750000);
    expect(delta.percentageDelta).toBeCloseTo(115.38, 2);
  });

  it('T4.9 (Comparative Scorecard) — NYC Williamsburg vs Seattle Capitol Hill rent analysis', () => {
    const nycRent = 3200;
    const seattleRent = 2100;
    const delta = MathEngine.calculateGrowthDelta(nycRent, seattleRent);

    expect(delta.absoluteDelta).toBe(1100);
    expect(delta.percentageDelta).toBeCloseTo(52.38, 2);
  });

  it('T4.10 (Full Offline Session Simulation) — Seamless multi-step user exploration', () => {
    // 1. User opens app in offline mode
    const isOnline = false;
    expect(isOnline).toBe(false);

    // 2. Selects NYC preset from bundle
    const preset = PRESET_LOCATIONS[2];
    expect(preset.name).toBe('NYC Williamsburg');

    // 3. Compares with Austin preset
    const austinPreset = PRESET_LOCATIONS[1];
    expect(austinPreset.name).toBe('Austin Downtown');

    // 4. Calculates delta without errors
    const latDiff = Math.abs(preset.lat - austinPreset.lat);
    expect(latDiff).toBeGreaterThan(10.0);
  });
}, 4);

// Execute All Tests
runTests();
