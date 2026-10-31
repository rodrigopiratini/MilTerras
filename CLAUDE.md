# Instruções para o Claude

- **Sempre publicar**: ao terminar uma mudança, além do branch de trabalho, envie também para `claude/happy-shannon-xvpt3q` (o GitHub Pages publica a partir dele e do `main`). O dono pediu que toda atualização fique disponível no app.
- Os apps mostram a barra **"Nova versão do app disponível · Atualizar"** sozinhos: o `pages.yml` grava a versão (commit) em `version.json` e `src/js/versao.js` a cada publicação. Não é preciso mudar `VERSION` no `sw.js` à mão.
- Mudanças no banco vão em `supabase/setup.sql`; depois rode `node supabase/gerar.mjs` para gerar o `supabase/instalar.sql` (o dono cola no SQL Editor do Supabase).
