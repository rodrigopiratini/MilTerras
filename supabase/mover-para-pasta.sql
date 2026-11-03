-- =====================================================================
-- Mil Terras — mudança única: da área "public" para a pasta "milterras" (projeto easyapp-fabrica)
-- Passo 1 de 2. Cole no SQL Editor › Run. Depois cole o supabase/instalar.sql (passo 2) e publique o app.
-- Não copia nada: as tabelas (com todos os dados, logins e PINs) mudam de pasta.
-- =====================================================================
create schema if not exists milterras;
grant usage on schema milterras to anon, authenticated, service_role;
do $$
declare t text;
begin
  foreach t in array array['config','produtos','custos','clientes','movs','vendas','fechamentos','pedidos','despesas','perfis',
                           'convites','tentativas_login','instalacao','atividade'] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      if exists (select 1 from pg_tables where schemaname = 'milterras' and tablename = t) then
        raise exception 'milterras.% já existe: a mudança já foi feita?', t;
      end if;
      execute format('alter table public.%I set schema milterras', t);
    end if;
  end loop;
end $$;
select 'Tabelas movidas para milterras. Agora rode o instalar.sql.' as resultado;
