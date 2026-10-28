// Primeira carga: catálogo real (PDFs Mil Terras) + parceiros FICTÍCIOS com ~6 meses de
// histórico simulado, só para os painéis já abrirem com dados. Use Gestão › Configurações ›
// "Começar do zero" para apagar a simulação e manter apenas o catálogo.

import { PRODUTOS } from './catalogo.js';
import { addDays, today, uid, diffDays, parse } from './fmt.js';
import * as D from './domain.js';

const CLIENTES = [
  { nome: 'Trattoria Bella Serra', tipo: 'Restaurante', cidade: 'Gramado', regiao: 'Serra Gaúcha', porte: 1.6, inicio: 178, codigo: 'BELLA',
    contato: 'Marina Lopes', garcons: ['Lucas', 'Fernanda', 'Diego', 'Patrícia'], formas: ['PIX', 'Boleto'], prazo: 7,
    mix: { vignadura: 10, ceius: 10, mitasus: 8, sativus: 6, 'primitivo-manduria': 6, brunello: 3, barolo: 3, amarone: 3, 'lux-clara': 6, lito: 6 } },
  { nome: 'Bistrô Vale dos Vinhedos', tipo: 'Restaurante', cidade: 'Bento Gonçalves', regiao: 'Serra Gaúcha', porte: 1.2, inicio: 175, codigo: 'VALE',
    contato: 'Rafael Bertoldi', garcons: ['Ana', 'Bruno', 'Camila'], formas: ['PIX', 'Transferência'], prazo: 5,
    mix: { odone: 6, rufia: 6, publia: 6, rianus: 6, lito: 6, barolo: 2, 'lux-clara': 4 } },
  { nome: 'Cantina Nonna Ida', tipo: 'Restaurante', cidade: 'Caxias do Sul', regiao: 'Serra Gaúcha', porte: 1.3, inicio: 170, codigo: 'NONNA',
    contato: 'Ida Zanella', garcons: ['Marcos', 'Juliana', 'Tiago'], formas: ['Boleto', 'PIX'], prazo: 10,
    mix: { vignadura: 12, ceius: 10, odone: 8, 'primitivo-manduria': 6, lito: 6 } },
  { nome: 'Empório Canela', tipo: 'Loja', cidade: 'Canela', regiao: 'Serra Gaúcha', porte: 0.8, inicio: 160, codigo: 'EMPORIO',
    contato: 'Sofia Ramos', garcons: ['Sofia', 'Henrique'], formas: ['PIX'], prazo: 3,
    mix: { amarone: 3, barolo: 3, brunello: 3, publia: 6, sativus: 6, 'lux-clara': 6, rianus: 4 } },
  { nome: 'Osteria Moinhos', tipo: 'Restaurante', cidade: 'Porto Alegre', regiao: 'Porto Alegre e Região Metropolitana', porte: 1.5, inicio: 150, codigo: 'MOINHOS',
    contato: 'Gustavo Prado', garcons: ['Rodrigo', 'Bianca', 'Eduardo', 'Larissa'], formas: ['Boleto', 'Cartão de crédito', 'PIX'], prazo: 15,
    mix: { mitasus: 8, sativus: 8, rufia: 6, 'primitivo-manduria': 6, amarone: 3, brunello: 3, lito: 6, rianus: 6 } },
  { nome: 'Taverna 1875', tipo: 'Bar', cidade: 'Nova Petrópolis', regiao: 'Serra Gaúcha', porte: 0.9, inicio: 140, codigo: 'TAVERNA',
    contato: 'Otávio Kunz', garcons: ['Paulo', 'Cristina'], formas: ['PIX', 'Dinheiro'], prazo: 7,
    mix: { vignadura: 8, ceius: 8, odone: 6, 'lux-clara': 6, brunello: 3 } },
  { nome: 'Ponto Italiano', tipo: 'Restaurante', cidade: 'Novo Hamburgo', regiao: 'Porto Alegre e Região Metropolitana', porte: 1.0, inicio: 110, codigo: 'PONTO',
    contato: 'Carla Mendes', garcons: ['Felipe', 'Renata', 'Vitor'], formas: ['PIX', 'Boleto'], prazo: 7,
    mix: { vignadura: 8, mitasus: 6, publia: 4, lito: 6, 'lux-clara': 4 } },
  { nome: 'Enoteca Flores', tipo: 'Bar', cidade: 'Flores da Cunha', regiao: 'Serra Gaúcha', porte: 0.7, inicio: 52, codigo: 'FLORES',
    contato: 'Mateus Dal Pont', garcons: ['Mateus', 'Aline'], formas: ['PIX'], prazo: 5,
    mix: { sativus: 4, rufia: 4, odone: 4, rianus: 4, barolo: 2 } },
];

// Venda média (garrafas/dia) de cada rótulo num parceiro de porte 1
const POP = { vignadura: 0.42, ceius: 0.38, odone: 0.26, mitasus: 0.32, sativus: 0.24, rufia: 0.12, publia: 0.17, 'primitivo-manduria': 0.24,
  brunello: 0.06, barolo: 0.07, amarone: 0.06, 'lux-clara': 0.24, lito: 0.27, rianus: 0.13 };
const DIA_SEMANA = [1.3, 0.45, 0.6, 0.75, 0.95, 1.6, 1.9]; // dom..sáb

function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function seed({ vazio = false } = {}) {
  const T = today();
  const s = {
    meta: { versao: 1, criadoEm: new Date().toISOString(), demo: !vazio, empresa: 'Mil Terras', whatsapp: '5554991165105', instagram: '@milterrasvinhos', pinGestor: '0000' },
    produtos: PRODUTOS.map((p) => ({ ...p })),
    clientes: [], movs: [], vendas: [], fechamentos: [], despesas: [], pedidos: [],
  };
  if (vazio) return s;

  const r = rng(1875);
  const pois = (l) => { let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= r(); } while (p > L); return k - 1; };
  const inicio = addDays(T, -185);

  // Importações (entradas no estoque central)
  const imp1 = { vignadura: 420, ceius: 360, odone: 240, mitasus: 300, sativus: 240, rufia: 150, publia: 180, 'primitivo-manduria': 220, brunello: 60, barolo: 72, amarone: 66, 'lux-clara': 240, lito: 260, rianus: 150 };
  const imp2 = { ceius: 120, odone: 96, mitasus: 120, sativus: 96, 'primitivo-manduria': 96, lito: 120, rianus: 60, publia: 48, barolo: 24 };
  const entrada = (data, mapa, desc) => {
    let total = 0;
    for (const [pid, q] of Object.entries(mapa)) {
      const p = D.produto(s, pid);
      D.addMov(s, { data, tipo: 'entrada', produtoId: pid, qtd: q, custoUnit: p.custo, obs: desc });
      total += q * p.custo;
    }
    s.despesas.push({ id: uid('dp'), data, categoria: 'Compra de mercadoria', descricao: desc, valor: Math.round(total), pago: true });
    s.despesas.push({ id: uid('dp'), data: addDays(data, 3), categoria: 'Frete e desembaraço', descricao: `Frete internacional e desembaraço — ${desc}`, valor: Math.round(total * 0.08), pago: true });
  };
  entrada(addDays(inicio, -3), imp1, 'Importação Dieci Terre #1');

  // Parceiros
  for (const [i, def] of CLIENTES.entries()) {
    const c = {
      id: 'cl' + (i + 1), nome: def.nome, tipo: def.tipo, cidade: def.cidade, regiao: def.regiao, contato: def.contato,
      telefone: `(54) 9${9000 + i * 137}-${String(1000 + i * 761).slice(0, 4)}`, email: '', cnpj: '',
      formasPagamento: def.formas, formaPadrao: def.formas[0], prazoDias: def.prazo, cicloDias: 15,
      codigo: def.codigo, pin: '1234', ativo: true, desde: addDays(T, -def.inicio),
      garcons: def.garcons.map((n, j) => ({ id: `g${i + 1}-${j + 1}`, nome: n, ativo: true })),
      precosCarta: {}, par: { ...def.mix }, _porte: def.porte,
    };
    s.clientes.push(c);
  }

  // Simulação dia a dia
  const fisico = {}; // estoque real na prateleira do parceiro
  const proxFech = {};
  const outubro = addDays(T, -40);
  for (let d = inicio; d <= T; d = addDays(d, 1)) {
    if (d === addDays(T, -75)) entrada(d, imp2, 'Importação Dieci Terre #2');
    const dow = parse(d).getDay();
    const mes = parse(d).getMonth();
    for (const c of s.clientes) {
      if (d < c.desde) continue;
      if (d === c.desde) {
        fisico[c.id] = {};
        const central = D.estoqueCentral(s);
        for (const [pid, par] of Object.entries(c.par)) {
          const q = Math.min(par, central[pid]);
          if (q > 0) { D.addMov(s, { data: d, tipo: 'remessa', produtoId: pid, qtd: q, clienteId: c.id, obs: 'Consignação inicial' }); fisico[c.id][pid] = q; }
        }
        proxFech[c.id] = addDays(d, c.cicloDias);
        continue;
      }
      // Vendas do dia
      for (const pid of Object.keys(fisico[c.id])) {
        let l = POP[pid] * c._porte * DIA_SEMANA[dow];
        if (pid === 'lux-clara' || pid === 'lito') l *= mes >= 8 || mes <= 2 ? 1.35 : 0.8; // calor
        if (c.id === 'cl6' && pid === 'brunello') l = 0.003; // rótulo parado (gera alerta)
        let q = Math.min(pois(l), fisico[c.id][pid]);
        while (q-- > 0) {
          fisico[c.id][pid]--;
          const taxaRegistro = c.id === 'cl3' && d > outubro ? 0.68 : 0.94; // um parceiro deixou de lançar vendas
          if (r() < taxaRegistro) {
            const gs = c.garcons; const w = gs.map((_, j) => 1 + (j === 0 ? 0.8 : 0) + (pid.length % (j + 2)) * 0.3);
            let x = r() * w.reduce((a, b) => a + b, 0), gi = 0; while ((x -= w[gi]) > 0) gi++;
            D.registrarVenda(s, { clienteId: c.id, produtoId: pid, qtd: 1, garcomId: gs[Math.min(gi, gs.length - 1)].id, data: d, hora: `${18 + Math.floor(r() * 5)}:${String(Math.floor(r() * 60)).padStart(2, '0')}` });
          }
        }
      }
      // Fechamento quinzenal
      if (d === proxFech[c.id]) {
        proxFech[c.id] = addDays(d, c.cicloDias);
        const novos = {};
        if (c.id === 'cl2' && diffDays(T, d) < 100 && !c.par.amarone) { novos.amarone = 2; c.par.amarone = 2; }
        if (c.id === 'cl7' && diffDays(T, d) < 60 && !c.par['primitivo-manduria']) { novos['primitivo-manduria'] = 4; c.par['primitivo-manduria'] = 4; }
        const contagem = { ...fisico[c.id] };
        const reposicao = {};
        for (const [pid, par] of Object.entries(c.par)) reposicao[pid] = Math.max(0, par - (contagem[pid] || 0));
        Object.assign(reposicao, novos);
        const f = D.montarFechamento(s, c.id, { contagem, reposicao, criadoPor: r() < 0.7 ? 'cliente' : 'gestor', data: d });
        D.enviarFechamento(s, f);
        const idade = diffDays(T, d);
        const pendenteAgora = idade <= 5 && (c.id === 'cl5' || c.id === 'cl7');
        if (pendenteAgora) { f.reposicao = Object.entries(reposicao).filter(([, q]) => q > 0).map(([produtoId, qtd]) => ({ produtoId, qtd })); continue; }
        const aprov = addDays(d, idade > 1 ? 1 : 0);
        D.aprovarFechamento(s, f.id, { data: aprov });
        // reposições entregues no dia; as mais recentes de alguns parceiros ficam em andamento (demonstração)
        if (f.remessaId) {
          const andamento = idade <= 6 && (c.id === 'cl3' || c.id === 'cl6') ? (c.id === 'cl3' ? 'separado' : 'a_separar') : null;
          if (andamento) D.avancarRemessa(s, f.remessaId, andamento);
          else {
            D.avancarRemessa(s, f.remessaId, 'separado'); D.avancarRemessa(s, f.remessaId, 'em_rota'); D.avancarRemessa(s, f.remessaId, 'entregue', { data: aprov, recebidoPor: c.contato.split(' ')[0] });
            for (const rp of f.reposicaoEnviada) fisico[c.id][rp.produtoId] = (fisico[c.id][rp.produtoId] || 0) + rp.qtd;
          }
        }
        // Pagamentos: a maioria paga em dia; a Taverna está com um título vencido
        const pagaEm = addDays(aprov, Math.max(0, c.prazoDias - 2 + Math.floor(r() * 4)));
        const atrasado = c.id === 'cl6' && idade < 30 && idade > 12;
        if (f.status === 'aprovado' && pagaEm < T && !atrasado) D.registrarPagamento(s, f.id, { data: pagaEm });
      }
    }
    // Vendas diretas e despesas recorrentes
    if (dow === 6 && r() < 0.35) {
      const pid = ['primitivo-manduria', 'amarone', 'barolo', 'mitasus', 'sativus'][Math.floor(r() * 5)];
      const p = D.produto(s, pid);
      const qtd = Math.min(2 + Math.floor(r() * 5), D.estoqueCentral(s)[pid] - 6);
      if (qtd > 0) D.addMov(s, { data: d, tipo: 'venda_direta', produtoId: pid, qtd, precoUnit: Math.round(p.preco * 1.25), obs: 'Venda para cliente final / evento' });
    }
    if (parse(d).getDate() === 5) {
      s.despesas.push({ id: uid('dp'), data: d, categoria: 'Armazenagem', descricao: 'Aluguel do depósito climatizado', valor: 1400, pago: true });
      s.despesas.push({ id: uid('dp'), data: d, categoria: 'Logística', descricao: 'Combustível e entregas na Serra/POA', valor: 650 + Math.round(r() * 350), pago: true });
    }
    if (parse(d).getDate() === 20) s.despesas.push({ id: uid('dp'), data: d, categoria: 'Impostos', descricao: 'Simples Nacional', valor: 0, pago: true, _calc: true });
  }
  // Impostos ≈ 8% da receita do mês anterior
  for (const dp of s.despesas.filter((x) => x._calc)) {
    const ref = dp.data.slice(0, 7);
    const rec = s.movs.filter((m) => (m.tipo === 'consumo' || m.tipo === 'venda_direta') && m.data.slice(0, 7) === ref).reduce((a, m) => a + m.qtd * m.precoUnit, 0);
    dp.valor = Math.round(rec * 0.08); delete dp._calc;
  }
  s.despesas.push({ id: uid('dp'), data: addDays(T, -20), categoria: 'Marketing', descricao: 'Degustação com sommelier — Gramado', valor: 1800, pago: true });
  // um pedido de reposição aguardando aprovação (demonstração)
  D.criarPedido(s, { clienteId: 'cl2', itens: [{ produtoId: 'rufia', qtd: 4 }, { produtoId: 'barolo', qtd: 2 }], obs: 'Evento de vinhos na sexta' }).data = addDays(T, -1);
  for (const c of s.clientes) delete c._porte;
  return s;
}
