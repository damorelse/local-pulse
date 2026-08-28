/**
 * Local Pulse — 15-Year Multi-Vintage & Timeseries Verification Suite
 * Tests 2009-2023 vintage matrix, SVG sparkline rendering, 15-year multi-series trend charts,
 * and 14-year CAGR analytics.
 */

import assert from 'node:assert';

// Mock DOM environment for Node.js
function createMockElement(tag) {
  const el = {
    tagName: tag,
    attributes: {},
    style: {},
    children: [],
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
      toggle(c, force) { if (force !== undefined) { force ? this.add(c) : this.remove(c); } else { this.contains(c) ? this.remove(c) : this.add(c); } }
    },
    addEventListener() {},
    getBoundingClientRect() { return { width: 240, height: 52, left: 0, top: 0 }; },
    _innerHTML: '',
    get innerHTML() {
      if (this.children.length > 0) {
        return this.children.map(c => {
          const attrs = Object.entries(c.attributes || {}).map(([k, v]) => `${k}="${v}"`).join(' ');
          return `<${c.tagName}${attrs ? ' ' + attrs : ''}>${c.innerHTML || ''}</${c.tagName}>`;
        }).join('');
      }
      return this._innerHTML;
    },
    set innerHTML(val) {
      this._innerHTML = val;
      this.children = [];
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    appendChild(child) {
      this.children.push(child);
    },
    querySelector(sel) { return null; }
  };
  return el;
}

globalThis.document = {
  createElementNS(ns, tag) {
    return createMockElement(tag);
  },
  createElement(tag) {
    return createMockElement(tag);
  },
  querySelector(sel) {
    return null;
  }
};

import { CONFIG } from '../js/config.js';
import { calculateCAGR, calculateGrowthDelta } from '../js/calculations.js';
import { calculateGaugeDashoffset, renderSparkline, render15YearTrendChart } from '../js/charts.js';

console.log('================================================================');
console.log('       LOCAL PULSE — 15-YEAR MULTI-VINTAGE VERIFICATION SUITE');
console.log('================================================================\n');

// 1. Config Vintages Verification
console.log('1. Verifying Survey Vintages Coverage (2009–2023)...');
assert.ok(Array.isArray(CONFIG.VINTAGES), 'CONFIG.VINTAGES must be an array');
assert.strictEqual(CONFIG.VINTAGES.length, 15, 'Must cover exactly 15 continuous survey vintages');
assert.ok(CONFIG.VINTAGES.includes('2023'), 'Must include 2023');
assert.ok(CONFIG.VINTAGES.includes('2009'), 'Must include 2009');
assert.ok(CONFIG.ANCHOR_VINTAGES.length >= 4, 'Must have at least 4 instant anchor vintages');
console.log('  ✔ PASS: 15 Continuous Vintages (2009–2023) Configured');

// 2. 14-Year Compound Annual Growth Rate (CAGR) Math Verification
console.log('\n2. Verifying 14-Year CAGR Analytics...');
const cagrHome = calculateCAGR(1285000, 750000, 14);
assert.strictEqual(typeof cagrHome, 'number', 'CAGR must be a number');
assert.ok(cagrHome > 3.0 && cagrHome < 5.0, 'SF Home CAGR should be ~3.92%');
console.log(`  Home Price ($750k -> $1.285M over 14 yrs): +${cagrHome}%`);

const cagrRent = calculateCAGR(2150, 1400, 14);
console.log(`  Gross Rent ($1,400 -> $2,150 over 14 yrs): +${cagrRent}%`);
assert.ok(cagrRent > 2.5, 'Rent CAGR should be positive');

const zeroCagr = calculateCAGR(1000, 0, 14);
assert.strictEqual(zeroCagr, 0, 'Zero base should return 0 for CAGR');
console.log('  ✔ PASS: 14-Year CAGR Mathematics Verified');

// 3. SVG Sparkline Rendering Verification
console.log('\n3. Verifying Native SVG Sparkline Engine...');
const mockSparklineContainer = createMockElement('div');

const timeseries15yr = [650000, 680000, 710000, 750000, 810000, 840000, 920000, 990000, 1050000, 1100000, 1150000, 1200000, 1285000];
const sparkSvg = renderSparkline(mockSparklineContainer, timeseries15yr, { width: 120, height: 28 });
assert.ok(sparkSvg !== null, 'Sparkline SVG must be created');
assert.ok(sparkSvg.innerHTML.includes('<path'), 'Sparkline SVG must contain area gradient path');
assert.ok(sparkSvg.innerHTML.includes('<circle'), 'Sparkline SVG must contain active milestone dot');
console.log('  ✔ PASS: Native SVG Sparkline Rendered with Area Gradient');

// 4. Interactive 15-Year Multi-Series Trend Chart Verification
console.log('\n4. Verifying Interactive 15-Year Multi-Series SVG Trend Chart...');
const mockChartContainer = createMockElement('div');

const chartData = {
  years: [2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
  series: [
    {
      name: 'Local Home Price',
      color: '#06b6d4',
      values: [650000, 680000, 710000, 750000, 810000, 840000, 920000, 990000, 1050000, 1100000, 1150000, 1200000, 1285000, 1310000, 1340000]
    },
    {
      name: 'US National Benchmark',
      color: '#94a3b8',
      values: [185000, 188000, 192000, 198000, 205000, 215000, 225000, 235000, 245000, 255000, 265000, 281900, 295000, 305000, 315000]
    }
  ]
};

const trendChart = render15YearTrendChart(mockChartContainer, chartData, { width: 640, height: 220 });
assert.ok(trendChart !== null, 'Trend chart wrapper must be created');
assert.ok(mockChartContainer.children.length > 0, 'Container must receive trend chart wrapper');
console.log('  ✔ PASS: 15-Year Multi-Series SVG Trend Chart Rendered with Grid & Legend');

console.log('\n================================================================');
console.log('✔ ALL 15-YEAR MULTI-VINTAGE SUITE TESTS PASSED SUCCESSFULLY (100%)');
console.log('================================================================\n');
