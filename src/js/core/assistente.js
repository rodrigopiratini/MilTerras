// Cópia de easyapp-base/src/js/core/assistente.js (o núcleo da fábrica): mude lá e copie para cá.
// Assistente (IA) dos apps da fábrica: o chat ✦ e o botão + de cada tela.
// Não depende do resto do núcleo (o Mil Terras usa este mesmo arquivo): quem cria passa um adaptador.
//
//   const ia = criarAssistente({
//     pasta: 'frota', app: 'gestao', idApp: 'easyapp-frota', nome: 'EasyAPP Frota', descricao: '...',
//     demo: false,                                    // ?demo=1: chama a função sem login (com teto do dia)
//     url, chave,                                     // projeto Supabase (config.js)
//     token: async () => '...',                       // login (access token) no modo nuvem
//     get: () => state, commit: (fn) => boolean,      // ler e gravar como as telas fazem
//     colecoes: () => ({ veiculos: { nome: 'Veículos', escrita: true } }),
//     contexto: () => ({ empresa, papel, quem, instrucoes, campos }),
//     tela: () => ({ rota: '#/viagens', titulo: 'Viagens' }),
//     sugestoes: () => ['Quais viagens faltam conferir?'],
//     extras: () => ({ fechamentos: { nome: 'Fechamento das viagens (calculado)', docs: [...] } }), // só leitura: números que as telas calculam
//   });
//   ia.abrir('pergunta opcional', { enviar: true })
//
// O servidor (supabase/functions/assistente) só PROPÕE mudanças; quem grava é este arquivo, quando o
// usuário toca em Aplicar — pelo commit normal do app (fila offline, regras do banco, registro de atividades).

const FABRICA_URL = 'https://sizbmkvzcqiukprdlxxr.supabase.co'; // usado só quando o app ainda não tem config.js (demonstração do molde)
const FABRICA_CHAVE = 'sb_publishable_q_RZZb3Uoz5DTweHbSueTA_MsvHJmVj';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const brl = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const SVG = {
  ia: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  enviar: '<path d="M4 12l16-8-6 16-2-7z"/>',
  novo: '<path d="M12 5v14M5 12h14"/>',
  desfazer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
};
const ic = (n) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[n] || ''}</svg>`;

// Texto do assistente: **negrito**, listas com • ou -, títulos ###, tabelas | a | b |
function md(t) {
  const linhas = esc(t).split('\n');
  const out = [];
  let lista = false, tabela = null;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const fecha = () => {
    if (lista) { out.push('</ul>'); lista = false; }
    if (tabela) { out.push(`<div class="eai-tw"><table>${tabela.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`)).join('')}</tr>`).join('')}</table></div>`); tabela = null; }
  };
  for (const l of linhas) {
    const s = l.trim();
    if (/^\|.*\|$/.test(s)) {
      if (lista) { out.push('</ul>'); lista = false; }
      if (/^\|[\s:|-]+\|$/.test(s)) continue;
      (tabela ||= []).push(s.slice(1, -1).split('|').map((c) => c.trim()));
      continue;
    }
    if (tabela) fecha();
    const m = s.match(/^(?:[•\-*]|\d+[.)])\s+(.*)$/);
    if (m) { if (!lista) { out.push('<ul>'); lista = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    fecha();
    if (!s) { out.push('<div class="eai-sp"></div>'); continue; }
    const h = s.match(/^#{1,4}\s+(.*)$/);
    out.push(h ? `<div class="eai-h">${inline(h[1])}</div>` : `<div>${inline(s)}</div>`);
  }
  fecha();
  return out.join('');
}

const CSS = `
.eai-fab{position:fixed;right:18px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:40;width:56px;height:56px;border-radius:50%;border:0;background:var(--primaria,#1F4E79);color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.28);cursor:pointer;display:grid;place-items:center;font-size:30px;font-weight:300;line-height:1;transition:transform .15s}
.eai-fab:active{transform:scale(.94)}
@media (min-width:901px){.eai-fab{bottom:24px;right:24px}}
body:has(.overlay) .eai-fab,body.eai-aberto .eai-fab,body.eai-teclado .eai-fab{display:none}
.eai-menu{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.28);animation:fade .12s}
.eai-menu .cx{position:absolute;right:18px;bottom:calc(150px + env(safe-area-inset-bottom,0px));width:min(320px,calc(100vw - 36px));max-height:calc(100vh - 200px);overflow:auto;background:var(--surface,#fff);border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.3);padding:6px 0;animation:pop .15s}
@media (min-width:901px){.eai-menu .cx{bottom:92px;right:24px}}
.eai-menu .tit{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--ink-3,#888);padding:10px 16px 4px}
.eai-menu button{display:flex;align-items:center;gap:14px;width:100%;padding:12px 16px;background:none;border:0;text-align:left;font:inherit;font-size:15px;color:var(--ink,#222);cursor:pointer}
.eai-menu button:active,.eai-menu button:hover{background:var(--surface-2,#f1f1f1)}
.eai-menu button .mi{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2,#eef);color:var(--primaria,#1F4E79);flex:none}
.eai-menu button.ia .mi{background:linear-gradient(135deg,var(--primaria,#1F4E79),var(--destaque,#F2A541));color:#fff}
.eai-topo{background:none;border:0;color:inherit;padding:6px;display:grid;place-items:center;cursor:pointer}
.eai{position:fixed;z-index:95;inset:0;display:flex;justify-content:flex-end;background:rgba(0,0,0,.3);animation:fade .15s}
.eai[hidden]{display:none}
.eai .pn{width:min(440px,100%);height:100%;background:var(--fundo,#f5f7fa);display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,.2)}
.eai .cb{display:flex;align-items:center;gap:8px;padding:calc(12px + env(safe-area-inset-top,0px)) 12px 12px 16px;background:var(--primaria-escura,#12314D);color:#fff}
.eai .cb .t{flex:1;min-width:0;font-weight:600;display:flex;align-items:center;gap:8px}
.eai .cb .t small{font-weight:400;opacity:.75;font-size:12px}
.eai .cb button{background:none;border:0;color:#fff;padding:6px;cursor:pointer;display:grid;place-items:center;border-radius:8px}
.eai .msgs{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.eai .b{max-width:88%;padding:10px 13px;border-radius:16px;font-size:14.5px;line-height:1.45;word-wrap:break-word}
.eai .b.u{align-self:flex-end;background:var(--primaria,#1F4E79);color:#fff;border-bottom-right-radius:5px;white-space:pre-wrap}
.eai .b.a{align-self:flex-start;background:var(--surface,#fff);border:1px solid var(--line,#e5e5e5);border-bottom-left-radius:5px}
.eai .b.a ul{margin:4px 0;padding-left:18px}.eai .b.a li{margin:2px 0}
.eai .b.a .eai-h{font-weight:700;margin-top:4px}.eai .b.a .eai-sp{height:6px}
.eai .b.a code{background:var(--surface-2,#eee);padding:0 4px;border-radius:4px;font-size:13px}
.eai .b.erro{align-self:flex-start;background:#fdecec;color:#9b1c1c;border:1px solid #f5c2c2}
.eai-tw{overflow-x:auto;margin:6px 0}.eai-tw table{border-collapse:collapse;font-size:13px}.eai-tw th,.eai-tw td{border-bottom:1px solid var(--line,#e5e5e5);padding:4px 8px;text-align:left;white-space:nowrap}.eai-tw th{font-weight:600}
.eai .custo{align-self:flex-start;font-size:11px;color:var(--ink-3,#888);margin:-4px 0 0 6px}
.eai .pensando{align-self:flex-start;display:flex;gap:5px;padding:14px 16px;background:var(--surface,#fff);border:1px solid var(--line,#e5e5e5);border-radius:16px}
.eai .pensando i{width:7px;height:7px;border-radius:50%;background:var(--ink-3,#999);animation:eaiP 1s infinite}
.eai .pensando i:nth-child(2){animation-delay:.15s}.eai .pensando i:nth-child(3){animation-delay:.3s}
@keyframes eaiP{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
.eai .pr{align-self:stretch;background:var(--surface,#fff);border:1px solid var(--line,#e5e5e5);border-left:4px solid var(--destaque,#F2A541);border-radius:14px;padding:12px}
.eai .pr .rs{font-weight:600;margin-bottom:8px}
.eai .pr .op{display:flex;gap:8px;padding:6px 0;border-top:1px dashed var(--line,#e5e5e5);font-size:13.5px}
.eai .pr .op .tg{flex:none;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:6px;height:fit-content}
.eai .pr .tg.criar{background:#e3f6e8;color:#17663a}.eai .pr .tg.alterar{background:#e6effa;color:#1d4f91}.eai .pr .tg.apagar{background:#fdecec;color:#9b1c1c}
.eai .pr .op .dt{font-size:12.5px;color:var(--ink-2,#555);margin-top:2px}
.eai .pr .op .dt s{color:var(--ink-3,#999)}
.eai .pr .ac{display:flex;gap:8px;margin-top:10px}
.eai .pr .ac button{flex:1;border-radius:10px;padding:9px 10px;font:inherit;font-weight:600;cursor:pointer;border:1px solid var(--line,#ddd);background:transparent;color:var(--primaria,#1F4E79)}
.eai .pr .ac button.ok{background:var(--primaria,#1F4E79);color:#fff;border-color:transparent}
.eai .pr .st{font-size:13px;margin-top:8px;color:var(--ink-2,#555);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.eai .pr .st button{border:0;background:none;color:var(--primaria,#1F4E79);font:inherit;font-weight:600;cursor:pointer;display:inline-flex;gap:4px;align-items:center;padding:0}
.eai .mais{font-size:12.5px;color:var(--primaria,#1F4E79);background:none;border:0;padding:4px 0;cursor:pointer;font:inherit}
.eai .vazio{color:var(--ink-2,#555);font-size:14px;text-align:center;padding:24px 10px 4px}
.eai .vazio .bola{width:54px;height:54px;border-radius:50%;margin:0 auto 10px;display:grid;place-items:center;background:linear-gradient(135deg,var(--primaria,#1F4E79),var(--destaque,#F2A541));color:#fff}
.eai .vazio .bola svg{width:28px;height:28px}
.eai .chips{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0}
.eai .chips button{border:1px solid var(--line,#ddd);background:var(--surface,#fff);color:var(--ink,#222);border-radius:999px;padding:8px 12px;font:inherit;font-size:13.5px;cursor:pointer;text-align:left}
.eai .rd{display:flex;gap:8px;align-items:flex-end;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line,#e5e5e5);background:var(--surface,#fff)}
.eai .rd textarea{flex:1;resize:none;border:1px solid var(--line,#ddd);border-radius:14px;padding:10px 12px;font:inherit;font-size:15px;max-height:140px;min-height:44px;background:var(--fundo,#fff);color:inherit}
.eai .rd button{width:44px;height:44px;border-radius:50%;border:0;background:var(--primaria,#1F4E79);color:#fff;display:grid;place-items:center;cursor:pointer;flex:none}
.eai .rd button:disabled{opacity:.45}
@media (max-width:900px){.eai{background:none}.eai .pn{width:100%;box-shadow:none}}
`;

export function criarAssistente(op) {
  const CHAVE_CONVERSA = `${op.idApp}:ia:${op.app}`;
  let conversa = lerConversa();   // [{ role, texto, proposta?, estado?, desfazer?, custo?, erro? }]
  let ocupado = false;
  let painel = null;
  let ultimoUso = null;

  if (!document.getElementById('eai-css')) { const st = document.createElement('style'); st.id = 'eai-css'; st.textContent = CSS; document.head.appendChild(st); }
  // o + some com o teclado aberto (no celular ele cobria o botão Salvar)
  document.addEventListener('focusin', (e) => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) && !e.target.closest('.eai')) document.body.classList.add('eai-teclado'); });
  document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) document.body.classList.remove('eai-teclado'); }, 50));

  function lerConversa() { try { return JSON.parse(sessionStorage.getItem(CHAVE_CONVERSA) || '[]'); } catch { return []; } }
  function gravarConversa() { try { sessionStorage.setItem(CHAVE_CONVERSA, JSON.stringify(conversa.slice(-40))); } catch {} }

  // ---------- painel ----------
  function montar() {
    if (painel) return painel;
    painel = document.createElement('div');
    painel.className = 'eai';
    painel.hidden = true;
    painel.innerHTML = `<div class="pn" role="dialog" aria-label="Assistente">
      <div class="cb"><div class="t">${ic('ia')}<span>Assistente</span><small class="uso"></small></div>
        <button data-a="nova" title="Nova conversa" aria-label="Nova conversa">${ic('novo')}</button>
        <button data-a="fechar" aria-label="Fechar">${ic('x')}</button></div>
      <div class="msgs"></div>
      <form class="rd"><textarea rows="1" placeholder="Pergunte ou peça uma mudança…" enterkeyhint="send"></textarea><button type="submit" aria-label="Enviar">${ic('enviar')}</button></form></div>`;
    document.body.appendChild(painel);
    const ta = painel.querySelector('textarea');
    painel.addEventListener('click', (e) => {
      if (e.target === painel) return fechar();
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a, i = +b.dataset.i;
      if (a === 'fechar') fechar();
      else if (a === 'nova') { if (!ocupado) { conversa = []; gravarConversa(); pintar(); ta.focus(); } }
      else if (a === 'chip') enviar(b.dataset.q);
      else if (a === 'aplicar') aplicar(i);
      else if (a === 'descartar') { conversa[i].estado = 'descartada'; gravarConversa(); pintar(); }
      else if (a === 'desfazer') desfazer(i);
      else if (a === 'verTudo') { conversa[i].verTudo = true; pintar(); }
    });
    painel.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); enviar(ta.value); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); enviar(ta.value); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden) fechar(); });
    return painel;
  }

  const nomeColecao = (c) => op.colecoes()[c]?.nome || c;
  const valorTxt = (v) => v == null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'sim' : 'não') : typeof v === 'object' ? (Array.isArray(v) ? `${v.length} item(ns)` : '{…}') : String(v).slice(0, 60);
  const nomeCampo = (k) => op.contexto()?.campos?.[k] || k;

  function htmlProposta(m, i) {
    const p = m.proposta;
    const ops = p.operacoes;
    const max = m.verTudo ? ops.length : 8;
    const linhas = ops.slice(0, max).map((o) => {
      const tg = { criar: 'novo', alterar: 'alterar', apagar: 'apagar' }[o.acao];
      const titulo = o.descricao || `${nomeColecao(o.colecao)}${o.nome ? ': ' + o.nome : o.dados?.nome ? ': ' + o.dados.nome : ''}`;
      let dt = '';
      if (o.acao === 'alterar') dt = Object.keys(o.dados || {}).slice(0, 6).map((k) => `${esc(nomeCampo(k))}: <s>${esc(valorTxt(o.antes?.[k]))}</s> → <b>${esc(valorTxt(o.dados[k]))}</b>`).join(' · ');
      else if (o.acao === 'criar') dt = Object.entries(o.dados || {}).filter(([, v]) => v !== '' && v != null && typeof v !== 'object').slice(0, 5).map(([k, v]) => `${esc(nomeCampo(k))}: ${esc(valorTxt(v))}`).join(' · ');
      return `<div class="op"><span class="tg ${o.acao}">${tg}</span><div><div>${esc(titulo)}</div>${dt ? `<div class="dt">${dt}</div>` : ''}</div></div>`;
    }).join('');
    const resto = ops.length > max ? `<button class="mais" data-a="verTudo" data-i="${i}">ver as outras ${ops.length - max}</button>` : '';
    let rodape;
    if (m.estado === 'aplicada') rodape = `<div class="st">✓ Aplicado${m.desfazer ? ` · <button data-a="desfazer" data-i="${i}">${ic('desfazer')} Desfazer</button>` : ''}</div>`;
    else if (m.estado === 'desfeita') rodape = '<div class="st">Desfeito: tudo voltou como estava.</div>';
    else if (m.estado === 'descartada') rodape = '<div class="st">Descartado: nada foi alterado.</div>';
    else rodape = `<div class="ac"><button data-a="descartar" data-i="${i}">Descartar</button><button class="ok" data-a="aplicar" data-i="${i}">Aplicar ${ops.length > 1 ? `(${ops.length})` : ''}</button></div>`;
    return `<div class="pr"><div class="rs">${esc(p.resumo || 'Mudanças propostas')}</div>${linhas}${resto}${rodape}</div>`;
  }

  function pintar() {
    if (!painel) return;
    const el = painel.querySelector('.msgs');
    const ctx = op.contexto() || {};
    let h = '';
    if (!conversa.length) {
      const sug = [...(op.sugestoes?.() || []), 'O que você consegue fazer neste app?'].slice(0, 6);
      h = `<div class="vazio"><div class="bola">${ic('ia')}</div><b>Olá${ctx.quem ? ', ' + esc(String(ctx.quem).split(/[@\s]/)[0]) : ''}!</b><br>Pergunte sobre os seus dados ou peça para eu cadastrar, corrigir ou atualizar algo. Antes de gravar, eu mostro o que vai mudar.</div>
        <div class="chips">${sug.map((q) => `<button data-a="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
    }
    conversa.forEach((m, i) => {
      if (m.role === 'user') h += `<div class="b u">${esc(m.texto)}</div>`;
      else if (m.erro) h += `<div class="b erro">${esc(m.texto)}</div>`;
      else {
        h += `<div class="b a">${md(m.texto)}</div>`;
        if (m.proposta) h += htmlProposta(m, i);
        if (m.custo != null && m.custo > 0) h += `<div class="custo">${brl(m.custo)}</div>`;
      }
    });
    if (ocupado) h += '<div class="pensando"><i></i><i></i><i></i></div>';
    el.innerHTML = h;
    el.scrollTop = el.scrollHeight;
    painel.querySelector('.rd button').disabled = ocupado;
    const u = painel.querySelector('.uso');
    u.textContent = ultimoUso?.limite ? `· ${brl(ultimoUso.gasto)} de ${brl(ultimoUso.limite)} no mês` : op.demo ? '· demonstração' : '';
  }

  function abrir(texto, { enviar: env = false } = {}) {
    montar();
    painel.hidden = false;
    document.body.classList.add('eai-aberto');
    pintar();
    const ta = painel.querySelector('textarea');
    if (texto && env) enviar(texto);
    else { if (texto) ta.value = texto; setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60); }
  }
  function fechar() { if (painel) painel.hidden = true; document.body.classList.remove('eai-aberto'); }

  // ---------- conversa ----------
  function extras() { try { return op.extras?.() || {}; } catch (e) { console.warn('assistente: extras', e); return {}; } }
  function dados(ex) {
    const s = op.get() || {};
    const out = {};
    // PIN e senha não saem do aparelho
    const limpo = (d) => (d && typeof d === 'object' && ('pin' in d || 'senha' in d) ? (({ pin, senha, ...r }) => r)(d) : d);
    for (const c of Object.keys(op.colecoes())) out[c] = Array.isArray(s[c]) ? s[c].map(limpo) : [];
    for (const [c, x] of Object.entries(ex)) out[c] = Array.isArray(x?.docs) ? x.docs : [];
    return out;
  }
  async function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || ocupado) return;
    const ta = painel?.querySelector('textarea');
    if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    conversa.push({ role: 'user', texto });
    ocupado = true; gravarConversa(); pintar();
    try {
      const historico = conversa.filter((m) => !m.erro).map((m) => ({ role: m.role, texto: m.texto + (m.proposta ? `\n\n[Proposta: ${m.proposta.resumo} — ${{ aplicada: 'o usuário APLICOU', descartada: 'o usuário descartou', desfeita: 'o usuário aplicou e depois desfez' }[m.estado] || 'ainda não aplicada'}]` : '') }));
      const ex = extras();
      const cols = { ...op.colecoes(), ...Object.fromEntries(Object.entries(ex).map(([c, x]) => [c, { nome: x?.nome || c, escrita: false }])) };
      const corpo = {
        pasta: op.pasta, app: op.app, demo: !!op.demo, mensagens: historico, tela: op.tela?.(),
        contexto: { app: op.nome, descricao: op.descricao, hoje: hoje(), ...(op.contexto() || {}), colecoes: cols },
        dados: dados(ex),
      };
      const url = (op.url || FABRICA_URL).replace(/\/$/, '') + '/functions/v1/assistente';
      const chave = op.chave || FABRICA_CHAVE;
      const tk = op.demo ? null : await op.token?.();
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: chave, Authorization: `Bearer ${tk || chave}` }, body: JSON.stringify(corpo) });
      let j = null;
      try { j = await r.json(); } catch {}
      if (!r.ok || !j || j.erro) throw new Error(j?.erro || (r.status === 404 ? 'O assistente ainda não foi instalado.' : `Falha ao falar com o assistente (${r.status}).`));
      if (j.uso) ultimoUso = j.uso;
      conversa.push({ role: 'assistant', texto: j.texto || '', proposta: j.proposta || null, custo: j.uso?.custo });
    } catch (e) {
      const offline = !navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(e.message);
      conversa.push({ role: 'assistant', erro: true, texto: offline ? 'Sem internet: o assistente precisa de conexão.' : e.message });
    } finally {
      ocupado = false; gravarConversa(); pintar();
    }
  }

  // ---------- aplicar e desfazer ----------
  function aplicar(i) {
    const m = conversa[i];
    if (!m?.proposta || m.estado) return;
    const desfazer = [];
    let faltou = 0;
    const ok = op.commit((s) => {
      for (const o of m.proposta.operacoes) {
        const lista = (s[o.colecao] ||= []);
        if (o.acao === 'criar') {
          const id = o.id || uid();
          lista.push({ ...o.dados, id });
          desfazer.push({ acao: 'remover', colecao: o.colecao, id });
        } else {
          const k = lista.findIndex((d) => d.id === o.id);
          if (k < 0) { faltou++; continue; }
          desfazer.push({ acao: 'repor', colecao: o.colecao, id: o.id, doc: JSON.parse(JSON.stringify(lista[k])), pos: k });
          if (o.acao === 'apagar') lista.splice(k, 1);
          else Object.assign(lista[k], o.dados);
        }
      }
    }, 'assistente');
    if (ok === false) return; // somente consulta: o app já avisou
    m.estado = 'aplicada'; m.desfazer = desfazer;
    gravarConversa(); pintar();
    op.toast?.(faltou ? `Aplicado (${faltou} registro(s) não encontrado(s))` : 'Pronto, aplicado');
  }
  function desfazer(i) {
    const m = conversa[i];
    if (!m?.desfazer) return;
    const ok = op.commit((s) => {
      for (const d of [...m.desfazer].reverse()) {
        const lista = (s[d.colecao] ||= []);
        const k = lista.findIndex((x) => x.id === d.id);
        if (d.acao === 'remover') { if (k >= 0) lista.splice(k, 1); }
        else if (k >= 0) { for (const key of Object.keys(lista[k])) delete lista[k][key]; Object.assign(lista[k], d.doc); }
        else lista.splice(Math.min(d.pos, lista.length), 0, d.doc);
      }
    }, 'assistente');
    if (ok === false) return;
    m.estado = 'desfeita'; delete m.desfazer;
    gravarConversa(); pintar();
    op.toast?.('Desfeito');
  }

  // ---------- botão + (ações da tela) ----------
  // itens: [{ icone: '<svg…>' ou texto, texto, act?, h?, ia?, enviar?, dados? }]
  function menuMais(itens, { aoEscolher } = {}) {
    document.querySelector('.eai-menu')?.remove();
    const m = document.createElement('div');
    m.className = 'eai-menu';
    const todos = [...itens];
    const sug = (op.sugestoes?.() || []).slice(0, 2);
    const ia = [...sug.map((q) => ({ texto: q, ia: q, enviar: true })), { texto: 'Perguntar ao assistente', ia: '' }];
    m.innerHTML = `<div class="cx">${todos.length ? todos.map((x, k) => `<button data-k="${k}"><span class="mi">${x.icone || ic('novo')}</span><span>${esc(x.texto)}</span></button>`).join('') : ''}
      <div class="tit">Assistente</div>${ia.map((x, k) => `<button class="ia" data-ia="${k}"><span class="mi">${ic('ia')}</span><span>${esc(x.texto)}</span></button>`).join('')}</div>`;
    m.addEventListener('click', (e) => {
      if (e.target === m) return m.remove();
      const b = e.target.closest('button');
      if (!b) return;
      m.remove();
      if (b.dataset.ia != null) { const x = ia[+b.dataset.ia]; return abrir(x.ia, { enviar: !!x.enviar }); }
      const x = todos[+b.dataset.k];
      if (x.ia != null) return abrir(x.ia, { enviar: !!x.enviar });
      aoEscolher?.(x);
    });
    document.body.appendChild(m);
    const fecharEsc = (e) => { if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', fecharEsc); } };
    document.addEventListener('keydown', fecharEsc);
  }

  function limpar() { conversa = []; ultimoUso = null; try { sessionStorage.removeItem(CHAVE_CONVERSA); } catch {} fechar(); }

  return { abrir, fechar, limpar, menuMais, get aberto() { return !!painel && !painel.hidden; } };
}
