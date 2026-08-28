/**
 * Local Pulse Wikipedia GeoSearch & Landmark Discovery Client
 * Queries Wikipedia GeoSearch API with origin=* for CORS compliance.
 * Retrieves nearby cultural/historical landmarks, calculates distances, and extracts summaries & thumbnails.
 */

import { CONFIG as importedConfig } from './config.js';

const CONFIG = importedConfig || (typeof window !== 'undefined' && (window.LocalPulseConfig || window.CONFIG)) || {
  API: {
    WIKIPEDIA_API: 'https://en.wikipedia.org/w/api.php',
  },
};

/**
 * Fetches nearby historical and cultural landmarks from Wikipedia GeoSearch
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} [radiusMeters=3500] - Search radius in meters (default 3.5km, max 10km)
 * @param {number} [limit=8] - Maximum number of landmarks to return
 * @param {object} [options] - Optional fetch instance and timeout
 * @returns {Promise<Array<{ pageId: number, title: string, lat: number, lng: number, distanceMeters: number, distanceMiles: number, summary: string, thumbnailUrl: string|null, url: string }>>}
 */
export async function fetchNearbyLandmarks(lat, lng, radiusMeters = 3500, limit = 8, options = {}) {
  const fetchFn = options.fetch || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  if (!fetchFn) {
    throw new Error('fetch is not available in current environment');
  }

  if (lat === null || lat === undefined || lng === null || lng === undefined || isNaN(lat) || isNaN(lng)) {
    return [];
  }

  const radius = Math.min(Math.max(Number(radiusMeters) || 3500, 500), 10000);
  const maxResults = Math.min(Math.max(Number(limit) || 8, 1), 20);

  const geoSearchUrl = `${CONFIG.API.WIKIPEDIA_API}?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=${radius}&gslimit=${maxResults}&format=json&origin=*`;
  const fetchOpts = {};
  if (options.signal) fetchOpts.signal = options.signal;

  try {
    const geoRes = await fetchFn(geoSearchUrl, fetchOpts);
    if (!geoRes.ok) {
      return [];
    }

    const geoData = await geoRes.json();
    const searchItems = (geoData && geoData.query && Array.isArray(geoData.query.geosearch))
      ? geoData.query.geosearch
      : [];

    if (searchItems.length === 0) {
      return [];
    }

    // Collect page IDs for details/extracts query
    const pageIds = searchItems.map(item => item.pageid).filter(Boolean);
    if (pageIds.length === 0) {
      return [];
    }

    const detailsUrl = `${CONFIG.API.WIKIPEDIA_API}?action=query&prop=pageimages|extracts&piprop=thumbnail&pithumbsize=400&exintro=1&explaintext=1&exchars=300&pageids=${pageIds.join('|')}&format=json&origin=*`;

    let pagesMap = {};
    try {
      const detailsRes = await fetchFn(detailsUrl, fetchOpts);
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        if (detailsData && detailsData.query && detailsData.query.pages) {
          pagesMap = detailsData.query.pages;
        }
      }
    } catch (e) {
      // Continue with basic geosearch info if details query fails
    }

    // Map combined results
    const landmarks = searchItems.map(item => {
      const pageDetail = pagesMap[item.pageid] || {};
      const distMeters = Math.round(Number(item.dist) || 0);
      const distMiles = Number((distMeters * 0.000621371).toFixed(2));

      let summary = pageDetail.extract || '';
      if (summary.length > 250) {
        summary = summary.substring(0, 247).trim() + '...';
      }

      const thumbnailUrl = (pageDetail.thumbnail && pageDetail.thumbnail.source)
        ? pageDetail.thumbnail.source
        : null;

      return {
        pageId: item.pageid,
        title: item.title,
        lat: item.lat,
        lng: item.lon,
        distanceMeters: distMeters,
        distanceMiles: distMiles,
        summary: summary || `Historical landmark located ${distMiles} miles away.`,
        thumbnailUrl,
        url: `https://en.wikipedia.org/?curid=${item.pageid}`,
      };
    });

    return landmarks;
  } catch (err) {
    return [];
  }
}

const WIKIPEDIA = {
  fetchNearbyLandmarks,
};

export default WIKIPEDIA;

if (typeof window !== 'undefined') {
  window.LocalPulseWikipedia = WIKIPEDIA;
  window.WIKIPEDIA = WIKIPEDIA;
}
