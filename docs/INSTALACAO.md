# Colocar os apps no ar (uma vez só, ~10 minutos)

## 1. Publicar o site (GitHub Pages)
1. No GitHub, abra o repositório **MilTerras** › **Settings** › **Pages**.
2. Em **Build and deployment › Source**, escolha **GitHub Actions**.
3. Pronto. A cada atualização o site é publicado sozinho em:
   **https://rodrigopiratini.github.io/MilTerras/**
   - Gestão: `…/MilTerras/gestor/`
   - Parceiro: `…/MilTerras/cliente/`
   - Demonstração (dados fictícios, só no navegador): `…/gestor/?demo=1` e `…/cliente/?demo=1`

## 2. Criar o banco (Supabase, plano gratuito)
1. Crie uma conta em https://supabase.com e clique em **New project**.
   - Nome: `milterras` · Região: **South America (São Paulo)** · anote a senha do banco.
2. **SQL Editor › New query**: cole todo o conteúdo de [`supabase/instalar.sql`](../supabase/instalar.sql) e clique em **Run**.
   No final aparece o **CÓDIGO DE INSTALAÇÃO**: guarde-o (é usado para criar o acesso do gestor).
3. **Authentication › Sign In / Providers**: ative **Allow anonymous sign-ins** (é assim que os parceiros entram com código + PIN).
4. **Authentication › URL Configuration**: em **Site URL** coloque `https://rodrigopiratini.github.io/MilTerras/gestor/`.
5. **Project Settings › API**: copie a **Project URL** e a **Publishable key** (ou "anon public").
   ⚠️ Nunca compartilhe a chave `service_role`/`secret`.

## 3. Ligar o app ao banco
Cole a Project URL e a Publishable key em [`src/js/config.js`](../src/js/config.js) (ou envie para o Claude fazer isso). Depois da publicação:

1. Abra a Gestão › **Primeiro acesso** › seu e-mail, uma senha e o código de instalação.
   - Se o Supabase pedir, confirme o e-mail pelo link recebido e entre novamente.
2. Cadastre os parceiros (código + PIN de 4 números) e envie o acesso pelo WhatsApp em **Configurações**.
3. Registre a primeira **Entrada** no estoque e as **remessas** para os parceiros.

## Bom saber
- **Custos:** o catálogo entra com custo provisório (50% do preço). Ajuste em **Rótulos › Editar**.
- **Segurança:** cada parceiro só vê os próprios dados e não vê custos. Trocar o PIN de um parceiro desconecta os aparelhos dele. Após 5 PINs errados, o código fica bloqueado por 15 minutos.
- **Sem internet:** vendas e alterações ficam na fila do aparelho e são enviadas quando a conexão voltar.
- **Plano gratuito do Supabase:** o projeto é pausado após 7 dias sem nenhum acesso (basta reativar no painel). Com uso diário isso não acontece; para garantia total, o plano Pro custa US$ 25/mês.
- **Backup:** Gestão › Configurações › Exportar backup (o Supabase também guarda backups diários no plano Pro).

## Atualizações do banco
Quando uma nova versão pedir, cole de novo o `supabase/instalar.sql` inteiro no SQL Editor e clique em **Run**. É seguro: não apaga dados.

## Dar acesso a um sócio ou funcionário (Gestão)
1. Gestão › **Configurações › Equipe de gestão › Convidar gestor**.
2. Envie o link e o código (vale 7 dias, uso único).
3. A pessoa abre a Gestão › **Primeiro acesso**, cria e-mail e senha e informa o código.

Papéis: **Dono** (você) administra a equipe; **Gestor** opera tudo, mas não pode remover o dono nem convidar/remover pessoas. Não adicione a pessoa ao Supabase nem como colaborador no GitHub: assim ela não tem acesso ao banco nem pode alterar o código.

## Zerar a operação (manter só a carta de vinhos)
Para apagar parceiros, estoque, remessas, vendas, fechamentos, pedidos e despesas e começar do zero:
Supabase › **SQL Editor › New query**, cole todo o conteúdo de [`supabase/limpar.sql`](../supabase/limpar.sql) e clique em **Run**.
Os rótulos (com preços e custos), as configurações e os acessos de gestão são mantidos. **Não tem volta**: exporte um backup antes se quiser guardar o histórico.

## Condições de pagamento e preços especiais
Em Gestão › **Parceiros › (parceiro) › Pagamento e preços**:
- **Condições de pagamento**: combine formas, ex.: 40% em dinheiro + restante no cartão em 3x. O parceiro escolhe a condição no fechamento; ao registrar o recebimento os valores já vêm divididos (dá para ajustar e também registrar pagamento parcial).
- **Preços especiais**: valor cobrado só daquele parceiro no lugar do preço de tabela, com data final opcional para promoções.
