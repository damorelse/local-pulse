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
 * Helper to build smooth cubic Bézier SVG path from array of [x, y] coordinates
 * @param {Array<[number, number]>} points
 * @returns {string} SVG Path d string
 */
export function createSmoothPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  if (points.length === 2) return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/**
 * Renders an interactive native SVG Sparkline with cubic Bézier curve, touch crosshair, and year-jumping.
 * 
 * @param {HTMLElement|string} container - DOM container element or selector
 * @param {Array<object>|object} timeSeriesData - Array of { year, value } or object { '2009': 840000, ... }
 * @param {object} [options={}]
 * @param {string} [options.activeYear='2022'] - Currently selected vintage
 * @param {string} [options.color='#38bdf8'] - Stroke color
 * @param {string} [options.unit=''] - Unit suffix (e.g. '$', '%', 'x')
 * @param {Function} [options.onSelectYear] - Callback when a year node is clicked
 * @param {Function} [options.formatValue] - Custom value formatter
 * @returns {SVGElement|null}
 */
export function renderSparkline(container, timeSeriesData, options = {}) {
  const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
  if (!containerEl) return null;

  // Normalize input data
  let dataPoints = [];
  if (Array.isArray(timeSeriesData)) {
    dataPoints = timeSeriesData.map((d, idx) => {
      if (typeof d === 'number') {
        return { year: String(2009 + idx), value: d };
      }
      return {
        year: String(d.year || d.vintage || (2009 + idx)),
        value: d.value !== undefined ? d.value : (d.val !== undefined ? d.val : null),
      };
    }).filter(d => d.year && d.value !== null && !isNaN(d.value));
  } else if (timeSeriesData && typeof timeSeriesData === 'object') {
    const years = Object.keys(timeSeriesData).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    dataPoints = years.map(y => {
      const entry = timeSeriesData[y];
      const val = typeof entry === 'number' ? entry : (entry && entry.metrics ? (entry.metrics.homeValue || entry.metrics.medianIncome || entry.metrics.grossRent || entry.metrics.affordabilityRatio || entry.value) : (entry ? entry.value : null));
      return { year: String(y), value: val !== null && !isNaN(val) ? Number(val) : null };
    }).filter(d => d.value !== null);
  }

  if (dataPoints.length < 2) {
    containerEl.innerHTML = '';
    return null;
  }

  const {
    activeYear = '2022',
    color = '#38bdf8',
    unit = '',
    onSelectYear = null,
    formatValue = (v) => `${unit}${typeof v === 'number' ? v.toLocaleString() : v}`,
  } = options;

  const width = 240;
  const height = 52;
  const paddingX = 10;
  const paddingY = 8;

  const values = dataPoints.map(d => d.value);
  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);
  if (minVal === maxVal) {
    minVal = minVal * 0.9;
    maxVal = maxVal * 1.1;
  }
  const valRange = maxVal - minVal || 1;

  const points = dataPoints.map((d, i) => {
    const x = paddingX + (i / (dataPoints.length - 1)) * (width - 2 * paddingX);
    const y = (height - paddingY) - ((d.value - minVal) / valRange) * (height - 2 * paddingY);
    return { x, y, year: d.year, value: d.value };
  });

  const curvePathD = createSmoothPath(points.map(p => [p.x, p.y]));
  const firstX = points[0].x;
  const lastX = points[points.length - 1].x;
  const bottomY = height;
  const areaPathD = `${curvePathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

  const gradId = `spark-grad-${Math.random().toString(36).substring(2, 8)}`;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'sparkline-svg w-full overflow-visible select-none cursor-crosshair');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `15-Year Trend Sparkline (2009–2023)`);

  // Defs: Gradients
  const defs = document.createElementNS(svgNs, 'defs');
  const gradient = document.createElementNS(svgNs, 'linearGradient');
  gradient.setAttribute('id', gradId);
  gradient.setAttribute('x1', '0%');
  gradient.setAttribute('y1', '0%');
  gradient.setAttribute('x2', '0%');
  gradient.setAttribute('y2', '100%');

  const stop1 = document.createElementNS(svgNs, 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', color);
  stop1.setAttribute('stop-opacity', '0.35');
  gradient.appendChild(stop1);

  const stop2 = document.createElementNS(svgNs, 'stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', color);
  stop2.setAttribute('stop-opacity', '0.0');
  gradient.appendChild(stop2);
  defs.appendChild(gradient);
  svg.appendChild(defs);

  // Area Fill
  const areaPath = document.createElementNS(svgNs, 'path');
  areaPath.setAttribute('d', areaPathD);
  areaPath.setAttribute('fill', `url(#${gradId})`);
  svg.appendChild(areaPath);

  // Line Stroke
  const strokePath = document.createElementNS(svgNs, 'path');
  strokePath.setAttribute('d', curvePathD);
  strokePath.setAttribute('fill', 'none');
  strokePath.setAttribute('stroke', color);
  strokePath.setAttribute('stroke-width', '2');
  strokePath.setAttribute('stroke-linecap', 'round');
  strokePath.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(strokePath);

  // Crosshair Elements (Group)
  const crosshairGroup = document.createElementNS(svgNs, 'g');
  crosshairGroup.setAttribute('class', 'sparkline-crosshair hidden');

  const crosshairLine = document.createElementNS(svgNs, 'line');
  crosshairLine.setAttribute('y1', '2');
  crosshairLine.setAttribute('y2', String(height - 2));
  crosshairLine.setAttribute('stroke', 'var(--color-cyan-400, #38bdf8)');
  crosshairLine.setAttribute('stroke-width', '1');
  crosshairLine.setAttribute('stroke-dasharray', '2 2');
  crosshairGroup.appendChild(crosshairLine);

  const crosshairCircle = document.createElementNS(svgNs, 'circle');
  crosshairCircle.setAttribute('r', '4');
  crosshairCircle.setAttribute('fill', color);
  crosshairCircle.setAttribute('stroke', '#0f172a');
  crosshairCircle.setAttribute('stroke-width', '2');
  crosshairGroup.appendChild(crosshairCircle);

  svg.appendChild(crosshairGroup);

  // Year Nodes (Subtle dots for anchor years: 2009, 2015, 2020, 2023)
  const anchorYears = ['2009', '2015', '2020', '2023'];
  points.forEach(p => {
    const isAnchor = anchorYears.includes(p.year);
    const isActive = String(p.year) === String(activeYear);

    if (isAnchor || isActive) {
      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('cx', p.x.toFixed(1));
      circle.setAttribute('cy', p.y.toFixed(1));
      circle.setAttribute('r', isActive ? '4' : '2.5');
      circle.setAttribute('fill', isActive ? '#ffffff' : color);
      circle.setAttribute('stroke', isActive ? color : '#0f172a');
      circle.setAttribute('stroke-width', isActive ? '2' : '1');
      circle.setAttribute('class', `sparkline-node ${isActive ? 'active-node' : ''}`);
      circle.setAttribute('data-year', p.year);
      svg.appendChild(circle);
    }
  });

  // Tooltip Element inside Container
  let tooltip = containerEl.querySelector('.sparkline-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'sparkline-tooltip hidden';
    containerEl.style.position = 'relative';
    containerEl.appendChild(tooltip);
  }

  // Pointer Interaction Overlay
  const overlay = document.createElementNS(svgNs, 'rect');
  overlay.setAttribute('width', String(width));
  overlay.setAttribute('height', String(height));
  overlay.setAttribute('fill', 'transparent');
  overlay.style.cursor = 'crosshair';
  svg.appendChild(overlay);

  // Helper to handle crosshair position
  function updateCrosshair(clientX) {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * width;
    
    // Find closest point
    let closest = points[0];
    let minDiff = Math.abs(relX - points[0].x);
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(relX - points[i].x);
      if (diff < minDiff) {
        minDiff = diff;
        closest = points[i];
      }
    }

    crosshairGroup.classList.remove('hidden');
    crosshairLine.setAttribute('x1', closest.x.toFixed(1));
    crosshairLine.setAttribute('x2', closest.x.toFixed(1));
    crosshairCircle.setAttribute('cx', closest.x.toFixed(1));
    crosshairCircle.setAttribute('cy', closest.y.toFixed(1));

    // Base point for growth calculation (2009 or first point)
    const basePoint = points[0];
    const deltaPct = basePoint && basePoint.value > 0 ? (((closest.value - basePoint.value) / basePoint.value) * 100).toFixed(1) : '0.0';
    const sign = Number(deltaPct) >= 0 ? '+' : '';

    tooltip.innerHTML = `<strong>${closest.year}</strong>: ${formatValue(closest.value)} <span class="text-xs ${Number(deltaPct) >= 0 ? 'delta-positive' : 'delta-warning'}">(${sign}${deltaPct}%)</span>`;
    tooltip.classList.remove('hidden');

    const tooltipLeft = Math.max(10, Math.min(rect.width - 120, (closest.x / width) * rect.width - 60));
    tooltip.style.left = `${tooltipLeft}px`;
    tooltip.style.top = '-28px';

    return closest;
  }

  function hideCrosshair() {
    crosshairGroup.classList.add('hidden');
    tooltip.classList.add('hidden');
  }

  overlay.addEventListener('pointermove', (e) => {
    updateCrosshair(e.clientX);
  });

  overlay.addEventListener('pointerleave', () => {
    hideCrosshair();
  });

  overlay.addEventListener('click', (e) => {
    const closest = updateCrosshair(e.clientX);
    if (closest) {
      if (typeof onSelectYear === 'function') {
        onSelectYear(closest.year);
      }
      containerEl.dispatchEvent(new CustomEvent('vintageselect', {
        bubbles: true,
        detail: { year: closest.year, value: closest.value }
      }));
    }
  });

  // Touch Support
  overlay.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      updateCrosshair(e.touches[0].clientX);
    }
  }, { passive: true });

  overlay.addEventListener('touchend', () => {
    setTimeout(hideCrosshair, 1500);
  });

  containerEl.innerHTML = '';
  containerEl.appendChild(svg);
  containerEl.appendChild(tooltip);

  return svg;
}

/**
 * Renders a dual 15-Year Comparison Line Chart (Place A vs Place B)
 * 
 * @param {HTMLElement|string} container
 * @param {object} seriesA - { name: string, color: string, data: Array<{ year, value }> }
 * @param {object} seriesB - { name: string, color: string, data: Array<{ year, value }> }
 * @param {object} [options={}]
 * @returns {SVGElement|null}
 */
export function render15YearComparisonChart(container, seriesA, seriesB, options = {}) {
  const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
  if (!containerEl || !seriesA || !seriesB) return null;

  const dataA = seriesA.data || [];
  const dataB = seriesB.data || [];
  if (dataA.length < 2 || dataB.length < 2) return null;

  const width = 480;
  const height = 180;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;

  const {
    normalized = true, // Normalize to 100 at base year (2009)
    metricLabel = 'Indexed Growth (2009 = 100)',
  } = options;

  // Process data points
  const baseA = dataA[0].value || 1;
  const baseB = dataB[0].value || 1;

  const normA = dataA.map(d => ({ year: d.year, val: normalized ? (d.value / baseA) * 100 : d.value }));
  const normB = dataB.map(d => ({ year: d.year, val: normalized ? (d.value / baseB) * 100 : d.value }));

  const allVals = [...normA.map(d => d.val), ...normB.map(d => d.val)].filter(v => !isNaN(v));
  const minVal = Math.min(...allVals) * 0.95;
  const maxVal = Math.max(...allVals) * 1.05;
  const range = maxVal - minVal || 1;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const pointsA = normA.map((d, i) => [
    padLeft + (i / (normA.length - 1)) * plotW,
    (height - padBottom) - ((d.val - minVal) / range) * plotH
  ]);
  const pointsB = normB.map((d, i) => [
    padLeft + (i / (normB.length - 1)) * plotW,
    (height - padBottom) - ((d.val - minVal) / range) * plotH
  ]);

  const pathA = createSmoothPath(pointsA);
  const pathB = createSmoothPath(pointsB);

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'w-full h-auto overflow-visible select-none');

  // Grid Lines & Ticks
  const gridGroup = document.createElementNS(svgNs, 'g');
  gridGroup.setAttribute('class', 'chart-grid opacity-20');

  // 3 Horizontal Grid lines
  for (let i = 0; i <= 2; i++) {
    const y = padTop + (i / 2) * plotH;
    const gridVal = maxVal - (i / 2) * range;
    const line = document.createElementNS(svgNs, 'line');
    line.setAttribute('x1', String(padLeft));
    line.setAttribute('x2', String(width - padRight));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', '#94a3b8');
    line.setAttribute('stroke-dasharray', '3 3');
    gridGroup.appendChild(line);

    const txt = document.createElementNS(svgNs, 'text');
    txt.setAttribute('x', String(padLeft - 6));
    txt.setAttribute('y', String(y + 4));
    txt.setAttribute('text-anchor', 'end');
    txt.setAttribute('class', 'font-mono text-[9px] fill-slate-400');
    txt.textContent = normalized ? `${Math.round(gridVal)}` : `$${Math.round(gridVal / 1000)}k`;
    svg.appendChild(txt);
  }
  svg.appendChild(gridGroup);

  // X Axis Year Ticks
  const milestoneYears = [0, 3, 6, 9, 12, 14]; // 2009, 2012, 2015, 2018, 2021, 2023
  milestoneYears.forEach(idx => {
    if (dataA[idx]) {
      const x = padLeft + (idx / (dataA.length - 1)) * plotW;
      const yrText = document.createElementNS(svgNs, 'text');
      yrText.setAttribute('x', String(x));
      yrText.setAttribute('y', String(height - 8));
      yrText.setAttribute('text-anchor', 'middle');
      yrText.setAttribute('class', 'font-mono text-[10px] fill-slate-400');
      yrText.textContent = dataA[idx].year;
      svg.appendChild(yrText);
    }
  });

  // Curve A
  const lineA = document.createElementNS(svgNs, 'path');
  lineA.setAttribute('d', pathA);
  lineA.setAttribute('fill', 'none');
  lineA.setAttribute('stroke', seriesA.color || '#38bdf8');
  lineA.setAttribute('stroke-width', '2.5');
  lineA.setAttribute('stroke-linecap', 'round');
  svg.appendChild(lineA);

  // Curve B
  const lineB = document.createElementNS(svgNs, 'path');
  lineB.setAttribute('d', pathB);
  lineB.setAttribute('fill', 'none');
  lineB.setAttribute('stroke', seriesB.color || '#f59e0b');
  lineB.setAttribute('stroke-width', '2.5');
  lineB.setAttribute('stroke-linecap', 'round');
  svg.appendChild(lineB);

  containerEl.innerHTML = '';
  containerEl.appendChild(svg);
  return svg;
}

/**
 * Renders a 15-Year Multi-Series Trend Chart (Values over 2009-2023)
 *
 * @param {HTMLElement|string} container
 * @param {object} chartData - { years: Array<number|string>, series: Array<{ name, color, values: number[] }> }
 * @param {object} [options={}]
 * @returns {SVGElement|null}
 */
export function render15YearTrendChart(container, chartData, options = {}) {
  const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
  if (!containerEl || !chartData || !chartData.series) return null;

  const years = chartData.years || ['2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023'];
  const seriesList = chartData.series || [];
  if (seriesList.length === 0) return null;

  const width = options.width || 640;
  const height = options.height || 220;
  const padLeft = options.padLeft || 50;
  const padRight = options.padRight || 20;
  const padTop = options.padTop || 25;
  const padBottom = options.padBottom || 35;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const allVals = seriesList.flatMap(s => s.values || []).filter(v => v !== null && !isNaN(v));
  let minVal = Math.min(...allVals);
  let maxVal = Math.max(...allVals);
  if (minVal === maxVal) {
    minVal = minVal * 0.9;
    maxVal = maxVal * 1.1;
  }
  const range = maxVal - minVal || 1;

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'w-full h-auto overflow-visible select-none');

  // Background Grid Lines
  const gridGroup = document.createElementNS(svgNs, 'g');
  gridGroup.setAttribute('class', 'chart-grid opacity-20');

  for (let i = 0; i <= 3; i++) {
    const y = padTop + (i / 3) * plotH;
    const gridVal = maxVal - (i / 3) * range;
    const line = document.createElementNS(svgNs, 'line');
    line.setAttribute('x1', String(padLeft));
    line.setAttribute('x2', String(width - padRight));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', '#94a3b8');
    line.setAttribute('stroke-dasharray', '3 3');
    gridGroup.appendChild(line);

    const txt = document.createElementNS(svgNs, 'text');
    txt.setAttribute('x', String(padLeft - 8));
    txt.setAttribute('y', String(y + 4));
    txt.setAttribute('text-anchor', 'end');
    txt.setAttribute('class', 'font-mono text-[9px] fill-slate-400');
    txt.textContent = `$${Math.round(gridVal / 1000)}k`;
    svg.appendChild(txt);
  }
  svg.appendChild(gridGroup);

  // X Axis Year Ticks
  const step = Math.max(1, Math.floor(years.length / 5));
  for (let i = 0; i < years.length; i += step) {
    const x = padLeft + (i / (years.length - 1)) * plotW;
    const yrText = document.createElementNS(svgNs, 'text');
    yrText.setAttribute('x', String(x));
    yrText.setAttribute('y', String(height - 10));
    yrText.setAttribute('text-anchor', 'middle');
    yrText.setAttribute('class', 'font-mono text-[10px] fill-slate-400');
    yrText.textContent = String(years[i]);
    svg.appendChild(yrText);
  }

  // Draw Series Curves
  seriesList.forEach((s) => {
    const vals = s.values || [];
    const points = vals.map((v, i) => [
      padLeft + (i / (vals.length - 1)) * plotW,
      (height - padBottom) - ((v - minVal) / range) * plotH
    ]);
    const pathD = createSmoothPath(points);

    const pathEl = document.createElementNS(svgNs, 'path');
    pathEl.setAttribute('d', pathD);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', s.color || '#38bdf8');
    pathEl.setAttribute('stroke-width', '2.5');
    pathEl.setAttribute('stroke-linecap', 'round');
    pathEl.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(pathEl);
  });

  containerEl.innerHTML = '';
  containerEl.appendChild(svg);
  return svg;
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
  render15YearComparisonChart,
  render15YearTrendChart,
  createSmoothPath,
  ARC_RADIUS,
  ARC_PERIMETER,
  SVG_VIEWBOX
};

export default CHARTS;

if (typeof window !== 'undefined') {
  window.LocalPulseCharts = CHARTS;
  window.CHARTS = CHARTS;
}

