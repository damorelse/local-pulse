import { spawn } from 'node:child_process';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function run() {
  console.log('================================================================');
  console.log('       LOCAL PULSE — END-TO-END BROWSER INTERACTIVITY SUITE');
  console.log('================================================================\n');

  const port = 9300 + Math.floor(Math.random() * 500);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-test-'));

  console.log(`1. Launching Headless Chrome on port ${port}...`);
  const chrome = spawn('google-chrome', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpDir}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-web-security',
    'about:blank'
  ]);

  let killed = false;
  const cleanup = () => {
    if (!killed) {
      killed = true;
      try {
        chrome.kill('SIGKILL');
      } catch (e) {}
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  // Connect to Chrome debugging port
  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await res.json();
      const page = list.find(p => p.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error(`Could not connect to Chrome debugging port on ${port}`);
    cleanup();
    process.exit(1);
  }

  console.log('2. Connected to Chrome CDP:', wsUrl);
  const ws = new WebSocket(wsUrl);

  let id = 1;
  const pending = new Map();
  const send = (method, params = {}) => {
    const msgId = id++;
    return new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  const consoleLogs = [];
  const uncaughtExceptions = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(msg.error);
      else p.resolve(msg.result);
    }

    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(a => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
      consoleLogs.push({ type: msg.params.type, text });
      console.log(`  [Console ${msg.params.type}] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const desc = msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text;
      uncaughtExceptions.push(desc);
      console.error(`  [Uncaught Exception] ${desc}`);
    }
  };

  await new Promise(r => ws.onopen = r);

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');

  console.log('3. Navigating to http://localhost:8080...');
  await send('Page.navigate', { url: 'http://localhost:8080' });

  // Wait for initial render and data fetch
  await new Promise(r => setTimeout(r, 3500));

  const evalInPage = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res.result?.value;
  };

  console.log('\n--- Test 1: Verifying Initial App Load ---');
  const appObjType = await evalInPage('typeof window.localPulseApp');
  assert.strictEqual(appObjType, 'object', 'window.localPulseApp must be initialized');

  const title = await evalInPage('document.title');
  console.log('  Page Title:', title);
  assert.ok(title.includes('Local Pulse'), 'Title must contain Local Pulse');

  const initialHero = await evalInPage('document.getElementById("hero-location-name")?.textContent');
  console.log('  Initial Hero Name:', initialHero);
  assert.ok(initialHero && (initialHero.includes('San Francisco') || initialHero.includes('Mission')), 'Initial location must be SF Mission');

  const chips = await evalInPage(`
    Array.from(document.querySelectorAll('#presets-chips-container .chip-btn')).map(b => ({
      name: b.dataset.name,
      active: b.classList.contains('active'),
      lat: b.dataset.lat,
      lng: b.dataset.lng
    }))
  `);
  console.log('  Preset Chips Count:', chips.length);
  assert.strictEqual(chips.length, 6, 'Must have 6 preset chips');
  assert.ok(chips[0].active, 'SF Mission should be initially active');
  console.log('  ✔ PASS: Initial App Load Verified');

  // Test All Presets
  const presetsToTest = [
    { name: 'Austin Downtown', expectedSubstrings: ['Austin', 'TX'] },
    { name: 'NYC Williamsburg', expectedSubstrings: ['Brooklyn', 'New York', 'Williamsburg', 'NY'] },
    { name: 'Seattle Capitol Hill', expectedSubstrings: ['Seattle', 'WA', 'Capitol Hill'] },
    { name: 'Chicago Loop', expectedSubstrings: ['Chicago', 'IL', 'Loop'] },
    { name: 'Miami South Beach', expectedSubstrings: ['Miami', 'Beach', 'FL'] },
    { name: 'SF Mission', expectedSubstrings: ['San Francisco', 'Mission', 'CA'] },
  ];

  for (const preset of presetsToTest) {
    console.log(`\n--- Test: Clicking Preset "${preset.name}" ---`);
    const clickSuccess = await evalInPage(`
      (() => {
        const btn = Array.from(document.querySelectorAll('#presets-chips-container .chip-btn'))
          .find(b => b.dataset.name === '${preset.name}');
        if (!btn) return false;
        btn.click();
        return true;
      })()
    `);
    assert.ok(clickSuccess, `Preset button "${preset.name}" should exist and be clicked`);

    // Wait for API resolution & DOM update
    await new Promise(r => setTimeout(r, 3000));

    const currentHero = await evalInPage('document.getElementById("hero-location-name")?.textContent');
    console.log(`  Hero location name: "${currentHero}"`);
    assert.ok(currentHero, `Hero name for "${preset.name}" must not be empty or null`);

    const hasExpected = preset.expectedSubstrings.some(s => currentHero.toLowerCase().includes(s.toLowerCase()));
    assert.ok(hasExpected, `Hero name "${currentHero}" should contain one of ${JSON.stringify(preset.expectedSubstrings)}`);

    const activeChip = await evalInPage(`
      document.querySelector('#presets-chips-container .chip-btn.active')?.dataset.name
    `);
    assert.strictEqual(activeChip, preset.name, `Active chip must be "${preset.name}"`);

    // Verify metrics card is rendered
    const cardHousingLoading = await evalInPage(`
      document.getElementById('card-housing')?.classList.contains('is-loading')
    `);
    assert.strictEqual(cardHousingLoading, false, 'Housing card must not be stuck in loading state');

    console.log(`  ✔ PASS: Preset "${preset.name}" loaded successfully`);
  }

  // Test Rapid Successive Preset Clicking (AbortController Race Condition Stress Test)
  console.log('\n--- Test: Rapid Successive Preset Clicking ---');
  await evalInPage(`
    (() => {
      const chips = document.querySelectorAll('#presets-chips-container .chip-btn');
      if (chips.length >= 3) {
        chips[1].click(); // Austin
        chips[5].click(); // Miami
        chips[2].click(); // NYC
        chips[1].click(); // Austin
      }
    })()
  `);
  // Wait for all in-flight requests to settle
  await new Promise(r => setTimeout(r, 3500));
  const finalHeroName = await evalInPage('document.getElementById("hero-location-name")?.textContent');
  console.log('  Rapid Click Final Location:', finalHeroName);
  assert.ok(finalHeroName && finalHeroName.toLowerCase().includes('austin'), 'Final location after rapid click must be Austin');
  const isStillLoading = await evalInPage('document.getElementById("card-housing")?.classList.contains("is-loading")');
  assert.strictEqual(isStillLoading, false, 'Dashboard must not be stuck in loading state after rapid clicking');
  console.log('  ✔ PASS: Rapid Successive Preset Clicking Verified');

  // Test Survey Vintage Switcher (2022 -> 2020 -> 2015)
  console.log('\n--- Test: Survey Vintage Switcher ---');
  const v2020Clicked = await evalInPage(`
    (() => {
      const btn = document.querySelector('#vintage-selector .vintage-btn[data-vintage="2020"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()
  `);
  assert.ok(v2020Clicked, '2020 vintage button should exist and be clicked');
  await new Promise(r => setTimeout(r, 1000));
  const activeVintage = await evalInPage('document.querySelector("#vintage-selector .vintage-btn.active")?.dataset.vintage');
  assert.strictEqual(activeVintage, '2020', 'Active vintage should be 2020');
  console.log('  ✔ PASS: Vintage Switcher Verified');

  // Test Theme Toggle
  console.log('\n--- Test: Theme Toggle (Dark <-> Light) ---');
  const initialThemeDark = await evalInPage('document.documentElement.classList.contains("dark")');
  console.log('  Initial Dark Mode:', initialThemeDark);

  await evalInPage('document.getElementById("btn-theme-toggle")?.click()');
  const switchedThemeDark = await evalInPage('document.documentElement.classList.contains("dark")');
  console.log('  After Toggle Dark Mode:', switchedThemeDark);
  assert.notStrictEqual(initialThemeDark, switchedThemeDark, 'Theme must switch state on toggle');

  await evalInPage('document.getElementById("btn-theme-toggle")?.click()');
  const restoredThemeDark = await evalInPage('document.documentElement.classList.contains("dark")');
  console.log('  Restored Dark Mode:', restoredThemeDark);
  assert.strictEqual(initialThemeDark, restoredThemeDark, 'Theme must restore state on second toggle');
  console.log('  ✔ PASS: Theme Toggle Verified');

  // Test Saved Places Drawer
  console.log('\n--- Test: Saved Places Drawer Open / Close ---');
  await evalInPage('document.getElementById("btn-saved-places")?.click()');
  const isDrawerOpen = await evalInPage('document.getElementById("drawer-saved-places")?.classList.contains("open")');
  assert.strictEqual(isDrawerOpen, true, 'Drawer should be open');

  await evalInPage('document.getElementById("btn-close-drawer")?.click()');
  const isDrawerClosed = await evalInPage('document.getElementById("drawer-saved-places")?.classList.contains("open")');
  assert.strictEqual(isDrawerClosed, false, 'Drawer should be closed');
  console.log('  ✔ PASS: Drawer Open/Close Verified');

  // Test Fullscreen Map Modal
  console.log('\n--- Test: Fullscreen Map Open / Close ---');
  await evalInPage('document.getElementById("btn-expand-map")?.click()');
  const isMapOpen = await evalInPage('document.getElementById("modal-map-fullscreen")?.classList.contains("open")');
  assert.strictEqual(isMapOpen, true, 'Fullscreen map should be open');

  await evalInPage('document.getElementById("btn-close-fullscreen-map")?.click()');
  const isMapClosed = await evalInPage('document.getElementById("modal-map-fullscreen")?.classList.contains("open")');
  assert.strictEqual(isMapClosed, false, 'Fullscreen map should be closed');
  console.log('  ✔ PASS: Fullscreen Map Verified');

  // Check Exceptions
  console.log('\n--- Final Browser Exception Check ---');
  console.log('Total Uncaught Exceptions:', uncaughtExceptions.length);
  assert.strictEqual(uncaughtExceptions.length, 0, `Uncaught exceptions detected: ${JSON.stringify(uncaughtExceptions)}`);

  console.log('\n================================================================');
  console.log('✔ ALL BROWSER E2E INTERACTIVITY TESTS PASSED SUCCESSFULLY (100%)');
  console.log('================================================================\n');

  ws.close();
  cleanup();
  process.exit(0);
}

run().catch(err => {
  console.error('Browser Test Suite Failed:', err);
  process.exit(1);
});
