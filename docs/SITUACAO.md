# Situação — Mil Terras (03/11/2026)

- **No ar:** https://rodrigopiratini.github.io/MilTerras/ · Gestão `/gestor/` · Parceiro `/cliente/` (publica a partir de `claude/happy-shannon-xvpt3q`)
- **Banco:** desde 03/11/2026 no Supabase › EasyAPP › **EasyAPP-Fábrica** (`sizbmkvzcqiukprdlxxr`, São Paulo). Veio do projeto antigo
  App_Mil_Terras (EUA, pausado; apagar depois de alguns dias). Pasta **`milterras`** (antes ficava em `public`).
- **Desde 03/11/2026 (noite) no molde EasyAPP-Base**, como o Frota e o Golden: mesmas telas, núcleo do molde (login, empresa,
  equipe, acessos dos parceiros com código + PIN, plataforma e suporte, assistente). Gestão em `/gestao/`, Parceiro em `/usuario/`
  (os endereços antigos redirecionam). Os dados foram para o formato do molde (tabela `docs`, empresa "Mil Terras") com
  `supabase/migrar-para-molde.sql` (uma vez só); as tabelas antigas ficaram em `milterras_antigo` como cópia de segurança
  (apagar depois de alguns dias). Códigos e PINs dos parceiros continuam os mesmos.
- **Mudanças no banco:** `supabase/segmento.sql` ou coleções em `src/js/segmento.js` → `node supabase/gerar.mjs` → colar `supabase/instalar.sql` no SQL Editor.
