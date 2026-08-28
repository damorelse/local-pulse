/**
 * Local Pulse — Native SVG Micro-Charts & Gauges
 * 180° Semi-Circular Arc Gauges (exact r=75 geometry) & Segmented Horizontal Pill Bars.
 */

export const ARC_RADIUS = 75;
export const ARC_PERIMETER = Math.PI * ARC_RADIUS; // ~235.6194 px
export const SVG_VIEWBOX = '0 0 200 115';

/**
 * Compute normalized stroke dashoffset for a 180° semi-circle arc gauge.
 * @param {number|null} value
 * @param {number} min
 * @param {number} max
 * @returns {number} strokeDashoffset (0 to 235.62)
 */
export function calculateGaugeDashoffset(value, min, max) {
  if (value === null || value === undefined || isNaN(value)) {
    return Number(ARC_PERIMETER.toFixed(2));
  }
  const clamped = Math.min(Math.max(value, min), max);
  const fraction = max > min ? (clamped - min) / (max - min) : 0;
  return Number((ARC_PERIMETER * (1 - fraction)).toFixed(2));
}

/**
 * Determine semantic color for Affordability Ratio (Price-to-Income)
 * @param {number|null} ratio
 * @returns {string} Hex color
 */
export function getAffordabilityColor(ratio) {
  if (ratio === null || ratio === undefined || isNaN(ratio) || ratio <= 0) {
    return '#94a3b8'; // Muted Slate
  }
  if (ratio < 3.0) return '#10b981'; // Emerald (Healthy)
  if (ratio < 5.0) return '#f59e0b'; // Amber (Moderate)
  return '#f43f5e'; // Rose (Severe Burden)
}

/**
 * Determine semantic text for Affordability Ratio
 * @param {number|null} ratio
 * @returns {string} Status label
 */
export function formatAffordabilityStatus(ratio) {
  if (ratio === null || ratio === undefined || isNaN(ratio) || ratio <= 0) {
    return 'Data Unavailable';
  }
  if (ratio < 3.0) return 'Healthy / Affordable';
  if (ratio < 5.0) return 'Moderate Burden';
  return 'Severe Cost Burden';
}

/**
 * Determine semantic color for US Air Quality Index (AQI)
 * @param {number|null} aqi
 * @returns {string} Hex color
 */
export function getAQIColor(aqi) {
  if (aqi === null || aqi === undefined || isNaN(aqi)) {
    return '#94a3b8'; // Muted
  }
  if (aqi <= 50) return '#10b981';  // Good (Emerald)
  if (aqi <= 100) return '#eab308'; // Moderate (Yellow)
  if (aqi <= 150) return '#f97316'; // Sensitive Groups (Orange)
  if (aqi <= 200) return '#ef4444'; // Unhealthy (Red)
  if (aqi <= 300) return '#a855f7'; // Very Unhealthy (Purple)
  return '#881337';                 // Hazardous (Maroon)
}

/**
 * Determine semantic status text for US AQI
 * @param {number|null} aqi
 * @returns {string} Category label
 */
export function formatAQIStatus(aqi) {
  if (aqi === null || aqi === undefined || isNaN(aqi)) {
    return 'Data Unavailable';
  }
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

/**
 * Render or update a 180° Semi-Circular SVG Arc Gauge inside a container element.
 * 
 * @param {HTMLElement|string} container - DOM element or selector string
 * @param {Object} options
 * @param {number|null} options.value - Numeric metric value
 * @param {number} [options.min=0] - Minimum scale value
 * @param {number} [options.max=100] - Maximum scale value
 * @param {string} [options.label=''] - Gauge label / title
 * @param {string} [options.unit=''] - Unit suffix (e.g. 'x', '%', 'AQI')
 * @param {string} [options.statusText] - Status subtitle (e.g. 'Healthy', 'Moderate')
 * @param {string} [options.color] - Explicit stroke color override
 * @param {string} [options.type='custom'] - 'affordability' | 'aqi' | 'custom'
 * @param {boolean} [options.showMinMax=true] - Display min/max labels at corners
 * @returns {SVGElement|null} The rendered or updated SVG element
 */
export function renderArcGauge(container, options = {}) {
  const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
  if (!containerEl) return null;

  const {
    value = null,
    min = 0,
    max = 100,
    label = '',
    unit = '',
    type = 'custom',
    showMinMax = true
  } = options;

  // Determine stroke color & status text
  let color = options.color;
  let statusText = options.statusText;

  if (type === 'affordability') {
    if (!color) color = getAffordabilityColor(value);
    if (!statusText) statusText = formatAffordabilityStatus(value);
  } else if (type === 'aqi') {
    if (!color) color = getAQIColor(value);
    if (!statusText) statusText = formatAQIStatus(value);
  } else {
    if (!color) color = '#06b6d4';
    if (!statusText) statusText = label;
  }

  const offset = calculateGaugeDashoffset(value, min, max);
  const formattedValue = (value !== null && value !== undefined && !isNaN(value))
    ? `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${unit}`
    : 'N/A';

  // Check if existing gauge SVG exists inside container
  let svg = containerEl.querySelector('svg.arc-gauge-svg');
  if (svg) {
    const progressPath = svg.querySelector('.gauge-progress');
    const valText = svg.querySelector('.gauge-val-text');
    const statusEl = svg.querySelector('.gauge-status-text');

    if (progressPath) {
      progressPath.setAttribute('stroke', color);
      progressPath.style.strokeDashoffset = `${offset}px`;
    }
    if (valText) {
      valText.textContent = formattedValue;
    }
    if (statusEl) {
      statusEl.textContent = statusText;
    }
    return svg;
  }

  // Create new SVG
  const svgNs = 'http://www.w3.org/2000/svg';
  svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', SVG_VIEWBOX);
  svg.setAttribute('class', 'arc-gauge-svg w-full max-w-[220px] mx-auto overflow-visible');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${label}: ${formattedValue} (${statusText})`);

  // 1. Background Track
  const track = document.createElementNS(svgNs, 'path');
  track.setAttribute('d', 'M 25 95 A 75 75 0 0 1 175 95');
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'var(--gauge-track, #1e293b)');
  track.setAttribute('stroke-width', '14');
  track.setAttribute('stroke-linecap', 'round');
  track.setAttribute('class', 'gauge-track');
  svg.appendChild(track);

  // 2. Animated Progress Indicator Path
  const progress = document.createElementNS(svgNs, 'path');
  progress.setAttribute('d', 'M 25 95 A 75 75 0 0 1 175 95');
  progress.setAttribute('fill', 'none');
  progress.setAttribute('stroke', color);
  progress.setAttribute('stroke-width', '14');
  progress.setAttribute('stroke-linecap', 'round');
  progress.setAttribute('stroke-dasharray', `${ARC_PERIMETER.toFixed(2)}`);
  progress.setAttribute('stroke-dashoffset', `${ARC_PERIMETER.toFixed(2)}`);
  progress.setAttribute('class', 'gauge-progress');
  progress.style.transition = 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease';
  svg.appendChild(progress);

  // 3. Center Value Display
  const textVal = document.createElementNS(svgNs, 'text');
  textVal.setAttribute('x', '100');
  textVal.setAttribute('y', '76');
  textVal.setAttribute('text-anchor', 'middle');
  textVal.setAttribute('class', 'gauge-val-text font-mono text-2xl font-bold tabular-nums');
  textVal.setAttribute('fill', 'var(--text-primary, #f8fafc)');
  textVal.textContent = formattedValue;
  svg.appendChild(textVal);

  // 4. Center Status Label
  const textStatus = document.createElementNS(svgNs, 'text');
  textStatus.setAttribute('x', '100');
  textStatus.setAttribute('y', '94');
  textStatus.setAttribute('text-anchor', 'middle');
  textStatus.setAttribute('class', 'gauge-status-text text-xs font-semibold uppercase tracking-wider');
  textStatus.setAttribute('fill', 'var(--text-secondary, #94a3b8)');
  textStatus.textContent = statusText;
  svg.appendChild(textStatus);

  // 5. Min / Max Corner Labels
  if (showMinMax) {
    const minText = document.createElementNS(svgNs, 'text');
    minText.setAttribute('x', '22');
    minText.setAttribute('y', '112');
    minText.setAttribute('text-anchor', 'start');
    minText.setAttribute('class', 'font-mono text-[10px]');
    minText.setAttribute('fill', 'var(--text-muted, #64748b)');
    minText.textContent = `${min}${unit}`;
    svg.appendChild(minText);

    const maxText = document.createElementNS(svgNs, 'text');
    maxText.setAttribute('x', '178');
    maxText.setAttribute('y', '112');
    maxText.setAttribute('text-anchor', 'end');
    maxText.setAttribute('class', 'font-mono text-[10px]');
    maxText.setAttribute('fill', 'var(--text-muted, #64748b)');
    maxText.textContent = `${max}${unit}`;
    svg.appendChild(maxText);
  }

  containerEl.innerHTML = '';
  containerEl.appendChild(svg);

  // Animate to position
  requestAnimationFrame(() => {
    progress.style.strokeDashoffset = `${offset}px`;
  });

  return svg;
}

/**
 * Render a Segmented Horizontal Pill Bar with interactive slices and responsive legend.
 * 
 * @param {HTMLElement|string} container - DOM element or selector string
 * @param {Object} options
 * @param {Array<{ label: string, value: number, color: string, formattedValue?: string }>} options.segments
 * @param {number} [options.total] - Total denominator (defaults to sum of segments)
 * @param {boolean} [options.showLegend=true] - Render legend badges below pill
 * @param {boolean} [options.showPercentages=true] - Show percentages in legend
 * @param {number} [options.pillHeight=14] - Height of pill in px
 * @returns {HTMLElement|null} The wrapper DOM element
 */
export function renderSegmentedBar(container, options = {}) {
  const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
  if (!containerEl) return null;

  const {
    segments = [],
    showLegend = true,
    showPercentages = true,
    pillHeight = 14
  } = options;

  const total = options.total !== undefined
    ? Number(options.total)
    : segments.reduce((sum, s) => sum + (Number(s.value) || 0), 0);

  const wrapper = document.createElement('div');
  wrapper.className = 'segmented-bar-wrapper';

  // Pill Bar Container
  const pillBar = document.createElement('div');
  pillBar.className = 'segmented-bar-pill';
  pillBar.style.height = `${pillHeight}px`;

  if (total <= 0) {
    const emptySlice = document.createElement('div');
    emptySlice.className = 'segment-slice';
    emptySlice.style.width = '100%';
    emptySlice.style.backgroundColor = 'var(--bg-elevated, #1e293b)';
    emptySlice.title = 'No data available';
    pillBar.appendChild(emptySlice);
  } else {
    segments.forEach((seg) => {
      const val = Math.max(0, Number(seg.value) || 0);
      const pct = (val / total) * 100;
      if (pct <= 0) return;

      const slice = document.createElement('div');
      slice.className = 'segment-slice';
      slice.style.width = `${pct.toFixed(2)}%`;
      slice.style.backgroundColor = seg.color || '#3b82f6';
      slice.title = `${seg.label}: ${seg.formattedValue || (showPercentages ? `${pct.toFixed(1)}%` : val.toLocaleString())}`;
      pillBar.appendChild(slice);
    });
  }

  wrapper.appendChild(pillBar);

  // Legend Badges
  if (showLegend && segments.length > 0) {
    const legend = document.createElement('div');
    legend.className = 'segmented-bar-legend';

    segments.forEach((seg) => {
      const val = Math.max(0, Number(seg.value) || 0);
      const pct = total > 0 ? (val / total) * 100 : 0;

      const item = document.createElement('div');
      item.className = 'legend-item';

      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.backgroundColor = seg.color || '#3b82f6';
      item.appendChild(dot);

      const label = document.createElement('span');
      label.className = 'legend-label';
      label.textContent = seg.label;
      item.appendChild(label);

      const valSpan = document.createElement('span');
      valSpan.className = 'legend-val font-mono tabular-nums';
      valSpan.textContent = seg.formattedValue || (showPercentages ? `${pct.toFixed(1)}%` : val.toLocaleString());
      item.appendChild(valSpan);

      legend.appendChild(item);
    });

    wrapper.appendChild(legend);
  }

  containerEl.innerHTML = '';
  containerEl.appendChild(wrapper);
  return wrapper;
}

/**
 * Render lightweight inline SVG sparkline curve
 *
 * @param {HTMLElement|string} container - Container selector or DOM element
 * @param {Array<number|{year: number, value: number}>} data - Array of values or data points
 * @param {object} [options] - Options { width, height, strokeColor, fillColor, activeIndex }
 * @returns {SVGElement|null}
 */
export function renderSparkline(container, data = [], options = {}) {
  const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
  if (!containerEl) return null;

  const width = options.width || 120;
  const height = options.height || 28;
  const strokeColor = options.strokeColor || '#38bdf8';
  const fillColor = options.fillColor || 'rgba(56, 189, 248, 0.15)';

  const values = data.map(d => (typeof d === 'object' && d !== null ? d.value : d)).filter(v => v !== null && !isNaN(v) && v > 0);
  if (values.length < 2) {
    containerEl.innerHTML = '<span class="text-xs text-muted font-mono">⋯</span>';
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max > min ? max - min : 1;
  const paddingY = 4;
  const usableHeight = height - paddingY * 2;

  const points = values.map((val, idx) => {
    const x = Number(((idx / (values.length - 1)) * (width - 6) + 3).toFixed(1));
    const y = Number((height - paddingY - ((val - min) / range) * usableHeight).toFixed(1));
    return { x, y, val };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `M ${points[0].x},${height} L ${polylinePoints.split(' ').map(p => `L ${p}`).join(' ')} L ${points[points.length - 1].x},${height} Z`.replace('M L', 'M');
  const lastPoint = points[points.length - 1];

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(height));
  svg.setAttribute('class', 'sparkline-svg');
  svg.style.overflow = 'visible';

  svg.innerHTML = `
    <defs>
      <linearGradient id="spark-grad-${Math.floor(Math.random()*10000)}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
      </linearGradient>
    </defs>
    <path d="M ${points[0].x},${height} L ${points.map(p => `${p.x},${p.y}`).join(' L ')} L ${lastPoint.x},${height} Z" fill="${fillColor}" />
    <polyline fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />
    <circle cx="${lastPoint.x}" cy="${lastPoint.y}" r="3" fill="${strokeColor}" />
  `;

  containerEl.innerHTML = '';
  containerEl.appendChild(svg);
  return svg;
}

/**
 * Render Interactive 15-Year Multi-Series SVG Trend Chart
 *
 * @param {HTMLElement|string} container
 * @param {object} data - { years: number[], series: Array<{ name: string, color: string, values: number[] }> }
 * @param {object} [options]
 */
export function render15YearTrendChart(container, data, options = {}) {
  const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
  if (!containerEl || !data || !data.years || !data.series) return null;

  const { years, series } = data;
  const width = options.width || 640;
  const height = options.height || 220;
  const padLeft = 60;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Find global min and max across all series
  let allVals = [];
  series.forEach(s => {
    allVals = allVals.concat(s.values.filter(v => v !== null && !isNaN(v) && v > 0));
  });

  if (allVals.length === 0) {
    containerEl.innerHTML = '<div class="p-4 text-center text-sm text-muted">No historical timeseries data available</div>';
    return null;
  }

  const minVal = Math.min(...allVals) * 0.95;
  const maxVal = Math.max(...allVals) * 1.05;
  const valRange = maxVal > minVal ? maxVal - minVal : 1;

  const getX = (idx) => padLeft + (idx / (years.length - 1)) * chartW;
  const getY = (val) => padTop + chartH - ((val - minVal) / valRange) * chartH;

  const wrapper = document.createElement('div');
  wrapper.className = 'trend-chart-wrapper';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'w-full h-auto');

  // Y-Axis Grid Lines & Labels
  const gridSteps = 4;
  let gridHtml = '';
  for (let i = 0; i <= gridSteps; i++) {
    const v = minVal + (i / gridSteps) * valRange;
    const y = getY(v);
    const label = v >= 1000000 ? `$${(v / 1000000).toFixed(2)}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;
    gridHtml += `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="var(--border-subtle, rgba(255,255,255,0.08))" stroke-dasharray="3,3" />
      <text x="${padLeft - 8}" y="${y + 4}" fill="var(--text-muted, #94a3b8)" font-size="10" text-anchor="end" font-family="monospace">${label}</text>
    `;
  }

  // X-Axis Year Labels
  let xLabelsHtml = '';
  years.forEach((yr, idx) => {
    // Show alternate years to avoid clutter
    if (idx % 2 === 0 || idx === years.length - 1) {
      const x = getX(idx);
      xLabelsHtml += `
        <text x="${x}" y="${height - 10}" fill="var(--text-muted, #94a3b8)" font-size="10" text-anchor="middle" font-family="monospace">${yr}</text>
      `;
    }
  });

  // Series Lines & Milestone Dots
  let seriesHtml = '';
  series.forEach(s => {
    const validPoints = [];
    s.values.forEach((v, idx) => {
      if (v !== null && !isNaN(v)) {
        validPoints.push({ x: getX(idx), y: getY(v), val: v, year: years[idx] });
      }
    });

    if (validPoints.length >= 2) {
      const ptsStr = validPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      seriesHtml += `
        <polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${ptsStr}" />
      `;
      validPoints.forEach(p => {
        seriesHtml += `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${s.color}" stroke="var(--bg-card, #0f172a)" stroke-width="1.5">
            <title>${s.name} (${p.year}): $${Number(p.val).toLocaleString()}</title>
          </circle>
        `;
      });
    }
  });

  svg.innerHTML = `
    ${gridHtml}
    ${xLabelsHtml}
    ${seriesHtml}
  `;

  // Legend
  const legend = document.createElement('div');
  legend.className = 'flex items-center justify-center gap-4 text-xs mt-2';
  series.forEach(s => {
    const item = document.createElement('div');
    item.className = 'flex items-center gap-1.5';
    item.innerHTML = `<span class="inline-block w-3 h-3 rounded-full" style="background:${s.color}"></span><span class="text-secondary font-medium">${s.name}</span>`;
    legend.appendChild(item);
  });

  wrapper.appendChild(svg);
  wrapper.appendChild(legend);

  containerEl.innerHTML = '';
  containerEl.appendChild(wrapper);
  return wrapper;
}

// Window global fallback
const CHARTS = {
  calculateGaugeDashoffset,
  getAffordabilityColor,
  formatAffordabilityStatus,
  getAQIColor,
  formatAQIStatus,
  renderArcGauge,
  renderSegmentedBar,
  renderSparkline,
  render15YearTrendChart,
  ARC_RADIUS,
  ARC_PERIMETER,
  SVG_VIEWBOX
};

export default CHARTS;

if (typeof window !== 'undefined') {
  window.LocalPulseCharts = CHARTS;
}

