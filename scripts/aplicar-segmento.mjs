// Aplica a identidade do segmento (src/js/segmento.js + src/css/segmento.css) em tudo o que é gerado:
// títulos das páginas, manifests (instalação no celular), página inicial e ícones dos dois apps.
// Uso: node scripts/aplicar-segmento.mjs        (rode de novo sempre que mudar nome, cores ou ícone)
// Os ícones são desenhados com o Chromium do Playwright; sem ele, o resto é gerado e os ícones ficam como estão.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SEGMENTO as S } from '../src/js/segmento.js';

const raiz = new URL('../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');
const gravar = (p, t) => { writeFileSync(new URL(p, raiz), t); console.log('  ✓', p); };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const css = ler('src/css/segmento.css');
const cor = (v, padrao) => css.match(new RegExp(`--${v}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1] || padrao;
const C = { escura: cor('primaria-escura', '#12314D'), primaria: cor('primaria', '#1F4E79'), destaque: cor('destaque', '#F2A541'), fundo: cor('fundo', '#F5F7FA') };
// marca da família: as três barras (cores em segmento.css: --marca-fundo, --marca-a, --marca-b)
C.marcaFundo = cor('marca-fundo', C.escura); C.marcaA = cor('marca-a', '#FFFFFF'); C.marcaB = cor('marca-b', C.destaque);
// Gestão: quadrado escuro da marca; app de campo: quadrado na cor primária (as mesmas barras)
// Os dois apps têm o mesmo nome embaixo do ícone ("EasyAPP <produto>") e o mesmo ícone;
// o de gestão leva um selo "G" no canto para não confundir com o app de campo.
const produto = S.produto || S.nome.replace(/^easy\s*app\s*/i, '') || S.nome;
const rotulo = S.rotulo || `EasyAPP ${produto}`;
const apps = { gestao: { ...S.gestao, rotulo, selo: true, fundo: C.marcaFundo, a: C.marcaA, b: C.marcaB }, ...(S.usuario ? { usuario: { ...S.usuario, rotulo, fundo: C.marcaFundo, a: C.marcaA, b: C.marcaB } } : {}) };

// "versão" dos ícones: muda quando mudam cores, nome ou ícone. Vai no endereço (…png?v=…) para o celular
// perceber que o ícone mudou e trocar o do app instalado (com o mesmo endereço ele guarda o antigo).
const V = createHash('sha1').update(JSON.stringify([C, S.nome, S.icone, S.logo, S.gestao?.nome, S.usuario?.nome, rotulo, 'selo-g-1'])).digest('hex').slice(0, 8);
const comVersao = (html) => html.replace(/(assets\/icons\/[\w-]+\.png)(\?v=\w+)?/g, `$1?v=${V}`);
console.log(`Aplicando "${S.nome}"`);
for (const [app, a] of Object.entries(apps)) {
  let html = ler(`${app}/index.html`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(a.nome)}</title>`)
    .replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${C.escura}">`)
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, `<meta name="apple-mobile-web-app-title" content="${esc(a.rotulo)}">`)
    .replace(/<meta name="description" content="[^"]*">\n?/, '')
    .replace('<link rel="manifest"', `<meta name="description" content="${esc(a.descricao)}">\n<link rel="manifest"`);
  html = comVersao(html);
  gravar(`${app}/index.html`, html);
  gravar(`${app}/manifest.webmanifest`, JSON.stringify({
    id: `${S.id}-${app}`, name: a.nome, short_name: a.rotulo, description: a.descricao, lang: 'pt-BR', start_url: './', scope: './',
    display: 'standalone', orientation: 'any', background_color: C.escura, theme_color: C.escura,
    icons: [
      { src: `../assets/icons/${app}-192.png?v=${V}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `../assets/icons/${app}-512.png?v=${V}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `../assets/icons/${app}-maskable-512.png?v=${V}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2) + '\n');
}

gravar('index.html', comVersao(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(S.nome)}</title>
<meta name="description" content="${esc(S.slogan)}">
<meta name="theme-color" content="${C.escura}">
<link rel="icon" href="assets/icons/gestao-192.png">
<link rel="apple-touch-icon" href="assets/icons/gestao-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="src/css/base.css"><link rel="stylesheet" href="src/css/segmento.css">
<style>
  .hub { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; padding: 32px 16px; background: radial-gradient(120% 80% at 50% 0%, var(--primaria), var(--primaria-escura) 70%); }
  .hub h1 { color: #fff; font-size: 34px; text-align: center; }
  .hub .tagline { color: var(--destaque-claro); text-align: center; margin-top: -14px; max-width: 520px; }
  .hub .cards { display: grid; grid-template-columns: repeat(${S.usuario ? 2 : 1}, minmax(0, 300px)); gap: 16px; width: 100%; justify-content: center; }
  .hub a.card { display: flex; flex-direction: column; gap: 10px; color: var(--ink); transition: transform .15s; }
  .hub a.card:hover { transform: translateY(-3px); }
  .hub a.card img { width: 56px; height: 56px; border-radius: 14px; }
  .hub .foot { color: var(--destaque-claro); font-size: 12px; text-align: center; opacity: .85; }
  .hub .foot a { color: #fff; }
  @media (max-width: 640px) { .hub .cards { grid-template-columns: minmax(0, 1fr); } }
</style>
</head>
<body>
<div class="hub">
  ${S.logo ? `<img src="${esc(S.logo)}" alt="${esc(S.nome)}" style="width:min(300px,70vw)">` : `<div style="display:flex;flex-direction:column;align-items:center;gap:14px"><img src="assets/icons/gestao-192.png" alt="" style="width:88px;height:88px;border-radius:22px;box-shadow:0 12px 34px rgba(0,0,0,.3)"><h1 style="font-weight:500">EasyAPP <span style="color:var(--destaque)">${esc(S.produto || S.nome.replace(/^easy\s*app\s*/i, ''))}</span></h1></div>`}
  <div class="tagline">${esc(S.slogan)}</div>
  <div class="cards">
    <a class="card" href="gestao/"><img src="assets/icons/gestao-192.png" alt=""><h2>${esc(S.gestao.nome)}</h2><div class="small ink2">${esc(S.gestao.descricao)}</div><span class="btn sm" style="align-self:flex-start">Abrir</span></a>
    ${S.usuario ? `<a class="card" href="usuario/"><img src="assets/icons/usuario-192.png" alt=""><h2>${esc(S.usuario.nome)}</h2><div class="small ink2">${esc(S.usuario.descricao)}</div><span class="btn sm gold" style="align-self:flex-start">Abrir</span></a>` : ''}
  </div>
  <div class="foot">No iPhone: abra no Safari › Compartilhar › Adicionar à Tela de Início.<br><br>
    Quer conhecer antes? Demonstração com dados fictícios (fica só neste navegador):<br>
    <a href="gestao/?demo=1">${esc(S.gestao.curto)} demo</a>${S.usuario ? ` · <a href="usuario/?demo=1">${esc(S.usuario.curto)} demo</a>` : ''}</div>
</div>
<script>if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});</script>
</body>
</html>
`));

// ---------- Ícones ----------
// as três barras crescentes (iguais às do EasyAPP Financial), centradas; no maskable, menores (área segura)
const desenho = (a, tam, margem) => {
  // as três barras; com selo, um pouco menores e para a esquerda, e o selo "G" (gestão) no canto inferior direito
  const s = a.selo ? 0.86 : 1, dx = a.selo ? -5 : 0, dy = a.selo ? -4 : 0;
  const w = 17 * s, gap = 9 * s, alturas = [26, 44, 67].map((h) => h * s), base = 50 + 33.5 * s + dy, x0 = 50 - (3 * w + 2 * gap) / 2 + dx;
  const barra = (i) => `<rect x="${x0 + i * (w + gap)}" y="${base - alturas[i]}" width="${w}" height="${alturas[i]}" rx="${4.5 * s}" fill="${i === 2 ? a.b : a.a}"/>`;
  const selo = a.selo ? `<circle cx="76" cy="76" r="17" fill="${a.fundo}"/><circle cx="76" cy="76" r="13" fill="#FFFFFF"/>` +
    `<text x="76" y="81.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="15" fill="${a.fundo}">G</text>` : '';
  const k = margem ? 0.74 : 1; // maskable: tudo dentro da área segura (o Android recorta em círculo)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 100 100"><rect width="100" height="100" rx="${margem ? 0 : 22}" fill="${a.fundo}"/>` +
    `<g transform="translate(50 50) scale(${k}) translate(-50 -50)">${[0, 1, 2].map(barra).join('')}${selo}</g></svg>`;
};
mkdirSync(new URL('assets/icons/', raiz), { recursive: true });
let pw;
try { pw = await import('playwright'); } catch { try { const { createRequire } = await import('node:module'); pw = createRequire(import.meta.url)('playwright'); } catch { pw = null; } }
if (!pw) { console.log('  (Playwright indisponível: ícones não gerados)'); process.exit(0); }
const browser = await pw.chromium.launch(existsSync('/opt/pw-browsers/chromium') ? {} : {});
const page = await browser.newPage();
for (const [app, a] of Object.entries(apps)) {
  for (const [nome, tam, margem] of [[`${app}-192`, 192], [`${app}-512`, 512], [`${app}-180`, 180], [`${app}-maskable-512`, 512, true]]) {
    await page.setViewportSize({ width: tam, height: tam });
    await page.setContent(`<html><body style="margin:0;background:transparent">${desenho(a, tam, margem)}</body></html>`);
    writeFileSync(new URL(`assets/icons/${nome}.png`, raiz), await page.screenshot({ omitBackground: !margem, clip: { x: 0, y: 0, width: tam, height: tam } }));
    console.log('  ✓', `assets/icons/${nome}.png`);
  }
}
await browser.close();
