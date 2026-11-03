-- =====================================================================
-- Mil Terras — instalação do banco no Supabase
-- Como usar: Supabase › SQL Editor › New query › cole este arquivo inteiro › Run.
-- No final aparece o seu CÓDIGO DE INSTALAÇÃO (usado uma única vez para criar o acesso do gestor).
-- Pode ser executado de novo sem perder dados (idempotente).
-- Banco: projeto easyapp-fabrica, pasta (schema) milterras. Em Project Settings › Data API › Exposed schemas, "milterras" precisa estar marcado.
-- =====================================================================

create schema if not exists milterras;
grant usage on schema milterras to anon, authenticated, service_role;
--
-- Modelo: cada registro do app é um documento JSON (coluna data), com as colunas de
-- segurança (cliente_id) derivadas dele. Isso mantém o app simples de evoluir.
--
-- Segurança (Row Level Security):
--   gestor   → lê e grava tudo
--   parceiro → lê o catálogo (sem custos), o próprio cadastro, as próprias movimentações e
--              fechamentos; registra as próprias vendas; envia fechamentos (status "enviado");
--              altera só equipe e preços de carta no próprio cadastro.
-- Parceiros entram com código + PIN (login anônimo vinculado por função segura, com bloqueio
-- após 5 tentativas erradas). O gestor entra com e-mail e senha.

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table if not exists milterras.config (
  id text primary key default 'geral',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists milterras.produtos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists milterras.custos (            -- custo de aquisição: só o gestor vê
  id text primary key references milterras.produtos(id) on delete cascade,
  custo numeric(12,2) not null default 0
);

create table if not exists milterras.clientes (
  id text primary key,
  data jsonb not null,
  codigo text generated always as (upper(data->>'codigo')) stored,
  updated_at timestamptz not null default now()
);
create unique index if not exists clientes_codigo_idx on milterras.clientes (codigo);

create table if not exists milterras.movs (
  id text primary key,
  data jsonb not null,
  cliente_id text generated always as (data->>'clienteId') stored,
  updated_at timestamptz not null default now()
);
create index if not exists movs_cliente_idx on milterras.movs (cliente_id);

create table if not exists milterras.vendas (
  id text primary key,
  data jsonb not null,
  cliente_id text generated always as (data->>'clienteId') stored,
  updated_at timestamptz not null default now()
);
create index if not exists vendas_cliente_idx on milterras.vendas (cliente_id);

create table if not exists milterras.fechamentos (
  id text primary key,
  data jsonb not null,
  cliente_id text generated always as (data->>'clienteId') stored,
  status text generated always as (data->>'status') stored,
  updated_at timestamptz not null default now()
);
create index if not exists fechamentos_cliente_idx on milterras.fechamentos (cliente_id);

create table if not exists milterras.pedidos (            -- pedidos de reposição feitos pelo parceiro entre fechamentos
  id text primary key,
  data jsonb not null,
  cliente_id text generated always as (data->>'clienteId') stored,
  status text generated always as (data->>'status') stored,
  updated_at timestamptz not null default now()
);
create index if not exists pedidos_cliente_idx on milterras.pedidos (cliente_id);

create table if not exists milterras.despesas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists milterras.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel text not null,
  cliente_id text references milterras.clientes(id) on delete cascade,
  criado_em timestamptz not null default now()
);
-- papéis: dono (administra a equipe), gestor (opera tudo, sem administrar usuários), parceiro
alter table milterras.perfis drop constraint if exists perfis_papel_check;
alter table milterras.perfis add constraint perfis_papel_check check (papel in ('dono', 'gestor', 'parceiro'));
-- instalações anteriores: o primeiro gestor vira dono
update milterras.perfis set papel = 'dono'
 where user_id = (select user_id from milterras.perfis where papel = 'gestor' order by criado_em limit 1)
   and not exists (select 1 from milterras.perfis where papel = 'dono');

create table if not exists milterras.convites (           -- convites de gestor (gerados pelo dono)
  codigo text primary key,
  nome text,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references auth.users(id) on delete set null,
  usado_em timestamptz
);
create index if not exists perfis_cliente_idx on milterras.perfis (cliente_id);

create table if not exists milterras.tentativas_login (   -- proteção contra adivinhação de PIN
  codigo text primary key,
  falhas int not null default 0,
  bloqueado_ate timestamptz
);

create table if not exists milterras.instalacao (         -- sem políticas: ninguém lê pela API
  id int primary key default 1 check (id = 1),
  codigo_setup text not null
);
insert into milterras.instalacao (id, codigo_setup)
values (1, upper(left(replace(gen_random_uuid()::text, '-', ''), 8)))
on conflict (id) do nothing;

-- ---------- Funções auxiliares ----------
create or replace function milterras.eh_gestor() returns boolean
language sql stable security definer set search_path = milterras, public, extensions as
$$ select exists (select 1 from milterras.perfis where user_id = auth.uid() and papel in ('gestor', 'dono')) $$;

create or replace function milterras.eh_dono() returns boolean
language sql stable security definer set search_path = milterras, public, extensions as
$$ select exists (select 1 from milterras.perfis where user_id = auth.uid() and papel = 'dono') $$;

create or replace function milterras.meu_cliente() returns text
language sql stable security definer set search_path = milterras, public, extensions as
$$ select cliente_id from milterras.perfis where user_id = auth.uid() and papel = 'parceiro' $$;

create or replace function milterras.tocar_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['config','produtos','clientes','movs','vendas','fechamentos','pedidos','despesas'] loop
    execute format('drop trigger if exists tg_updated_at on milterras.%I', t);
    execute format('create trigger tg_updated_at before update on milterras.%I for each row execute function milterras.tocar_updated_at()', t);
  end loop;
end $$;

-- Parceiro só pode alterar equipe, preços de carta e a fila de pedido no próprio cadastro
create or replace function milterras.proteger_cliente() returns trigger
language plpgsql security definer set search_path = milterras, public, extensions as $$
begin
  if not milterras.eh_gestor() then
    new.data := old.data
      || jsonb_build_object('garcons', coalesce(new.data->'garcons', old.data->'garcons'),
                            'precosCarta', coalesce(new.data->'precosCarta', old.data->'precosCarta'),
                            'filaPedido', coalesce(new.data->'filaPedido', '{}'::jsonb));
  elsif (new.data->>'pin') is distinct from (old.data->>'pin')
     or (new.data->>'codigo') is distinct from (old.data->>'codigo')
     or coalesce((new.data->>'ativo')::boolean, true) = false then
    -- PIN trocado ou parceiro desativado: desconecta os aparelhos do parceiro
    delete from milterras.perfis where cliente_id = new.id and papel = 'parceiro';
  end if;
  return new;
end $$;
drop trigger if exists tg_proteger_cliente on milterras.clientes;
create trigger tg_proteger_cliente before update on milterras.clientes for each row execute function milterras.proteger_cliente();

-- Parceiro envia fechamento apenas como "enviado" e do próprio estabelecimento
create or replace function milterras.proteger_fechamento() returns trigger
language plpgsql security definer set search_path = milterras, public, extensions as $$
begin
  if not milterras.eh_gestor() then
    if new.data->>'status' <> 'enviado' or new.data->>'clienteId' <> milterras.meu_cliente() then
      raise exception 'Fechamento inválido';
    end if;
    if exists (select 1 from milterras.fechamentos where cliente_id = new.data->>'clienteId' and status = 'enviado' and id <> new.id) then
      raise exception 'Já existe um fechamento aguardando conferência';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tg_proteger_fechamento on milterras.fechamentos;
create trigger tg_proteger_fechamento before insert on milterras.fechamentos for each row execute function milterras.proteger_fechamento();

-- Estoque disponível para pedidos: saldo central menos o que já foi solicitado e ainda não aprovado.
-- Os parceiros enxergam só este número (não as movimentações nem os custos).
create or replace function milterras.estoque_disponivel() returns json
language sql stable security definer set search_path = milterras, public, extensions as $$
  with central as (
    select data->>'produtoId' pid, sum(case data->>'tipo'
      when 'entrada' then (data->>'qtd')::int when 'devolucao' then (data->>'qtd')::int when 'ajuste' then (data->>'qtd')::int
      when 'remessa' then -(data->>'qtd')::int when 'venda_direta' then -(data->>'qtd')::int when 'perda' then -(data->>'qtd')::int
      else 0 end) q
    from milterras.movs group by 1
  ), reservado as (
    select i->>'produtoId' pid, sum((i->>'qtd')::int) q from milterras.pedidos p, jsonb_array_elements(p.data->'itens') i where p.status = 'solicitado' group by 1
    union all
    select i->>'produtoId', sum((i->>'qtd')::int) from milterras.fechamentos f, jsonb_array_elements(coalesce(f.data->'reposicao', '[]'::jsonb)) i where f.status = 'enviado' group by 1
  )
  select coalesce(json_object_agg(p.id, greatest(0, coalesce(c.q, 0) - coalesce((select sum(r.q) from reservado r where r.pid = p.id), 0))), '{}'::json)
  from milterras.produtos p left join central c on c.pid = p.id
  where auth.uid() is not null and (milterras.eh_gestor() or milterras.meu_cliente() is not null)
$$;

-- Parceiro: pedido só do próprio estabelecimento, como "solicitado" e dentro do disponível
create or replace function milterras.proteger_pedido() returns trigger
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_disp json; v_item jsonb;
begin
  if milterras.eh_gestor() then return new; end if;
  if new.data->>'status' <> 'solicitado' or new.data->>'clienteId' <> milterras.meu_cliente() then raise exception 'Pedido inválido'; end if;
  v_disp := milterras.estoque_disponivel();
  for v_item in select * from jsonb_array_elements(new.data->'itens') loop
    if (v_item->>'qtd')::int > coalesce((v_disp->>(v_item->>'produtoId'))::int, 0) then
      raise exception 'Quantidade acima do estoque disponível';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists tg_proteger_pedido on milterras.pedidos;
create trigger tg_proteger_pedido before insert on milterras.pedidos for each row execute function milterras.proteger_pedido();

-- ---------- Acesso ----------
-- Parceiro: o app faz login anônimo e chama esta função com código + PIN
create or replace function milterras.vincular_parceiro(p_codigo text, p_pin text) returns text
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare
  v_codigo text := upper(trim(p_codigo));
  v_cliente text;
  v_t milterras.tentativas_login;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select * into v_t from milterras.tentativas_login where codigo = v_codigo;
  if v_t.bloqueado_ate is not null and v_t.bloqueado_ate > now() then
    raise exception 'Muitas tentativas. Tente novamente em alguns minutos.';
  end if;
  select id into v_cliente from milterras.clientes
   where codigo = v_codigo and data->>'pin' = trim(p_pin) and coalesce((data->>'ativo')::boolean, true);
  if v_cliente is null then
    insert into milterras.tentativas_login as t (codigo, falhas) values (v_codigo, 1)
      on conflict (codigo) do update set falhas = t.falhas + 1,
        bloqueado_ate = case when t.falhas + 1 >= 5 then now() + interval '15 minutes' else null end;
    return null;
  end if;
  delete from milterras.tentativas_login where codigo = v_codigo;
  if exists (select 1 from milterras.perfis where user_id = auth.uid() and papel in ('gestor', 'dono')) then
    raise exception 'Este aparelho está conectado como gestor. Saia antes de entrar como parceiro.';
  end if;
  insert into milterras.perfis (user_id, papel, cliente_id) values (auth.uid(), 'parceiro', v_cliente)
    on conflict (user_id) do update set papel = 'parceiro', cliente_id = excluded.cliente_id;
  return v_cliente;
end $$;

-- Gestão: o código de instalação cria o DONO (só enquanto não houver dono);
-- depois disso, novos gestores entram apenas com convite gerado pelo dono.
create or replace function milterras.tornar_gestor(p_codigo text) returns boolean
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare
  v_codigo text := upper(trim(p_codigo));
  v_conv milterras.convites;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Entre com e-mail e senha';
  end if;
  if exists (select 1 from milterras.perfis where user_id = auth.uid() and papel in ('gestor', 'dono')) then return true; end if;
  if not exists (select 1 from milterras.perfis where papel = 'dono')
     and exists (select 1 from milterras.instalacao where codigo_setup = v_codigo) then
    insert into milterras.perfis (user_id, papel) values (auth.uid(), 'dono')
      on conflict (user_id) do update set papel = 'dono', cliente_id = null;
    return true;
  end if;
  select * into v_conv from milterras.convites where codigo = v_codigo and usado_por is null and expira_em > now() for update;
  if v_conv.codigo is null then return false; end if;
  update milterras.convites set usado_por = auth.uid(), usado_em = now() where codigo = v_codigo;
  insert into milterras.perfis (user_id, papel) values (auth.uid(), 'gestor')
    on conflict (user_id) do update set papel = 'gestor', cliente_id = null;
  return true;
end $$;

create or replace function milterras.criar_convite(p_nome text) returns text
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_codigo text := upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
begin
  if not milterras.eh_dono() then raise exception 'Somente o dono pode convidar gestores'; end if;
  insert into milterras.convites (codigo, nome, criado_por) values (v_codigo, nullif(trim(p_nome), ''), auth.uid());
  return v_codigo;
end $$;

create or replace function milterras.equipe() returns json
language plpgsql stable security definer set search_path = milterras, public, extensions as $$
begin
  if not milterras.eh_gestor() then raise exception 'Sem permissão'; end if;
  return json_build_object(
    'membros', coalesce((select json_agg(json_build_object('userId', p.user_id, 'papel', p.papel, 'email', u.email, 'desde', p.criado_em, 'eu', p.user_id = auth.uid()) order by p.criado_em)
                         from milterras.perfis p join auth.users u on u.id = p.user_id where p.papel in ('dono', 'gestor')), '[]'::json),
    'convites', case when milterras.eh_dono() then coalesce((select json_agg(json_build_object('codigo', codigo, 'nome', nome, 'expira', expira_em) order by criado_em desc)
                         from milterras.convites where usado_por is null and expira_em > now()), '[]'::json) else '[]'::json end);
end $$;

create or replace function milterras.remover_gestor(p_user uuid) returns void
language plpgsql security definer set search_path = milterras, public, extensions as $$
begin
  if not milterras.eh_dono() then raise exception 'Somente o dono pode remover gestores'; end if;
  delete from milterras.perfis where user_id = p_user and papel = 'gestor';
end $$;

create or replace function milterras.cancelar_convite(p_codigo text) returns void
language plpgsql security definer set search_path = milterras, public, extensions as $$
begin
  if not milterras.eh_dono() then raise exception 'Sem permissão'; end if;
  delete from milterras.convites where codigo = upper(p_codigo) and usado_por is null;
end $$;

create or replace function milterras.meu_perfil() returns json
language sql stable security definer set search_path = milterras, public, extensions as
$$ select json_build_object('papel', papel, 'clienteId', cliente_id) from milterras.perfis where user_id = auth.uid() $$;

revoke all on function milterras.vincular_parceiro(text, text) from public, anon;
revoke all on function milterras.tornar_gestor(text) from public, anon;
revoke all on function milterras.criar_convite(text) from public, anon;
revoke all on function milterras.equipe() from public, anon;
revoke all on function milterras.remover_gestor(uuid) from public, anon;
revoke all on function milterras.cancelar_convite(text) from public, anon;
grant execute on function milterras.vincular_parceiro(text, text) to authenticated;
grant execute on function milterras.tornar_gestor(text) to authenticated;
grant execute on function milterras.criar_convite(text), milterras.equipe(), milterras.remover_gestor(uuid), milterras.cancelar_convite(text) to authenticated;
revoke all on function milterras.estoque_disponivel() from public, anon;
grant execute on function milterras.estoque_disponivel() to authenticated;
grant execute on function milterras.meu_perfil() to authenticated;

-- ---------- Registro de atividades (auditoria) ----------
-- Toda gravação nas tabelas do app gera uma linha aqui, feita pelo próprio banco (gatilhos),
-- com quem fez, o quê e o que mudou. Os apps também registram cada entrada no app.
-- Somente o DONO consulta (função atividade_log); ninguém grava nem lê a tabela pela API.
create table if not exists milterras.atividade (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  user_id uuid,
  papel text,                   -- dono | gestor | parceiro (no momento da ação)
  quem text,                    -- e-mail do gestor ou nome do parceiro (no momento da ação)
  cliente_id text,
  acao text not null,           -- insert | update | delete | acesso
  tabela text,
  registro text,
  antes jsonb,                  -- update: só os campos alterados; delete: o documento
  depois jsonb                  -- update: só os campos alterados; insert: o documento
);
create index if not exists atividade_em_idx on milterras.atividade (em desc);
create index if not exists atividade_user_idx on milterras.atividade (user_id, em desc);

create or replace function milterras.atividade_autor(out o_papel text, out o_quem text, out o_cliente text)
language plpgsql stable security definer set search_path = milterras, public, extensions as $$
begin
  if auth.uid() is null then o_quem := 'Sistema (painel do Supabase)'; return; end if;
  select papel, cliente_id into o_papel, o_cliente from milterras.perfis where user_id = auth.uid();
  if o_papel = 'parceiro' then o_quem := (select data->>'nome' from milterras.clientes where id = o_cliente);
  else o_quem := (select email from auth.users where id = auth.uid()); end if;
end $$;

create or replace function milterras.registrar_atividade() returns trigger
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare
  v_old jsonb; v_new jsonb; v_antes jsonb; v_depois jsonb; v_reg text; a record;
begin
  begin -- o registro nunca pode impedir a gravação do app
    if tg_op <> 'INSERT' then v_old := case when tg_table_name in ('custos', 'perfis') then to_jsonb(old) else to_jsonb(old)->'data' end; end if;
    if tg_op <> 'DELETE' then v_new := case when tg_table_name in ('custos', 'perfis') then to_jsonb(new) else to_jsonb(new)->'data' end; end if;
    v_reg := coalesce(to_jsonb(new), to_jsonb(old))->>(case when tg_table_name = 'perfis' then 'user_id' else 'id' end);
    if tg_op = 'UPDATE' then
      select jsonb_object_agg(k, v_old->k), jsonb_object_agg(k, v_new->k) into v_antes, v_depois
        from (select jsonb_object_keys(v_old || v_new) k) x where v_old->k is distinct from v_new->k;
      if v_depois is null then return null; end if; -- nada mudou de fato
    else v_antes := v_old; v_depois := v_new; end if;
    select * into a from milterras.atividade_autor();
    insert into milterras.atividade (user_id, papel, quem, cliente_id, acao, tabela, registro, antes, depois)
    values (auth.uid(), a.o_papel, a.o_quem, a.o_cliente, lower(tg_op), tg_table_name, v_reg, v_antes, v_depois);
  exception when others then raise warning 'registrar_atividade: %', sqlerrm;
  end;
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['config','produtos','custos','clientes','movs','vendas','fechamentos','pedidos','despesas','perfis'] loop
    execute format('drop trigger if exists tg_atividade on milterras.%I', t);
    execute format('create trigger tg_atividade after insert or update or delete on milterras.%I for each row execute function milterras.registrar_atividade()', t);
  end loop;
end $$;

-- Chamada pelos apps ao entrar (no máximo um registro a cada 30 min por pessoa).
-- Aproveita para apagar o que tiver mais de 1 ano.
create or replace function milterras.registrar_acesso() returns void
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare a record;
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from milterras.atividade where user_id = auth.uid() and acao = 'acesso' and em > now() - interval '30 minutes') then return; end if;
  select * into a from milterras.atividade_autor();
  if a.o_papel is null then return; end if;
  insert into milterras.atividade (user_id, papel, quem, cliente_id, acao) values (auth.uid(), a.o_papel, a.o_quem, a.o_cliente, 'acesso');
  delete from milterras.atividade where em < now() - interval '1 year';
end $$;

-- Consulta do dono: página de registros (mais recentes primeiro) e resumo por pessoa (30 dias)
create or replace function milterras.atividade_log(p_antes timestamptz default null, p_user uuid default null, p_desde timestamptz default null, p_limite int default 300) returns json
language plpgsql stable security definer set search_path = milterras, public, extensions as $$
begin
  if not milterras.eh_dono() then raise exception 'Somente o dono vê o registro de atividades'; end if;
  return json_build_object(
    'itens', coalesce((select json_agg(x order by x.em desc, x.id desc) from (
        select id, em, user_id "userId", papel, quem, cliente_id "clienteId", acao, tabela, registro, antes, depois
          from milterras.atividade
         where (p_antes is null or em < p_antes) and (p_user is null or user_id = p_user) and (p_desde is null or em >= p_desde)
         order by em desc, id desc limit least(greatest(p_limite, 1), 1000)) x), '[]'::json),
    'pessoas', coalesce((select json_agg(x order by x.ultimo desc) from (
        select user_id "userId", (array_agg(papel order by em desc))[1] papel, (array_agg(quem order by em desc))[1] quem,
               max(em) ultimo, count(*) filter (where acao <> 'acesso') acoes, count(*) filter (where acao = 'acesso') acessos
          from milterras.atividade where em > now() - interval '30 days' and user_id is not null group by user_id) x), '[]'::json));
end $$;

revoke all on function milterras.atividade_autor() from public, anon, authenticated;
revoke all on function milterras.registrar_acesso() from public, anon;
revoke all on function milterras.atividade_log(timestamptz, uuid, timestamptz, int) from public, anon;
grant execute on function milterras.registrar_acesso(), milterras.atividade_log(timestamptz, uuid, timestamptz, int) to authenticated;

-- ---------- Row Level Security ----------
alter table milterras.config enable row level security;
alter table milterras.produtos enable row level security;
alter table milterras.custos enable row level security;
alter table milterras.clientes enable row level security;
alter table milterras.movs enable row level security;
alter table milterras.vendas enable row level security;
alter table milterras.fechamentos enable row level security;
alter table milterras.despesas enable row level security;
alter table milterras.pedidos enable row level security;
alter table milterras.perfis enable row level security;
alter table milterras.tentativas_login enable row level security;
alter table milterras.instalacao enable row level security;
alter table milterras.convites enable row level security;
alter table milterras.atividade enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'milterras' and policyname like 'mt_%' loop
    execute format('drop policy %I on milterras.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- gestor: tudo
create policy mt_gestor on milterras.config      for all to authenticated using (milterras.eh_gestor()) with check (milterras.eh_gestor());
create policy mt_gestor on milterras.produtos    for all to authenticated using (milterras.eh_gestor()) with check (milterras.eh_gestor());
create policy mt_gestor on milterras.custos      for all to authenticated using (milterras.eh_gestor()) with check (milterras.eh_gestor());
create policy mt_gestor on milterras.clientes    for all to authenticated using (milterras.eh_gestor()) with check (milterras.eh_gestor());
create policy mt_gestor on milterras.movs        for all to authenticated using (milterras.eh_gestor()) with check (milterras.eh_gestor());
create policy mt_gestor on milterras.vendas      for all to authenticated using (milterras.eh_gestor()) with check (milterras.eh_gestor());
create policy mt_gestor on milterras.fechamentos for all to authenticated using (milterras.eh_gestor()) with check (milterras.eh_gestor());
create policy mt_gestor on milterras.despesas    for all to authenticated using (milterras.eh_gestor()) with check (milterras.eh_gestor());
create policy mt_gestor on milterras.pedidos     for all to authenticated using (milterras.eh_gestor()) with check (milterras.eh_gestor());
create policy mt_gestor_le_perfis on milterras.perfis for select to authenticated using (milterras.eh_gestor());
create policy mt_dono_perfis on milterras.perfis for all to authenticated using (milterras.eh_dono() and papel <> 'dono') with check (milterras.eh_dono() and papel <> 'dono');

-- parceiro
create policy mt_parceiro_config   on milterras.config      for select to authenticated using (milterras.meu_cliente() is not null);
create policy mt_parceiro_produtos on milterras.produtos    for select to authenticated using (milterras.meu_cliente() is not null);
create policy mt_parceiro_cliente  on milterras.clientes    for select to authenticated using (id = milterras.meu_cliente());
create policy mt_parceiro_cliente_upd on milterras.clientes for update to authenticated using (id = milterras.meu_cliente()) with check (id = milterras.meu_cliente());
create policy mt_parceiro_movs     on milterras.movs        for select to authenticated using (cliente_id = milterras.meu_cliente());
create policy mt_parceiro_vendas   on milterras.vendas      for all to authenticated using (cliente_id = milterras.meu_cliente()) with check (cliente_id = milterras.meu_cliente());
create policy mt_parceiro_fech_sel on milterras.fechamentos for select to authenticated using (cliente_id = milterras.meu_cliente());
create policy mt_parceiro_fech_ins on milterras.fechamentos for insert to authenticated with check (cliente_id = milterras.meu_cliente() and status = 'enviado');
create policy mt_parceiro_ped_sel  on milterras.pedidos     for select to authenticated using (cliente_id = milterras.meu_cliente());
create policy mt_parceiro_ped_ins  on milterras.pedidos     for insert to authenticated with check (cliente_id = milterras.meu_cliente() and status = 'solicitado');
create policy mt_parceiro_ped_del  on milterras.pedidos     for delete to authenticated using (cliente_id = milterras.meu_cliente() and status = 'solicitado');
create policy mt_proprio_perfil    on milterras.perfis      for select to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on milterras.config, milterras.produtos, milterras.custos, milterras.clientes, milterras.movs, milterras.vendas, milterras.fechamentos, milterras.pedidos, milterras.despesas, milterras.perfis to authenticated;
revoke all on milterras.instalacao, milterras.tentativas_login, milterras.convites, milterras.atividade from anon, authenticated;

-- ---------- Tempo real ----------
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['config','produtos','clientes','movs','vendas','fechamentos','pedidos','despesas'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'milterras' and tablename = t) then
        execute format('alter publication supabase_realtime add table milterras.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- Primeira carga: catálogo Mil Terras ----------
\ir catalogo.sql

select codigo_setup as "SEU CÓDIGO DE INSTALAÇÃO (guarde)" from milterras.instalacao;
