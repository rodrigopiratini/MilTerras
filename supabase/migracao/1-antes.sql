-- =====================================================================
-- Mil Terras › molde EasyAPP-Base — PASSO 1 (uma vez só): guarda as tabelas antigas na pasta milterras_antigo
-- e apaga as funções antigas da pasta milterras (o instalar.sql do molde recria tudo no formato novo).
-- Nada é apagado de dados: as tabelas antigas ficam em milterras_antigo como cópia de segurança.
-- =====================================================================
create schema if not exists milterras_antigo;
revoke all on schema milterras_antigo from anon, authenticated;

do $$
declare t text; r record;
begin
  -- só roda se a pasta ainda estiver no formato antigo (tabela perfis sem empresa_id)
  if exists (select 1 from information_schema.columns where table_schema = 'milterras' and table_name = 'docs') then
    raise notice 'milterras já está no formato do molde: passo 1 ignorado';
    return;
  end if;
  foreach t in array array['config','produtos','custos','clientes','movs','vendas','fechamentos','pedidos','despesas','perfis','convites','tentativas_login','instalacao','atividade'] loop
    if exists (select 1 from pg_tables where schemaname = 'milterras' and tablename = t) then
      if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'milterras' and tablename = t) then
        execute format('alter publication supabase_realtime drop table milterras.%I', t);
      end if;
      execute format('alter table milterras.%I set schema milterras_antigo', t);
    end if;
  end loop;
  -- gatilhos e regras das tabelas guardadas (apontam para funções que serão substituídas)
  for r in select tgname, c.relname from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'milterras_antigo' and not g.tgisinternal loop
    execute format('drop trigger %I on milterras_antigo.%I', r.tgname, r.relname);
  end loop;
  for r in select policyname, tablename from pg_policies where schemaname = 'milterras_antigo' loop
    execute format('drop policy %I on milterras_antigo.%I', r.policyname, r.tablename);
  end loop;
  for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'milterras' loop
    execute format('drop function %s cascade', r.f);
  end loop;
end $$;
