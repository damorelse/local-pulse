# Local Pulse 📍

**Hyper-Local US Real Estate, Demographic, Economic, and Environmental Intelligence**

Local Pulse is a zero-maintenance, battery-conscious, and 100% free-to-run Progressive Web App (PWA) delivering hyper-local intelligence for any coordinate or address across the United States. 

It executes entirely client-side, orchestrating free public APIs with a pre-bundled 50-state and national benchmark matrix for zero-latency comparative analysis and offline reliability.

---

## 🌟 Key Features

- **📍 Location Discovery & Geocoding**:
  - 1-Tap Browser GPS ("Locate Me")
  - Address/City/ZIP search with debounced autocomplete (OSM Nominatim)
  - Popular US Neighborhood presets (SF Mission, Austin Downtown, NYC Williamsburg, Seattle Capitol Hill, Chicago Loop, Miami South Beach)
  - CORS-compliant FCC Census Block API primary geocoder with Census Geocoder JSONP and OSM Nominatim fallbacks

- **📊 Deep Census ACS 5-Year Data Engine**:
  - Parallel multi-vintage analysis across **2022**, **2020**, and **2015** releases
  - 37 Census ACS variables (Median Home Value, Gross Rent, Household Income, Age, Education, Race, Commute Modes, Tenure)
  - 4-Tier fallback cascade (Tract $\rightarrow$ ZCTA $\rightarrow$ County $\rightarrow$ Bundled Benchmark)
  - Key economic ratios: Price-to-Income Affordability, Rent Burden %, Simpson's Diversity Index, 7-Year Historical Growth Deltas & CAGR

- **🌱 Environmental & Cultural Context**:
  - Real-time US Air Quality Index (AQI, PM2.5, PM10, Ozone, NO2) via Open-Meteo
  - Live weather, humidity, wind, and ground elevation
  - Wikipedia GeoSearch nearby cultural landmarks and historical trivia

- **🎨 Responsive Bento-Box UI & Native SVG Micro-Charts**:
  - Pulse Hero 3-second glanceable metric bar
  - 180° SVG Semi-Circular Arc Gauges (Affordability Ratio & AQI)
  - Multi-segment rounded pill bars for diversity, education, and commute shares
  - Slate Dark Mode and Zinc Light Mode with zero-FOUC script
  - Interactive Leaflet Map with CartoDB Positron / Dark Matter tiles and Fullscreen mode

- **📱 Offline PWA & Comparison Mode**:
  - Saved Places & Recent Searches persisted in `localStorage`
  - 2-Column Side-by-Side Comparative Delta Scorecard
  - Web Share API (`navigator.share`) with clipboard fallback
  - Service Worker offline caching (`sw.js`) and Web App Manifest (`manifest.json`)

---

## 🚀 Quick Start

### Run with Node.js
```bash
# Start the built-in zero-dependency preview server
node server.js
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## 🧪 Testing

The repository includes a comprehensive 148+ test suite covering unit calculations, API mocks, boundary conditions, and headless browser interactions:

```bash
# Run 4-Tier API and Calculation Test Suite
node tests/api_test.js

# Run Tier-5 Adversarial & Edge Case Suite
node tests/tier5_adversarial_test.js

# Run Headless Chrome E2E Interactivity Suite
node tests/test_browser_click.mjs
```

---

## 📄 License
MIT
EOF && git add README.md && git commit --amend --no-edit
