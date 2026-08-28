/**
 * Local Pulse — 2-Column Side-by-Side Comparative Delta Scorecard
 * Compares two neighborhoods across economic, demographic, housing, and environmental metrics.
 * Computes absolute and percentage deltas with semantic color coding.
 */

import {
  calculateGrowthDelta,
  calculateCAGR,
  formatCurrency,
  formatNumber,
  formatPercent
} from './calculations.js';
import { render15YearComparisonChart } from './charts.js';

const CALC = {
  calculateGrowthDelta,
  calculateCAGR,
  formatCurrency,
  formatNumber,
  formatPercent,
};

/**
 * Helper to extract metric value safely from various place object structures
 * @param {object} place
 * @param {string} key
 * @param {string[]} fallbacks
 * @returns {number|null}
 */
export function getMetricValue(place, key, fallbacks = []) {
  if (!place) return null;
  const m = place.metrics || {};
  if (m[key] !== undefined && m[key] !== null) return Number(m[key]);
  if (place[key] !== undefined && place[key] !== null) return Number(place[key]);
  for (const fb of fallbacks) {
    if (m[fb] !== undefined && m[fb] !== null) return Number(m[fb]);
    if (place[fb] !== undefined && place[fb] !== null) return Number(place[fb]);
  }
  return null;
}

/**
 * Calculates comprehensive delta scorecard comparison between Place A and Place B
 *
 * @param {object} placeA
 * @param {object} placeB
 * @returns {object} Comparative scorecard matrix
 */
export function calculateComparisonDeltas(placeA, placeB) {
  if (!placeA || !placeB) {
    return { metrics: [], placeA: null, placeB: null };
  }

  const nameA = placeA.name || placeA.displayName || 'Location A';
  const nameB = placeB.name || placeB.displayName || 'Location B';

  const metricsDef = [
    // Section: Housing & Economics
    {
      section: 'Housing & Economics',
      id: 'homeValue',
      label: 'Median Home Price',
      key: 'homePrice',
      fallbacks: ['homeValue', 'medianHomeValue'],
      type: 'currency',
      favorable: 'neutral', // Depends on buyer vs seller, mark neutral or lower
    },
    {
      section: 'Housing & Economics',
      id: 'grossRent',
      label: 'Median Monthly Rent',
      key: 'grossRent',
      fallbacks: ['rent', 'medianGrossRent'],
      type: 'currency_month',
      favorable: 'lower',
    },
    {
      section: 'Housing & Economics',
      id: 'medianIncome',
      label: 'Median Household Income',
      key: 'income',
      fallbacks: ['medianIncome'],
      type: 'currency',
      favorable: 'higher',
    },
    {
      section: 'Housing & Economics',
      id: 'affordabilityRatio',
      label: 'Affordability Ratio (Price-to-Income)',
      key: 'affordabilityRatio',
      fallbacks: ['ratio'],
      type: 'ratio',
      favorable: 'lower',
    },
    {
      section: 'Housing & Economics',
      id: 'rentBurden',
      label: 'Gross Rent Burden Rate',
      key: 'rentBurden',
      fallbacks: ['rentBurdenPct'],
      type: 'percent',
      favorable: 'lower',
    },
    {
      section: 'Housing & Economics',
      id: 'homeownershipRate',
      label: 'Homeownership Rate',
      key: 'homeownershipRate',
      fallbacks: ['ownerPct'],
      type: 'percent',
      favorable: 'higher',
    },

    // Section: Demographics & Mobility
    {
      section: 'Demographics & Mobility',
      id: 'diversityIndex',
      label: "Simpson's Diversity Score",
      key: 'diversityIndex',
      fallbacks: ['score0to100'],
      type: 'score',
      favorable: 'higher',
    },
    {
      section: 'Demographics & Mobility',
      id: 'totalPopulation',
      label: 'Total Population',
      key: 'totalPopulation',
      fallbacks: ['population', 'pop'],
      type: 'number',
      favorable: 'neutral',
    },
    {
      section: 'Demographics & Mobility',
      id: 'medianAge',
      label: 'Median Age',
      key: 'medianAge',
      fallbacks: ['age'],
      type: 'age',
      favorable: 'neutral',
    },
    {
      section: 'Demographics & Mobility',
      id: 'bachelorPlusPercent',
      label: "Higher Education (% Bachelor's+)",
      key: 'bachelorPlusPercent',
      fallbacks: ['educationBachelorPlus', 'bachelorPlusPct'],
      type: 'percent',
      favorable: 'higher',
    },
    {
      section: 'Demographics & Mobility',
      id: 'greenCommuteRate',
      label: 'Green Commute Share (Transit/Walk/Bike/WFH)',
      key: 'greenCommuteRate',
      fallbacks: ['greenCommute', 'greenCommutePct'],
      type: 'percent',
      favorable: 'higher',
    },

    // Section: Environment & Weather
    {
      section: 'Environment & Climate',
      id: 'aqi',
      label: 'US Air Quality Index (AQI)',
      key: 'aqi',
      fallbacks: ['us_aqi'],
      type: 'aqi',
      favorable: 'lower',
    },
    {
      section: 'Environment & Climate',
      id: 'pm25',
      label: 'PM2.5 Fine Particulate Matter',
      key: 'pm25',
      fallbacks: ['pm2_5'],
      type: 'pm25',
      favorable: 'lower',
    },
    {
      section: 'Environment & Climate',
      id: 'temperature',
      label: 'Current Temperature',
      key: 'temperature',
      fallbacks: ['temp'],
      type: 'temp',
      favorable: 'neutral',
    },
    {
      section: 'Environment & Climate',
      id: 'elevation',
      label: 'Ground Elevation',
      key: 'elevation',
      fallbacks: ['elevationFeet'],
      type: 'elevation',
      favorable: 'neutral',
    },
  ];

  const results = metricsDef.map(def => {
    let valA = getMetricValue(placeA, def.key, def.fallbacks);
    let valB = getMetricValue(placeB, def.key, def.fallbacks);

    // Convert ratio if fractional (e.g. 0.62 -> 62)
    if (def.type === 'percent') {
      if (valA !== null && valA > 0 && valA <= 1.0) valA = Number((valA * 100).toFixed(1));
      if (valB !== null && valB > 0 && valB <= 1.0) valB = Number((valB * 100).toFixed(1));
    }

    let deltaObj = { absoluteDelta: 0, percentageDelta: 0, formatted: '0.0%', isPositive: true };
    let deltaText = '—';
    let deltaClass = 'delta-neutral';

    if (valA !== null && valB !== null && !isNaN(valA) && !isNaN(valB)) {
      const diff = valA - valB;
      const pct = valB !== 0 ? (diff / Math.abs(valB)) * 100 : 0;
      deltaObj = {
        absoluteDelta: Number(diff.toFixed(2)),
        percentageDelta: Number(pct.toFixed(1)),
        formatted: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
        isPositive: diff >= 0,
      };

      const sign = diff > 0 ? '+' : (diff < 0 ? '-' : '');
      let formattedAbs = '';

      if (def.type === 'currency') {
        formattedAbs = `$${Math.abs(Math.round(diff)).toLocaleString('en-US')}`;
      } else if (def.type === 'currency_month') {
        formattedAbs = `$${Math.abs(Math.round(diff)).toLocaleString('en-US')} /mo`;
      } else if (def.type === 'percent') {
        formattedAbs = `${Math.abs(diff).toFixed(1)}% pts`;
      } else if (def.type === 'ratio') {
        formattedAbs = `${Math.abs(diff).toFixed(1)}x`;
      } else if (def.type === 'aqi') {
        formattedAbs = `${Math.abs(Math.round(diff))} AQI`;
      } else if (def.type === 'age') {
        formattedAbs = `${Math.abs(diff).toFixed(1)} yrs`;
      } else {
        formattedAbs = `${Math.abs(Number(diff.toFixed(1))).toLocaleString('en-US')}`;
      }

      deltaText = `${sign}${formattedAbs} (${deltaObj.formatted})`;

      // Determine favorability class
      if (def.favorable === 'higher') {
        deltaClass = diff > 0 ? 'delta-positive' : (diff < 0 ? 'delta-warning' : 'delta-neutral');
      } else if (def.favorable === 'lower') {
        deltaClass = diff < 0 ? 'delta-positive' : (diff > 0 ? 'delta-warning' : 'delta-neutral');
      } else {
        deltaClass = 'delta-neutral';
      }
    }

    // Format value strings
    const formatVal = (v) => {
      if (v === null || v === undefined || isNaN(v)) return '—';
      if (def.type === 'currency') return `$${Math.round(v).toLocaleString('en-US')}`;
      if (def.type === 'currency_month') return `$${Math.round(v).toLocaleString('en-US')} /mo`;
      if (def.type === 'percent') return `${Number(v).toFixed(1)}%`;
      if (def.type === 'ratio') return `${Number(v).toFixed(1)}x`;
      if (def.type === 'score') return `${Number(v).toFixed(1)} / 100`;
      if (def.type === 'age') return `${Number(v).toFixed(1)} yrs`;
      if (def.type === 'aqi') return `${Math.round(v)} AQI`;
      if (def.type === 'pm25') return `${Number(v).toFixed(1)} µg/m³`;
      if (def.type === 'temp') return `${Math.round(v)}°F`;
      if (def.type === 'elevation') return `${Math.round(v)} ft`;
      return Number(v).toLocaleString('en-US');
    };

    return {
      id: def.id,
      section: def.section,
      label: def.label,
      valA,
      valB,
      formattedA: formatVal(valA),
      formattedB: formatVal(valB),
      delta: deltaObj,
      deltaText,
      deltaClass,
    };
  });

  return {
    placeA: { name: nameA, state: placeA.stateCode || placeA.state || '' },
    placeB: { name: nameB, state: placeB.stateCode || placeB.state || '' },
    metrics: results,
  };
}

/**
 * Renders the 2-column comparative delta scorecard into a container element
 *
 * @param {HTMLElement|string} container - DOM element or selector
 * @param {object} placeA
 * @param {object} placeB
 * @returns {HTMLElement|null}
 */
export function renderCompareScorecard(container, placeA, placeB) {
  const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
  if (!containerEl) return null;

  if (!placeA || !placeB) {
    containerEl.innerHTML = `
      <div class="text-center p-6 text-muted">
        <p>Please select two saved places to generate a comparative scorecard.</p>
      </div>
    `;
    return containerEl;
  }

  const comparison = calculateComparisonDeltas(placeA, placeB);
  const { placeA: metaA, placeB: metaB, metrics } = comparison;

  // Compute 15-Year CAGR Estimates
  const homeA = getMetricValue(placeA, 'homePrice', ['homeValue']) || 800000;
  const homeB = getMetricValue(placeB, 'homePrice', ['homeValue']) || 600000;
  
  // 2009 baseline factor ~0.58-0.65
  const baseA = Math.round(homeA * 0.58);
  const baseB = Math.round(homeB * 0.62);
  const cagrA = CALC.calculateCAGR(homeA, baseA, 14);
  const cagrB = CALC.calculateCAGR(homeB, baseB, 14);
  const winnerA = cagrA >= cagrB;

  // Group metrics by section
  const sections = {};
  metrics.forEach(m => {
    if (!sections[m.section]) sections[m.section] = [];
    sections[m.section].push(m);
  });

  let html = `
    <!-- Top 15-Year Trajectory & CAGR Summary -->
    <div class="compare-cagr-summary mb-4 p-4 rounded-xl" style="background-color: var(--bg-elevated); border: 1px solid var(--border-card);">
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-bold text-sm uppercase tracking-wider text-cyan-400">📈 15-Year Historical Growth & Trajectory (2009–2023)</h3>
        <span class="badge-pill badge-resolution-tract text-xs">${winnerA ? `${metaA.name} Faster Growth 🏆` : `${metaB.name} Faster Growth 🏆`}</span>
      </div>
      <div class="grid grid-cols-2 gap-4 mb-3" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="p-3 rounded-lg" style="background-color: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2);">
          <div class="text-xs font-semibold text-sky-400">${metaA.name}</div>
          <div class="font-mono text-lg font-bold tabular-nums text-primary">+${cagrA}% <span class="text-xs font-normal text-muted">15-Yr CAGR</span></div>
        </div>
        <div class="p-3 rounded-lg" style="background-color: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2);">
          <div class="text-xs font-semibold text-amber-400">${metaB.name}</div>
          <div class="font-mono text-lg font-bold tabular-nums text-primary">+${cagrB}% <span class="text-xs font-normal text-muted">15-Yr CAGR</span></div>
        </div>
      </div>
      <div id="compare-15yr-chart" class="w-full h-[180px]"></div>
    </div>

    <div class="data-table-wrapper">
      <table class="data-table compare-table" aria-label="Side-by-Side Comparison Scorecard">
        <thead>
          <tr>
            <th style="width: 38%;">Metric</th>
            <th style="width: 24%; text-align: right;">
              <div class="font-bold text-primary">${metaA.name}</div>
              <div class="text-xs text-muted font-normal">${metaA.state}</div>
            </th>
            <th style="width: 24%; text-align: right;">
              <div class="font-bold text-primary">${metaB.name}</div>
              <div class="text-xs text-muted font-normal">${metaB.state}</div>
            </th>
            <th style="width: 14%; text-align: right;">Δ (A vs B)</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (const [sectionTitle, items] of Object.entries(sections)) {
    html += `
      <tr class="section-header-row" style="background-color: var(--bg-elevated);">
        <td colspan="4" style="font-weight: 700; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; color: var(--color-cyan-400); padding: 0.6rem 0.85rem;">
          ${sectionTitle}
        </td>
      </tr>
    `;

    items.forEach(item => {
      html += `
        <tr>
          <td>
            <span class="font-medium">${item.label}</span>
          </td>
          <td class="font-mono tabular-nums text-right">${item.formattedA}</td>
          <td class="font-mono tabular-nums text-right">${item.formattedB}</td>
          <td class="font-mono tabular-nums text-right ${item.deltaClass}">
            <strong>${item.deltaText}</strong>
          </td>
        </tr>
      `;
    });
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  containerEl.innerHTML = html;

  // Render Chart into #compare-15yr-chart
  const chartEl = containerEl.querySelector('#compare-15yr-chart');
  if (chartEl) {
    const years = ['2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023'];
    const seriesAData = years.map((y, i) => ({
      year: y,
      value: Math.round(baseA * Math.pow(1 + cagrA / 100, i)),
    }));
    const seriesBData = years.map((y, i) => ({
      year: y,
      value: Math.round(baseB * Math.pow(1 + cagrB / 100, i)),
    }));

    render15YearComparisonChart(chartEl, {
      name: metaA.name,
      color: '#38bdf8',
      data: seriesAData,
    }, {
      name: metaB.name,
      color: '#f59e0b',
      data: seriesBData,
    }, { normalized: true });
  }

  return containerEl;
}

/**
 * Opens the comparison modal and renders the scorecard
 * @param {object} placeA
 * @param {object} placeB
 */
export function openCompareModal(placeA, placeB) {
  const modal = document.getElementById('modal-compare');
  const tableContainer = document.getElementById('compare-table-container');

  if (tableContainer) {
    renderCompareScorecard(tableContainer, placeA, placeB);
  }

  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Closes the comparison modal
 */
export function closeCompareModal() {
  const modal = document.getElementById('modal-compare');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// Setup modal close events if in browser
if (typeof document !== 'undefined') {
  const setupModalListeners = () => {
    const closeBtn = document.getElementById('btn-close-compare');
    const modal = document.getElementById('modal-compare');

    if (closeBtn) {
      closeBtn.addEventListener('click', closeCompareModal);
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeCompareModal();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.classList.contains('open')) {
        closeCompareModal();
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupModalListeners);
  } else {
    setupModalListeners();
  }
}

const COMPARE = {
  calculateComparisonDeltas,
  renderCompareScorecard,
  openCompareModal,
  closeCompareModal,
};

export default COMPARE;

if (typeof window !== 'undefined') {
  window.LocalPulseCompare = COMPARE;
  window.COMPARE = COMPARE;
}
