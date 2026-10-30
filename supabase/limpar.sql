-- =====================================================================
-- Mil Terras — ZERAR A OPERAÇÃO (mantém só a carta de vinhos)
-- Como usar: Supabase › SQL Editor › New query › cole este arquivo inteiro › Run.
--
-- APAGA DE FORMA DEFINITIVA: parceiros (e os acessos deles), movimentações de estoque,
-- remessas, vendas lançadas, fechamentos, pedidos, despesas e tentativas de login.
-- MANTÉM: rótulos (carta de vinhos, preços e custos), configurações da empresa,
-- o seu acesso de dono, os gestores e os convites de gestor.
-- Faça antes um backup em Gestão › Configurações › Exportar backup, se quiser guardar o histórico.
-- =====================================================================
begin;
delete from public.vendas;
delete from public.movs;
delete from public.fechamentos;
delete from public.pedidos;
delete from public.despesas;
delete from public.perfis where papel = 'parceiro';
delete from public.clientes;
delete from public.tentativas_login;
-- contas anônimas que os aparelhos dos parceiros usavam para entrar
delete from auth.users u where u.is_anonymous and not exists (select 1 from public.perfis p where p.user_id = u.id);
commit;

select (select count(*) from public.produtos) as rotulos_mantidos,
       (select count(*) from public.clientes) as parceiros,
       (select count(*) from public.movs) as movimentacoes,
       (select count(*) from public.fechamentos) as fechamentos;
