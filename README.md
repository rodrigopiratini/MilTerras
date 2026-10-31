# Mil Terras — apps de Gestão e Parceiro

Controle de estoque, consignação, fechamentos e financeiro da **Mil Terras** (vinhos italianos em consignação), em dois apps PWA que funcionam no iPhone, Android e computador:

| App | Para quem | Caminho |
|---|---|---|
| **Mil Terras Gestão** | Distribuidora | `/gestor/` · demo: `/gestor/?demo=1` (PIN `0000`) |
| **Mil Terras Parceiro** | Restaurantes, bares e lojas | `/cliente/` · demo: `/cliente/?demo=1` (código `BELLA`, PIN `1234`) |

Endereço publicado: **https://rodrigopiratini.github.io/MilTerras/** · Passo a passo para colocar no ar: [`docs/INSTALACAO.md`](docs/INSTALACAO.md).

A proposta completa (funcionalidades, inteligência e roteiro) está em [`docs/PROPOSTA.md`](docs/PROPOSTA.md).

## Rodar localmente
Não há build nem dependências: é HTML, CSS e JavaScript puro. Só precisa de um servidor estático:

```bash
python3 -m http.server 8080
```

Abra http://localhost:8080. Sem Supabase configurado (ou com `?demo=1`), os apps rodam no modo local com dados fictícios; Gestão e Parceiro abertos em abas diferentes conversam entre si.

## Publicar
O workflow `.github/workflows/pages.yml` publica no GitHub Pages a cada push (ative uma vez em Settings › Pages › Source: GitHub Actions). Funciona em qualquer hospedagem estática com HTTPS. No iPhone, o parceiro abre o link no Safari e toca em **Compartilhar › Adicionar à Tela de Início**.

## Estrutura
```
index.html               escolha do app
gestor/  cliente/        páginas + manifest de cada app
src/js/core/             dados e regras compartilhadas
  catalogo.js            14 rótulos (catálogo + tabela de preços)
  domain.js              estoque, consignação, fechamentos, financeiro, alertas
  seed.js                primeira carga + histórico simulado (fictício)
  store.js               dados: modo nuvem (Supabase) ou local (demonstração)
  cloud.js               adaptador Supabase: login, RLS, fila offline, tempo real
  charts.js, ui.js       gráficos SVG e componentes
  fechamento-ui.js       assistente de fechamento (usado pelos dois apps)
src/js/gestor/app.js     telas da Gestão
src/js/cliente/app.js    telas do Parceiro
src/css/app.css          identidade visual (Manual da Marca)
assets/                  logo, ícones e garrafas recortados dos PDFs
src/js/config.js         URL e chave pública do Supabase
src/vendor/supabase.js   supabase-js 2.117.3 (UMD)
supabase/instalar.sql    instalação completa do banco (gerado por supabase/gerar.mjs a partir de setup.sql)
sw.js                    funcionamento offline
```

## Dados e segurança
- **Nuvem (produção):** Supabase/PostgreSQL. Cada registro é um documento JSON; Row Level Security garante que o parceiro só vê o próprio estabelecimento e nunca os custos. O gestor entra com e-mail e senha; parceiros com código + PIN (login anônimo vinculado por função segura, com bloqueio após 5 erros).
- **Registro de atividades:** gatilhos no banco gravam quem fez cada alteração (e cada entrada nos apps) na tabela `atividade`; só o dono consulta, em Gestão › Atividade.
- **Local (demonstração):** localStorage do navegador, com dados fictícios.
