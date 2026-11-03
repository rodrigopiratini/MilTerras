# Colocar um app de segmento no ar (uma vez por segmento, ~15 minutos)

Todos os apps de segmento ficam no **mesmo projeto Supabase, `easyapp-fabrica`** (organização EasyAPP, região São Paulo),
cada um na sua **pasta** (schema), definida em `segmento.js › schema` (ex.: `frota`). Dentro da pasta, um único banco atende
**todas as empresas** do segmento (cada uma só enxerga o que é dela). O EasyApp Financial fica no projeto dele, separado.

## 1. Publicar o site (GitHub Pages)
1. No GitHub, abra o repositório › **Settings** › **Pages** › **Build and deployment › Source: GitHub Actions**.
2. A cada push na `main` o site é publicado sozinho em `https://<usuário>.github.io/<repositório>/`
   - Gestão: `…/gestao/` · App do usuário: `…/usuario/` · Demonstração: `…/gestao/?demo=1` e `…/usuario/?demo=1`
3. (Opcional) Endereço próprio, ex.: `frota.easyappfinancial.com.br`: crie um registro **CNAME** no DNS apontando para
   `<usuário>.github.io`, crie o arquivo `CNAME` na raiz do repositório com o endereço e confirme em Settings › Pages › Custom domain.

## 2. Instalar no banco (projeto easyapp-fabrica)
1. **SQL Editor › New query**: cole todo o [`supabase/instalar.sql`](../supabase/instalar.sql) › **Run** (aparece "Instalação concluída").
   Ele cria só a pasta do app; não mexe nas pastas dos outros apps.
2. **Project Settings › Data API › Exposed schemas**: acrescente a pasta do app (ex.: `frota`) › **Save**.
3. **Authentication › URL Configuration › Redirect URLs**: acrescente o endereço da Gestão do app (ex.: `https://…/gestao/**`).
4. [`src/js/config.js`](../src/js/config.js): a **Project URL** e a **Publishable key** do easyapp-fabrica (as mesmas para todos os apps).
   ⚠️ Nunca use a chave `service_role`/`secret` no app.
5. Uma vez só no projeto: **Authentication › Sign In / Providers › Allow anonymous sign-ins** ligado (login por código + PIN).

Mudar um app de projeto (ex.: trazer um app que tinha banco próprio): `node scripts/migrar-projeto.mjs --de <ref> --para <ref> [--schema …]`
(ensaio por padrão; `--executar` grava). Copia as tabelas da pasta e os logins de e-mail com as senhas.

## 3. Você como administrador da plataforma
Coloque seu e-mail em `plataforma.admins` no `src/js/segmento.js`, rode `node supabase/gerar.mjs` e rode o `instalar.sql` de novo
(ou, direto no SQL Editor: `insert into plataforma_admins values ('seu@email.com');`).
Na Gestão aparece o menu **Plataforma**: todas as empresas, situação (teste / ativa / suspensa), vencimento, uso e receita mensal.

## 4. Primeiro cliente
1. O cliente abre a Gestão › **Criar conta** (e-mail e senha) › **Criar minha empresa**: começa o período de teste.
2. Ele cadastra a equipe e, em **Configurações › Acesso**, gera código + PIN de cada usuário e envia pelo WhatsApp.
3. Sócios/escritório: **Configurações › Equipe de gestão › Convidar gestor** (código de uso único, 7 dias).

## Cobrança (assinatura)
- Em **Plataforma**, ao receber o pagamento, mude a empresa para **Ativa**, escolha o plano, o valor e **Pago até**.
- Teste vencido, ou ativa com "pago até" vencido há mais de 5 dias: o banco **recusa gravações** e o app mostra o aviso.
  Os dados continuam visíveis e exportáveis (nada é apagado).
- Suspender: situação **Suspensa**. Reativar: **Ativa** com nova data.

## Atualizações do banco
Sempre que o `instalar.sql` mudar, cole-o inteiro de novo no SQL Editor › **Run**. É seguro: não apaga dados.

## Bom saber
- **Plano gratuito do Supabase**: 2 projetos por conta e pausa após 7 dias sem acesso. Com clientes pagando, use o **Pro**
  (US$ 25/mês por organização, cada projeto extra ~US$ 10/mês); confira os preços atuais em supabase.com/pricing.
- **Sem internet**: as alterações ficam na fila do aparelho e são enviadas quando a conexão voltar.
- **Registro de atividades**: Gestão › Atividade (só o dono). Gravado pelo banco, guarda 1 ano.
