# Mil Terras — apps de Gestão e Parceiro

Controle de estoque, consignação, fechamentos e financeiro da **Mil Terras** (vinhos italianos em consignação), em dois apps PWA que funcionam no iPhone, Android e computador:

| App | Para quem | Caminho |
|---|---|---|
| **Mil Terras Gestão** | Distribuidora | `/gestao/` · demo: `/gestao/?demo=1` (PIN `0000`) |
| **Mil Terras Parceiro** | Restaurantes, bares e lojas | `/usuario/` · demo: `/usuario/?demo=1` (código `BELLA`, PIN `1234`) |

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
Feito no molde **EasyAPP-Base** (como o Frota e o Golden): o núcleo (`src/js/core/`, `src/css/base.css`, `supabase/base.sql`,
`sw.js`, workflow) vem de lá; aqui fica só o que é da Mil Terras.
```
index.html               escolha do app
gestao/  usuario/        Gestão e Parceiro (gestor/ e cliente/ só redirecionam os apps já instalados)
src/js/segmento.js       nome, coleções e regras de acesso, assistente
src/js/dominio.js        estoque, consignação, fechamentos, financeiro, alertas
src/js/gestao/app.js     telas da Gestão
src/js/usuario/app.js    telas do Parceiro
src/js/fechamento-ui.js  assistente de fechamento (usado pelos dois apps)
src/js/vinhos-ui.js      garrafas e fichas dos vinhos
src/js/catalogo.js       14 rótulos (catálogo + tabela de preços) · seed.js: demonstração
src/css/segmento.css     cores da marca (Manual da Marca)
supabase/segmento.sql    regras extras do parceiro + estoque disponível
supabase/instalar.sql    instalação do banco (gerado por supabase/gerar.mjs)
supabase/migrar-para-molde.sql  migração única do formato antigo (03/11/2026)
```

## Dados e segurança
- **Nuvem (produção):** Supabase/PostgreSQL. Cada registro é um documento JSON; Row Level Security garante que o parceiro só vê o próprio estabelecimento e nunca os custos. O gestor entra com e-mail e senha; parceiros com código + PIN (login anônimo vinculado por função segura, com bloqueio após 5 erros).
- **Registro de atividades:** gatilhos no banco gravam quem fez cada alteração (e cada entrada nos apps) na tabela `atividade`; só o dono consulta, em Gestão › Atividade.
- **Local (demonstração):** localStorage do navegador, com dados fictícios.
