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
// Um app só por segmento (app/): o login decide se abre a Gestão ou o app do usuário (src/js/core/entrada.js).
// gestao/ e usuario/ continuam no ar como o mesmo app (são os endereços dos apps já instalados nos celulares).
// Ícone: as três barras nas cores do segmento (sem selo); app exclusivo com símbolo próprio (SEGMENTO.simbolo) usa o símbolo.
const produto = S.produto || S.nome.replace(/^easy\s*app\s*/i, '') || S.nome;
const rotulo = S.rotulo || (S.exclusivo ? produto : `EasyAPP ${produto}`);
const marca = { fundo: C.marcaFundo, a: C.marcaA, b: C.marcaB };
const apps = {
  app: { nome: S.nome, rotulo, descricao: S.slogan || S.gestao.descricao, ...marca },
  gestao: { ...S.gestao, rotulo, ...marca },
  ...(S.usuario ? { usuario: { ...S.usuario, rotulo, ...marca } } : {}),
};
const simbolo = S.simbolo && existsSync(new URL(S.simbolo, raiz)) ? `data:image/png;base64,${readFileSync(new URL(S.simbolo, raiz)).toString('base64')}` : null;

// "versão" dos ícones: muda quando mudam cores, nome ou ícone. Vai no endereço (…png?v=…) para o celular
// perceber que o ícone mudou e trocar o do app instalado (com o mesmo endereço ele guarda o antigo).
const V = createHash('sha1').update(JSON.stringify([C, S.nome, S.icone, S.logo, S.simbolo, S.gestao?.nome, S.usuario?.nome, rotulo, 'unico-1'])).digest('hex').slice(0, 8);
const comVersao = (html) => html.replace(/(assets\/icons\/[\w-]+\.png)(\?v=\w+)?/g, `$1?v=${V}`);
console.log(`Aplicando "${S.nome}"`);
// a página do app nasce da página da gestão (mantém as fontes e o que o segmento pôs no <head>)
if (!existsSync(new URL('app/', raiz))) mkdirSync(new URL('app/', raiz), { recursive: true });
const modelo = ler('gestao/index.html');
for (const [app, a] of Object.entries(apps)) {
  let html = app === 'gestao' || !existsSync(new URL(`${app}/index.html`, raiz)) ? modelo : ler(`${app}/index.html`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(a.nome)}</title>`)
    .replace(/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${C.escura}">`)
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, `<meta name="apple-mobile-web-app-title" content="${esc(a.rotulo)}">`)
    .replace(/<meta name="description" content="[^"]*">\n?/, '')
    .replace('<link rel="manifest"', `<meta name="description" content="${esc(a.descricao)}">\n<link rel="manifest"`)
    .replace(/assets\/icons\/(gestao|usuario|app)-(\d+)\.png/g, 'assets/icons/app-$2.png')
    .replace(/<script type="module" src="[^"]*"><\/script>/, '<script type="module" src="../src/js/core/entrada.js"></script>');
  html = comVersao(html);
  gravar(`${app}/index.html`, html);
  gravar(`${app}/manifest.webmanifest`, JSON.stringify({
    id: `${S.id}-${app}`, name: a.nome, short_name: a.rotulo, description: a.descricao, lang: 'pt-BR', start_url: './', scope: './',
    display: 'standalone', orientation: 'any', background_color: C.escura, theme_color: C.escura,
    icons: [
      { src: `../assets/icons/app-192.png?v=${V}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `../assets/icons/app-512.png?v=${V}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `../assets/icons/app-maskable-512.png?v=${V}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
<link rel="icon" href="assets/icons/app-192.png">
<link rel="apple-touch-icon" href="assets/icons/app-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="src/css/base.css"><link rel="stylesheet" href="src/css/segmento.css">
<style>
  .hub { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; padding: 32px 16px; background: radial-gradient(120% 80% at 50% 0%, var(--primaria), var(--primaria-escura) 70%); }
  .hub h1 { color: #fff; font-size: 34px; text-align: center; }
  .hub .tagline { color: var(--destaque-claro); text-align: center; margin-top: -14px; max-width: 520px; }
  .hub .cards { display: grid; grid-template-columns: minmax(0, 340px); gap: 16px; width: 100%; justify-content: center; }
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
  ${S.logo ? `<img src="${esc(S.logo)}" alt="${esc(S.nome)}" style="width:min(300px,70vw)">` : `<div style="display:flex;flex-direction:column;align-items:center;gap:14px"><img src="assets/icons/app-192.png" alt="" style="width:88px;height:88px;border-radius:22px;box-shadow:0 12px 34px rgba(0,0,0,.3)"><h1 style="font-weight:500">EasyAPP <span style="color:var(--destaque)">${esc(S.produto || S.nome.replace(/^easy\s*app\s*/i, ''))}</span></h1></div>`}
  <div class="tagline">${esc(S.slogan)}</div>
  <div class="cards">
    <a class="card" href="app/"><img src="assets/icons/app-192.png" alt=""><h2>${esc(S.nome)}</h2><div class="small ink2">${esc(S.usuario ? `Um app só: a gestão entra com e-mail e senha; ${S.usuario.papelPlural ? 'os ' + S.usuario.papelPlural.toLowerCase() : 'os usuários'} entram com código e PIN.` : S.gestao.descricao)}</div><span class="btn sm" style="align-self:flex-start">Abrir o app</span></a>
  </div>
  ${S.exclusivo ? '' : `<div class="foot">No iPhone: abra no Safari › Compartilhar › Adicionar à Tela de Início.<br><br>
    Quer conhecer antes? Demonstração com dados fictícios (fica só neste navegador):<br>
    <a href="app/?demo=1&entrar=gestao">${esc(S.gestao.curto)} demo</a>${S.usuario ? ` · <a href="app/?demo=1&entrar=usuario">${esc(S.usuario.curto)} demo</a>` : ''}</div>`}
</div>
${S.exclusivo ? "<script>location.replace('app/' + location.search + location.hash);</script>" : ''}
<script>if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});</script>
</body>
</html>
`));

// ---------- Ícones ----------
// as três barras crescentes (iguais às do EasyAPP Financial), centradas; no maskable, menores (área segura).
// App exclusivo com símbolo próprio: o símbolo do cliente no lugar das barras.
const desenho = (a, tam, margem) => {
  const w = 17, gap = 9, alturas = [26, 44, 67], base = 83.5, x0 = 50 - (3 * w + 2 * gap) / 2;
  const barra = (i) => `<rect x="${x0 + i * (w + gap)}" y="${base - alturas[i]}" width="${w}" height="${alturas[i]}" rx="4.5" fill="${i === 2 ? a.b : a.a}"/>`;
  const miolo = simbolo ? `<image href="${simbolo}" x="20" y="20" width="60" height="60" preserveAspectRatio="xMidYMid meet"/>` : [0, 1, 2].map(barra).join('');
  const k = margem ? 0.74 : 1; // maskable: tudo dentro da área segura (o Android recorta em círculo)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 100 100"><rect width="100" height="100" rx="${margem ? 0 : 22}" fill="${a.fundo}"/>` +
    `<g transform="translate(50 50) scale(${k}) translate(-50 -50)">${miolo}</g></svg>`;
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
