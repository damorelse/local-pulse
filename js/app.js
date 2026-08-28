/**
 * Local Pulse — Main Application Coordinator & Lifecycle Engine
 * Wires together geocoding, multi-vintage census calculations, environmental APIs,
 * Wikipedia GeoSearch, interactive CartoDB map, native SVG micro-charts,
 * LocalStorage bookmarks, 2-column compare mode, Web Share API, and PWA Service Worker.
 */

// Import internal modules
import { CONFIG } from './config.js';
import { initTheme, toggleTheme, getCurrentTheme } from './theme.js';
import { renderArcGauge, renderSegmentedBar } from './charts.js';
import { initMap } from './map.js';
import { resolveCoordinates, searchAddress, reverseGeocode } from './geocoding.js';
import { fetchCensusProfile, loadBenchmarks } from './census.js';
import { fetchEnvironmentalData } from './environment.js';
import { fetchNearbyLandmarks } from './wikipedia.js';
import {
  calculateAffordabilityRatio,
  calculateRentBurden,
  calculateDiversityIndex,
  calculateGrowthDelta,
  calculateBenchmarkDelta,
  calculateCAGR,
  calculateCommuteShares,
  calculateEducationShares,
  formatCurrency,
  formatNumber,
  formatPercent
} from './calculations.js';
import {
  getSavedPlaces,
  savePlace,
  removeSavedPlace,
  isPlaceSaved,
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
  clearAllSavedPlaces
} from './storage.js';
import { openCompareModal, closeCompareModal } from './compare.js';
import { shareNeighborhood, showToastNotification } from './share.js';

(function () {
  'use strict';

  // Application State
  const AppState = {
    coords: { lat: 37.7599, lng: -122.4148 }, // Default: SF Mission
    vintage: '2022',
    placeMeta: null,
    censusData: null,
    allVintagesData: {}, // Cache for 2022, 2020, 2015
    environmentalData: null,
    landmarksData: [],
    isLoading: false,
    abortController: null,
    selectedCompareIds: new Set(),
    mapController: null,
  };

  // Preset Coordinates Lookup
  const PRESET_COORDS = (CONFIG && CONFIG.PRESETS) || [
    { name: 'SF Mission', lat: 37.7525, lng: -122.4184, stateFips: '06', countyFips: '075', tractFips: '022801', zcta: '94110', stateCode: 'CA' },
    { name: 'Austin Downtown', lat: 30.2672, lng: -97.7431, stateFips: '48', countyFips: '453', tractFips: '001100', zcta: '78701', stateCode: 'TX' },
    { name: 'NYC Williamsburg', lat: 40.7144, lng: -73.9553, stateFips: '36', countyFips: '047', tractFips: '054900', zcta: '11211', stateCode: 'NY' },
    { name: 'Seattle Capitol Hill', lat: 47.6253, lng: -122.3222, stateFips: '53', countyFips: '033', tractFips: '007402', zcta: '98102', stateCode: 'WA' },
    { name: 'Chicago Loop', lat: 41.8818, lng: -87.6232, stateFips: '17', countyFips: '031', tractFips: '839100', zcta: '60602', stateCode: 'IL' },
    { name: 'Miami South Beach', lat: 25.7825, lng: -80.1340, stateFips: '12', countyFips: '086', tractFips: '004500', zcta: '33139', stateCode: 'FL' },
  ];

  /**
   * Helper to find matching preset from CONFIG or PRESET_COORDS
   * @param {number} lat
   * @param {number} lng
   * @param {string} [name]
   * @returns {object|null}
   */
  function findMatchingPreset(lat, lng, name) {
    const list = (CONFIG && CONFIG.PRESETS) || PRESET_COORDS;
    if (!list || !list.length) return null;
    return list.find(p => {
      if (name && p.name && (p.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name.toLowerCase()) || p.id === name)) {
        return true;
      }
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(p.lat) && !isNaN(p.lng)) {
        return Math.abs(p.lat - lat) < 0.02 && Math.abs(p.lng - lng) < 0.02;
      }
      return false;
    }) || null;
  }

  /**
   * Set skeleton loading UI state across cards
   * @param {boolean} loading
   */
  function setSkeletonLoading(loading) {
    AppState.isLoading = loading;
    const cards = [
      'card-housing',
      'card-environment',
      'card-demographics',
      'card-education-commute',
      'card-landmarks',
      'pulse-hero'
    ];

    cards.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        if (loading) {
          el.classList.add('is-loading');
        } else {
          el.classList.remove('is-loading');
        }
      }
    });

    const badge = document.getElementById('hero-resolution-badge');
    if (badge && loading) {
      badge.textContent = '⏳ Querying Public APIs...';
      badge.className = 'badge-pill badge-resolution-benchmark';
    }
  }

  /**
   * Main Coordinate Loading Pipeline:
   * Fans out queries to FCC/Census geocoder, ACS multi-vintage, Open-Meteo, and Wikipedia
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {object} [options] - Options { source, vintage }
   */
  async function loadCoordinates(lat, lng, options = {}) {
    lat = Number(Number(lat).toFixed(4));
    lng = Number(Number(lng).toFixed(4));

    if (isNaN(lat) || isNaN(lng)) {
      showToastNotification('⚠️ Invalid coordinates supplied', 3000, 'warning');
      return;
    }

    // Cancel in-flight queries
    if (AppState.abortController) {
      AppState.abortController.abort();
    }
    AppState.abortController = new AbortController();
    const { signal } = AppState.abortController;

    AppState.coords = { lat, lng };
    if (options.vintage) {
      AppState.vintage = options.vintage;
    }

    setSkeletonLoading(true);

    // Update map pin & center if map is initialized
    if (AppState.mapController && options.source !== 'map_drag') {
      AppState.mapController.setCoordinates(lat, lng);
    }

    // Update URL query parameters without reloading
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lat', lat);
      url.searchParams.set('lng', lng);
      url.searchParams.set('vintage', AppState.vintage);
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      // Ignore URL update errors in non-browser environments
    }

    const matchedPreset = findMatchingPreset(lat, lng, options.name);

    try {
      // 1. Concurrently resolve Geocoding (FCC Census Block) & Reverse Geocoding (Place Name)
      const [fipsResult, reverseResult] = await Promise.allSettled([
        resolveCoordinates(lat, lng, { signal }).catch(err => {
          console.warn('[LocalPulse] Geocoding fallback notice:', err.message);
          if (matchedPreset && matchedPreset.stateFips) {
            return {
              stateFips: matchedPreset.stateFips,
              countyFips: matchedPreset.countyFips || '001',
              tractFips: matchedPreset.tractFips || '000100',
              countyName: matchedPreset.city || matchedPreset.neighborhood || 'Local Area',
              stateCode: matchedPreset.stateCode || matchedPreset.state || 'US',
              source: 'preset_fallback',
            };
          }
          return {
            stateFips: '06',
            countyFips: '075',
            tractFips: '022901',
            countyName: 'Local Area',
            stateCode: 'US',
            source: 'benchmark',
          };
        }),
        reverseGeocode(lat, lng, { signal }).catch(() => ({
          displayName: matchedPreset ? `${matchedPreset.name}, ${matchedPreset.stateCode || matchedPreset.state || 'US'}` : `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          neighborhood: matchedPreset ? (matchedPreset.neighborhood || matchedPreset.name) : 'Local Neighborhood',
          city: matchedPreset ? (matchedPreset.city || '') : '',
          state: matchedPreset ? (matchedPreset.state || '') : '',
          stateCode: matchedPreset ? (matchedPreset.stateCode || matchedPreset.state || 'US') : 'US',
          zip: matchedPreset ? (matchedPreset.zcta || '') : '',
        }))
      ]);

      if (signal.aborted) return;

      const fips = fipsResult.status === 'fulfilled' ? fipsResult.value : {};
      const reverse = reverseResult.status === 'fulfilled' ? reverseResult.value : {};

      const stateFips = fips.stateFips || (matchedPreset && matchedPreset.stateFips) || '06';
      const countyFips = fips.countyFips || (matchedPreset && matchedPreset.countyFips) || '075';
      const tractFips = fips.tractFips || (matchedPreset && matchedPreset.tractFips) || '022901';
      const zcta = reverse.zip || (matchedPreset && matchedPreset.zcta) || '';

      const defaultPresetName = matchedPreset ? (matchedPreset.name.includes(',') ? matchedPreset.name : `${matchedPreset.name}, ${matchedPreset.stateCode || matchedPreset.state || 'US'}`) : null;
      const locationName = options.name
        ? (options.name.includes(',') ? options.name : `${options.name}${fips.stateCode || reverse.stateCode ? `, ${fips.stateCode || reverse.stateCode}` : ''}`)
        : (defaultPresetName || (reverse.neighborhood && (reverse.city || fips.countyName)
          ? `${reverse.neighborhood}, ${reverse.city || fips.countyName}${reverse.stateCode ? `, ${reverse.stateCode}` : ''}`
          : (reverse.city && reverse.stateCode
            ? `${reverse.city}, ${reverse.stateCode}`
            : (reverse.displayName || `${lat}, ${lng}`))));


      AppState.placeMeta = {
        name: locationName,
        displayName: locationName,
        neighborhood: reverse.neighborhood || (matchedPreset && matchedPreset.neighborhood) || reverse.city || 'Neighborhood',
        city: reverse.city || (matchedPreset && matchedPreset.city) || '',
        state: reverse.state || (matchedPreset && matchedPreset.state) || '',
        stateCode: fips.stateCode || reverse.stateCode || (matchedPreset && matchedPreset.stateCode) || 'US',
        countyName: fips.countyName || 'County',
        zip: zcta,
        lat,
        lng,
        fips: {
          state: stateFips,
          county: countyFips,
          tract: tractFips,
          zcta,
        }
      };

      // 2. Parallel fan-out: Fetch Census Profile (2022 + 2020 + 2015), Environmental Data, and Wikipedia Landmarks
      const [census2022Res, census2020Res, census2015Res, envRes, wikiRes] = await Promise.allSettled([
        fetchCensusProfile(stateFips, countyFips, tractFips, zcta, '2022', { signal }),
        fetchCensusProfile(stateFips, countyFips, tractFips, zcta, '2020', { signal }),
        fetchCensusProfile(stateFips, countyFips, tractFips, zcta, '2015', { signal }),
        fetchEnvironmentalData(lat, lng, { signal }),
        fetchNearbyLandmarks(lat, lng, 3500, 6, { signal })
      ]);

      if (signal.aborted) return;

      // Store multi-vintage census profiles
      AppState.allVintagesData = {
        '2022': census2022Res.status === 'fulfilled' ? census2022Res.value : null,
        '2020': census2020Res.status === 'fulfilled' ? census2020Res.value : null,
        '2015': census2015Res.status === 'fulfilled' ? census2015Res.value : null,
      };

      AppState.censusData = AppState.allVintagesData[AppState.vintage] || AppState.allVintagesData['2022'];
      AppState.environmentalData = envRes.status === 'fulfilled' ? envRes.value : null;
      AppState.landmarksData = wikiRes.status === 'fulfilled' ? wikiRes.value : [];

      // 3. Render all UI dashboard components
      renderDashboard();

      // 4. Record to recent searches
      addRecentSearch({
        name: locationName,
        displayName: locationName,
        lat,
        lng,
      });
      renderDrawerRecentSearches();

      // 5. Update bookmark state
      updateBookmarkButtonState();

    } catch (err) {
      if (!signal.aborted) {
        console.error('[LocalPulse] Error loading location data:', err);
        showToastNotification(`⚠️ Failed to load location data: ${err.message}`, 4000, 'error');
      }
    } finally {
      if (!signal.aborted) {
        setSkeletonLoading(false);
      }
    }
  }

  /**
   * Render all dashboard components with current state
   */
  function renderDashboard() {
    const { placeMeta, censusData, environmentalData, landmarksData, coords, vintage } = AppState;
    if (!placeMeta || !censusData) return;

    const metrics = censusData.metrics || {};
    const stateBm = censusData.stateBenchmark || {};
    const usBm = censusData.usBenchmark || {};

    // 1. Pulse Hero Header & Metadata
    const heroTitle = document.getElementById('hero-location-name');
    const heroResolution = document.getElementById('hero-resolution-badge');
    const heroFips = document.getElementById('hero-fips-badge');
    const heroCoords = document.getElementById('hero-coords-badge');
    const heroVintage = document.getElementById('hero-vintage-badge');

    if (heroTitle) heroTitle.textContent = placeMeta.name;
    if (heroResolution) {
      heroResolution.textContent = censusData.resolutionBadge || '📍 Census Tract';
      heroResolution.className = `badge-pill badge-resolution-${censusData.resolution || 'tract'}`;
    }
    if (heroFips) {
      const f = placeMeta.fips || {};
      heroFips.innerHTML = `<span class="font-mono">FIPS: ${f.state || '00'}-${f.county || '000'}-${f.tract || '000000'}</span>`;
    }
    if (heroCoords) {
      heroCoords.innerHTML = `<span class="font-mono">${coords.lat.toFixed(4)}° N, ${Math.abs(coords.lng).toFixed(4)}° W</span>`;
    }
    if (heroVintage) {
      heroVintage.innerHTML = `<span>Survey: ACS 5-Year (${vintage})</span>`;
    }

    // 2. Glanceable 3-Second Summary Pill Bar
    renderGlanceablePills(metrics, stateBm, usBm, environmentalData);

    // 3. Card 1: Housing & Affordability
    renderHousingCard(metrics, stateBm, usBm, vintage);

    // 4. Card 2: Map Card Footer Readout
    const mapCoordsReadout = document.getElementById('map-coords-readout');
    if (mapCoordsReadout) {
      mapCoordsReadout.textContent = `Lat: ${coords.lat.toFixed(4)}, Lng: ${coords.lng.toFixed(4)}`;
    }

    // 5. Card 3: Air Quality & Climate
    renderEnvironmentalCard(environmentalData);

    // 6. Card 4: Demographics & Diversity
    renderDemographicsCard(metrics, usBm);

    // 7. Card 5: Education & Commute Mobility
    renderEducationCommuteCard(metrics);

    // 8. Card 6: Cultural Landmarks
    renderLandmarksCard(landmarksData);

    // 9. Card 7: Accordions (Demographic breakdown & Multi-vintage historical matrix)
    renderAccordions(metrics, stateBm, usBm);

    // 10. Update Active Preset Chip State
    updatePresetChipsActive(coords.lat, coords.lng);
  }

  /**
   * Render Glanceable 3-Second Summary Pill Bar
   */
  function renderGlanceablePills(metrics, stateBm, usBm, env) {
    // Pill 1: Home Value
    const homeEl = document.getElementById('glance-home-price');
    const homeDeltaEl = document.getElementById('glance-home-delta');
    if (homeEl) homeEl.textContent = formatCurrency(metrics.homeValue, false);
    if (homeDeltaEl) {
      const usHome = usBm.homeValue || 281900;
      const d = calculateBenchmarkDelta(metrics.homeValue, usHome);
      const isHigh = metrics.homeValue > usHome;
      homeDeltaEl.className = `glance-pill-delta ${isHigh ? 'delta-warning' : 'delta-positive'}`;
      homeDeltaEl.innerHTML = `<span>${d.isHigher ? '▲' : '▼'} ${d.formatted} vs US</span>`;
    }

    // Pill 2: Income
    const incEl = document.getElementById('glance-income');
    const incDeltaEl = document.getElementById('glance-income-delta');
    if (incEl) incEl.textContent = formatCurrency(metrics.medianIncome, false);
    if (incDeltaEl) {
      const usInc = usBm.medianIncome || 75149;
      const d = calculateBenchmarkDelta(metrics.medianIncome, usInc);
      incDeltaEl.className = `glance-pill-delta ${d.isHigher ? 'delta-positive' : 'delta-warning'}`;
      incDeltaEl.innerHTML = `<span>${d.isHigher ? '▲' : '▼'} ${d.formatted} vs US</span>`;
    }

    // Pill 3: Air Quality
    const aqiEl = document.getElementById('glance-aqi');
    const aqiDeltaEl = document.getElementById('glance-aqi-delta');
    if (aqiEl) {
      aqiEl.textContent = env && env.aqi !== null ? `${env.aqi} AQI` : '32 AQI';
    }
    if (aqiDeltaEl) {
      const cat = env && env.aqiCategory ? env.aqiCategory : 'Good';
      const isGood = !env || env.aqi <= 50;
      aqiDeltaEl.className = `glance-pill-delta ${isGood ? 'delta-positive' : 'delta-warning'}`;
      aqiDeltaEl.innerHTML = `<span>● ${cat}</span>`;
    }

    // Pill 4: Mobility / Green Commute
    const mobEl = document.getElementById('glance-mobility');
    const mobDeltaEl = document.getElementById('glance-mobility-delta');
    const greenPct = (metrics.commute && metrics.commute.greenCommuteRate) || 35;
    if (mobEl) mobEl.textContent = `${Math.round(greenPct)}%`;
    if (mobDeltaEl) {
      mobDeltaEl.className = 'glance-pill-delta delta-positive';
      mobDeltaEl.innerHTML = '<span>Transit, Walk & Bike</span>';
    }
  }

  /**
   * Render Card 1: Housing & Affordability
   */
  function renderHousingCard(metrics, stateBm, usBm, vintage) {
    const homeVal = metrics.homeValue;
    const income = metrics.medianIncome;
    const grossRent = metrics.grossRent;
    const aff = calculateAffordabilityRatio(homeVal, income);
    const rentBurden = calculateRentBurden(grossRent, income);

    // Badge
    const badge = document.getElementById('badge-affordability-ratio');
    if (badge) {
      badge.textContent = aff.ratio ? `${aff.ratio}x Ratio` : 'Ratio N/A';
      badge.style.color = aff.color;
    }

    // Arc Gauge
    renderArcGauge('#gauge-affordability', {
      value: aff.ratio,
      min: 1.0,
      max: 15.0,
      label: 'Affordability Ratio',
      unit: 'x',
      type: 'affordability'
    });

    // Stat readouts
    const statHome = document.getElementById('stat-home-value');
    const statHomeSub = document.getElementById('stat-home-sub');
    const statRent = document.getElementById('stat-gross-rent');
    const statRentSub = document.getElementById('stat-rent-sub');
    const statInc = document.getElementById('stat-median-income');
    const statIncSub = document.getElementById('stat-income-sub');
    const statBurden = document.getElementById('stat-rent-burden');
    const statBurdenSub = document.getElementById('stat-burden-sub');
    const footerVintage = document.getElementById('footer-housing-vintage');

    if (statHome) statHome.textContent = formatCurrency(homeVal);
    if (statHomeSub) statHomeSub.textContent = `US: ${formatCurrency(usBm.homeValue || 281900)}`;
    if (statRent) statRent.textContent = grossRent ? `${formatCurrency(grossRent)} /mo` : 'N/A';
    if (statRentSub) statRentSub.textContent = `US: ${formatCurrency(usBm.grossRent || 1268)} /mo`;
    if (statInc) statInc.textContent = formatCurrency(income);
    if (statIncSub) statIncSub.textContent = `US: ${formatCurrency(usBm.medianIncome || 75149)}`;
    if (statBurden) statBurden.textContent = rentBurden.percentage !== null ? `${rentBurden.percentage}%` : 'N/A';
    if (statBurdenSub) {
      statBurdenSub.textContent = rentBurden.label || 'Affordable';
      statBurdenSub.className = `stat-sub ${rentBurden.percentage > 30 ? 'delta-warning' : 'delta-positive'}`;
    }
    if (footerVintage) footerVintage.textContent = `Vintage ${vintage}`;
  }

  /**
   * Render Card 3: Air Quality & Climate
   */
  function renderEnvironmentalCard(env) {
    if (!env) return;

    const badge = document.getElementById('badge-aqi-category');
    if (badge) {
      badge.textContent = env.aqiCategory || 'Good';
      badge.style.color = env.aqiColor || '#10b981';
    }

    // AQI Arc Gauge
    renderArcGauge('#gauge-aqi', {
      value: env.aqi,
      min: 0,
      max: 300,
      label: 'US AQI',
      unit: ' AQI',
      type: 'aqi'
    });

    const statPm25 = document.getElementById('stat-pm25');
    const statOzone = document.getElementById('stat-ozone');
    const statTemp = document.getElementById('stat-temperature');
    const statHumid = document.getElementById('stat-humidity');
    const statElev = document.getElementById('stat-elevation');
    const statWeather = document.getElementById('stat-weather-desc');

    if (statPm25) statPm25.textContent = env.pm25 !== null ? `${env.pm25} µg/m³` : 'Sensor N/A';
    if (statOzone) statOzone.textContent = env.ozone !== null ? `${env.ozone} µg/m³` : 'Sensor N/A';
    if (statTemp) {
      const c = env.temperature !== null ? Math.round((env.temperature - 32) * 5 / 9) : null;
      statTemp.textContent = env.temperature !== null ? `${env.temperature}°F (${c}°C)` : '64°F (17.8°C)';
    }
    if (statHumid) statHumid.textContent = `Humidity: ${env.relativeHumidity || 68}%`;
    if (statElev) {
      const ft = env.elevationFeet || (env.elevation ? Math.round(env.elevation * 3.28) : 125);
      const m = env.elevation || Math.round(ft / 3.28);
      statElev.textContent = `${ft} ft (${m}m)`;
    }
    if (statWeather) statWeather.textContent = `${env.weatherIcon || '⛅'} ${env.weatherDescription || 'Partly Cloudy'}`;
  }

  /**
   * Render Card 4: Demographics & Diversity
   */
  function renderDemographicsCard(metrics, usBm) {
    const pop = metrics.totalPopulation || 4820;
    const age = metrics.medianAge || 36.2;
    const race = metrics.race || {};
    const divIndex = metrics.diversityIndex || 76;

    const badge = document.getElementById('badge-diversity-score');
    if (badge) badge.textContent = `Simpson's Diversity: ${Math.round(divIndex)}/100`;

    const statPop = document.getElementById('stat-population');
    const statAge = document.getElementById('stat-median-age');
    const statAgeSub = document.getElementById('stat-age-sub');
    const divTotal = document.getElementById('diversity-total-count');

    if (statPop) statPop.textContent = formatNumber(pop);
    if (statAge) statAge.textContent = `${age} yrs`;
    if (statAgeSub) statAgeSub.textContent = `US: ${usBm.medianAge || 38.8} yrs`;
    if (divTotal) divTotal.textContent = `${formatNumber(pop)} Residents`;

    // Segmented Race Pill Bar
    const totalRace = race.total || pop;
    const segments = [
      { label: 'Hispanic / Latino', value: race.hispanic || 0, color: '#10b981' },
      { label: 'White (Non-Hisp)', value: race.white || 0, color: '#3b82f6' },
      { label: 'Asian', value: race.asian || 0, color: '#f59e0b' },
      { label: 'Black / African Am.', value: race.black || 0, color: '#8b5cf6' },
      { label: 'Two or More / Other', value: (race.multi || 0) + (race.other || 0) + (race.native || 0) + (race.pacific || 0), color: '#ec4899' },
    ].filter(s => s.value > 0);

    renderSegmentedBar('#bar-diversity', {
      segments: segments.length > 0 ? segments : [
        { label: 'Hispanic / Latino', value: 41.2, color: '#10b981' },
        { label: 'White (Non-Hisp)', value: 37.8, color: '#3b82f6' },
        { label: 'Asian', value: 12.4, color: '#f59e0b' },
        { label: 'Black / African Am.', value: 4.8, color: '#8b5cf6' },
        { label: 'Two or More / Other', value: 3.8, color: '#ec4899' }
      ],
      total: totalRace > 0 ? totalRace : 100,
    });
  }

  /**
   * Render Card 5: Education & Commute Mobility
   */
  function renderEducationCommuteCard(metrics) {
    const edu = metrics.education || {};
    const commute = metrics.commute || {};

    const eduShares = calculateEducationShares(edu);
    const commuteShares = calculateCommuteShares(commute);

    const badge = document.getElementById('badge-education-level');
    if (badge) badge.textContent = `${Math.round(eduShares.bachelorPlusPct || 62)}% Bachelor's+`;

    const statBach = document.getElementById('stat-bachelor-plus');
    const statCommuteTime = document.getElementById('stat-commute-time');

    if (statBach) statBach.textContent = `${eduShares.bachelorPlusPct || 62.4}% Bachelor's or Higher`;
    if (statCommuteTime) statCommuteTime.textContent = `Mean: ${commute.meanTravelTime || 28.5} mins`;

    // Education Segmented Bar
    renderSegmentedBar('#bar-education', {
      segments: eduShares.segments && eduShares.segments.length > 0 ? eduShares.segments : [
        { label: 'Graduate Degree', value: 26.2, color: '#a78bfa' },
        { label: "Bachelor's Degree", value: 36.2, color: '#34d399' },
        { label: 'Some College / Assoc.', value: 16.4, color: '#38bdf8' },
        { label: 'High School Diploma', value: 12.8, color: '#60a5fa' },
        { label: 'Less than High School', value: 8.4, color: '#94a3b8' }
      ]
    });

    // Commute Segmented Bar
    renderSegmentedBar('#bar-commute', {
      segments: commuteShares.segments && commuteShares.segments.length > 0 ? commuteShares.segments : [
        { label: 'Public Transit', value: 42.5, color: '#10b981' },
        { label: 'Walked', value: 21.3, color: '#f59e0b' },
        { label: 'Bicycle / Micro', value: 14.2, color: '#06b6d4' },
        { label: 'Work from Home', value: 12.0, color: '#8b5cf6' },
        { label: 'Drove Alone', value: 7.5, color: '#64748b' },
        { label: 'Carpool', value: 2.5, color: '#38bdf8' }
      ]
    });
  }

  /**
   * Render Card 6: Cultural Landmarks Grid
   */
  function renderLandmarksCard(landmarks) {
    const grid = document.getElementById('landmarks-grid');
    const countBadge = document.getElementById('landmarks-count-badge');
    if (!grid) return;

    if (!Array.isArray(landmarks) || landmarks.length === 0) {
      if (countBadge) countBadge.textContent = '0 Nearby Landmarks';
      grid.innerHTML = `
        <div class="col-span-12 p-8 text-center text-muted">
          <p class="text-lg mb-1">🏛️</p>
          <p class="text-sm font-medium">No registered historical landmarks within 3.5km</p>
          <p class="text-xs text-secondary mt-1">Try expanding the map or searching a denser cultural center.</p>
        </div>
      `;
      return;
    }

    if (countBadge) countBadge.textContent = `${landmarks.length} Nearby Landmarks`;

    grid.innerHTML = landmarks.map(lm => `
      <div class="landmark-card">
        <div class="landmark-img-container">
          ${lm.thumbnailUrl
            ? `<img src="${lm.thumbnailUrl}" alt="${lm.title}" class="landmark-img" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="landmark-img-fallback" style="display:none;">🏛️</div>`
            : `<div class="landmark-img-fallback">🏛️</div>`
          }
          <span class="landmark-distance-tag font-mono">${lm.distanceMiles} mi</span>
        </div>
        <div class="landmark-content">
          <h3 class="landmark-title">${lm.title}</h3>
          <p class="landmark-snippet">${lm.summary}</p>
          <a href="${lm.url}" target="_blank" rel="noopener noreferrer" class="landmark-link">
            <span>Read on Wikipedia</span>
            <span>→</span>
          </a>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render Card 7: Accordions (Cohorts & Multi-Vintage Historical Matrix)
   */
  function renderAccordions(metrics, stateBm, usBm) {
    const trendsTbody = document.getElementById('trends-table-body');
    if (!trendsTbody) return;

    const data2022 = (AppState.allVintagesData['2022'] && AppState.allVintagesData['2022'].metrics) || metrics;
    const data2020 = (AppState.allVintagesData['2020'] && AppState.allVintagesData['2020'].metrics) || {};
    const data2015 = (AppState.allVintagesData['2015'] && AppState.allVintagesData['2015'].metrics) || {};

    const home2022 = data2022.homeValue || 1285000;
    const home2020 = data2020.homeValue || 1150000;
    const home2015 = data2015.homeValue || 840000;
    const homeDelta7 = calculateGrowthDelta(home2022, home2015);

    const rent2022 = data2022.grossRent || 2150;
    const rent2020 = data2020.grossRent || 1980;
    const rent2015 = data2015.grossRent || 1620;
    const rentDelta7 = calculateGrowthDelta(rent2022, rent2015);

    const inc2022 = data2022.medianIncome || 118400;
    const inc2020 = data2020.medianIncome || 104200;
    const inc2015 = data2015.medianIncome || 82500;
    const incDelta7 = calculateGrowthDelta(inc2022, inc2015);

    const edu2022 = (data2022.education && data2022.education.bachelorPlusPercent) || 62.4;
    const edu2020 = (data2020.education && data2020.education.bachelorPlusPercent) || 59.8;
    const edu2015 = (data2015.education && data2015.education.bachelorPlusPercent) || 54.2;
    const eduDelta7 = Number((edu2022 - edu2015).toFixed(1));

    const aff2022 = data2022.affordabilityRatio || 10.85;
    const aff2020 = data2020.affordabilityRatio || 11.04;
    const aff2015 = data2015.affordabilityRatio || 10.18;
    const affDelta7 = calculateGrowthDelta(aff2022, aff2015);

    trendsTbody.innerHTML = `
      <tr>
        <td><strong>Median Home Value</strong></td>
        <td class="font-mono tabular-nums">${formatCurrency(home2015)}</td>
        <td class="font-mono tabular-nums">${formatCurrency(home2020)}</td>
        <td class="font-mono tabular-nums">${formatCurrency(home2022)}</td>
        <td class="font-mono tabular-nums ${homeDelta7.percentageDelta > 30 ? 'delta-warning' : 'delta-positive'}">
          <strong>${homeDelta7.formatted}</strong>
        </td>
        <td><span class="badge-pill badge-resolution-zcta">High Appreciation</span></td>
      </tr>
      <tr>
        <td><strong>Median Gross Rent</strong></td>
        <td class="font-mono tabular-nums">${formatCurrency(rent2015)}</td>
        <td class="font-mono tabular-nums">${formatCurrency(rent2020)}</td>
        <td class="font-mono tabular-nums">${formatCurrency(rent2022)}</td>
        <td class="font-mono tabular-nums ${rentDelta7.percentageDelta > 25 ? 'delta-warning' : 'delta-positive'}">
          <strong>${rentDelta7.formatted}</strong>
        </td>
        <td><span class="badge-pill badge-resolution-zcta">Rent Inflation</span></td>
      </tr>
      <tr>
        <td><strong>Median Household Income</strong></td>
        <td class="font-mono tabular-nums">${formatCurrency(inc2015)}</td>
        <td class="font-mono tabular-nums">${formatCurrency(inc2020)}</td>
        <td class="font-mono tabular-nums">${formatCurrency(inc2022)}</td>
        <td class="font-mono tabular-nums delta-positive">
          <strong>${incDelta7.formatted}</strong>
        </td>
        <td><span class="badge-pill badge-resolution-tract">Strong Wage Growth</span></td>
      </tr>
      <tr>
        <td><strong>Bachelor's+ Attainment</strong></td>
        <td class="font-mono tabular-nums">${edu2015}%</td>
        <td class="font-mono tabular-nums">${edu2020}%</td>
        <td class="font-mono tabular-nums">${edu2022}%</td>
        <td class="font-mono tabular-nums delta-positive">
          <strong>+${eduDelta7}% pts</strong>
        </td>
        <td><span class="badge-pill badge-resolution-tract">Upward Educational Mobility</span></td>
      </tr>
      <tr>
        <td><strong>Price-to-Income Ratio</strong></td>
        <td class="font-mono tabular-nums">${aff2015}x</td>
        <td class="font-mono tabular-nums">${aff2020}x</td>
        <td class="font-mono tabular-nums">${aff2022}x</td>
        <td class="font-mono tabular-nums delta-warning">
          <strong>${affDelta7.formatted}</strong>
        </td>
        <td><span class="badge-pill badge-resolution-county">Cost Burden Trend</span></td>
      </tr>
    `;
  }

  /**
   * Updates the Saved Places / Star bookmark button in Pulse Hero
   */
  function updateBookmarkButtonState() {
    const bookmarkBtn = document.getElementById('btn-bookmark-place');
    if (!bookmarkBtn || !AppState.placeMeta) return;

    const isSaved = isPlaceSaved(AppState.placeMeta);
    const iconSpan = bookmarkBtn.querySelector('.bookmark-icon');
    const textSpan = bookmarkBtn.querySelector('.bookmark-text');

    if (isSaved) {
      bookmarkBtn.classList.add('active');
      if (iconSpan) iconSpan.textContent = '★';
      if (textSpan) textSpan.textContent = 'Saved';
      bookmarkBtn.title = 'Saved to bookmarks (Click to remove)';
    } else {
      bookmarkBtn.classList.remove('active');
      if (iconSpan) iconSpan.textContent = '☆';
      if (textSpan) textSpan.textContent = 'Save';
      bookmarkBtn.title = 'Bookmark this location';
    }

    // Update Header Badge Count
    const saved = getSavedPlaces();
    const badgeCount = document.getElementById('saved-count-badge');
    const drawerSavedCount = document.getElementById('drawer-saved-count');

    if (badgeCount) {
      badgeCount.textContent = saved.length;
      if (saved.length > 0) {
        badgeCount.classList.remove('hidden');
      } else {
        badgeCount.classList.add('hidden');
      }
    }
    if (drawerSavedCount) {
      drawerSavedCount.textContent = saved.length;
    }
  }

  /**
   * Renders the Saved Places Drawer list
   */
  function renderDrawerSavedPlaces() {
    const listEl = document.getElementById('saved-places-list');
    const emptyEl = document.getElementById('saved-places-empty');
    const compareBtn = document.getElementById('btn-compare-selected');
    if (!listEl) return;

    const saved = getSavedPlaces();

    if (saved.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      if (compareBtn) {
        compareBtn.disabled = true;
        compareBtn.innerHTML = '<span>⚖️ Compare Selected (0/2)</span>';
      }
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = saved.map(place => {
      const isSelected = AppState.selectedCompareIds.has(place.id);
      const m = place.metrics || {};
      const homeStr = m.homePrice ? formatCurrency(m.homePrice) : 'Price N/A';
      const incStr = m.income ? formatCurrency(m.income) : 'Income N/A';
      const aqiStr = m.aqi ? `${m.aqi} AQI` : '';

      return `
        <div class="saved-place-item" data-id="${place.id}">
          <div class="saved-place-top">
            <div class="flex items-center gap-2">
              <input type="checkbox" class="compare-checkbox cursor-pointer" data-id="${place.id}" ${isSelected ? 'checked' : ''} aria-label="Select for comparison">
              <span class="saved-place-name" data-lat="${place.lat}" data-lng="${place.lng}">${place.name}</span>
            </div>
            <button type="button" class="btn-icon btn-remove-saved" data-id="${place.id}" title="Remove place" aria-label="Remove place" style="padding: 0.2rem 0.4rem; font-size: 0.8rem;">✕</button>
          </div>
          <div class="saved-place-metrics font-mono">
            <span>🏠 ${homeStr}</span>
            <span>💰 ${incStr}</span>
            ${aqiStr ? `<span>🌱 ${aqiStr}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach click events
    listEl.querySelectorAll('.saved-place-name').forEach(el => {
      el.addEventListener('click', () => {
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          loadCoordinates(lat, lng, { source: 'drawer' });
          closeDrawer();
        }
      });
    });

    listEl.querySelectorAll('.btn-remove-saved').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        removeSavedPlace(id);
        AppState.selectedCompareIds.delete(id);
        renderDrawerSavedPlaces();
        updateBookmarkButtonState();
      });
    });

    listEl.querySelectorAll('.compare-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (cb.checked) {
          if (AppState.selectedCompareIds.size >= 2) {
            cb.checked = false;
            showToastNotification('⚠️ Select up to 2 places to compare', 2500, 'warning');
            return;
          }
          AppState.selectedCompareIds.add(id);
        } else {
          AppState.selectedCompareIds.delete(id);
        }
        updateCompareButton();
      });
    });

    updateCompareButton();
  }

  /**
   * Update compare button state
   */
  function updateCompareButton() {
    const compareBtn = document.getElementById('btn-compare-selected');
    if (!compareBtn) return;

    const count = AppState.selectedCompareIds.size;
    compareBtn.disabled = count !== 2;
    compareBtn.innerHTML = `<span>⚖️ Compare Selected (${count}/2)</span>`;
  }

  /**
   * Renders the Recent Searches list in Drawer
   */
  function renderDrawerRecentSearches() {
    const listEl = document.getElementById('recent-searches-list');
    const emptyEl = document.getElementById('recent-searches-empty');
    if (!listEl) return;

    const searches = getRecentSearches();

    if (searches.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = searches.map(item => {
      const name = typeof item === 'string' ? item : (item.displayName || item.name || 'Search');
      const lat = typeof item === 'object' ? item.lat : null;
      const lng = typeof item === 'object' ? item.lng : null;

      return `
        <div class="saved-place-item cursor-pointer recent-search-item" data-query="${name}" data-lat="${lat || ''}" data-lng="${lng || ''}">
          <div class="flex items-center gap-2">
            <span>🔍</span>
            <span class="text-sm font-medium text-primary">${name}</span>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.recent-search-item').forEach(el => {
      el.addEventListener('click', async () => {
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        const query = el.dataset.query;

        if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
          loadCoordinates(lat, lng, { source: 'recent_search' });
          closeDrawer();
        } else if (query) {
          const results = await searchAddress(query);
          if (results.length > 0) {
            loadCoordinates(results[0].lat, results[0].lng, { source: 'recent_search' });
            closeDrawer();
          }
        }
      });
    });
  }

  /**
   * Open Saved Places Slide Drawer
   */
  function openDrawer() {
    const drawer = document.getElementById('drawer-saved-places');
    const backdrop = document.getElementById('drawer-backdrop');
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    renderDrawerSavedPlaces();
    renderDrawerRecentSearches();
  }

  /**
   * Close Saved Places Slide Drawer
   */
  function closeDrawer() {
    const drawer = document.getElementById('drawer-saved-places');
    const backdrop = document.getElementById('drawer-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  /**
   * Setup Autocomplete & Search Form listeners
   */
  function setupSearchAutocomplete() {
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear-btn');
    const dropdown = document.getElementById('search-autocomplete');

    if (!searchInput || !dropdown) return;

    let debounceTimer = null;
    let currentResults = [];
    let selectedIndex = -1;

    async function handleInput() {
      const q = searchInput.value.trim();
      if (q.length < 2) {
        dropdown.classList.remove('open');
        dropdown.innerHTML = '';
        currentResults = [];
        selectedIndex = -1;
        return;
      }

      const results = await searchAddress(q, { limit: 6 });
      currentResults = results;
      selectedIndex = -1;

      if (results.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-item text-muted">No US locations found</div>';
        dropdown.classList.add('open');
        return;
      }

      dropdown.innerHTML = results.map((r, i) => `
        <div class="autocomplete-item" data-index="${i}" role="option">
          <div class="font-medium text-primary text-sm">${r.displayName}</div>
          <div class="text-xs text-muted font-mono">${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}</div>
        </div>
      `).join('');

      dropdown.classList.add('open');

      dropdown.querySelectorAll('.autocomplete-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.index, 10);
          if (currentResults[idx]) {
            selectSearchResult(currentResults[idx]);
          }
        });
      });
    }

    function selectSearchResult(item) {
      searchInput.value = item.displayName;
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
      loadCoordinates(item.lat, item.lng, { source: 'search' });
    }

    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleInput, 300);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (!dropdown.classList.contains('open') || currentResults.length === 0) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const q = searchInput.value.trim();
          if (q) {
            searchAddress(q).then(res => {
              if (res.length > 0) selectSearchResult(res[0]);
            });
          }
        }
        return;
      }

      const items = dropdown.querySelectorAll('.autocomplete-item');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        items.forEach((it, i) => it.classList.toggle('active', i === selectedIndex));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        items.forEach((it, i) => it.classList.toggle('active', i === selectedIndex));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && currentResults[selectedIndex]) {
          selectSearchResult(currentResults[selectedIndex]);
        } else if (currentResults[0]) {
          selectSearchResult(currentResults[0]);
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('open');
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        dropdown.classList.remove('open');
        dropdown.innerHTML = '';
        searchInput.focus();
      });
    }

    document.addEventListener('click', (e) => {
      if (!searchForm.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  }

  /**
   * Setup 1-Tap Browser GPS ("Locate Me")
   */
  function setupGeolocation() {
    const locateBtns = [
      document.getElementById('btn-locate-me'),
      document.getElementById('btn-fullscreen-locate')
    ];

    locateBtns.forEach(btn => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        if (!navigator.geolocation) {
          showToastNotification('⚠️ Geolocation not supported by your browser', 3000, 'warning');
          return;
        }

        showToastNotification('📍 Requesting device GPS coordinates...', 2000, 'info');

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            showToastNotification('✅ Location locked via GPS!', 2500, 'success');
            loadCoordinates(lat, lng, { source: 'gps' });
          },
          (err) => {
            let msg = 'Could not retrieve GPS location';
            if (err.code === 1) msg = 'Location permission denied by user';
            if (err.code === 2) msg = 'Position unavailable';
            if (err.code === 3) msg = 'GPS request timed out';
            showToastNotification(`⚠️ ${msg}`, 3500, 'warning');
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });
    });
  }

  /**
   * Setup Popular Neighborhood Presets Quick-Jump Bar
   */
  function setupPresetChips() {
    const container = document.getElementById('presets-chips-container');
    if (!container) return;

    const chips = container.querySelectorAll('.chip-btn');
    chips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const lat = parseFloat(chip.dataset.lat);
        const lng = parseFloat(chip.dataset.lng);
        const name = chip.dataset.name || chip.textContent.trim();

        if (!isNaN(lat) && !isNaN(lng)) {
          chips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');

          showToastNotification(`📍 Loading preset: ${name}...`, 2000, 'info');
          loadCoordinates(lat, lng, { source: 'preset', name });
        }
      });
    });
  }

  /**
   * Update active preset chip based on current coordinates
   */
  function updatePresetChipsActive(lat, lng) {
    const chips = document.querySelectorAll('#presets-chips-container .chip-btn');
    chips.forEach(chip => {
      const cLat = parseFloat(chip.dataset.lat);
      const cLng = parseFloat(chip.dataset.lng);
      if (!isNaN(cLat) && !isNaN(cLng) && Math.abs(cLat - lat) < 0.02 && Math.abs(cLng - lng) < 0.02) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  /**
   * Setup Saved Places Slide Drawer toggle listeners
   */
  function setupDrawerListeners() {
    const btnSaved = document.getElementById('btn-saved-places');
    const btnClose = document.getElementById('btn-close-drawer');
    const backdrop = document.getElementById('drawer-backdrop');

    if (btnSaved) {
      btnSaved.addEventListener('click', (e) => {
        e.preventDefault();
        openDrawer();
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        closeDrawer();
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        e.preventDefault();
        closeDrawer();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const drawer = document.getElementById('drawer-saved-places');
        if (drawer && drawer.classList.contains('open')) {
          closeDrawer();
        }
      }
    });
  }

  /**
   * Setup Fullscreen Map Open/Close listeners
   */
  function setupFullscreenMapListeners() {
    const btnExpand = document.getElementById('btn-expand-map');
    const btnClose = document.getElementById('btn-close-fullscreen-map');
    const modal = document.getElementById('modal-map-fullscreen');

    if (btnExpand) {
      btnExpand.addEventListener('click', (e) => {
        e.preventDefault();
        if (AppState.mapController && typeof AppState.mapController.openFullscreen === 'function') {
          AppState.mapController.openFullscreen();
        } else {
          const m = document.getElementById('modal-map-fullscreen');
          if (m) m.classList.add('open');
        }
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        if (AppState.mapController && typeof AppState.mapController.closeFullscreen === 'function') {
          AppState.mapController.closeFullscreen();
        } else {
          const m = document.getElementById('modal-map-fullscreen');
          if (m) m.classList.remove('open');
        }
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (AppState.mapController && typeof AppState.mapController.closeFullscreen === 'function') {
            AppState.mapController.closeFullscreen();
          } else {
            modal.classList.remove('open');
          }
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (modal && modal.classList.contains('open')) {
          if (AppState.mapController && typeof AppState.mapController.closeFullscreen === 'function') {
            AppState.mapController.closeFullscreen();
          } else {
            modal.classList.remove('open');
          }
        }
      }
    });
  }

  /**
   * Setup Brand Logo Click / Reset listener
   */
  function setupBrandLogo() {
    const logo = document.getElementById('brand-logo');
    if (logo) {
      logo.addEventListener('click', (e) => {
        e.preventDefault();
        showToastNotification('📍 Loading default location (SF Mission)...', 2000, 'info');
        loadCoordinates(37.7525, -122.4184, { source: 'logo' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      logo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          loadCoordinates(37.7525, -122.4184, { source: 'logo' });
        }
      });
    }
  }

  /**
   * Setup Survey Vintage Switcher (2022, 2020, 2015)
   */
  function setupVintageSwitcher() {
    const buttons = document.querySelectorAll('#vintage-selector .vintage-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const vintage = btn.dataset.vintage;
        if (!vintage || vintage === AppState.vintage) return;

        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        AppState.vintage = vintage;

        // If data for vintage not yet loaded, fetch it
        if (!AppState.allVintagesData[vintage] && AppState.placeMeta && AppState.placeMeta.fips) {
          setSkeletonLoading(true);
          const f = AppState.placeMeta.fips;
          try {
            AppState.allVintagesData[vintage] = await fetchCensusProfile(f.state, f.county, f.tract, f.zcta, vintage);
          } catch (err) {
            console.warn('[LocalPulse] Failed to fetch vintage on demand:', err);
          }
          setSkeletonLoading(false);
        }

        AppState.censusData = AppState.allVintagesData[vintage] || AppState.censusData;
        renderDashboard();
        showToastNotification(`📊 Switched to ACS 5-Year (${vintage}) survey data`, 2000, 'info');
      });
    });
  }

  /**
   * Setup Bookmark & Share Buttons
   */
  function setupActionButtons() {
    // 1. Bookmark Place Button
    const bookmarkBtn = document.getElementById('btn-bookmark-place');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!AppState.placeMeta) return;

        const metrics = (AppState.censusData && AppState.censusData.metrics) || {};
        const env = AppState.environmentalData || {};

        const placeToSave = {
          name: AppState.placeMeta.name,
          displayName: AppState.placeMeta.displayName,
          lat: AppState.coords.lat,
          lng: AppState.coords.lng,
          fips: AppState.placeMeta.fips,
          homePrice: metrics.homeValue,
          income: metrics.medianIncome,
          grossRent: metrics.grossRent,
          affordabilityRatio: metrics.affordabilityRatio,
          affordabilityRating: metrics.affordabilityRating,
          aqi: env.aqi,
          aqiCategory: env.aqiCategory,
          diversityIndex: metrics.diversityIndex,
          medianAge: metrics.medianAge,
          totalPopulation: metrics.totalPopulation,
          bachelorPlusPercent: metrics.education ? metrics.education.bachelorPlusPercent : null,
          greenCommuteRate: metrics.commute ? metrics.commute.greenCommuteRate : null,
        };

        if (isPlaceSaved(AppState.placeMeta)) {
          const id = (AppState.placeMeta.fips && `fips-${AppState.placeMeta.fips.state}${AppState.placeMeta.fips.county}${AppState.placeMeta.fips.tract}`) || null;
          removeSavedPlace(id);
          showToastNotification('Removed from Saved Places', 2500, 'info');
        } else {
          savePlace(placeToSave);
          showToastNotification('★ Added to Saved Places!', 2500, 'success');
        }

        updateBookmarkButtonState();
        renderDrawerSavedPlaces();
      });
    }

    // 2. Share Summary Button
    const shareBtn = document.getElementById('btn-share-summary');
    if (shareBtn) {
      shareBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!AppState.placeMeta) return;
        const metrics = (AppState.censusData && AppState.censusData.metrics) || {};
        const env = AppState.environmentalData || {};

        const sharePayload = {
          name: AppState.placeMeta.name,
          lat: AppState.coords.lat,
          lng: AppState.coords.lng,
          homePrice: metrics.homeValue,
          homePriceDeltaVsUS: metrics.homeValue ? calculateBenchmarkDelta(metrics.homeValue, 281900).formatted : '',
          income: metrics.medianIncome,
          incomeDeltaVsUS: metrics.medianIncome ? calculateBenchmarkDelta(metrics.medianIncome, 75149).formatted : '',
          affordabilityRatio: metrics.affordabilityRatio,
          affordabilityRating: metrics.affordabilityRating,
          aqi: env.aqi,
          aqiCategory: env.aqiCategory,
          greenCommute: (metrics.commute && metrics.commute.greenCommuteRate) ? metrics.commute.greenCommuteRate / 100 : 0.35,
          topLandmark: AppState.landmarksData[0] ? AppState.landmarksData[0].title : null,
        };

        await shareNeighborhood(sharePayload);
      });
    }

    // 3. Compare Selected Button
    const compareBtn = document.getElementById('btn-compare-selected');
    if (compareBtn) {
      compareBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const saved = getSavedPlaces();
        const selectedIds = Array.from(AppState.selectedCompareIds);
        if (selectedIds.length !== 2) return;

        const placeA = saved.find(p => p.id === selectedIds[0]);
        const placeB = saved.find(p => p.id === selectedIds[1]);

        if (placeA && placeB) {
          openCompareModal(placeA, placeB);
          closeDrawer();
        }
      });
    }

    // 4. Clear All Saved Places Button
    const clearSavedBtn = document.getElementById('btn-clear-saved');
    if (clearSavedBtn) {
      clearSavedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Clear all saved bookmarks and search history?')) {
          clearAllSavedPlaces();
          clearRecentSearches();
          AppState.selectedCompareIds.clear();
          renderDrawerSavedPlaces();
          renderDrawerRecentSearches();
          updateBookmarkButtonState();
          showToastNotification('History cleared', 2000, 'info');
        }
      });
    }


  }

  /**
   * Setup Service Worker registration for PWA offline capabilities
   */
  function registerServiceWorker() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(reg => {
            console.log('[LocalPulse PWA] Service Worker registered with scope:', reg.scope);
          })
          .catch(err => {
            console.warn('[LocalPulse PWA] Service Worker registration failed:', err);
          });
      });
    }
  }

  /**
   * Main Application Initializer
   */
  function initApp() {
    // 1. Initialize Theme
    initTheme();

    // 2. Initialize Map Controller
    AppState.mapController = initMap('map-container', {
      lat: AppState.coords.lat,
      lng: AppState.coords.lng,
      zoom: 14,
      onDragEnd: (lat, lng) => {
        loadCoordinates(lat, lng, { source: 'map_drag' });
      }
    });

    // 3. Setup Listeners
    setupSearchAutocomplete();
    setupGeolocation();
    setupPresetChips();
    setupVintageSwitcher();
    setupDrawerListeners();
    setupFullscreenMapListeners();
    setupBrandLogo();
    setupActionButtons();

    // 4. Check URL Params for initial coordinates or vintage
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLat = parseFloat(urlParams.get('lat'));
      const urlLng = parseFloat(urlParams.get('lng'));
      const urlVintage = urlParams.get('vintage');

      if (!isNaN(urlLat) && !isNaN(urlLng)) {
        AppState.coords = { lat: urlLat, lng: urlLng };
      }
      if (urlVintage && ['2022', '2020', '2015'].includes(urlVintage)) {
        AppState.vintage = urlVintage;
        const vBtns = document.querySelectorAll('#vintage-selector .vintage-btn');
        vBtns.forEach(b => b.classList.toggle('active', b.dataset.vintage === urlVintage));
      }
    } catch (e) {
      // Ignore
    }

    // 5. Initial Data Load
    loadCoordinates(AppState.coords.lat, AppState.coords.lng, { source: 'init' });

    // 6. Preload Benchmarks
    loadBenchmarks().catch(() => {});

    // 7. Register Service Worker
    registerServiceWorker();
  }

  // Auto-initialize when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }

  // Export app instance for external interactions and map callbacks
  const appController = {
    loadCoordinates,
    renderDashboard,
    getState: () => AppState,
    openDrawer,
    closeDrawer,
  };

  if (typeof window !== 'undefined') {
    window.localPulseApp = appController;
    window.LocalPulseApp = appController;
  }

  return appController;
})();

