const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'data', 'project-backups');
const baseUrl = process.env.CRONOS_VISUAL_FRONTEND_URL || 'http://127.0.0.1:5174';
const backendUrl = process.env.CRONOS_VISUAL_BACKEND_URL || 'http://127.0.0.1:8123';
const password = process.env.CRONOS_VISUAL_TEST_PASSWORD;
const pin = process.env.CRONOS_VISUAL_TEST_PIN;

if (!password || !pin) {
  throw new Error('Defina CRONOS_VISUAL_TEST_PASSWORD e CRONOS_VISUAL_TEST_PIN para executar a validacao visual.');
}

const viewports = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1600', width: 1600, height: 900 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1280', width: 1280, height: 720 },
];

const coreStates = ['ready', 'thinking', 'speaking', 'warning', 'error', 'locked', 'offline'];

const routeChecks = [
  { route: '/dashboard', label: 'Dashboard', selector: '[data-visual="dashboard"]' },
  { route: '/chat', label: 'Conversas', selector: '[data-visual="chat"]' },
  { route: '/memory', label: 'Memoria', selector: '[data-visual="memory-page"]' },
  { route: '/library', label: 'Biblioteca', selector: '[data-visual="library-page"]' },
  { route: '/projects', label: 'Projetos', selector: '.module-base-page' },
  { route: '/learning', label: 'Aprendizado', selector: '.module-base-page' },
  { route: '/tools', label: 'Ferramentas', selector: '.module-base-page' },
  { route: '/system', label: 'Sistema', selector: '.module-base-page' },
  { route: '/settings', label: 'Configuracoes', selector: '.module-base-page' },
  { route: '/security', label: 'Seguranca', selector: '.module-base-page' },
];

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.CRONOS_VISUAL_BROWSER_CHANNEL || 'msedge', headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      console.log(`visual: viewport ${viewport.name}`);
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await login(page);
      if (viewport.name === '1920') await seedKnowledge(page);
      const routeResults = [];
      for (const check of routeChecks) {
        console.log(`visual: route ${check.label} ${viewport.name}`);
        await page.getByRole('button', { name: check.label, exact: true }).click();
        await page.locator(check.selector).waitFor({ state: 'visible', timeout: 10000 });
        await page.waitForTimeout(250);
        const chatValidation = check.route === '/chat' ? await validateChatWorkspace(page, viewport.name) : null;
        const screenshotPath = path.join(outputDir, `cronos-v030-${slug(check.label)}-${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        routeResults.push({
          route: check.route,
          label: check.label,
          screenshotPath,
          chatValidation,
          metrics: await collectMetrics(page),
        });
      }
      const compact = await validateCompactSidebar(page, viewport.name);
      const lock = viewport.name === '1920' ? await validateLock(page) : null;
      const coreStateResults = viewport.name === '1920' ? await captureCoreStates(page) : [];
      const performanceSummary = await collectDashboardPerformance(page);
      results.push({ viewport, routes: routeResults, compact, lock, coreStates: coreStateResults, performanceSummary });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(root, 'docs', 'diagnostics', 'v0.3.0-phase-3-chat-visual-test.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ ok: true, reportPath }, null, 2));
}

async function login(page) {
  console.log('visual: login');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Senha principal').fill(password);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-visual="dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
}

async function validateCompactSidebar(page, viewportName) {
  console.log(`visual: compact sidebar ${viewportName}`);
  await page.getByRole('button', { name: 'Compactar' }).click();
  await page.locator('.app-shell.compact').waitFor({ state: 'visible', timeout: 5000 });
  const screenshotPath = path.join(outputDir, `cronos-v030-sidebar-compact-${viewportName}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.getByRole('button', { name: 'Alternar menu' }).click();
  await page.locator('.app-shell:not(.compact)').waitFor({ state: 'visible', timeout: 5000 });
  return { ok: true, screenshotPath };
}

async function validateLock(page) {
  console.log('visual: lock');
  await page.getByRole('button', { name: 'Seguranca', exact: true }).click();
  await page.getByRole('button', { name: 'Bloquear agora' }).click();
  await page.locator('.auth-panel-v3').waitFor({ state: 'visible', timeout: 10000 });
  const screenshotPath = path.join(outputDir, 'cronos-v030-lock-1920.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.getByLabel('Senha principal').fill(password);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 10000 });
  return { ok: true, screenshotPath };
}

async function validateChatWorkspace(page, viewportName) {
  console.log(`visual: chat workspace ${viewportName}`);
  await page.locator('[data-visual="chat"]').waitFor({ state: 'visible', timeout: 10000 });
  const textarea = page.locator('.message-composer textarea');
  const before = await page.locator('.message-bubble-v3').count();
  await textarea.fill(`validacao visual chat fase 3 ${viewportName}`);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.waitForFunction((count) => document.querySelectorAll('.message-bubble-v3').length > count, before, { timeout: 10000 });
  await page.locator('.message-bubble-v3.owner .message-menu-trigger').last().click();
  const ownerMenu = await menuMetrics(page, '.message-bubble-v3.owner .message-action-menu');
  await page.keyboard.press('Escape');
  await page.locator('.message-bubble-v3.cronos .message-menu-trigger').last().click();
  const cronosMenu = await menuMetrics(page, '.message-bubble-v3.cronos .message-action-menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Criar nova conversa' }).click();
  await textarea.fill(`rascunho fase 3 ${viewportName}`);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Contexto' }).click();
  const contextVisibleAfterToggle = await page.locator('.chat-context-panel-v3').count();
  if (contextVisibleAfterToggle) {
    await page.getByRole('button', { name: 'Fechar painel contextual' }).click();
  }
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  return {
    ok: !horizontalOverflow && ownerMenu.insideViewport && cronosMenu.insideViewport,
    ownerMenu,
    cronosMenu,
    contextVisibleAfterToggle,
    horizontalOverflow,
    messageCount: await page.locator('.message-bubble-v3').count(),
  };
}

async function menuMetrics(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      insideViewport: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
      placement: element.classList.contains('menu-left') ? 'left' : 'right',
    };
  });
}

async function captureCoreStates(page) {
  const results = [];
  for (const state of coreStates) {
    console.log(`visual: core ${state}`);
    await page.evaluate((nextState) => {
      window.history.pushState({}, '', `/dashboard?visualCoreState=${nextState}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, state);
    await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator(`[data-core-state="${state}"]`).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);
    const screenshotPath = path.join(outputDir, `cronos-v030-core-${state}-1920.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    results.push({
      state,
      screenshotPath,
      label: await page.locator('.core-caption strong').first().textContent().catch(() => ''),
      description: await page.locator('.core-caption span').first().textContent().catch(() => ''),
    });
  }
  await page.evaluate(() => {
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.locator('[data-visual="dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
  return results;
}

async function collectDashboardPerformance(page) {
  console.log('visual: performance');
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Sistema', exact: true }).click();
  await page.locator('.module-base-page').waitFor({ state: 'visible', timeout: 10000 });
  const routeStart = Date.now();
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.locator('[data-visual="dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
  const routeSwitchMs = Date.now() - routeStart;
  const animated = await page.evaluate(() => {
    const core = document.querySelector('[data-visual="cronos-core"]');
    const route = document.querySelector('[data-visual="dashboard"]');
    const navigation = performance.getEntriesByType('navigation')[0];
    return {
      routeSwitchMs: null,
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      corePresent: Boolean(core),
      dashboardTextLength: route?.textContent?.length || 0,
      domNodes: document.querySelectorAll('*').length,
      heapUsed: performance.memory?.usedJSHeapSize || null,
    };
  });
  animated.routeSwitchMs = routeSwitchMs;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.locator('[data-visual="dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
  const reduced = await page.evaluate(() => ({
    corePresent: Boolean(document.querySelector('[data-visual="cronos-core"]')),
    domNodes: document.querySelectorAll('*').length,
    heapUsed: performance.memory?.usedJSHeapSize || null,
  }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return { animated, reducedMotion: reduced };
}

async function collectMetrics(page) {
  return page.evaluate(() => {
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
      shell: rect('.app-shell'),
      sidebar: rect('.app-sidebar'),
      topbar: rect('.app-topbar'),
      viewport: rect('.route-viewport'),
      statusbar: rect('.app-statusbar'),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      routeText: document.querySelector('.app-topbar h1')?.textContent || '',
    };
  });
}

async function seedKnowledge(page) {
  const token = await page.evaluate(() => localStorage.getItem('cronos.token') || '');
  if (!token) throw new Error('Token visual nao encontrado.');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const categories = await apiJson('/memory/categories', { headers });
  const categoryId = categories[0]?.id;
  if (!categoryId) throw new Error('Categorias de memoria nao carregadas.');
  const existingMemories = await apiJson('/memories?search=visual-fase-1-v030&include_deleted=true', { headers });
  if (!existingMemories.total) {
    await apiJson('/memories', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Preferencia visual-fase-1-v030',
        content: 'Alexandre prefere uma interface por telas reais com identidade futurista controlada.',
        category_id: categoryId,
        source_type: 'manual',
        confidence: 0.9,
        importance: 4,
        status: 'active',
      }),
    });
  }
  const pdf = buildTextPdf('cronos dashboard memoria biblioteca retrieval citacoes fase um');
  await page.evaluate(async ({ token, backendUrl, pdf }) => {
    const list = await fetch(`${backendUrl}/documents`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json());
    if (Array.isArray(list) && list.some((doc) => doc.filename === 'visual-fase-1-v030.pdf')) return;
    const file = new File([pdf], 'visual-fase-1-v030.pdf', { type: 'application/pdf' });
    const form = new FormData();
    form.append('file', file);
    await fetch(`${backendUrl}/documents/import`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  }, { token, backendUrl, pdf });
}

function buildTextPdf(text) {
  const safe = text.replace(/[()\\]/g, ' ');
  const stream = `BT\n/F1 12 Tf\n72 120 Td\n(${safe}) Tj\nET`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return body;
}

function slug(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function apiJson(pathname, options) {
  const response = await fetch(`${backendUrl}${pathname}`, options);
  if (!response.ok) {
    throw new Error(`${pathname} falhou: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
