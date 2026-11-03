# Mil Terras — instruções para o Claude

- App de segmento no molde `easyapp-base` (veja `docs/FABRICA.md`), igual ao Frota e ao Golden; banco no projeto Supabase
  easyapp-fabrica, pasta `milterras` (a Mil Terras é uma empresa dentro dela).
  **Não edite o núcleo aqui** (`src/js/core/`, `src/css/base.css`, `supabase/base.sql`, `sw.js`, `.github/workflows/pages.yml`, `scripts/`):
  mude no `easyapp-base` e traga com `bash scripts/atualizar-base.sh ../MilTerras` (rodado a partir do easyapp-base).
- O que é da Mil Terras: `src/js/segmento.js`, `src/js/dominio.js`, `src/js/gestao/app.js` (Gestão), `src/js/usuario/app.js` (Parceiro),
  `src/js/fechamento-ui.js`, `src/js/vinhos-ui.js`, `src/js/ia-extras.js`, `src/js/catalogo.js`, `src/js/seed.js`, `src/css/segmento.css`
  e `supabase/segmento.sql` (regras extras do parceiro e o estoque disponível).
- Banco: depois de mudar `segmento.sql` ou as coleções, rode `node supabase/gerar.mjs` (gera `supabase/instalar.sql`, que o dono cola no SQL Editor; é idempotente).
- **Sempre publicar**: commit, push na branch de trabalho e em `claude/happy-shannon-xvpt3q` (branch padrão do repositório; o GitHub Pages publica a partir dele).
  O app mostra sozinho a barra "Nova versão do app disponível · Atualizar".
- Endereços: Gestão `/gestao/`, Parceiro `/usuario/`. Os antigos `/gestor/` e `/cliente/` só redirecionam (apps já instalados).
- Nunca coloque e-mail, telefone ou chave secreta em arquivo do repositório.
