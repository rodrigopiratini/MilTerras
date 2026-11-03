// Componentes de tela próprios da Mil Terras (garrafas e fichas dos vinhos)
import { esc, int } from './core/fmt.js';
import { asset } from './core/ui.js';

const FOTO_PADRAO = 'assets/logo/simbolo.png';
export const foto = (p) => asset(p?.foto || FOTO_PADRAO);
export const thumb = (p, cls = '') => `<img class="thumb ${cls}" src="${foto(p)}" alt="" loading="lazy">`;
export const qtdBadge = (q) => `<span class="badge ${q <= 0 ? 'crit' : q <= 2 ? 'warn' : ''}">${int(q)} un.</span>`;
export const fichaVinho = (p, extra = '') => `
  <div class="row top gap-l" style="align-items:flex-start">
    <img src="${foto(p)}" alt="" style="width:86px;height:250px;object-fit:contain;filter:drop-shadow(0 6px 8px rgba(0,0,0,.2))">
    <div class="col grow" style="gap:8px">
      <div class="row gap-s wrap"><span class="tag ${p.tipo}">${p.tipo}</span><span class="tag" style="color:var(--dourado)">${esc(p.regiao)}${p.classificacao ? ' · ' + p.classificacao : ''}</span></div>
      <h2 style="font-size:22px">${esc(p.nome)}</h2>
      <div class="serif" style="color:var(--bordo)">${esc(p.descricao)}</div>
      <div class="grid g3 small" style="gap:8px;margin-top:4px">
        <div><div class="label">Teor</div>${p.teor}</div><div><div class="label">Servir a</div>${p.servir}</div><div><div class="label">Safra</div>${p.safra}</div>
      </div>
      <div class="small"><div class="label">Uvas</div>${esc(p.uvas)}</div>
      <div class="small" style="background:var(--bordo);color:#fff;border-radius:10px;padding:10px 12px"><div class="label" style="color:var(--dourado-claro)">Harmonização</div>${esc(p.harmonizacao)}</div>
      ${extra}
    </div>
  </div>`;
