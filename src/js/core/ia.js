// Assistente (IA) da Mil Terras: liga o núcleo da fábrica (assistente.js) aos dados e às regras daqui.
// O servidor é a função "assistente" do projeto easyapp-fabrica (pasta milterras); ele só PROPÕE mudanças,
// quem grava é o app quando a pessoa toca em Aplicar (commit normal: fila offline, regras do banco, histórico).
import * as store from './store.js';
import * as D from './domain.js';
import { CONFIG } from '../config.js';
import { toast } from './ui.js';
import { criarAssistente } from './assistente.js';

const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const REGRAS = [
  'Mil Terras: distribuidora de vinhos que deixa garrafas em CONSIGNAÇÃO em restaurantes, bares e lojas (os parceiros).',
  'O parceiro vende na casa dele; no FECHAMENTO conta o que sobrou, paga o que vendeu (consumo) e recebe a reposição.',
  'Rótulos (produtos): nome, preco (preço ao parceiro), precoCarta (sugerido na carta), custo, ativo. Parceiros (clientes): nome, cidade, contato, telefone, ativo, garcons, condicoes de pagamento, precosCarta.',
  'Movimentações de estoque (movs): { tipo, produtoId, qtd (positiva), clienteId (só nas do parceiro), data AAAA-MM-DD, ts (milissegundos), obs }.',
  'tipo: entrada (compra/importação, soma no estoque central), perda (quebra, tira do central), ajuste (inventário do central; qtd com sinal), venda_direta (venda sem consignação, tira do central),',
  'remessa / devolucao / consumo / ajuste_parceiro (mexem na consignação: estes só pelas telas de Remessas e Fechamento, não proponha).',
  'Estoque, consignação e contas a receber: use as coleções calculadas estoque_central, consignado e contas_receber (os mesmos números das telas). Não some movs à mão.',
  'Fechamentos (status enviado = aguardando aprovação; aprovado; pago), pedidos de reposição (solicitado / aprovado / recusado) e vendas registradas pelo parceiro: só leitura para você; aprovar e pagar é nas telas.',
].join(' ');

export function criarIA({ app, colecoes, extras, visivel, sugestoes, quem, ref }) {
  return criarAssistente({
    pasta: 'milterras', app, idApp: 'milterras', nome: app === 'gestao' ? 'Mil Terras Gestão' : 'Mil Terras Parceiro',
    descricao: app === 'gestao' ? 'App da distribuidora: estoque central, consignação nos parceiros, remessas, fechamentos e financeiro.' : 'App do parceiro: registrar vendas, ver o estoque consignado, pedir reposição e fazer o fechamento.',
    demo: store.modo === 'local', url: CONFIG.supabaseUrl, chave: CONFIG.supabaseKey, token: store.token,
    get: visivel, commit: (fn, msg) => { if (store.somenteLeituraAtiva()) { toast('Modo visualização: alterações desativadas'); return false; } store.commit(fn, msg); return true; }, toast,
    colecoes, extras, sugestoes,
    contexto: () => ({
      empresa: 'Mil Terras',
      papel: app === 'gestao' ? 'Gestão da Mil Terras' : 'Parceiro (restaurante/bar/loja), no app do parceiro: só vê o que é dele',
      quem: quem?.() || '', ref: ref?.() || null,
      instrucoes: REGRAS + (app === 'gestao' ? ' Despesas (financeiro): descricao, valor, data, categoria. Entrada de estoque: um mov tipo entrada por rótulo.'
        : ' Para pedir reposição, crie em pedidos { clienteId (o id dele), data (hoje), ts (agora em milissegundos), status "solicitado", itens: [{ produtoId, qtd }], obs }, respeitando o disponivel de disponivel_para_pedir.'),
    }),
  });
}

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
