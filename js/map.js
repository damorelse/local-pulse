/**
 * Local Pulse — Interactive Leaflet GIS Map Engine
 * CartoDB Positron / Dark Matter tile layers, custom draggable pulse pin,
 * mobile scroll-trap protection, and fullscreen exploration modal.
 */

// CartoDB Tile URL templates
export const TILE_URL_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const TILE_URL_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

/**
 * Create a custom glowing SVG pulse marker icon
 * @returns {L.DivIcon|null}
 */
export function createPulseMarkerIcon() {
  if (typeof L === 'undefined' || !L.divIcon) return null;
  return L.divIcon({
    className: 'pulse-marker-wrapper',
    html: `
      <div class="pulse-marker">
        <div class="pulse-marker-ring"></div>
        <div class="pulse-marker-center"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

/**
 * Initialize an interactive Leaflet map instance
 * 
 * @param {string|HTMLElement} container - DOM element or ID
 * @param {Object} [options={}]
 * @param {number} [options.lat=37.7525] - Default latitude (SF Mission)
 * @param {number} [options.lng=-122.4184] - Default longitude
 * @param {number} [options.zoom=14] - Default zoom level
 * @param {boolean} [options.isDark=true] - Initial dark mode state
 * @param {boolean} [options.draggable=true] - Enable draggable pin
 * @param {Function} [options.onDragEnd] - Coordinate change callback
 * @returns {Object} Map controller interface
 */
export function initMap(container, options = {}) {
  const containerEl = typeof container === 'string'
    ? (document.getElementById(container) || document.querySelector(container))
    : container;

  if (!containerEl) {
    console.warn(`[LocalPulse Map] Container element not found: ${container}`);
    return null;
  }

  const {
    lat = 37.7525,
    lng = -122.4184,
    zoom = 14,
    isDark = document.documentElement ? document.documentElement.classList.contains('dark') : true,
    draggable = true,
    onDragEnd = null
  } = options;

  let mapInstance = null;
  let tileLayer = null;
  let markerInstance = null;
  let dragCallbacks = onDragEnd ? [onDragEnd] : [];
  let currentLat = lat;
  let currentLng = lng;
  let currentZoom = zoom;
  let currentIsDark = isDark;

  // Verify Leaflet availability
  if (typeof L === 'undefined') {
    console.warn('[LocalPulse Map] Leaflet library (L) is not loaded yet.');
    // Render fallback mockup container
    containerEl.innerHTML = `
      <div style="height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-elevated); color: var(--text-secondary); font-size: 0.85rem;">
        <span>🗺️ Interactive Map (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})</span>
      </div>
    `;
    return {
      map: null,
      marker: null,
      setCoordinates: (newLat, newLng) => { currentLat = newLat; currentLng = newLng; },
      onPinDrag: (cb) => { if (typeof cb === 'function') dragCallbacks.push(cb); },
      setTheme: (dark) => { currentIsDark = dark; },
      invalidateSize: () => {},
      openFullscreen: () => {},
      closeFullscreen: () => {}
    };
  }

  // Create Leaflet Map Instance
  try {
    // Check if container already initialized
    if (containerEl._leaflet_id) {
      containerEl._leaflet_id = null;
      containerEl.innerHTML = '';
    }

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    mapInstance = L.map(containerEl, {
      center: [lat, lng],
      zoom: zoom,
      zoomControl: true,
      scrollWheelZoom: !isTouchDevice, // prevent scroll-trap on mobile
      dragging: true,
      attributionControl: true
    });

    // Create Tile Layer
    const tileUrl = isDark ? TILE_URL_DARK : TILE_URL_LIGHT;
    tileLayer = L.tileLayer(tileUrl, {
      subdomains: ['a', 'b', 'c', 'd'],
      maxZoom: 19,
      minZoom: 3,
      attribution: TILE_ATTRIBUTION
    }).addTo(mapInstance);

    // Create Draggable Glowing Marker
    const icon = createPulseMarkerIcon();
    const markerOptions = {
      draggable: draggable,
      autoPan: true
    };
    if (icon) {
      markerOptions.icon = icon;
    }

    markerInstance = L.marker([lat, lng], markerOptions).addTo(mapInstance);

    // Bind Dragend Event
    markerInstance.on('dragend', (e) => {
      const position = e.target.getLatLng();
      currentLat = position.lat;
      currentLng = position.lng;
      dragCallbacks.forEach((cb) => {
        try {
          cb(currentLat, currentLng);
        } catch (err) {
          console.error('[LocalPulse Map] Pin drag callback error:', err);
        }
      });
    });

    // Mobile Touch Overlay Setup (Scroll-Trap Protection)
    setupMobileTouchProtection(containerEl, mapInstance);

    // Global Theme Change Listener
    window.addEventListener('themechange', (e) => {
      const dark = e.detail ? e.detail.isDark : document.documentElement.classList.contains('dark');
      controller.setTheme(dark);
    });

  } catch (err) {
    console.error('[LocalPulse Map] Failed to initialize Leaflet map:', err);
  }

  const controller = {
    map: mapInstance,
    marker: markerInstance,

    /**
     * Update center coordinates and marker position
     * @param {number} newLat
     * @param {number} newLng
     * @param {number} [newZoom]
     */
    setCoordinates(newLat, newLng, newZoom) {
      currentLat = Number(newLat);
      currentLng = Number(newLng);
      if (newZoom !== undefined) currentZoom = Number(newZoom);

      if (mapInstance && markerInstance) {
        markerInstance.setLatLng([currentLat, currentLng]);
        mapInstance.setView([currentLat, currentLng], newZoom || mapInstance.getZoom(), {
          animate: true,
          duration: 0.5
        });
      }
    },

    /**
     * Register pin drag callback
     * @param {Function} callback (lat, lng) => void
     */
    onPinDrag(callback) {
      if (typeof callback === 'function') {
        dragCallbacks.push(callback);
      }
    },

    /**
     * Switch tile layer between CartoDB Dark Matter and Positron
     * @param {boolean} dark
     */
    setTheme(dark) {
      currentIsDark = dark;
      if (!mapInstance || !tileLayer) return;

      const newUrl = dark ? TILE_URL_DARK : TILE_URL_LIGHT;
      tileLayer.setUrl(newUrl);
    },

    /**
     * Force Leaflet to recalculate container dimensions
     */
    invalidateSize() {
      if (mapInstance) {
        setTimeout(() => {
          mapInstance.invalidateSize();
        }, 100);
      }
    },

    /**
     * Open fullscreen map exploration modal
     */
    openFullscreen() {
      const modal = document.getElementById('modal-map-fullscreen');
      if (modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        
        // Move or sync map to fullscreen container
        this.invalidateSize();
      }
    },

    /**
     * Close fullscreen map exploration modal
     */
    closeFullscreen() {
      const modal = document.getElementById('modal-map-fullscreen');
      if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
        this.invalidateSize();
      }
    }
  };

  return controller;
}

/**
 * Setup mobile touch protection overlay to prevent scroll trapping
 * @param {HTMLElement} containerEl
 * @param {L.Map} map
 */
function setupMobileTouchProtection(containerEl, map) {
  if (!containerEl || !map) return;

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouch) return;

  // Create overlay if not present
  let overlay = containerEl.querySelector('.map-touch-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'map-touch-overlay';
    overlay.innerHTML = '<span>👆 Tap to interact with map</span>';
    containerEl.appendChild(overlay);
  }

  let resetTimer = null;

  overlay.addEventListener('click', () => {
    overlay.classList.add('hidden');
    map.scrollWheelZoom.enable();

    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      overlay.classList.remove('hidden');
      map.scrollWheelZoom.disable();
    }, 6000);
  });

  // Re-enable overlay if user touches outside container
  document.addEventListener('touchstart', (e) => {
    if (!containerEl.contains(e.target)) {
      overlay.classList.remove('hidden');
      map.scrollWheelZoom.disable();
      if (resetTimer) clearTimeout(resetTimer);
    }
  }, { passive: true });
}

// Window global fallback
const MAP = {
  initMap,
  createPulseMarkerIcon,
  TILE_URL_DARK,
  TILE_URL_LIGHT,
  TILE_ATTRIBUTION
};

export default MAP;

if (typeof window !== 'undefined') {
  window.LocalPulseMap = MAP;
}

