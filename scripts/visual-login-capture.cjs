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
      if (viewport.name === '1920') {
        await seedKnowledge(page);
      }
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
        await page.getByRole('button', { name: 'Seguranca' }).click();
        await page.getByRole('button', { name: 'Bloquear' }).click();
        await page.locator('.auth-panel').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByLabel('Senha principal').fill(password);
        await page.getByLabel('PIN').fill(pin);
        await page.getByRole('button', { name: 'Entrar' }).click();
        await page.locator('.home-composition').waitFor({ state: 'visible', timeout: 10000 });
        await seedKnowledge(page);
        await page.getByRole('button', { name: 'Memoria', exact: true }).click();
        await page.locator('[data-visual="memory-page"]').waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('.memory-page .memory-card').first().waitFor({ state: 'visible', timeout: 10000 });
        const memoryPath = path.join(outputDir, 'cronos-memory-page-1920.png');
        await page.screenshot({ path: memoryPath, fullPage: false });
        await page.locator('.memory-page .memory-card .card-main').first().click();
        await page.locator('[data-visual="memory-details"] .details-stack h2').waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('[data-visual="memory-revisions"] .revision-row').first().waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('[data-visual="memory-relations"] .relation-row').first().waitFor({ state: 'visible', timeout: 10000 });
        const memoryDetailsPath = path.join(outputDir, 'cronos-memory-details-1920.png');
        await page.screenshot({ path: memoryDetailsPath, fullPage: false });
        await page.getByRole('button', { name: 'Nova memoria' }).click();
        await page.locator('.workspace-form').waitFor({ state: 'visible', timeout: 5000 });
        const memoryFormPath = path.join(outputDir, 'cronos-memory-form-1920.png');
        await page.screenshot({ path: memoryFormPath, fullPage: false });
        await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
        await page.locator('[data-visual="library-page"]').waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('.library-page .document-card').first().waitFor({ state: 'visible', timeout: 10000 });
        const libraryPath = path.join(outputDir, 'cronos-library-page-1920.png');
        await page.screenshot({ path: libraryPath, fullPage: false });
        await page.locator('.document-card .card-main').first().click();
        await page.locator('[data-visual="document-details"]').waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('[data-visual="retrieval-search"]').getByLabel('Pesquisa na biblioteca').fill('cronos memoria');
        await page.locator('[data-visual="retrieval-search"]').getByRole('button', { name: /Buscar/ }).click();
        await page.locator('[data-visual="citations"]').waitFor({ state: 'visible', timeout: 10000 });
        const retrievalPath = path.join(outputDir, 'cronos-retrieval-citations-1920.png');
        await page.screenshot({ path: retrievalPath, fullPage: false });
        functional = {
          menuNavigation: true,
          coreListeningState: true,
          coreProcessingState: true,
          lockSession: true,
          loginAgain: true,
          memoryPage: true,
          libraryPage: true,
          retrievalCitations: true,
          extraScreenshots: [memoryPath, memoryDetailsPath, memoryFormPath, libraryPath, retrievalPath],
        };
      } else {
        await page.getByRole('button', { name: 'Memoria', exact: true }).click();
        await page.locator('[data-visual="memory-page"]').waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('.memory-page .memory-card, .memory-page .empty-state').first().waitFor({ state: 'visible', timeout: 10000 });
        await page.screenshot({ path: path.join(outputDir, `cronos-memory-page-${viewport.name}.png`), fullPage: false });
        await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
        await page.locator('[data-visual="library-page"]').waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('.library-page .document-card, .library-page .empty-state').first().waitFor({ state: 'visible', timeout: 10000 });
        await page.screenshot({ path: path.join(outputDir, `cronos-library-page-${viewport.name}.png`), fullPage: false });
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

async function seedKnowledge(page) {
  const token = await page.evaluate(() => localStorage.getItem('cronos.token') || '');
  if (!token) throw new Error('Token visual nao encontrado.');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const categories = await apiJson('/memory/categories', { headers });
  const categoryId = categories[0]?.id;
  if (!categoryId) throw new Error('Categorias de memoria nao carregadas.');
  let existingMemories = await apiJson('/memories?search=visual-fase-5&include_deleted=true', { headers });
  if (!existingMemories.total) {
    await apiJson('/memories', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Preferencia visual-fase-5',
        content: 'Alexandre prefere uma interface escura, objetiva e com citacoes claras.',
        category_id: categoryId,
        source_type: 'manual',
        confidence: 0.9,
        importance: 4,
        status: 'active',
      }),
    });
    await apiJson('/memories', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Procedimento visual-fase-5',
        content: 'A biblioteca deve preservar documentos e permitir busca hibrida.',
        category_id: categoryId,
        source_type: 'manual',
        confidence: 0.8,
        importance: 3,
        status: 'pending_review',
      }),
    });
  }
  existingMemories = await apiJson('/memories?search=visual-fase-5&include_deleted=true', { headers });
  const [sourceMemory, targetMemory] = existingMemories.items || [];
  if (sourceMemory) {
    await apiJson(`/memories/${sourceMemory.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        content: `${sourceMemory.content} Revisao registrada para validacao visual da Fase 5.`,
        change_reason: 'validacao visual fase 5',
      }),
    });
  }
  if (sourceMemory && targetMemory) {
    await apiJson('/memory-relations', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_memory_id: sourceMemory.id,
        target_memory_id: targetMemory.id,
        relation_type: 'related_to',
        strength: 0.8,
        description: 'Relacao criada para validar a tela de detalhes da memoria.',
      }),
    }).catch((error) => {
      if (!String(error.message).includes('409')) throw error;
    });
  }
  const pdf = buildTextPdf('cronos memoria biblioteca retrieval citacoes');
  await page.evaluate(async ({ token, backendUrl, pdf }) => {
    const list = await fetch(`${backendUrl}/documents`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json());
    if (Array.isArray(list) && list.some((doc) => doc.filename === 'visual-fase-5.pdf')) return;
    const file = new File([pdf], 'visual-fase-5.pdf', { type: 'application/pdf' });
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
