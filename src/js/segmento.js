// =====================================================================
// SEGMENTO — Mil Terras: vinhos italianos em consignação (distribuidora + restaurantes, bares e lojas).
// Este arquivo é lido pelo navegador E pelo supabase/gerar.mjs: só dados, sem importar nada.
// =====================================================================
export const SEGMENTO = {
  id: 'milterras',
  schema: 'milterras',                   // pasta deste app no banco (projeto easyapp-fabrica)
  nome: 'Mil Terras',
  produto: 'Mil Terras',
  slogan: 'Vinhos exclusivos em consignação: estoque, remessas, vendas e fechamentos com os parceiros.',
  icone: 'wine',
  logo: 'assets/logo/logo_h_negativo.png',

  suporte: { nome: 'EasyApp', whatsapp: '', email: '' },
  plataforma: { admins: [] },
  planos: [],
  diasTeste: 30,

  gestao: { nome: 'Mil Terras Gestão', curto: 'Gestão', descricao: 'Estoque, consignação, fechamentos e financeiro da Mil Terras.' },
  usuario: {
    nome: 'Mil Terras Parceiro', curto: 'Parceiro', descricao: 'Para restaurantes, bares e lojas: registrar vendas, pedir reposição e fazer o fechamento.',
    colecao: 'clientes',                 // cada parceiro (cliente) recebe código + PIN
    papel: 'Parceiro', papelPlural: 'Parceiros',
  },

  // Regras de acesso (aplicadas pelo banco). As regras extras do parceiro (o que ele pode mudar no próprio
  // cadastro, fechamento só "enviado", pedido dentro do disponível) ficam em supabase/segmento.sql.
  colecoes: {
    produtos: { nome: 'Rótulos', leitura: 'todos' },
    custos: { nome: 'Custos dos rótulos', leitura: 'gestao' },            // custo de aquisição: o parceiro não vê
    clientes: { nome: 'Parceiros', leitura: 'proprio', escrita: 'proprio', ref: 'id' },
    movs: { nome: 'Movimentações de estoque', leitura: 'proprio', ref: 'clienteId' },
    vendas: { nome: 'Vendas dos parceiros', leitura: 'proprio', escrita: 'proprio', ref: 'clienteId' },
    fechamentos: { nome: 'Fechamentos', leitura: 'proprio', escrita: 'proprio', ref: 'clienteId' },
    pedidos: { nome: 'Pedidos de reposição', leitura: 'proprio', escrita: 'proprio', ref: 'clienteId' },
    despesas: { nome: 'Despesas', leitura: 'gestao' },
  },

  assistente: {
    instrucoes: [
      'Mil Terras: distribuidora de vinhos que deixa garrafas em CONSIGNAÇÃO em restaurantes, bares e lojas (os parceiros).',
      'O parceiro vende na casa dele; no FECHAMENTO conta o que sobrou, paga o que vendeu (consumo) e recebe a reposição.',
      'Rótulos (produtos): nome, preco (preço ao parceiro), precoCarta (sugerido na carta), ativo. O custo de cada rótulo fica em custos { produtoId, custo }. Parceiros (clientes): nome, cidade, contato, telefone, ativo, garcons, condicoes de pagamento, precosCarta.',
      'Movimentações de estoque (movs): { tipo, produtoId, qtd (positiva), clienteId (só nas do parceiro), data AAAA-MM-DD, ts (milissegundos), obs }.',
      'tipo: entrada (compra/importação, soma no estoque central), perda (quebra, tira do central), ajuste (inventário do central; qtd com sinal), venda_direta (venda sem consignação, tira do central),',
      'remessa / devolucao / consumo / ajuste_parceiro (mexem na consignação: estes só pelas telas de Remessas e Fechamento, não proponha).',
      'Estoque, consignação e contas a receber: use as coleções calculadas estoque_central, consignado e contas_receber (os mesmos números das telas). Não some movs à mão.',
      'Fechamentos (status enviado = aguardando aprovação; aprovado; pago), pedidos de reposição (solicitado / aprovado / recusado) e vendas registradas pelo parceiro: só leitura para você; aprovar e pagar é nas telas.',
    ].join(' '),
    gestao: { instrucoes: 'Despesas (financeiro): descricao, valor, data, categoria. Entrada de estoque: um mov tipo entrada por rótulo.' },
    usuario: { instrucoes: 'Para pedir reposição, crie em pedidos { clienteId (o id dele), data (hoje), ts (agora em milissegundos), status "solicitado", itens: [{ produtoId, qtd }], obs }, respeitando o disponivel de disponivel_para_pedir.' },
  },

  // Nomes amigáveis dos campos (registro de atividades)
  campos: { nome: 'nome', telefone: 'telefone', email: 'e-mail', contato: 'contato', cidade: 'cidade', cnpj: 'CNPJ', cicloDias: 'ciclo de acerto', prazoDias: 'prazo',
    formasPagamento: 'formas de pagamento', formaPadrao: 'forma padrão', garcons: 'equipe', precosCarta: 'preços de carta', ativo: 'ativo', preco: 'preço', precoCarta: 'preço de carta', estoqueMin: 'estoque mínimo',
    descricao: 'descrição', valor: 'valor', categoria: 'categoria', data: 'data', qtd: 'quantidade', obs: 'observação', status: 'status', itens: 'itens', vencimento: 'vencimento', formaPagamento: 'forma de pagamento',
    empresa: 'nome da empresa', whatsapp: 'WhatsApp', instagram: 'Instagram', safra: 'safra', regiao: 'região', tipo: 'tipo', foto: 'imagem', custo: 'custo' },
};
