/**
 * Local Pulse — Native Web Share & Clipboard Fallback Engine
 * Dispatches rich emoji-bulleted neighborhood summaries via navigator.share on mobile
 * and clipboard fallback with toast notification on desktop.
 */

/**
 * Displays a slide-up toast notification
 *
 * @param {string} message
 * @param {number} [duration=3000] - Duration in ms
 * @param {string} [type='info'] - 'info' | 'success' | 'warning' | 'error'
 */
export function showToastNotification(message, duration = 3000, type = 'info') {
  if (typeof document === 'undefined') return;

  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');

  let icon = '✨';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, Math.max(duration - 300, 500));
}

/**
 * Builds rich emoji-bulleted summary text from place data
 *
 * @param {object} placeData
 * @returns {string} Formatted summary text
 */
export function formatShareText(placeData) {
  if (!placeData) return 'Local Pulse — Hyper-Local US Intelligence';

  const name = placeData.name || placeData.displayName || placeData.location || 'Selected Neighborhood';
  const lines = [`📍 Local Pulse: ${name}`];

  // Home Price
  const homeVal = placeData.homePrice || placeData.homeValue || (placeData.metrics && (placeData.metrics.homePrice || placeData.metrics.homeValue));
  if (homeVal !== undefined && homeVal !== null) {
    const formattedHome = typeof homeVal === 'number' ? `$${Math.round(homeVal).toLocaleString('en-US')}` : String(homeVal);
    const homeDelta = placeData.homePriceDeltaVsUS || placeData.growth7yr || (placeData.homeDelta ? `(${placeData.homeDelta})` : '');
    const deltaSuffix = homeDelta ? ` (${homeDelta})` : '';
    lines.push(`🏠 Median Home: ${formattedHome}${deltaSuffix}`);
  }

  // Income
  const income = placeData.income || placeData.medianIncome || (placeData.metrics && (placeData.metrics.income || placeData.metrics.medianIncome));
  if (income !== undefined && income !== null) {
    const formattedInc = typeof income === 'number' ? `$${Math.round(income).toLocaleString('en-US')}` : String(income);
    const incDelta = placeData.incomeDeltaVsUS || '';
    const deltaSuffix = incDelta ? ` (${incDelta})` : '';
    lines.push(`💰 Median Income: ${formattedInc}${deltaSuffix}`);
  }

  // Affordability Ratio
  const ratio = placeData.affordabilityRatio || (placeData.metrics && placeData.metrics.affordabilityRatio);
  if (ratio !== undefined && ratio !== null) {
    const rating = placeData.affordabilityRating || (placeData.metrics && placeData.metrics.affordabilityRating) || '';
    const ratingSuffix = rating ? ` (${rating})` : '';
    lines.push(`📊 Affordability Ratio: ${Number(ratio).toFixed(1)}x${ratingSuffix}`);
  }

  // Air Quality
  const aqi = placeData.aqi || (placeData.metrics && placeData.metrics.aqi);
  if (aqi !== undefined && aqi !== null) {
    const aqiCat = placeData.aqiCategory || (placeData.metrics && placeData.metrics.aqiCategory) || '';
    const catSuffix = aqiCat ? ` (${aqiCat})` : '';
    lines.push(`🌱 US AQI: ${Math.round(Number(aqi))}${catSuffix}`);
  }

  // Mobility
  const greenCommute = placeData.greenCommute || placeData.greenCommuteRate || (placeData.metrics && (placeData.metrics.greenCommute || placeData.metrics.greenCommuteRate));
  if (greenCommute !== undefined && greenCommute !== null) {
    const commutePct = greenCommute <= 1.0 && greenCommute > 0 ? Math.round(greenCommute * 100) : Math.round(Number(greenCommute));
    lines.push(`🚶 Mobility: ${commutePct}% Green Commute`);
  }

  // Nearby Landmark
  const landmark = placeData.landmark || placeData.topLandmark || (Array.isArray(placeData.landmarks) && placeData.landmarks[0] ? placeData.landmarks[0].title : null);
  if (landmark) {
    lines.push(`🏛 Landmark: ${landmark}`);
  }

  // Live URL
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'https://localpulse.app';
  let liveUrl = `${origin}/`;
  if (placeData.lat !== undefined && placeData.lng !== undefined) {
    liveUrl = `${origin}/?lat=${Number(placeData.lat).toFixed(4)}&lng=${Number(placeData.lng).toFixed(4)}`;
  } else if (placeData.url) {
    liveUrl = placeData.url;
  }
  lines.push(`🔗 Live Intelligence: ${liveUrl}`);

  return lines.join('\n');
}

/**
 * Shares neighborhood intelligence via Web Share API or falls back to Clipboard
 *
 * @param {object} placeData
 * @returns {Promise<{ success: boolean, method: 'native_share'|'clipboard_fallback', text: string, aborted?: boolean }>}
 */
export async function shareNeighborhood(placeData) {
  const shareText = formatShareText(placeData);
  const placeName = (placeData && (placeData.name || placeData.displayName)) || 'Neighborhood';
  const shareTitle = `Local Pulse — ${placeName}`;

  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'https://localpulse.app';
  let shareUrl = origin;
  if (placeData && placeData.lat !== undefined && placeData.lng !== undefined) {
    shareUrl = `${origin}/?lat=${Number(placeData.lat).toFixed(4)}&lng=${Number(placeData.lng).toFixed(4)}`;
  } else if (placeData && placeData.url) {
    shareUrl = placeData.url;
  }

  // 1. Try Native Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      });
      return { success: true, method: 'native_share', text: shareText };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { success: false, method: 'native_share', aborted: true, text: shareText };
      }
      // If navigator.share fails for non-abort reasons, fall through to clipboard
    }
  }

  // 2. Desktop / Fallback: Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(shareText);
      showToastNotification('✨ Summary copied to clipboard!', 3000, 'success');
      return { success: true, method: 'clipboard_fallback', text: shareText };
    } catch (clipErr) {
      // Fall through to textarea execCommand fallback
    }
  }

  // 3. Document ExecCommand Fallback for Older Browsers
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = shareText;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        showToastNotification('✨ Summary copied to clipboard!', 3000, 'success');
        return { success: true, method: 'clipboard_fallback', text: shareText };
      }
    } catch (execErr) {
      // Ignore
    }
  }

  showToastNotification('⚠️ Could not copy summary automatically', 3000, 'warning');
  return { success: false, method: 'clipboard_fallback', text: shareText };
}

// Set alias for compatibility
export const shareNeighborhoodSummary = shareNeighborhood;

const SHARE = {
  shareNeighborhood,
  shareNeighborhoodSummary,
  formatShareText,
  showToastNotification,
};

export default SHARE;

if (typeof window !== 'undefined') {
  window.LocalPulseShare = SHARE;
  window.SHARE = SHARE;
}
