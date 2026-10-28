// App do Parceiro — restaurantes, bares e lojas com vinhos Mil Terras em consignação
import * as store from '../core/store.js';
import * as D from '../core/domain.js';
import { HARMONIZA } from '../core/catalogo.js';
import { money, money0, moneyK, int, percent, date, dateShort, relDays, today, addDays, diffDays, esc, sum, plural, sortBy } from '../core/fmt.js';
import { icon, router, delegate, modal, closeModal, confirmar, toast, kpi, badge, empty, thumb, stepper, stepHandler, fichaVinho, iniciais, qtdBadge, waLink, download, toCSV, asset, instalar, registerSW, moneyInput, parseMoney } from '../core/ui.js';
import { chart, mountCharts, resetCharts, hbars, heatmap } from '../core/charts.js';
import { novoWizard, renderWizard, wizardHandlers, statusBadge, ajustesHTML } from '../core/fechamento-ui.js';

const app = document.getElementById('app');
const S = () => store.get();
const SESSION = 'milterras:parceiro';
const cid = () => (store.modo === 'local' ? localStorage.getItem(SESSION) : store.perfil()?.clienteId);
const C = () => D.cliente(S(), cid());

const NAV = [['#/inicio', 'home', 'Início'], ['#/relatorios', 'chart', 'Relatórios'], ['#/vender', 'plus', 'Vender'], ['#/fechamento', 'receipt', 'Fechamento'], ['#/mais', 'menu', 'Mais']];
const SIDE = [['#/inicio', 'home', 'Início'], ['#/vender', 'plus', 'Registrar venda'], ['#/estoque', 'box', 'Meu estoque'], ['#/relatorios', 'chart', 'Relatórios'], ['#/fechamento', 'receipt', 'Fechamento'], ['#/carta', 'wine', 'Carta e harmonização'], ['#/ajustes', 'gear', 'Equipe e preços']];

let current = {};
let handlers = {};
let wz = null;

function shell(title, content, { back } = {}) {
  const c = C();
  const route = '#' + (location.hash.slice(1).split('?')[0] || '');
  const on = (h) => route === h || route.startsWith(h + '/');
  const per = D.periodoAtual(S(), c.id);
  const due = !per.pendente && per.previsto <= addDays(today(), 1);
  const b = (h) => (h === '#/fechamento' && due ? '<span class="badge dot">!</span>' : '');
  return `<div class="shell">
    <aside class="side"><div class="brand"><img src="${asset('assets/logo/logo_h_negativo.png')}" alt="Mil Terras"><div class="who">${esc(c.nome)}</div></div>
      ${SIDE.map(([h, ic, n]) => `<a class="nav-a ${on(h) ? 'on' : ''}" href="${h}">${icon(ic)}<span>${n}</span>${b(h)}</a>`).join('')}
      <div class="foot"><span class="sync">Conectado à Mil Terras</span><br><a href="#" data-act="logout" style="color:#C9B3AC">Sair</a></div></aside>
    <div>
      <header class="topbar">${back ? `<button data-act="back" aria-label="Voltar">${icon('arrowL')}</button>` : `<img src="${asset('assets/logo/simbolo_negativo.png')}" alt="">`}<div class="t ellipsis">${title}</div><a style="color:#fff" target="_blank" rel="noopener" href="${waLink(S().meta.whatsapp, `Olá, Mil Terras! Aqui é do ${c.nome}.`)}" aria-label="Falar com a Mil Terras">${icon('whatsapp')}</a></header>
      <main class="main">${content}</main></div>
    <nav class="tabbar">${NAV.map(([h, ic, n]) => h === '#/vender' ? `<a href="${h}" class="fab"><span class="ic">${icon('plus')}</span></a>` : `<a href="${h}" class="${on(h) || (h === '#/mais' && ['#/carta', '#/ajustes', '#/estoque'].some(on)) ? 'on' : ''}">${icon(ic)}<span>${n}</span>${b(h)}</a>`).join('')}</nav>
  </div>`;
}
const pageHead = (t, sub = '', actions = '') => `<div class="pagehead"><div><h1>${t}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="row wrap">${actions}</div></div>`;

// ---------- Início ----------
function vInicio() {
  const s = S(), c = C();
  const per = D.periodoAtual(s, c.id);
  const rv = D.resumoVendas(s, c.id, per.marco);
  const est = D.saldoEstimado(s, c.id);
  const acabando = Object.entries(est).filter(([pid, q]) => q <= 1 && (D.saldoCliente(s, c.id)[pid] || 0) > 0);
  const ultimo = D.fechamentosDe(s, c.id).filter((f) => f.status !== 'enviado').pop();
  const dias = diffDays(per.previsto, today());
  const hoje = D.resumoVendas(s, c.id, addDays(today(), -1));
  const topG = rv.porGarcom[0];
  const transito = D.remessas(s).filter((r) => r.clienteId === c.id && r.status !== 'entregue');
  return shell('Início', `
    <div class="pagehead"><div><div class="label">${esc(c.cidade)}</div><h1 style="margin-top:4px">${esc(c.nome)}</h1></div><a class="btn hide-m" href="#/vender">${icon('plus')} Registrar venda</a></div>
    <div class="card dark">
      <div class="row between wrap"><div class="label">Período atual · desde ${date(per.desde)}</div>${per.pendente ? badge('Fechamento enviado', 'warn') : badge(dias < 0 ? `fechamento atrasado ${-dias}d` : dias === 0 ? 'fechamento hoje' : `fecha em ${dias} dias`, dias <= 0 ? 'crit' : '')}</div>
      <div class="grid g4 mt" style="gap:14px">
        <div class="kpi"><div class="label">Vendidas</div><div class="v">${int(rv.garrafas)}</div><div class="d">${hoje.garrafas} hoje</div></div>
        <div class="kpi"><div class="label">Receita na carta</div><div class="v">${moneyK(rv.receita)}</div></div>
        <div class="kpi"><div class="label">A pagar Mil Terras</div><div class="v">${moneyK(rv.custo)}</div></div>
        <div class="kpi"><div class="label">Seu lucro</div><div class="v" style="color:#F2D9A8">${moneyK(rv.receita - rv.custo)}</div><div class="d">${percent(rv.receita ? (rv.receita - rv.custo) / rv.receita : 0)} de margem</div></div>
      </div>
      ${per.pendente ? `<div class="small mt" style="color:#E3C9A2">Seu fechamento de ${money(per.pendente.total)} foi enviado e está em conferência pela Mil Terras.</div>`
        : `<a class="btn ${dias <= 1 ? 'gold' : 'light'} block mt" href="#/fechamento/novo">${icon('receipt')} ${dias <= 1 ? 'Fazer o fechamento agora' : 'Antecipar fechamento'}</a>`}
    </div>
    ${transito.map((r) => `<div class="ins info mt"><span class="ic">${icon('truck')}</span><span class="grow"><div class="t">Reposição ${{ a_separar: 'em preparação', separado: 'separada, sai em breve', em_rota: 'a caminho' }[r.status]}</div><div class="s">${r.itens.map((i) => `${i.qtd}× ${esc(D.produto(s, i.produtoId).nome)}`).join(', ')}</div></span>${badge(D.STATUS_ENTREGA[r.status].label, D.STATUS_ENTREGA[r.status].tone)}</div>`).join('')}
    ${acabando.length ? `<div class="ins atencao mt"><span class="ic">${icon('alert')}</span><span class="grow"><div class="t">${plural(acabando.length, 'rótulo acabando', 'rótulos acabando')}</div><div class="s">${acabando.map(([pid, q]) => `${esc(D.produto(s, pid).nome)} (${q})`).join(', ')}</div></span>
      <a class="btn sm gold" target="_blank" rel="noopener" href="${waLink(s.meta.whatsapp, `Olá, Mil Terras! Aqui é do ${c.nome}. Precisamos de reposição antecipada de: ${acabando.map(([pid]) => D.produto(s, pid).nome).join(', ')}.`)}">Pedir</a></div>` : ''}
    <div class="grid g2 mt">
      <div class="card"><div class="head"><h2>Mais vendidos no período</h2><a class="small" href="#/relatorios">ver relatórios</a></div>
        ${rv.porProduto.length ? hbars(rv.porProduto.slice(0, 5).map((x) => ({ label: D.produto(s, x.produtoId).nome, value: x.qtd, sub: money(x.receita) + ' na carta' })), (v) => int(v) + ' gf') : empty('Nenhuma venda registrada ainda neste período.<br><a href="#/vender">Registrar a primeira</a>')}</div>
      <div class="col">
        ${topG ? `<div class="card row">${'<div class="avatar" style="background:var(--dourado);color:#fff">' + icon('star') + '</div>'}<div class="grow"><div class="label">Destaque da equipe</div><div style="font-weight:600;font-size:16px">${esc(D.garcom(c, topG.garcomId)?.nome || '—')}</div><div class="small muted">${plural(topG.qtd, 'garrafa')} · ${money0(topG.receita)} no período</div></div></div>` : ''}
        ${ultimo ? `<a class="card row" href="#/fechamento/${ultimo.id}" style="color:inherit"><div class="avatar">${icon('receipt')}</div><div class="grow"><div class="label">Último fechamento</div><div style="font-weight:600">${money(ultimo.total)}</div><div class="small muted">${date(ultimo.inicio)} – ${date(ultimo.fim)}</div></div>${statusBadge(ultimo)}</a>` : ''}
        <a class="card row" href="#/carta" style="color:inherit"><div class="avatar">${icon('wine')}</div><div class="grow"><div style="font-weight:600">Qual vinho para este prato?</div><div class="small muted">Assistente de harmonização para a equipe</div></div>${icon('arrowR')}</a>
      </div>
    </div>`);
}

// ---------- Registrar venda ----------
function vVender() {
  const s = S(), c = C();
  const est = D.saldoEstimado(s, c.id);
  const saldo = D.saldoCliente(s, c.id);
  const pids = sortBy(Object.keys(saldo).filter((p) => saldo[p] > 0 || est[p] > 0), (p) => -(est[p] || 0) * 0 + (est[p] > 0 ? 0 : 1));
  const hoje = sortBy(D.vendasCliente(s, c.id, addDays(today(), -1)), (v) => v.hora || '', true);
  return shell('Registrar venda', `
    ${pageHead('Registrar venda', 'Toque no vinho vendido. Leva 3 segundos e alimenta seus relatórios.')}
    <div class="wine-grid">${pids.map((pid) => { const p = D.produto(s, pid); const q = est[pid] || 0; return `<button class="wine ${q <= 0 ? 'off' : ''}" data-act="vender" data-p="${pid}" style="font:inherit"><span class="q">${qtdBadge(q)}</span><img src="${asset(p.foto)}" alt="" loading="lazy"><div class="n">${esc(p.nome)}</div><div class="tiny muted">${money(D.precoCarta(s, c, pid))} na carta</div></button>`; }).join('')}</div>
    <div class="card mt"><div class="head"><h2>Vendas de hoje</h2><span class="small muted">${plural(sum(hoje, (v) => v.qtd), 'garrafa')} · ${money(sum(hoje, (v) => v.qtd * v.precoCarta))}</span></div>
      <div class="list">${hoje.map((v) => `<div class="li">${thumb(D.produto(s, v.produtoId), 'sm')}<div class="grow"><div class="t">${v.qtd}× ${esc(D.produto(s, v.produtoId).nome)}</div><div class="s">${esc(D.garcom(c, v.garcomId)?.nome || 'Sem garçom')}${v.hora ? ' · ' + v.hora : ''}</div></div><div class="num">${money(v.qtd * v.precoCarta)}</div><button class="iconbtn" data-act="desfazer" data-id="${v.id}" aria-label="Desfazer">${icon('trash')}</button></div>`).join('') || empty('Nenhuma venda hoje ainda.')}</div></div>`);
}

let ultimoGarcom = null;
function modalVenda(pid) {
  const s = S(), c = C();
  const p = D.produto(s, pid);
  const est = D.saldoEstimado(s, c.id)[pid] || 0;
  const gs = c.garcons.filter((g) => g.ativo);
  let g = ultimoGarcom && gs.some((x) => x.id === ultimoGarcom) ? ultimoGarcom : gs[0]?.id;
  modal({ title: 'Registrar venda', body: `
    <div class="row">${thumb(p)}<div class="grow"><div style="font-family:var(--font-t);font-size:18px">${esc(p.nome)}</div><div class="small muted">${money(D.precoCarta(s, c, pid))} na carta · ${est} em estoque</div></div></div>
    <div class="row between mt"><span class="label">Quantidade</span>${stepper('qtd', 1, { min: 1, max: Math.max(1, est) })}</div>
    <div class="label mt mb">Quem vendeu?</div>
    <div class="chips" id="gchips">${gs.map((x) => `<button type="button" class="chip ${x.id === g ? 'on' : ''}" data-act="g" data-id="${x.id}">${esc(x.nome)}</button>`).join('')}</div>
    ${est <= 0 ? `<div class="small mt" style="color:var(--warn)">${icon('alert')} O sistema não tem saldo deste vinho aqui. Confira o estoque no fechamento.</div>` : ''}`,
    foot: `<button class="btn lg block ok" data-act="ok">${icon('check')} Registrar</button>`,
    handlers: {
      step: stepHandler,
      g: (el) => { g = el.dataset.id; el.parentElement.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b === el)); },
      ok: () => {
        const qtd = Math.max(1, +document.querySelector('.modal [name=qtd]').value || 1);
        const now = new Date();
        store.commit((st) => D.registrarVenda(st, { clienteId: c.id, produtoId: pid, qtd, garcomId: g, hora: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}` }), 'venda');
        ultimoGarcom = g;
        closeModal(); toast(`✓ ${qtd}× ${p.nome} registrado`);
      },
    } });
}

// ---------- Estoque ----------
function vEstoque() {
  const s = S(), c = C();
  const est = D.saldoEstimado(s, c.id);
  const saldo = D.saldoCliente(s, c.id);
  const pids = Object.keys(saldo).filter((p) => saldo[p] > 0);
  const valor = sum(pids, (p) => (est[p] || 0) * D.produto(s, p).preco);
  return shell('Meu estoque', `
    ${pageHead('Meu estoque Mil Terras', `${plural(sum(pids, (p) => est[p] || 0), 'garrafa')} · ${money0(valor)} em consignação, sem custo para você`)}
    <div class="card pad-0"><div class="list" style="padding:0 16px">${pids.map((pid) => { const p = D.produto(s, pid); const r = D.taxaDiaria(s, c.id, pid) * 7; return `<div class="li click" data-act="ficha" data-p="${pid}">${thumb(p)}<div class="grow"><div class="t">${esc(p.nome)}</div><div class="s">${p.tipo} · ${esc(p.regiao)} · vende ~${r.toFixed(1).replace('.', ',')}/semana</div><div class="s">Carta ${money(D.precoCarta(s, c, pid))} · custo ${money(p.preco)}</div></div>${qtdBadge(est[pid] || 0)}</div>`; }).join('')}</div></div>
    <div class="tiny muted mt-s">Quantidade estimada = saldo do último fechamento + reposições − vendas registradas no app.</div>`, { back: true });
}

// ---------- Relatórios ----------
function vRelatorios({ query }) {
  const s = S(), c = C();
  const per = D.periodoAtual(s, c.id);
  const filtros = [['periodo', 'Período atual', per.inicio], ['30', '30 dias', addDays(today(), -30)], ['90', '90 dias', addDays(today(), -90)], ['180', '6 meses', addDays(today(), -180)]];
  const f = filtros.find((x) => x[0] === (query.p || '30')) || filtros[1];
  const de = f[2];
  const rv = D.resumoVendas(s, c.id, f[0] === 'periodo' ? per.marco : de);
  const dias = Math.max(1, diffDays(today(), de));
  const semanal = dias > 45;
  const buckets = {};
  for (const v of rv.vendas) {
    const k = semanal ? addDays(v.data, -((new Date(v.data + 'T12:00').getDay() + 6) % 7)) : v.data;
    buckets[k] = (buckets[k] || 0) + v.qtd * v.precoCarta;
  }
  const serie = [];
  for (let d = semanal ? addDays(de, -((new Date(de + 'T12:00').getDay() + 6) % 7)) : addDays(de, 1); d <= today(); d = addDays(d, semanal ? 7 : 1)) serie.push({ label: dateShort(d), value: buckets[d] || 0 });
  const gs = rv.porGarcom.filter((x) => x.garcomId);
  const pids = rv.porProduto.map((x) => x.produtoId);
  return shell('Relatórios', `
    ${pageHead('Relatórios de vendas', 'Com base nas vendas registradas pela equipe', `<button class="btn ghost" data-act="csv" data-de="${de}">${icon('download')} Exportar</button>`)}
    <div class="seg mb" style="max-width:100%;overflow-x:auto">${filtros.map(([k, n]) => `<button class="${f[0] === k ? 'on' : ''}" data-act="goto" data-h="#/relatorios?p=${k}">${n}</button>`).join('')}</div>
    <div class="grid g4">${kpi('Garrafas vendidas', int(rv.garrafas), `${(rv.garrafas / dias).toFixed(1).replace('.', ',')} por dia`)}${kpi('Receita na carta', moneyK(rv.receita), `ticket ${money0(rv.garrafas ? rv.receita / rv.garrafas : 0)}/garrafa`)}${kpi('Custo Mil Terras', moneyK(rv.custo))}${kpi('Seu lucro', moneyK(rv.receita - rv.custo), `${percent(rv.receita ? (rv.receita - rv.custo) / rv.receita : 0)} de margem`)}</div>
    <div class="card mt"><div class="head"><h2>Receita ${semanal ? 'por semana' : 'por dia'}</h2></div>${chart({ type: 'columns', height: 210, data: serie, fmt: money0, fmtAxis: moneyK })}</div>
    <div class="grid g2 mt">
      <div class="card"><div class="head"><h2>Receita por vinho</h2></div>${rv.porProduto.length ? hbars(rv.porProduto.map((x) => ({ label: D.produto(s, x.produtoId).nome, value: x.receita, sub: `${x.qtd} garrafas · lucro ${money0(x.receita - x.custo)}` })), moneyK) : empty('Sem vendas no período')}</div>
      <div class="card"><div class="head"><h2>Ranking da equipe</h2></div>${gs.length ? hbars(gs.map((x) => ({ label: D.garcom(c, x.garcomId)?.nome || '—', value: x.receita, sub: `${x.qtd} garrafas` })), moneyK, { color: 'var(--dourado)' }) : empty('Sem vendas no período')}</div>
    </div>
    ${gs.length && pids.length ? `<div class="card mt"><div class="head"><h2>Quem vende qual rótulo</h2><span class="small muted">garrafas</span></div>
      ${heatmap(gs.map((x) => x.garcomId), pids, (g, p) => rv.matriz[g]?.[p] || 0, { rowLabel: (g) => D.garcom(c, g)?.nome || '—', colLabel: (p) => D.produto(s, p).nome })}
      <div class="tiny muted mt-s">Use para treinar a equipe: quem vende pouco um rótulo pode aprender com quem vende muito.</div></div>` : ''}
    <div class="card pad-0 mt"><div style="padding:16px 16px 0"><h2>Rentabilidade por vinho</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vinho</th><th class="r">Garrafas</th><th class="r">Preço carta</th><th class="r hide-m">Custo</th><th class="r">Lucro/gf</th><th class="r">Lucro total</th></tr></thead>
      <tbody>${sortBy(rv.porProduto, (x) => -(x.receita - x.custo)).map((x) => { const p = D.produto(s, x.produtoId); const pc = x.receita / x.qtd, cu = x.custo / x.qtd; return `<tr><td>${esc(p.nome)}</td><td class="r">${x.qtd}</td><td class="r">${money(pc)}</td><td class="r hide-m">${money(cu)}</td><td class="r">${money(pc - cu)}</td><td class="r"><b>${money(x.receita - x.custo)}</b></td></tr>`; }).join('')}</tbody></table></div></div>`);
}

// ---------- Fechamento ----------
function vFechamentos() {
  const s = S(), c = C();
  const per = D.periodoAtual(s, c.id);
  const fs = D.fechamentosDe(s, c.id).reverse();
  const rv = D.resumoVendas(s, c.id, per.marco);
  return shell('Fechamento', `
    ${pageHead('Fechamento', `Acerto a cada ${c.cicloDias} dias · você paga só o que vendeu`)}
    ${per.pendente ? `<div class="card" style="border-left:3px solid var(--warn)"><div class="row between wrap"><div><div class="label">Enviado em ${date(per.pendente.enviadoEm)}</div><div style="font-weight:600;font-size:18px;margin-top:4px">${money(per.pendente.total)} · ${plural(per.pendente.garrafas, 'garrafa')}</div><div class="small muted">A Mil Terras está conferindo. Você será avisado quando a reposição sair.</div></div><a class="btn ghost" href="#/fechamento/${per.pendente.id}">Ver</a></div></div>`
      : `<div class="card dark"><div class="label">Próximo fechamento · ${date(per.previsto)} (${relDays(per.previsto)})</div>
        <div class="row between wrap mt"><div><div class="v" style="font-family:var(--font-t);font-size:26px">${money(rv.custo)}</div><div class="small" style="color:#E3C9A2">estimado até agora · ${plural(rv.garrafas, 'garrafa lançada', 'garrafas lançadas')}</div></div>
        <a class="btn gold lg" href="#/fechamento/novo">${icon('receipt')} Fazer fechamento</a></div></div>`}
    <h2 class="mt">Histórico</h2>
    <div class="card pad-0 mt-s"><div class="list" style="padding:0 16px">${fs.filter((f) => f.status !== 'enviado').map((f) => `<a class="li" href="#/fechamento/${f.id}"><div class="grow"><div class="t">${date(f.inicio)} – ${date(f.fim)}</div><div class="s">${plural(f.garrafas, 'garrafa')} · ${esc(f.formaPagamento)}</div></div><div class="right"><div class="num" style="font-weight:600">${money(f.total)}</div>${statusBadge(f)}</div></a>`).join('') || empty('Nenhum fechamento ainda')}</div></div>`);
}

function vNovoFechamento() {
  const s = S(), c = C();
  const per = D.periodoAtual(s, c.id);
  if (per.pendente) { location.hash = `#/fechamento/${per.pendente.id}`; return ''; }
  if (!wz || wz.cid !== c.id) wz = novoWizard(s, c.id);
  handlers = wizardHandlers(wz, rerender, store.commit, (f) => {
    wz = null;
    location.hash = `#/fechamento/${f.id}?enviado=1`;
  }, 'cliente', toast);
  return shell('Fechamento', `<div style="max-width:760px">${renderWizard(s, wz, { modo: 'cliente' })}</div>`, { back: true });
}

function vFechamento({ id, query }) {
  const s = S(), c = C();
  const f = s.fechamentos.find((x) => x.id === id && x.clienteId === c.id);
  if (!f) return shell('Fechamento', empty('Fechamento não encontrado'), { back: true });
  const repo = f.reposicaoEnviada || f.reposicao || [];
  return shell('Fechamento', `
    ${query.enviado ? `<div class="card mb" style="background:var(--ok-bg);border-color:transparent"><div class="row">${icon('check')}<div><b>Fechamento enviado!</b><div class="small">A Mil Terras recebeu e vai conferir. A reposição sai logo após a aprovação.</div></div></div></div>` : ''}
    <div class="pagehead"><div><div class="label">${date(f.inicio)} – ${date(f.fim)}</div><h1 style="margin-top:4px">${money(f.total)}</h1><div class="sub row gap-s">${statusBadge(f)} ${f.vencimento && f.status === 'aprovado' ? `<span>vence ${date(f.vencimento)}</span>` : ''}</div></div>
      <div class="row">${f.status === 'aprovado' && f.formaPagamento === 'PIX' ? `<button class="btn" data-act="pix">PIX copia e cola</button>` : ''}<button class="btn ghost" data-act="print">${icon('print')} Imprimir</button></div></div>
    <div class="card pad-0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vinho</th><th class="r">Saldo</th><th class="r">Contado</th><th class="r">Vendido</th><th class="r">Valor</th></tr></thead>
      <tbody>${f.itens.map((i) => `<tr><td>${esc(D.produto(s, i.produtoId).nome)}</td><td class="r">${i.saldoAnterior}</td><td class="r">${i.contagem}</td><td class="r"><b>${i.vendido}</b></td><td class="r">${money(i.valor)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total · ${esc(f.formaPagamento)}</td><td class="r">${f.garrafas}</td><td class="r">${money(f.total)}</td></tr></tfoot></table></div></div>
    ${ajustesHTML(s, f)}
    ${repo.length ? `<div class="card mt"><div class="head"><h2>Reposição ${f.reposicaoEnviada ? 'enviada' : 'solicitada'}</h2>${f.remessaId && D.remessas(s).find((r) => r.id === f.remessaId) ? badge(D.STATUS_ENTREGA[D.remessas(s).find((r) => r.id === f.remessaId).status].label, D.STATUS_ENTREGA[D.remessas(s).find((r) => r.id === f.remessaId).status].tone) : ''}</div><div class="list">${repo.map((r) => `<div class="li">${thumb(D.produto(s, r.produtoId), 'sm')}<div class="grow">${esc(D.produto(s, r.produtoId).nome)}</div><b>${r.qtd}</b></div>`).join('')}</div></div>` : ''}`, { back: true });
}

// ---------- Carta & harmonização ----------
function vCarta({ query }) {
  const s = S(), c = C();
  const est = D.saldoEstimado(s, c.id);
  const prato = query.prato;
  let lista = s.produtos.filter((p) => p.ativo);
  if (prato && HARMONIZA[prato]) {
    const kws = HARMONIZA[prato];
    lista = lista.map((p) => ({ p, score: kws.reduce((a, k) => a + (p.harmonizacao.toLowerCase().includes(k) ? 1 : 0), 0) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || (est[b.p.id] || 0) - (est[a.p.id] || 0)).map((x) => x.p);
  }
  lista = sortBy(lista, (p) => ((est[p.id] || 0) > 0 ? 0 : 1));
  return shell('Carta', `
    ${pageHead('Carta e harmonização', 'Ajude a equipe a indicar o vinho certo para cada prato')}
    <div class="label mb">O cliente vai comer…</div>
    <div class="chips mb">${Object.keys(HARMONIZA).map((k) => `<button class="chip ${prato === k ? 'on' : ''}" data-act="goto" data-h="#/carta${prato === k ? '' : '?prato=' + encodeURIComponent(k)}">${k}</button>`).join('')}</div>
    <div class="wine-grid">${lista.map((p) => `<button class="wine ${(est[p.id] || 0) > 0 ? '' : 'off'}" data-act="ficha" data-p="${p.id}" style="font:inherit"><span class="q">${(est[p.id] || 0) > 0 ? badge('Na casa', 'ok') : badge('Pedir', '')}</span><img src="${asset(p.foto)}" alt="" loading="lazy"><div class="n">${esc(p.nome)}</div><div class="tiny muted">${p.tipo} · ${esc(p.regiao)}</div><div class="tiny serif" style="color:var(--bordo)">${esc(p.harmonizacao)}</div></button>`).join('') || empty('Nenhum rótulo para esta combinação')}</div>`);
}

// ---------- Mais / ajustes ----------
function vMais() {
  const c = C();
  return shell('Mais', `<div class="card pad-0"><div class="list" style="padding:0 16px">
    ${[['#/estoque', 'box', 'Meu estoque'], ['#/carta', 'wine', 'Carta e harmonização'], ['#/ajustes', 'gear', 'Equipe e preços da carta']].map(([h, ic, n]) => `<a class="li" href="${h}"><span class="avatar">${icon(ic)}</span><div class="grow t">${n}</div>${icon('arrowR')}</a>`).join('')}
    <a class="li" target="_blank" rel="noopener" href="${waLink(S().meta.whatsapp, `Olá, Mil Terras! Aqui é do ${c.nome}.`)}"><span class="avatar">${icon('whatsapp')}</span><div class="grow t">Falar com a Mil Terras</div></a>
    <a class="li" href="#" data-act="install"><span class="avatar">${icon('download')}</span><div class="grow t">Instalar na tela inicial</div></a>
    <a class="li" href="#" data-act="logout"><span class="avatar">${icon('logout')}</span><div class="grow t">Sair</div></a></div></div>`);
}

function vAjustes() {
  const s = S(), c = C();
  const saldo = D.saldoCliente(s, c.id);
  const pids = s.produtos.filter((p) => saldo[p.id] > 0 || c.precosCarta?.[p.id]);
  return shell('Equipe e preços', `
    ${pageHead('Equipe e preços')}
    <div class="grid g2">
      <div class="card"><div class="head"><h2>Equipe de salão</h2></div>
        <div class="list">${c.garcons.filter((g) => g.ativo).map((g) => `<div class="li"><div class="avatar">${iniciais(g.nome)}</div><div class="grow t">${esc(g.nome)}</div><button class="iconbtn" data-act="rmG" data-id="${g.id}" aria-label="Remover">${icon('trash')}</button></div>`).join('')}</div>
        <form class="row mt" data-onsubmit="addG"><input class="input" name="nome" placeholder="Nome do garçom" required><button class="btn">${icon('plus')}</button></form></div>
      <div class="card"><div class="head"><h2>Preços na sua carta</h2></div><div class="small muted mb">Usados para calcular sua receita e lucro. O custo é o preço de tabela Mil Terras.</div>
        <form data-onsubmit="precos"><div class="list">${pids.map((p) => `<div class="li"><div class="grow"><div class="t">${esc(p.nome)}</div><div class="s">custo ${money(p.preco)}</div></div>${moneyInput(p.id, D.precoCarta(s, c, p.id), { width: 130 })}</div>`).join('')}</div><button class="btn block mt">Salvar preços</button></form></div>
    </div>
    <div class="card mt"><div class="head"><h2>Seu cadastro na Mil Terras</h2></div><div class="grid g3 small">
      <div><div class="label">Formas de pagamento</div>${c.formasPagamento.join(', ')}</div><div><div class="label">Prazo</div>${c.prazoDias} dias após conferência</div><div><div class="label">Ciclo</div>a cada ${c.cicloDias} dias</div></div>
      <div class="tiny muted mt">Para alterar, fale com a Mil Terras.</div></div>`, { back: true });
}

// ---------- Login ----------
function vLogin() {
  const s = S() || { meta: {} };
  return `<div class="login"><form class="box col" data-onsubmit="login" style="gap:14px">
    <img class="logo" src="${asset('assets/logo/logo_v.png')}" alt="Mil Terras">
    <div class="center"><div class="label">Portal do parceiro</div></div>
    <label class="field"><span>Código do estabelecimento</span><input class="input" name="codigo" autocapitalize="characters" autocomplete="username" required style="text-transform:uppercase"></label>
    <label class="field"><span>PIN</span><input class="input" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" required></label>
    <button class="btn lg block">Entrar</button>
    ${store.modo === 'local' ? '<div class="tiny center" style="color:var(--dourado)">Modo demonstração · dados fictícios</div>' : ''}
    ${s.meta.demo ? `<div class="tiny muted center">Demonstração: use o código <b>${s.clientes[0].codigo}</b> e PIN <b>${s.clientes[0].pin}</b><br>(outros: ${s.clientes.slice(1, 5).map((c) => c.codigo).join(', ')})</div>` : ''}
  </form></div>`;
}

// ---------- Render ----------
const ROUTES = [['/inicio', vInicio], ['/vender', vVender], ['/estoque', vEstoque], ['/relatorios', vRelatorios], ['/fechamento', vFechamentos], ['/fechamento/novo', vNovoFechamento], ['/fechamento/:id', vFechamento], ['/carta', vCarta], ['/mais', vMais], ['/ajustes', vAjustes]];

function render(view, params, pattern) {
  current = { view, params, pattern };
  handlers = {};
  resetCharts();
  const ok = S() && cid() && C()?.ativo;
  app.innerHTML = ok ? view(params) : vLogin();
  mountCharts(app);
}
function rerender() { const y = scrollY; render(current.view, current.params, current.pattern); scrollTo(0, y); }
const go = router(ROUTES, render);

const common = {
  goto: (el) => (location.hash = el.dataset.h),
  back: () => (history.length > 1 ? history.back() : (location.hash = '#/inicio')),
  print: () => window.print(),
  install: instalar,
  step: stepHandler,
  logout: async () => { localStorage.removeItem(SESSION); await store.sair(); go(); },
  login: async (f) => {
    const fd = new FormData(f);
    if (store.modo === 'nuvem') {
      const btn = f.querySelector('button'); btn.disabled = true;
      try { await store.entrarParceiro(String(fd.get('codigo')), String(fd.get('pin'))); location.hash = '#/inicio'; go(); }
      catch (e) { toast(e.message); btn.disabled = false; }
      return;
    }
    const c = S().clientes.find((x) => x.ativo && x.codigo === String(fd.get('codigo')).trim().toUpperCase() && x.pin === String(fd.get('pin')).trim());
    if (!c) return toast('Código ou PIN incorreto');
    localStorage.setItem(SESSION, c.id);
    location.hash = '#/inicio'; go();
  },
  vender: (el) => modalVenda(el.dataset.p),
  desfazer: (el) => confirmar('Remover esta venda?', { ok: 'Remover' }).then((y) => y && store.commit((st) => { st.vendas = st.vendas.filter((v) => v.id !== el.dataset.id); })),
  ficha: (el) => { const s = S(), c = C(); const p = D.produto(s, el.dataset.p); const q = D.saldoEstimado(s, c.id)[p.id] || 0;
    modal({ title: p.tipo, wide: true, body: fichaVinho(p, `<div class="row between small"><span>Na sua carta: <b>${money(D.precoCarta(s, c, p.id))}</b></span>${q > 0 ? badge(`${q} na casa`, 'ok') : `<a class="btn sm gold" target="_blank" rel="noopener" href="${waLink(s.meta.whatsapp, `Olá, Mil Terras! Aqui é do ${c.nome}. Gostaríamos de incluir o ${p.nome} na nossa carta.`)}">Quero este rótulo</a>`}</div>`) }); },
  csv: (el) => { const s = S(), c = C(); const rows = [['Data', 'Hora', 'Vinho', 'Qtd', 'Garçom', 'Preço carta', 'Total']];
    for (const v of sortBy(D.vendasCliente(s, c.id, el.dataset.de), (v) => v.data)) rows.push([v.data, v.hora || '', D.produto(s, v.produtoId).nome, v.qtd, D.garcom(c, v.garcomId)?.nome || '', v.precoCarta.toFixed(2).replace('.', ','), (v.qtd * v.precoCarta).toFixed(2).replace('.', ',')]);
    download(`vendas-${c.codigo.toLowerCase()}-${today()}.csv`, toCSV(rows), 'text/csv'); },
  addG: (f) => { const nome = new FormData(f).get('nome').trim(); if (!nome) return; store.commit((st) => D.cliente(st, cid()).garcons.push({ id: 'g' + Date.now().toString(36), nome, ativo: true })); toast('Garçom adicionado'); },
  rmG: (el) => confirmar('Remover este garçom? As vendas antigas continuam nos relatórios.', { ok: 'Remover' }).then((y) => y && store.commit((st) => { D.garcom(D.cliente(st, cid()), el.dataset.id).ativo = false; })),
  precos: (f) => { const fd = new FormData(f); store.commit((st) => { const c = D.cliente(st, cid()); for (const [k, v] of fd) { const n = parseMoney(v); if (n > 0) c.precosCarta[k] = n; } }); toast('Preços atualizados'); },
  pix: () => { const s = S(); const code = `PIX Mil Terras · WhatsApp ${s.meta.whatsapp}`; navigator.clipboard?.writeText(code); toast('Chave PIX copiada (configure a chave real em produção)'); },
  qty: () => {},
};

delegate(app, new Proxy({}, { get: (_, k) => handlers[k] || common[k] }));
store.subscribe((s, msg, externo) => {
  if (!S()) return;
  if (document.querySelector('.overlay') && externo) return;
  if (externo && msg === 'aprovado') toast('A Mil Terras aprovou seu fechamento — reposição a caminho!');
  if (current.pattern === '/fechamento/novo' && msg !== 'fechamento') return; // não interromper a contagem
  rerender();
});
store.onErro((m) => toast('Não foi possível salvar: ' + m));
registerSW();
app.innerHTML = `<div class="login"><img src="${asset('assets/logo/logo_v_negativo.png')}" alt="Mil Terras" style="width:200px;opacity:.9"></div>`;
store.init('parceiro').then(() => go());
