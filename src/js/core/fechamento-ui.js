// Assistente de fechamento do período (usado pelo Parceiro e pela Gestão)
// 1. Contagem física  2. Reposição e novos rótulos  3. Pagamento e envio
import * as D from './domain.js';
import { money, int, date, addDays, today, esc, sum, plural } from './fmt.js';
import { icon, thumb, stepper, badge, toast as toastUI } from './ui.js';

export function novoWizard(s, cid) {
  const est = D.saldoEstimado(s, cid);
  const saldo = D.saldoCliente(s, cid);
  const contagem = {};
  for (const pid of Object.keys(saldo)) if (saldo[pid] > 0) contagem[pid] = est[pid] ?? 0;
  return { cid, step: 1, contagem, esperado: { ...contagem }, just: {}, repo: null, forma: D.cliente(s, cid).formaPadrao, obs: '', lotesSel: null };
}

// Prévia do fechamento com os lotes escolhidos (valor a pagar = só os lotes selecionados)
function totais(s, w) {
  const f = D.montarFechamento(s, w.cid, { contagem: w.contagem, lotesSel: w.lotesSel });
  return { garrafas: f.garrafas, valor: f.total, vendidas: f.vendidas, naoAcertado: f.naoAcertado };
}
const lotesComVenda = (s, w) => D.lotes(s, w.cid, { simular: Object.fromEntries(Object.entries(w.contagem).map(([pid, c]) => [pid, Math.max(0, (D.saldoCliente(s, w.cid)[pid] || 0) - c)])) }).filter((l) => l.aberto);
const vencendo = (l) => l.situacao === 'vencido' || l.situacao === 'vencendo';

export function renderWizard(s, w, { modo = 'cliente' } = {}) {
  const c = D.cliente(s, w.cid);
  const per = D.periodoAtual(s, w.cid);
  const saldo = D.saldoCliente(s, w.cid);
  const est = D.saldoEstimado(s, w.cid);
  const vendas = D.vendasCliente(s, w.cid, per.marco);
  if (!w.lotesSel || w.step === 1) w.lotesSel = w.lotesManual ? w.lotesSel || [] : lotesComVenda(s, w).filter((l) => l.aAcertar > 0).map((l) => l.id);
  const t = totais(s, w);
  const steps = `<div class="steps">${[1, 2, 3, 4].map((i) => `<i class="${i <= w.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const head = `<div class="row between wrap mb"><div><div class="label">Fechamento · ${date(per.desde)} a ${date(today())}</div>
    <h2 style="margin-top:4px">${['', 'Contagem do estoque', 'Lotes a acertar', 'Reposição e novos rótulos', 'Pagamento e envio'][w.step]}</h2></div>
    <div class="right"><div class="label">A pagar agora</div><div class="num" style="font-family:var(--font-t);font-size:22px;color:var(--bordo)">${money(t.valor)}</div><div class="tiny muted">${plural(t.garrafas, 'garrafa acertada', 'garrafas acertadas')}${t.naoAcertado ? ` · ${t.naoAcertado} fica${t.naoAcertado > 1 ? 'm' : ''} para depois` : ''}</div></div></div>`;

  let body = '';
  if (w.step === 1) {
    const pids = Object.keys(w.contagem);
    const transito = D.remessas(s).filter((r) => r.clienteId === w.cid && r.status !== 'entregue');
    body = `<p class="small ink2" style="margin-top:0">Conte as garrafas Mil Terras que estão no estabelecimento agora. Já deixamos preenchido o que o sistema espera, a partir das vendas lançadas no app. <b>Se a contagem for diferente do esperado, informe o motivo.</b></p>
    ${transito.length ? `<div class="ajuste-box mb">${icon('truck')} Há ${plural(sum(transito, (r) => r.garrafas), 'garrafa')} em reposição ainda não entregue: não conte essas garrafas.</div>` : ''}
    <div class="card pad-0"><div class="list" style="padding:0 14px">${pids.map((pid) => {
      const p = D.produto(s, pid);
      const reg = sum(vendas.filter((v) => v.produtoId === pid), (v) => v.qtd);
      const esperado = w.esperado[pid] ?? est[pid] ?? 0;
      const dif = esperado - w.contagem[pid];
      const falta = dif !== 0 && w.tentou && (w.just[pid] || '').trim().length < 3;
      const vend = (saldo[pid] || 0) - w.contagem[pid];
      return `<div class="li">${thumb(p, 'sm')}<div class="grow"><div class="t">${esc(p.nome)}</div>
        <div class="s">Saldo ${saldo[pid]} · lançadas ${reg} · esperado <b>${esperado}</b></div>
        <div class="s" style="color:var(--bordo)">Vendidas: <b>${vend}</b> · ${money(vend * D.precoParceiro(s, c, pid))}${dif > 0 ? ` · <span style="color:var(--warn)">${dif} sem lançamento</span>` : dif < 0 ? ` · <span style="color:var(--crit)">${-dif} a mais que o esperado</span>` : ''}</div></div>
        ${dif !== 0 ? `<input class="input just ${falta ? 'falta' : ''}" name="just:${pid}" data-onchange="just" maxlength="200" placeholder="Motivo da diferença de ${Math.abs(dif)} (${dif > 0 ? 'faltam' : 'sobram'} garrafas) — obrigatório" value="${esc(w.just[pid] || '')}">` : ''}</div>
        ${stepper('cont:' + pid, w.contagem[pid], { max: saldo[pid] || 0 })}</div>`;
    }).join('')}</div></div>`;
  }
  if (w.step === 2) {
    const ls = lotesComVenda(s, w);
    const comVenda = ls.filter((l) => l.aAcertar > 0);
    body = `<p class="small ink2" style="margin-top:0">Cada remessa entregue é um <b>lote</b> com vencimento próprio. O vendido conta primeiro dos lotes mais antigos. Escolha quais lotes acertar agora — o que não for acertado fica para o próximo fechamento.</p>
      <div class="chips mb"><button type="button" class="chip ${comVenda.every((l) => w.lotesSel.includes(l.id)) ? 'on' : ''}" data-act="lotesTodos">Todos os lotes</button><button type="button" class="chip" data-act="lotesVencendo">Só vencidos e vencendo</button></div>
      <div class="card pad-0"><div class="list" style="padding:0 14px">${ls.map((l) => {
        const sit = D.SITUACAO_LOTE[l.situacao];
        const marc = w.lotesSel.includes(l.id);
        const itens = Object.entries(l.itens).filter(([, x]) => x.vendido - x.acertado + x.agora > 0).map(([pid, x]) => `${x.vendido - x.acertado + x.agora}× ${esc(D.produto(s, pid).nome)}`).join(', ');
        return `<label class="li" style="cursor:${l.aAcertar ? 'pointer' : 'default'}">${l.aAcertar ? `<input type="checkbox" data-onchange="lote" data-id="${l.id}" ${marc ? 'checked' : ''} style="width:20px;height:20px">` : `<span style="width:20px"></span>`}
          <div class="grow"><div class="t">${esc(l.protocolo)} ${badge(l.situacao === 'em_dia' ? `vence ${date(l.vence)}` : l.situacao === 'vencido' ? `venceu ${date(l.vence)}` : `vence ${date(l.vence)}`, sit.tone)}</div>
          <div class="s">Entregue ${date(l.entregueEm)} · ${plural(l.enviado, 'garrafa')} · restam ${l.restante}</div>
          <div class="s" style="color:${l.aAcertar ? 'var(--bordo)' : 'var(--ink-3)'}">${l.aAcertar ? `A acertar: <b>${plural(l.aAcertar, 'garrafa')} · ${money(l.valorPendente)}</b>${l.pendente ? ` (inclui ${l.pendente} de fechamento anterior)` : ''}<br>${itens}` : 'Sem vendas a acertar neste lote'}</div></div></label>`;
      }).join('') || '<div class="empty">Nenhum lote em aberto.</div>'}</div></div>`;
  }
  if (w.step === 3) {
    const disp = modo === 'gestor' ? D.estoqueCentral(s) : D.estoqueDisponivel(s);
    if (!w.repo) {
      const sug = D.sugestaoReposicao(s, w.cid, w.contagem);
      w.repo = Object.fromEntries(Object.entries(sug).map(([pid, x]) => [pid, Math.min(x.qtd, Math.max(0, disp[pid] || 0))]));
      for (const [pid, q] of Object.entries(c.filaPedido || {})) w.repo[pid] = Math.min(Math.max(w.repo[pid] || 0, q), Math.max(0, disp[pid] || 0)); // fila de pedido do parceiro
      w.sug = sug;
      w.recs = D.recomendacoes(s, w.cid, 3).map((r) => r.produtoId);
    }
    const atuais = Object.keys(w.sug);
    const novos = s.produtos.filter((p) => p.ativo && !atuais.includes(p.id)).sort((a, b) => (w.recs.includes(b.id) ? 1 : 0) - (w.recs.includes(a.id) ? 1 : 0));
    const line = (p, sub) => { const d = Math.max(0, disp[p.id] || 0); return `<div class="li ${d ? '' : 'off'}">${thumb(p, 'sm')}<div class="grow"><div class="t">${esc(p.nome)} ${c.filaPedido?.[p.id] ? badge('Da sua fila', 'opp') : ''}</div><div class="s">${sub}</div><div class="s" style="color:${d ? 'var(--ok)' : 'var(--crit)'}">${d ? `${d} disponíveis na Mil Terras` : 'Sem estoque disponível no momento'}</div></div>${stepper('repo:' + p.id, Math.min(w.repo[p.id] || 0, d), { max: d })}</div>`; };
    body = `<p class="small ink2" style="margin-top:0">${icon('spark', '')} Sugerimos quantidades pelo ritmo de vendas de cada rótulo na sua casa (garrafas para os próximos ${c.cicloDias} dias, com margem de segurança). Ajuste à vontade, ou deixe em zero para não repor.</p>
    <div class="card pad-0"><div class="list" style="padding:0 14px">${atuais.map((pid) => {
      const p = D.produto(s, pid); const x = w.sug[pid];
      return line(p, `Ficará com ${w.contagem[pid] || 0} · vende ~${(x.rate * c.cicloDias).toFixed(1).replace('.', ',')} por quinzena · ideal ${x.alvo}`);
    }).join('')}</div></div>
    <h3 class="mt">Incluir novo rótulo</h3>
    <div class="card pad-0 mt-s"><div class="list" style="padding:0 14px">${novos.map((p) => line(p, `${w.recs.includes(p.id) ? '<span class="badge opp">Sugestão para você</span> ' : ''}${p.tipo} · ${esc(p.regiao)} · ${money(D.precoParceiro(s, c, p.id))}${D.promocao(s, c, p.id) ? ' <span class="badge ok">preço especial</span>' : ''}`)).join('')}</div></div>`;
  }
  if (w.step === 4) {
    const repoTot = sum(Object.values(w.repo || {}));
    const venc = addDays(today(), c.prazoDias);
    const opcoes = [...(c.condicoes || []).map((x) => ['cond:' + x.id, D.descCondicao(x)]), ...c.formasPagamento.map((f) => [f, f])];
    const escolhida = opcoes.find(([v]) => v === w.forma);
    const parts = w.forma?.startsWith('cond:') ? D.dividirCondicao(D.condicao(c, w.forma.slice(5)), t.valor) : [];
    body = `<div class="card"><div class="label mb">Forma de pagamento</div><div class="chips">${opcoes.map(([v, n]) => `<button type="button" class="chip ${w.forma === v ? 'on' : ''}" data-act="forma" data-v="${esc(v)}">${esc(n)}</button>`).join('')}</div>
      ${parts.length && escolhida ? `<div class="small ink2 mt-s">${parts.map((p) => `${money(p.valor)} em ${esc(p.forma)}${p.parcelas > 1 ? ` (${p.parcelas}x de ${money(p.valor / p.parcelas)})` : ''}`).join(' + ')}</div>` : ''}
      <div class="tiny muted mt-s">Condições liberadas no seu cadastro. Vencimento previsto: ${date(venc)} (${c.prazoDias} dias após a conferência).</div></div>
      <div class="card mt"><div class="grid g3" style="gap:10px">
        <div><div class="label">Vendidas</div><div class="num" style="font-size:20px">${int(t.garrafas)}</div></div>
        <div><div class="label">Total</div><div class="num" style="font-size:20px">${money(t.valor)}</div></div>
        <div><div class="label">Reposição</div><div class="num" style="font-size:20px">${plural(repoTot, 'garrafa')}</div></div></div>
        ${repoTot ? `<div class="small ink2 mt-s">${Object.entries(w.repo).filter(([, q]) => q > 0).map(([pid, q]) => `${q}× ${esc(D.produto(s, pid).nome)}`).join(' · ')}</div>` : ''}
      </div>
      <label class="field mt"><span>Observações para a Mil Terras</span><textarea class="input" name="obs" data-oninput="obs" placeholder="Ex.: quero conhecer o Barolo para o menu de inverno">${esc(w.obs)}</textarea></label>`;
  }
  const foot = `<div class="row between wz-foot">
    ${w.step > 1 ? `<button class="btn ghost" data-act="wz-back">${icon('arrowL')} Voltar</button>` : `<span></span>`}
    ${w.step < 4 ? `<button class="btn" data-act="wz-next">Continuar ${icon('arrowR')}</button>`
      : modo === 'gestor' ? `<div class="row"><button class="btn ghost" data-act="wz-send">Salvar p/ conferência</button><button class="btn ok" data-act="wz-approve">${icon('check')} Aprovar agora</button></div>`
      : `<button class="btn ok" data-act="wz-send">${icon('check')} Enviar fechamento</button>`}</div>`;
  return steps + head + body + foot;
}

// Liga eventos do assistente. onDone(f) recebe o fechamento criado.
let toastFn = toastUI;
let currentS = () => null;
export function wizardHandlers(w, rerender, commit, onDone, modo = 'cliente', toast, getS) {
  if (getS) currentS = getS;
  if (toast) toastFn = toast;
  return {
    step: (el) => { const inp = el.parentElement.querySelector('input'); inp.value = Math.max(0, Math.min(inp.max === '' ? 999 : +inp.max, (+inp.value || 0) + +el.dataset.d)); read(inp); },
    just: (el) => { w.just[el.name.split(':')[1]] = el.value; },
    lote: (el) => { w.lotesManual = true; const id = el.dataset.id; w.lotesSel = el.checked ? [...new Set([...w.lotesSel, id])] : w.lotesSel.filter((x) => x !== id); setTimeout(rerender); },
    lotesTodos: () => { w.lotesManual = false; w.lotesSel = null; rerender(); },
    lotesVencendo: () => { w.lotesManual = true; w.lotesSel = lotesComVenda(currentS(), w).filter((l) => l.aAcertar > 0 && vencendo(l)).map((l) => l.id); rerender(); },
    qty: (el) => read(el),
    obs: (el) => { w.obs = el.value; },
    forma: (el) => { w.forma = el.dataset.v; rerender(); },
    'wz-back': () => { w.step--; rerender(); scrollTo(0, 0); },
    'wz-next': () => {
      document.querySelectorAll('input[name^="just:"]').forEach((el) => { w.just[el.name.split(':')[1]] = el.value; });
      if (w.step === 1) {
        const pend = Object.keys(w.contagem).filter((pid) => w.contagem[pid] !== w.esperado[pid] && (w.just[pid] || '').trim().length < 3);
        if (pend.length) { w.tentou = true; rerender(); document.querySelector('.just.falta')?.focus(); return toastFn?.(`Justifique a diferença de contagem (${pend.length} rótulo${pend.length > 1 ? 's' : ''})`); }
      }
      w.step++; rerender(); scrollTo(0, 0);
    },
    'wz-send': () => finish(false),
    'wz-approve': () => finish(true),
  };
  function read(inp) {
    const [k, pid] = inp.name.split(':');
    const v = Math.max(0, Math.min(inp.max === '' ? 999 : +inp.max, +inp.value || 0));
    if (k === 'cont') { w.contagem[pid] = v; w.repo = null; } else w.repo[pid] = v;
    setTimeout(rerender); // fora do evento de blur/change
  }
  function finish(aprovar) {
    let f;
    commit((s) => {
      const cond = w.forma?.startsWith('cond:') ? w.forma.slice(5) : null;
      f = D.montarFechamento(s, w.cid, { contagem: w.contagem, reposicao: w.repo || {}, forma: cond ? null : w.forma, condicaoId: cond, obs: w.obs, criadoPor: modo, esperado: w.esperado, justificativas: w.just, lotesSel: w.lotesSel });
      D.enviarFechamento(s, f);
      const cl = D.cliente(s, w.cid);
      if (cl.filaPedido) { const fila = { ...cl.filaPedido }; for (const r of f.reposicao) delete fila[r.produtoId]; cl.filaPedido = fila; }
      if (aprovar) f.avisos = D.aprovarFechamento(s, f.id);
    }, 'fechamento');
    onDone(f, aprovar);
  }
}

export const statusBadge = (f, parceiro = false) => badge(((parceiro && D.STATUS_FECH[f.status].labelParceiro) || D.STATUS_FECH[f.status].label) + (f.status === 'aprovado' && f.vencimento < today() ? ' · vencido' : ''), f.status === 'aprovado' && f.vencimento < today() ? 'crit' : D.STATUS_FECH[f.status].tone);

// Acerto por lote (protocolo de remessa) — Gestão, Parceiro e relatório impresso
export function acertosHTML(s, f, { doc = false } = {}) {
  if (!f.acertos) return '';
  const porLote = {};
  for (const a of f.acertos) (porLote[a.loteId] ||= { protocolo: a.protocolo, itens: [] }).itens.push(a);
  const linhas = Object.values(porLote).map((l) => `<tr><td colspan="4" style="font-weight:600;background:var(--creme)">${esc(l.protocolo)} · ${plural(sum(l.itens, (a) => a.qtd), 'garrafa')} · ${money(sum(l.itens, (a) => a.valor))}</td></tr>
    ${l.itens.map((a) => `<tr><td style="padding-left:22px">${esc(D.produto(s, a.produtoId)?.nome)}</td><td class="r">${a.qtd}</td><td class="r">${money(a.preco)}</td><td class="r">${money(a.valor)}</td></tr>`).join('')}`).join('');
  const tabela = `<table class="tbl"><thead><tr><th>Lote / rótulo</th><th class="r">Qtd.</th><th class="r">Preço</th><th class="r">Valor</th></tr></thead><tbody>${linhas || '<tr><td colspan="4" class="muted">Nenhum lote acertado</td></tr>'}</tbody>
    <tfoot><tr><td>Total acertado</td><td class="r">${f.garrafas}</td><td></td><td class="r">${money(f.total)}</td></tr></tfoot></table>
    ${f.naoAcertado ? `<div class="tiny" style="padding:8px 12px;color:var(--warn)">${plural(f.naoAcertado, 'garrafa vendida', 'garrafas vendidas')} em lotes não selecionados ficaram para o próximo fechamento.</div>` : ''}`;
  return doc ? `<div class="bloco"><h3><span>Acerto por lote (protocolo de remessa)</span><span>${f.numero || ''}</span></h3>${tabela}</div>`
    : `<div class="card pad-0 mt"><div style="padding:16px 16px 0"><h2>Acerto por lote</h2></div><div class="tbl-wrap">${tabela}</div></div>`;
}

// Lista de ajustes de contagem com justificativa (Gestão e Parceiro)
export function ajustesHTML(s, f) {
  const aj = f.itens.filter((i) => i.esperado !== undefined && i.contagem !== i.esperado);
  if (!aj.length) return '';
  return `<div class="card mt" style="border-left:3px solid var(--warn)"><div class="head"><h2>${icon('alert')} Ajustes de contagem (${aj.length})</h2></div>
    <div class="list">${aj.map((i) => { const d = i.contagem - i.esperado; return `<div class="li"><div class="grow"><div class="t">${esc(D.produto(s, i.produtoId).nome)}</div>
      <div class="s">Esperado ${i.esperado} · contado ${i.contagem} · <b style="color:${d < 0 ? 'var(--crit)' : 'var(--warn)'}">${d > 0 ? '+' : ''}${d}</b></div>
      <div class="small" style="margin-top:4px">“${esc(i.justificativa || 'sem justificativa')}”</div></div></div>`; }).join('')}</div></div>`;
}
