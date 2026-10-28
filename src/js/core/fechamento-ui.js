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
  return { cid, step: 1, contagem, esperado: { ...contagem }, just: {}, repo: null, forma: D.cliente(s, cid).formaPadrao, obs: '' };
}

function totais(s, w) {
  const saldo = D.saldoCliente(s, w.cid);
  let garrafas = 0, valor = 0;
  for (const [pid, c] of Object.entries(w.contagem)) {
    const v = Math.max(0, (saldo[pid] || 0) - c);
    garrafas += v; valor += v * D.produto(s, pid).preco;
  }
  return { garrafas, valor };
}

export function renderWizard(s, w, { modo = 'cliente' } = {}) {
  const c = D.cliente(s, w.cid);
  const per = D.periodoAtual(s, w.cid);
  const saldo = D.saldoCliente(s, w.cid);
  const est = D.saldoEstimado(s, w.cid);
  const vendas = D.vendasCliente(s, w.cid, per.marco);
  const t = totais(s, w);
  const steps = `<div class="steps">${[1, 2, 3].map((i) => `<i class="${i <= w.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const head = `<div class="row between wrap mb"><div><div class="label">Fechamento · ${date(per.desde)} a ${date(today())}</div>
    <h2 style="margin-top:4px">${['', 'Contagem do estoque', 'Reposição e novos rótulos', 'Pagamento e envio'][w.step]}</h2></div>
    <div class="right"><div class="label">A pagar</div><div class="num" style="font-family:var(--font-t);font-size:22px;color:var(--bordo)">${money(t.valor)}</div><div class="tiny muted">${plural(t.garrafas, 'garrafa vendida', 'garrafas vendidas')}</div></div></div>`;

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
        <div class="s" style="color:var(--bordo)">Vendidas: <b>${vend}</b> · ${money(vend * p.preco)}${dif > 0 ? ` · <span style="color:var(--warn)">${dif} sem lançamento</span>` : dif < 0 ? ` · <span style="color:var(--crit)">${-dif} a mais que o esperado</span>` : ''}</div></div>
        ${dif !== 0 ? `<input class="input just ${falta ? 'falta' : ''}" name="just:${pid}" data-onchange="just" maxlength="200" placeholder="Motivo da diferença de ${Math.abs(dif)} (${dif > 0 ? 'faltam' : 'sobram'} garrafas) — obrigatório" value="${esc(w.just[pid] || '')}">` : ''}</div>
        ${stepper('cont:' + pid, w.contagem[pid], { max: saldo[pid] || 0 })}</div>`;
    }).join('')}</div></div>`;
  }
  if (w.step === 2) {
    const disp = modo === 'gestor' ? D.estoqueCentral(s) : D.estoqueDisponivel(s);
    if (!w.repo) {
      const sug = D.sugestaoReposicao(s, w.cid, w.contagem);
      w.repo = Object.fromEntries(Object.entries(sug).map(([pid, x]) => [pid, Math.min(x.qtd, Math.max(0, disp[pid] || 0))]));
      w.sug = sug;
      w.recs = D.recomendacoes(s, w.cid, 3).map((r) => r.produtoId);
    }
    const atuais = Object.keys(w.sug);
    const novos = s.produtos.filter((p) => p.ativo && !atuais.includes(p.id)).sort((a, b) => (w.recs.includes(b.id) ? 1 : 0) - (w.recs.includes(a.id) ? 1 : 0));
    const line = (p, sub) => { const d = Math.max(0, disp[p.id] || 0); return `<div class="li ${d ? '' : 'off'}">${thumb(p, 'sm')}<div class="grow"><div class="t">${esc(p.nome)}</div><div class="s">${sub}</div><div class="s" style="color:${d ? 'var(--ok)' : 'var(--crit)'}">${d ? `${d} disponíveis na Mil Terras` : 'Sem estoque disponível no momento'}</div></div>${stepper('repo:' + p.id, Math.min(w.repo[p.id] || 0, d), { max: d })}</div>`; };
    body = `<p class="small ink2" style="margin-top:0">${icon('spark', '')} Sugerimos quantidades pelo ritmo de vendas de cada rótulo na sua casa (garrafas para os próximos ${c.cicloDias} dias, com margem de segurança). Ajuste à vontade, ou deixe em zero para não repor.</p>
    <div class="card pad-0"><div class="list" style="padding:0 14px">${atuais.map((pid) => {
      const p = D.produto(s, pid); const x = w.sug[pid];
      return line(p, `Ficará com ${w.contagem[pid] || 0} · vende ~${(x.rate * c.cicloDias).toFixed(1).replace('.', ',')} por quinzena · ideal ${x.alvo}`);
    }).join('')}</div></div>
    <h3 class="mt">Incluir novo rótulo</h3>
    <div class="card pad-0 mt-s"><div class="list" style="padding:0 14px">${novos.map((p) => line(p, `${w.recs.includes(p.id) ? '<span class="badge opp">Sugestão para você</span> ' : ''}${p.tipo} · ${esc(p.regiao)} · ${money(p.preco)}`)).join('')}</div></div>`;
  }
  if (w.step === 3) {
    const repoTot = sum(Object.values(w.repo || {}));
    const venc = addDays(today(), c.prazoDias);
    body = `<div class="card"><div class="label mb">Forma de pagamento</div><div class="chips">${c.formasPagamento.map((f) => `<button type="button" class="chip ${w.forma === f ? 'on' : ''}" data-act="forma" data-v="${f}">${f}</button>`).join('')}</div>
      <div class="tiny muted mt-s">Formas liberadas no seu cadastro. Vencimento previsto: ${date(venc)} (${c.prazoDias} dias após a conferência).</div></div>
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
    ${w.step < 3 ? `<button class="btn" data-act="wz-next">Continuar ${icon('arrowR')}</button>`
      : modo === 'gestor' ? `<div class="row"><button class="btn ghost" data-act="wz-send">Salvar p/ conferência</button><button class="btn ok" data-act="wz-approve">${icon('check')} Aprovar agora</button></div>`
      : `<button class="btn ok" data-act="wz-send">${icon('check')} Enviar fechamento</button>`}</div>`;
  return steps + head + body + foot;
}

// Liga eventos do assistente. onDone(f) recebe o fechamento criado.
let toastFn = toastUI;
export function wizardHandlers(w, rerender, commit, onDone, modo = 'cliente', toast) {
  if (toast) toastFn = toast;
  return {
    step: (el) => { const inp = el.parentElement.querySelector('input'); inp.value = Math.max(0, Math.min(inp.max === '' ? 999 : +inp.max, (+inp.value || 0) + +el.dataset.d)); read(inp); },
    just: (el) => { w.just[el.name.split(':')[1]] = el.value; },
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
      f = D.montarFechamento(s, w.cid, { contagem: w.contagem, reposicao: w.repo || {}, forma: w.forma, obs: w.obs, criadoPor: modo, esperado: w.esperado, justificativas: w.just });
      D.enviarFechamento(s, f);
      if (aprovar) f.avisos = D.aprovarFechamento(s, f.id);
    }, 'fechamento');
    onDone(f, aprovar);
  }
}

export const statusBadge = (f) => badge(D.STATUS_FECH[f.status].label + (f.status === 'aprovado' && f.vencimento < today() ? ' · vencido' : ''), f.status === 'aprovado' && f.vencimento < today() ? 'crit' : D.STATUS_FECH[f.status].tone);

// Lista de ajustes de contagem com justificativa (Gestão e Parceiro)
export function ajustesHTML(s, f) {
  const aj = f.itens.filter((i) => i.esperado !== undefined && i.contagem !== i.esperado);
  if (!aj.length) return '';
  return `<div class="card mt" style="border-left:3px solid var(--warn)"><div class="head"><h2>${icon('alert')} Ajustes de contagem (${aj.length})</h2></div>
    <div class="list">${aj.map((i) => { const d = i.contagem - i.esperado; return `<div class="li"><div class="grow"><div class="t">${esc(D.produto(s, i.produtoId).nome)}</div>
      <div class="s">Esperado ${i.esperado} · contado ${i.contagem} · <b style="color:${d < 0 ? 'var(--crit)' : 'var(--warn)'}">${d > 0 ? '+' : ''}${d}</b></div>
      <div class="small" style="margin-top:4px">“${esc(i.justificativa || 'sem justificativa')}”</div></div></div>`; }).join('')}</div></div>`;
}
