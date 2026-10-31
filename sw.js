/*
 * Guia Clinico — recursos offline (GitHub Pages /app/)
 * Coloque este arquivo na raiz do repositorio, junto ao index.html.
 * Para atualizar o conjunto de arquivos em aparelhos instalados, altere VERSION.
 */
'use strict';

const VERSION = '2026-10-31-01';
const PREFIX = 'guia-clinico-offline-';
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const CONTENT_CACHE = `${PREFIX}content-${VERSION}`;
const EXTERNAL_CACHE = `${PREFIX}external-${VERSION}`;
const BASE = new URL('./', self.location.href);
const BASE_PATH = BASE.pathname; // /app/ no GitHub Pages
const absolute = path => new URL(path, BASE).href;

// Paginas e arquivos pequenos: serao preparados durante a instalacao.
const SHELL_FILES = [
  '', 'index.html', 'dentistica.html', 'periodontia.html',
  'endodontia.html', 'cirurgia.html', 'prescricoes.html', 'leitor.html',
  'style.css', 'app.js', 'manifest.webmanifest', 'favicon.svg',
  'icon-192.png', 'icon-512.png', 'logoufc.png',
  'components/header-component.js', 'components/footer-component.js',
  'banco_de_dados/dentistica.js',
  'banco_de_dados/periodontia.js',
  'banco_de_dados/endodontia.js',
  'banco_de_dados/cirurgia.js',
  'banco_de_dados/prescricoes.js',
  'banco_de_dados/protocolos_dentistica.js',
  'banco_de_dados/protocolos_endodontia.js',
  'banco_de_dados/protocolos_periodontia',
  'reabilitacao-oral/index.html',
  'reabilitacao-oral/dados.js',
  'reabilitacao-oral/aplicativo.js',
  'reabilitacao-oral/estilos.css'
];

// PDFs, capas e paginas ilustradas do modulo de Reabilitacao Oral.
// Esses recursos totalizam dezenas de MB. O navegador pode limitar o espaco.
const CONTENT_FILES = [
  'banco_de_dados/livros/manual.pdf',
  'capas/dentistica.png',
  'capas/periodontia.png',
  'capas/endodontia.png',
  'capas/cirurgia.png',
  'capas/manual.png',
  ...Array.from({ length: 107 }, (_, i) =>
    `reabilitacao-oral/assets/paginas/pagina-${String(i + 1).padStart(3, '0')}.webp`
  )
];

// Dependencias externas usadas na aparencia e no leitor.
// Google Drive (documentos), Google Forms e demais servicos nao sao copiados.
const EXTERNAL_FILES = [
  ['https://cdn.tailwindcss.com/', 'no-cors'],
  ['https://unpkg.com/lucide@latest', 'no-cors'],
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs', 'cors'],
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs', 'cors'],
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf_viewer.min.css', 'no-cors'],
  ['https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap', 'no-cors'],
  ['https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap', 'no-cors']
];

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'cdn.tailwindcss.com', 'unpkg.com', 'cdnjs.cloudflare.com',
  'fonts.googleapis.com', 'fonts.gstatic.com'
]);

async function cacheLocalFile(cache, path) {
  const url = absolute(path);
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok || response.type === 'opaque') return false;
    await cache.put(url, response);
    return true;
  } catch (error) {
    console.warn('[Guia Clinico Offline] Falha ao guardar:', path, error);
    return false;
  }
}

async function cacheExternalFile(cache, [url, mode]) {
  try {
    const request = new Request(url, { mode, credentials: 'omit' });
    const response = await fetch(request);
    if (!response.ok && response.type !== 'opaque') return false;
    await cache.put(request, response);
    return true;
  } catch (error) {
    console.warn('[Guia Clinico Offline] Dependencia externa nao armazenada:', url, error);
    return false;
  }
}

// Fila de downloads com concorrencia limitada para celulares.
async function runQueue(items, worker, maxParallel = 4) {
  let cursor = 0, succeeded = 0;
  const runners = Array.from({ length: Math.min(maxParallel, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (await worker(item)) succeeded++;
    }
  });
  await Promise.all(runners);
  return { succeeded, total: items.length };
}

async function sendStatus(info) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: 'GUIA_OFFLINE_STATUS', ...info });
  }
}

async function cacheLargeResources() {
  const externalCache = await caches.open(EXTERNAL_CACHE);
  const external = await runQueue(EXTERNAL_FILES, pair => cacheExternalFile(externalCache, pair), 3);
  const cache = await caches.open(CONTENT_CACHE);
  const content = await runQueue(CONTENT_FILES, path => cacheLocalFile(cache, path), 4);
  await sendStatus({ phase: 'ready', content, external });
  console.info('[Guia Clinico Offline] Recursos locais:', content.succeeded, '/', content.total);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // A pagina inicial e indispensavel para ativar a experiencia offline.
    if (!await cacheLocalFile(cache, 'index.html')) {
      throw new Error('Nao foi possivel armazenar index.html. Tente novamente com internet.');
    }
    const optional = SHELL_FILES.filter(path => path && path !== 'index.html');
    await runQueue(optional, path => cacheLocalFile(cache, path), 5);
    // A rota /app/ deve abrir mesmo sem conexao.
    const homepage = await cache.match(absolute('index.html'));
    await cache.put(absolute(''), homepage.clone());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => name.startsWith(PREFIX) && ![SHELL_CACHE, CONTENT_CACHE, EXTERNAL_CACHE].includes(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
    // Completa o cache com livros e imagens sem bloquear a instalacao inicial.
    await cacheLargeResources();
  })());
});

async function findCached(request, ignoreSearch = false) {
  const options = { ignoreSearch };
  return (await caches.open(SHELL_CACHE)).match(request, options) ||
    (await caches.open(CONTENT_CACHE)).match(request, options) ||
    (await caches.open(EXTERNAL_CACHE)).match(request, options);
}

// Quando o PDF.js solicita pedacos de um PDF, responde com HTTP 206 a partir
// da copia completa guardada no dispositivo.
async function rangeFromCachedPDF(cached, rangeHeader) {
  if (!cached || !rangeHeader) return cached;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return cached;
  const bytes = await cached.arrayBuffer();
  const size = bytes.byteLength;
  const suffix = match[1] === '';
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = suffix ? size - 1 : (match[2] ? Math.min(size - 1, Number(match[2])) : size - 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const partial = bytes.slice(start, end + 1);
  return new Response(partial, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(partial.byteLength),
      'Accept-Ranges': 'bytes'
    }
  });
}

async function cacheNetworkResponse(request, response, cacheName) {
  // Respostas 206 sao fragmentos e nao podem substituir um PDF inteiro no cache.
  if (response && response.status !== 206 && (response.ok || response.type === 'opaque')) {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn('[Guia Clinico Offline] Cache cheio ou indisponivel:', error);
    }
  }
  return response;
}

async function serveLocal(event, url) {
  const request = event.request;
  const navigation = request.mode === 'navigate' || request.destination === 'document';
  const isPDF = url.pathname.toLowerCase().endsWith('.pdf');
  const canonical = url.pathname === BASE_PATH ? absolute('index.html') : request;
  const cached = await findCached(canonical, true);

  if (isPDF && cached) {
    return rangeFromCachedPDF(cached, request.headers.get('range'));
  }

  // Paginas e scripts: atualiza o cache quando online, usa a copia offline.
  const preferNetwork = navigation || /\.(?:html?|js|css|webmanifest)$/.test(url.pathname);
  if (!preferNetwork && cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const category = isPDF || /\.(?:png|webp|jpe?g|svg)$/.test(url.pathname) ? CONTENT_CACHE : SHELL_CACHE;
      event.waitUntil(cacheNetworkResponse(request, response.clone(), category));
    }
    return response;
  } catch (_) {
    if (cached) return cached;
    if (navigation) {
      return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Guia Clinico - Offline</title><style>body{font:16px system-ui;background:#111827;color:#fff;min-height:80vh;display:grid;place-items:center;text-align:center;padding:20px}a{color:#67e8f9}</style><main><h1>Conteudo ainda nao disponivel offline</h1><p>Conecte-se a internet para salvar esta pagina.</p><a href="${BASE_PATH}index.html">Voltar ao Guia Clinico</a></main></html>`, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return Response.error();
  }
}

async function serveExternal(event) {
  const request = event.request;
  const cached = await (await caches.open(EXTERNAL_CACHE)).match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    event.waitUntil(cacheNetworkResponse(request, response.clone(), EXTERNAL_CACHE));
    return response;
  } catch (_) {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(BASE_PATH)) {
    event.respondWith(serveLocal(event, url));
  } else if (ALLOWED_EXTERNAL_HOSTS.has(url.hostname)) {
    event.respondWith(serveExternal(event));
  }
});

// Permite futuramente adicionar um botao "Baixar arquivos para uso offline".
self.addEventListener('message', event => {
  if (event.data?.type === 'GUIA_CACHE_AGAIN') {
    event.waitUntil(cacheLargeResources());
  }
});
