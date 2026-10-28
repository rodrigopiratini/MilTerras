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
};

export const STATUS_FECH = {
  rascunho: { label: 'Rascunho', tone: 'muted' },
  enviado: { label: 'Aguardando conferência', tone: 'warn' },
  aprovado: { label: 'A receber', tone: 'info' },
  pago: { label: 'Pago', tone: 'ok' },
};

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
    if (!f || !mv.clienteId) continue;
    const c = (m[mv.clienteId] ||= {});
    c[mv.produtoId] = (c[mv.produtoId] || 0) + mv.qtd * f;
  }
  return m;
}

export const saldoCliente = (s, cid) => consignado(s)[cid] || {};

export function addMov(s, mv) {
  const m = { id: uid('mv'), data: today(), ...mv };
  s.movs.push(m);
  return m;
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
  return { inicio, previsto: addDays(inicio, c.cicloDias), pendente: pend, ultimo: ult };
}

export const vendasCliente = (s, cid, de, ate) =>
  s.vendas.filter((v) => v.clienteId === cid && (!de || v.data > de) && (!ate || v.data <= ate));

// Saldo esperado agora no parceiro: consignado (ou última contagem enviada) menos vendas registradas depois
export function saldoEstimado(s, cid) {
  const per = periodoAtual(s, cid);
  const base = { ...saldoCliente(s, cid) };
  if (per.pendente) for (const it of per.pendente.itens) base[it.produtoId] = it.contagem;
  for (const v of vendasCliente(s, cid, per.inicio)) base[v.produtoId] = (base[v.produtoId] || 0) - v.qtd;
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
  vendido += sum(vendasCliente(s, cid, per.inicio).filter((v) => v.produtoId === pid), (v) => v.qtd);
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

export function montarFechamento(s, cid, { contagem, reposicao = {}, forma, obs = '', criadoPor = 'cliente', data = today() }) {
  const c = cliente(s, cid);
  const per = periodoAtual(s, cid);
  const saldo = saldoCliente(s, cid);
  const registradas = vendasCliente(s, cid, per.inicio, data);
  const itens = Object.keys({ ...saldo, ...contagem })
    .filter((pid) => (saldo[pid] || 0) > 0 || contagem[pid] > 0)
    .map((pid) => {
      const saldoAnterior = saldo[pid] || 0;
      const cont = Math.min(saldoAnterior, Math.max(0, contagem[pid] ?? saldoAnterior));
      const vendido = saldoAnterior - cont;
      const preco = produto(s, pid).preco;
      return {
        produtoId: pid, saldoAnterior, contagem: cont, vendido, preco, valor: vendido * preco,
        registrado: sum(registradas.filter((v) => v.produtoId === pid), (v) => v.qtd),
      };
    });
  return {
    id: uid('fc'), clienteId: cid, inicio: per.inicio, fim: data, status: 'enviado', criadoPor,
    itens, total: sum(itens, (i) => i.valor), garrafas: sum(itens, (i) => i.vendido),
    reposicao: Object.entries(reposicao).filter(([, q]) => q > 0).map(([produtoId, qtd]) => ({ produtoId, qtd })),
    formaPagamento: forma || c.formaPadrao, obs, enviadoEm: data,
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
      addMov(s, { data, tipo: 'remessa', produtoId: r.produtoId, qtd: q, clienteId: c.id, ref: f.id });
      central[r.produtoId] -= q;
      f.reposicaoEnviada.push({ produtoId: r.produtoId, qtd: q });
      c.par[r.produtoId] = Math.max(c.par[r.produtoId] || 0, 1);
    }
  }
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
  const v = { id: uid('vd'), data, hora, clienteId, produtoId, qtd, garcomId, precoCarta: precoCarta(s, c, produtoId), preco: produto(s, produtoId).preco };
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
  return Object.values(score).map((x) => ({ ...x, mes: x.score / x.n })).sort((a, b) => b.mes - a.mes).slice(0, n);
}

export function insights(s) {
  const t = today();
  const out = [];
  for (const f of s.fechamentos.filter((x) => x.status === 'enviado')) {
    const c = cliente(s, f.clienteId);
    out.push({ nivel: 'acao', icone: 'inbox', titulo: `${c.nome} enviou o fechamento`, texto: `${f.garrafas} garrafas vendidas · aguardando sua conferência`, link: `#/fechamento/${f.id}` });
  }
  for (const r of contasReceber(s).filter((x) => x.atraso > 0)) {
    const c = cliente(s, r.clienteId);
    out.push({ nivel: 'critico', icone: 'alert', titulo: `Pagamento atrasado: ${c.nome}`, texto: `Venceu há ${r.atraso} dias`, link: `#/fechamento/${r.id}`, valor: r.total });
  }
  for (const x of coberturaCentral(s)) {
    if (x.dias < 45 && x.produto.ativo) out.push({ nivel: x.dias < 20 ? 'critico' : 'atencao', icone: 'box', titulo: x.estoque <= 0 ? `${x.produto.nome}: esgotado no estoque central` : `${x.produto.nome}: estoque para ~${Math.floor(x.dias)} dias`, texto: `${x.estoque} garrafas no estoque central, giro de ${(x.giro * 30).toFixed(0)}/mês. Programe nova importação.`, link: `#/estoque` });
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
