// Assistente (IA) da Mil Terras: números que as telas calculam e o assistente do núcleo só lê
// (as regras do negócio para o assistente ficam em segmento.js › assistente).
import * as D from './dominio.js';

const r2 = (x) => Math.round((+x || 0) * 100) / 100;

// Números que as telas calculam (o assistente só lê)
export function extrasGestao(s) {
  const central = D.estoqueCentral(s), disp = D.estoqueDisponivel(s), cons = D.consignado(s);
  return {
    estoque_central: { nome: 'Estoque central (calculado)', docs: s.produtos.map((p) => ({ id: 'ec_' + p.id, produtoId: p.id, qtd: central[p.id] || 0, disponivel: disp[p.id] || 0 })) },
    consignado: { nome: 'Garrafas em consignação nos parceiros (calculado)', docs: Object.entries(cons).flatMap(([cid, m]) => {
      const c = D.cliente(s, cid);
      return Object.entries(m).filter(([, q]) => q).map(([pid, q]) => ({ id: `cs_${cid}_${pid}`, clienteId: cid, produtoId: pid, qtd: q, valor: c ? r2(q * D.precoParceiro(s, c, pid)) : null }));
    }) },
    contas_receber: { nome: 'Contas a receber dos fechamentos (calculado)', docs: D.contasReceber(s).map((f) => ({ id: 'cr_' + f.id, fechamentoId: f.id, clienteId: f.clienteId, total: r2(f.total), saldo: r2(f.saldo), vencimento: f.vencimento || null, diasAtraso: f.atraso })) },
  };
}
export function extrasParceiro(s, cid) {
  const c = D.cliente(s, cid), m = D.saldoCliente(s, cid), disp = D.estoqueDisponivel(s);
  const per = c ? D.periodoAtual(s, cid) : null;
  return {
    meu_estoque: { nome: 'Meu estoque consignado (calculado)', docs: Object.entries(m).filter(([, q]) => q).map(([pid, q]) => ({ id: 'me_' + pid, produtoId: pid, qtd: q, precoParceiro: c ? r2(D.precoParceiro(s, c, pid)) : null, precoCarta: c ? D.precoCarta(s, c, pid) : null })) },
    disponivel_para_pedir: { nome: 'Disponível na Mil Terras para pedir (calculado)', docs: Object.entries(disp).filter(([, q]) => q > 0).map(([pid, q]) => ({ id: 'dp_' + pid, produtoId: pid, disponivel: q })) },
    periodo_atual: { nome: 'Período atual até o próximo fechamento (calculado)', docs: per ? [{ id: 'pa', inicio: per.inicio, proximoFechamentoPrevisto: per.previsto, temFechamentoAguardandoAprovacao: !!per.pendente, ultimoFechamento: per.ultimo?.fim || null }] : [] },
  };
}
