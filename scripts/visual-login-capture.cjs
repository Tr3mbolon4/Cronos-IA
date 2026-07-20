const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'data', 'project-backups');
const baseUrl = process.env.CRONOS_VISUAL_FRONTEND_URL || 'http://127.0.0.1:5174';
const password = process.env.CRONOS_VISUAL_TEST_PASSWORD;
const pin = process.env.CRONOS_VISUAL_TEST_PIN;

if (!password || !pin) {
  throw new Error('Defina CRONOS_VISUAL_TEST_PASSWORD e CRONOS_VISUAL_TEST_PIN para executar a validacao visual.');
}

const viewports = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1600', width: 1600, height: 900 },
  { name: '1366', width: 1366, height: 768 },
];

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.CRONOS_VISUAL_BROWSER_CHANNEL || 'msedge', headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Senha principal').fill(password);
      await page.getByLabel('PIN').fill(pin);
      await page.getByRole('button', { name: 'Entrar' }).click();
      await page.locator('.home-composition').waitFor({ state: 'visible', timeout: 10000 });
      await page.locator('.home-composition .cronos-core.available').waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(750);
      const screenshotPath = path.join(outputDir, `cronos-layout-authenticated-${viewport.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const metrics = await page.evaluate(() => {
        const rect = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        };
        return {
          rail: rect('.left-rail'),
          topbar: rect('.window-bar'),
          core: rect('.cronos-core'),
          quickStrip: rect('.quick-strip'),
          lowerPanels: rect('.lower-panels'),
          dashboardVisible: Boolean(document.querySelector('.home-composition')),
          ownerVisible: document.body.innerText.includes('Alexandre'),
          status: document.querySelector('.status-bar')?.textContent?.replace(/\s+/g, ' ').trim(),
        };
      });
      let functional = null;
      if (viewport.name === '1920') {
        await page.getByRole('button', { name: 'Falar' }).click();
        await page.locator('.home-composition .cronos-core.listening').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByRole('button', { name: 'Ensinar' }).click();
        await page.locator('.home-composition .cronos-core.processing').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByRole('link', { name: 'Seguranca' }).click();
        await page.getByRole('button', { name: 'Bloquear' }).click();
        await page.locator('.auth-panel').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByLabel('Senha principal').fill(password);
        await page.getByLabel('PIN').fill(pin);
        await page.getByRole('button', { name: 'Entrar' }).click();
        await page.locator('.home-composition').waitFor({ state: 'visible', timeout: 10000 });
        functional = {
          menuNavigation: true,
          coreListeningState: true,
          coreProcessingState: true,
          lockSession: true,
          loginAgain: true,
        };
      }
      results.push({ viewport, screenshotPath, metrics, functional });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(root, 'docs', 'diagnostics', 'authenticated-layout-visual-test.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ ok: true, reportPath, screenshots: results.map((result) => result.screenshotPath) }, null, 2));
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
