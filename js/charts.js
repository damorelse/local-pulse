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

// Window global fallback
const CHARTS = {
  calculateGaugeDashoffset,
  getAffordabilityColor,
  formatAffordabilityStatus,
  getAQIColor,
  formatAQIStatus,
  renderArcGauge,
  renderSegmentedBar,
  ARC_RADIUS,
  ARC_PERIMETER,
  SVG_VIEWBOX
};

export default CHARTS;

if (typeof window !== 'undefined') {
  window.LocalPulseCharts = CHARTS;
}

