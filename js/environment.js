/**
 * Local Pulse Environmental & Weather Client Module
 * Queries Open-Meteo Air Quality, Weather Forecast, and Elevation APIs.
 * Classifies US AQI according to EPA standards with color bands and health descriptions.
 */

import { CONFIG as importedConfig } from './config.js';

const CONFIG = importedConfig || (typeof window !== 'undefined' && (window.LocalPulseConfig || window.CONFIG)) || {
  API: {
    OPEN_METEO_AQI: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    OPEN_METEO_WEATHER: 'https://api.open-meteo.com/v1/forecast',
  },
  AQI_THRESHOLDS: [
    { min: 0, max: 50, category: 'Good', color: '#10B981', lightBg: '#ECFDF5', darkBg: '#064E3B', description: 'Air quality is satisfactory and poses little or no risk.' },
    { min: 51, max: 100, category: 'Moderate', color: '#F59E0B', lightBg: '#FFFBEB', darkBg: '#78350F', description: 'Air quality is acceptable; very sensitive individuals may experience minor symptoms.' },
    { min: 101, max: 150, category: 'Unhealthy for Sensitive Groups', color: '#F97316', lightBg: '#FFF7ED', darkBg: '#7C2D12', description: 'Members of sensitive groups may experience health effects.' },
    { min: 151, max: 200, category: 'Unhealthy', color: '#EF4444', lightBg: '#FEF2F2', darkBg: '#7F1D1D', description: 'Everyone may begin to experience health effects.' },
    { min: 201, max: 300, category: 'Very Unhealthy', color: '#8B5CF6', lightBg: '#F5F3FF', darkBg: '#4C1D95', description: 'Health alert: risk of more serious health effects for everyone.' },
    { min: 301, max: 500, category: 'Hazardous', color: '#881337', lightBg: '#FFF1F2', darkBg: '#4C0519', description: 'Health warning of emergency conditions: everyone is more likely to be affected.' },
  ],
};

/**
 * Translates WMO weather codes into human-readable conditions and icons
 *
 * @param {number} code
 * @returns {{ description: string, icon: string }}
 */
export function getWeatherDescription(code) {
  const codeNum = Number(code);
  switch (codeNum) {
    case 0:
      return { description: 'Clear sky', icon: '☀️' };
    case 1:
      return { description: 'Mainly clear', icon: '🌤️' };
    case 2:
      return { description: 'Partly cloudy', icon: '⛅' };
    case 3:
      return { description: 'Overcast', icon: '☁️' };
    case 45:
    case 48:
      return { description: 'Foggy', icon: '🌫️' };
    case 51:
    case 53:
    case 55:
      return { description: 'Drizzle', icon: '🌦️' };
    case 56:
    case 57:
      return { description: 'Freezing Drizzle', icon: '🌧️' };
    case 61:
    case 63:
    case 65:
      return { description: 'Rain', icon: '🌧️' };
    case 66:
    case 67:
      return { description: 'Freezing Rain', icon: '🌨️' };
    case 71:
    case 73:
    case 75:
    case 77:
      return { description: 'Snow', icon: '❄️' };
    case 80:
    case 81:
    case 82:
      return { description: 'Rain showers', icon: '🌦️' };
    case 85:
    case 86:
      return { description: 'Snow showers', icon: '🌨️' };
    case 95:
      return { description: 'Thunderstorm', icon: '⛈️' };
    case 96:
    case 99:
      return { description: 'Thunderstorm with hail', icon: '⛈️' };
    default:
      return { description: 'Fair', icon: '☀️' };
  }
}

/**
 * Classifies US AQI into EPA categories, colors, and arc gauge angle
 *
 * @param {number|null} aqiVal
 * @returns {{ category: string, color: string, lightBg: string, darkBg: string, description: string, angle: number }}
 */
export function getAqiClassification(aqiVal) {
  if (aqiVal === null || aqiVal === undefined || isNaN(aqiVal)) {
    return {
      category: 'Unavailable',
      color: '#94A3B8',
      lightBg: '#F1F5F9',
      darkBg: '#1E293B',
      description: 'Air quality sensor data is currently unavailable.',
      angle: 0,
    };
  }

  const aqi = Math.max(0, Number(aqiVal));
  const thresholds = CONFIG.AQI_THRESHOLDS || [
    { min: 0, max: 50, category: 'Good', color: '#10B981', lightBg: '#ECFDF5', darkBg: '#064E3B', description: 'Air quality is satisfactory.' },
    { min: 51, max: 100, category: 'Moderate', color: '#F59E0B', lightBg: '#FFFBEB', darkBg: '#78350F', description: 'Acceptable; sensitive individuals may experience minor symptoms.' },
    { min: 101, max: 150, category: 'Unhealthy for Sensitive Groups', color: '#F97316', lightBg: '#FFF7ED', darkBg: '#7C2D12', description: 'Members of sensitive groups may experience health effects.' },
    { min: 151, max: 200, category: 'Unhealthy', color: '#EF4444', lightBg: '#FEF2F2', darkBg: '#7F1D1D', description: 'Everyone may begin to experience health effects.' },
    { min: 201, max: 300, category: 'Very Unhealthy', color: '#8B5CF6', lightBg: '#F5F3FF', darkBg: '#4C1D95', description: 'Health alert: risk of more serious health effects for everyone.' },
    { min: 301, max: 500, category: 'Hazardous', color: '#881337', lightBg: '#FFF1F2', darkBg: '#4C0519', description: 'Emergency warning: everyone is more likely to be affected.' },
  ];

  let match = thresholds[thresholds.length - 1];
  for (const t of thresholds) {
    if (aqi <= t.max) {
      match = t;
      break;
    }
  }

  // Arc Gauge needle angle: 0 to 300 AQI mapped to 0° to 180°
  const maxAqiScale = 300;
  const clamped = Math.min(Math.max(aqi, 0), maxAqiScale);
  const angle = Number(((clamped / maxAqiScale) * 180.0).toFixed(1));

  return {
    category: match.category,
    color: match.color,
    lightBg: match.lightBg,
    darkBg: match.darkBg,
    description: match.description,
    angle,
  };
}

/**
 * Fetches real-time air quality, weather conditions, and ground elevation from Open-Meteo APIs.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} [options] - Optional settings (fetch instance, timeout, signal)
 * @returns {Promise<object>} Environmental data package
 */
export async function fetchEnvironmentalData(lat, lng, options = {}) {
  const fetchFn = options.fetch || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
  if (!fetchFn) {
    throw new Error('fetch is not available in current environment');
  }

  const aqiUrl = `${CONFIG.API.OPEN_METEO_AQI}?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide&hourly=us_aqi,pm2_5,pm10&forecast_days=1`;
  const weatherUrl = `${CONFIG.API.OPEN_METEO_WEATHER}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;

  const fetchOpts = {};
  if (options.signal) fetchOpts.signal = options.signal;

  try {
    const [aqiRes, weatherRes] = await Promise.allSettled([
      fetchFn(aqiUrl, fetchOpts).then(r => (r.ok ? r.json() : null)).catch((e) => { if (e.name === 'AbortError') throw e; return null; }),
      fetchFn(weatherUrl, fetchOpts).then(r => (r.ok ? r.json() : null)).catch((e) => { if (e.name === 'AbortError') throw e; return null; }),
    ]);

    if (options.signal && options.signal.aborted) {
      throw new Error('Aborted');
    }

    const aqiData = aqiRes.status === 'fulfilled' ? aqiRes.value : null;
    const weatherData = weatherRes.status === 'fulfilled' ? weatherRes.value : null;

    // Extract AQI values
    const currentAqi = aqiData && aqiData.current ? aqiData.current : {};
    const rawAqi = currentAqi.us_aqi !== undefined && currentAqi.us_aqi !== null ? Number(currentAqi.us_aqi) : null;
    const aqiClass = getAqiClassification(rawAqi);

    // Extract Weather values
    const currentWeather = weatherData && weatherData.current ? weatherData.current : {};
    const dailyWeather = weatherData && weatherData.daily ? weatherData.daily : {};
    const weatherCondition = getWeatherDescription(currentWeather.weather_code);

    const temperature = currentWeather.temperature_2m !== undefined ? Math.round(Number(currentWeather.temperature_2m)) : null;
    const apparentTemperature = currentWeather.apparent_temperature !== undefined ? Math.round(Number(currentWeather.apparent_temperature)) : null;
    const relativeHumidity = currentWeather.relative_humidity_2m !== undefined ? Math.round(Number(currentWeather.relative_humidity_2m)) : null;
    const windSpeed = currentWeather.wind_speed_10m !== undefined ? Number(Number(currentWeather.wind_speed_10m).toFixed(1)) : null;
    const precipitation = currentWeather.precipitation !== undefined ? Number(Number(currentWeather.precipitation).toFixed(2)) : 0;
    const elevation = weatherData && weatherData.elevation !== undefined ? Math.round(Number(weatherData.elevation)) : (aqiData && aqiData.elevation !== undefined ? Math.round(Number(aqiData.elevation)) : null);

    const tempMax = dailyWeather.temperature_2m_max && dailyWeather.temperature_2m_max[0] !== undefined ? Math.round(Number(dailyWeather.temperature_2m_max[0])) : null;
    const tempMin = dailyWeather.temperature_2m_min && dailyWeather.temperature_2m_min[0] !== undefined ? Math.round(Number(dailyWeather.temperature_2m_min[0])) : null;

    return {
      // Air Quality
      aqi: rawAqi,
      aqiCategory: aqiClass.category,
      aqiColor: aqiClass.color,
      aqiLightBg: aqiClass.lightBg,
      aqiDarkBg: aqiClass.darkBg,
      aqiDescription: aqiClass.description,
      aqiAngle: aqiClass.angle,
      pm25: currentAqi.pm2_5 !== undefined && currentAqi.pm2_5 !== null ? Number(Number(currentAqi.pm2_5).toFixed(1)) : null,
      pm10: currentAqi.pm10 !== undefined && currentAqi.pm10 !== null ? Number(Number(currentAqi.pm10).toFixed(1)) : null,
      ozone: currentAqi.ozone !== undefined && currentAqi.ozone !== null ? Number(Number(currentAqi.ozone).toFixed(1)) : null,
      nitrogenDioxide: currentAqi.nitrogen_dioxide !== undefined && currentAqi.nitrogen_dioxide !== null ? Number(Number(currentAqi.nitrogen_dioxide).toFixed(1)) : null,
      sulphurDioxide: currentAqi.sulphur_dioxide !== undefined && currentAqi.sulphur_dioxide !== null ? Number(Number(currentAqi.sulphur_dioxide).toFixed(1)) : null,
      carbonMonoxide: currentAqi.carbon_monoxide !== undefined && currentAqi.carbon_monoxide !== null ? Number(Number(currentAqi.carbon_monoxide).toFixed(1)) : null,

      // Weather
      temperature,
      apparentTemperature,
      relativeHumidity,
      weatherCode: currentWeather.weather_code !== undefined ? currentWeather.weather_code : 0,
      weatherDescription: weatherCondition.description,
      weatherIcon: weatherCondition.icon,
      windSpeed,
      precipitation,
      tempMax,
      tempMin,
      elevation,
      elevationFeet: elevation !== null ? Math.round(elevation * 3.28084) : null,

      // Status metadata
      hasAqiData: rawAqi !== null,
      hasWeatherData: temperature !== null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    const fallbackAqi = getAqiClassification(null);
    return {
      aqi: null,
      aqiCategory: fallbackAqi.category,
      aqiColor: fallbackAqi.color,
      aqiDescription: fallbackAqi.description,
      aqiAngle: 0,
      pm25: null,
      pm10: null,
      ozone: null,
      temperature: null,
      relativeHumidity: null,
      weatherDescription: 'Data Unavailable',
      weatherIcon: '⛅',
      windSpeed: null,
      elevation: null,
      hasAqiData: false,
      hasWeatherData: false,
      error: err.message,
    };
  }
}

const ENVIRONMENT = {
  fetchEnvironmentalData,
  getAqiClassification,
  getWeatherDescription,
};

export default ENVIRONMENT;

if (typeof window !== 'undefined') {
  window.LocalPulseEnvironment = ENVIRONMENT;
  window.ENVIRONMENT = ENVIRONMENT;
}
