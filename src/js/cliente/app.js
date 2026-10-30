// App do Parceiro — restaurantes, bares e lojas com vinhos Mil Terras em consignação
import * as store from '../core/store.js';
import * as D from '../core/domain.js';
import { HARMONIZA } from '../core/catalogo.js';
import { money, money0, moneyK, int, percent, date, dateShort, relDays, today, addDays, diffDays, esc, sum, plural, sortBy } from '../core/fmt.js';
import { icon, router, delegate, modal, closeModal, confirmar, toast, kpi, badge, empty, thumb, stepper, stepHandler, fichaVinho, iniciais, qtdBadge, waLink, download, toCSV, asset, instalar, bannerInstalar, dispensarBanner, registerSW, moneyInput, parseMoney } from '../core/ui.js';
import { chart, mountCharts, resetCharts, hbars, heatmap } from '../core/charts.js';
import { novoWizard, renderWizard, wizardHandlers, statusBadge, ajustesHTML, acertosHTML } from '../core/fechamento-ui.js';

const app = document.getElementById('app');
const S = () => store.get();
const SESSION = 'milterras:parceiro';
// ?ver=<id>: a Gestão abre a conta do parceiro em modo visualização (somente leitura)
const ESPELHO = new URLSearchParams(location.search).get('ver');
const espelhoOk = () => ESPELHO && (store.modo === 'local' || store.ehGestor());
const cid = () => (espelhoOk() ? ESPELHO : store.modo === 'local' ? localStorage.getItem(SESSION) : store.perfil()?.clienteId);
const C = () => D.cliente(S(), cid());

const NAV = [['#/inicio', 'home', 'Início'], ['#/relatorios', 'chart', 'Relatórios'], ['#/vender', 'plus', 'Vender'], ['#/fechamento', 'receipt', 'Fechamento'], ['#/mais', 'menu', 'Mais']];
const SIDE = [['#/inicio', 'home', 'Início'], ['#/vender', 'plus', 'Registrar venda'], ['#/estoque', 'box', 'Meu estoque'], ['#/relatorios', 'chart', 'Relatórios'], ['#/fechamento', 'receipt', 'Fechamento'], ['#/pedido', 'truck', 'Pedir reposição'], ['#/carta', 'wine', 'Carta e harmonização'], ['#/ajustes', 'gear', 'Equipe e preços']];

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
      <main class="main">${espelhoOk() ? `<div class="demo-banner">${icon('info')}<span class="grow">Você está vendo o app de <b>${esc(c.nome)}</b> como ele vê, em tempo real. <b>Somente leitura.</b></span><a href="#" data-act="fecharEspelho">Fechar</a></div>` : ''}${content}</main></div>
    <nav class="tabbar">${NAV.map(([h, ic, n]) => h === '#/vender' ? `<a href="${h}" class="fab"><span class="ic">${icon('plus')}</span></a>` : `<a href="${h}" class="${on(h) || (h === '#/mais' && ['#/carta', '#/ajustes', '#/estoque', '#/pedido'].some(on)) ? 'on' : ''}">${icon(ic)}<span>${n}</span>${b(h)}</a>`).join('')}</nav>
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
  const hoje = { garrafas: sum(rv.vendas.filter((v) => v.data === today()), (v) => v.qtd) }; // só o que está no período atual
  const topG = rv.porGarcom[0];
  const transito = D.remessas(s).filter((r) => r.clienteId === c.id && r.status !== 'entregue');
  const lotesAlerta = D.lotesAbertos(s, c.id).filter((l) => l.situacao === 'vencido' || l.situacao === 'vencendo');
  return shell('Início', `
    ${bannerInstalar()}
    <div class="pagehead"><div><div class="label">${esc(c.cidade)}</div><h1 style="margin-top:4px">${esc(c.nome)}</h1></div><a class="btn hide-m" href="#/vender">${icon('plus')} Registrar venda</a></div>
    <div class="card dark">
      <div class="row between wrap"><div class="label">Período atual · desde ${date(per.desde)}</div>${per.pendente ? badge('Fechamento enviado', 'warn') : badge(dias < 0 ? `fechamento atrasado ${-dias}d` : dias === 0 ? 'fechamento hoje' : `fecha em ${dias} dias`, dias <= 0 ? 'crit' : '')}</div>
      <div class="grid g4 mt" style="gap:14px">
        <div class="kpi"><div class="label">Vendidas no período</div><div class="v">${int(rv.garrafas)}</div><div class="d">${hoje.garrafas} hoje, após o último fechamento</div></div>
        <div class="kpi"><div class="label">Receita na carta</div><div class="v">${moneyK(rv.receita)}</div></div>
        <div class="kpi"><div class="label">A pagar Mil Terras</div><div class="v">${moneyK(rv.custo)}</div></div>
        <div class="kpi"><div class="label">Seu lucro</div><div class="v" style="color:#F2D9A8">${moneyK(rv.receita - rv.custo)}</div><div class="d">${percent(rv.receita ? (rv.receita - rv.custo) / rv.receita : 0)} de margem</div></div>
      </div>
      ${per.pendente ? `<div class="small mt" style="color:#E3C9A2">Seu fechamento de ${money(per.pendente.total)} foi enviado e está em conferência pela Mil Terras.</div>`
        : `<a class="btn ${dias <= 1 ? 'gold' : 'light'} block mt" href="#/fechamento/novo">${icon('receipt')} ${dias <= 1 ? 'Fazer o fechamento agora' : 'Antecipar fechamento'}</a>`}
    </div>
    ${lotesAlerta.length ? `<a class="ins ${lotesAlerta.some((l) => l.situacao === 'vencido') ? 'critico' : 'atencao'} mt" href="#/fechamento"><span class="ic">${icon('calendar')}</span><span class="grow"><div class="t">${lotesAlerta.some((l) => l.situacao === 'vencido') ? 'Lotes com acerto vencido' : 'Lotes vencendo nos próximos dias'}</div>
      <div class="s">${lotesAlerta.map((l) => `${esc(l.protocolo)} ${l.dias < 0 ? `venceu há ${-l.dias}d` : l.dias === 0 ? 'vence hoje' : `vence em ${l.dias}d`}`).join(' · ')}. Faça o fechamento para acertar.</div></span>${icon('arrowR')}</a>` : ''}
    ${transito.map((r) => `<div class="ins info mt"><span class="ic">${icon('truck')}</span><span class="grow"><div class="t">Reposição ${{ a_separar: 'em preparação', separado: 'separada, sai em breve', em_rota: 'a caminho' }[r.status]} · ${esc(r.protocolo || '')}</div><div class="s">${r.itens.map((i) => `${i.qtd}× ${esc(D.produto(s, i.produtoId).nome)}`).join(', ')}</div></span>${badge(D.STATUS_ENTREGA[r.status].label, D.STATUS_ENTREGA[r.status].tone)}</div>`).join('')}
    ${Object.keys(c.filaPedido || {}).length ? `<div class="ins oportunidade mt"><span class="ic">${icon('star')}</span><span class="grow"><div class="t">Fila de pedido: ${Object.entries(c.filaPedido).map(([pid, q]) => `${q}× ${esc(D.produto(s, pid)?.nome)}`).join(', ')}</div><div class="s">Vai sugerida no próximo fechamento. Se preferir, antecipe o pedido agora.</div></span><a class="btn sm gold" href="#/pedido?fila=1">Antecipar pedido</a></div>` : ''}
    ${acabando.length ? `<div class="ins atencao mt"><span class="ic">${icon('alert')}</span><span class="grow"><div class="t">${plural(acabando.length, 'rótulo acabando', 'rótulos acabando')}</div><div class="s">${acabando.map(([pid, q]) => `${esc(D.produto(s, pid).nome)} (${q})`).join(', ')}</div></span>
      <a class="btn sm gold" href="#/pedido?p=${acabando.map(([pid]) => pid).join(',')}">Pedir</a></div>` : ''}
    <div class="grid g2 mt">
      <div class="card"><div class="head"><h2>Mais vendidos no período</h2><a class="small" href="#/relatorios">ver relatórios</a></div>
        ${rv.porProduto.length ? hbars(rv.porProduto.slice(0, 5).map((x) => ({ label: D.produto(s, x.produtoId).nome, value: x.qtd, sub: money(x.receita) + ' na carta' })), (v) => int(v) + ' gf') : empty('Nenhuma venda registrada ainda neste período.<br><a href="#/vender">Registrar a primeira</a>')}</div>
      <div class="col">
        ${topG ? `<div class="card row">${'<div class="avatar" style="background:var(--dourado);color:#fff">' + icon('star') + '</div>'}<div class="grow"><div class="label">Destaque da equipe</div><div style="font-weight:600;font-size:16px">${esc(D.garcom(c, topG.garcomId)?.nome || '—')}</div><div class="small muted">${plural(topG.qtd, 'garrafa')} · ${money0(topG.receita)} no período</div></div></div>` : ''}
        ${ultimo ? `<a class="card row" href="#/fechamento/${ultimo.id}" style="color:inherit"><div class="avatar">${icon('receipt')}</div><div class="grow"><div class="label">Último fechamento</div><div style="font-weight:600">${money(ultimo.total)}</div><div class="small muted">${date(ultimo.inicio)} – ${date(ultimo.fim)}</div></div>${statusBadge(ultimo, true)}</a>` : ''}
        <a class="card row" href="#/pedido" style="color:inherit"><div class="avatar">${icon('truck')}</div><div class="grow"><div style="font-weight:600">Pedir reposição</div><div class="small muted">Veja o que a Mil Terras tem disponível e peça sem esperar o fechamento</div></div>${icon('arrowR')}</a>
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
  const hoje = sortBy(D.vendasCliente(s, c.id, addDays(today(), -7)), (v) => v.data + (v.hora || '') + (v.ts || ''), true).slice(0, 40);
  return shell('Registrar venda', `
    ${pageHead('Registrar venda', 'Toque no vinho vendido. Leva 3 segundos e alimenta seus relatórios.')}
    <div class="wine-grid">${pids.map((pid) => { const p = D.produto(s, pid); const q = est[pid] || 0; return `<button class="wine ${q <= 0 ? 'off' : ''}" data-act="vender" data-p="${pid}" style="font:inherit"><span class="q">${qtdBadge(q)}</span><img src="${asset(p.foto)}" alt="" loading="lazy"><div class="n">${esc(p.nome)}</div><div class="tiny muted">${money(D.precoCarta(s, c, pid))} na carta</div></button>`; }).join('')}</div>
    <div class="card mt"><div class="head"><h2>Últimas vendas</h2><span class="small muted">${plural(sum(hoje, (v) => v.qtd), 'garrafa')} · ${money(sum(hoje, (v) => v.qtd * v.precoCarta))}</span></div>
      <div class="list">${hoje.map((v) => `<div class="li">${thumb(D.produto(s, v.produtoId), 'sm')}<div class="grow"><div class="t">${v.qtd}× ${esc(D.produto(s, v.produtoId).nome)}</div><div class="s">${esc(D.garcom(c, v.garcomId)?.nome || 'Sem garçom')} · ${v.data === today() ? 'hoje' : dateShort(v.data)}${v.hora ? ' ' + v.hora : ''}</div></div><div class="num">${money(v.qtd * v.precoCarta)}</div>${v.data >= D.periodoAtual(s, c.id).desde ? `<button class="iconbtn" data-act="desfazer" data-id="${v.id}" aria-label="Desfazer">${icon('trash')}</button>` : ''}</div>`).join('') || empty('Nenhuma venda nos últimos 7 dias.')}</div></div>`);
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
    <div class="grid g2 mt" style="gap:10px"><label class="field"><span>Data da venda</span><input class="input" type="date" name="dataVenda" value="${today()}" min="${D.periodoAtual(s, c.id).desde}" max="${today()}"></label>
      <label class="field"><span>Hora</span><input class="input" type="time" name="horaVenda" value="${new Date().toTimeString().slice(0, 5)}"></label></div>
    <div class="label mt mb">Quem vendeu?</div>
    <div class="chips" id="gchips">${gs.map((x) => `<button type="button" class="chip ${x.id === g ? 'on' : ''}" data-act="g" data-id="${x.id}">${esc(x.nome)}</button>`).join('')}<button type="button" class="chip" data-act="novoG">＋ Novo garçom</button></div>
    <div class="row gap-s mt-s hide" id="novoGbox"><input class="input" id="novoGnome" placeholder="Nome do garçom" maxlength="40"><button type="button" class="btn sm" data-act="salvarG">Adicionar</button></div>
    ${est <= 0 ? `<div class="small mt" style="color:var(--warn)">${icon('alert')} O sistema não tem saldo deste vinho aqui. Confira o estoque no fechamento.</div>` : ''}`,
    foot: `<button class="btn lg block ok" data-act="ok">${icon('check')} Registrar</button>`,
    handlers: {
      step: stepHandler,
      g: (el) => { g = el.dataset.id; el.parentElement.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b === el)); },
      novoG: () => { if (espelhoOk()) return bloqueado(); document.getElementById('novoGbox').classList.remove('hide'); document.getElementById('novoGnome').focus(); },
      salvarG: () => {
        const nome = document.getElementById('novoGnome').value.trim();
        if (!nome) return;
        const id = 'g' + Date.now().toString(36);
        store.commit((st) => D.cliente(st, c.id).garcons.push({ id, nome, ativo: true }));
        g = id;
        const chip = document.createElement('button');
        chip.type = 'button'; chip.className = 'chip on'; chip.dataset.act = 'g'; chip.dataset.id = id; chip.textContent = nome;
        const box = document.getElementById('gchips');
        box.querySelectorAll('.chip').forEach((b) => b.classList.remove('on'));
        box.insertBefore(chip, box.lastElementChild);
        document.getElementById('novoGbox').classList.add('hide');
        toast(`${nome} adicionado à equipe`);
      },
      ok: () => {
        const qtd = Math.max(1, +document.querySelector('.modal [name=qtd]').value || 1);
        const data = document.querySelector('.modal [name=dataVenda]').value || today();
        const min = D.periodoAtual(s, c.id).desde;
        if (data > today()) return toast('A data não pode ser futura');
        if (data < min) return toast(`Esse período já foi fechado. Use uma data a partir de ${date(min)}.`);
        const hora = document.querySelector('.modal [name=horaVenda]').value || '';
        store.commit((st) => D.registrarVenda(st, { clienteId: c.id, produtoId: pid, qtd, garcomId: g, data, hora }), 'venda');
        ultimoGarcom = g;
        closeModal(); toast(`✓ ${qtd}× ${p.nome} registrado${data !== today() ? ' em ' + date(data) : ''}`);
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
  const f = filtros.find((x) => x[0] === (query.p || 'periodo')) || filtros[0];
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
    ${pageHead('Relatórios de vendas', `Vendas registradas pela equipe · ${f[0] === 'periodo' ? `período atual, desde ${date(per.desde)} (o mesmo número do Início)` : `${f[1].toLowerCase()}, de ${date(addDays(de, 1))} até hoje (inclui períodos já fechados)`}`, `<button class="btn ghost" data-act="csv" data-de="${de}">${icon('download')} Exportar</button>`)}
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
    ${(() => { const ls = D.lotesAbertos(s, c.id); return ls.length ? `<h2 class="mt">Meus lotes em aberto</h2><div class="small muted mt-s">Cada remessa recebida é um lote. Ela vence ${c.cicloDias} dias após a entrega (ou após o último acerto).</div>
      <div class="card pad-0 mt-s"><div class="list" style="padding:0 16px">${ls.map((l) => `<div class="li"><div class="grow"><div class="t">${esc(l.protocolo)}</div><div class="s">Entregue ${date(l.entregueEm)} · ${plural(l.enviado, 'garrafa')} · restam ${l.restante}${l.pendente ? ` · ${l.pendente} vendida(s) a acertar` : ''}</div></div>${badge(l.dias < 0 ? `venceu ${date(l.vence)}` : `vence ${date(l.vence)}`, D.SITUACAO_LOTE[l.situacao].tone)}</div>`).join('')}</div></div>` : ''; })()}
    <h2 class="mt">Histórico</h2>
    <div class="card pad-0 mt-s"><div class="list" style="padding:0 16px">${fs.filter((f) => f.status !== 'enviado').map((f) => `<a class="li" href="#/fechamento/${f.id}"><div class="grow"><div class="t">${date(f.inicio)} – ${date(f.fim)}</div><div class="s">${plural(f.garrafas, 'garrafa')} · ${esc(f.formaPagamento)}</div></div><div class="right"><div class="num" style="font-weight:600">${money(f.total)}</div>${statusBadge(f, true)}</div></a>`).join('') || empty('Nenhum fechamento ainda')}</div></div>`);
}

function vNovoFechamento() {
  const s = S(), c = C();
  const per = D.periodoAtual(s, c.id);
  if (per.pendente) { location.hash = `#/fechamento/${per.pendente.id}`; return ''; }
  if (!wz || wz.cid !== c.id) wz = novoWizard(s, c.id);
  handlers = wizardHandlers(wz, rerender, store.commit, (f) => {
    wz = null;
    location.hash = `#/fechamento/${f.id}?enviado=1`;
  }, 'cliente', toast, S);
  return shell('Fechamento', `<div style="max-width:760px">${renderWizard(s, wz, { modo: 'cliente' })}</div>`, { back: true });
}

function vFechamento({ id, query }) {
  const s = S(), c = C();
  const f = s.fechamentos.find((x) => x.id === id && x.clienteId === c.id);
  if (!f) return shell('Fechamento', empty('Fechamento não encontrado'), { back: true });
  const repo = f.reposicaoEnviada || f.reposicao || [];
  return shell('Fechamento', `
    ${query.enviado ? `<div class="card mb" style="background:var(--ok-bg);border-color:transparent"><div class="row">${icon('check')}<div><b>Fechamento enviado!</b><div class="small">A Mil Terras recebeu e vai conferir. A reposição sai logo após a aprovação.</div></div></div></div>` : ''}
    <div class="pagehead"><div><div class="label">${f.numero ? esc(f.numero) + ' · ' : ''}${date(f.inicio)} – ${date(f.fim)}</div><h1 style="margin-top:4px">${money(f.total)}</h1><div class="sub row gap-s">${statusBadge(f, true)} ${f.vencimento && f.status === 'aprovado' ? `<span>vence ${date(f.vencimento)}</span>` : ''}</div></div>
      <div class="row">${f.status === 'aprovado' && f.formaPagamento === 'PIX' ? `<button class="btn" data-act="pix">PIX copia e cola</button>` : ''}<button class="btn ghost" data-act="print">${icon('print')} Imprimir</button></div></div>
    <div class="card pad-0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vinho</th><th class="r">Saldo</th><th class="r">Contado</th><th class="r">Vendido</th><th class="r">Valor</th></tr></thead>
      <tbody>${f.itens.map((i) => `<tr><td>${esc(D.produto(s, i.produtoId).nome)}</td><td class="r">${i.saldoAnterior}</td><td class="r">${i.contagem}</td><td class="r"><b>${i.vendido}</b></td><td class="r">${money(i.valor)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total · ${esc(f.formaPagamento)}</td><td class="r">${f.garrafas}</td><td class="r">${money(f.total)}</td></tr></tfoot></table></div></div>
    ${ajustesHTML(s, f)}
    ${acertosHTML(s, f)}
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
    <div class="wine-grid">${lista.map((p) => `<button class="wine ${(est[p.id] || 0) > 0 ? '' : 'off'}" data-act="ficha" data-p="${p.id}" style="font:inherit"><span class="q">${c.filaPedido?.[p.id] ? badge(`Na fila: ${c.filaPedido[p.id]}`, 'opp') : (est[p.id] || 0) > 0 ? badge('Na casa', 'ok') : badge('Pedir', '')}</span><img src="${asset(p.foto)}" alt="" loading="lazy"><div class="n">${esc(p.nome)}</div><div class="tiny muted">${p.tipo} · ${esc(p.regiao)}</div><div class="tiny serif" style="color:var(--bordo)">${esc(p.harmonizacao)}</div></button>`).join('') || empty('Nenhum rótulo para esta combinação')}</div>`);
}

// ---------- Mais / ajustes ----------
function vMais() {
  const c = C();
  return shell('Mais', `<div class="card pad-0"><div class="list" style="padding:0 16px">
    ${[['#/pedido', 'truck', 'Pedir reposição'], ['#/estoque', 'box', 'Meu estoque'], ['#/carta', 'wine', 'Carta e harmonização'], ['#/ajustes', 'gear', 'Equipe e preços da carta']].map(([h, ic, n]) => `<a class="li" href="${h}"><span class="avatar">${icon(ic)}</span><div class="grow t">${n}</div>${icon('arrowR')}</a>`).join('')}
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
  if (ESPELHO) return `<div class="login"><div class="box col center" style="gap:14px"><img class="logo" src="${asset('assets/logo/logo_v.png')}" alt="Mil Terras"><div class="small">Para ver a conta de um parceiro, entre primeiro na <b>Gestão</b> neste navegador e use o botão “Ver app” do parceiro.</div><a class="btn" href="../gestor/">Abrir Gestão</a></div></div>`;
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
// ---------- Pedido de reposição (entre fechamentos) ----------
let rascunho = {};
let pedidoIniciado = false;
function vPedido({ query }) {
  const s = S(), c = C();
  const disp = D.estoqueDisponivel(s);
  const est = D.saldoEstimado(s, c.id);
  if ((query.fila || !query.p) && !Object.keys(rascunho).length && !pedidoIniciado) for (const [pid, q] of Object.entries(c.filaPedido || {})) rascunho[pid] = Math.min(q, disp[pid] || 0);
  pedidoIniciado = true;
  if (query.p && !Object.keys(rascunho).length) for (const pid of query.p.split(',')) rascunho[pid] = Math.min(Math.max(1, (c.par?.[pid] || 2) - (est[pid] || 0)), disp[pid] || 0);
  const recs = D.recomendacoes(s, c.id, 3).map((r) => r.produtoId);
  const lista = sortBy(s.produtos.filter((p) => p.ativo), (p) => ((est[p.id] || 0) > 0 || c.par?.[p.id] ? 0 : recs.includes(p.id) ? 1 : 2));
  const itens = Object.entries(rascunho).filter(([, q]) => q > 0).map(([produtoId, qtd]) => ({ produtoId, qtd }));
  const meus = sortBy(D.pedidos(s).filter((p) => p.clienteId === c.id), (p) => p.ts || 0, true).slice(0, 10);
  const pendFech = D.periodoAtual(s, c.id).pendente;
  return shell('Pedir reposição', `
    ${pageHead('Pedir reposição', 'Escolha os vinhos e as quantidades. Você só consegue pedir o que a Mil Terras tem disponível agora.')}
    ${pendFech ? `<div class="ajuste-box mb">Seu fechamento já está em conferência e inclui um pedido de reposição. Use esta tela só para itens extras.</div>` : ''}
    <div class="card pad-0"><div class="list" style="padding:0 14px">${lista.map((p) => { const d = Math.max(0, disp[p.id] || 0); return `<div class="li ${d ? '' : 'off'}">${thumb(p, 'sm')}<div class="grow"><div class="t">${esc(p.nome)} ${recs.includes(p.id) && !(est[p.id] > 0) ? badge('Sugestão', 'opp') : ''}</div>
      <div class="s">Na casa: ${est[p.id] || 0} · ${money(p.preco)}</div><div class="s" style="color:${d ? 'var(--ok)' : 'var(--crit)'}">${d ? `${d} disponíveis` : 'Sem estoque disponível'}</div></div>${stepper('ped:' + p.id, Math.min(rascunho[p.id] || 0, d), { max: d })}</div>`; }).join('')}</div></div>
    <label class="field mt"><span>Observação</span><input class="input" id="pedObs" maxlength="200" placeholder="Ex.: entregar até sexta"></label>
    <div class="row between wz-foot"><div><div class="label">Total do pedido</div><b>${plural(sum(itens, (i) => i.qtd), 'garrafa')} · ${money(D.valorItens(s, itens))}</b></div>
      <button class="btn ok" data-act="enviarPedido" ${itens.length ? '' : 'disabled'}>${icon('check')} Enviar pedido</button></div>
    ${meus.length ? `<h2 class="mt">Meus pedidos</h2><div class="card pad-0 mt-s"><div class="list" style="padding:0 16px">${meus.map((p) => { const r = p.remessaId && D.remessas(s).find((x) => x.id === p.remessaId); return `<div class="li"><div class="grow"><div class="t">${date(p.data)} · ${plural(sum(p.itens, (i) => i.qtd), 'garrafa')} · ${money(D.valorItens(s, p.itens))}</div>
      <div class="s">${p.itens.map((i) => `${i.qtd}× ${esc(D.produto(s, i.produtoId)?.nome)}`).join(', ')}</div>${p.motivo ? `<div class="s" style="color:var(--crit)">${esc(p.motivo)}</div>` : ''}</div>
      ${r ? badge(D.STATUS_ENTREGA[r.status].label, D.STATUS_ENTREGA[r.status].tone) : badge(D.STATUS_PEDIDO[p.status].label, D.STATUS_PEDIDO[p.status].tone)}
      ${p.status === 'solicitado' ? `<button class="iconbtn" data-act="cancelarPedido" data-id="${p.id}" aria-label="Cancelar">${icon('trash')}</button>` : ''}</div>`; }).join('')}</div></div>` : ''}`, { back: true });
}

const ROUTES = [['/inicio', vInicio], ['/pedido', vPedido], ['/vender', vVender], ['/estoque', vEstoque], ['/relatorios', vRelatorios], ['/fechamento', vFechamentos], ['/fechamento/novo', vNovoFechamento], ['/fechamento/:id', vFechamento], ['/carta', vCarta], ['/mais', vMais], ['/ajustes', vAjustes]];

function render(view, params, pattern) {
  current = { view, params, pattern };
  handlers = {};
  resetCharts();
  const ok = S() && cid() && C()?.ativo;
  app.innerHTML = ok ? view(params) : vLogin();
  mountCharts(app);
  if (ok && (pattern === '/pedido' || pattern === '/fechamento/novo')) store.atualizarDisponivel();
}
function rerender() { const y = scrollY; render(current.view, current.params, current.pattern); scrollTo(0, y); }
const go = router(ROUTES, render);

const common = {
  goto: (el) => (location.hash = el.dataset.h),
  back: () => (history.length > 1 ? history.back() : (location.hash = '#/inicio')),
  print: () => window.print(),
  install: instalar,
  semBanner: () => { dispensarBanner(); rerender(); },
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
  ficha: (el) => {
    const s = S(), c = C(); const p = D.produto(s, el.dataset.p); const q = D.saldoEstimado(s, c.id)[p.id] || 0;
    const disp = Math.max(0, D.estoqueDisponivel(s)[p.id] || 0);
    const naFila = c.filaPedido?.[p.id];
    modal({ title: p.tipo, wide: true, body: fichaVinho(p, `<div class="row between small"><span>Na sua carta: <b>${money(D.precoCarta(s, c, p.id))}</b></span>${q > 0 ? badge(`${q} na casa`, 'ok') : ''}</div>
      <div class="card" style="padding:12px"><div class="row between wrap"><div><div style="font-weight:600">${naFila ? `Na sua fila de pedido: ${naFila}` : q > 0 ? 'Pedir mais deste rótulo' : 'Quero este rótulo'}</div><div class="tiny muted">${disp ? `${disp} disponíveis na Mil Terras` : 'Sem estoque disponível agora'} · vai junto no próximo fechamento, ou antecipe o pedido</div></div>
        ${disp ? `<div class="row gap-s">${stepper('fila', naFila || Math.min(2, disp), { min: 1, max: disp })}<button class="btn sm gold" data-act="addFila">${naFila ? 'Atualizar' : 'Adicionar'}</button></div>` : ''}</div></div>`),
      handlers: { step: stepHandler, qty: () => {}, addFila: () => {
        if (espelhoOk()) return bloqueado();
        const n = Math.max(1, Math.min(disp, +document.querySelector('.modal [name=fila]').value || 1));
        store.commit((st) => { const cc = D.cliente(st, c.id); cc.filaPedido = { ...(cc.filaPedido || {}), [p.id]: n }; });
        closeModal(); toast(`${p.nome} na sua fila de pedido (${n})`);
      } } });
  },
  fecharEspelho: () => { window.close(); setTimeout(() => (location.href = '../gestor/' + (store.demo ? '?demo=1' : '')), 200); },
  limparFila: () => store.commit((st) => { D.cliente(st, cid()).filaPedido = {}; }),
  csv: (el) => { const s = S(), c = C(); const rows = [['Data', 'Hora', 'Vinho', 'Qtd', 'Garçom', 'Preço carta', 'Total']];
    for (const v of sortBy(D.vendasCliente(s, c.id, el.dataset.de), (v) => v.data)) rows.push([v.data, v.hora || '', D.produto(s, v.produtoId).nome, v.qtd, D.garcom(c, v.garcomId)?.nome || '', v.precoCarta.toFixed(2).replace('.', ','), (v.qtd * v.precoCarta).toFixed(2).replace('.', ',')]);
    download(`vendas-${c.codigo.toLowerCase()}-${today()}.csv`, toCSV(rows), 'text/csv'); },
  addG: (f) => { const nome = new FormData(f).get('nome').trim(); if (!nome) return; store.commit((st) => D.cliente(st, cid()).garcons.push({ id: 'g' + Date.now().toString(36), nome, ativo: true })); toast('Garçom adicionado'); },
  rmG: (el) => confirmar('Remover este garçom? As vendas antigas continuam nos relatórios.', { ok: 'Remover' }).then((y) => y && store.commit((st) => { D.garcom(D.cliente(st, cid()), el.dataset.id).ativo = false; })),
  precos: (f) => { const fd = new FormData(f); store.commit((st) => { const c = D.cliente(st, cid()); for (const [k, v] of fd) { const n = parseMoney(v); if (n > 0) c.precosCarta[k] = n; } }); toast('Preços atualizados'); },
  pix: () => { const s = S(); const code = `PIX Mil Terras · WhatsApp ${s.meta.whatsapp}`; navigator.clipboard?.writeText(code); toast('Chave PIX copiada (configure a chave real em produção)'); },
  qty: (el) => {
    if (!el.name?.startsWith('ped:')) return;
    const max = el.max === '' ? 999 : +el.max;
    rascunho[el.name.slice(4)] = Math.max(0, Math.min(max, +el.value || 0));
    setTimeout(rerender); // fora do evento de blur/change
  },
  enviarPedido: () => {
    const s = S(), c = C();
    const disp = D.estoqueDisponivel(s);
    const itens = Object.entries(rascunho).filter(([, q]) => q > 0).map(([produtoId, qtd]) => ({ produtoId, qtd }));
    const acima = itens.find((i) => i.qtd > (disp[i.produtoId] || 0));
    if (acima) return toast(`${D.produto(s, acima.produtoId).nome}: só ${disp[acima.produtoId] || 0} disponíveis`);
    const obs = document.getElementById('pedObs')?.value || '';
    store.commit((st) => {
      D.criarPedido(st, { clienteId: c.id, itens, obs });
      const cc = D.cliente(st, c.id);
      if (cc.filaPedido) { const f = { ...cc.filaPedido }; for (const i of itens) delete f[i.produtoId]; cc.filaPedido = f; }
    }, 'pedido');
    rascunho = {}; pedidoIniciado = false;
    toast('Pedido enviado para a Mil Terras');
    if (location.hash.includes('?')) location.hash = '#/pedido'; else rerender();
  },
  cancelarPedido: (el) => confirmar('Cancelar este pedido?', { ok: 'Cancelar pedido' }).then((y) => y && store.commit((st) => { st.pedidos = st.pedidos.filter((p) => p.id !== el.dataset.id); })),
};

// No modo visualização (Gestão vendo o app do parceiro) as ações que gravam ficam bloqueadas
const ESCRITA = new Set(['vender', 'desfazer', 'addG', 'rmG', 'precos', 'enviarPedido', 'cancelarPedido', 'wz-send', 'wz-approve', 'limparFila', 'addFila']);
const bloqueado = () => toast('Modo visualização: só o parceiro pode fazer alterações');
delegate(app, new Proxy({}, { get: (_, k) => (espelhoOk() && ESCRITA.has(k) ? bloqueado : handlers[k] || common[k]) }));
store.subscribe((s, msg, externo) => {
  if (!S() || !current.view) return; // ainda carregando
  if (document.querySelector('.overlay') && externo) return;
  if (externo && msg === 'aprovado') toast('A Mil Terras aprovou seu fechamento — reposição a caminho!');
  if (current.pattern === '/fechamento/novo' && msg !== 'fechamento' && msg !== 'disponivel') return; // não interromper a contagem
  rerender();
});
store.onErro((m) => toast('Não foi possível salvar: ' + m));
registerSW();
app.innerHTML = `<div class="login"><img src="${asset('assets/logo/logo_v_negativo.png')}" alt="Mil Terras" style="width:200px;opacity:.9"></div>`;
if (ESPELHO) store.setSomenteLeitura(true);
store.init(ESPELHO && store.modo === 'nuvem' ? 'gestor' : 'parceiro').then(() => go());
