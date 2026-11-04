// Componentes de interface compartilhados pelos dois apps (Gestão e Usuário)
import { esc, money, int } from './fmt.js';
import { VERSAO } from '../versao.js';
import { SEGMENTO } from '../segmento.js';

export const ROOT = new URL('../../../', import.meta.url).href;
export const asset = (p) => (/^(data:|blob:|https?:)/.test(p || '') ? p : ROOT + (p || ''));  // fotos gravadas no próprio registro vêm como data:

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  store: '<path d="M4 9h16l-1-5H5zM5 9v11h14V9M9 20v-6h6v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  wine: '<path d="M8 3h8l-.5 6a3.5 3.5 0 0 1-7 0zM12 12.5V20M8.5 20.5h7"/>',
  bottle: '<path d="M10 2h4v4.5c0 1 2.5 2 2.5 5V21a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-9.5c0-3 2.5-4 2.5-5z"/><path d="M7.5 13h9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  alert: '<path d="M12 3 2 20h20zM12 10v4M12 17.5v.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  arrowL: '<path d="M15 5 8 12l7 7"/>',
  arrowR: '<path d="m9 5 7 7-7 7"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8a4 4 0 0 1-2.1-2.1l.8-1-1-2z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.8-.7-.7-2.8z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  file: '<path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6"/>',
  building: '<path d="M4 21V5l8-3v19M12 8h8v13M8 8v.5M8 12v.5M8 16v.5M16 12v.5M16 16v.5M2 21h20"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.5M4 12h.5M4 18h.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
export const icon = (n, cls = '') => `<svg class="${cls}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// ---------- Rotas por hash ----------
export function router(routes, render) {
  const go = () => {
    const hash = location.hash.slice(1) || '/';
    for (const [pattern, view] of routes) {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
      const m = hash.split('?')[0].match(re);
      if (m) {
        const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        params.query = Object.fromEntries(new URLSearchParams(hash.split('?')[1] || ''));
        return render(view, params, pattern);
      }
    }
    location.hash = routes[0][0];
  };
  window.addEventListener('hashchange', go);
  return go;
}

// ---------- Eventos por delegação: data-act="nome" ----------
export function delegate(root, handlers) {
  for (const type of ['click', 'input', 'change', 'submit']) {
    root.addEventListener(type, (e) => {
      const el = e.target.closest(`[data-${type === 'click' ? 'act' : 'on' + type}]`);
      if (!el || !root.contains(el)) return;
      const name = el.dataset[type === 'click' ? 'act' : 'on' + type];
      const fn = handlers[name];
      if (fn) { if (type === 'submit' || el.tagName === 'A') e.preventDefault(); fn(el, e); }
    });
  }
}

// ---------- Modal e toast ----------
let modalEl = null;
export function modal({ title, body, foot = '', wide = false, onMount, handlers = {} }) {
  closeModal();
  modalEl = document.createElement('div');
  modalEl.className = 'overlay';
  modalEl.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="mh"><h2>${title}</h2><button class="iconbtn" data-act="close" aria-label="Fechar">${icon('x')}</button></div>
    <div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
  delegate(modalEl, { close: closeModal, ...handlers });
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';
  onMount?.(modalEl);
  return modalEl;
}
export function closeModal() { modalEl?.remove(); modalEl = null; document.body.style.overflow = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

export function confirmar(texto, { ok = 'Confirmar', titulo = 'Confirmar' } = {}) {
  return new Promise((res) => {
    modal({ title: titulo, body: `<p>${texto}</p>`,
      foot: `<button class="btn ghost" data-act="no">Cancelar</button><button class="btn" data-act="yes">${ok}</button>`,
      handlers: { yes: () => { closeModal(); res(true); }, no: () => { closeModal(); res(false); } } });
  });
}

let toastT;
// erro: { erro: true } fica 4 s na tela e um aviso comum logo depois (ex.: "Salvo" de uma tela que não conferiu
// se a gravação passou) não cobre o erro.
let erroAte = 0;
export function toast(msg, { erro = false } = {}) {
  if (!erro && Date.now() < erroAte) return;
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (erro ? ' erro' : ''); t.textContent = msg;
  document.body.appendChild(t);
  if (erro) erroAte = Date.now() + 1500;
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), erro ? 4000 : 2800);
}

// ---------- Peças de interface ----------
export const kpi = (label, valor, detalhe = '', extra = '') => `<div class="card kpi ${extra}"><div class="label">${label}</div><div class="v">${valor}</div>${detalhe ? `<div class="d">${detalhe}</div>` : ''}</div>`;

export const badge = (txt, tone = '') => `<span class="badge ${tone}">${esc(txt)}</span>`;

export const empty = (txt, ic = 'inbox') => `<div class="empty">${icon(ic)}<div>${txt}</div></div>`;

export const stepper = (name, value, { min = 0, max = 999 } = {}) =>
  `<span class="stepper"><button type="button" data-act="step" data-d="-1" aria-label="Menos">−</button><input type="number" inputmode="numeric" data-onchange="qty" name="${name}" value="${value}" min="${min}" max="${max}"><button type="button" data-act="step" data-d="1" aria-label="Mais">+</button></span>`;

// Campos de valor em reais com máscara (digita só números: 1234 → 12,34)
export const fmtMoneyInput = (v) => (Math.round((+v || 0) * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const parseMoney = (str) => { const d = String(str ?? '').replace(/\D/g, ''); return d ? +d / 100 : 0; };
// Inteiro com ponto de milhar enquanto digita (km, hodômetro…): <input data-int>
export const fmtInt = (v) => (v === '' || v == null || isNaN(+v) ? '' : Math.round(+v).toLocaleString('pt-BR'));
export const parseInt0 = (str) => { const d = String(str ?? '').replace(/\D/g, ''); return d ? +d : null; };
export const intInput = (name, value, extra = '') => `<input class="input num" name="${name}" inputmode="numeric" autocomplete="off" data-int value="${fmtInt(value)}" ${extra}>`;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches?.('input[data-int]')) return;
  const fim = el.value.length - (el.selectionEnd ?? el.value.length);
  el.value = fmtInt(parseInt0(el.value));
  try { const pos = Math.max(0, el.value.length - fim); el.setSelectionRange(pos, pos); } catch {}
});
export const moneyInput = (name, value, { width = 130, extra = '' } = {}) =>
  `<span class="money-in" style="width:${typeof width === 'number' ? width + 'px' : width}"><span>R$</span><input class="input num" name="${name}" inputmode="numeric" autocomplete="off" data-money value="${fmtMoneyInput(value)}" ${extra}></span>`;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches?.('input[data-money]')) return;
  el.value = fmtMoneyInput(parseMoney(el.value));
  try { el.setSelectionRange(el.value.length, el.value.length); } catch {}
});
document.addEventListener('focusin', (e) => { if (e.target.matches?.('input[data-money]')) setTimeout(() => { try { e.target.setSelectionRange(e.target.value.length, e.target.value.length); } catch {} }, 0); });

export function stepHandler(el) {
  const inp = el.parentElement.querySelector('input');
  const v = Math.max(+inp.min || 0, Math.min(inp.max === '' ? 999 : +inp.max, (+inp.value || 0) + +el.dataset.d));
  inp.value = v;
  inp.dispatchEvent(new Event('change', { bubbles: true }));
}

export const insightCard = (i) => `<a class="ins ${i.nivel}" href="${i.link || '#'}" data-busca="${esc(i.titulo + ' ' + i.texto)}"><span class="ic">${icon(i.icone)}</span><span class="grow"><div class="t">${esc(i.titulo)}</div><div class="s">${esc(i.texto)}</div></span>${i.valor ? `<span class="num small" style="font-weight:600">${money(i.valor)}</span>` : ''}</a>`;

// Busca digitada: esconde elementos [data-busca] que não contêm o termo (sem acento/maiúscula)
export const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function filtrarBusca(root, termo) {
  const t = normalizar(termo).trim();
  root.querySelectorAll('[data-busca]').forEach((el) => el.classList.toggle('hide', !!t && !normalizar(el.dataset.busca).includes(t)));
}
export const buscaInput = (valor = '', ph = 'Buscar…') => `<label class="search busca">${icon('search')}<input class="input" type="search" placeholder="${ph}" data-oninput="busca" value="${esc(valor)}" autocomplete="off"></label>`;

export const iniciais = (n) => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();

export function waLink(numero, texto) {
  const n = String(numero || '').replace(/\D/g, '');
  const dest = !n ? '' : n.length <= 11 ? '55' + n : n; // sem número: o WhatsApp pede para escolher o contato
  return `https://wa.me/${dest}?text=${encodeURIComponent(texto)}`;
}

export function download(nome, conteudo, tipo = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toCSV(rows) {
  return '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
}

// Instalação como app (Android/desktop) + dica para iPhone
let deferredPrompt = window.EA_INSTALAR || null;   // o aviso pode ter chegado antes (src/js/core/entrada.js)
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.querySelectorAll('[data-act="install"]').forEach((b) => b.classList.remove('hide')); });
// Android: o link tocado no WhatsApp (e em outros apps) abre numa janela do Chrome "de dentro" do app, que não deixa
// instalar (e às vezes diz "já está instalado" sem estar). Sem o aviso de instalação, o botão leva a página para o
// Chrome de verdade (intent://), com ?instalar=1: lá o app já mostra "Instalar agora".
const android = /android/i.test(navigator.userAgent);
const VEIO_INSTALAR = new URLSearchParams(location.search).has('instalar');
function abrirNoChrome() {
  const u = new URL(location.href); u.searchParams.set('instalar', '1');
  location.href = `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
}
export function instalar() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice?.then((r) => { if (r?.outcome === 'accepted') toast('Instalando… o ícone aparece na tela inicial'); }); deferredPrompt = null; return; }
  if (android && !VEIO_INSTALAR && !instalado()) return abrirNoChrome();
  instrucoes();
}
// chegou pelo botão Instalar (já no Chrome): oferece "Instalar agora" assim que o Chrome permitir (até 5 s)
if (VEIO_INSTALAR) {
  const u = new URL(location.href); u.searchParams.delete('instalar'); history.replaceState(null, '', u.pathname + u.search + u.hash);
  const ini = Date.now();
  const tentar = () => {
    if (instalado()) return;
    if (deferredPrompt) return modal({ title: `Instalar o ${esc(SEGMENTO.nome)}`, body: '<p class="small">Toque abaixo para colocar o app na tela inicial do celular.</p>',
      foot: '<button class="btn block" data-act="ok">Instalar agora</button>', handlers: { ok: () => { closeModal(); instalar(); } } });
    if (Date.now() - ini < 5000) return setTimeout(tentar, 400);
    instrucoes();
  };
  setTimeout(tentar, 1200);
}
function instrucoes() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  modal({ title: 'Instalar no celular', body: `
    <div class="col small">
      <div class="ajuste-box"><b>Abriu o link pelo WhatsApp, Instagram ou e-mail?</b> Esses apps abrem uma janela própria que <b>não permite instalar</b> (aparece “Não foi possível abrir o aplicativo”). Primeiro abra no navegador:
        ${ios ? 'toque em <b>⋯</b> ou no ícone da bússola › <b>Abrir no Safari</b>.' : 'toque no menu <b>⋮</b> › <b>Abrir no Chrome</b>.'}</div>
      ${ios ? `<div><b>iPhone (Safari):</b> toque em <b>Compartilhar</b> <span class="muted">(quadrado com seta)</span> › <b>Adicionar à Tela de Início</b> › Adicionar.</div>`
        : `<div><b>Android (Chrome):</b> menu <b>⋮</b> › <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b> › Instalar).</div>`}
      <div class="row gap-s"><button class="btn ghost sm" data-act="copiarLink">Copiar link</button><span class="tiny muted">Cole no Chrome/Safari se preferir.</span></div>
      ${ios ? '' : `<div class="muted"><b>O Chrome diz “Esse app já está instalado”, mas o ícone sumiu?</b> Tirar o ícone da tela inicial não desinstala. Abra <b>Configurações › Aplicativos › ${esc(SEGMENTO.nome)} › Desinstalar</b> e instale de novo por aqui.</div>`}
      <div class="muted">Instalado, o app abre em tela cheia, com ícone próprio, e funciona mesmo com internet instável.</div>
    </div>`, handlers: { copiarLink: () => { navigator.clipboard?.writeText(location.origin + location.pathname); toast('Link copiado'); } } });
}
export const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const ehCelular = () => matchMedia('(max-width: 900px)').matches && 'ontouchstart' in window;
// Faixa “Instale o app” (celular, fora do app instalado, até a pessoa dispensar)
// Dispensada, a faixa volta depois de 7 dias (aberto pelo link do WhatsApp, por exemplo, a pessoa ainda não instalou).
export function bannerInstalar() {
  let off = false; try { off = Date.now() < Number(localStorage.getItem(SEGMENTO.id + '-sem-banner-instalar-ate') || 0); } catch {}
  if (off || instalado() || !ehCelular()) return '';
  return `<div class="demo-banner">${icon('download')}<span class="grow">Instale o app na tela inicial para abrir mais rápido.</span><a href="#" data-act="install"><b>Instalar</b></a><a href="#" data-act="semBanner" aria-label="Dispensar">${icon('x')}</a></div>`;
}
export function dispensarBanner() { try { localStorage.setItem(SEGMENTO.id + '-sem-banner-instalar-ate', String(Date.now() + 7 * 86400000)); } catch {} }
// Na tela de entrar (quem abriu pelo link ainda nem entrou): botão de instalar, sem dispensar
export function cardInstalar() {
  if (instalado() || !ehCelular()) return '';
  return `<button type="button" class="btn ghost block" data-act="install" style="width:min(400px, 100%);color:#fff;border-color:rgba(255,255,255,.45);background:transparent">${icon('download')} Instalar o app no celular</button>`;
}

export function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register(ROOT + 'sw.js').catch(() => {});
  vigiarAtualizacoes();
}

// ---------- Atualização do app ----------
// Cada publicação gera um version.json novo. O app compara com a versão que está rodando ao abrir,
// ao voltar para a tela e a cada 5 minutos; se houver outra, mostra a barra com o botão Atualizar.
export const versaoApp = () => (VERSAO === 'dev' ? 'desenvolvimento' : VERSAO.slice(0, 7));
let versaoNova = null;
async function versaoPublicada() {
  const r = await fetch(ROOT + 'version.json?t=' + Date.now(), { cache: 'no-store' });
  return r.ok ? (await r.json()).v : null;
}
export async function verificarAtualizacao(avisarSeIgual = false) {
  if (VERSAO === 'dev' || location.protocol === 'file:') { if (avisarSeIgual) toast('Versão de desenvolvimento'); return false; }
  try {
    const v = await versaoPublicada();
    if (v && v !== VERSAO) { versaoNova = v; barraAtualizar(); return true; }
    if (avisarSeIgual) toast('Você já está na versão mais nova');
  } catch { if (avisarSeIgual) toast('Sem conexão para verificar'); }
  return false;
}
function barraAtualizar() {
  if (document.getElementById('ea-atualizar')) return;
  const el = document.createElement('div');
  el.id = 'ea-atualizar';
  el.className = 'atualizar-bar';
  el.innerHTML = `${icon('refresh')}<span class="grow">Nova versão do app disponível</span><button class="btn sm">Atualizar</button>`;
  el.querySelector('button').addEventListener('click', atualizarApp);
  document.body.appendChild(el);
}
export async function atualizarApp() {
  const b = document.querySelector('#ea-atualizar button');
  if (b) { b.disabled = true; b.textContent = 'Atualizando…'; }
  try {
    const reg = await navigator.serviceWorker?.getRegistration(ROOT);
    await reg?.update();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  } catch {}
  location.reload();
}
function vigiarAtualizacoes() {
  if (VERSAO === 'dev') return;
  verificarAtualizacao();
  setInterval(verificarAtualizacao, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verificarAtualizacao(); });
}
