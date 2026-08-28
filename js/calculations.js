/**
 * Local Pulse Calculations & Derived Metrics Engine
 * Implements mathematical models for housing affordability ratios, gross rent burden,
 * Simpson's Diversity Index, multi-vintage growth deltas, CAGR, and benchmark comparisons.
 */

import { CONFIG as importedConfig } from './config.js';

const CONFIG = importedConfig || (typeof window !== 'undefined' && (window.LocalPulseConfig || window.CONFIG)) || {};

/**
 * Calculates Price-to-Income Affordability Ratio (Home Value / Household Income)
 * Standard Economic Rule: ≤ 3.0 is Affordable, 3.1 - 5.0 is Moderate Burden, > 5.0 is Severe Burden.
 *
 * @param {number|null} homeValue - Median home value in USD
 * @param {number|null} medianIncome - Median annual household income in USD
 * @returns {{ ratio: number|null, rating: string, color: string, label: string, angle: number }}
 */
export function calculateAffordabilityRatio(homeValue, medianIncome) {
  if (
    homeValue === null ||
    homeValue === undefined ||
    medianIncome === null ||
    medianIncome === undefined ||
    isNaN(homeValue) ||
    isNaN(medianIncome) ||
    medianIncome <= 0 ||
    homeValue <= 0
  ) {
    return {
      ratio: null,
      rating: 'N/A',
      color: '#94a3b8',
      label: 'Data Unavailable',
      angle: 0,
    };
  }

  const ratio = Number((homeValue / medianIncome).toFixed(2));
  let rating = 'Affordable';
  let color = '#10B981';
  let label = 'Affordable (≤ 3.0x)';

  if (ratio > 5.0) {
    rating = 'Unaffordable';
    color = '#EF4444';
    label = 'Severe Burden (> 5.0x)';
  } else if (ratio > 3.0) {
    rating = 'Moderate';
    color = '#F59E0B';
    label = 'Moderate Burden (3.1 - 5.0x)';
  }

  // Arc Gauge needle angle calculation (0° to 180° on 1.0x to 15.0x scale)
  const minScale = 1.0;
  const maxScale = 15.0;
  const clamped = Math.min(Math.max(ratio, minScale), maxScale);
  const normalized = (clamped - minScale) / (maxScale - minScale);
  const angle = Number((normalized * 180.0).toFixed(1));

  return {
    ratio,
    rating,
    color,
    label,
    angle,
  };
}

/**
 * Calculates Gross Rent-to-Income Burden Rate (%)
 * Standard HUD metric: ≤ 30% Affordable, 30.1% - 50% Rent Burdened, > 50% Severely Rent Burdened.
 *
 * @param {number|null} monthlyGrossRent - Median gross monthly rent in USD
 * @param {number|null} medianAnnualIncome - Median annual household income in USD
 * @returns {{ percentage: number|null, rating: string, color: string, label: string }}
 */
export function calculateRentBurden(monthlyGrossRent, medianAnnualIncome) {
  if (
    monthlyGrossRent === null ||
    monthlyGrossRent === undefined ||
    medianAnnualIncome === null ||
    medianAnnualIncome === undefined ||
    isNaN(monthlyGrossRent) ||
    isNaN(medianAnnualIncome) ||
    medianAnnualIncome <= 0 ||
    monthlyGrossRent <= 0
  ) {
    return {
      percentage: null,
      rating: 'N/A',
      color: '#94a3b8',
      label: 'Data Unavailable',
    };
  }

  const annualRent = monthlyGrossRent * 12;
  const percentage = Number(((annualRent / medianAnnualIncome) * 100).toFixed(1));

  let rating = 'Affordable';
  let color = '#10B981';
  let label = 'Affordable (≤ 30%)';

  if (percentage > 50.0) {
    rating = 'Severely Rent Burdened';
    color = '#EF4444';
    label = 'Severely Burdened (> 50%)';
  } else if (percentage > 30.0) {
    rating = 'Rent Burdened';
    color = '#F59E0B';
    label = 'Cost Burdened (30.1 - 50%)';
  }

  return {
    percentage,
    rating,
    color,
    label,
  };
}

/**
 * Calculates Gini-Simpson Index of Diversity:
 * D = 1 - sum( (n_i / N)^2 )
 * Normalized against theoretical maximum for 8 mutually exclusive categories (D_max = 1 - 1/8 = 0.875)
 * to produce a standardized 0 - 100 score.
 *
 * @param {object|Array<number>} raceData - Counts object { white, black, asian, hispanic, native, pacific, other, multi } or counts array
 * @returns {{ simpsonsIndex: number, score0to100: number }}
 */
export function calculateDiversityIndex(raceData) {
  if (!raceData) {
    return { simpsonsIndex: 0, score0to100: 0 };
  }

  let counts = [];
  if (Array.isArray(raceData)) {
    counts = raceData.map(Number).filter(n => !isNaN(n) && n >= 0);
  } else if (typeof raceData === 'object') {
    const keys = ['white', 'black', 'native', 'asian', 'pacific', 'other', 'multi', 'hispanic'];
    counts = keys.map(k => Number(raceData[k]) || 0);
  }

  const total = counts.reduce((acc, c) => acc + c, 0);
  if (total === 0 || counts.length === 0) {
    return { simpsonsIndex: 0, score0to100: 0 };
  }

  const sumSq = counts.reduce((sum, n) => {
    const p = n / total;
    return sum + p * p;
  }, 0);

  const D = Math.max(0, 1 - sumSq);
  const k = Math.max(counts.length, 2);
  const maxD = 1 - 1 / k;
  const score = maxD > 0 ? Math.min(100, Math.max(0, (D / maxD) * 100)) : 0;

  return {
    simpsonsIndex: Number(D.toFixed(3)),
    score0to100: Number(score.toFixed(1)),
  };
}

/**
 * Calculates Historical Growth Delta between two values
 *
 * @param {number|null} currentVal
 * @param {number|null} baseVal
 * @returns {{ absoluteDelta: number, percentageDelta: number, formatted: string, isPositive: boolean }}
 */
export function calculateGrowthDelta(currentVal, baseVal) {
  if (
    currentVal === null ||
    currentVal === undefined ||
    baseVal === null ||
    baseVal === undefined ||
    isNaN(currentVal) ||
    isNaN(baseVal) ||
    baseVal === 0
  ) {
    return {
      absoluteDelta: 0,
      percentageDelta: 0,
      formatted: '0.0%',
      isPositive: true,
    };
  }

  const absoluteDelta = currentVal - baseVal;
  const percentageDelta = Number(((absoluteDelta / baseVal) * 100).toFixed(1));
  const sign = percentageDelta >= 0 ? '+' : '';
  const formatted = `${sign}${percentageDelta}%`;

  return {
    absoluteDelta,
    percentageDelta,
    formatted,
    isPositive: percentageDelta >= 0,
  };
}

/**
 * Calculates Comparative Delta against a Benchmark (State or US baseline)
 *
 * @param {number|null} localVal
 * @param {number|null} benchmarkVal
 * @returns {{ absoluteDelta: number, percentageDelta: number, formatted: string, isHigher: boolean }}
 */
export function calculateBenchmarkDelta(localVal, benchmarkVal) {
  if (
    localVal === null ||
    localVal === undefined ||
    benchmarkVal === null ||
    benchmarkVal === undefined ||
    isNaN(localVal) ||
    isNaN(benchmarkVal) ||
    benchmarkVal === 0
  ) {
    return {
      absoluteDelta: 0,
      percentageDelta: 0,
      formatted: '0.0%',
      isHigher: false,
    };
  }

  const absoluteDelta = localVal - benchmarkVal;
  const percentageDelta = Number(((absoluteDelta / benchmarkVal) * 100).toFixed(1));
  const sign = percentageDelta >= 0 ? '+' : '';
  const formatted = `${sign}${percentageDelta}%`;

  return {
    absoluteDelta,
    percentageDelta,
    formatted,
    isHigher: localVal > benchmarkVal,
  };
}

/**
 * Calculates Compound Annual Growth Rate (CAGR)
 *
 * @param {number} currentVal
 * @param {number} baseVal
 * @param {number} years
 * @returns {number}
 */
export function calculateCAGR(currentVal, baseVal, years) {
  if (!baseVal || baseVal <= 0 || !currentVal || currentVal <= 0 || !years || years <= 0) {
    return 0;
  }
  const cagr = (Math.pow(currentVal / baseVal, 1 / years) - 1) * 100;
  return Number(cagr.toFixed(2));
}

/**
 * Calculates Commute Mode Shares and Green Commute Rate
 *
 * @param {object} commute - Commute counts { totalWorkers, driveAlone, carpool, transit, walk, bike, wfh }
 * @returns {object}
 */
export function calculateCommuteShares(commute) {
  if (!commute || !commute.totalWorkers || commute.totalWorkers <= 0) {
    return {
      driveAlonePct: 0,
      carpoolPct: 0,
      transitPct: 0,
      walkPct: 0,
      bikePct: 0,
      wfhPct: 0,
      greenCommutePct: 0,
      segments: [],
    };
  }

  const total = commute.totalWorkers;
  const driveAlone = commute.driveAlone || 0;
  const carpool = commute.carpool || 0;
  const transit = commute.transit || 0;
  const walk = commute.walk || 0;
  const bike = commute.bike || 0;
  const wfh = commute.wfh || 0;

  const driveAlonePct = Number(((driveAlone / total) * 100).toFixed(1));
  const carpoolPct = Number(((carpool / total) * 100).toFixed(1));
  const transitPct = Number(((transit / total) * 100).toFixed(1));
  const walkPct = Number(((walk / total) * 100).toFixed(1));
  const bikePct = Number(((bike / total) * 100).toFixed(1));
  const wfhPct = Number(((wfh / total) * 100).toFixed(1));
  const greenCommutePct = Number((((transit + walk + bike + wfh) / total) * 100).toFixed(1));

  const segments = [
    { label: 'Drive Alone', value: driveAlonePct, count: driveAlone, color: '#64748B' },
    { label: 'Carpool', value: carpoolPct, count: carpool, color: '#38BDF8' },
    { label: 'Public Transit', value: transitPct, count: transit, color: '#10B981' },
    { label: 'Walk', value: walkPct, count: walk, color: '#F59E0B' },
    { label: 'Bicycle', value: bikePct, count: bike, color: '#06B6D4' },
    { label: 'Work From Home', value: wfhPct, count: wfh, color: '#8B5CF6' },
  ];

  return {
    driveAlonePct,
    carpoolPct,
    transitPct,
    walkPct,
    bikePct,
    wfhPct,
    greenCommutePct,
    segments,
  };
}

/**
 * Calculates Educational Attainment Shares
 *
 * @param {object} edu - Education counts
 * @returns {object}
 */
export function calculateEducationShares(edu) {
  if (!edu || !edu.total25Plus || edu.total25Plus <= 0) {
    return {
      highSchoolPct: 0,
      associatePct: 0,
      bachelorPlusPct: 0,
      graduatePct: 0,
      segments: [],
    };
  }

  const total = edu.total25Plus;
  const hs = edu.highSchool || (Number(edu.eduRegularHS || 0) + Number(edu.eduGED || 0));
  const associate = edu.associate || 0;
  const bachelor = edu.bachelor || 0;
  const graduate = edu.graduate || (Number(edu.eduMaster || 0) + Number(edu.eduProfessional || 0) + Number(edu.eduDoctorate || 0));
  const bachPlus = edu.bachelorPlus || (bachelor + graduate);

  const hsPct = Number(((hs / total) * 100).toFixed(1));
  const assocPct = Number(((associate / total) * 100).toFixed(1));
  const bachPct = Number(((bachelor / total) * 100).toFixed(1));
  const gradPct = Number(((graduate / total) * 100).toFixed(1));
  const bachPlusPct = Number(((bachPlus / total) * 100).toFixed(1));
  const otherPct = Math.max(0, Number((100 - (hsPct + assocPct + bachPct + gradPct)).toFixed(1)));

  const segments = [
    { label: 'High School', value: hsPct, count: hs, color: '#60A5FA' },
    { label: 'Associate', value: assocPct, count: associate, color: '#38BDF8' },
    { label: "Bachelor's", value: bachPct, count: bachelor, color: '#34D399' },
    { label: 'Graduate/Prof', value: gradPct, count: graduate, color: '#A78BFA' },
  ];
  if (otherPct > 0) {
    segments.unshift({ label: 'Less than HS / Some College', value: otherPct, count: 0, color: '#94A3B8' });
  }

  return {
    highSchoolPct: hsPct,
    associatePct: assocPct,
    bachelorPct: bachPct,
    graduatePct: gradPct,
    bachelorPlusPct: bachPlusPct,
    segments,
  };
}

/**
 * Currency formatter helper ($1.4M, $95K, $1,280,000)
 *
 * @param {number|null} val
 * @param {boolean} compact
 * @returns {string}
 */
export function formatCurrency(val, compact = false) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  const num = Number(val);
  if (compact) {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${num.toLocaleString('en-US')}`;
  }
  return `$${Math.round(num).toLocaleString('en-US')}`;
}

/**
 * Number formatter helper with commas (e.g. 128,400)
 *
 * @param {number|null} val
 * @returns {string}
 */
export function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return Number(val).toLocaleString('en-US');
}

/**
 * Percent formatter helper (e.g. 34.5%)
 *
 * @param {number|null} val
 * @param {boolean} includeSign
 * @returns {string}
 */
export function formatPercent(val, includeSign = false) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  const num = Number(val);
  const sign = includeSign && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(1)}%`;
}

const CALCULATIONS = {
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
  formatPercent,
};

export default CALCULATIONS;

if (typeof window !== 'undefined') {
  window.LocalPulseCalculations = CALCULATIONS;
  window.CALCULATIONS = CALCULATIONS;
}
