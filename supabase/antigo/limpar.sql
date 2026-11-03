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
delete from milterras.vendas;
delete from milterras.movs;
delete from milterras.fechamentos;
delete from milterras.pedidos;
delete from milterras.despesas;
delete from milterras.perfis where papel = 'parceiro';
delete from milterras.clientes;
delete from milterras.tentativas_login;
-- contas anônimas que os aparelhos dos parceiros usavam para entrar
delete from auth.users u where u.is_anonymous and not exists (select 1 from milterras.perfis p where p.user_id = u.id);
-- registro de atividades: troca as milhares de exclusões acima por uma única linha
do $$ begin
  if to_regclass('milterras.atividade') is not null then
    delete from milterras.atividade where em = now() and acao = 'delete';
    insert into milterras.atividade (quem, acao) values ('Sistema (painel do Supabase)', 'zerou');
  end if;
end $$;
commit;

select (select count(*) from milterras.produtos) as rotulos_mantidos,
       (select count(*) from milterras.clientes) as parceiros,
       (select count(*) from milterras.movs) as movimentacoes,
       (select count(*) from milterras.fechamentos) as fechamentos;
