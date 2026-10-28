-- =====================================================================
-- Mil Terras — instalação do banco no Supabase
-- Como usar: Supabase › SQL Editor › New query › cole este arquivo inteiro › Run.
-- No final aparece o seu CÓDIGO DE INSTALAÇÃO (usado uma única vez para criar o acesso do gestor).
-- Pode ser executado de novo sem perder dados (idempotente).
-- =====================================================================
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
create table if not exists public.config (
  id text primary key default 'geral',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.produtos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.custos (            -- custo de aquisição: só o gestor vê
  id text primary key references public.produtos(id) on delete cascade,
  custo numeric(12,2) not null default 0
);

create table if not exists public.clientes (
  id text primary key,
  data jsonb not null,
  codigo text generated always as (upper(data->>'codigo')) stored,
  updated_at timestamptz not null default now()
);
create unique index if not exists clientes_codigo_idx on public.clientes (codigo);

create table if not exists public.movs (
  id text primary key,
  data jsonb not null,
  cliente_id text generated always as (data->>'clienteId') stored,
  updated_at timestamptz not null default now()
);
create index if not exists movs_cliente_idx on public.movs (cliente_id);

create table if not exists public.vendas (
  id text primary key,
  data jsonb not null,
  cliente_id text generated always as (data->>'clienteId') stored,
  updated_at timestamptz not null default now()
);
create index if not exists vendas_cliente_idx on public.vendas (cliente_id);

create table if not exists public.fechamentos (
  id text primary key,
  data jsonb not null,
  cliente_id text generated always as (data->>'clienteId') stored,
  status text generated always as (data->>'status') stored,
  updated_at timestamptz not null default now()
);
create index if not exists fechamentos_cliente_idx on public.fechamentos (cliente_id);

create table if not exists public.despesas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel text not null,
  cliente_id text references public.clientes(id) on delete cascade,
  criado_em timestamptz not null default now()
);
-- papéis: dono (administra a equipe), gestor (opera tudo, sem administrar usuários), parceiro
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('dono', 'gestor', 'parceiro'));
-- instalações anteriores: o primeiro gestor vira dono
update public.perfis set papel = 'dono'
 where user_id = (select user_id from public.perfis where papel = 'gestor' order by criado_em limit 1)
   and not exists (select 1 from public.perfis where papel = 'dono');

create table if not exists public.convites (           -- convites de gestor (gerados pelo dono)
  codigo text primary key,
  nome text,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references auth.users(id) on delete set null,
  usado_em timestamptz
);
create index if not exists perfis_cliente_idx on public.perfis (cliente_id);

create table if not exists public.tentativas_login (   -- proteção contra adivinhação de PIN
  codigo text primary key,
  falhas int not null default 0,
  bloqueado_ate timestamptz
);

create table if not exists public.instalacao (         -- sem políticas: ninguém lê pela API
  id int primary key default 1 check (id = 1),
  codigo_setup text not null
);
insert into public.instalacao (id, codigo_setup)
values (1, upper(encode(gen_random_bytes(4), 'hex')))
on conflict (id) do nothing;

-- ---------- Funções auxiliares ----------
create or replace function public.eh_gestor() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.perfis where user_id = auth.uid() and papel in ('gestor', 'dono')) $$;

create or replace function public.eh_dono() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.perfis where user_id = auth.uid() and papel = 'dono') $$;

create or replace function public.meu_cliente() returns text
language sql stable security definer set search_path = public as
$$ select cliente_id from public.perfis where user_id = auth.uid() and papel = 'parceiro' $$;

create or replace function public.tocar_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['config','produtos','clientes','movs','vendas','fechamentos','despesas'] loop
    execute format('drop trigger if exists tg_updated_at on public.%I', t);
    execute format('create trigger tg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
  end loop;
end $$;

-- Parceiro só pode alterar equipe e preços de carta no próprio cadastro
create or replace function public.proteger_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_gestor() then
    new.data := old.data
      || jsonb_build_object('garcons', coalesce(new.data->'garcons', old.data->'garcons'),
                            'precosCarta', coalesce(new.data->'precosCarta', old.data->'precosCarta'));
  elsif (new.data->>'pin') is distinct from (old.data->>'pin')
     or (new.data->>'codigo') is distinct from (old.data->>'codigo')
     or coalesce((new.data->>'ativo')::boolean, true) = false then
    -- PIN trocado ou parceiro desativado: desconecta os aparelhos do parceiro
    delete from public.perfis where cliente_id = new.id and papel = 'parceiro';
  end if;
  return new;
end $$;
drop trigger if exists tg_proteger_cliente on public.clientes;
create trigger tg_proteger_cliente before update on public.clientes for each row execute function public.proteger_cliente();

-- Parceiro envia fechamento apenas como "enviado" e do próprio estabelecimento
create or replace function public.proteger_fechamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_gestor() then
    if new.data->>'status' <> 'enviado' or new.data->>'clienteId' <> public.meu_cliente() then
      raise exception 'Fechamento inválido';
    end if;
    if exists (select 1 from public.fechamentos where cliente_id = new.data->>'clienteId' and status = 'enviado' and id <> new.id) then
      raise exception 'Já existe um fechamento aguardando conferência';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tg_proteger_fechamento on public.fechamentos;
create trigger tg_proteger_fechamento before insert on public.fechamentos for each row execute function public.proteger_fechamento();

-- ---------- Acesso ----------
-- Parceiro: o app faz login anônimo e chama esta função com código + PIN
create or replace function public.vincular_parceiro(p_codigo text, p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_codigo text := upper(trim(p_codigo));
  v_cliente text;
  v_t public.tentativas_login;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select * into v_t from public.tentativas_login where codigo = v_codigo;
  if v_t.bloqueado_ate is not null and v_t.bloqueado_ate > now() then
    raise exception 'Muitas tentativas. Tente novamente em alguns minutos.';
  end if;
  select id into v_cliente from public.clientes
   where codigo = v_codigo and data->>'pin' = trim(p_pin) and coalesce((data->>'ativo')::boolean, true);
  if v_cliente is null then
    insert into public.tentativas_login as t (codigo, falhas) values (v_codigo, 1)
      on conflict (codigo) do update set falhas = t.falhas + 1,
        bloqueado_ate = case when t.falhas + 1 >= 5 then now() + interval '15 minutes' else null end;
    return null;
  end if;
  delete from public.tentativas_login where codigo = v_codigo;
  if exists (select 1 from public.perfis where user_id = auth.uid() and papel in ('gestor', 'dono')) then
    raise exception 'Este aparelho está conectado como gestor. Saia antes de entrar como parceiro.';
  end if;
  insert into public.perfis (user_id, papel, cliente_id) values (auth.uid(), 'parceiro', v_cliente)
    on conflict (user_id) do update set papel = 'parceiro', cliente_id = excluded.cliente_id;
  return v_cliente;
end $$;

-- Gestão: o código de instalação cria o DONO (só enquanto não houver dono);
-- depois disso, novos gestores entram apenas com convite gerado pelo dono.
create or replace function public.tornar_gestor(p_codigo text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_codigo text := upper(trim(p_codigo));
  v_conv public.convites;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Entre com e-mail e senha';
  end if;
  if exists (select 1 from public.perfis where user_id = auth.uid() and papel in ('gestor', 'dono')) then return true; end if;
  if not exists (select 1 from public.perfis where papel = 'dono')
     and exists (select 1 from public.instalacao where codigo_setup = v_codigo) then
    insert into public.perfis (user_id, papel) values (auth.uid(), 'dono')
      on conflict (user_id) do update set papel = 'dono', cliente_id = null;
    return true;
  end if;
  select * into v_conv from public.convites where codigo = v_codigo and usado_por is null and expira_em > now() for update;
  if v_conv.codigo is null then return false; end if;
  update public.convites set usado_por = auth.uid(), usado_em = now() where codigo = v_codigo;
  insert into public.perfis (user_id, papel) values (auth.uid(), 'gestor')
    on conflict (user_id) do update set papel = 'gestor', cliente_id = null;
  return true;
end $$;

create or replace function public.criar_convite(p_nome text) returns text
language plpgsql security definer set search_path = public as $$
declare v_codigo text := upper(encode(gen_random_bytes(5), 'hex'));
begin
  if not public.eh_dono() then raise exception 'Somente o dono pode convidar gestores'; end if;
  insert into public.convites (codigo, nome, criado_por) values (v_codigo, nullif(trim(p_nome), ''), auth.uid());
  return v_codigo;
end $$;

create or replace function public.equipe() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_gestor() then raise exception 'Sem permissão'; end if;
  return json_build_object(
    'membros', coalesce((select json_agg(json_build_object('userId', p.user_id, 'papel', p.papel, 'email', u.email, 'desde', p.criado_em, 'eu', p.user_id = auth.uid()) order by p.criado_em)
                         from public.perfis p join auth.users u on u.id = p.user_id where p.papel in ('dono', 'gestor')), '[]'::json),
    'convites', case when public.eh_dono() then coalesce((select json_agg(json_build_object('codigo', codigo, 'nome', nome, 'expira', expira_em) order by criado_em desc)
                         from public.convites where usado_por is null and expira_em > now()), '[]'::json) else '[]'::json end);
end $$;

create or replace function public.remover_gestor(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_dono() then raise exception 'Somente o dono pode remover gestores'; end if;
  delete from public.perfis where user_id = p_user and papel = 'gestor';
end $$;

create or replace function public.cancelar_convite(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_dono() then raise exception 'Sem permissão'; end if;
  delete from public.convites where codigo = upper(p_codigo) and usado_por is null;
end $$;

create or replace function public.meu_perfil() returns json
language sql stable security definer set search_path = public as
$$ select json_build_object('papel', papel, 'clienteId', cliente_id) from public.perfis where user_id = auth.uid() $$;

revoke all on function public.vincular_parceiro(text, text) from public, anon;
revoke all on function public.tornar_gestor(text) from public, anon;
revoke all on function public.criar_convite(text) from public, anon;
revoke all on function public.equipe() from public, anon;
revoke all on function public.remover_gestor(uuid) from public, anon;
revoke all on function public.cancelar_convite(text) from public, anon;
grant execute on function public.vincular_parceiro(text, text) to authenticated;
grant execute on function public.tornar_gestor(text) to authenticated;
grant execute on function public.criar_convite(text), public.equipe(), public.remover_gestor(uuid), public.cancelar_convite(text) to authenticated;
grant execute on function public.meu_perfil() to authenticated;

-- ---------- Row Level Security ----------
alter table public.config enable row level security;
alter table public.produtos enable row level security;
alter table public.custos enable row level security;
alter table public.clientes enable row level security;
alter table public.movs enable row level security;
alter table public.vendas enable row level security;
alter table public.fechamentos enable row level security;
alter table public.despesas enable row level security;
alter table public.perfis enable row level security;
alter table public.tentativas_login enable row level security;
alter table public.instalacao enable row level security;
alter table public.convites enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'mt_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- gestor: tudo
create policy mt_gestor on public.config      for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy mt_gestor on public.produtos    for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy mt_gestor on public.custos      for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy mt_gestor on public.clientes    for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy mt_gestor on public.movs        for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy mt_gestor on public.vendas      for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy mt_gestor on public.fechamentos for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy mt_gestor on public.despesas    for all to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy mt_gestor_le_perfis on public.perfis for select to authenticated using (public.eh_gestor());
create policy mt_dono_perfis on public.perfis for all to authenticated using (public.eh_dono() and papel <> 'dono') with check (public.eh_dono() and papel <> 'dono');

-- parceiro
create policy mt_parceiro_config   on public.config      for select to authenticated using (public.meu_cliente() is not null);
create policy mt_parceiro_produtos on public.produtos    for select to authenticated using (public.meu_cliente() is not null);
create policy mt_parceiro_cliente  on public.clientes    for select to authenticated using (id = public.meu_cliente());
create policy mt_parceiro_cliente_upd on public.clientes for update to authenticated using (id = public.meu_cliente()) with check (id = public.meu_cliente());
create policy mt_parceiro_movs     on public.movs        for select to authenticated using (cliente_id = public.meu_cliente());
create policy mt_parceiro_vendas   on public.vendas      for all to authenticated using (cliente_id = public.meu_cliente()) with check (cliente_id = public.meu_cliente());
create policy mt_parceiro_fech_sel on public.fechamentos for select to authenticated using (cliente_id = public.meu_cliente());
create policy mt_parceiro_fech_ins on public.fechamentos for insert to authenticated with check (cliente_id = public.meu_cliente() and status = 'enviado');
create policy mt_proprio_perfil    on public.perfis      for select to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.config, public.produtos, public.custos, public.clientes, public.movs, public.vendas, public.fechamentos, public.despesas, public.perfis to authenticated;
revoke all on public.instalacao, public.tentativas_login, public.convites from anon, authenticated;

-- ---------- Tempo real ----------
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['config','produtos','clientes','movs','vendas','fechamentos','despesas'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- Primeira carga: catálogo Mil Terras ----------
insert into public.produtos (id, data) values ('amarone', '{"ativo":true,"estoqueMin":12,"precoCarta":999,"id":"amarone","nome":"Amarone della Valpolicella","tipo":"Tinto","regiao":"Veneto","classificacao":"DOCG","uvas":"Corvinone, Corvina, Rondinella e Croatina","teor":"15,5%","safra":2020,"preco":499.38,"servir":"18–20 °C","descricao":"Feito com uvas secas em esteiras: grande estrutura, maciez e intensidade aromática.","harmonizacao":"Carnes de caça, assados e queijos maduros, duros e picantes.","foto":"assets/vinhos/amarone.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('amarone', 249.69) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('barolo', '{"ativo":true,"estoqueMin":12,"precoCarta":999,"id":"barolo","nome":"Barolo","tipo":"Tinto","regiao":"Piemonte","classificacao":"DOCG","uvas":"100% Nebbiolo","teor":"14%","safra":2019,"preco":499.38,"servir":"18–20 °C","descricao":"Nascido nas Langhe, é chamado de “o rei dos vinhos e o vinho dos reis”.","harmonizacao":"Carnes de caça, carne assada, porco e queijos duros.","foto":"assets/vinhos/barolo.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('barolo', 249.69) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('brunello', '{"ativo":true,"estoqueMin":12,"precoCarta":969,"id":"brunello","nome":"Brunello di Montalcino Tusum","tipo":"Tinto","regiao":"Toscana","classificacao":"DOCG","uvas":"Sangiovese Grosso (Brunello)","teor":"14,5%","safra":2018,"preco":481.42,"servir":"18–20 °C","descricao":"Excelência reconhecida no mundo todo: envelhece por muitos anos sem perder o frescor.","harmonizacao":"Carnes vermelhas com cogumelos ou trufas, e queijos.","foto":"assets/vinhos/brunello.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('brunello', 240.71) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('primitivo-manduria', '{"ativo":true,"estoqueMin":24,"precoCarta":459,"id":"primitivo-manduria","nome":"Primitivo di Manduria","tipo":"Tinto","regiao":"Puglia","classificacao":"DOP","uvas":"Primitivo","teor":"14,5%","safra":2021,"preco":227.9,"servir":"18–20 °C","descricao":"Admirado no mundo todo: intenso, estruturado, rico em cor e de taninos marcantes.","harmonizacao":"Massas com molho de carne e assados.","foto":"assets/vinhos/primitivo-manduria.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('primitivo-manduria', 113.95) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('publia', '{"ativo":true,"estoqueMin":24,"precoCarta":269,"id":"publia","nome":"Publia","tipo":"Tinto","regiao":"Puglia","classificacao":"IGP","uvas":"100% Primitivo","teor":"14%","safra":2018,"preco":131.25,"servir":"18–20 °C","descricao":"Um vinho excepcional, de grande intensidade, estrutura e complexidade.","harmonizacao":"Assados, carnes curadas e queijos.","foto":"assets/vinhos/publia.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('publia', 65.63) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('mitasus', '{"ativo":true,"estoqueMin":24,"precoCarta":249,"id":"mitasus","nome":"Mitasus","tipo":"Tinto","regiao":"Puglia","classificacao":"IGP","uvas":"100% Primitivo","teor":"14%","safra":2021,"preco":124.8,"servir":"18–20 °C","descricao":"Primitivo intenso, frutado e robusto. Uma aposta que tem gosto de vitória.","harmonizacao":"Carnes vermelhas, queijos e massas.","foto":"assets/vinhos/mitasus.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('mitasus', 62.4) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('rufia', '{"ativo":true,"estoqueMin":24,"precoCarta":249,"id":"rufia","nome":"Rufia","tipo":"Tinto","regiao":"Puglia","classificacao":"IGP","uvas":"Negroamaro e Sangiovese","teor":"14%","safra":2021,"preco":124.8,"servir":"18–20 °C","descricao":"Grande estrutura e complexidade, com um buquê cheio de nuances e muito envolvente.","harmonizacao":"Carnes grelhadas e queijos.","foto":"assets/vinhos/rufia.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('rufia', 62.4) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('sativus', '{"ativo":true,"estoqueMin":24,"precoCarta":249,"id":"sativus","nome":"Sativus","tipo":"Tinto","regiao":"Puglia","classificacao":"IGP","uvas":"70% Nero di Troia e 30% Primitivo","teor":"14%","safra":2021,"preco":124.8,"servir":"18–20 °C","descricao":"Complexo e elegante: geleia de cereja, flores e especiarias, com frescor surpreendente.","harmonizacao":"Carnes vermelhas, queijos e massas.","foto":"assets/vinhos/sativus.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('sativus', 62.4) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('odone', '{"ativo":true,"estoqueMin":24,"precoCarta":209,"id":"odone","nome":"Odone","tipo":"Tinto","regiao":"Puglia","classificacao":"IGP","uvas":"100% Sangiovese","teor":"14%","safra":2021,"preco":104.24,"servir":"18–20 °C","descricao":"Sangiovese puro, seco e encorpado, com buquê profundo.","harmonizacao":"Assados, carnes saborosas e queijos.","foto":"assets/vinhos/odone.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('odone', 52.12) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('ceius', '{"ativo":true,"estoqueMin":24,"precoCarta":179,"id":"ceius","nome":"Ceius","tipo":"Tinto","regiao":"Puglia","classificacao":"IGP","uvas":"70% Primitivo e 30% Nero di Troia","teor":"13%","safra":2021,"preco":87.5,"servir":"18–20 °C","descricao":"O encontro do Primitivo com o Nero di Troia: fruta escura, calor e persistência.","harmonizacao":"Pratos de carne em geral.","foto":"assets/vinhos/ceius.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('ceius', 43.75) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('vignadura', '{"ativo":true,"estoqueMin":24,"precoCarta":179,"id":"vignadura","nome":"Vignadura","tipo":"Tinto","regiao":"Puglia","classificacao":"","uvas":"Sangiovese e Montepulciano","teor":"13,5%","safra":2021,"preco":87.5,"servir":"18–20 °C","descricao":"Tinto jovem e equilibrado, com fruta vermelha intensa e um leve toque de especiarias.","harmonizacao":"Queijos, pratos de carne e assados.","foto":"assets/vinhos/vignadura.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('vignadura', 43.75) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('rianus', '{"ativo":true,"estoqueMin":24,"precoCarta":189,"id":"rianus","nome":"Rianus","tipo":"Branco","regiao":"Piemonte","classificacao":"DOC","uvas":"Cortese, Sauvignon Blanc e Chardonnay","teor":"14%","safra":2021,"preco":94.25,"servir":"8–10 °C","descricao":"Branco de guarda, com corpo, estrutura e aromas intensos. Irresistível e elegante.","harmonizacao":"Peixes, frutos do mar, massas com molho branco e queijos frescos.","foto":"assets/vinhos/rianus.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('rianus', 47.13) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('lito', '{"ativo":true,"estoqueMin":24,"precoCarta":149,"id":"lito","nome":"Lito","tipo":"Branco","regiao":"Puglia","classificacao":"","uvas":"Chardonnay e Garganega","teor":"12%","safra":2023,"preco":72.92,"servir":"8–10 °C","descricao":"Fresco, suave e frutado, com flores brancas e frutas cítricas e tropicais.","harmonizacao":"Aperitivos, peixes e legumes.","foto":"assets/vinhos/lito.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('lito', 36.46) on conflict (id) do nothing;
insert into public.produtos (id, data) values ('lux-clara', '{"ativo":true,"estoqueMin":24,"precoCarta":249,"id":"lux-clara","nome":"Lux Clara","tipo":"Rosé","regiao":"Puglia","classificacao":"IGP","uvas":"Negroamaro e Malvasia Nera","teor":"12,5%","safra":2023,"preco":123.61,"servir":"10–12 °C","descricao":"Fresco e equilibrado, expressa a força e a paixão da terra do Salento.","harmonizacao":"Aperitivo, antepastos, queijos, pratos leves e carnes brancas.","foto":"assets/vinhos/lux-clara.webp"}'::jsonb) on conflict (id) do nothing;
insert into public.custos (id, custo) values ('lux-clara', 61.81) on conflict (id) do nothing;
insert into public.config (id, data) values ('geral', '{"empresa":"Mil Terras","whatsapp":"5554991165105","instagram":"@milterrasvinhos"}'::jsonb) on conflict (id) do nothing;

select codigo_setup as "SEU CÓDIGO DE INSTALAÇÃO (guarde)" from public.instalacao;
