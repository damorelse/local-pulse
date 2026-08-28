/**
 * Local Pulse Configuration Module
 * Defines API endpoints, preset locations, Census ACS 5-Year variable mappings (2022, 2020, 2015),
 * EPA AQI thresholds, and calculation constants.
 */

export const CONFIG = {
  // API Endpoints
  API: {
    FCC_CENSUS_BLOCK: 'https://geo.fcc.gov/api/census/block/find',
    CENSUS_GEOCODER: 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates',
    OSM_NOMINATIM_SEARCH: 'https://nominatim.openstreetmap.org/search',
    OSM_NOMINATIM_REVERSE: 'https://nominatim.openstreetmap.org/reverse',
    CENSUS_ACS_BASE: 'https://api.census.gov/data',
    OPEN_METEO_AQI: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    OPEN_METEO_WEATHER: 'https://api.open-meteo.com/v1/forecast',
    OPEN_METEO_ELEVATION: 'https://api.open-meteo.com/v1/elevation',
    WIKIPEDIA_API: 'https://en.wikipedia.org/w/api.php',
  },

  // User Agent for OSM Nominatim and Census Requests
  USER_AGENT: 'LocalPulsePWA/1.0 (https://localpulse.app; mailto:support@localpulse.app)',

  // Supported Survey Vintages (Full 15-Year Series)
  VINTAGES: ['2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2014', '2013', '2012', '2011', '2010', '2009'],
  ANCHOR_VINTAGES: ['2023', '2022', '2020', '2015'],
  DEFAULT_VINTAGE: '2022',

  // Popular US Neighborhood Presets
  PRESETS: [
    {
      id: 'sf_mission',
      name: 'SF Mission District',
      neighborhood: 'Mission District',
      city: 'San Francisco',
      state: 'CA',
      stateCode: 'CA',
      stateFips: '06',
      countyFips: '075',
      tractFips: '022801',
      zcta: '94110',
      lat: 37.7599,
      lng: -122.4148,
      description: 'Vibrant cultural enclave with dense transit, historic murals, and tech influx.',
    },
    {
      id: 'austin_downtown',
      name: 'Austin Downtown',
      neighborhood: 'Downtown',
      city: 'Austin',
      state: 'TX',
      stateCode: 'TX',
      stateFips: '48',
      countyFips: '453',
      tractFips: '001100',
      zcta: '78701',
      lat: 30.2672,
      lng: -97.7431,
      description: 'Rapidly growing tech and music corridor with high population influx.',
    },
    {
      id: 'nyc_williamsburg',
      name: 'NYC Williamsburg',
      neighborhood: 'Williamsburg',
      city: 'Brooklyn',
      state: 'NY',
      stateCode: 'NY',
      stateFips: '36',
      countyFips: '047',
      tractFips: '054900',
      zcta: '11211',
      lat: 40.7081,
      lng: -73.9571,
      description: 'High-density creative and dining hub with high transit adoption.',
    },
    {
      id: 'seattle_capitol_hill',
      name: 'Seattle Capitol Hill',
      neighborhood: 'Capitol Hill',
      city: 'Seattle',
      state: 'WA',
      stateCode: 'WA',
      stateFips: '53',
      countyFips: '033',
      tractFips: '007402',
      zcta: '98102',
      lat: 47.6150,
      lng: -122.3200,
      description: 'Dense, walkable center of arts, nightlife, and tech talent.',
    },
    {
      id: 'chicago_loop',
      name: 'Chicago Loop',
      neighborhood: 'The Loop',
      city: 'Chicago',
      state: 'IL',
      stateCode: 'IL',
      stateFips: '17',
      countyFips: '031',
      tractFips: '839100',
      zcta: '60602',
      lat: 41.8818,
      lng: -87.6231,
      description: 'Historic architectural heartland and central business district.',
    },
  ],

  // 37 US Census ACS 5-Year Variable Definitions (Consistent across 2022, 2020, 2015)
  CENSUS_VARIABLES: {
    // 1. Population & Demographics
    totalPopulation: { code: 'B01003_001E', label: 'Total Population', category: 'population' },
    medianAge: { code: 'B01002_001E', label: 'Median Age', category: 'demographics' },

    // 2. Economics & Income
    medianIncome: { code: 'B19013_001E', label: 'Median Household Income (Past 12 Months)', category: 'economics' },

    // 3. Housing & Costs
    medianHomeValue: { code: 'B25077_001E', label: 'Median Home Value (Owner-Occupied)', category: 'housing' },
    medianGrossRent: { code: 'B25064_001E', label: 'Median Gross Rent (Monthly)', category: 'housing' },
    medianYearBuilt: { code: 'B25035_001E', label: 'Median Year Structure Built', category: 'housing' },

    // 4. Housing Tenure
    tenureTotal: { code: 'B25003_001E', label: 'Total Occupied Housing Units', category: 'tenure' },
    ownerOccupied: { code: 'B25003_002E', label: 'Owner-Occupied Units', category: 'tenure' },
    renterOccupied: { code: 'B25003_003E', label: 'Renter-Occupied Units', category: 'tenure' },

    // 5. Race & Ethnicity (Mutually exclusive Non-Hispanic + Hispanic of any race)
    raceTotal: { code: 'B03002_001E', label: 'Total Population (Race Table)', category: 'race' },
    whiteNH: { code: 'B03002_003E', label: 'White Alone (Non-Hispanic)', category: 'race' },
    blackNH: { code: 'B03002_004E', label: 'Black or African American Alone (Non-Hispanic)', category: 'race' },
    nativeNH: { code: 'B03002_005E', label: 'American Indian & Alaska Native Alone (Non-Hispanic)', category: 'race' },
    asianNH: { code: 'B03002_006E', label: 'Asian Alone (Non-Hispanic)', category: 'race' },
    pacificNH: { code: 'B03002_007E', label: 'Native Hawaiian & Other Pacific Islander Alone (Non-Hispanic)', category: 'race' },
    otherNH: { code: 'B03002_008E', label: 'Some Other Race Alone (Non-Hispanic)', category: 'race' },
    multiNH: { code: 'B03002_009E', label: 'Two or More Races (Non-Hispanic)', category: 'race' },
    hispanic: { code: 'B03002_012E', label: 'Hispanic or Latino (Any Race)', category: 'race' },

    // 6. Educational Attainment (Population Age 25+)
    eduTotal25Plus: { code: 'B15003_001E', label: 'Total Population 25 Years and Over', category: 'education' },
    eduRegularHS: { code: 'B15003_017E', label: 'Regular High School Diploma', category: 'education' },
    eduGED: { code: 'B15003_018E', label: 'GED or Alternative Credential', category: 'education' },
    eduSomeCollegeLess1Yr: { code: 'B15003_019E', label: 'Some College, Less Than 1 Year', category: 'education' },
    eduSomeCollege1PlusYr: { code: 'B15003_020E', label: 'Some College, 1 or More Years, No Degree', category: 'education' },
    eduAssociate: { code: 'B15003_021E', label: "Associate's Degree", category: 'education' },
    eduBachelor: { code: 'B15003_022E', label: "Bachelor's Degree", category: 'education' },
    eduMaster: { code: 'B15003_023E', label: "Master's Degree", category: 'education' },
    eduProfessional: { code: 'B15003_024E', label: 'Professional School Degree (MD, JD, etc.)', category: 'education' },
    eduDoctorate: { code: 'B15003_025E', label: 'Doctorate Degree (PhD, EdD, etc.)', category: 'education' },

    // 7. Commute & Means of Transportation to Work (Workers 16+)
    commuteTotal: { code: 'B08301_001E', label: 'Total Workers 16 Years and Over', category: 'commute' },
    commuteDriveAlone: { code: 'B08301_003E', label: 'Car, Truck, or Van - Drove Alone', category: 'commute' },
    commuteCarpool: { code: 'B08301_004E', label: 'Car, Truck, or Van - Carpooled', category: 'commute' },
    commuteTransit: { code: 'B08301_010E', label: 'Public Transportation (Excl. Taxicab)', category: 'commute' },
    commuteBicycle: { code: 'B08301_018E', label: 'Bicycle', category: 'commute' },
    commuteWalk: { code: 'B08301_019E', label: 'Walked', category: 'commute' },
    commuteWFH: { code: 'B08301_021E', label: 'Worked From Home', category: 'commute' },

    // 8. Commute Travel Time & Non-Remote Workers
    travelTimeAggregate: { code: 'B08013_001E', label: 'Aggregate Travel Time to Work (Minutes)', category: 'commute_time' },
    commutersCount: { code: 'B08012_001E', label: 'Workers Who Did Not Work From Home', category: 'commute_time' },
  },

  // Array of all 37 Census Variable Code Strings
  CENSUS_VARIABLE_CODES: [
    'B01003_001E', 'B01002_001E', 'B19013_001E', 'B25077_001E', 'B25064_001E', 'B25035_001E',
    'B25003_001E', 'B25003_002E', 'B25003_003E',
    'B03002_001E', 'B03002_003E', 'B03002_004E', 'B03002_005E', 'B03002_006E', 'B03002_007E', 'B03002_008E', 'B03002_009E', 'B03002_012E',
    'B15003_001E', 'B15003_017E', 'B15003_018E', 'B15003_019E', 'B15003_020E', 'B15003_021E', 'B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E',
    'B08301_001E', 'B08301_003E', 'B08301_004E', 'B08301_010E', 'B08301_018E', 'B08301_019E', 'B08301_021E',
    'B08013_001E', 'B08012_001E',
  ],

  // Census Sentinel Values indicating data suppression or non-applicability
  SENTINEL_VALUES: [-666666666, -888888888, -999999999, -222222222, -333333333, -555555555],

  // EPA Air Quality Index (AQI) Categories & Colors
  AQI_THRESHOLDS: [
    { min: 0, max: 50, category: 'Good', color: '#10B981', lightBg: '#ECFDF5', darkBg: '#064E3B', description: 'Air quality is satisfactory and poses little or no risk.' },
    { min: 51, max: 100, category: 'Moderate', color: '#F59E0B', lightBg: '#FFFBEB', darkBg: '#78350F', description: 'Air quality is acceptable; very sensitive individuals may experience minor symptoms.' },
    { min: 101, max: 150, category: 'Unhealthy for Sensitive Groups', color: '#F97316', lightBg: '#FFF7ED', darkBg: '#7C2D12', description: 'Members of sensitive groups may experience health effects. General public is less likely to be affected.' },
    { min: 151, max: 200, category: 'Unhealthy', color: '#EF4444', lightBg: '#FEF2F2', darkBg: '#7F1D1D', description: 'Everyone may begin to experience health effects; sensitive groups may experience more serious effects.' },
    { min: 201, max: 300, category: 'Very Unhealthy', color: '#8B5CF6', lightBg: '#F5F3FF', darkBg: '#4C1D95', description: 'Health alert: risk of more serious health effects for everyone.' },
    { min: 301, max: 500, category: 'Hazardous', color: '#881337', lightBg: '#FFF1F2', darkBg: '#4C0519', description: 'Health warning of emergency conditions: everyone is more likely to be affected.' },
  ],

  // Housing Affordability Ratio (Price-to-Income)
  AFFORDABILITY_THRESHOLDS: {
    AFFORDABLE: { max: 3.0, rating: 'Affordable', color: '#10B981', label: 'Affordable (≤ 3.0x)' },
    MODERATE: { min: 3.0, max: 5.0, rating: 'Moderate', color: '#F59E0B', label: 'Moderate Burden (3.1 - 5.0x)' },
    UNAFFORDABLE: { min: 5.0, rating: 'Unaffordable', color: '#EF4444', label: 'Severe Burden (> 5.0x)' },
  },

  // Gross Rent-to-Income Burden Rate (%)
  RENT_BURDEN_THRESHOLDS: {
    AFFORDABLE: { max: 30.0, rating: 'Affordable', color: '#10B981', label: 'Affordable (≤ 30%)' },
    BURDENED: { min: 30.0, max: 50.0, rating: 'Rent Burdened', color: '#F59E0B', label: 'Cost Burdened (30.1 - 50%)' },
    SEVERELY_BURDENED: { min: 50.0, rating: 'Severely Rent Burdened', color: '#EF4444', label: 'Severely Burdened (> 50%)' },
  },

  // Resolution Hierarchy
  RESOLUTIONS: {
    TRACT: { key: 'tract', name: 'Census Tract', icon: '📍', badge: '📍 Census Tract (Hyperlocal)' },
    ZCTA: { key: 'zcta', name: 'ZIP Code Tabulation Area', icon: '📮', badge: '📮 ZIP Code (ZCTA)' },
    COUNTY: { key: 'county', name: 'County Level', icon: '🏛️', badge: '🏛️ County Level' },
    BENCHMARK: { key: 'benchmark', name: 'State/National Benchmark', icon: '⚡', badge: '⚡ Benchmark Estimate' },
  },
};

export const {
  API,
  USER_AGENT,
  VINTAGES,
  DEFAULT_VINTAGE,
  PRESETS,
  CENSUS_VARIABLES,
  CENSUS_VARIABLE_CODES,
  SENTINEL_VALUES,
  AQI_THRESHOLDS,
  AFFORDABILITY_THRESHOLDS,
  RENT_BURDEN_THRESHOLDS,
  RESOLUTIONS,
} = CONFIG;

export default CONFIG;

if (typeof window !== 'undefined') {
  window.LocalPulseConfig = CONFIG;
  window.CONFIG = CONFIG;
}
