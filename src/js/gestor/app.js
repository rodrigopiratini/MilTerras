// App de Gestão — Mil Terras (distribuidora)
import * as store from '../core/store.js';
import * as D from '../core/domain.js';
import { seed } from '../core/seed.js';
import { money, money0, moneyK, int, percent, date, dateShort, relDays, today, addDays, diffDays, monthLabel, esc, sum, uid, plural, sortBy } from '../core/fmt.js';
import { icon, router, delegate, modal, closeModal, confirmar, toast, kpi, badge, empty, thumb, stepper, stepHandler, insightCard, fichaVinho, iniciais, qtdBadge, waLink, download, toCSV, asset, instalar, bannerInstalar, dispensarBanner, registerSW, moneyInput, parseMoney, filtrarBusca, buscaInput } from '../core/ui.js';
import { chart, mountCharts, resetCharts, legend, hbars } from '../core/charts.js';
import { novoWizard, renderWizard, wizardHandlers, statusBadge, ajustesHTML, acertosHTML } from '../core/fechamento-ui.js';

const app = document.getElementById('app');
const S = () => store.get();
const SESSION = 'milterras:gestor';

const NAV = [
  ['#/painel', 'chart', 'Painel'],
  ['#/aovivo', 'clock', 'Ao vivo'],
  ['#/estoque', 'box', 'Estoque central'],
  ['#/consignacao', 'swap', 'Consignação'],
  ['#/remessas', 'truck', 'Remessas'],
  ['#/parceiros', 'store', 'Parceiros'],
  ['#/fechamentos', 'receipt', 'Fechamentos'],
  ['#/financeiro', 'money', 'Financeiro'],
  ['#/inteligencia', 'spark', 'Inteligência'],
  ['#/produtos', 'bottle', 'Rótulos'],
  ['#/config', 'gear', 'Configurações'],
];
const TABS = [['#/painel', 'chart', 'Painel'], ['#/estoque', 'box', 'Estoque'], ['#/fechamentos', 'receipt', 'Fechamentos'], ['#/parceiros', 'store', 'Parceiros'], ['#/mais', 'menu', 'Mais']];

let current = { view: null, params: {}, pattern: '' };
let handlers = {};

// ---------- Shell ----------
function shell(title, content, { back } = {}) {
  const s = S();
  const pend = s.fechamentos.filter((f) => f.status === 'enviado').length;
  const route = '#' + (location.hash.slice(1).split('?')[0] || '');
  const isOn = (h) => route === h || route.startsWith(h + '/') || (h === '#/parceiros' && route.startsWith('#/parceiro')) || (h === '#/fechamentos' && route.startsWith('#/fechamento'));
  const remPend = D.remessas(s).filter((r) => r.status !== 'entregue').length + D.pedidos(s).filter((p) => p.status === 'solicitado').length;
  const b = (h) => (h === '#/fechamentos' && pend ? `<span class="badge dot">${pend}</span>` : h === '#/remessas' && remPend ? `<span class="badge dot">${remPend}</span>` : '');
  return `<div class="shell">
    <aside class="side">
      <div class="brand"><img src="${asset('assets/logo/logo_h_negativo.png')}" alt="Mil Terras"><div class="who">Gestão</div></div>
      ${NAV.map(([h, ic, n]) => `<a class="nav-a ${isOn(h) ? 'on' : ''}" href="${h}">${icon(ic)}<span>${n}</span>${b(h)}</a>`).join('')}
      <div class="foot">${syncBadge()}<br><a href="#" data-act="logout" style="color:#C9B3AC">Sair</a></div>
    </aside>
    <div>
      <header class="topbar">${back ? `<button data-act="back" aria-label="Voltar">${icon('arrowL')}</button>` : `<img src="${asset('assets/logo/simbolo_negativo.png')}" alt="">`}<div class="t ellipsis">${title}</div><a href="#/fechamentos" style="color:#fff;position:relative">${icon('inbox')}${pend ? `<span class="badge dot" style="position:absolute;top:-6px;right:-8px">${pend}</span>` : ''}</a></header>
      <main class="main">${content}</main>
    </div>
    <nav class="tabbar">${TABS.map(([h, ic, n]) => `<a href="${h}" class="${isOn(h) ? 'on' : ''}">${icon(ic)}<span>${n}</span>${b(h)}</a>`).join('')}</nav>
  </div>`;
}
const DEMO_Q = store.modo === 'local' && location.search ? location.search : '';
function syncBadge() {
  const st = store.status();
  const t = { local: store.demo && S().meta.demo ? 'Demonstração (dados locais)' : 'Dados neste navegador', online: 'Sincronizado', enviando: `Enviando ${store.pendentes()}…`, offline: `Sem internet · ${store.pendentes()} pendente(s)` }[st] || st;
  return `<span class="sync" style="${st === 'offline' ? 'color:var(--warn)' : st === 'local' ? 'color:var(--dourado)' : ''}">${t}</span>`;
}
const buscas = {};
const busca = (ph) => buscaInput(buscas[current.pattern] || '', ph);
// Link para abrir o app do parceiro em modo visualização (somente leitura)
const urlApp = (cid) => { const u = new URL('../cliente/', location.href); u.searchParams.set('ver', cid); if (store.modo === 'local' && store.demo) u.searchParams.set('demo', '1'); return u.href; };
const verApp = (cid, cls = 'btn ghost sm') => `<a class="${cls}" target="_blank" rel="noopener" href="${urlApp(cid)}" title="Ver o app do parceiro como ele vê">${icon('link')} Ver app</a>`;
const pageHead = (title, sub = '', actions = '') => `<div class="pagehead"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="row wrap">${actions}</div></div>`;

// Cadastro dentro de outra ação: guarda o que já foi digitado, abre o cadastro e volta
const lerForm = (id) => { const f = document.getElementById(id); return f ? Object.fromEntries([...f.elements].filter((e) => e.name).map((e) => [e.name, e.value])) : {}; };
const aplicarForm = (id, snap = {}) => { const f = document.getElementById(id); if (!f) return; for (const e of f.elements) if (e.name && snap[e.name] !== undefined && e.type !== 'hidden' && !e.dataset.onchange?.startsWith('cli')) e.value = snap[e.name]; };
function novoParceiro(onSalvo, onCancelar) {
  modal({ title: 'Novo parceiro', wide: true, body: formCliente() + (onCancelar ? '<div class="tiny muted mt-s">Ao salvar, você volta para onde estava.</div>' : ''),
    handlers: { salvarCliente: (f) => common.salvarCliente(f, onSalvo), novoCodigo: (el) => common.novoCodigo(el), close: () => { closeModal(); onCancelar?.(); } } });
}

// Garrafas em consignação por parceiro (clique abre o detalhamento editável)
function graficoParceiros(s) {
  const cons = D.consignado(s);
  const cm = D.custosMedios(s);
  const itens = s.clientes.filter((c) => c.ativo).map((c) => {
    const m = cons[c.id] || {};
    return { c, q: sum(Object.values(m)), custo: sum(Object.entries(m), ([pid, q]) => q * cm[pid]), venda: sum(Object.entries(m), ([pid, q]) => q * D.produto(s, pid).preco) };
  }).sort((a, b) => b.q - a.q);
  if (!itens.length) return empty('Cadastre o primeiro parceiro.', 'store');
  return hbars(itens.map((x) => ({ label: x.c.nome, value: x.q, vtxt: `${int(x.q)} gf · ${moneyK(x.custo)}`, sub: `${money0(x.custo)} a custo · ${money0(x.venda)} a preço de venda<br>Clique para ver o detalhamento`, attrs: `data-act="consigDet" data-c="${x.c.id}" data-busca="${esc(x.c.nome + ' ' + x.c.cidade)}"` })), (v) => int(v) + ' gf', { color: 'var(--dourado)' });
}

// Detalhamento do consignado de um parceiro, com edição das quantidades
// Detalhamento do consignado de um parceiro. Só permite REDUZIR (recolhimento ou correção, com justificativa);
// aumentar é sempre por remessa, para ficar no histórico com protocolo.
function modalConsig(cid) {
  const s = S();
  const c = D.cliente(s, cid);
  const saldo = D.saldoCliente(s, cid);
  const cm = D.custosMedios(s);
  let modo = 'mov';
  const pids = s.produtos.filter((p) => saldo[p.id] > 0).map((p) => p.id);
  const abertos = D.lotesAbertos(s, cid);
  const transito = D.remessas(s).filter((r) => r.clienteId === cid && r.status !== 'entregue');
  const m = modal({ title: esc(c.nome), wide: true, body: `
    <div class="grid g3 mb"><div class="kpi"><div class="label">Garrafas</div><div class="v">${sum(Object.values(saldo))}</div></div>
      <div class="kpi"><div class="label">A custo</div><div class="v">${moneyK(sum(Object.entries(saldo), ([pid, q]) => q * cm[pid]))}</div></div>
      <div class="kpi"><div class="label">A preço de venda</div><div class="v">${moneyK(sum(Object.entries(saldo), ([pid, q]) => q * D.produto(s, pid).preco))}</div></div></div>
    ${transito.length ? `<div class="ajuste-box mb">${icon('truck')} ${plural(sum(transito, (r) => r.garrafas), 'garrafa')} em remessa ainda não entregue (${transito.map((r) => r.protocolo).join(', ')}).</div>` : ''}
    ${abertos.length ? `<div class="small mb"><b>Lotes em aberto:</b> ${abertos.map((l) => `${esc(l.protocolo)} ${badge(D.SITUACAO_LOTE[l.situacao].label + ' · ' + date(l.vence), D.SITUACAO_LOTE[l.situacao].tone)}`).join(' ')}</div>` : ''}
    <form id="fcons" class="col">
      <div class="card pad-0"><div class="list" style="padding:0 14px">${pids.map((pid) => { const p = D.produto(s, pid); const q = saldo[pid]; return `<div class="li">${thumb(p, 'sm')}<div class="grow"><div class="t">${esc(p.nome)}</div><div class="s">Hoje: <b>${q}</b> · ${money(q * cm[pid])} a custo</div></div>${stepper('q:' + pid, q, { max: q })}</div>`; }).join('') || '<div class="empty">Nada em consignação.</div>'}</div></div>
      <div class="row between wrap"><span class="tiny muted">Para aumentar quantidades ou incluir rótulos, faça uma remessa (gera protocolo e histórico).</span><button type="button" class="btn ghost sm" data-act="remDoConsig">${icon('truck')} Nova remessa</button></div>
      <div class="field"><span>Se reduzir, como registrar</span><div class="seg"><button type="button" class="on" data-act="modoCons" data-v="mov">Recolhimento (volta ao estoque)</button><button type="button" data-act="modoCons" data-v="corr">Correção / perda no parceiro</button></div>
        <div class="tiny muted" id="modoTxt">As garrafas voltam para o estoque central.</div></div>
      <label class="field"><span>Justificativa (obrigatória se alterar)</span><input class="input" name="motivo" maxlength="200" placeholder="Ex.: recolhido na visita de 28/10"></label>
    </form>`,
    foot: `${verApp(cid, 'btn ghost')}<a class="btn ghost" href="#/parceiro/${cid}?tab=estoque" data-act="close">Abrir parceiro</a><button class="btn" data-act="ok">Salvar alterações</button>`,
    handlers: {
      step: stepHandler, qty: () => {},
      close: (el) => { closeModal(); if (el.getAttribute?.('href')) location.hash = el.getAttribute('href'); },
      remDoConsig: () => { closeModal(); modalRemessa(cid); },
      modoCons: (el) => { modo = el.dataset.v; el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
        m.querySelector('#modoTxt').textContent = modo === 'mov' ? 'As garrafas voltam para o estoque central.' : 'Baixa no saldo do parceiro sem voltar ao estoque central (ex.: erro de lançamento, quebra no parceiro). Fica registrado com a justificativa.'; },
      ok: () => {
        const fd = new FormData(document.getElementById('fcons'));
        const difs = pids.map((pid) => ({ p: D.produto(s, pid), d: Math.min(saldo[pid], Math.max(0, +fd.get('q:' + pid) || 0)) - saldo[pid] })).filter((x) => x.d !== 0);
        if (!difs.length) return closeModal();
        const motivo = String(fd.get('motivo') || '').trim();
        if (motivo.length < 3) { toast('Informe a justificativa da alteração'); return m.querySelector('[name=motivo]').focus(); }
        store.commit((st) => {
          for (const { p, d } of difs) D.addMov(st, { tipo: modo === 'corr' ? 'ajuste_parceiro' : 'devolucao', produtoId: p.id, qtd: modo === 'corr' ? d : -d, clienteId: cid, obs: motivo });
        });
        closeModal(); toast('Consignação atualizada');
      },
    } });
}

// Onde está cada garrafa de um rótulo: depósito, cada parceiro e em trânsito
function modalOndeEsta(pid) {
  const s = S();
  const p = D.produto(s, pid);
  const est = Math.max(0, D.estoqueCentral(s)[pid] || 0);
  const cons = D.consignado(s);
  const cm = D.custosMedios(s)[pid];
  const parc = s.clientes.map((c) => ({ c, q: cons[c.id]?.[pid] || 0 })).filter((x) => x.q > 0).sort((a, b) => b.q - a.q);
  const trans = D.remessas(s).filter((r) => r.status !== 'entregue').flatMap((r) => r.itens.filter((i) => i.produtoId === pid).map((i) => ({ r, q: i.qtd })));
  const total = est + sum(parc, (x) => x.q) + sum(trans, (x) => x.q);
  modal({ title: esc(p.nome), body: `
    <div class="row mb">${thumb(p)}<div><div class="kpi"><div class="label">Total da Mil Terras</div><div class="v">${plural(total, 'garrafa')}</div><div class="d">${money(total * cm)} a custo · ${money(total * p.preco)} a preço de tabela</div></div></div></div>
    <div class="list">
      <a class="li" href="#/produto/${pid}" data-act="close"><div class="avatar">${icon('box')}</div><div class="grow"><div class="t">Estoque central</div><div class="s">Depósito Mil Terras</div></div><b>${est}</b></a>
      ${trans.map(({ r, q }) => `<a class="li" href="#/remessas" data-act="close"><div class="avatar">${icon('truck')}</div><div class="grow"><div class="t">Em trânsito · ${esc(r.protocolo)}</div><div class="s">${esc(D.cliente(s, r.clienteId)?.nome)} · ${D.STATUS_ENTREGA[r.status].label}</div></div><b>${q}</b></a>`).join('')}
      ${parc.map(({ c, q }) => `<a class="li" href="#/parceiro/${c.id}?tab=estoque" data-act="close"><div class="avatar">${iniciais(c.nome)}</div><div class="grow"><div class="t">${esc(c.nome)}</div><div class="s">${esc(c.cidade || '')} · ${money(q * p.preco)}</div></div><b>${q}</b></a>`).join('') || '<div class="empty small">Nenhum parceiro com este rótulo.</div>'}
    </div>`,
    handlers: { close: (el) => { closeModal(); if (el.getAttribute?.('href')) location.hash = el.getAttribute('href'); } } });
}

// ---------- Painel ----------
function vPainel() {
  const s = S();
  const serie = D.serieMensal(s, 6);
  const mes = serie[serie.length - 1], ant = serie[serie.length - 2];
  const diaMes = new Date().getDate();
  const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projecao = (mes.receita / diaMes) * diasMes;
  const cr = D.contasReceber(s);
  const vencido = sum(cr.filter((x) => x.atraso > 0), (x) => x.total);
  const est = D.estoqueCentral(s);
  const cons = D.consignado(s);
  const gCentral = sum(Object.values(est));
  const cm = D.custosMedios(s);
  const vCentral = sum(s.produtos, (p) => Math.max(0, est[p.id]) * cm[p.id]);
  let gCons = 0, cCons = 0, nParc = 0;
  for (const [cid, m] of Object.entries(cons)) { const g = sum(Object.values(m)); if (g > 0) nParc++; gCons += g; cCons += sum(Object.entries(m), ([pid, q]) => q * cm[pid]); }
  const transito = sum(Object.values(D.emTransito(s)));
  const ins = D.insights(s);
  const abc = D.curvaABC(s).filter((x) => x.receita > 0).slice(0, 7);
  const rank = D.rankingClientes(s).slice(0, 6);
  const agenda = s.clientes.filter((c) => c.ativo).map((c) => ({ c, per: D.periodoAtual(s, c.id) })).sort((a, b) => (a.per.pendente ? -1 : 0) - (b.per.pendente ? -1 : 0) || (a.per.previsto < b.per.previsto ? -1 : 1));
  const delta = ant.receita ? (projecao - ant.receita) / ant.receita : 0;
  const maxQ = Math.max(...s.produtos.map((p) => Math.max(0, est[p.id]) + sum(Object.values(cons), (m) => m[p.id] || 0)));

  return shell('Painel', `
    ${s.meta.demo ? `<div class="demo-banner">${icon('info')} <span class="grow">Catálogo e preços reais da Mil Terras. Parceiros e movimentações são <b>fictícios</b>, simulados para demonstrar os painéis.</span><a href="#/config">Começar do zero</a></div>` : ''}
    ${bannerInstalar()}
    ${(() => { const h = D.resumoRede(s, today()); return `<a class="card row mb" href="#/aovivo" style="color:inherit;padding:12px 16px"><span class="live small" style="font-weight:600">Ao vivo</span><span class="grow small ink2">Hoje os parceiros já registraram <b>${plural(h.garrafas, 'garrafa')}</b> · ${money0(h.valor)} a faturar · ${h.porCliente.length} parceiro(s) vendendo</span>${icon('arrowR')}</a>`; })()}
    ${pageHead(`Olá, ${s.meta.empresa}`, new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }), `<a class="btn ghost" href="#/consignacao?nova=1">${icon('truck')} Nova remessa</a><a class="btn" href="#/estoque?entrada=1">${icon('plus')} Entrada</a>`)}
    <div class="grid g4">
      ${kpi('Faturamento do mês', moneyK(mes.receita), `Projeção ${moneyK(projecao)} · <b class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${percent(Math.abs(delta))}</b> vs ${monthLabel(ant.mes)}`)}
      ${kpi('A receber', moneyK(sum(cr, (x) => x.total)), `${plural(cr.length, 'título')}${vencido ? ` · <b class="down">${moneyK(vencido)} vencido</b>` : ' · nada vencido'}`)}
      ${kpi('Estoque central', int(gCentral) + ' gf', `${moneyK(vCentral)} a custo`)}
      ${kpi('Em consignação', int(gCons) + ' gf', `${moneyK(cCons)} a custo · ${nParc} parceiros${transito ? ` · <b>${transito} em trânsito</b>` : ''}`)}
    </div>
    <div class="grid g-2-1 mt">
      <div class="card"><div class="head"><h2>Faturamento e lucro bruto</h2><span class="muted small">últimos 6 meses</span></div>
        ${legend([['Faturamento', 'var(--s1)'], ['Lucro bruto', 'var(--s3)']])}
        ${chart({ type: 'line', label: 'Faturamento e lucro mensal', height: 330, labels: serie.map((m) => monthLabel(m.mes)), fmt: money0, fmtAxis: moneyK, series: [{ name: 'Faturamento', color: 'var(--s1)', values: serie.map((m) => m.receita) }, { name: 'Lucro bruto', color: 'var(--s3)', values: serie.map((m) => m.receita - m.cmv) }] })}
      </div>
      <div class="card"><div class="head"><h2>Central de alertas</h2><a class="small" href="#/inteligencia">ver todos (${ins.length})</a></div>
        <div class="col">${ins.slice(0, 5).map(insightCard).join('') || empty('Tudo em ordem por aqui.', 'check')}</div></div>
    </div>
    <div class="grid g3 mt">
      <div class="card"><div class="head"><h2>Rótulos que mais faturam</h2><span class="muted small">90 dias</span></div>
        ${abc.length ? hbars(abc.map((x) => ({ label: x.produto.nome, value: x.receita, sub: `Curva ${x.classe} · ${percent(x.share)} da receita` })), moneyK) : empty('As vendas aparecem aqui após os primeiros fechamentos.')}</div>
      <div class="card"><div class="head"><h2>Melhores parceiros</h2><span class="muted small">90 dias</span></div>
        ${rank.length ? hbars(rank.map((x) => ({ label: x.cliente.nome, value: x.receita, sub: `${x.garrafas} garrafas · giro ${x.giro.toFixed(1)}×` })), moneyK, { color: 'var(--dourado)' }) : empty('Cadastre o primeiro parceiro.', 'store')}</div>
      <div class="card"><div class="head"><h2>Agenda de fechamentos</h2></div>
        <div class="list">${agenda.slice(0, 6).map(({ c, per }) => `<a class="li" href="${per.pendente ? '#/fechamento/' + per.pendente.id : '#/parceiro/' + c.id}"><div class="avatar">${iniciais(c.nome)}</div><div class="grow"><div class="t ellipsis">${esc(c.nome)}</div><div class="s">${esc(c.cidade)}</div></div>
          ${per.pendente ? badge('Enviado', 'warn') : badge(relDays(per.previsto), per.previsto < today() ? 'crit' : per.previsto <= addDays(today(), 3) ? 'info' : '')}</a>`).join('')}</div></div>
    </div>
    <div class="card mt"><div class="head"><h2>Garrafas por parceiro</h2><span class="muted small">clique para detalhar</span></div>${graficoParceiros(s)}</div>
    <div class="card mt"><div class="head"><h2>Onde está cada garrafa</h2><span class="muted small">clique num rótulo para ver onde está</span></div>
      ${legend([['Estoque central', 'var(--s1)'], ['Em consignação', 'var(--s2)']])}
      <div class="hbars">${sortBy(s.produtos.filter((p) => Math.max(0, est[p.id]) + sum(Object.values(cons), (m) => m[p.id] || 0) > 0), (p) => -(Math.max(0, est[p.id]) + sum(Object.values(cons), (m) => m[p.id] || 0))).map((p) => {
        const c1 = Math.max(0, est[p.id]), c2 = sum(Object.values(cons), (m) => m[p.id] || 0);
        return `<div class="hb click" data-act="ondeEsta" data-p="${p.id}" data-busca="${esc(p.nome)}" data-tip="${esc(`<b>${esc(p.nome)}</b><br>Central: ${c1}<br>Consignado: ${c2}<br>Clique para ver onde está`)}"><div class="ellipsis">${esc(p.nome)}</div>
          <div class="bar-t" style="display:flex;gap:2px;background:none"><i style="width:${(100 * c1) / maxQ}%;background:var(--s1);border-radius:0"></i><i style="width:${(100 * c2) / maxQ}%;background:var(--s2)"></i></div><div class="v">${c1 + c2}</div></div>`;
      }).join('')}</div></div>
  `);
}

// ---------- Ao vivo: vendas registradas pelos parceiros ----------
function periodoAoVivo(k) {
  const t = today();
  const dow = new Date().getDay(); // 0 = domingo
  if (k === 'ontem') return [addDays(t, -1), addDays(t, -1), 'Ontem'];
  if (k === '7d') return [addDays(t, -6), t, 'Últimos 7 dias'];
  if (k === 'fds') { const sexta = addDays(t, -((dow + 2) % 7)); return [sexta, addDays(sexta, 2) > t ? t : addDays(sexta, 2), 'Fim de semana (sex–dom)']; }
  if (k === 'mes') return [t.slice(0, 8) + '01', t, 'Este mês'];
  return [t, t, 'Hoje'];
}

function vAoVivo({ query }) {
  const s = S();
  const k = query.p || 'hoje';
  const [de, ate, nome] = periodoAoVivo(k);
  const r = D.resumoRede(s, de, ate);
  const ativos = s.clientes.filter((c) => c.ativo);
  const umDia = de === ate;
  const serie = umDia
    ? Array.from({ length: 14 }, (_, i) => i + 11).map((h) => ({ label: `${h}h`, value: r.porHora[h % 24] || 0 }))
    : (() => { const out = []; for (let d = de; d <= ate; d = addDays(d, 1)) out.push({ label: dateShort(d), value: r.porDia[d] || 0 }); return out; })();
  const semVenda = ativos.filter((c) => !r.porCliente.some((x) => x.clienteId === c.id));
  return shell('Ao vivo', `
    ${pageHead(`<span class="live"></span>Ao vivo · ${nome}`, `Vendas registradas pelos parceiros no app${umDia ? ' · ' + date(de) : ` · ${date(de)} a ${date(ate)}`}. Atualiza sozinho.`, busca('Buscar parceiro, rótulo, garçom…'))}
    <div class="seg mb" style="max-width:100%;overflow-x:auto">${[['hoje', 'Hoje'], ['ontem', 'Ontem'], ['fds', 'Fim de semana'], ['7d', '7 dias'], ['mes', 'Este mês']].map(([v, n]) => `<button class="${k === v ? 'on' : ''}" data-act="goto" data-h="#/aovivo?p=${v}">${n}</button>`).join('')}</div>
    <div class="grid g4">
      ${kpi('Garrafas vendidas', int(r.garrafas), `${r.vendas.length} lançamentos`)}
      ${kpi('Valor Mil Terras', money0(r.valor), 'a preço de tabela (a faturar no fechamento)')}
      ${kpi('Receita dos parceiros', money0(r.receita), 'pelos preços de carta')}
      ${kpi('Parceiros com venda', `${r.porCliente.length} de ${ativos.length}`, semVenda.length && semVenda.length <= 4 ? 'sem venda: ' + semVenda.map((c) => esc(c.nome)).join(', ') : semVenda.length ? `${semVenda.length} sem venda no período` : 'todos venderam')}
    </div>
    <div class="card mt"><div class="head"><h2>${umDia ? 'Garrafas por hora' : 'Garrafas por dia'}</h2></div>${chart({ type: 'columns', height: 200, data: serie, fmt: (v) => int(v) + ' gf', padL: 36 })}</div>
    <div class="grid g2 mt">
      <div class="card"><div class="head"><h2>Por parceiro</h2><span class="muted small">clique para ver o app dele</span></div>${r.porCliente.length ? hbars(r.porCliente.map((x) => { const c = D.cliente(s, x.clienteId); return { label: c?.nome || '—', value: x.valor, vtxt: `${x.qtd} gf · ${moneyK(x.valor)}`, sub: `Receita na carta: ${money0(x.receita)}`, attrs: `data-act="abrirApp" data-c="${x.clienteId}" data-busca="${esc(c?.nome || '')}"` }; }), money0, { color: 'var(--dourado)' }) : empty('Nenhuma venda registrada no período.')}</div>
      <div class="card"><div class="head"><h2>Rótulos mais vendidos</h2></div>${r.porProduto.length ? hbars(r.porProduto.map((x) => ({ label: D.produto(s, x.produtoId)?.nome, value: x.qtd, vtxt: `${x.qtd} gf · ${moneyK(x.valor)}`, attrs: `data-busca="${esc(D.produto(s, x.produtoId)?.nome)}"` })), (v) => int(v) + ' gf') : empty('—')}</div>
    </div>
    <div class="card pad-0 mt"><div style="padding:16px 16px 0"><h2>Últimas vendas</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Quando</th><th>Parceiro</th><th>Rótulo</th><th class="hide-m">Garçom</th><th class="r">Qtd.</th><th class="r">Valor</th></tr></thead>
      <tbody>${r.vendas.slice(0, 60).map((v) => { const c = D.cliente(s, v.clienteId); const p = D.produto(s, v.produtoId); const g = D.garcom(c, v.garcomId)?.nome || '—'; return `<tr data-busca="${esc(`${c?.nome} ${p?.nome} ${g}`)}"><td style="white-space:nowrap">${v.data === today() ? 'hoje' : dateShort(v.data)} ${v.hora || ''}</td><td>${esc(c?.nome || '—')}</td><td>${esc(p?.nome || '—')}</td><td class="hide-m">${esc(g)}</td><td class="r">${v.qtd}</td><td class="r">${money(v.qtd * v.preco)}</td></tr>`; }).join('') || `<tr><td colspan="6">${empty('Sem vendas no período')}</td></tr>`}</tbody></table></div></div>`);
}

// ---------- Estoque central ----------
function vEstoque({ query }) {
  const s = S();
  const cob = D.coberturaCentral(s);
  const movs = sortBy(s.movs.filter((m) => D.TIPOS_MOV[m.tipo].central !== 0), (m) => m.data + m.id, true).slice(0, 40);
  if (query.entrada) setTimeout(() => modalMov('entrada'), 0);
  const cmv = D.custosMedios(s);
  const totG = sum(cob, (x) => Math.max(0, x.estoque)), totC = sum(cob, (x) => Math.max(0, x.estoque) * cmv[x.produto.id]);
  return shell('Estoque central', `
    ${pageHead('Estoque central', `${plural(totG, 'garrafa')} · <b>${money(totC)}</b> a custo · ${money0(sum(cob, (x) => Math.max(0, x.estoque) * x.produto.preco))} a preço de tabela`, `${busca('Buscar rótulo…')}<button class="btn ghost" data-act="mov" data-t="ajuste">${icon('swap')} Ajuste</button><button class="btn ghost" data-act="mov" data-t="venda_direta">${icon('money')} Venda direta</button><button class="btn" data-act="mov" data-t="entrada">${icon('plus')} Entrada</button>`)}
    <div class="card pad-0"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Rótulo</th><th class="r">Saldo</th><th class="r hide-m">Mínimo</th><th class="r hide-m">Giro/mês</th><th class="r">Cobertura</th><th class="r hide-m">Custo médio</th><th class="r hide-m">Valor a custo</th></tr></thead>
      <tfoot><tr><td>Total</td><td class="r">${int(totG)}</td><td class="hide-m"></td><td class="hide-m"></td><td></td><td class="hide-m"></td><td class="r hide-m">${money0(totC)}</td></tr></tfoot>
      <tbody>${sortBy(cob, (x) => x.dias).map((x) => {
        const p = x.produto; const cm = cmv[p.id];
        const tone = x.estoque <= 0 ? 'crit' : x.dias < 20 ? 'crit' : x.dias < 45 || x.estoque < p.estoqueMin ? 'warn' : 'ok';
        return `<tr class="click" data-act="goto" data-h="#/produto/${p.id}" data-busca="${esc(p.nome + ' ' + p.tipo + ' ' + p.regiao + ' ' + p.uvas)}"><td><div class="row">${thumb(p, 'sm')}<div><div style="font-weight:500">${esc(p.nome)}</div><div class="tiny muted">${p.tipo} · ${esc(p.regiao)}</div></div></div></td>
          <td class="r"><b>${int(x.estoque)}</b></td><td class="r hide-m">${p.estoqueMin}</td><td class="r hide-m">${(x.giro * 30).toFixed(0)}</td>
          <td class="r">${badge(x.estoque <= 0 ? 'Esgotado' : x.dias === Infinity ? 'Sem giro' : Math.floor(x.dias) + ' dias', tone)}</td>
          <td class="r hide-m">${money(cm)}</td><td class="r hide-m">${money0(Math.max(0, x.estoque) * cm)}</td></tr>`;
      }).join('')}</tbody></table></div></div>
    <div class="tiny muted mt-s">Cobertura = saldo ÷ giro médio dos últimos 60 dias (vendas apuradas + vendas diretas). Alerta abaixo de 45 dias, tempo médio de uma importação.</div>
    <h2 class="mt">Movimentações recentes</h2>
    <div class="card pad-0 mt-s"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Tipo</th><th>Rótulo</th><th class="hide-m">Parceiro / obs.</th><th class="r">Qtd.</th></tr></thead>
      <tbody>${movs.map((m) => { const f = D.TIPOS_MOV[m.tipo].central; return `<tr data-busca="${esc(D.produto(s, m.produtoId).nome + ' ' + (m.clienteId ? D.cliente(s, m.clienteId)?.nome : '') + ' ' + (m.obs || '') + ' ' + D.TIPOS_MOV[m.tipo].label)}"><td>${dateShort(m.data)}</td><td>${badge(D.TIPOS_MOV[m.tipo].label.split(' (')[0], m.tipo === 'entrada' ? 'ok' : m.tipo === 'remessa' ? 'info' : m.tipo === 'perda' ? 'crit' : '')}</td>
        <td>${esc(D.produto(s, m.produtoId).nome)}</td><td class="hide-m small muted">${esc(m.clienteId ? D.cliente(s, m.clienteId).nome : m.obs || '')}</td><td class="r"><b class="${f * Math.sign(m.qtd) > 0 ? 'up' : 'down'}">${f * m.qtd > 0 ? '+' : ''}${f * m.qtd}</b></td></tr>`; }).join('')}</tbody></table></div></div>
  `);
}

function modalMov(tipo, snap = {}, onSalvo) {
  const s = S();
  const est = D.estoqueCentral(s);
  const titulo = { entrada: 'Entrada no estoque', venda_direta: 'Venda direta', ajuste: 'Ajuste de inventário', perda: 'Perda / quebra' }[tipo];
  modal({ title: titulo, wide: true, body: `
    <form id="fmov" class="col">
      <div class="grid g2"><label class="field"><span>Data</span><input class="input" type="date" name="data" value="${today()}"></label>
      <label class="field"><span>${tipo === 'entrada' ? 'Documento / importação' : 'Observação'}</span><input class="input" name="obs" placeholder="${tipo === 'entrada' ? 'Ex.: Importação Dieci Terre #3' : ''}"></label></div>
      ${tipo === 'ajuste' ? `<div class="seg"><button type="button" class="on" data-act="sinal" data-v="1">Adicionar</button><button type="button" data-act="sinal" data-v="-1">Remover</button></div><input type="hidden" name="sinal" value="1">` : ''}
      ${tipo === 'entrada' ? `<div class="row between"><span class="small muted">Informe a quantidade de cada rótulo recebido.</span><button type="button" class="btn ghost sm" data-act="novoRotuloMov">${icon('plus')} Cadastrar novo rótulo</button></div>` : ''}
      <div class="card pad-0"><div class="list" style="padding:0 14px">${s.produtos.filter((p) => p.ativo).map((p) => `<div class="li">${thumb(p, 'sm')}<div class="grow"><div class="t">${esc(p.nome)}</div><div class="s">Saldo ${est[p.id]}${tipo === 'entrada' ? '' : tipo === 'venda_direta' ? ` · tabela ${money(p.preco)}` : ''}</div></div>
        ${tipo === 'entrada' ? moneyInput('custo:' + p.id, p.custo, { width: 120, extra: 'title="Custo unitário"' }) : ''}
        ${tipo === 'venda_direta' ? moneyInput('preco:' + p.id, p.preco * 1.25, { width: 120, extra: 'title="Preço unitário"' }) : ''}
        ${stepper('q:' + p.id, 0, tipo === 'entrada' ? {} : { max: tipo === 'ajuste' ? 9999 : Math.max(0, est[p.id]) })}</div>`).join('')}</div></div>
      ${tipo === 'entrada' ? '<div class="tiny muted">Custo unitário por garrafa. Digite só os números (ex.: 25990 = R$ 259,90).</div>' : ''}
      ${tipo === 'entrada' ? `<label class="row small"><input type="checkbox" name="despesa" checked> Lançar o valor da compra no financeiro</label>` : ''}
    </form>`,
    foot: `<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="salvarMov">Registrar</button>`,
    handlers: {
      step: stepHandler,
      sinal: (el) => { el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); document.querySelector('[name=sinal]').value = el.dataset.v; },
      novoRotuloMov: () => { const sn = lerForm('fmov'); closeModal(); modalProduto(null, () => modalMov(tipo, sn, onSalvo), () => modalMov(tipo, sn, onSalvo)); },
      salvarMov: () => {
        const fd = new FormData(document.getElementById('fmov'));
        const itens = s.produtos.map((p) => ({ p, q: +fd.get('q:' + p.id) || 0 })).filter((x) => x.q > 0);
        if (!itens.length) return toast('Informe ao menos uma quantidade');
        const data = fd.get('data'), obs = fd.get('obs');
        const saida = tipo === 'venda_direta' || tipo === 'perda' || (tipo === 'ajuste' && +fd.get('sinal') < 0);
        const falta = saida && itens.find((x) => x.q > est[x.p.id]);
        if (falta) return toast(`${falta.p.nome}: só há ${Math.max(0, est[falta.p.id])} no estoque central`);
        if (tipo === 'ajuste' && String(obs).trim().length < 3) return toast('Informe o motivo do ajuste em Observação');
        let total = 0;
        store.commit((st) => {
          for (const { p, q } of itens) {
            if (tipo === 'entrada') { const cu = parseMoney(fd.get('custo:' + p.id)) || p.custo; total += cu * q; D.addMov(st, { data, tipo, produtoId: p.id, qtd: q, custoUnit: cu, obs }); }
            else if (tipo === 'venda_direta') { const pu = parseMoney(fd.get('preco:' + p.id)); total += pu * q; D.addMov(st, { data, tipo, produtoId: p.id, qtd: q, precoUnit: pu, obs }); }
            else if (tipo === 'ajuste') D.addMov(st, { data, tipo, produtoId: p.id, qtd: q * +fd.get('sinal'), obs: obs || 'Ajuste de inventário' });
            else D.addMov(st, { data, tipo, produtoId: p.id, qtd: q, obs });
          }
          if (tipo === 'entrada' && fd.get('despesa')) st.despesas.push({ id: uid('dp'), data, categoria: 'Compra de mercadoria', descricao: obs || 'Compra de vinhos', valor: Math.round(total * 100) / 100, pago: true });
        });
        closeModal(); toast(`${titulo} registrada: ${plural(sum(itens, (x) => x.q), 'garrafa')}`);
        if (onSalvo) return onSalvo();
        if (location.hash.includes('?')) location.hash = location.hash.split('?')[0];
      },
    } });
  aplicarForm('fmov', snap);
}

// ---------- Consignação ----------
function vConsignacao({ query }) {
  const s = S();
  const cons = D.consignado(s);
  const cls = s.clientes.filter((c) => c.ativo);
  const prods = s.produtos.filter((p) => cls.some((c) => (cons[c.id]?.[p.id] || 0) > 0));
  if (query.nova) setTimeout(() => modalRemessa(query.cliente), 0);
  const tot = (c) => sum(Object.values(cons[c.id] || {}));
  const val = (c) => sum(Object.entries(cons[c.id] || {}), ([pid, q]) => q * D.produto(s, pid).preco);
  const cm = D.custosMedios(s);
  const cus = (c) => sum(Object.entries(cons[c.id] || {}), ([pid, q]) => q * cm[pid]);
  return shell('Consignação', `
    ${pageHead('Estoque em terceiros', `${plural(sum(cls, tot), 'garrafa')} em consignação · <b>${money0(sum(cls, cus))}</b> a custo · ${money0(sum(cls, val))} a preço de tabela`, `${busca('Buscar parceiro…')}<button class="btn ghost" data-act="devolucao">${icon('swap')} Recolher</button><button class="btn" data-act="remessa">${icon('truck')} Nova remessa</button>`)}
    <div class="card"><div class="head"><h2>Garrafas por parceiro</h2><span class="muted small">clique para detalhar</span></div>${graficoParceiros(s)}</div>
    <h2 class="mt">Mapa da consignação</h2>
    <div class="card pad-0 mt-s"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Parceiro</th><th class="r">Garrafas</th><th class="r">A custo</th><th class="r">A venda</th>${prods.map((p) => `<th class="r" title="${esc(p.nome)}">${esc(p.nome.split(' ')[0])}</th>`).join('')}</tr></thead>
      <tbody>${cls.map((c) => `<tr class="click" data-act="consigDet" data-c="${c.id}" data-busca="${esc(c.nome + ' ' + c.cidade)}"><td style="white-space:nowrap">${esc(c.nome)}</td><td class="r"><b>${tot(c)}</b></td><td class="r" style="white-space:nowrap">${money0(cus(c))}</td><td class="r" style="white-space:nowrap">${money0(val(c))}</td>${prods.map((p) => { const q = cons[c.id]?.[p.id] || 0; return `<td class="r ${q ? '' : 'muted'}">${q || '·'}</td>`; }).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="r">${sum(cls, tot)}</td><td class="r" style="white-space:nowrap">${money0(sum(cls, cus))}</td><td class="r" style="white-space:nowrap">${money0(sum(cls, val))}</td>${prods.map((p) => `<td class="r">${sum(cls, (c) => cons[c.id]?.[p.id] || 0)}</td>`).join('')}</tr></tfoot></table></div></div>
  `);
}

function modalRemessa(cid, tipo = 'remessa', snap = {}) {
  const s = S();
  const est = D.estoqueCentral(s);
  if (!s.clientes.some((c) => c.ativo)) { toast('Cadastre o parceiro para continuar'); return novoParceiro((nid) => modalRemessa(nid, tipo)); }
  let sel = cid || snap.cliente || s.clientes.find((c) => c.ativo).id;
  const render = () => {
    const saldo = D.saldoCliente(s, sel);
    const recs = D.recomendacoes(s, sel, 3).map((r) => r.produtoId);
    const lista = tipo === 'remessa' ? sortBy(s.produtos.filter((p) => p.ativo), (p) => (saldo[p.id] ? 0 : recs.includes(p.id) ? 1 : 2)) : s.produtos.filter((p) => saldo[p.id] > 0);
    return `<form id="frem" class="col">
      <label class="field"><span>Parceiro</span><select class="input" name="cliente" data-onchange="cli">${s.clientes.filter((c) => c.ativo).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)} — ${esc(c.cidade)}</option>`).join('')}<option value="__novo">＋ Cadastrar novo parceiro…</option></select></label>
      ${tipo === 'remessa' ? `<div class="row between"><span class="small muted">Falta estoque de algum rótulo?</span><button type="button" class="btn ghost sm" data-act="entradaRem">${icon('plus')} Dar entrada no estoque</button></div>` : ''}
      <div class="card pad-0"><div class="list" style="padding:0 14px">${lista.map((p) => `<div class="li">${thumb(p, 'sm')}<div class="grow"><div class="t">${esc(p.nome)} ${recs.includes(p.id) && !saldo[p.id] && tipo === 'remessa' ? badge('Sugestão', 'opp') : ''}</div><div class="s">No parceiro: ${saldo[p.id] || 0} · central: ${est[p.id]}</div></div>${stepper('q:' + p.id, 0, { max: tipo === 'remessa' ? Math.max(0, est[p.id]) : saldo[p.id] })}</div>`).join('') || empty('Nada consignado neste parceiro.')}</div></div>
      ${tipo === 'remessa' ? `<label class="field"><span>Status da entrega</span><select class="input" name="status">${Object.entries(D.STATUS_ENTREGA).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span>Observação</span><input class="input" name="obs"></label></form>`;
  };
  const m = modal({ title: tipo === 'remessa' ? 'Nova remessa em consignação' : 'Recolher garrafas do parceiro', wide: true, body: render(),
    foot: `<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="ok">${tipo === 'remessa' ? 'Registrar remessa' : 'Registrar devolução'}</button>`,
    handlers: {
      step: stepHandler,
      cli: (el) => {
        if (el.value === '__novo') { const sn = lerForm('frem'); closeModal(); return novoParceiro((nid) => modalRemessa(nid, tipo, { ...sn, cliente: nid }), () => modalRemessa(sel, tipo, sn)); }
        sel = el.value; m.querySelector('.mb').innerHTML = render();
      },
      entradaRem: () => { const sn = lerForm('frem'); closeModal(); modalMov('entrada', {}, () => modalRemessa(sel, tipo, sn)); },
      ok: () => {
        const fd = new FormData(document.getElementById('frem'));
        const itens = s.produtos.map((p) => ({ p, q: +fd.get('q:' + p.id) || 0 })).filter((x) => x.q > 0);
        if (!itens.length) return toast('Informe ao menos uma quantidade');
        const saldoSel = D.saldoCliente(s, sel);
        const falta = itens.find((x) => x.q > (tipo === 'remessa' ? est[x.p.id] : saldoSel[x.p.id] || 0));
        if (falta) return toast(`${falta.p.nome}: só há ${Math.max(0, tipo === 'remessa' ? est[falta.p.id] : saldoSel[falta.p.id] || 0)} ${tipo === 'remessa' ? 'no estoque central' : 'no parceiro'}`);
        let rid;
        store.commit((st) => {
          if (tipo === 'remessa') rid = D.criarRemessa(st, { clienteId: sel, itens: itens.map((x) => ({ produtoId: x.p.id, qtd: x.q })), status: fd.get('status'), obs: fd.get('obs') });
          else for (const { p, q } of itens) D.addMov(st, { tipo, produtoId: p.id, qtd: q, clienteId: sel, obs: fd.get('obs') });
          D.cliente(st, sel).par ||= {};
        });
        closeModal(); toast(`${tipo === 'remessa' ? 'Remessa' : 'Devolução'} registrada`);
        if (tipo === 'remessa') confirmar('Deseja imprimir o romaneio desta remessa para o parceiro assinar?', { ok: 'Imprimir romaneio', titulo: 'Romaneio' }).then((y) => (location.hash = y ? `#/imprimir/romaneio/${sel}?r=${rid}` : '#/remessas'));
        else if (location.hash.includes('?')) location.hash = location.hash.split('?')[0];
      },
    } });
  aplicarForm('frem', snap);
}

// ---------- Remessas (kanban de entrega) ----------
function vRemessas({ query }) {
  const s = S();
  const todas = D.remessas(s);
  const cols = ['a_separar', 'separado', 'em_rota', 'entregue'];
  const entregues = todas.filter((r) => r.status === 'entregue').slice(0, +(query.mais || 8));
  const card = (r) => {
    const c = D.cliente(s, r.clienteId);
    const st = D.STATUS_ENTREGA[r.status];
    const dias = diffDays(today(), r.data);
    return `<div class="card kcard" data-busca="${esc((c?.nome || '') + ' ' + r.itens.map((i) => D.produto(s, i.produtoId)?.nome).join(' '))}">
      <div class="tiny" style="font-weight:600;letter-spacing:.04em;color:var(--dourado)">${esc(r.protocolo || '')}</div>
      <div class="row between"><b class="ellipsis">${esc(c?.nome || '—')}</b>${r.status !== 'entregue' && dias >= 2 ? badge(`${dias}d`, 'warn') : ''}</div>
      <div class="tiny muted">${date(r.data)} · ${r.ref?.startsWith('pd') ? 'pedido do parceiro' : r.ref ? 'reposição de fechamento' : esc(r.obs || 'remessa manual')}</div>
      <div class="small mt-s">${r.itens.map((i) => `${i.qtd}× ${esc(D.produto(s, i.produtoId).nome)}`).join('<br>')}</div>
      <div class="row between mt-s"><b>${plural(r.garrafas, 'garrafa')} · ${money(r.valor)}</b>${r.status === 'entregue' ? `<span class="tiny muted">${r.entregueEm ? date(r.entregueEm) : ''}${r.recebidoPor ? ' · ' + esc(r.recebidoPor) : ''}</span>` : ''}</div>
      <div class="row wrap gap-s mt-s">
        ${st.prox ? `<button class="btn sm" data-act="avancarRem" data-id="${r.id}" data-st="${st.prox}">${st.acao}</button>` : ''}
        <a class="btn ghost sm" href="#/imprimir/romaneio/${r.clienteId}?r=${r.id}" title="Romaneio">${icon('print')}</a>
        ${r.status === 'em_rota' || r.status === 'separado' ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${waLink(c?.telefone, `Olá ${(c?.contato || '').split(' ')[0]}! Sua reposição Mil Terras (${r.garrafas} garrafas) ${r.status === 'em_rota' ? 'saiu para entrega' : 'está separada e sai em breve'}. 🍷`)}" title="Avisar no WhatsApp">${icon('whatsapp')}</a>` : ''}
        ${r.status !== 'entregue' && r.status !== 'a_separar' ? `<button class="btn ghost sm" data-act="voltarRem" data-id="${r.id}" data-st="${cols[cols.indexOf(r.status) - 1]}" title="Voltar etapa">${icon('arrowL')}</button>` : ''}
      </div></div>`;
  };
  const peds = D.pedidos(s).filter((p) => p.status === 'solicitado');
  const fechs = s.fechamentos.filter((f) => f.status === 'enviado' && (f.reposicao || []).length);
  const cardSol = (titulo, sub, itens, acoes) => `<div class="card kcard" data-busca="${esc(titulo + ' ' + itens.map((i) => D.produto(s, i.produtoId)?.nome).join(' '))}"><b class="ellipsis">${titulo}</b><div class="tiny muted">${sub}</div>
      <div class="small mt-s">${itens.map((i) => `${i.qtd}× ${esc(D.produto(s, i.produtoId)?.nome)}`).join('<br>')}</div>
      <div class="mt-s"><b>${plural(sum(itens, (i) => i.qtd), 'garrafa')} · ${money(D.valorItens(s, itens))}</b></div><div class="row wrap gap-s mt-s">${acoes}</div></div>`;
  const solicitado = [
    ...peds.map((p) => cardSol(esc(D.cliente(s, p.clienteId)?.nome || '—'), `${date(p.data)} · pedido pelo app${p.obs ? ' · ' + esc(p.obs) : ''}`, p.itens,
      `<button class="btn sm ok" data-act="aprovarPedido" data-id="${p.id}">Aprovar</button><button class="btn ghost sm" data-act="recusarPedido" data-id="${p.id}">Recusar</button>`)),
    ...fechs.map((f) => cardSol(esc(D.cliente(s, f.clienteId)?.nome || '—'), `${date(f.fim)} · reposição do fechamento`, f.reposicao,
      `<a class="btn sm" href="#/fechamento/${f.id}">Conferir fechamento</a>`)),
  ];
  const totSol = [...peds.flatMap((p) => p.itens), ...fechs.flatMap((f) => f.reposicao)];
  return shell('Remessas', `
    ${pageHead('Remessas', 'Pedidos, separação e entrega das garrafas aos parceiros', `${busca('Buscar parceiro ou rótulo…')}<button class="btn" data-act="remessa">${icon('plus')} Nova remessa</button>`)}
    <div class="kanban k5"><div class="kcol"><div class="khead">${badge('Solicitado', 'warn')}<span class="small muted">${money0(D.valorItens(s, totSol))}</span></div>${solicitado.join('') || '<div class="empty small">Nenhum pedido</div>'}</div>${cols.map((k) => { const xs = k === 'entregue' ? entregues : todas.filter((r) => r.status === k); return `<div class="kcol"><div class="khead">${badge(D.STATUS_ENTREGA[k].label, D.STATUS_ENTREGA[k].tone)}<span class="small muted">${k === 'entregue' ? 'recentes' : `${plural(sum(xs, (r) => r.garrafas), 'garrafa')} · ${money0(sum(xs, (r) => r.valor))}`}</span></div>
      ${xs.map(card).join('') || '<div class="empty small">Nada aqui</div>'}
      ${k === 'entregue' && todas.filter((r) => r.status === 'entregue').length > entregues.length ? `<button class="btn ghost sm block" data-act="goto" data-h="#/remessas?mais=${entregues.length + 20}">Ver mais</button>` : ''}</div>`; }).join('')}</div>
    <div class="tiny muted mt">O estoque central baixa quando a remessa é criada. As garrafas só entram no saldo do parceiro (e na contagem do fechamento) quando a remessa é marcada como <b>Entregue</b>.</div>`);
}

// ---------- Parceiros ----------
function vParceiros() {
  const s = S();
  const rank = D.rankingClientes(s, 90);
  return shell('Parceiros', `
    ${pageHead('Parceiros', `${s.clientes.filter((c) => c.ativo).length} estabelecimentos ativos`, `${busca('Buscar parceiro…')}<button class="btn" data-act="editCliente">${icon('plus')} Novo parceiro</button>`)}
    <div class="card pad-0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Parceiro</th><th class="hide-m">Cidade</th><th class="r">Receita 90d</th><th class="r hide-m">Garrafas 90d</th><th class="r hide-m">Consignado</th><th class="r hide-m">Giro</th><th>Próx. fechamento</th><th></th></tr></thead>
    <tbody>${rank.map((x) => { const c = x.cliente; const per = D.periodoAtual(s, c.id); return `<tr class="click" data-act="goto" data-h="#/parceiro/${c.id}" data-busca="${esc(c.nome + ' ' + c.cidade + ' ' + c.codigo + ' ' + (c.contato || ''))}">
      <td><div class="row"><div class="avatar">${iniciais(c.nome)}</div><div><div style="font-weight:500">${esc(c.nome)}</div><div class="tiny muted">${c.tipo} · desde ${date(c.desde)}</div></div></div></td>
      <td class="hide-m">${esc(c.cidade)}</td><td class="r"><b>${money0(x.receita)}</b></td><td class="r hide-m">${x.garrafas}</td><td class="r hide-m">${x.garrafasConsig} gf · ${moneyK(x.emConsig)}</td><td class="r hide-m">${x.giro.toFixed(1)}×</td>
      <td>${per.pendente ? badge('Enviado — conferir', 'warn') : badge(date(per.previsto), per.previsto < today() ? 'crit' : '')}</td><td class="r" onclick="event.stopPropagation()">${verApp(c.id)}</td></tr>`; }).join('')}</tbody></table></div></div>
    <div class="tiny muted mt-s">Giro = garrafas vendidas em 90 dias ÷ garrafas hoje em consignação. Quanto maior, melhor o retorno do estoque deixado no parceiro.</div>
  `);
}

function vParceiro({ id, query }) {
  const s = S();
  const c = D.cliente(s, id);
  if (!c) return shell('Parceiro', empty('Parceiro não encontrado'));
  const tab = query.tab || 'visao';
  const per = D.periodoAtual(s, id);
  const saldo = D.saldoCliente(s, id);
  const estm = D.saldoEstimado(s, id);
  const fs = D.fechamentosDe(s, id).reverse();
  const desde = addDays(today(), -90);
  const rv = D.resumoVendas(s, id, desde);
  const recs = D.recomendacoes(s, id, 3);
  const rec90 = sum(fs.filter((f) => f.fim > desde), (f) => f.total);
  const cr = D.contasReceber(s).filter((f) => f.clienteId === id);
  const cmP = D.custosMedios(s);
  const tabs = [['visao', 'Visão geral'], ['estoque', 'Consignado'], ['fechamentos', 'Fechamentos'], ['equipe', 'Equipe e vendas'], ['cadastro', 'Cadastro']];
  let body = '';
  if (tab === 'visao') {
    const serie = fs.slice(0, 10).reverse();
    body = `<div class="grid g4">
      ${kpi('Receita 90 dias', money0(rec90), `${sum(fs.filter((f) => f.fim > desde), (f) => f.garrafas)} garrafas`)}
      ${kpi('Em consignação', `${sum(Object.values(saldo))} gf`, `${money0(sum(Object.entries(saldo), ([p, q]) => q * cmP[p]))} a custo · ${money0(sum(Object.entries(saldo), ([p, q]) => q * D.produto(s, p).preco))} venda`)}
      ${kpi('A receber', money0(sum(cr, (f) => f.total)), cr.some((f) => f.atraso) ? `<b class="down">vencido há ${Math.max(...cr.map((f) => f.atraso))} dias</b>` : cr.length ? 'em dia' : 'nada em aberto')}
      ${kpi('Período atual', per.pendente ? 'Enviado' : relDays(per.previsto), per.pendente ? 'aguardando sua conferência' : `fechamento em ${date(per.previsto)}`)}
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="head"><h2>Faturamento por fechamento</h2></div>${serie.length ? chart({ type: 'columns', height: 200, data: serie.map((f) => ({ label: dateShort(f.fim), value: f.total, tip: `<b>${date(f.inicio)} a ${date(f.fim)}</b><br>${money(f.total)} · ${f.garrafas} garrafas` })), fmt: money0, fmtAxis: moneyK }) : empty('Ainda sem fechamentos')}</div>
      <div class="card"><div class="head"><h2>Rótulos mais vendidos</h2><span class="muted small">registrados no app · 90d</span></div>${rv.porProduto.length ? hbars(rv.porProduto.slice(0, 6).map((x) => ({ label: D.produto(s, x.produtoId).nome, value: x.qtd })), (v) => int(v) + ' gf') : empty('Sem vendas registradas')}</div>
    </div>
    <div class="card mt"><div class="head"><h2>${icon('spark')} Oportunidades para este parceiro</h2></div>
      ${recs.length ? `<div class="grid g3">${recs.map((r) => { const p = D.produto(s, r.produtoId); return `<div class="row">${thumb(p)}<div><div style="font-weight:600">${esc(p.nome)}</div><div class="small muted">~${r.mes.toFixed(0)} garrafas/mês em parceiros parecidos</div><a class="small" href="#/consignacao?nova=1&cliente=${c.id}">Enviar amostra →</a></div></div>`; }).join('')}</div>` : '<div class="muted small">Este parceiro já trabalha com todos os rótulos que giram bem na rede.</div>'}</div>`;
  }
  if (tab === 'estoque') {
    body = `<div class="row between wrap mb"><div class="small muted">Saldo oficial (último fechamento + remessas entregues) e estimativa atual (descontando vendas lançadas no app). Valor a custo.</div>
      <div class="row wrap"><a class="btn ghost sm" href="#/imprimir/romaneio/${c.id}">${icon('print')} Romaneio</a><button class="btn ghost sm" data-act="consigDet" data-c="${c.id}">${icon('edit')} Baixar / corrigir</button><button class="btn ghost sm" data-act="devolucao" data-c="${c.id}">Recolher</button><button class="btn sm" data-act="remessa" data-c="${c.id}">${icon('truck')} Remessa</button></div></div>
      <div class="card pad-0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rótulo</th><th class="r">Saldo oficial</th><th class="r">Estimado hoje</th><th class="r">Venda/quinzena</th><th class="r hide-m">Valor a custo</th></tr></thead>
      <tbody>${Object.entries(saldo).filter(([, q]) => q > 0).map(([pid, q]) => { const p = D.produto(s, pid); const r = D.taxaDiaria(s, id, pid) * c.cicloDias; return `<tr><td><div class="row">${thumb(p, 'sm')}${esc(p.nome)}</div></td><td class="r">${q}</td><td class="r">${qtdBadge(estm[pid] ?? 0)}</td><td class="r">${r.toFixed(1).replace('.', ',')}</td><td class="r hide-m">${money(q * cmP[pid])}</td></tr>`; }).join('')}</tbody></table></div></div>
      <h2 class="mt">Lotes (remessas entregues)</h2>
      <div class="card pad-0 mt-s"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Protocolo</th><th>Entregue</th><th>Vence</th><th class="r">Enviado</th><th class="r">Restam</th><th class="r">A acertar</th><th>Situação</th></tr></thead>
      <tbody>${D.lotes(s, id).reverse().slice(0, 30).map((l) => `<tr><td><a href="#/imprimir/romaneio/${id}?r=${l.id}">${esc(l.protocolo)}</a></td><td>${date(l.entregueEm)}</td><td>${l.aberto ? date(l.vence) : '—'}</td><td class="r">${l.enviado}</td><td class="r">${l.restante}</td><td class="r">${l.pendente ? `${l.pendente} · ${money(l.valorPendente)}` : '—'}</td><td>${badge(D.SITUACAO_LOTE[l.situacao].label, D.SITUACAO_LOTE[l.situacao].tone)}</td></tr>`).join('')}</tbody></table></div></div>
      <h2 class="mt">Movimentações do parceiro</h2>
      <div class="card pad-0 mt-s"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Tipo</th><th>Rótulo</th><th class="r">Qtd.</th><th>Justificativa / obs.</th></tr></thead>
      <tbody>${sortBy(s.movs.filter((m) => m.clienteId === id), (m) => m.data + m.id, true).slice(0, 40).map((m) => { const f = D.TIPOS_MOV[m.tipo].cliente; const pend = m.tipo === 'remessa' && m.entrega && m.entrega !== 'entregue'; return `<tr><td>${dateShort(m.data)}</td><td>${badge(D.TIPOS_MOV[m.tipo].label, m.tipo === 'ajuste_parceiro' ? 'warn' : m.tipo === 'remessa' ? 'info' : '')} ${pend ? badge(D.STATUS_ENTREGA[m.entrega].label, D.STATUS_ENTREGA[m.entrega].tone) : ''}</td><td>${esc(D.produto(s, m.produtoId).nome)}</td><td class="r"><b>${f * m.qtd > 0 ? '+' : ''}${f * m.qtd}</b></td><td class="small muted">${esc(m.obs || '')}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  if (tab === 'fechamentos') {
    body = `<div class="row between mb"><div class="small muted">${fs.length} fechamentos</div><a class="btn sm" href="#/novo-fechamento/${c.id}">${icon('plus')} Fazer fechamento</a></div>${tabelaFechamentos(s, fs)}`;
  }
  if (tab === 'equipe') {
    const gs = c.garcons;
    body = `<div class="grid g2"><div class="card"><div class="head"><h2>Vendas por garçom</h2><span class="muted small">90 dias</span></div>
      ${hbars(rv.porGarcom.map((x) => ({ label: D.garcom(c, x.garcomId)?.nome || 'Sem garçom', value: x.qtd, sub: money(x.receita) + ' na carta' })), (v) => int(v) + ' gf', { color: 'var(--dourado)' })}</div>
      <div class="card"><div class="head"><h2>Margem do parceiro</h2><span class="muted small">90 dias, vendas lançadas</span></div>
        <div class="grid g2"><div class="kpi"><div class="label">Receita na carta</div><div class="v">${moneyK(rv.receita)}</div></div><div class="kpi"><div class="label">Lucro do parceiro</div><div class="v">${moneyK(rv.receita - rv.custo)}</div><div class="d">${percent(rv.receita ? (rv.receita - rv.custo) / rv.receita : 0)} de margem</div></div></div>
        <div class="small muted mt">Argumento comercial: mostre ao parceiro quanto ele lucrou com a Mil Terras sem investir em estoque.</div></div></div>
      <div class="card mt"><div class="head"><h2>Equipe cadastrada</h2></div><div class="chips">${gs.map((g) => `<span class="chip">${esc(g.nome)}</span>`).join('')}</div></div>`;
  }
  if (tab === 'cadastro') body = formCliente(c);
  return shell(c.nome, `
    <div class="pagehead"><div class="row"><div class="avatar" style="width:52px;height:52px;font-size:18px">${iniciais(c.nome)}</div><div><h1>${esc(c.nome)}</h1><div class="sub">${c.tipo} · ${esc(c.cidade)} · ${esc(c.contato)} · ${esc(c.telefone)}</div></div></div>
      <div class="row wrap"><a class="btn ghost" target="_blank" rel="noopener" href="${waLink(c.telefone, `Olá ${c.contato.split(' ')[0]}, tudo bem? Aqui é da Mil Terras.`)}">${icon('whatsapp')} WhatsApp</a>${verApp(c.id, 'btn ghost')}<a class="btn" href="#/novo-fechamento/${c.id}">${icon('receipt')} Fechamento</a></div></div>
    <div class="seg mb" style="overflow-x:auto;max-width:100%">${tabs.map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-act="goto" data-h="#/parceiro/${id}?tab=${k}">${n}</button>`).join('')}</div>
    ${body}`, { back: true });
}

// Código de acesso aleatório e único (sem letras/números que confundem: 0/O, 1/I)
function gerarCodigo() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const usados = new Set((S()?.clientes || []).map((c) => c.codigo));
  let cod;
  do { cod = 'MT' + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (usados.has(cod));
  return cod;
}

function formCliente(c = {}) {
  const novo = !c.id;
  return `<form id="fcli" class="card col" data-onsubmit="salvarCliente" data-id="${c.id || ''}">
    <div class="grid g2">
      <label class="field"><span>Nome do estabelecimento</span><input class="input" name="nome" required value="${esc(c.nome)}"></label>
      <label class="field"><span>Tipo</span><select class="input" name="tipo">${['Restaurante', 'Bar', 'Loja', 'Hotel', 'Outro'].map((t) => `<option ${c.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Cidade</span><input class="input" name="cidade" value="${esc(c.cidade)}"></label>
      <label class="field"><span>Região</span><select class="input" name="regiao">${['Serra Gaúcha', 'Porto Alegre e Região Metropolitana', 'Outra'].map((t) => `<option ${c.regiao === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Contato</span><input class="input" name="contato" value="${esc(c.contato)}"></label>
      <label class="field"><span>WhatsApp</span><input class="input" name="telefone" inputmode="tel" value="${esc(c.telefone)}"></label>
      <label class="field"><span>E-mail</span><input class="input" name="email" type="email" value="${esc(c.email)}"></label>
      <label class="field"><span>CNPJ</span><input class="input" name="cnpj" value="${esc(c.cnpj)}"></label>
      <label class="field"><span>Ciclo de fechamento (dias)</span><input class="input" name="cicloDias" type="number" value="${c.cicloDias || 15}"></label>
      <label class="field"><span>Prazo de pagamento (dias)</span><input class="input" name="prazoDias" type="number" value="${c.prazoDias ?? 7}"></label>
    </div>
    <div class="field"><span>Formas de pagamento liberadas</span><div class="chips">${D.FORMAS_PAGAMENTO.map((f) => `<label class="chip"><input type="checkbox" name="forma" value="${f}" ${(c.formasPagamento || ['PIX']).includes(f) ? 'checked' : ''}> ${f}</label>`).join('')}</div></div>
    <div class="grid g2">
      <label class="field"><span>Garçons / equipe (separados por vírgula)</span><input class="input" name="garcons" value="${esc((c.garcons || []).filter((g) => g.ativo).map((g) => g.nome).join(', '))}"></label>
      <div class="grid g2"><label class="field"><span>Código de acesso (automático)</span><div class="row gap-s"><input class="input" name="codigo" value="${esc(c.codigo || gerarCodigo())}" readonly style="font-weight:600;letter-spacing:.06em"><button type="button" class="iconbtn" data-act="novoCodigo" title="Gerar outro código">${icon('refresh')}</button></div></label><label class="field"><span>PIN (4 dígitos)</span><input class="input" name="pin" inputmode="numeric" maxlength="4" value="${esc(c.pin || String(Math.floor(1000 + Math.random() * 9000)))}"></label></div>
    </div>
    <div class="row between wrap">${novo ? '<span></span>' : `<label class="row small"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> Parceiro ativo</label>`}<button class="btn">${novo ? 'Cadastrar parceiro' : 'Salvar alterações'}</button></div>
  </form>`;
}

// ---------- Fechamentos ----------
function tabelaFechamentos(s, fs, comCliente = false) {
  if (!fs.length) return empty('Nenhum fechamento', 'receipt');
  return `<div class="card pad-0"><div class="tbl-wrap"><table class="tbl"><thead><tr>${comCliente ? '<th>Parceiro</th>' : ''}<th>Período</th><th class="r">Garrafas</th><th class="r">Valor</th><th class="hide-m">Pagamento</th><th>Status</th></tr></thead>
    <tbody>${fs.map((f) => `<tr class="click" data-act="goto" data-h="#/fechamento/${f.id}" data-busca="${esc(D.cliente(s, f.clienteId)?.nome + ' ' + (f.formaPagamento || '') + ' ' + D.STATUS_FECH[f.status].label + ' ' + date(f.fim))}">${comCliente ? `<td>${esc(D.cliente(s, f.clienteId).nome)}</td>` : ''}<td style="white-space:nowrap">${dateShort(f.inicio)} – ${dateShort(f.fim)}</td><td class="r">${f.garrafas}</td><td class="r"><b>${money(f.total)}</b></td><td class="hide-m small">${esc(f.formaPagamento || '')}${f.vencimento && f.status === 'aprovado' ? ` · vence ${dateShort(f.vencimento)}` : ''}</td><td>${statusBadge(f)} ${f.ajustes ? badge(`${f.ajustes} ajuste${f.ajustes > 1 ? 's' : ''}`, 'warn') : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function vFechamentos({ query }) {
  const s = S();
  const filtro = query.f || 'todos';
  const all = sortBy(s.fechamentos, (f) => f.fim + f.id, true);
  const fs = filtro === 'todos' ? all : all.filter((f) => f.status === filtro);
  const n = (st) => s.fechamentos.filter((f) => f.status === st).length;
  return shell('Fechamentos', `
    ${pageHead('Fechamentos', 'Acertos periódicos com os parceiros', `${busca('Buscar parceiro…')}<button class="btn" data-act="novoFech">${icon('plus')} Fazer fechamento</button>`)}
    ${(() => { const ag = D.agendaFechamentos(s); return ag.length ? `<div class="card mb"><div class="head"><h2>Agenda dos próximos fechamentos</h2><span class="small muted">período do parceiro ou lote que vence primeiro</span></div>
      <div class="list">${ag.map((x) => `<a class="li" href="${x.per.pendente ? '#/fechamento/' + x.per.pendente.id : '#/parceiro/' + x.c.id + '?tab=estoque'}" data-busca="${esc(x.c.nome)}"><div class="avatar">${iniciais(x.c.nome)}</div>
        <div class="grow"><div class="t">${esc(x.c.nome)}</div><div class="s">${x.per.pendente ? 'Fechamento enviado — aguardando sua conferência' : `${plural(x.lotes.length, 'lote aberto', 'lotes abertos')}${x.vencidos.length ? ` · <b style="color:var(--crit)">${x.vencidos.length} vencido(s)</b>` : ''}${x.vencendo.length ? ` · ${x.vencendo.length} vencendo` : ''} · estimado ${money0(x.estimado)}`}</div></div>
        ${x.per.pendente ? badge('Enviado', 'warn') : badge(x.dias < 0 ? `atrasado ${-x.dias}d` : x.dias === 0 ? 'hoje' : `${date(x.data)} · ${x.dias}d`, x.dias < 0 ? 'crit' : x.dias <= 3 ? 'warn' : '')}</a>`).join('')}</div></div>` : ''; })()}
    <div class="seg mb">${[['todos', 'Todos'], ['enviado', `Para conferir (${n('enviado')})`], ['aprovado', `A receber (${n('aprovado')})`], ['pago', 'Pagos']].map(([k, l]) => `<button class="${filtro === k ? 'on' : ''}" data-act="goto" data-h="#/fechamentos?f=${k}">${l}</button>`).join('')}</div>
    ${tabelaFechamentos(s, fs.slice(0, 80), true)}`);
}

function vFechamento({ id }) {
  const s = S();
  const f = s.fechamentos.find((x) => x.id === id);
  if (!f) return shell('Fechamento', empty('Fechamento não encontrado'));
  const c = D.cliente(s, f.clienteId);
  const est = D.estoqueCentral(s);
  const reg = sum(f.itens, (i) => i.registrado);
  const repo = f.status === 'enviado' ? f.reposicao : f.reposicaoEnviada || [];
  const txt = `*Mil Terras · Fechamento*\n${c.nome}\nPeríodo: ${date(f.inicio)} a ${date(f.fim)}\n\n${f.itens.filter((i) => i.vendido).map((i) => `${i.vendido}× ${D.produto(s, i.produtoId).nome} — ${money(i.valor)}`).join('\n')}\n\n*Total: ${money(f.total)}*\nPagamento: ${f.formaPagamento}${f.vencimento ? ` até ${date(f.vencimento)}` : ''}\n\nObrigado pela parceria! 🍷`;
  return shell('Fechamento', `
    <div class="pagehead"><div><div class="label">${esc(c.nome)}</div><h1 style="margin-top:4px">${f.numero ? esc(f.numero) + ' · ' : ''}Fechamento ${date(f.inicio)} – ${date(f.fim)}</h1>
      <div class="sub row gap-s wrap">${statusBadge(f)} <span>Feito por ${f.criadoPor === 'cliente' ? 'parceiro, pelo app' : 'Mil Terras'}</span>${f.aprovadoEm ? `<span>· conferido ${date(f.aprovadoEm)}</span>` : ''}${f.pagoEm ? `<span>· pago ${date(f.pagoEm)}</span>` : ''}</div></div>
      <div class="row wrap"><a class="btn ghost" href="#/imprimir/fechamento/${f.id}">${icon('print')} Relatório</a><a class="btn ghost" target="_blank" rel="noopener" href="${waLink(c.telefone, txt)}">${icon('whatsapp')} Enviar</a>
      ${f.status === 'enviado' ? `<button class="btn ok" data-act="aprovar" data-id="${f.id}">${icon('check')} Conferir e aprovar</button>` : ''}
      ${f.status === 'aprovado' ? `<button class="btn ok" data-act="pagar" data-id="${f.id}">${icon('money')} Registrar pagamento</button>` : ''}</div></div>
    <div class="grid g4">${kpi('A pagar', money(f.total), `${f.garrafas} garrafas acertadas${f.naoAcertado ? ` · ${f.naoAcertado} para depois` : ''}`)}
      <div class="card kpi"><div class="label">Forma de pagamento</div>${f.status === 'pago' ? `<div class="v">${esc(f.formaPagamento || '—')}</div>` : `<select class="input" data-onchange="formaFech" data-id="${f.id}" style="font-weight:600">${[...new Set([...c.formasPagamento, ...D.FORMAS_PAGAMENTO])].map((x) => `<option ${x === f.formaPagamento ? 'selected' : ''}>${x}${c.formasPagamento.includes(x) ? '' : ' (fora do cadastro)'}</option>`).join('')}</select>`}<div class="d">${f.vencimento ? `vence ${date(f.vencimento)}` : `prazo ${c.prazoDias} dias após aprovação`}</div></div>
      ${kpi('Ajustes de contagem', f.ajustes ? `<span style="color:var(--warn)">${f.ajustes}</span>` : '0', f.ajustes ? 'com justificativa do parceiro' : `${f.garrafas ? Math.round((100 * reg) / f.garrafas) : 100}% das vendas lançadas no app`)}
      ${kpi('Reposição', plural(sum(repo, (r) => r.qtd), 'garrafa'), f.status === 'enviado' ? 'solicitada' : f.remessaId ? `<a href="#/remessas">${(D.remessas(s).find((r) => r.id === f.remessaId) || {}).status ? D.STATUS_ENTREGA[D.remessas(s).find((r) => r.id === f.remessaId).status].label : 'enviada'}</a>` : 'enviada')}</div>
    ${ajustesHTML(s, f)}
    ${acertosHTML(s, f)}
    ${f.obs ? `<div class="card mt" style="border-left:3px solid var(--dourado)"><div class="label">Observação do parceiro</div><div class="mt-s">${esc(f.obs)}</div></div>` : ''}
    <div class="grid g2 mt">
      <div class="card pad-0"><div style="padding:16px 16px 0"><h2>Vendas apuradas</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rótulo</th><th class="r">Saldo</th><th class="r">Esperado</th><th class="r">Contado</th><th class="r">Vendido</th><th class="r">Valor</th></tr></thead>
        <tbody>${f.itens.map((i) => { const d = i.vendido - i.registrado; const aj = i.esperado !== undefined && i.contagem !== i.esperado; return `<tr><td>${esc(D.produto(s, i.produtoId).nome)}${aj ? `<div class="tiny" style="color:var(--warn)">contagem ajustada (ver justificativa)</div>` : ''}${d > 0 ? `<div class="tiny" style="color:var(--warn)">${d} sem lançamento no app</div>` : d < 0 ? `<div class="tiny" style="color:var(--crit)">${-d} lançadas a mais que o contado</div>` : ''}</td><td class="r">${i.saldoAnterior}</td><td class="r">${i.esperado ?? '—'}</td><td class="r" style="${aj ? 'color:var(--warn);font-weight:700' : ''}">${i.contagem}</td><td class="r"><b>${i.vendido}</b></td><td class="r">${money(i.valor)}</td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="4">Total</td><td class="r">${f.garrafas}</td><td class="r">${money(f.total)}</td></tr></tfoot></table></div></div>
      <div class="card pad-0"><div style="padding:16px 16px 0"><h2>Reposição ${f.status === 'enviado' ? 'solicitada' : 'enviada'}</h2></div>
        ${repo.length ? `<form id="frepo"><div class="list" style="padding:0 16px">${repo.map((r) => { const p = D.produto(s, r.produtoId); const novo = !f.itens.some((i) => i.produtoId === r.produtoId); return `<div class="li">${thumb(p, 'sm')}<div class="grow"><div class="t">${esc(p.nome)} ${novo ? badge('Novo rótulo', 'opp') : ''}</div><div class="s">Central: ${est[p.id]}${f.status === 'enviado' && est[p.id] < r.qtd ? ' · <span style="color:var(--crit)">insuficiente</span>' : ''}</div></div>${f.status === 'enviado' ? stepper('r:' + p.id, Math.min(r.qtd, Math.max(0, est[p.id])), { max: Math.max(0, est[p.id]) }) : `<b>${r.qtd}</b>`}</div>`; }).join('')}</div></form>` : `<div style="padding:16px">${empty('Sem reposição', 'truck')}</div>`}</div>
    </div>`, { back: true });
}

function vNovoFechamento({ cid }) {
  const s = S();
  if (!wz || wz.cid !== cid) wz = novoWizard(s, cid);
  const c = D.cliente(s, cid);
  handlers = wizardHandlers(wz, rerender, store.commit, (f, aprovado) => {
    wz = null;
    toast(aprovado ? `Fechamento aprovado: ${money(f.total)}` : 'Fechamento salvo para conferência');
    if (f.avisos?.length) setTimeout(() => toast(f.avisos[0]), 2900);
    location.hash = `#/fechamento/${f.id}`;
  }, 'gestor', toast, S);
  const per = D.periodoAtual(s, cid);
  if (per.pendente) return shell('Fechamento', `${pageHead(esc(c.nome))}<div class="card">${empty(`Já existe um fechamento enviado por este parceiro aguardando conferência.<br><a href="#/fechamento/${per.pendente.id}">Abrir fechamento</a>`, 'inbox')}</div>`, { back: true });
  return shell('Fechamento', `<div class="label">${esc(c.nome)}</div><div style="max-width:760px">${renderWizard(s, wz, { modo: 'gestor' })}</div>`, { back: true });
}
let wz = null;

// ---------- Financeiro ----------
const nomeMes = (k) => { const [y, m] = k.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
const mesMais = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const segFin = (v) => `<div class="seg"><button class="${v === 'mes' ? 'on' : ''}" data-act="goto" data-h="#/financeiro">Balanço do mês</button><button class="${v === 'periodo' ? 'on' : ''}" data-act="goto" data-h="#/financeiro?v=periodo">Comparativo</button></div>`;

function vFinanceiro({ query }) {
  if (query.v === 'periodo') return vFinanceiroPeriodo({ query });
  const s = S();
  const mes = query.mes || today().slice(0, 7);
  const b = D.balancoMes(s, mes);
  const linha = (n, v, forte, neg) => `<tr><td style="${forte ? 'font-weight:600' : ''}">${n}</td><td class="r" style="white-space:nowrap;${forte ? 'font-weight:600' : ''}${v < 0 ? ';color:var(--crit)' : ''}">${(neg && v) || v < 0 ? '− ' : ''}${money(Math.abs(v))}</td></tr>`;
  return shell('Financeiro', `
    ${pageHead('Financeiro', 'Balanço mensal de receitas e despesas', `${segFin('mes')}${busca('Buscar lançamento…')}<button class="btn ghost" data-act="csvMes" data-m="${mes}">${icon('download')} CSV do mês</button><button class="btn" data-act="despesa">${icon('plus')} Despesa</button>`)}
    <div class="row between mb"><button class="btn ghost sm" data-act="goto" data-h="#/financeiro?mes=${mesMais(mes, -1)}">${icon('arrowL')} ${nomeMes(mesMais(mes, -1))}</button>
      <h2>${nomeMes(mes)}</h2>
      <button class="btn ghost sm" data-act="goto" data-h="#/financeiro?mes=${mesMais(mes, 1)}" ${mes >= today().slice(0, 7) ? 'disabled' : ''}>${nomeMes(mesMais(mes, 1))} ${icon('arrowR')}</button></div>
    <div class="grid g4">
      ${kpi('Receitas', money0(b.receita), `${plural(b.garrafas, 'garrafa vendida', 'garrafas vendidas')}`)}
      ${kpi('Despesas', money0(b.operacionais + b.compras), `${money0(b.operacionais)} operacionais · ${money0(b.compras)} compras`)}
      ${kpi('Resultado do mês', `<span class="${b.resultado >= 0 ? 'up' : 'down'}">${money0(b.resultado)}</span>`, `receitas − custo dos vinhos − despesas operacionais`)}
      ${kpi('Saldo de caixa', `<span class="${b.saldoCaixa >= 0 ? 'up' : 'down'}">${money0(b.saldoCaixa)}</span>`, `${money0(b.recebido)} recebido − ${money0(b.pago)} pago`)}
    </div>
    <div class="grid g2 mt">
      <div class="card pad-0"><div style="padding:16px 16px 0"><h2>Demonstrativo do mês</h2></div><div class="tbl-wrap"><table class="tbl"><tbody>
        ${linha('Receitas de vendas (fechamentos + vendas diretas)', b.receita, true)}
        ${linha('(−) Custo dos vinhos vendidos', b.cmv, false, true)}
        ${linha('= Lucro bruto', b.lucroBruto, true)}
        ${Object.entries(b.porCategoria).filter(([k]) => k !== 'Compra de mercadoria').sort((a, c) => c[1] - a[1]).map(([k, v]) => linha(`(−) ${esc(k)}`, v, false, true)).join('')}
        ${linha('= Resultado', b.resultado, true)}
        <tr><td colspan="2" class="label" style="padding-top:18px">Caixa</td></tr>
        ${linha('Recebido no mês', b.recebido)}
        ${linha('(−) Compras de mercadoria', b.compras, false, true)}
        ${linha('(−) Despesas operacionais pagas', b.operacionais, false, true)}
        ${linha('= Saldo de caixa', b.saldoCaixa, true)}
        ${b.aReceber ? linha('A receber com vencimento no mês', b.aReceber) : ''}
      </tbody></table></div></div>
      <div class="col">
        <div class="card"><div class="head"><h2>Receitas por parceiro</h2></div>${Object.keys(b.porParceiro).length ? hbars(Object.entries(b.porParceiro).sort((a, c) => c[1] - a[1]).map(([k, v]) => ({ label: k, value: v })), money0) : empty('Sem receitas neste mês')}</div>
        <div class="card"><div class="head"><h2>Despesas por categoria</h2></div>${Object.keys(b.porCategoria).length ? hbars(Object.entries(b.porCategoria).sort((a, c) => c[1] - a[1]).map(([k, v]) => ({ label: k, value: v })), money0, { color: 'var(--dourado)' }) : empty('Sem despesas neste mês')}</div>
      </div>
    </div>
    <div class="grid g2 mt">
      <div class="card pad-0"><div style="padding:16px 16px 0" class="row between"><h2>Recebimentos</h2><b class="small">${money(b.recebido)}</b></div>
        <div class="list" style="padding:0 16px">${b.recebimentos.map((r) => `<${r.link ? `a href="${r.link}"` : 'div'} class="li" data-busca="${esc(r.descricao + ' ' + (r.forma || ''))}"><div class="grow"><div class="t">${esc(r.descricao)}</div><div class="s">${date(r.data)}${r.forma ? ' · ' + esc(r.forma) : ''}</div></div><div class="num up">${money(r.valor)}</div></${r.link ? 'a' : 'div'}>`).join('') || empty('Nenhum recebimento', 'money')}</div></div>
      <div class="card pad-0"><div style="padding:16px 16px 0" class="row between"><h2>Despesas</h2><b class="small">${money(b.operacionais + b.compras)}</b></div>
        <div class="list" style="padding:0 16px">${b.despesas.map((d) => `<div class="li" data-busca="${esc(d.descricao + ' ' + d.categoria)}"><div class="grow"><div class="t">${esc(d.descricao)}</div><div class="s">${esc(d.categoria)} · ${date(d.data)}</div></div><div class="num down">${money(d.valor)}</div><button class="iconbtn" data-act="delDesp" data-id="${d.id}" aria-label="Excluir">${icon('trash')}</button></div>`).join('') || empty('Nenhuma despesa', 'money')}</div></div>
    </div>`);
}

function vFinanceiroPeriodo({ query }) {
  const s = S();
  const meses = +(query.m || 6);
  const serie = D.serieMensal(s, meses);
  const cr = D.contasReceber(s);
  const tot = serie.reduce((a, m) => ({ receita: a.receita + m.receita, cmv: a.cmv + m.cmv, despesas: a.despesas + m.despesas, lucro: a.lucro + m.lucro, recebido: a.recebido + m.recebido }), { receita: 0, cmv: 0, despesas: 0, lucro: 0, recebido: 0 });
  const desp = sortBy(s.despesas, (d) => d.data, true).slice(0, 12);
  const porCat = Object.entries(s.despesas.filter((d) => d.data >= addDays(today(), -30 * meses) && d.categoria !== 'Compra de mercadoria').reduce((m, d) => ((m[d.categoria] = (m[d.categoria] || 0) + d.valor), m), {})).sort((a, b) => b[1] - a[1]);
  return shell('Financeiro', `
    ${pageHead('Financeiro', 'Comparativo mensal, contas a receber e despesas', `${segFin('periodo')}<div class="seg">${[3, 6, 12].map((m) => `<button class="${meses === m ? 'on' : ''}" data-act="goto" data-h="#/financeiro?v=periodo&m=${m}">${m} meses</button>`).join('')}</div><button class="btn ghost" data-act="csvFin">${icon('download')} CSV</button><button class="btn" data-act="despesa">${icon('plus')} Despesa</button>`)}
    <div class="grid g4">${kpi('Faturamento', moneyK(tot.receita), `${meses} meses`)}${kpi('Lucro bruto', moneyK(tot.receita - tot.cmv), `margem ${percent(tot.receita ? (tot.receita - tot.cmv) / tot.receita : 0)}`)}${kpi('Despesas operacionais', moneyK(tot.despesas), 'sem compras de mercadoria')}${kpi('Resultado', moneyK(tot.lucro), `margem líquida ${percent(tot.receita ? tot.lucro / tot.receita : 0)}`, tot.lucro >= 0 ? '' : '')}</div>
    <div class="grid g-2-1 mt">
      <div class="card"><div class="head"><h2>Resultado mensal</h2></div>${chart({ type: 'columns', height: 230, data: serie.map((m) => ({ label: monthLabel(m.mes), value: Math.max(0, m.lucro), tip: `<b>${monthLabel(m.mes)}</b><br>Faturamento: ${money0(m.receita)}<br>CMV: ${money0(m.cmv)}<br>Despesas: ${money0(m.despesas)}<br><b>Resultado: ${money0(m.lucro)}</b>` })), fmt: money0, fmtAxis: moneyK })}</div>
      <div class="card"><div class="head"><h2>Despesas por categoria</h2></div>${hbars(porCat.map(([k, v]) => ({ label: k, value: v })), moneyK, { color: 'var(--dourado)' })}</div>
    </div>
    <div class="card pad-0 mt"><div style="padding:16px 16px 0"><h2>DRE simplificada</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${serie.map((m) => `<th class="r">${monthLabel(m.mes)}</th>`).join('')}<th class="r">Total</th></tr></thead><tbody>
      ${[['Faturamento', 'receita'], ['(−) Custo das mercadorias', 'cmv'], ['= Lucro bruto', null], ['(−) Despesas operacionais', 'despesas'], ['= Resultado', 'lucro'], ['Recebido no caixa', 'recebido']].map(([n, k]) => `<tr><td style="white-space:nowrap;${n.startsWith('=') ? 'font-weight:600' : ''}">${n}</td>${serie.map((m) => `<td class="r">${money0(k ? m[k] : m.receita - m.cmv)}</td>`).join('')}<td class="r"><b>${money0(k ? tot[k] : tot.receita - tot.cmv)}</b></td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="grid g2 mt">
      <div class="card pad-0"><div style="padding:16px 16px 0" class="row between"><h2>Contas a receber</h2><span class="small muted">${money(sum(cr, (x) => x.total))}</span></div>
        <div class="list" style="padding:0 16px">${cr.map((f) => `<a class="li" href="#/fechamento/${f.id}"><div class="grow"><div class="t">${esc(D.cliente(s, f.clienteId).nome)}</div><div class="s">${esc(f.formaPagamento)} · vence ${date(f.vencimento)}</div></div><div class="right"><div class="num" style="font-weight:600">${money(f.total)}</div>${f.atraso ? badge(`${f.atraso}d atraso`, 'crit') : badge(relDays(f.vencimento), 'info')}</div></a>`).join('') || empty('Nada a receber', 'check')}</div></div>
      <div class="card pad-0"><div style="padding:16px 16px 0"><h2>Últimas despesas</h2></div>
        <div class="list" style="padding:0 16px">${desp.map((d) => `<div class="li"><div class="grow"><div class="t">${esc(d.descricao)}</div><div class="s">${esc(d.categoria)} · ${date(d.data)}</div></div><div class="num">${money(d.valor)}</div><button class="iconbtn" data-act="delDesp" data-id="${d.id}" aria-label="Excluir">${icon('trash')}</button></div>`).join('')}</div></div>
    </div>`);
}

// ---------- Inteligência ----------
function vInteligencia() {
  const s = S();
  const ins = D.insights(s);
  const abc = D.curvaABC(s);
  const rank = D.rankingClientes(s);
  const grupos = [['acao', 'Ações pendentes'], ['critico', 'Crítico'], ['atencao', 'Atenção'], ['oportunidade', 'Oportunidades de venda'], ['info', 'Para acompanhar']];
  return shell('Inteligência', `
    ${pageHead('Inteligência', 'Alertas automáticos, curva ABC e sugestões para decidir mais rápido', busca('Buscar alerta…'))}
    <div class="grid g-2-1">
      <div class="col">${grupos.map(([k, n]) => { const xs = ins.filter((i) => i.nivel === k); return xs.length ? `<div><div class="label mb" style="margin-top:6px">${n} · ${xs.length}</div><div class="col">${xs.map(insightCard).join('')}</div></div>` : ''; }).join('')}</div>
      <div class="col">
        <div class="card"><div class="head"><h2>Curva ABC</h2><span class="muted small">receita 90 dias</span></div>
          <div class="list">${abc.map((x) => `<div class="li"><span class="badge ${x.classe === 'A' ? 'ok' : x.classe === 'B' ? 'info' : ''}" style="width:26px;justify-content:center">${x.classe}</span><div class="grow ellipsis">${esc(x.produto.nome)}</div><div class="small num">${percent(x.share)}</div></div>`).join('')}</div>
          <div class="tiny muted mt-s">A = 80% da receita. Priorize ruptura zero nos rótulos A; rótulos C são candidatos a troca no parceiro.</div></div>
        <div class="card"><div class="head"><h2>Giro por parceiro</h2></div>${hbars(sortBy(rank, (x) => -x.giro).map((x) => ({ label: x.cliente.nome, value: x.giro, sub: `${x.garrafas} vendidas / ${x.garrafasConsig} em estoque` })), (v) => v.toFixed(1) + '×', { color: 'var(--dourado)' })}
          <div class="tiny muted mt">Parceiros com giro baixo estão com estoque acima do necessário: reduza o mix ou a quantidade na próxima reposição.</div></div>
      </div>
    </div>`);
}

// ---------- Rótulos ----------
function vProdutos() {
  const s = S();
  const est = D.estoqueCentral(s);
  const cons = D.consignado(s);
  return shell('Rótulos', `
    ${pageHead('Rótulos', `${s.produtos.length} vinhos no catálogo · preços da Tabela Mil Terras`, `${busca('Buscar rótulo…')}<button class="btn" data-act="editProduto">${icon('plus')} Novo rótulo</button>`)}
    <div class="wine-grid">${s.produtos.map((p) => `<a class="wine ${p.ativo ? '' : 'off'}" href="#/produto/${p.id}" data-busca="${esc(p.nome + ' ' + p.tipo + ' ' + p.regiao + ' ' + p.uvas)}"><span class="q">${qtdBadge(est[p.id])}</span><img src="${asset(p.foto)}" alt="" loading="lazy"><div class="n">${esc(p.nome)}</div><div class="tiny muted">${p.tipo} · ${esc(p.regiao)} · ${p.safra}</div><div style="font-weight:600;color:var(--bordo)">${money(p.preco)}</div><div class="tiny muted">${sum(Object.values(cons), (m) => m[p.id] || 0)} em consignação</div></a>`).join('')}</div>`);
}

function vProduto({ id }) {
  const s = S();
  const p = D.produto(s, id);
  if (!p) return shell('Rótulo', empty('Rótulo não encontrado'));
  const est = D.estoqueCentral(s)[id];
  const cons = D.consignado(s);
  const onde = s.clientes.map((c) => ({ c, q: cons[c.id]?.[id] || 0 })).filter((x) => x.q > 0);
  const cm = D.custoMedio(s, id);
  const vendas = D.vendasRealizadas(s).filter((v) => v.produtoId === id);
  const serie = D.serieMensal(s, 6).map((m) => ({ label: monthLabel(m.mes), value: sum(vendas.filter((v) => v.data.startsWith(m.mes)), (v) => v.qtd) }));
  return shell(p.nome, `
    <div class="grid g-2-1">
      <div class="card">${fichaVinho(p)}</div>
      <div class="col">
        <div class="card"><div class="grid g2"><div class="kpi"><div class="label">Preço tabela</div><div class="v">${money(p.preco)}</div></div><div class="kpi"><div class="label">Custo médio</div><div class="v">${money(cm)}</div><div class="d">margem ${percent((p.preco - cm) / p.preco)}</div></div>
          <div class="kpi"><div class="label">Estoque central</div><div class="v">${est}</div></div><div class="kpi"><div class="label">Consignado</div><div class="v">${sum(onde, (x) => x.q)}</div></div></div>
          <button class="btn ghost block mt" data-act="editProduto" data-id="${p.id}">${icon('edit')} Editar preço, custo e cadastro</button></div>
        <div class="card"><div class="head"><h2>Garrafas vendidas por mês</h2></div>${chart({ type: 'columns', height: 160, data: serie, fmt: (v) => int(v) + ' gf', padL: 36 })}</div>
        <div class="card"><div class="head"><h2>Onde está</h2></div><div class="list">${onde.map((x) => `<a class="li" href="#/parceiro/${x.c.id}"><div class="grow">${esc(x.c.nome)}</div><b>${x.q}</b></a>`).join('') || empty('Nenhum parceiro com este rótulo')}</div></div>
      </div>
    </div>`, { back: true });
}

function modalProduto(id, onSalvo, onCancelar) {
  const s = S();
  const p = id ? D.produto(s, id) : { id: '', nome: '', tipo: 'Tinto', regiao: '', classificacao: '', uvas: '', teor: '', safra: new Date().getFullYear() - 2, preco: 0, custo: 0, precoCarta: 0, estoqueMin: 24, servir: '18–20 °C', descricao: '', harmonizacao: '', foto: 'assets/logo/simbolo.png', ativo: true };
  const f = (n, l, v, t = 'text') => `<label class="field"><span>${l}</span><input class="input" name="${n}" type="${t}" ${t === 'number' ? 'step="0.01"' : ''} value="${esc(v)}"></label>`;
  modal({ title: id ? 'Editar rótulo' : 'Novo rótulo', wide: true, body: `<form id="fprod" class="col">
    <div class="grid g2">${f('nome', 'Nome', p.nome)}<label class="field"><span>Tipo</span><select class="input" name="tipo">${['Tinto', 'Branco', 'Rosé', 'Espumante'].map((t) => `<option ${p.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${f('regiao', 'Região', p.regiao)}${f('classificacao', 'Classificação (DOCG, DOC, IGP…)', p.classificacao)}${f('uvas', 'Uvas', p.uvas)}${f('safra', 'Safra', p.safra, 'number')}
    ${f('teor', 'Teor alcoólico', p.teor)}${f('servir', 'Servir a', p.servir)}
    <label class="field"><span>Preço de tabela</span>${moneyInput('preco', p.preco)}</label><label class="field"><span>Custo unitário</span>${moneyInput('custo', p.custo)}</label><label class="field"><span>Preço sugerido na carta</span>${moneyInput('precoCarta', p.precoCarta)}</label>${f('estoqueMin', 'Estoque mínimo (central)', p.estoqueMin, 'number')}</div>
    <label class="field"><span>Descrição</span><textarea class="input" name="descricao">${esc(p.descricao)}</textarea></label>
    <label class="field"><span>Harmonização</span><input class="input" name="harmonizacao" value="${esc(p.harmonizacao)}"></label>
    <label class="row small"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Ativo no catálogo</label></form>`,
    foot: `<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="ok">Salvar</button>`,
    handlers: { close: () => { closeModal(); onCancelar?.(); }, ok: () => {
      const fd = Object.fromEntries(new FormData(document.getElementById('fprod')));
      if (!fd.nome) return toast('Informe o nome');
      store.commit((st) => {
        const alvo = id ? D.produto(st, id) : (st.produtos.push({ ...p, id: fd.nome.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + uid().slice(-3) }), st.produtos[st.produtos.length - 1]);
        Object.assign(alvo, fd, { preco: parseMoney(fd.preco), custo: parseMoney(fd.custo), precoCarta: parseMoney(fd.precoCarta), estoqueMin: +fd.estoqueMin, safra: +fd.safra, ativo: !!fd.ativo });
      });
      closeModal(); toast('Rótulo salvo');
      onSalvo?.();
    } } });
}

// ---------- Configurações / mais ----------
const msgAcesso = (c, base) => `Olá${c.contato ? ', ' + c.contato.split(' ')[0] : ''}! Este é o app da Mil Terras para registrar as vendas dos nossos vinhos, acompanhar relatórios e fazer os fechamentos:\n${base}\n\nCódigo do estabelecimento: ${c.codigo}\nPIN: ${c.pin}\n\nPara instalar como app:\n• iPhone: abra o link no Safari › Compartilhar › Adicionar à Tela de Início\n• Android: abra no Chrome › menu ⋮ › Instalar app`;
const mailAcesso = (c, base) => `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent('Seu acesso ao app Mil Terras')}&body=${encodeURIComponent(msgAcesso(c, base))}`;
async function carregarEquipe() {
  const el = document.getElementById('equipe');
  if (!el) return;
  try {
    const eq = await store.rpc('equipe');
    const base = new URL('../gestor/', location.href).href;
    el.innerHTML = `<div class="list">${eq.membros.map((m) => `<div class="li"><div class="avatar">${iniciais(m.email || '?')}</div><div class="grow"><div class="t">${esc(m.email)}${m.eu ? ' (você)' : ''}</div><div class="s">${m.papel === 'dono' ? 'Dono' : 'Gestor'} · desde ${date(m.desde.slice(0, 10))}</div></div>${store.ehDono() && m.papel === 'gestor' ? `<button class="btn ghost sm" data-act="removerGestor" data-u="${m.userId}" data-e="${esc(m.email)}">Remover</button>` : ''}</div>`).join('')}
      ${eq.convites.map((c) => `<div class="li"><div class="avatar">${icon('link')}</div><div class="grow"><div class="t">Convite ${esc(c.codigo)}${c.nome ? ' · ' + esc(c.nome) : ''}</div><div class="s">Aguardando uso · vale até ${date(c.expira.slice(0, 10))}</div></div><a class="btn ghost sm" target="_blank" rel="noopener" href="${waLink('', msgConvite(c.codigo, base))}">${icon('whatsapp')}</a><button class="btn ghost sm" data-act="cancelarConvite" data-c="${c.codigo}">Cancelar</button></div>`).join('')}</div>`;
  } catch (e) { el.textContent = 'Não foi possível carregar a equipe: ' + e.message + ' (rode novamente o supabase/instalar.sql no Supabase).'; }
}
const msgConvite = (codigo, base) => `Convite para a Gestão Mil Terras:\n${base}\n\n1. Toque em "Primeiro acesso"\n2. Use seu e-mail e crie uma senha\n3. Código: ${codigo}\n\nO convite vale por 7 dias e pode ser usado uma única vez.`;


function vConfig() {
  const s = S();
  const base = new URL('../cliente/' + DEMO_Q, location.href).href;
  const nuvem = store.modo === 'nuvem';
  return shell('Configurações', `
    ${pageHead('Configurações')}
    <div class="grid g2">
      <div class="card col"><h2>Acesso dos parceiros</h2><div class="small ink2">Cada parceiro entra no app <b>Mil Terras Parceiro</b> com o código do estabelecimento e um PIN. Envie o link pelo WhatsApp. Trocar o PIN (no cadastro do parceiro) desconecta os aparelhos dele.</div>
        <div class="list">${s.clientes.filter((c) => c.ativo).map((c) => `<div class="li"><div class="grow"><div class="t">${esc(c.nome)}</div><div class="s">Código <b>${esc(c.codigo)}</b> · PIN <b>${esc(c.pin)}</b></div></div><div class="row gap-s"><a class="btn ghost sm" target="_blank" rel="noopener" href="${waLink(c.telefone, msgAcesso(c, base))}">${icon('whatsapp')} WhatsApp</a>${c.email ? `<a class="btn ghost sm" href="${mailAcesso(c, base)}">E-mail</a>` : ''}<button class="btn ghost sm" data-act="copiarAcesso" data-c="${c.id}">Copiar</button>${verApp(c.id)}</div></div>`).join('') || empty('Nenhum parceiro cadastrado ainda', 'store')}</div>
        <a class="btn ghost" href="${base}" target="_blank" rel="noopener">${icon('link')} Abrir app do parceiro</a></div>
      <div class="col">
        ${nuvem ? `<div class="card col"><h2>Equipe de gestão</h2><div id="equipe" class="small muted">Carregando…</div>
          ${store.ehDono() ? `<button class="btn ghost" data-act="convidar">${icon('plus')} Convidar gestor (ex.: sócio)</button><div class="tiny muted">O convidado acessa toda a Gestão, mas não pode remover você nem convidar outras pessoas. Você pode remover o acesso dele a qualquer momento.</div>` : '<div class="tiny muted">Somente o dono convida ou remove gestores.</div>'}</div>` : ''}
        <div class="card col"><h2>Empresa</h2><form class="col" data-onsubmit="salvarEmpresa">
          <label class="field"><span>Nome</span><input class="input" name="empresa" value="${esc(s.meta.empresa)}"></label>
          <label class="field"><span>WhatsApp (com DDI e DDD)</span><input class="input" name="whatsapp" value="${esc(s.meta.whatsapp)}"></label>
          <label class="field"><span>Instagram</span><input class="input" name="instagram" value="${esc(s.meta.instagram)}"></label>
          ${nuvem ? '' : `<label class="field"><span>PIN do gestor (modo local)</span><input class="input" name="pinGestor" inputmode="numeric" maxlength="4" value="${esc(s.meta.pinGestor)}"></label>`}
          <button class="btn">Salvar</button></form></div>
        <div class="card col"><h2>Dados</h2>
          ${nuvem ? `<div class="small ink2">${icon('check')} Conectado ao banco na nuvem (Supabase). Os dados ficam disponíveis em qualquer aparelho e são compartilhados com os parceiros em tempo real.</div>
            <div class="small ink2">Seu acesso: <b>${store.ehDono() ? 'Dono' : 'Gestor'}</b>.</div>
            <div class="row wrap"><button class="btn ghost" data-act="backup">${icon('download')} Exportar backup</button><button class="btn ghost" data-act="install">${icon('download')} Instalar app</button><a class="btn ghost" href="?demo=1#/painel" target="_blank" rel="noopener">${icon('spark')} Abrir demonstração</a></div>`
          : `<div class="small ink2">${store.demo && s.meta.demo ? 'Você está na <b>demonstração</b>: dados fictícios salvos só neste navegador. Nada aqui afeta os dados reais.' : 'Os dados estão salvos só neste navegador.'}</div>
            <div class="row wrap"><button class="btn ghost" data-act="backup">${icon('download')} Exportar backup</button><label class="btn ghost">${icon('upload')} Importar<input type="file" accept="application/json" hidden data-onchange="restore"></label><button class="btn ghost" data-act="install">${icon('download')} Instalar app</button></div>
            <div class="row wrap"><button class="btn ghost" data-act="resetDemo">${icon('refresh')} Recarregar demonstração</button><button class="btn ghost" data-act="zerar" style="color:var(--crit)">${icon('trash')} Começar do zero</button></div>`}
        </div>
      </div>
    </div>`);
}

function vMais() {
  return shell('Mais', `<div class="card pad-0"><div class="list" style="padding:0 16px">${NAV.map(([h, ic, n]) => `<a class="li" href="${h}"><span class="avatar">${icon(ic)}</span><div class="grow t">${n}</div>${icon('arrowR', 'muted')}</a>`).join('')}
    <a class="li" href="#" data-act="install"><span class="avatar">${icon('download')}</span><div class="grow t">Instalar na tela inicial</div></a>
    <a class="li" href="#" data-act="logout"><span class="avatar">${icon('logout')}</span><div class="grow t">Sair</div></a></div></div>`);
}

// ---------- Documentos para imprimir ----------
function docHead(titulo, sub) {
  const s = S();
  return `<div class="row between noprint mb"><button class="btn ghost" data-act="back">${icon('arrowL')} Voltar</button><button class="btn" data-act="print">${icon('print')} Imprimir / salvar PDF</button></div>
    <div class="doc"><div class="dh"><img src="${asset('assets/logo/logo_h.png')}" alt="Mil Terras"><div class="right"><h1>${titulo}</h1><div class="small muted">${sub}</div><div class="tiny muted">Emitido em ${date(today())}</div></div></div>`;
}
const docFoot = () => { const s = S(); return `<div class="foot"><span>Mil Terras · Vinhos exclusivos · Serra Gaúcha, Porto Alegre e Região Metropolitana</span><span>WhatsApp ${s.meta.whatsapp.replace(/^55(\d\d)(\d{5})(\d{4})$/, '($1) $2-$3')} · ${s.meta.instagram}</span></div></div>`; };

function vImprimirFechamento({ id }) {
  const s = S();
  const f = s.fechamentos.find((x) => x.id === id);
  const c = D.cliente(s, f.clienteId);
  const repo = f.reposicaoEnviada || f.reposicao || [];
  return shell('Relatório', `${docHead('Relatório de fechamento', `${f.numero ? f.numero + ' · ' : ''}Período ${date(f.inicio)} a ${date(f.fim)}`)}
    <div class="grid g2 small" style="gap:6px 30px"><div><span class="label">Parceiro</span><br><b>${esc(c.nome)}</b><br>${esc(c.cidade)} · ${esc(c.contato)}</div><div><span class="label">Pagamento</span><br><b>${esc(f.formaPagamento)}</b>${f.vencimento ? `<br>Vencimento ${date(f.vencimento)}` : ''}<br>Status: ${D.STATUS_FECH[f.status].label}</div></div>
    <table class="tbl mt"><thead><tr><th>Rótulo</th><th class="r">Saldo anterior</th><th class="r">Contagem</th><th class="r">Vendido</th><th class="r">Preço un.</th><th class="r">Valor</th></tr></thead>
      <tbody>${f.itens.map((i) => `<tr><td>${esc(D.produto(s, i.produtoId).nome)}</td><td class="r">${i.saldoAnterior}</td><td class="r">${i.contagem}</td><td class="r">${i.vendido}</td><td class="r">${money(i.preco)}</td><td class="r">${money(i.valor)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Vendido no período</td><td class="r">${f.vendidas ?? f.garrafas}</td><td></td><td class="r">${money(sum(f.itens, (i) => i.valor))}</td></tr></tfoot></table>
    ${acertosHTML(s, f, { doc: true })}
    <div class="row between mt" style="font-size:16px"><b>Total a pagar</b><b style="color:var(--bordo)">${money(f.total)}</b></div>
    ${repo.length ? `<h3 class="mt">Reposição</h3><table class="tbl mt-s"><thead><tr><th>Rótulo</th><th class="r">Quantidade</th></tr></thead><tbody>${repo.map((r) => `<tr><td>${esc(D.produto(s, r.produtoId).nome)}</td><td class="r">${r.qtd}</td></tr>`).join('')}</tbody></table>` : ''}
    ${f.obs ? `<p class="small"><b>Observações:</b> ${esc(f.obs)}</p>` : ''}
    <div class="sign"><div>Mil Terras</div><div>${esc(c.nome)}</div></div>${docFoot()}`, { back: true });
}

function vImprimirRomaneio({ cid, query }) {
  const s = S();
  const c = D.cliente(s, cid);
  const saldo = D.saldoCliente(s, cid);
  const ult = sortBy(s.movs.filter((m) => m.clienteId === cid && m.tipo === 'remessa'), (m) => m.data + m.id, true);
  const rid = query?.r || ult[0]?.remessaId;
  const remessa = rid ? ult.filter((m) => m.remessaId === rid) : ult.filter((m) => m.data === ult[0]?.data && !m.remessaId);
  const data = remessa[0]?.data;
  // mesmo rótulo em mais de uma linha (lançamentos antigos) é somado
  const agrupar = (pares) => Object.entries(pares.reduce((m, [pid, q]) => ((m[pid] = (m[pid] || 0) + q), m), {})).filter(([, q]) => q > 0);
  const itensRem = agrupar(remessa.map((m) => [m.produtoId, m.qtd]));
  const itensSaldo = agrupar(Object.entries(saldo));
  const tot = (its) => ({ q: sum(its, ([, q]) => q), v: sum(its, ([pid, q]) => q * D.produto(s, pid).preco) });
  const tR = tot(itensRem), tS = tot(itensSaldo);
  const st = remessa[0]?.entrega && remessa[0].entrega !== 'entregue' ? remessa[0].entrega : null;
  const tabela = (its, t) => `<table class="tbl"><thead><tr><th>Rótulo</th><th class="r">Qtd.</th><th class="r">Preço un.</th><th class="r">Valor</th></tr></thead>
    <tbody>${sortBy(its, ([pid]) => D.produto(s, pid).nome).map(([pid, q]) => { const p = D.produto(s, pid); return `<tr><td>${esc(p.nome)}</td><td class="r">${q}</td><td class="r">${money(p.preco)}</td><td class="r">${money(q * p.preco)}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td>Total</td><td class="r">${t.q}</td><td></td><td class="r">${money(t.v)}</td></tr></tfoot></table>`;
  return shell('Romaneio', `${docHead('Romaneio de consignação', `${remessa[0]?.protocolo ? 'Protocolo ' + remessa[0].protocolo + ' · ' : ''}${esc(c.nome)}`)}
    <div class="resumo small">
      <div>Esta remessa${data ? ` · ${date(data)}` : ''}<b>${plural(tR.q, 'garrafa')} · ${money(tR.v)}</b></div>
      <div>Saldo em consignação<b>${plural(tS.q, 'garrafa')} · ${money(tS.v)}</b></div>
      <div>Parceiro<b style="font-size:14px">${esc(c.nome)}</b>${esc(c.cidade || '')}${c.contato ? ' · ' + esc(c.contato) : ''}</div>
    </div>
    <p class="small">Os vinhos abaixo permanecem de propriedade da <b>Mil Terras</b> e ficam em consignação no estabelecimento. O parceiro paga somente o que vender, no acerto a cada ${c.cicloDias} dias. Valores pelo preço de tabela.</p>
    ${itensRem.length ? `<div class="bloco"><h3><span>1. Itens desta remessa${remessa[0]?.protocolo ? ' · ' + remessa[0].protocolo : ''}</span><span>${data ? date(data) : ''}${st ? ' · ' + D.STATUS_ENTREGA[st].label : ''}</span></h3>${tabela(itensRem, tR)}</div>` : ''}
    <div class="bloco"><h3><span>${itensRem.length ? '2. ' : ''}Saldo total em consignação após a entrega</span><span>${plural(tS.q + (st ? tR.q : 0), 'garrafa')}</span></h3>${tabela(st ? agrupar([...itensSaldo, ...itensRem]) : itensSaldo, st ? tot(agrupar([...itensSaldo, ...itensRem])) : tS)}</div>
    <div class="sign"><div>Mil Terras</div><div>${esc(c.nome)} — recebido em ___/___/______</div></div>${docFoot()}`, { back: true });
}

// ---------- Login ----------
let telaLogin = 'entrar';
function vLogin() {
  if (store.modo === 'local') return `<div class="login"><form class="box col" data-onsubmit="login" style="gap:16px">
    <img class="logo" src="${asset('assets/logo/logo_v.png')}" alt="Mil Terras">
    <div class="center"><div class="label">Gestão · demonstração</div><div class="small muted mt-s">Digite seu PIN para entrar</div></div>
    <div class="pin">${[0, 1, 2, 3].map((i) => `<input inputmode="numeric" maxlength="1" name="p${i}" data-oninput="pin" autocomplete="off" ${i === 0 ? 'autofocus' : ''}>`).join('')}</div>
    <button class="btn lg block">Entrar</button>
    <div class="tiny muted center">${S().meta.demo ? 'Demonstração: PIN 0000 · dados fictícios, só neste navegador' : 'PIN padrão 0000'}</div></form></div>`;
  const logo = `<img class="logo" src="${asset('assets/logo/logo_v.png')}" alt="Mil Terras">`;
  if (telaLogin === 'ativar') return `<div class="login"><form class="box col" data-onsubmit="ativar" style="gap:14px">${logo}
    <div class="center"><div class="label">Ativar acesso de gestor</div><div class="small muted mt-s">Informe o código de convite que você recebeu (ou o código de instalação, no primeiro acesso do dono).</div></div>
    <label class="field"><span>Código</span><input class="input" name="codigo" required autocapitalize="characters" style="text-transform:uppercase"></label>
    <button class="btn lg block">Ativar</button><a href="#" class="small center" data-act="logout">Usar outra conta</a></form></div>`;
  const novo = telaLogin === 'novo';
  return `<div class="login"><form class="box col" data-onsubmit="${novo ? 'cadastrar' : 'entrar'}" style="gap:14px">${logo}
    <div class="center"><div class="label">Gestão</div></div>
    <div class="seg" style="align-self:center"><button type="button" class="${novo ? '' : 'on'}" data-act="telaLogin" data-v="entrar">Entrar</button><button type="button" class="${novo ? 'on' : ''}" data-act="telaLogin" data-v="novo">Primeiro acesso</button></div>
    <label class="field"><span>E-mail</span><input class="input" name="email" type="email" autocomplete="username" required></label>
    <label class="field"><span>Senha${novo ? ' (mínimo 8 caracteres)' : ''}</span><input class="input" name="senha" type="password" minlength="${novo ? 8 : 1}" autocomplete="${novo ? 'new-password' : 'current-password'}" required></label>
    ${novo ? '<label class="field"><span>Código de instalação ou de convite</span><input class="input" name="codigo" required style="text-transform:uppercase"></label>' : ''}
    <button class="btn lg block">${novo ? 'Criar acesso' : 'Entrar'}</button>
    ${novo ? '' : '<a href="#" class="small center" data-act="esqueci">Esqueci minha senha</a>'}
    <a class="tiny muted center" href="?demo=1">Ver demonstração com dados fictícios</a></form></div>`;
}

// ---------- Render ----------
const ROUTES = [
  ['/painel', vPainel], ['/aovivo', vAoVivo], ['/estoque', vEstoque], ['/consignacao', vConsignacao], ['/remessas', vRemessas], ['/parceiros', vParceiros], ['/parceiro/:id', vParceiro],
  ['/fechamentos', vFechamentos], ['/fechamento/:id', vFechamento], ['/novo-fechamento/:cid', vNovoFechamento], ['/financeiro', vFinanceiro],
  ['/inteligencia', vInteligencia], ['/produtos', vProdutos], ['/produto/:id', vProduto], ['/config', vConfig], ['/mais', vMais],
  ['/imprimir/fechamento/:id', vImprimirFechamento], ['/imprimir/romaneio/:cid', vImprimirRomaneio],
];

function render(view, params, pattern) {
  current = { view, params, pattern };
  handlers = {};
  resetCharts();
  const logged = store.modo === 'local' ? localStorage.getItem(SESSION) : store.ehGestor() && S();
  if (!logged && store.modo === 'nuvem' && store.perfil()) telaLogin = 'ativar';
  app.innerHTML = logged ? view(params) : vLogin();
  if (logged && buscas[pattern]) filtrarBusca(app, buscas[pattern]);
  if (logged && pattern === '/config' && store.modo === 'nuvem') carregarEquipe();
  mountCharts(app);
  if (!logged) app.querySelector('[name=p0]')?.focus();
}
function rerender() { const y = scrollY; render(current.view, current.params, current.pattern); scrollTo(0, y); }
const go = router(ROUTES, render);

const common = {
  goto: (el) => (location.hash = el.dataset.h),
  busca: (el) => { buscas[current.pattern] = el.value; filtrarBusca(app, el.value); },
  step: stepHandler,
  qty: () => {},
  back: () => history.length > 1 ? history.back() : (location.hash = '#/painel'),
  print: () => window.print(),
  logout: async () => { localStorage.removeItem(SESSION); telaLogin = 'entrar'; await store.sair(); go(); },
  telaLogin: (el) => { telaLogin = el.dataset.v; go(); },
  entrar: async (f) => {
    const fd = new FormData(f); const btn = f.querySelector('button.lg'); btn.disabled = true;
    try { const ok = await store.entrarGestor(fd.get('email').trim(), fd.get('senha')); if (!ok) telaLogin = 'ativar'; else { await aposEntrar(); if (!location.hash || location.hash === '#/') location.hash = '#/painel'; } go(); }
    catch (e) { toast(e.message); btn.disabled = false; }
  },
  cadastrar: async (f) => {
    const fd = new FormData(f); const btn = f.querySelector('button.lg'); btn.disabled = true;
    try {
      let sessao;
      try { sessao = await store.cadastrarGestor(fd.get('email').trim(), fd.get('senha')); }
      catch (e) {
        if (!/already|registered/i.test(e.message)) throw e;
        if (await store.entrarGestor(fd.get('email').trim(), fd.get('senha'))) { location.hash = '#/painel'; go(); return; } // já era gestor
        sessao = true; // conta existe e a senha confere: falta só ativar
      }
      if (!sessao) { modal({ title: 'Confirme seu e-mail', body: '<p>Enviamos um link de confirmação para o seu e-mail. Abra o link, volte aqui, entre com e-mail e senha e informe o código de instalação.</p>' }); telaLogin = 'entrar'; go(); return; }
      await store.ativarGestor(String(fd.get('codigo')));
      await aposEntrar(); location.hash = '#/painel'; go();
    } catch (e) { toast(e.message); btn.disabled = false; if (store.perfil() === null) { telaLogin = 'ativar'; go(); } }
  },
  ativar: async (f) => {
    try { await store.ativarGestor(new FormData(f).get('codigo')); await aposEntrar(); location.hash = '#/painel'; go(); } catch (e) { toast(e.message); }
  },
  esqueci: () => modal({ title: 'Recuperar senha', body: '<form id="fes" class="col"><label class="field"><span>E-mail</span><input class="input" name="email" type="email" required></label></form>', foot: '<button class="btn" data-act="ok">Enviar link</button>',
    handlers: { ok: async () => { const email = new FormData(document.getElementById('fes')).get('email'); if (!email) return; await store.redefinirSenha(email); closeModal(); toast('Se o e-mail existir, você receberá um link.'); } } }),
  install: instalar,
  semBanner: () => { dispensarBanner(); rerender(); },
  pin: (el) => { el.value = el.value.replace(/\D/g, ''); if (el.value) el.nextElementSibling?.focus(); const f = el.form; if ([...f.querySelectorAll('input')].every((i) => i.value)) f.requestSubmit(); },
  login: (f) => {
    const pin = [...f.querySelectorAll('input')].map((i) => i.value).join('');
    if (pin === S().meta.pinGestor.slice(0, 4)) { localStorage.setItem(SESSION, '1'); if (!location.hash || location.hash === '#/') location.hash = '#/painel'; go(); }
    else { toast('PIN incorreto'); f.querySelectorAll('input').forEach((i) => (i.value = '')); f.querySelector('input').focus(); }
  },
  mov: (el) => modalMov(el.dataset.t),
  remessa: (el) => modalRemessa(el.dataset.c),
  devolucao: (el) => modalRemessa(el.dataset.c, 'devolucao'),
  editCliente: () => novoParceiro(),
  salvarCliente: (f, onSalvo) => {
    const fd = new FormData(f);
    const id = f.dataset.id;
    const formas = fd.getAll('forma');
    if (!formas.length) return toast('Libere ao menos uma forma de pagamento');
    let cod = String(fd.get('codigo') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    if (!cod || S().clientes.some((c) => c.id !== id && c.codigo === cod)) cod = gerarCodigo();
    if (!/^\d{4}$/.test(String(fd.get('pin')))) return toast('O PIN precisa ter 4 números');
    let nid = id;
    store.commit((st) => {
      let c = id ? D.cliente(st, id) : null;
      if (!c) { nid = uid('cl'); c = { id: nid, ativo: true, desde: today(), precosCarta: {}, par: {}, garcons: [] }; st.clientes.push(c); }
      const nomes = String(fd.get('garcons')).split(',').map((x) => x.trim()).filter(Boolean);
      for (const g of c.garcons) g.ativo = nomes.includes(g.nome);
      for (const n of nomes) if (!c.garcons.some((g) => g.nome === n)) c.garcons.push({ id: uid('g'), nome: n, ativo: true });
      Object.assign(c, { nome: fd.get('nome'), tipo: fd.get('tipo'), cidade: fd.get('cidade'), regiao: fd.get('regiao'), contato: fd.get('contato'), telefone: fd.get('telefone'), email: fd.get('email'), cnpj: fd.get('cnpj'),
        cicloDias: +fd.get('cicloDias') || 15, prazoDias: +fd.get('prazoDias') || 0, formasPagamento: formas, formaPadrao: formas.includes(c.formaPadrao) ? c.formaPadrao : formas[0],
        codigo: cod, pin: String(fd.get('pin')).slice(0, 4) });
      if (id) c.ativo = !!fd.get('ativo');
    });
    closeModal(); toast('Parceiro salvo');
    if (!id && typeof onSalvo === 'function') { toast('Parceiro cadastrado — envie o acesso depois em Configurações'); return onSalvo(nid); }
    if (!id) {
      location.hash = `#/parceiro/${nid}`;
      setTimeout(() => {
        const c = D.cliente(S(), nid);
        const base = new URL('../cliente/' + DEMO_Q, location.href).href;
        modal({ title: 'Parceiro cadastrado', body: `<p class="small">Envie o acesso ao app para <b>${esc(c.nome)}</b>: link, código <b>${esc(c.codigo)}</b> e PIN <b>${esc(c.pin)}</b>, com o passo a passo para instalar no celular.</p>`,
          foot: `<a class="btn ghost" target="_blank" rel="noopener" href="${waLink(c.telefone, msgAcesso(c, base))}">${icon('whatsapp')} WhatsApp</a>${c.email ? `<a class="btn ghost" href="${mailAcesso(c, base)}">E-mail</a>` : ''}<button class="btn ghost" data-act="copiarAcesso" data-c="${c.id}">Copiar mensagem</button><button class="btn" data-act="primRem">${icon('truck')} Primeira remessa</button>`,
          handlers: { primRem: () => { closeModal(); modalRemessa(nid); }, copiarAcesso: common.copiarAcesso } });
      }, 300);
    }
  },
  novoFech: () => modal({ title: 'Fechamento de qual parceiro?', body: `<div class="list">${S().clientes.filter((c) => c.ativo).map((c) => { const per = D.periodoAtual(S(), c.id); return `<a class="li" href="${per.pendente ? '#/fechamento/' + per.pendente.id : '#/novo-fechamento/' + c.id}" data-act="close"><div class="avatar">${iniciais(c.nome)}</div><div class="grow"><div class="t">${esc(c.nome)}</div><div class="s">${per.pendente ? 'Enviado pelo parceiro — conferir' : 'Previsto ' + date(per.previsto)}</div></div></a>`; }).join('')}
    <a class="li" href="#" data-act="novoParcFech"><div class="avatar">${icon('plus')}</div><div class="grow t">Cadastrar novo parceiro</div></a></div>`,
    handlers: { close: (el) => { closeModal(); if (el.getAttribute?.('href')) location.hash = el.getAttribute('href'); }, novoParcFech: () => { closeModal(); novoParceiro((nid) => (location.hash = '#/novo-fechamento/' + nid), () => common.novoFech()); } } }),
  aprovar: (el) => {
    const form = document.getElementById('frepo');
    const s = S();
    const f = s.fechamentos.find((x) => x.id === el.dataset.id);
    const repo = form ? f.reposicao.map((r) => ({ produtoId: r.produtoId, qtd: +new FormData(form).get('r:' + r.produtoId) || 0 })) : [];
    confirmar(`Aprovar o fechamento de <b>${money(f.total)}</b> e enviar ${plural(sum(repo, (r) => r.qtd), 'garrafa')} de reposição? As garrafas saem do estoque central e entram no saldo do parceiro.`, { ok: 'Aprovar' }).then((y) => {
      if (!y) return;
      let av;
      store.commit((st) => { av = D.aprovarFechamento(st, f.id, { reposicao: repo }); }, 'aprovado');
      toast('Fechamento aprovado — conta a receber gerada');
      if (av?.length) setTimeout(() => toast(av[0]), 2900);
    });
  },
  pagar: (el) => {
    const s = S();
    const f = s.fechamentos.find((x) => x.id === el.dataset.id);
    const c = D.cliente(s, f.clienteId);
    modal({ title: 'Registrar pagamento', body: `<form id="fpag" class="col"><div class="kpi"><div class="label">${esc(c.nome)}</div><div class="v">${money(f.total)}</div></div>
      <label class="field"><span>Data</span><input class="input" type="date" name="data" value="${today()}"></label>
      <label class="field"><span>Forma</span><select class="input" name="forma">${[...new Set([...c.formasPagamento, ...D.FORMAS_PAGAMENTO])].map((x) => `<option ${x === f.formaPagamento ? 'selected' : ''}>${x}</option>`).join('')}</select></label></form>`,
      foot: `<button class="btn ghost" data-act="close">Cancelar</button><button class="btn ok" data-act="ok">Confirmar recebimento</button>`,
      handlers: { ok: () => { const fd = new FormData(document.getElementById('fpag')); store.commit((st) => D.registrarPagamento(st, f.id, { data: fd.get('data'), forma: fd.get('forma') }), 'pago'); closeModal(); toast('Pagamento registrado'); } } });
  },
  despesa: () => modal({ title: 'Nova despesa', body: `<form id="fdesp" class="col"><label class="field"><span>Descrição</span><input class="input" name="descricao" required></label>
      <div class="grid g2"><label class="field"><span>Valor</span>${moneyInput('valor', 0)}</label><label class="field"><span>Data</span><input class="input" type="date" name="data" value="${today()}"></label></div>
      <label class="field"><span>Categoria (escolha ou digite uma nova)</span><input class="input" name="categoria" list="cats-desp" value="Logística" required><datalist id="cats-desp">${[...new Set(['Logística', 'Armazenagem', 'Impostos', 'Marketing', 'Frete e desembaraço', 'Compra de mercadoria', 'Pessoal', 'Outros', ...S().despesas.map((d) => d.categoria)])].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label></form>`,
    foot: `<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="ok">Salvar</button>`,
    handlers: { ok: () => { const fd = Object.fromEntries(new FormData(document.getElementById('fdesp'))); const v = parseMoney(fd.valor); if (!fd.descricao || !v) return toast('Preencha descrição e valor'); store.commit((st) => st.despesas.push({ id: uid('dp'), ...fd, valor: v, pago: true })); closeModal(); toast('Despesa lançada'); } } }),
  delDesp: (el) => confirmar('Excluir esta despesa?', { ok: 'Excluir' }).then((y) => y && store.commit((st) => { st.despesas = st.despesas.filter((d) => d.id !== el.dataset.id); })),
  csvMes: (el) => {
    const b = D.balancoMes(S(), el.dataset.m);
    const f = (v) => v.toFixed(2).replace('.', ',');
    const rows = [['Tipo', 'Data', 'Descrição', 'Categoria/forma', 'Valor']];
    for (const r of b.recebimentos) rows.push(['Recebimento', r.data, r.descricao, r.forma, f(r.valor)]);
    for (const d of b.despesas) rows.push(['Despesa', d.data, d.descricao, d.categoria, f(-d.valor)]);
    rows.push([], ['Resumo', '', 'Receitas (competência)', '', f(b.receita)], ['Resumo', '', 'Custo dos vinhos vendidos', '', f(-b.cmv)], ['Resumo', '', 'Despesas operacionais', '', f(-b.operacionais)], ['Resumo', '', 'Resultado', '', f(b.resultado)], ['Resumo', '', 'Saldo de caixa', '', f(b.saldoCaixa)]);
    download(`milterras-balanco-${el.dataset.m}.csv`, toCSV(rows), 'text/csv');
  },
  csvFin: () => {
    const s = S();
    const rows = [['Data', 'Tipo', 'Parceiro', 'Rótulo', 'Qtd', 'Preço un.', 'Receita', 'CMV']];
    for (const v of sortBy(D.vendasRealizadas(s), (v) => v.data)) rows.push([v.data, v.tipo === 'consumo' ? 'Consignação' : 'Venda direta', v.clienteId ? D.cliente(s, v.clienteId).nome : '', D.produto(s, v.produtoId).nome, v.qtd, v.precoUnit.toFixed(2).replace('.', ','), v.receita.toFixed(2).replace('.', ','), v.cmv.toFixed(2).replace('.', ',')]);
    download(`milterras-vendas-${today()}.csv`, toCSV(rows), 'text/csv');
  },
  editProduto: (el) => modalProduto(el.dataset.id),
  convidar: () => modal({ title: 'Convidar gestor', body: '<form id="fconv" class="col"><label class="field"><span>Nome de quem vai receber (opcional)</span><input class="input" name="nome" placeholder="Ex.: Sócio"></label><div class="tiny muted">Será gerado um código de uso único, válido por 7 dias.</div></form>',
    foot: '<button class="btn ghost" data-act="close">Cancelar</button><button class="btn" data-act="ok">Gerar convite</button>',
    handlers: { ok: async () => {
      try {
        const codigo = await store.rpc('criar_convite', { p_nome: new FormData(document.getElementById('fconv')).get('nome') });
        const base = new URL('../gestor/', location.href).href;
        modal({ title: 'Convite criado', body: `<div class="center"><div class="label">Código</div><div style="font-family:var(--font-t);font-size:30px;letter-spacing:.08em;color:var(--bordo)">${codigo}</div></div><p class="small">Envie o link e o código. A pessoa abre a Gestão, toca em <b>Primeiro acesso</b>, cria e-mail e senha e informa o código.</p>`,
          foot: `<a class="btn" target="_blank" rel="noopener" href="${waLink('', msgConvite(codigo, base))}">${icon('whatsapp')} Enviar pelo WhatsApp</a>` });
        carregarEquipe();
      } catch (e) { toast(e.message); }
    } } }),
  removerGestor: (el) => confirmar(`Remover o acesso de <b>${el.dataset.e}</b> à Gestão?`, { ok: 'Remover' }).then(async (y) => { if (!y) return; try { await store.rpc('remover_gestor', { p_user: el.dataset.u }); toast('Acesso removido'); carregarEquipe(); } catch (e) { toast(e.message); } }),
  cancelarConvite: (el) => store.rpc('cancelar_convite', { p_codigo: el.dataset.c }).then(() => { toast('Convite cancelado'); carregarEquipe(); }).catch((e) => toast(e.message)),
  consigDet: (el) => modalConsig(el.dataset.c),
  ondeEsta: (el) => modalOndeEsta(el.dataset.p),
  abrirApp: (el) => window.open(urlApp(el.dataset.c), '_blank', 'noopener'),
  novoCodigo: (el) => {
    const inp = el.parentElement.querySelector('input');
    const editando = el.closest('form')?.dataset.id;
    const trocar = () => { inp.value = gerarCodigo(); toast(`Novo código: ${inp.value}${editando ? ' (salve para valer)' : ''}`); };
    if (editando) confirmar('Gerar um novo código? Depois de salvar, os aparelhos do parceiro serão desconectados e ele precisará do novo código.', { ok: 'Gerar novo' }).then((y) => y && trocar()); else trocar();
  },
  copiarAcesso: (el) => {
    const c = D.cliente(S(), el.dataset.c);
    const txt = msgAcesso(c, new URL('../cliente/' + DEMO_Q, location.href).href);
    (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('Mensagem copiada — cole no e-mail ou WhatsApp'), () => modal({ title: 'Copie a mensagem', body: `<textarea class="input" style="min-height:220px">${esc(txt)}</textarea>` }));
  },
  aprovarPedido: (el) => {
    const s = S();
    const p = D.pedidos(s).find((x) => x.id === el.dataset.id);
    const est = D.estoqueCentral(s);
    modal({ title: `Aprovar pedido · ${esc(D.cliente(s, p.clienteId)?.nome)}`, body: `<form id="fped" class="col">
      <div class="card pad-0"><div class="list" style="padding:0 14px">${p.itens.map((i) => { const pr = D.produto(s, i.produtoId); return `<div class="li">${thumb(pr, 'sm')}<div class="grow"><div class="t">${esc(pr.nome)}</div><div class="s">Pedido: ${i.qtd} · central: ${est[i.produtoId]}</div></div>${stepper('q:' + i.produtoId, Math.min(i.qtd, Math.max(0, est[i.produtoId])), { max: Math.max(0, est[i.produtoId]) })}</div>`; }).join('')}</div></div>
      ${p.obs ? `<div class="small"><b>Observação:</b> ${esc(p.obs)}</div>` : ''}
      <label class="field"><span>Entrar no kanban como</span><select class="input" name="status">${Object.entries(D.STATUS_ENTREGA).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label></form>`,
      foot: '<button class="btn ghost" data-act="close">Cancelar</button><button class="btn ok" data-act="ok">Aprovar e criar remessa</button>',
      handlers: { step: stepHandler, qty: () => {}, ok: () => {
        const fd = new FormData(document.getElementById('fped'));
        const itens = p.itens.map((i) => ({ produtoId: i.produtoId, qtd: +fd.get('q:' + i.produtoId) || 0 }));
        if (!itens.some((i) => i.qtd > 0)) return toast('Nenhuma quantidade para enviar — use Recusar');
        store.commit((st) => D.aprovarPedido(st, p.id, { itens, status: fd.get('status') }), 'pedido');
        closeModal(); toast('Pedido aprovado — remessa criada');
      } } });
  },
  recusarPedido: (el) => modal({ title: 'Recusar pedido', body: '<form id="frec"><label class="field"><span>Motivo (o parceiro verá)</span><input class="input" name="motivo" maxlength="200"></label></form>',
    foot: '<button class="btn ghost" data-act="close">Voltar</button><button class="btn" data-act="ok">Recusar</button>',
    handlers: { ok: () => { const m = new FormData(document.getElementById('frec')).get('motivo'); store.commit((st) => D.recusarPedido(st, el.dataset.id, m)); closeModal(); toast('Pedido recusado'); } } }),
  formaFech: (el) => { const v = el.value.replace(' (fora do cadastro)', ''); store.commit((st) => { st.fechamentos.find((x) => x.id === el.dataset.id).formaPagamento = v; }); toast(`Forma de pagamento: ${v}`); },
  avancarRem: (el) => {
    const st = el.dataset.st;
    if (st === 'entregue') return modal({ title: 'Confirmar entrega', body: `<form id="fent" class="col"><label class="field"><span>Data da entrega</span><input class="input" type="date" name="data" value="${today()}"></label><label class="field"><span>Recebido por</span><input class="input" name="quem" placeholder="Nome de quem recebeu"></label></form>`,
      foot: '<button class="btn ghost" data-act="close">Cancelar</button><button class="btn ok" data-act="ok">Confirmar entrega</button>',
      handlers: { ok: () => { const fd = new FormData(document.getElementById('fent')); store.commit((s2) => D.avancarRemessa(s2, el.dataset.id, 'entregue', { data: fd.get('data'), recebidoPor: String(fd.get('quem') || '').trim() })); closeModal(); toast('Entrega confirmada — saldo do parceiro atualizado'); } } });
    store.commit((s2) => D.avancarRemessa(s2, el.dataset.id, st));
    toast(`Remessa: ${D.STATUS_ENTREGA[st].label}`);
  },
  voltarRem: (el) => { store.commit((s2) => D.avancarRemessa(s2, el.dataset.id, el.dataset.st)); toast(`Remessa voltou para: ${D.STATUS_ENTREGA[el.dataset.st].label}`); },
  salvarEmpresa: (f) => { const fd = Object.fromEntries(new FormData(f)); store.commit((st) => Object.assign(st.meta, fd)); toast('Dados salvos'); },
  backup: () => download(`milterras-backup-${today()}.json`, store.exportJSON()),
  restore: (el) => { const file = el.files[0]; if (!file) return; file.text().then((t) => { try { store.importJSON(t); toast('Backup restaurado'); } catch (e) { toast('Arquivo inválido'); } }); },
  resetDemo: () => confirmar('Recarregar os dados de demonstração? Tudo o que foi lançado neste navegador será substituído.', { ok: 'Recarregar' }).then((y) => { if (y) { store.reset(); toast('Demonstração recarregada'); } }),
  zerar: () => confirmar('Apagar parceiros, movimentações e financeiro fictícios, mantendo apenas o catálogo de 14 rótulos? Use para começar a operação real.', { ok: 'Começar do zero' }).then((y) => { if (y) { store.importJSON(JSON.stringify(seed({ vazio: true }))); toast('Pronto! Cadastre a primeira entrada de estoque.'); location.hash = '#/estoque'; } }),
};

delegate(app, new Proxy({}, { get: (_, k) => handlers[k] || common[k] }));
// Recomendações por parceiro calculadas aqui (o gestor vê toda a rede) e gravadas no cadastro,
// para o app do parceiro sugerir novos rótulos sem acesso aos dados dos outros parceiros.
async function aposEntrar() {
  const s = S();
  if (!s) return;
  // remessas antigas ganham protocolo e fechamentos ganham número (rastreabilidade)
  const copia = JSON.parse(JSON.stringify({ movs: s.movs, clientes: s.clientes, fechamentos: s.fechamentos }));
  if (D.migrarProtocolos(copia)) store.commit((st) => D.migrarProtocolos(st));
  const novas = {};
  for (const c of s.clientes.filter((x) => x.ativo)) {
    const r = D.recomendacoes(s, c.id, 3).map((x) => x.produtoId);
    if (JSON.stringify(r) !== JSON.stringify(c.recomendados || [])) novas[c.id] = r;
  }
  if (Object.keys(novas).length) store.commit((st) => { for (const [cid, r] of Object.entries(novas)) D.cliente(st, cid).recomendados = r; });
}

store.subscribe((s, msg, externo) => {
  if (!S() || !current.view) return; // ainda carregando
  if (externo && msg === 'fechamento') toast('Novo fechamento recebido de um parceiro');
  if (externo && msg === 'pedidos') toast('Novo pedido de reposição recebido');
  if (current.pattern === '/novo-fechamento/:cid' && externo) return;
  if (document.querySelector('.overlay') && externo) return; // não fechar formulários abertos
  rerender();
});
store.onErro((m) => toast('Não foi possível salvar: ' + m));
store.onRecuperacao(() => modal({ title: 'Criar nova senha', body: '<form id="fns" class="col"><label class="field"><span>Nova senha (mínimo 8 caracteres)</span><input class="input" name="senha" type="password" minlength="8" autocomplete="new-password"></label></form>',
  foot: '<button class="btn" data-act="ok">Salvar senha</button>',
  handlers: { ok: async () => { const v = new FormData(document.getElementById('fns')).get('senha'); if (String(v).length < 8) return toast('Mínimo 8 caracteres'); try { await store.novaSenha(v); closeModal(); toast('Senha alterada'); } catch (e) { toast(e.message); } } } }));
store.onStatus(() => { const el = document.querySelector('.side .foot .sync'); if (el) el.outerHTML = syncBadge(); });
registerSW();
app.innerHTML = `<div class="login"><img src="${asset('assets/logo/logo_v_negativo.png')}" alt="Mil Terras" style="width:200px;opacity:.9"></div>`;
// Retorno de link de e-mail com erro (ex.: link expirado): mostra explicação em vez de uma tela quebrada
const erroLink = new URLSearchParams(location.hash.replace(/^#\/?/, '')).get('error_code');
if (erroLink) history.replaceState(null, '', location.pathname + location.search);
store.init('gestor').then(async (ok) => {
  if (ok) await aposEntrar();
  go();
  if (erroLink) modal({ title: 'Link inválido ou expirado', body: `<p class="small">O link do e-mail já foi usado ou expirou${erroLink === 'otp_expired' ? ' (alguns provedores de e-mail abrem o link antes de você para verificar segurança)' : ''}.</p>
    <p class="small">Tente <b>entrar</b> com seu e-mail e senha: se a confirmação tiver funcionado, você entra normalmente. Se aparecer "Confirme o e-mail", use <b>Primeiro acesso</b> de novo para receber outro link.</p>` });
});
