/**
 * Local Pulse Micro Test Runner & Hermetic Test Framework
 * Zero external dependencies — runs in pure Node.js (ESM).
 */

import assert from 'node:assert';

// ANSI Color Helpers
export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

// Global Test Registry State
class TestSuiteRegistry {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.options = {
      live: false,
      tierFilter: null, // Set of allowed tiers or null for all
      bail: false,
      verbose: true,
    };
    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      startTime: 0,
      endTime: 0,
    };
    this.parseCLIArgs();
  }

  parseCLIArgs() {
    const args = process.argv.slice(2);
    for (const arg of args) {
      if (arg === '--live') {
        this.options.live = true;
      } else if (arg === '--mock') {
        this.options.live = false;
      } else if (arg.startsWith('--tier=')) {
        const tiers = arg.slice(7).split(',').map(t => parseInt(t.trim(), 10)).filter(Boolean);
        this.options.tierFilter = new Set(tiers);
      } else if (arg === '--bail') {
        this.options.bail = true;
      } else if (arg === '--silent') {
        this.options.verbose = false;
      }
    }
  }

  addSuite(name, tier = 1) {
    const suite = {
      name,
      tier,
      tests: [],
    };
    this.suites.push(suite);
    this.currentSuite = suite;
    return suite;
  }

  addTest(name, fn) {
    if (!this.currentSuite) {
      this.addSuite('Default Suite', 1);
    }
    this.currentSuite.tests.push({
      name,
      fn,
      tier: this.currentSuite.tier,
    });
  }
}

export const registry = new TestSuiteRegistry();

/**
 * Define a test suite group
 * @param {string} name - Suite name
 * @param {Function} fn - Suite body
 * @param {number} [tier=1] - Tier level (1-4)
 */
export function describe(name, fn, tier = 1) {
  const previousSuite = registry.currentSuite;
  registry.addSuite(name, tier);
  fn();
  registry.currentSuite = previousSuite;
}

/**
 * Define an individual test case
 * @param {string} name - Test case description
 * @param {Function} fn - Async or sync test function
 */
export function it(name, fn) {
  registry.addTest(name, fn);
}

/**
 * Expectation Matcher Engine
 */
export function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} (${typeof expected}) but got ${JSON.stringify(actual)} (${typeof actual})`);
      }
    },

    toEqual(expected) {
      try {
        assert.deepStrictEqual(actual, expected);
      } catch {
        throw new Error(`Deep equality failure:\nExpected: ${JSON.stringify(expected, null, 2)}\nReceived: ${JSON.stringify(actual, null, 2)}`);
      }
    },

    toBeCloseTo(expected, precision = 2) {
      if (typeof actual !== 'number' || typeof expected !== 'number') {
        throw new Error(`toBeCloseTo requires numbers. Received: actual=${actual} (${typeof actual}), expected=${expected} (${typeof expected})`);
      }
      const tolerance = Math.pow(10, -precision) / 2;
      const diff = Math.abs(actual - expected);
      if (diff > tolerance) {
        throw new Error(`Expected ${actual} to be close to ${expected} (precision ${precision}, tolerance ${tolerance}), difference was ${diff}`);
      }
    },

    toBeGreaterThan(min) {
      if (actual <= min) {
        throw new Error(`Expected ${actual} > ${min}`);
      }
    },

    toBeGreaterThanOrEqual(min) {
      if (actual < min) {
        throw new Error(`Expected ${actual} >= ${min}`);
      }
    },

    toBeLessThan(max) {
      if (actual >= max) {
        throw new Error(`Expected ${actual} < ${max}`);
      }
    },

    toBeLessThanOrEqual(max) {
      if (actual > max) {
        throw new Error(`Expected ${actual} <= ${max}`);
      }
    },

    toMatch(regex) {
      const reg = typeof regex === 'string' ? new RegExp(regex) : regex;
      if (!reg.test(String(actual))) {
        throw new Error(`Expected "${actual}" to match pattern ${reg}`);
      }
    },

    toContain(item) {
      if (typeof actual === 'string' || Array.isArray(actual)) {
        if (!actual.includes(item)) {
          throw new Error(`Expected collection to contain ${JSON.stringify(item)}`);
        }
      } else if (actual && typeof actual === 'object') {
        if (!(item in actual)) {
          throw new Error(`Expected object to have key "${item}"`);
        }
      } else {
        throw new Error(`toContain received non-iterable: ${typeof actual}`);
      }
    },

    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, but received ${JSON.stringify(actual)}`);
      }
    },

    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, but received ${JSON.stringify(actual)}`);
      }
    },

    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, but received ${JSON.stringify(actual)}`);
      }
    },

    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected defined value, but received undefined`);
      }
    },

    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined, but received ${JSON.stringify(actual)}`);
      }
    },

    async toRejectWith(errorPattern) {
      if (typeof actual !== 'function') {
        throw new Error('toRejectWith expects an async function or Promise returning function');
      }
      let threw = false;
      let errorThrown = null;
      try {
        await actual();
      } catch (err) {
        threw = true;
        errorThrown = err;
      }
      if (!threw) {
        throw new Error('Expected function to reject/throw an error, but it resolved successfully');
      }
      if (errorPattern) {
        const message = errorThrown?.message || String(errorThrown);
        if (errorPattern instanceof RegExp) {
          if (!errorPattern.test(message)) {
            throw new Error(`Expected error message matching ${errorPattern}, got: "${message}"`);
          }
        } else if (typeof errorPattern === 'string') {
          if (!message.includes(errorPattern)) {
            throw new Error(`Expected error message containing "${errorPattern}", got: "${message}"`);
          }
        }
      }
    },
  };
}

/**
 * Creates a hermetic mock Fetch function
 * @param {Map|Array<[string|RegExp, Function|object]>} routes 
 * @returns {Function} mocked fetch function
 */
export function createMockFetch(routes) {
  const routeEntries = Array.isArray(routes) ? routes : (routes instanceof Map ? Array.from(routes.entries()) : Object.entries(routes));

  return async function mockFetch(url, options = {}) {
    const urlStr = typeof url === 'string' ? url : (url?.url || url?.toString() || '');
    
    for (const [pattern, responseHandler] of routeEntries) {
      let isMatch = false;
      if (typeof pattern === 'string') {
        isMatch = urlStr.includes(pattern);
      } else if (pattern instanceof RegExp) {
        isMatch = pattern.test(urlStr);
      } else if (typeof pattern === 'function') {
        isMatch = pattern(urlStr, options);
      }

      if (isMatch) {
        let result;
        if (typeof responseHandler === 'function') {
          result = await responseHandler(urlStr, options);
        } else {
          result = responseHandler;
        }

        // If result is already a Response-like object
        if (result && typeof result.json === 'function') {
          return result;
        }

        let status = 200;
        let body = result;
        let headersMap = { 'content-type': 'application/json' };

        if (result && typeof result === 'object') {
          if (typeof result.status === 'number') {
            status = result.status;
            body = result.body !== undefined ? result.body : result;
          } else if (typeof result.httpStatus === 'number') {
            status = result.httpStatus;
            body = result.body !== undefined ? result.body : result;
          }
          if (result.headers && typeof result.headers === 'object') {
            headersMap = { ...headersMap, ...result.headers };
          }
        }

        const statusText = status >= 200 && status < 300 ? 'OK' : 'Error';
        const headers = new Map(Object.entries(headersMap));

        return {
          ok: status >= 200 && status < 300,
          status,
          statusText,
          headers: {
            get: (h) => headers.get(h.toLowerCase()) || null,
            has: (h) => headers.has(h.toLowerCase()),
          },
          async json() {
            if (typeof body === 'string') {
              return JSON.parse(body);
            }
            return body;
          },
          async text() {
            if (typeof body === 'string') {
              return body;
            }
            return JSON.stringify(body);
          },
        };
      }
    }

    // Default 404 for unhandled mock routes
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => null, has: () => false },
      async json() { return { error: `[MockFetch] No route matched for ${urlStr}` }; },
      async text() { return `[MockFetch] No route matched for ${urlStr}`; },
    };
  };
}

/**
 * Creates an in-memory LocalStorage mock
 */
export function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    get length() {
      return store.size;
    },
    _raw() {
      return Object.fromEntries(store.entries());
    }
  };
}

/**
 * Creates an in-memory Geolocation mock
 */
export function createMockGeolocation(coords = { latitude: 37.7749, longitude: -122.4194, accuracy: 10 }) {
  let shouldFail = false;
  let failureError = { code: 1, message: 'User denied Geolocation' };

  return {
    getCurrentPosition(success, error, _options) {
      if (shouldFail) {
        if (error) error(failureError);
      } else {
        if (success) {
          success({
            coords: {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: coords.accuracy || 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          });
        }
      }
    },
    watchPosition(success, error, options) {
      this.getCurrentPosition(success, error, options);
      return 1;
    },
    clearWatch(_id) {},
    _setCoords(newCoords) {
      coords = { ...coords, ...newCoords };
    },
    _setFail(fail, err) {
      shouldFail = fail;
      if (err) failureError = err;
    },
  };
}

/**
 * Creates an in-memory navigator.share mock
 */
export function createMockShare() {
  const shareCalls = [];
  let shouldFail = false;

  const shareFn = async function (data) {
    if (shouldFail) {
      throw new Error('Share API failed or user cancelled');
    }
    shareCalls.push({ data, timestamp: Date.now() });
    return true;
  };

  shareFn.calls = shareCalls;
  shareFn.clear = () => { shareCalls.length = 0; };
  shareFn.setFail = (fail) => { shouldFail = fail; };

  return shareFn;
}

/**
 * Runs the entire test suite and reports ANSI results
 */
export async function runTests() {
  registry.stats.startTime = Date.now();
  const { suites, options, stats } = registry;

  console.log(`\n${colors.bold}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}              LOCAL PULSE 4-TIER TEST SUITE RUNNER${colors.reset}`);
  console.log(`${colors.dim}Mode: ${options.live ? colors.yellow + 'LIVE NETWORK' : colors.green + 'HERMETIC MOCK'} | Node: ${process.version} | Platform: ${process.platform}${colors.reset}`);
  if (options.tierFilter) {
    console.log(`${colors.dim}Filtering Tiers: [${Array.from(options.tierFilter).join(', ')}]${colors.reset}`);
  }
  console.log(`${colors.bold}${colors.cyan}================================================================================${colors.reset}\n`);

  for (const suite of suites) {
    // Check tier filter
    if (options.tierFilter && !options.tierFilter.has(suite.tier)) {
      stats.skipped += suite.tests.length;
      continue;
    }

    const tierLabel = `[Tier ${suite.tier}]`;
    console.log(`${colors.bold}${colors.blue}${tierLabel} ${suite.name}${colors.reset}`);

    for (const test of suite.tests) {
      stats.total++;
      const testStart = Date.now();

      try {
        await test.fn();
        const duration = Date.now() - testStart;
        stats.passed++;
        console.log(`  ${colors.green}✔ PASS${colors.reset} ${colors.gray}${test.name}${colors.reset} ${colors.dim}(${duration}ms)${colors.reset}`);
      } catch (err) {
        const duration = Date.now() - testStart;
        stats.failed++;
        console.log(`  ${colors.red}✖ FAIL${colors.reset} ${colors.bold}${test.name}${colors.reset} ${colors.dim}(${duration}ms)${colors.reset}`);
        console.log(`    ${colors.red}Error: ${err.message || err}${colors.reset}`);
        if (err.stack && options.verbose) {
          const stackLines = err.stack.split('\n').slice(1, 4).map(l => `    ${colors.dim}${l.trim()}${colors.reset}`).join('\n');
          console.log(stackLines);
        }

        if (options.bail) {
          console.log(`\n${colors.red}${colors.bold}[BAIL] Execution aborted on first failure.${colors.reset}`);
          break;
        }
      }
    }
    console.log(''); // Blank line between suites

    if (options.bail && stats.failed > 0) {
      break;
    }
  }

  stats.endTime = Date.now();
  const totalDuration = ((stats.endTime - stats.startTime) / 1000).toFixed(2);

  console.log(`${colors.bold}${colors.cyan}--------------------------------------------------------------------------------${colors.reset}`);
  console.log(`${colors.bold}SUMMARY STATISTICS:${colors.reset}`);
  console.log(`  Total Tests:   ${colors.bold}${stats.total}${colors.reset}`);
  console.log(`  Passed:        ${colors.green}${colors.bold}${stats.passed}${colors.reset}`);
  console.log(`  Failed:        ${stats.failed > 0 ? colors.red + colors.bold + stats.failed : '0'}${colors.reset}`);
  console.log(`  Skipped:       ${stats.skipped > 0 ? colors.yellow + stats.skipped : '0'}${colors.reset}`);
  console.log(`  Duration:      ${totalDuration}s`);
  console.log(`${colors.bold}${colors.cyan}================================================================================${colors.reset}\n`);

  if (stats.failed > 0) {
    console.log(`${colors.red}${colors.bold}✖ TEST SUITE FAILED (${stats.failed} failed assertions)${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}✔ ALL ${stats.passed} TEST CASES PASSED SUCCESSFULLY${colors.reset}\n`);
    process.exit(0);
  }
}
