// Rótulos Mil Terras — fonte: Catálogo de Vinhos e Tabela de Preços (garrafa 750 ml).
// custo: valor provisório (50% do preço de tabela) — ajuste em Gestão › Produtos.
// precoCarta: sugestão de preço na carta do restaurante (≈ 2× tabela).

const P = (o) => ({ ativo: true, estoqueMin: 24, custo: Math.round(o.preco * 0.5 * 100) / 100, precoCarta: Math.ceil((o.preco * 2) / 10) * 10 - 1, ...o, foto: `assets/vinhos/${o.id}.webp` });

export const PRODUTOS = [
  P({ id: 'amarone', nome: 'Amarone della Valpolicella', tipo: 'Tinto', regiao: 'Veneto', classificacao: 'DOCG', uvas: 'Corvinone, Corvina, Rondinella e Croatina', teor: '15,5%', safra: 2020, preco: 499.38, servir: '18–20 °C',
    descricao: 'Feito com uvas secas em esteiras: grande estrutura, maciez e intensidade aromática.', harmonizacao: 'Carnes de caça, assados e queijos maduros, duros e picantes.', estoqueMin: 12 }),
  P({ id: 'barolo', nome: 'Barolo', tipo: 'Tinto', regiao: 'Piemonte', classificacao: 'DOCG', uvas: '100% Nebbiolo', teor: '14%', safra: 2019, preco: 499.38, servir: '18–20 °C',
    descricao: 'Nascido nas Langhe, é chamado de “o rei dos vinhos e o vinho dos reis”.', harmonizacao: 'Carnes de caça, carne assada, porco e queijos duros.', estoqueMin: 12 }),
  P({ id: 'brunello', nome: 'Brunello di Montalcino Tusum', tipo: 'Tinto', regiao: 'Toscana', classificacao: 'DOCG', uvas: 'Sangiovese Grosso (Brunello)', teor: '14,5%', safra: 2018, preco: 481.42, servir: '18–20 °C',
    descricao: 'Excelência reconhecida no mundo todo: envelhece por muitos anos sem perder o frescor.', harmonizacao: 'Carnes vermelhas com cogumelos ou trufas, e queijos.', estoqueMin: 12 }),
  P({ id: 'primitivo-manduria', nome: 'Primitivo di Manduria', tipo: 'Tinto', regiao: 'Puglia', classificacao: 'DOP', uvas: 'Primitivo', teor: '14,5%', safra: 2021, preco: 227.9, servir: '18–20 °C',
    descricao: 'Admirado no mundo todo: intenso, estruturado, rico em cor e de taninos marcantes.', harmonizacao: 'Massas com molho de carne e assados.' }),
  P({ id: 'publia', nome: 'Publia', tipo: 'Tinto', regiao: 'Puglia', classificacao: 'IGP', uvas: '100% Primitivo', teor: '14%', safra: 2018, preco: 131.25, servir: '18–20 °C',
    descricao: 'Um vinho excepcional, de grande intensidade, estrutura e complexidade.', harmonizacao: 'Assados, carnes curadas e queijos.' }),
  P({ id: 'mitasus', nome: 'Mitasus', tipo: 'Tinto', regiao: 'Puglia', classificacao: 'IGP', uvas: '100% Primitivo', teor: '14%', safra: 2021, preco: 124.8, servir: '18–20 °C',
    descricao: 'Primitivo intenso, frutado e robusto. Uma aposta que tem gosto de vitória.', harmonizacao: 'Carnes vermelhas, queijos e massas.' }),
  P({ id: 'rufia', nome: 'Rufia', tipo: 'Tinto', regiao: 'Puglia', classificacao: 'IGP', uvas: 'Negroamaro e Sangiovese', teor: '14%', safra: 2021, preco: 124.8, servir: '18–20 °C',
    descricao: 'Grande estrutura e complexidade, com um buquê cheio de nuances e muito envolvente.', harmonizacao: 'Carnes grelhadas e queijos.' }),
  P({ id: 'sativus', nome: 'Sativus', tipo: 'Tinto', regiao: 'Puglia', classificacao: 'IGP', uvas: '70% Nero di Troia e 30% Primitivo', teor: '14%', safra: 2021, preco: 124.8, servir: '18–20 °C',
    descricao: 'Complexo e elegante: geleia de cereja, flores e especiarias, com frescor surpreendente.', harmonizacao: 'Carnes vermelhas, queijos e massas.' }),
  P({ id: 'odone', nome: 'Odone', tipo: 'Tinto', regiao: 'Puglia', classificacao: 'IGP', uvas: '100% Sangiovese', teor: '14%', safra: 2021, preco: 104.24, servir: '18–20 °C',
    descricao: 'Sangiovese puro, seco e encorpado, com buquê profundo.', harmonizacao: 'Assados, carnes saborosas e queijos.' }),
  P({ id: 'ceius', nome: 'Ceius', tipo: 'Tinto', regiao: 'Puglia', classificacao: 'IGP', uvas: '70% Primitivo e 30% Nero di Troia', teor: '13%', safra: 2021, preco: 87.5, servir: '18–20 °C',
    descricao: 'O encontro do Primitivo com o Nero di Troia: fruta escura, calor e persistência.', harmonizacao: 'Pratos de carne em geral.' }),
  P({ id: 'vignadura', nome: 'Vignadura', tipo: 'Tinto', regiao: 'Puglia', classificacao: '', uvas: 'Sangiovese e Montepulciano', teor: '13,5%', safra: 2021, preco: 87.5, servir: '18–20 °C',
    descricao: 'Tinto jovem e equilibrado, com fruta vermelha intensa e um leve toque de especiarias.', harmonizacao: 'Queijos, pratos de carne e assados.' }),
  P({ id: 'rianus', nome: 'Rianus', tipo: 'Branco', regiao: 'Piemonte', classificacao: 'DOC', uvas: 'Cortese, Sauvignon Blanc e Chardonnay', teor: '14%', safra: 2021, preco: 94.25, servir: '8–10 °C',
    descricao: 'Branco de guarda, com corpo, estrutura e aromas intensos. Irresistível e elegante.', harmonizacao: 'Peixes, frutos do mar, massas com molho branco e queijos frescos.' }),
  P({ id: 'lito', nome: 'Lito', tipo: 'Branco', regiao: 'Puglia', classificacao: '', uvas: 'Chardonnay e Garganega', teor: '12%', safra: 2023, preco: 72.92, servir: '8–10 °C',
    descricao: 'Fresco, suave e frutado, com flores brancas e frutas cítricas e tropicais.', harmonizacao: 'Aperitivos, peixes e legumes.' }),
  P({ id: 'lux-clara', nome: 'Lux Clara', tipo: 'Rosé', regiao: 'Puglia', classificacao: 'IGP', uvas: 'Negroamaro e Malvasia Nera', teor: '12,5%', safra: 2023, preco: 123.61, servir: '10–12 °C',
    descricao: 'Fresco e equilibrado, expressa a força e a paixão da terra do Salento.', harmonizacao: 'Aperitivo, antepastos, queijos, pratos leves e carnes brancas.' }),
];

// Palavras-chave para o assistente de harmonização (app do parceiro)
export const HARMONIZA = {
  'Carne vermelha': ['carne', 'carnes vermelhas', 'grelhad', 'assad'],
  'Caça e cordeiro': ['caça', 'assad'],
  'Massas ao sugo / ragu': ['massas', 'molho de carne'],
  'Massas com molho branco': ['molho branco', 'massas'],
  'Peixes e frutos do mar': ['peixe', 'frutos do mar'],
  'Queijos': ['queijo'],
  'Cogumelos e trufas': ['cogumelos', 'trufas'],
  'Entradas e aperitivo': ['aperitivo', 'antepasto', 'pratos leves'],
  'Aves e carnes brancas': ['carnes brancas', 'porco'],
  'Embutidos e curados': ['curadas', 'queijos'],
};
