# Mil Terras — apps de Gestão e Parceiro

Controle de estoque, consignação, fechamentos e financeiro da **Mil Terras** (vinhos italianos em consignação), em dois apps PWA que funcionam no iPhone, Android e computador:

| App | Para quem | Caminho |
|---|---|---|
| **Mil Terras Gestão** | Distribuidora | `/gestor/` (PIN demo `0000`) |
| **Mil Terras Parceiro** | Restaurantes, bares e lojas | `/cliente/` (demo: código `BELLA`, PIN `1234`) |

A proposta completa (funcionalidades, inteligência e roteiro) está em [`docs/PROPOSTA.md`](docs/PROPOSTA.md).

## Rodar localmente
Não há build nem dependências: é HTML, CSS e JavaScript puro. Só precisa de um servidor estático:

```bash
python3 -m http.server 8080
```

Abra http://localhost:8080. Abra Gestão e Parceiro em abas diferentes: o fechamento enviado pelo parceiro aparece na hora na Gestão.

## Publicar
Qualquer hospedagem estática com HTTPS (GitHub Pages, Netlify, Vercel, Cloudflare Pages). No iPhone, o parceiro abre o link no Safari e toca em **Compartilhar › Adicionar à Tela de Início**.

## Estrutura
```
index.html               escolha do app
gestor/  cliente/        páginas + manifest de cada app
src/js/core/             dados e regras compartilhadas
  catalogo.js            14 rótulos (catálogo + tabela de preços)
  domain.js              estoque, consignação, fechamentos, financeiro, alertas
  seed.js                primeira carga + histórico simulado (fictício)
  store.js               armazenamento (local nesta versão)
  charts.js, ui.js       gráficos SVG e componentes
  fechamento-ui.js       assistente de fechamento (usado pelos dois apps)
src/js/gestor/app.js     telas da Gestão
src/js/cliente/app.js    telas do Parceiro
src/css/app.css          identidade visual (Manual da Marca)
assets/                  logo, ícones e garrafas recortados dos PDFs
supabase/schema.sql      banco na nuvem com segurança por parceiro (fase 2)
sw.js                    funcionamento offline
```

## Dados
Nesta versão os dados ficam no navegador (localStorage). Use **Configurações › Exportar backup** regularmente. Para uso real com vários aparelhos, o próximo passo é ligar o `store.js` ao Supabase usando `supabase/schema.sql`.
