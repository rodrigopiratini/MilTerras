// Regras de negócio: estoque central, consignação, fechamentos, financeiro e inteligência.
// Todas as funções recebem o estado (s) e não dependem de interface — o mesmo código
// roda no app de Gestão, no app do Parceiro e na geração dos dados de demonstração.

import { uid, today, addDays, diffDays, sum, monthKey, iso } from './fmt.js';

export const TIPOS_MOV = {
  entrada: { label: 'Entrada (compra/importação)', central: +1, cliente: 0 },
  remessa: { label: 'Remessa em consignação', central: -1, cliente: +1 },
  devolucao: { label: 'Devolução do parceiro', central: +1, cliente: -1 },
  consumo: { label: 'Venda apurada no fechamento', central: 0, cliente: -1 },
  venda_direta: { label: 'Venda direta', central: -1, cliente: 0 },
  perda: { label: 'Perda / quebra', central: -1, cliente: 0 },
  ajuste: { label: 'Ajuste de inventário', central: +1, cliente: 0 },
  ajuste_parceiro: { label: 'Correção de saldo no parceiro', central: 0, cliente: +1 }, // qtd com sinal
};

export const STATUS_FECH = {
  rascunho: { label: 'Rascunho', tone: 'muted' },
  enviado: { label: 'Aguardando conferência', tone: 'warn' },
  aprovado: { label: 'A receber', labelParceiro: 'A pagar', tone: 'info' },
  pago: { label: 'Pago', tone: 'ok' },
};

// Entrega das remessas: o estoque central baixa na criação (reserva); o saldo do parceiro
// só aumenta quando a remessa é marcada como entregue.
export const STATUS_ENTREGA = {
  a_separar: { label: 'A separar', tone: 'warn', prox: 'separado', acao: 'Marcar separado' },
  separado: { label: 'Separado', tone: 'info', prox: 'em_rota', acao: 'Saiu para entrega' },
  em_rota: { label: 'Em rota', tone: 'info', prox: 'entregue', acao: 'Confirmar entrega' },
  entregue: { label: 'Entregue', tone: 'ok' },
};
const entregue = (mv) => mv.tipo !== 'remessa' || !mv.entrega || mv.entrega === 'entregue';

export const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Transferência', 'Cartão de crédito', 'Dinheiro'];

export const produto = (s, id) => s.produtos.find((p) => p.id === id);
export const cliente = (s, id) => s.clientes.find((c) => c.id === id);
export const garcom = (c, id) => c?.garcons.find((g) => g.id === id);
export const precoCarta = (s, c, pid) => c.precosCarta?.[pid] ?? produto(s, pid)?.precoCarta ?? 0;

// ---------- Estoque ----------

export function estoqueCentral(s) {
  const m = Object.fromEntries(s.produtos.map((p) => [p.id, 0]));
  for (const mv of s.movs) m[mv.produtoId] = (m[mv.produtoId] || 0) + mv.qtd * TIPOS_MOV[mv.tipo].central;
  return m;
}

export function consignado(s) {
  const m = {};
  for (const mv of s.movs) {
    const f = TIPOS_MOV[mv.tipo].cliente;
    if (!f || !mv.clienteId || !entregue(mv)) continue;
    const c = (m[mv.clienteId] ||= {});
    c[mv.produtoId] = (c[mv.produtoId] || 0) + mv.qtd * f;
  }
  return m;
}

export const saldoCliente = (s, cid) => consignado(s)[cid] || {};

export function addMov(s, mv) {
  const m = { id: uid('mv'), data: today(), ts: Date.now(), ...mv };
  s.movs.push(m);
  return m;
}

// Remessas agrupadas (só as criadas com controle de entrega)
export function remessas(s) {
  const g = {};
  for (const m of s.movs) {
    if (m.tipo !== 'remessa' || !m.remessaId) continue;
    const r = (g[m.remessaId] ||= { id: m.remessaId, protocolo: m.protocolo || '', clienteId: m.clienteId, data: m.data, status: m.entrega || 'entregue', itens: [], ref: m.ref, obs: m.obs, hist: m.entregaHist || [], entregueEm: m.entregueEm, recebidoPor: m.recebidoPor });
    r.itens.push({ produtoId: m.produtoId, qtd: m.qtd, movId: m.id });
  }
  return Object.values(g).map((r) => ({ ...r, garrafas: sum(r.itens, (i) => i.qtd), valor: valorItens(s, r.itens) })).sort((a, b) => (a.data + a.id < b.data + b.id ? 1 : -1));
}

// Protocolo sequencial por ano: REM-2026-0001 (gerado pela Gestão, que enxerga todas as remessas)
export function proximoProtocolo(s, ano = today().slice(0, 4)) {
  let max = 0;
  for (const m of s.movs) { const x = /^REM-(\d{4})-(\d+)$/.exec(m.protocolo || ''); if (x && x[1] === ano) max = Math.max(max, +x[2]); }
  return `REM-${ano}-${String(max + 1).padStart(4, '0')}`;
}

export function criarRemessa(s, { clienteId, itens, status = 'a_separar', data = today(), ref, obs }) {
  const remessaId = uid('rm');
  const protocolo = proximoProtocolo(s, data.slice(0, 4));
  const hist = [{ status, em: new Date().toISOString() }];
  for (const { produtoId, qtd } of itens) if (qtd > 0) addMov(s, { data, tipo: 'remessa', produtoId, qtd, clienteId, ref, obs, remessaId, protocolo, entrega: status, entregaHist: hist, ...(status === 'entregue' ? { entregueEm: data } : {}) });
  return remessaId;
}

export function avancarRemessa(s, remessaId, status, { recebidoPor, data = today() } = {}) {
  for (const m of s.movs) {
    if (m.remessaId !== remessaId) continue;
    m.entrega = status;
    m.entregaHist = [...(m.entregaHist || []), { status, em: new Date().toISOString() }];
    if (status === 'entregue') { m.entregueEm = data; if (recebidoPor) m.recebidoPor = recebidoPor; }
  }
}

// Dá protocolo às remessas antigas (agrupa por parceiro + data) e número aos fechamentos sem número.
// Roda na Gestão; devolve true se alterou algo.
export function migrarProtocolos(s) {
  let mudou = false;
  const semId = s.movs.filter((m) => m.tipo === 'remessa' && !m.remessaId);
  const grupos = {};
  for (const m of semId) (grupos[`${m.clienteId}|${m.data}`] ||= []).push(m);
  for (const k of Object.keys(grupos)) { const rid = uid('rm'); for (const m of grupos[k]) m.remessaId = rid; mudou = true; }
  const semProt = {};
  for (const m of s.movs) if (m.tipo === 'remessa' && m.remessaId && !m.protocolo) (semProt[m.remessaId] ||= []).push(m);
  for (const [rid, ms] of Object.entries(semProt).sort((a, b) => (a[1][0].data + (a[1][0].ts || '') < b[1][0].data + (b[1][0].ts || '') ? -1 : 1))) {
    const prot = proximoProtocolo(s, ms[0].data.slice(0, 4));
    for (const m of ms) m.protocolo = prot;
    mudou = true;
  }
  for (const c of s.clientes) {
    const fs = s.fechamentos.filter((f) => f.clienteId === c.id).sort((a, b) => (a.fim + (a.ts || '') < b.fim + (b.ts || '') ? -1 : 1));
    fs.forEach((f, i) => { if (!f.numero) { f.numero = `FEC-${c.codigo}-${String(i + 1).padStart(3, '0')}`; mudou = true; } });
  }
  return mudou;
}

// ---------- Lotes (cada remessa entregue é um lote com vencimento próprio) ----------
// O vendido é atribuído aos lotes mais antigos primeiro (PEPS). O parceiro escolhe quais lotes acertar;
// o vendido dos lotes não escolhidos fica "a acertar" para o próximo fechamento.
export function lotes(s, cid, { simular } = {}) {
  const c = cliente(s, cid);
  const ciclo = c?.cicloDias || 15;
  const ls = [];
  const porId = {};
  const novo = (id, protocolo, entregueEm) => (porId[id] ||= (ls.push({ id, protocolo, clienteId: cid, entregueEm, itens: {}, ultimoAcerto: null }), ls[ls.length - 1]));
  const it = (l, pid) => (l.itens[pid] ||= { enviado: 0, vendido: 0, baixa: 0, acertado: 0, agora: 0 });
  const consumir = (pid, qtd, campo) => {
    let resto = qtd;
    for (const l of ls) {
      if (resto <= 0) break;
      const x = l.itens[pid]; if (!x) continue;
      const disp = x.enviado - x.vendido - x.baixa - x.agora;
      if (disp <= 0) continue;
      const q = Math.min(disp, resto); x[campo] += q; resto -= q;
    }
    if (resto > 0) { const l = [...ls].reverse().find((y) => y.itens[pid]) || novo('sem-lote', 'SEM LOTE', c?.desde || today()); it(l, pid)[campo] += resto; }
  };
  const fechs = Object.fromEntries(s.fechamentos.filter((f) => f.clienteId === cid).map((f) => [f.id, f]));
  const movs = s.movs.filter((m) => m.clienteId === cid).sort((a, b) => {
    const da = a.tipo === 'remessa' ? a.entregueEm || a.data : a.data, db = b.tipo === 'remessa' ? b.entregueEm || b.data : b.data;
    return da < db ? -1 : da > db ? 1 : (a.ts || 0) - (b.ts || 0);
  });
  for (const m of movs) {
    if (m.tipo === 'remessa') {
      if (m.entrega && m.entrega !== 'entregue') continue;
      const l = novo(m.remessaId || `leg-${m.data}`, m.protocolo || `Remessa ${m.data.split('-').reverse().join('/')}`, m.entregueEm || m.data);
      it(l, m.produtoId).enviado += m.qtd;
    } else if (m.tipo === 'consumo') {
      consumir(m.produtoId, m.qtd, 'vendido');
    } else if (m.tipo === 'devolucao') consumir(m.produtoId, m.qtd, 'baixa');
    else if (m.tipo === 'ajuste_parceiro') {
      if (m.qtd < 0) consumir(m.produtoId, -m.qtd, 'baixa');
      else it(novo(`aj-${m.id}`, 'AJUSTE', m.data), m.produtoId).enviado += m.qtd;
    }
  }
  ls.sort((a, b) => (a.entregueEm < b.entregueEm ? -1 : a.entregueEm > b.entregueEm ? 1 : 0));
  // acertos: fechamentos novos guardam por lote; antigos (sem acertos) acertaram tudo o que venderam
  for (const f of Object.values(fechs)) {
    if (f.status !== 'aprovado' && f.status !== 'pago') continue;
    if (f.acertos) for (const a of f.acertos) { const l = porId[a.loteId]; if (l) { it(l, a.produtoId).acertado += a.qtd; if (!l.ultimoAcerto || f.fim > l.ultimoAcerto) l.ultimoAcerto = f.fim; } }
  }
  const legados = new Set(Object.values(fechs).filter((f) => !f.acertos).map((f) => f.id));
  if (legados.size) {
    // vendas apuradas em fechamentos antigos já foram cobradas por inteiro
    const vendLeg = {};
    for (const m of movs) if (m.tipo === 'consumo' && legados.has(m.ref)) vendLeg[m.produtoId] = (vendLeg[m.produtoId] || 0) + m.qtd;
    for (const [pid, q] of Object.entries(vendLeg)) {
      let resto = q;
      for (const l of ls) { const x = l.itens[pid]; if (!x || resto <= 0) continue; const pode = x.vendido - x.acertado; const u = Math.min(pode, resto); if (u > 0) { x.acertado += u; resto -= u; } }
    }
    const ultLeg = Object.values(fechs).filter((f) => legados.has(f.id) && f.status !== 'enviado').map((f) => f.fim).sort().pop();
    if (ultLeg) for (const l of ls) if (l.entregueEm <= ultLeg && (!l.ultimoAcerto || ultLeg > l.ultimoAcerto)) l.ultimoAcerto = ultLeg;
  }
  // simulação do fechamento em andamento: vendido de agora entra nos lotes mais antigos
  if (simular) for (const [pid, q] of Object.entries(simular)) if (q > 0) consumir(pid, q, 'agora');
  const t = today();
  return ls.map((l) => {
    let restante = 0, pendente = 0, agora = 0, valorPendente = 0, enviado = 0;
    for (const [pid, x] of Object.entries(l.itens)) {
      const pr = produto(s, pid)?.preco || 0;
      enviado += x.enviado; restante += x.enviado - x.vendido - x.baixa - x.agora; pendente += x.vendido - x.acertado; agora += x.agora;
      valorPendente += (x.vendido - x.acertado + x.agora) * pr;
    }
    const vence = addDays(l.ultimoAcerto || l.entregueEm, ciclo);
    const aberto = restante > 0 || pendente + agora > 0;
    const dias = diffDays(vence, t);
    return { ...l, enviado, restante, pendente, agora, aAcertar: pendente + agora, valorPendente, vence, dias, aberto,
      situacao: !aberto ? 'quitado' : dias < 0 ? 'vencido' : dias <= 3 ? 'vencendo' : 'em_dia' };
  });
}
export const SITUACAO_LOTE = { vencido: { label: 'Vencido', tone: 'crit' }, vencendo: { label: 'Vence logo', tone: 'warn' }, em_dia: { label: 'Em dia', tone: 'ok' }, quitado: { label: 'Quitado', tone: '' } };
export const lotesAbertos = (s, cid, opts) => lotes(s, cid, opts).filter((l) => l.aberto);

// Agenda: próximo fechamento de cada parceiro (período ou lote que vence primeiro)
export function agendaFechamentos(s) {
  return s.clientes.filter((c) => c.ativo).map((c) => {
    const per = periodoAtual(s, c.id);
    const ls = lotesAbertos(s, c.id);
    const vencidos = ls.filter((l) => l.situacao === 'vencido'), vencendo = ls.filter((l) => l.situacao === 'vencendo');
    const proxLote = ls.map((l) => l.vence).sort()[0];
    const data = [per.previsto, proxLote].filter(Boolean).sort()[0];
    const rv = vendasCliente(s, c.id, per.marco);
    const estimado = sum(rv, (v) => v.qtd * v.preco) + sum(ls, (l) => l.valorPendente);
    return { c, per, lotes: ls, vencidos, vencendo, data, dias: diffDays(data, today()), estimado };
  }).sort((a, b) => (a.per.pendente ? -1 : 0) - (b.per.pendente ? -1 : 0) || (a.data < b.data ? -1 : 1));
}

export function emTransito(s) {
  const m = {};
  for (const mv of s.movs) if (!entregue(mv)) m[mv.produtoId] = (m[mv.produtoId] || 0) + mv.qtd;
  return m;
}

// ---------- Pedidos de reposição (parceiro, entre fechamentos) ----------
export const STATUS_PEDIDO = { solicitado: { label: 'Solicitado', tone: 'warn' }, aprovado: { label: 'Aprovado', tone: 'ok' }, recusado: { label: 'Recusado', tone: 'crit' } };
export const pedidos = (s) => s.pedidos || [];
export const valorItens = (s, itens) => sum(itens, (i) => i.qtd * (produto(s, i.produtoId)?.preco || 0));

// Disponível para pedir = estoque central − pedidos e reposições aguardando aprovação.
// No app do parceiro (nuvem) o número vem pronto do servidor (s.disponivelRemoto).
export function estoqueDisponivel(s, { ignorarFechamento } = {}) {
  if (s.disponivelRemoto) return { ...s.disponivelRemoto };
  const d = estoqueCentral(s);
  for (const p of pedidos(s)) if (p.status === 'solicitado') for (const i of p.itens) d[i.produtoId] = (d[i.produtoId] || 0) - i.qtd;
  for (const f of s.fechamentos) if (f.status === 'enviado' && f.id !== ignorarFechamento) for (const i of f.reposicao || []) d[i.produtoId] = (d[i.produtoId] || 0) - i.qtd;
  for (const k of Object.keys(d)) d[k] = Math.max(0, d[k]);
  return d;
}

export function criarPedido(s, { clienteId, itens, obs = '' }) {
  const p = { id: uid('pd'), clienteId, data: today(), ts: Date.now(), status: 'solicitado', itens: itens.filter((i) => i.qtd > 0), obs };
  (s.pedidos ||= []).push(p);
  return p;
}

export function aprovarPedido(s, id, { itens, status = 'a_separar', data = today() } = {}) {
  const p = pedidos(s).find((x) => x.id === id);
  const central = estoqueCentral(s);
  const enviar = (itens || p.itens).map((i) => ({ produtoId: i.produtoId, qtd: Math.min(i.qtd, Math.max(0, central[i.produtoId] || 0)) })).filter((i) => i.qtd > 0);
  p.status = 'aprovado'; p.aprovadoEm = data; p.itensAprovados = enviar;
  if (enviar.length) p.remessaId = criarRemessa(s, { clienteId: p.clienteId, itens: enviar, status, data, ref: p.id, obs: 'Pedido de reposição' });
  return p;
}

export function recusarPedido(s, id, motivo = '') {
  const p = pedidos(s).find((x) => x.id === id);
  p.status = 'recusado'; p.motivo = motivo; p.recusadoEm = today();
}

// ---------- Período / fechamentos ----------

export const fechamentosDe = (s, cid) => s.fechamentos.filter((f) => f.clienteId === cid).sort((a, b) => (a.fim < b.fim ? -1 : 1));
export const ultimoFechado = (s, cid) => fechamentosDe(s, cid).filter((f) => f.status === 'aprovado' || f.status === 'pago').pop();
export const pendente = (s, cid) => s.fechamentos.find((f) => f.clienteId === cid && f.status === 'enviado');

export function periodoAtual(s, cid) {
  const c = cliente(s, cid);
  const pend = pendente(s, cid);
  const ult = ultimoFechado(s, cid);
  const inicio = pend?.fim || ult?.fim || c.desde;
  // marco: vendas do mesmo dia só entram no período se foram lançadas depois do fechamento (ts)
  const ref = pend || ult;
  const marco = ref ? { data: ref.fim, ts: ref.ts ?? Infinity } : { data: c.desde, ts: 0 };
  return { inicio, marco, desde: ref ? (ref.ts ? ref.fim : addDays(inicio, 1)) : inicio, previsto: addDays(inicio, c.cicloDias), pendente: pend, ultimo: ult };
}

// de: data 'YYYY-MM-DD' (exclusiva) ou o marco de um período { data, ts }
const depoisDe = (v, de) => !de || (typeof de === 'string' ? v.data > de : v.data > de.data || (v.data === de.data && (v.ts || 0) > de.ts));
export const vendasCliente = (s, cid, de, ate) =>
  s.vendas.filter((v) => v.clienteId === cid && depoisDe(v, de) && (!ate || v.data <= ate));

// Saldo esperado agora no parceiro: consignado (ou última contagem enviada) menos vendas registradas depois
export function saldoEstimado(s, cid) {
  const per = periodoAtual(s, cid);
  const base = { ...saldoCliente(s, cid) };
  if (per.pendente) for (const it of per.pendente.itens) base[it.produtoId] = it.contagem;
  for (const v of vendasCliente(s, cid, per.marco)) base[v.produtoId] = (base[v.produtoId] || 0) - v.qtd;
  for (const k of Object.keys(base)) if (base[k] < 0) base[k] = 0;
  return base;
}

// Venda média diária de um rótulo num parceiro (apurada nos fechamentos + registros do período atual)
export function taxaDiaria(s, cid, pid, janela = 75) {
  const desde = addDays(today(), -janela);
  const fs = fechamentosDe(s, cid).filter((f) => f.status !== 'rascunho' && f.fim > desde);
  let vendido = 0;
  let inicio = null;
  for (const f of fs) {
    const it = f.itens.find((i) => i.produtoId === pid);
    if (it) vendido += it.vendido;
    if (!inicio || f.inicio < inicio) inicio = f.inicio;
  }
  const per = periodoAtual(s, cid);
  vendido += sum(vendasCliente(s, cid, per.marco).filter((v) => v.produtoId === pid), (v) => v.qtd);
  inicio = inicio || per.inicio;
  const dias = Math.max(7, diffDays(today(), inicio));
  return vendido / dias;
}

// Reposição inteligente: nível-alvo = venda média × ciclo × 1,3 (margem de segurança) + 1
export function sugestaoReposicao(s, cid, contagem) {
  const c = cliente(s, cid);
  const out = {};
  const pids = new Set([...Object.keys(contagem), ...Object.keys(c.par || {})]);
  for (const pid of pids) {
    const rate = taxaDiaria(s, cid, pid);
    const alvo = rate > 0.01 ? Math.max(2, Math.ceil(rate * c.cicloDias * 1.3) + 1) : Math.min(c.par?.[pid] ?? 2, 2);
    out[pid] = { alvo, rate, qtd: Math.max(0, alvo - (contagem[pid] || 0)) };
  }
  return out;
}

export function montarFechamento(s, cid, { contagem, reposicao = {}, forma, obs = '', criadoPor = 'cliente', data = today(), esperado = {}, justificativas = {}, lotesSel }) {
  const c = cliente(s, cid);
  const per = periodoAtual(s, cid);
  const saldo = saldoCliente(s, cid);
  const registradas = vendasCliente(s, cid, per.marco, data);
  const itens = Object.keys({ ...saldo, ...contagem })
    .filter((pid) => (saldo[pid] || 0) > 0 || contagem[pid] > 0)
    .map((pid) => {
      const saldoAnterior = saldo[pid] || 0;
      const cont = Math.min(saldoAnterior, Math.max(0, contagem[pid] ?? saldoAnterior));
      const vendido = saldoAnterior - cont;
      const preco = produto(s, pid).preco;
      const item = {
        produtoId: pid, saldoAnterior, contagem: cont, vendido, preco, valor: vendido * preco,
        registrado: sum(registradas.filter((v) => v.produtoId === pid), (v) => v.qtd),
      };
      // contagem diferente do esperado pelo app → ajuste com justificativa
      if (esperado[pid] !== undefined) {
        item.esperado = esperado[pid];
        if (cont !== esperado[pid]) item.justificativa = (justificativas[pid] || '').trim();
      }
      return item;
    });
  // acerto por lote: vendido de agora (PEPS) + o que ficou a acertar em fechamentos anteriores
  const ls = lotes(s, cid, { simular: Object.fromEntries(itens.map((i) => [i.produtoId, i.vendido])) }).filter((l) => l.aAcertar > 0);
  const sel = new Set(lotesSel || ls.map((l) => l.id));
  const acertos = [];
  for (const l of ls) {
    if (!sel.has(l.id)) continue;
    for (const [pid, x] of Object.entries(l.itens)) {
      const q = x.vendido - x.acertado + x.agora;
      if (q > 0) { const pr = produto(s, pid).preco; acertos.push({ loteId: l.id, protocolo: l.protocolo, produtoId: pid, qtd: q, preco: pr, valor: q * pr }); }
    }
  }
  const naoAcertado = sum(ls.filter((l) => !sel.has(l.id)), (l) => l.aAcertar);
  return {
    id: uid('fc'), numero: `FEC-${c.codigo}-${String(s.fechamentos.filter((f) => f.clienteId === cid).length + 1).padStart(3, '0')}`,
    clienteId: cid, inicio: per.inicio, fim: data, status: 'enviado', criadoPor,
    itens, acertos, lotesSel: [...sel].filter((id) => ls.some((l) => l.id === id)), naoAcertado,
    vendidas: sum(itens, (i) => i.vendido), total: sum(acertos, (a) => a.valor), garrafas: sum(acertos, (a) => a.qtd),
    reposicao: Object.entries(reposicao).filter(([, q]) => q > 0).map(([produtoId, qtd]) => ({ produtoId, qtd })),
    formaPagamento: forma || c.formaPadrao, obs, enviadoEm: data, ts: Date.now(),
    ajustes: itens.filter((i) => i.esperado !== undefined && i.contagem !== i.esperado).length,
  };
}

export function enviarFechamento(s, f) { s.fechamentos.push(f); return f; }

// Aprovação pelo gestor: baixa o vendido da consignação, gera a conta a receber e envia a reposição
export function aprovarFechamento(s, id, { data = today(), reposicao } = {}) {
  const f = s.fechamentos.find((x) => x.id === id);
  const c = cliente(s, f.clienteId);
  const avisos = [];
  for (const it of f.itens) {
    if (it.vendido > 0) addMov(s, { data: f.fim, tipo: 'consumo', produtoId: it.produtoId, qtd: it.vendido, clienteId: c.id, precoUnit: it.preco, ref: f.id });
  }
  const repo = reposicao || f.reposicao;
  const central = estoqueCentral(s);
  f.reposicaoEnviada = [];
  for (const r of repo) {
    const disp = Math.max(0, central[r.produtoId] || 0);
    const q = Math.min(r.qtd, disp);
    if (q < r.qtd) avisos.push(`${produto(s, r.produtoId).nome}: só havia ${disp} no estoque central`);
    if (q > 0) {
      central[r.produtoId] -= q;
      f.reposicaoEnviada.push({ produtoId: r.produtoId, qtd: q });
      (c.par ||= {})[r.produtoId] = Math.max(c.par[r.produtoId] || 0, 1);
    }
  }
  if (f.reposicaoEnviada.length) f.remessaId = criarRemessa(s, { clienteId: c.id, itens: f.reposicaoEnviada, data, ref: f.id, obs: 'Reposição do fechamento' });
  f.status = f.total > 0 ? 'aprovado' : 'pago';
  f.aprovadoEm = data;
  f.vencimento = addDays(data, c.prazoDias);
  if (f.total === 0) f.pagoEm = data;
  return avisos;
}

export function registrarPagamento(s, id, { data = today(), forma } = {}) {
  const f = s.fechamentos.find((x) => x.id === id);
  f.status = 'pago';
  f.pagoEm = data;
  if (forma) f.formaPagamento = forma;
}

export function registrarVenda(s, { clienteId, produtoId, qtd = 1, garcomId, data = today(), hora }) {
  const c = cliente(s, clienteId);
  const v = { id: uid('vd'), ts: Date.now(), data, hora, clienteId, produtoId, qtd, garcomId, precoCarta: precoCarta(s, c, produtoId), preco: produto(s, produtoId).preco };
  s.vendas.push(v);
  return v;
}

// ---------- Indicadores do parceiro ----------

export function resumoVendas(s, cid, de, ate) {
  const vs = vendasCliente(s, cid, de, ate);
  const porProduto = {};
  const porGarcom = {};
  const matriz = {};
  for (const v of vs) {
    const p = (porProduto[v.produtoId] ||= { produtoId: v.produtoId, qtd: 0, receita: 0, custo: 0 });
    p.qtd += v.qtd; p.receita += v.qtd * v.precoCarta; p.custo += v.qtd * v.preco;
    const g = (porGarcom[v.garcomId || '-'] ||= { garcomId: v.garcomId, qtd: 0, receita: 0 });
    g.qtd += v.qtd; g.receita += v.qtd * v.precoCarta;
    const row = (matriz[v.garcomId || '-'] ||= {});
    row[v.produtoId] = (row[v.produtoId] || 0) + v.qtd;
  }
  return {
    vendas: vs,
    garrafas: sum(vs, (v) => v.qtd),
    receita: sum(vs, (v) => v.qtd * v.precoCarta),
    custo: sum(vs, (v) => v.qtd * v.preco),
    porProduto: Object.values(porProduto).sort((a, b) => b.receita - a.receita),
    porGarcom: Object.values(porGarcom).sort((a, b) => b.receita - a.receita),
    matriz,
  };
}

// ---------- Indicadores da distribuidora ----------

export function contasReceber(s) {
  const t = today();
  return s.fechamentos.filter((f) => f.status === 'aprovado')
    .map((f) => ({ ...f, atraso: Math.max(0, diffDays(t, f.vencimento)) }))
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
}

// Custo médio de todos os rótulos de uma vez (evita recalcular dentro de laços)
export function custosMedios(s) {
  const q = {}, v = {};
  for (const m of s.movs) if (m.tipo === 'entrada' && m.custoUnit) { q[m.produtoId] = (q[m.produtoId] || 0) + m.qtd; v[m.produtoId] = (v[m.produtoId] || 0) + m.qtd * m.custoUnit; }
  return Object.fromEntries(s.produtos.map((p) => [p.id, q[p.id] ? v[p.id] / q[p.id] : p.custo || 0]));
}

export function custoMedio(s, pid) {
  const es = s.movs.filter((m) => m.tipo === 'entrada' && m.produtoId === pid && m.custoUnit);
  const q = sum(es, (m) => m.qtd);
  return q ? sum(es, (m) => m.qtd * m.custoUnit) / q : produto(s, pid).custo;
}

// Receita reconhecida = vendas apuradas nos fechamentos (consumo) + vendas diretas
export function vendasRealizadas(s) {
  return s.movs.filter((m) => m.tipo === 'consumo' || m.tipo === 'venda_direta')
    .map((m) => ({ ...m, receita: m.qtd * (m.precoUnit || 0), cmv: m.qtd * custoMedio(s, m.produtoId) }));
}

export function serieMensal(s, meses = 6) {
  const t = today();
  const keys = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    keys.push(iso(d).slice(0, 7));
  }
  const base = Object.fromEntries(keys.map((k) => [k, { mes: k, receita: 0, cmv: 0, garrafas: 0, despesas: 0, recebido: 0 }]));
  for (const v of vendasRealizadas(s)) {
    const b = base[monthKey(v.data)]; if (!b) continue;
    b.receita += v.receita; b.cmv += v.cmv; b.garrafas += v.qtd;
  }
  for (const d of s.despesas) { const b = base[monthKey(d.data)]; if (b && d.categoria !== 'Compra de mercadoria') b.despesas += d.valor; }
  for (const f of s.fechamentos) { if (f.status === 'pago' && f.pagoEm <= t) { const b = base[monthKey(f.pagoEm)]; if (b) b.recebido += f.total; } }
  for (const m of s.movs) if (m.tipo === 'venda_direta') { const b = base[monthKey(m.data)]; if (b) b.recebido += m.qtd * m.precoUnit; }
  return keys.map((k) => ({ ...base[k], lucro: base[k].receita - base[k].cmv - base[k].despesas }));
}

// Balanço de um mês (competência e caixa) com os lançamentos que o compõem
export function balancoMes(s, mes) {
  const vendas = vendasRealizadas(s).filter((v) => v.data.startsWith(mes));
  const despesas = s.despesas.filter((d) => d.data.startsWith(mes));
  const recebimentos = [
    ...s.fechamentos.filter((f) => f.status === 'pago' && (f.pagoEm || '').startsWith(mes)).map((f) => ({ data: f.pagoEm, descricao: `Fechamento ${cliente(s, f.clienteId)?.nome || ''}`, forma: f.formaPagamento, valor: f.total, link: `#/fechamento/${f.id}` })),
    ...s.movs.filter((m) => m.tipo === 'venda_direta' && m.data.startsWith(mes)).map((m) => ({ data: m.data, descricao: `Venda direta · ${m.qtd}× ${produto(s, m.produtoId)?.nome}`, forma: '', valor: m.qtd * (m.precoUnit || 0) })),
  ].sort((a, b) => (a.data < b.data ? -1 : 1));
  const receita = sum(vendas, (v) => v.receita), cmv = sum(vendas, (v) => v.cmv);
  const compras = sum(despesas.filter((d) => d.categoria === 'Compra de mercadoria'), (d) => d.valor);
  const operacionais = sum(despesas.filter((d) => d.categoria !== 'Compra de mercadoria'), (d) => d.valor);
  const recebido = sum(recebimentos, (r) => r.valor);
  const porParceiro = {};
  for (const v of vendas) { const k = v.clienteId ? cliente(s, v.clienteId)?.nome : 'Vendas diretas'; porParceiro[k] = (porParceiro[k] || 0) + v.receita; }
  const porCategoria = {};
  for (const d of despesas) porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + d.valor;
  return { mes, receita, cmv, lucroBruto: receita - cmv, operacionais, compras, resultado: receita - cmv - operacionais,
    recebido, pago: compras + operacionais, saldoCaixa: recebido - compras - operacionais, garrafas: sum(vendas, (v) => v.qtd),
    despesas: [...despesas].sort((a, b) => (a.data < b.data ? -1 : 1)), recebimentos, porParceiro, porCategoria,
    aReceber: sum(contasReceber(s).filter((f) => (f.vencimento || '').startsWith(mes)), (f) => f.total) };
}

// Vendas registradas por todos os parceiros num intervalo (acompanhamento em tempo real)
export function resumoRede(s, de, ate = today()) {
  const vs = s.vendas.filter((v) => v.data >= de && v.data <= ate);
  const porCliente = {}, porProduto = {}, porDia = {}, porHora = {};
  for (const v of vs) {
    const c = (porCliente[v.clienteId] ||= { clienteId: v.clienteId, qtd: 0, receita: 0, valor: 0 });
    c.qtd += v.qtd; c.receita += v.qtd * v.precoCarta; c.valor += v.qtd * v.preco;
    const p = (porProduto[v.produtoId] ||= { produtoId: v.produtoId, qtd: 0, valor: 0 });
    p.qtd += v.qtd; p.valor += v.qtd * v.preco;
    porDia[v.data] = (porDia[v.data] || 0) + v.qtd;
    const h = (v.hora || '').split(':')[0];
    if (h) porHora[+h] = (porHora[+h] || 0) + v.qtd;
  }
  return {
    vendas: [...vs].sort((a, b) => ((b.ts || 0) - (a.ts || 0)) || (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || ''))),
    garrafas: sum(vs, (v) => v.qtd), receita: sum(vs, (v) => v.qtd * v.precoCarta), valor: sum(vs, (v) => v.qtd * v.preco),
    porCliente: Object.values(porCliente).sort((a, b) => b.valor - a.valor), porProduto: Object.values(porProduto).sort((a, b) => b.qtd - a.qtd), porDia, porHora,
  };
}

// Consumo diário total de cada rótulo (todos os parceiros + vendas diretas) nos últimos N dias
export function giroDiario(s, janela = 60) {
  const desde = addDays(today(), -janela);
  const m = Object.fromEntries(s.produtos.map((p) => [p.id, 0]));
  for (const mv of s.movs) if ((mv.tipo === 'consumo' || mv.tipo === 'venda_direta') && mv.data > desde) m[mv.produtoId] += mv.qtd / janela;
  return m;
}

export function coberturaCentral(s) {
  const est = estoqueCentral(s);
  const giro = giroDiario(s);
  return s.produtos.map((p) => ({ produto: p, estoque: est[p.id], giro: giro[p.id], dias: giro[p.id] > 0 ? est[p.id] / giro[p.id] : Infinity }));
}

// Curva ABC por receita (últimos 90 dias)
export function curvaABC(s, janela = 90) {
  const desde = addDays(today(), -janela);
  const rec = {};
  for (const v of vendasRealizadas(s)) if (v.data > desde) rec[v.produtoId] = (rec[v.produtoId] || 0) + v.receita;
  const total = sum(Object.values(rec));
  let acc = 0;
  return s.produtos.map((p) => ({ produto: p, receita: rec[p.id] || 0 })).sort((a, b) => b.receita - a.receita).map((x) => {
    acc += x.receita;
    const share = total ? acc / total : 1;
    return { ...x, share: total ? x.receita / total : 0, classe: share <= 0.8 ? 'A' : share <= 0.95 ? 'B' : 'C' };
  });
}

export function rankingClientes(s, janela = 90) {
  const desde = addDays(today(), -janela);
  const cons = consignado(s);
  return s.clientes.filter((c) => c.ativo).map((c) => {
    const fs = s.fechamentos.filter((f) => f.clienteId === c.id && f.fim > desde && f.status !== 'rascunho');
    const receita = sum(fs, (f) => f.total);
    const garrafas = sum(fs, (f) => f.garrafas);
    const saldo = cons[c.id] || {};
    const emConsig = sum(Object.entries(saldo), ([pid, q]) => q * produto(s, pid).preco);
    const garrafasConsig = sum(Object.values(saldo));
    return { cliente: c, receita, garrafas, emConsig, garrafasConsig, giro: garrafasConsig ? garrafas / garrafasConsig : 0 };
  }).sort((a, b) => b.receita - a.receita);
}

// Rótulos que o parceiro ainda não tem, ordenados pelo desempenho em parceiros parecidos
export function recomendacoes(s, cid, n = 3) {
  const c = cliente(s, cid);
  const tem = new Set(Object.entries(saldoCliente(s, cid)).filter(([, q]) => q > 0).map(([p]) => p));
  const score = {};
  for (const o of s.clientes) {
    if (o.id === cid || !o.ativo) continue;
    const peso = o.regiao === c.regiao ? 1.5 : 1;
    for (const p of s.produtos) {
      if (tem.has(p.id)) continue;
      const r = taxaDiaria(s, o.id, p.id);
      if (r > 0) (score[p.id] ||= { produtoId: p.id, score: 0, n: 0 }), score[p.id].score += r * 30 * peso, score[p.id].n++;
    }
  }
  const out = Object.values(score).map((x) => ({ ...x, mes: x.score / x.n })).sort((a, b) => b.mes - a.mes).slice(0, n);
  // No app do parceiro só existe o próprio cadastro: usa as sugestões calculadas pela Gestão
  if (!out.length && c.recomendados?.length) return c.recomendados.filter((pid) => !tem.has(pid)).slice(0, n).map((produtoId) => ({ produtoId, score: 0, n: 0, mes: 0 }));
  return out;
}

export function insights(s) {
  const t = today();
  const out = [];
  for (const f of s.fechamentos.filter((x) => x.status === 'enviado')) {
    const c = cliente(s, f.clienteId);
    out.push({ nivel: 'acao', icone: 'inbox', titulo: `${c.nome} enviou o fechamento`, texto: `${f.garrafas} garrafas vendidas${f.ajustes ? ` · ${f.ajustes} ajuste(s) de contagem justificado(s)` : ''} · aguardando sua conferência`, link: `#/fechamento/${f.id}` });
  }
  for (const p of pedidos(s).filter((x) => x.status === 'solicitado')) {
    out.push({ nivel: 'acao', icone: 'truck', titulo: `${cliente(s, p.clienteId)?.nome} pediu reposição`, texto: `${sum(p.itens, (i) => i.qtd)} garrafas · ${p.itens.map((i) => produto(s, i.produtoId)?.nome).join(', ')}`, link: '#/remessas', valor: valorItens(s, p.itens) });
  }
  for (const r of contasReceber(s).filter((x) => x.atraso > 0)) {
    const c = cliente(s, r.clienteId);
    out.push({ nivel: 'critico', icone: 'alert', titulo: `Pagamento atrasado: ${c.nome}`, texto: `Venceu há ${r.atraso} dias`, link: `#/fechamento/${r.id}`, valor: r.total });
  }
  for (const x of coberturaCentral(s)) {
    if (x.dias < 45 && x.produto.ativo) out.push({ nivel: x.dias < 20 ? 'critico' : 'atencao', icone: 'box', titulo: x.estoque <= 0 ? `${x.produto.nome}: esgotado no estoque central` : `${x.produto.nome}: estoque para ~${Math.floor(x.dias)} dias`, texto: `${x.estoque} garrafas no estoque central, giro de ${(x.giro * 30).toFixed(0)}/mês. Programe nova importação.`, link: `#/estoque` });
  }
  for (const c of s.clientes.filter((x) => x.ativo)) {
    const venc = lotesAbertos(s, c.id).filter((l) => l.situacao === 'vencido' && (l.aAcertar > 0 || l.restante > 0));
    if (venc.length) out.push({ nivel: 'atencao', icone: 'calendar', titulo: `${c.nome}: ${venc.length} lote(s) vencido(s)`, texto: venc.map((l) => `${l.protocolo} (venceu ${l.vence.split('-').reverse().join('/')})`).join(', '), link: `#/parceiro/${c.id}?tab=estoque` });
  }
  for (const r of remessas(s).filter((x) => x.status !== 'entregue')) {
    const dias = diffDays(t, r.data);
    if (dias >= 2) out.push({ nivel: 'atencao', icone: 'truck', titulo: `Remessa ${{ a_separar: 'a separar', separado: 'separada', em_rota: 'em rota' }[r.status]} há ${dias} dias`, texto: `${cliente(s, r.clienteId)?.nome} · ${r.garrafas} garrafas`, link: '#/remessas' });
  }
  for (const c of s.clientes.filter((x) => x.ativo)) {
    const per = periodoAtual(s, c.id);
    if (!per.pendente && diffDays(t, per.previsto) > 2) out.push({ nivel: 'atencao', icone: 'calendar', titulo: `Fechamento atrasado: ${c.nome}`, texto: `Previsto para ${per.previsto.split('-').reverse().join('/')}`, link: `#/cliente/${c.id}` });
    const saldo = saldoCliente(s, c.id);
    for (const [pid, q] of Object.entries(saldo)) {
      if (q < 3 || diffDays(t, c.desde) < 45) continue;
      if (taxaDiaria(s, c.id, pid, 45) < 0.02) out.push({ nivel: 'info', icone: 'pause', titulo: `${produto(s, pid).nome} parado em ${c.nome}`, texto: `${q} garrafas sem giro há mais de 45 dias. Avalie recolher ou trocar por outro rótulo.`, link: `#/cliente/${c.id}` });
    }
    const ult = per.ultimo;
    if (ult) {
      const reg = sum(ult.itens, (i) => i.registrado);
      if (ult.garrafas >= 6 && reg / ult.garrafas < 0.85) out.push({ nivel: 'info', icone: 'users', titulo: `${c.nome}: vendas pouco registradas no app`, texto: `${ult.garrafas - reg} de ${ult.garrafas} garrafas do último fechamento não foram lançadas pela equipe. Os relatórios por garçom ficam incompletos.`, link: `#/cliente/${c.id}` });
    }
  }
  for (const c of s.clientes.filter((x) => x.ativo)) {
    const rec = recomendacoes(s, c.id, 1)[0];
    if (rec && rec.mes >= 3) out.push({ nivel: 'oportunidade', icone: 'spark', titulo: `Oferecer ${produto(s, rec.produtoId).nome} para ${c.nome}`, texto: `Vende ~${rec.mes.toFixed(0)} garrafas/mês em parceiros parecidos e ainda não está na carta deles.`, link: `#/cliente/${c.id}` });
  }
  const ordem = { acao: 0, critico: 1, atencao: 2, oportunidade: 3, info: 4 };
  return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
