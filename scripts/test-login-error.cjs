const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const frontendPort = 5186;
const backendPort = 8146;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendUrl = `http://127.0.0.1:${backendPort}`;

const failures = [];
let loginAttempts = 0;

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': frontendUrl,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cronos-Runtime-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
  });
}

function startBackend() {
  const server = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': frontendUrl,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cronos-Runtime-Token',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      response.end();
      return;
    }

    if (request.url === '/health') {
      sendJson(response, 200, { status: 'ok', readiness: 'ready' });
      return;
    }
    if (request.url === '/setup/status') {
      sendJson(response, 200, { configured: true, owner: { id: 1, name: 'Validacao CRONOS' } });
      return;
    }
    if (request.url === '/auth/login' && request.method === 'POST') {
      await readBody(request);
      loginAttempts += 1;
      if (loginAttempts < 3) {
        const delay = loginAttempts === 2 ? 250 : 0;
        setTimeout(() => sendJson(response, 401, {
          detail: 'Senha ou PIN invalido.',
          code: 'CRONOS_ERROR',
          message: 'Senha ou PIN invalido.',
          details: {},
          request_id: null,
        }), delay);
        return;
      }
      sendJson(response, 200, {
        token: 'test-token',
        owner: { id: 1, name: 'Validacao CRONOS' },
        expires_at: new Date(Date.now() + 60000).toISOString(),
      });
      return;
    }
    if (request.url === '/chat/history') {
      sendJson(response, 200, []);
      return;
    }
    if (request.url === '/documents') {
      sendJson(response, 200, []);
      return;
    }
    if (request.url.startsWith('/memories?')) {
      sendJson(response, 200, { items: [], total: 0 });
      return;
    }
    if (request.url === '/library/index/status') {
      sendJson(response, 200, {
        chunks: 0,
        embeddings: 0,
        pending: 0,
        mode: 'lexical',
        provider_loaded: false,
        semantic_available: false,
        provider: { provider: 'lexical-only', available: false, loaded: false },
      });
      return;
    }
    if (request.url === '/diagnostics/hardware') {
      sendJson(response, 200, {
        cpu_percent: 12,
        ram_used_gb: 4,
        ram_total_gb: 16,
        gpu_percent: 0,
        vram_used_gb: 0,
        vram_total_gb: 0,
        storage_free_gb: 100,
      });
      return;
    }
    sendJson(response, 404, { detail: 'not found' });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(backendPort, '127.0.0.1', () => resolve(server));
  });
}

function startFrontend() {
  const command = `$env:VITE_CRONOS_API_URL='${backendUrl}'; npm run dev -- --host 127.0.0.1 --port ${frontendPort}`;
  const child = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
    cwd: 'frontend',
    env: process.env,
    stdio: 'ignore',
  });
  return child;
}

async function waitForUrl(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`${url} nao respondeu em tempo habil.`);
}

async function run() {
  const backend = await startBackend();
  const frontend = startFrontend();
  let browser;
  try {
    await waitForUrl(`${backendUrl}/health`);
    await waitForUrl(frontendUrl);

    browser = await chromium.launch({ channel: process.env.CRONOS_VISUAL_BROWSER_CHANNEL || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.addInitScript(() => {
      window.__cronosUnhandledRejections = [];
      window.addEventListener('unhandledrejection', (event) => {
        window.__cronosUnhandledRejections.push(String(event.reason?.message || event.reason || 'unknown'));
      });
    });

    await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('.auth-panel-v3').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByLabel('Senha principal').fill('senha-de-teste');
    await page.getByLabel('PIN').fill('1234');

    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('alert').waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.getByRole('alert').innerText() === 'Senha ou PIN invalido. Verifique os dados e tente novamente.', 'mensagem de 401 nao foi exibida');
    assert(await page.getByRole('button', { name: 'Entrar' }).isEnabled(), 'botao nao voltou a ser habilitado apos 401');
    assert(await page.locator('.app-shell').count() === 0, 'houve navegacao apos 401');
    assert((await page.evaluate(() => window.__cronosUnhandledRejections.length)) === 0, 'Promise rejeitada sem tratamento apos 401');

    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('button', { name: 'Entrando...' }).waitFor({ state: 'visible', timeout: 3000 });
    assert(await page.getByRole('button', { name: 'Entrando...' }).isDisabled(), 'botao nao ficou desabilitado durante nova tentativa');
    await page.getByRole('alert').waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.getByRole('alert').innerText() === 'Senha ou PIN invalido. Verifique os dados e tente novamente.', 'nova tentativa nao atualizou a mensagem de erro');

    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.locator('[data-visual="dashboard"]').waitFor({ state: 'visible', timeout: 10000 });
    assert(await page.locator('.auth-panel-v3').count() === 0, 'painel de login permaneceu apos sucesso');
    assert((await page.evaluate(() => window.__cronosUnhandledRejections.length)) === 0, 'Promise rejeitada sem tratamento apos sucesso');
    assert(loginAttempts === 3, `quantidade inesperada de tentativas: ${loginAttempts}`);

    if (failures.length) {
      throw new Error(failures.join('\n'));
    }
    console.log(JSON.stringify({ ok: true, loginAttempts }, null, 2));
  } finally {
    if (browser) await browser.close();
    frontend.kill();
    await new Promise((resolve) => backend.close(resolve));
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
