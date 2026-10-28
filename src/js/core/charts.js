// Gráficos SVG leves, sem dependências. Cada gráfico é desenhado na largura real do container
// (texto sempre legível no celular) e mostra tooltip ao passar o mouse ou tocar.
import { esc } from './fmt.js';

const specs = new Map();
let seq = 0;

export function chart(spec) {
  const id = 'c' + ++seq;
  specs.set(id, spec);
  return `<div class="chart" data-chart="${id}" style="height:${spec.height || 220}px" role="img" aria-label="${esc(spec.label || '')}"></div>`;
}

export function mountCharts(root = document) {
  root.querySelectorAll('[data-chart]').forEach((el) => {
    const spec = specs.get(el.dataset.chart);
    if (!spec) return;
    const w = el.clientWidth || 600;
    el.innerHTML = (spec.type === 'line' ? line : columns)(spec, w, spec.height || 220);
  });
}
let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => mountCharts(), 150); });
export function resetCharts() { specs.clear(); }

const niceMax = (v) => {
  if (v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
};

function frame(w, h, max, fmt, pad) {
  const ticks = 5;
  let g = '<g class="grid axis">';
  for (let i = 0; i <= ticks; i++) {
    const y = pad.t + (h - pad.t - pad.b) * (1 - i / ticks);
    if (i > 0) g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}"/>`;
    g += `<text x="${pad.l - 8}" y="${y + 4}" text-anchor="end">${esc(fmt((max * i) / ticks))}</text>`;
  }
  g += `<line class="base" x1="${pad.l}" x2="${w - pad.r}" y1="${h - pad.b}" y2="${h - pad.b}"/></g>`;
  return g;
}

function xLabels(labels, x, h, pad, every = 1) {
  return '<g class="axis">' + labels.map((l, i) => (i % every === 0 ? `<text x="${x(i)}" y="${h - pad.b + 17}" text-anchor="middle">${esc(l)}</text>` : '')).join('') + '</g>';
}

// Colunas verticais (uma série). data: [{label, value, tip?, color?}]
function columns(spec, w, h) {
  const { data, fmt = String, color = 'var(--bordo)' } = spec;
  const pad = { t: 12, r: 8, b: 26, l: spec.padL ?? 56 };
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const n = data.length || 1;
  const step = (w - pad.l - pad.r) / n;
  const bw = Math.max(4, Math.min(42, step * 0.62));
  const x = (i) => pad.l + step * i + step / 2;
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const every = Math.ceil(n / Math.max(1, Math.floor((w - pad.l) / 46)));
  let bars = '';
  data.forEach((d, i) => {
    const top = y(d.value), base = y(0), hh = Math.max(0, base - top), r = Math.min(4, hh, bw / 2);
    const x0 = x(i) - bw / 2;
    const path = hh > 0 ? `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${base}Z` : '';
    bars += `<g data-tip="${esc(d.tip || `<b>${d.label}</b><br>${fmt(d.value)}`)}"><rect class="hit" x="${pad.l + step * i}" y="${pad.t}" width="${step}" height="${h - pad.t - pad.b}"/><path class="bar" d="${path}" fill="${d.color || color}"/></g>`;
  });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${frame(w, h, max, spec.fmtAxis || fmt, pad)}${bars}${xLabels(data.map((d) => d.label), x, h, pad, every)}</svg>`;
}

// Linhas (1–3 séries na mesma unidade) com crosshair. labels: [], series: [{name, color, values}]
function line(spec, w, h) {
  const { labels, series, fmt = String, area = true } = spec;
  const pad = { t: 12, r: 12, b: 26, l: spec.padL ?? 56 };
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 0));
  const n = labels.length;
  const x = (i) => pad.l + ((w - pad.l - pad.r) * i) / Math.max(1, n - 1);
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  let out = frame(w, h, max, spec.fmtAxis || fmt, pad);
  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    if (area && si === 0) out += `<path d="M${pts.join('L')}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="${s.color}" opacity=".09"/>`;
    out += `<path d="M${pts.join('L')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    if (n <= 14) s.values.forEach((v, i) => (out += `<circle cx="${x(i)}" cy="${y(v)}" r="3.2" fill="${s.color}" stroke="#fff" stroke-width="2"/>`));
  });
  const colW = (w - pad.l - pad.r) / Math.max(1, n - 1);
  labels.forEach((l, i) => {
    const tip = `<b>${esc(l)}</b>` + series.map((s) => `<br><span class="k" style="background:${s.color}"></span>${esc(s.name)}: <b>${esc(fmt(s.values[i]))}</b>`).join('');
    out += `<g class="hx" data-tip="${esc(tip)}"><line x1="${x(i)}" x2="${x(i)}" y1="${pad.t}" y2="${h - pad.b}" stroke="var(--ink-3)" stroke-dasharray="3 3" opacity="0"/><rect class="hit" x="${x(i) - colW / 2}" y="${pad.t}" width="${colW}" height="${h - pad.t - pad.b}"/></g>`;
  });
  const every = Math.ceil(n / Math.max(1, Math.floor((w - pad.l) / 50)));
  out += xLabels(labels, x, h, pad, every);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>.hx:hover line{opacity:1}</style>${out}</svg>`;
}

export const legend = (items) => `<div class="legend">${items.map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('')}</div>`;

// Barras horizontais em HTML (ranking). items: [{label, value, sub?, html?}]
export function hbars(items, fmt = String, { color = 'var(--bordo)', max } = {}) {
  const m = max ?? Math.max(...items.map((i) => i.value), 1);
  return `<div class="hbars">${items.map((i) => `<div class="hb ${i.attrs ? 'click' : ''}" ${i.attrs || ''} data-tip="${esc(`<b>${i.label}</b><br>${fmt(i.value)}${i.sub ? '<br>' + i.sub : ''}`)}">
    <div class="ellipsis">${i.html || esc(i.label)}</div><div class="bar-t"><i style="width:${(100 * i.value) / m}%;background:${i.color || color}"></i></div><div class="v">${i.vtxt ?? fmt(i.value)}</div></div>`).join('')}</div>`;
}

// Mapa de calor (sequencial, um só matiz) — ex.: garçom × rótulo
export function heatmap(rows, cols, get, { rowLabel = (r) => r, colLabel = (c) => c } = {}) {
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => get(r, c))));
  const cell = (v) => {
    if (!v) return '<td style="background:#F6F1E9;color:#C8BDB2">·</td>';
    const t = v / max;
    const a = 0.12 + t * 0.88;
    return `<td style="background:rgba(110,27,42,${a.toFixed(2)});color:${t > 0.45 ? '#fff' : 'var(--vinho)'}">${v}</td>`;
  };
  return `<div class="tbl-wrap"><table class="heat"><thead><tr><th></th>${cols.map((c) => `<th>${esc(colLabel(c))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr><th>${esc(rowLabel(r))}</th>${cols.map((c) => cell(get(r, c))).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// Tooltip único para todos os gráficos
const tip = document.createElement('div');
tip.className = 'tip'; tip.style.display = 'none';
if (document.body) document.body.appendChild(tip); else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tip));
function showTip(el, ev) {
  tip.innerHTML = el.dataset.tip;
  tip.style.display = 'block';
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY - r.height - 10;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y < 8) y = ev.clientY + 16;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = y + 'px';
}
document.addEventListener('pointermove', (ev) => {
  const el = ev.target.closest?.('[data-tip]');
  if (el && ev.pointerType === 'mouse') showTip(el, ev); else if (ev.pointerType === 'mouse') tip.style.display = 'none';
});
document.addEventListener('pointerdown', (ev) => {
  const el = ev.target.closest?.('[data-tip]');
  if (el && ev.pointerType !== 'mouse') { showTip(el, ev); clearTimeout(tip._t); tip._t = setTimeout(() => (tip.style.display = 'none'), 2500); }
});
document.addEventListener('scroll', () => (tip.style.display = 'none'), true);
document.addEventListener('click', (ev) => { if (ev.pointerType !== 'touch') tip.style.display = 'none'; }, true);
