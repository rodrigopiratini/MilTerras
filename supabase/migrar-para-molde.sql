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
-- Mil Terras — instalação do banco no Supabase (gerado por supabase/gerar.mjs; não edite à mão)
-- Como usar: Supabase › SQL Editor › New query › cole este arquivo inteiro › Run. Pode rodar de novo sem perder dados.
-- Pasta (schema) deste app: milterras. Depois de rodar, inclua "milterras" em Project Settings › Data API › Exposed schemas.

create schema if not exists milterras;
grant usage on schema milterras to anon, authenticated, service_role;

-- =====================================================================
-- EasyApp Base — banco comum a todos os apps de segmento (uma instalação por segmento).
-- NÃO edite este arquivo num app de segmento: ele vem do repositório easyapp-base.
-- O que é específico do segmento fica em supabase/segmento.sql e em src/js/segmento.js.
-- Pode ser executado de novo sem perder dados (idempotente).
-- =====================================================================
--
-- Modelo
--   empresas  → cada cliente pagante (ex.: uma frota). Todos os dados levam empresa_id.
--   docs      → todos os registros do app como documentos JSON (coluna data), separados por coleção
--               (ex.: veiculos, viagens). Novas coleções não precisam de tabela nova: basta
--               declarar em src/js/segmento.js (o gerar.mjs grava as regras na tabela colecoes).
--   colecoes  → regras de acesso de cada coleção:
--                 leitura: gestao (só a gestão) | todos (gestão + usuários) | proprio (usuário vê só o dele)
--                 escrita: gestao | proprio (usuário grava só o dele)
--                 campo_ref: campo que diz a quem pertence o documento (ex.: motoristaId; 'id' = o próprio)
--                 protegidos: campos que o usuário não altera (ex.: valor do frete)
--                 trava: campo booleano; quando true o usuário não altera nem apaga mais (ex.: conferido)
--   perfis    → quem é quem: dono = Administrador, gestor = Gestor (e-mail e senha) ou usuario = Usuário (código + PIN, login anônimo)
--   acessos   → código + PIN de cada usuário do app de campo (motorista, parceiro, técnico…)
--
-- Assinatura: empresas.situacao (teste | ativa | suspensa | cancelada). Fora do teste ou do
-- pagamento em dia, o banco recusa gravações (os dados continuam visíveis para exportar).
-- O desenvolvedor (tabela plataforma_admins) gerencia as empresas pelo app de Gestão.

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table if not exists milterras.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  plano text not null default 'teste',
  situacao text not null default 'teste' check (situacao in ('teste', 'ativa', 'suspensa', 'cancelada')),
  teste_ate date not null default (current_date + 30),
  pago_ate date,
  valor_mensal numeric(10,2),
  obs text
);

create table if not exists milterras.colecoes (
  nome text primary key,
  leitura text not null default 'gestao' check (leitura in ('gestao', 'todos', 'proprio')),
  escrita text not null default 'gestao' check (escrita in ('gestao', 'proprio')),
  campo_ref text,
  protegidos text[] not null default '{}',
  trava text
);
insert into milterras.colecoes (nome, leitura, escrita) values ('config', 'todos', 'gestao') on conflict (nome) do nothing;

create table if not exists milterras.docs (
  empresa_id uuid not null references milterras.empresas(id) on delete cascade,
  id text not null,
  colecao text not null references milterras.colecoes(nome),
  data jsonb not null,
  ref text,                                  -- preenchido pelo banco (colecoes.campo_ref)
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (empresa_id, id)
);
create index if not exists docs_colecao_idx on milterras.docs (empresa_id, colecao);
create index if not exists docs_ref_idx on milterras.docs (empresa_id, colecao, ref);

create table if not exists milterras.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references milterras.empresas(id) on delete cascade,
  papel text not null check (papel in ('dono', 'gestor', 'usuario')),
  ref text,                                  -- usuário: documento ao qual o aparelho está vinculado
  criado_em timestamptz not null default now()
);
create index if not exists perfis_empresa_idx on milterras.perfis (empresa_id, papel);
alter table milterras.perfis add column if not exists visto_em timestamptz;  -- presença: último sinal do app aberto

create table if not exists milterras.acessos (
  codigo text primary key,
  empresa_id uuid not null references milterras.empresas(id) on delete cascade,
  ref text not null,
  nome text,
  pin text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, ref)
);

create table if not exists milterras.convites (
  codigo text primary key,
  empresa_id uuid not null references milterras.empresas(id) on delete cascade,
  nome text,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references auth.users(id) on delete set null,
  usado_em timestamptz
);
-- papel de quem usar o convite: gestor (usuário da Gestão, convidado pelo dono) ou dono (convite feito pelo desenvolvedor na Plataforma)
alter table milterras.convites add column if not exists papel text not null default 'gestor' check (papel in ('dono', 'gestor'));

create table if not exists milterras.tentativas_login (
  codigo text primary key,
  falhas int not null default 0,
  bloqueado_ate timestamptz
);

create table if not exists milterras.plataforma_admins (email text primary key);

-- Visita de suporte: o desenvolvedor abre uma empresa pelo próprio app (com o login dele,
-- verificação em duas etapas e prazo). Enquanto vale, o app enxerga aquela empresa como o dono enxerga.
create table if not exists milterras.suporte_visitas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references milterras.empresas(id) on delete cascade,
  modo text not null check (modo in ('leitura', 'edicao')),
  desde timestamptz not null default now(),
  ate timestamptz not null
);

create table if not exists milterras.atividade (
  id bigint generated always as identity primary key,
  empresa_id uuid references milterras.empresas(id) on delete cascade,
  em timestamptz not null default now(),
  user_id uuid,
  papel text,
  quem text,
  ref text,
  acao text not null,                        -- insert | update | delete | acesso
  colecao text,
  registro text,
  antes jsonb,
  depois jsonb
);
create index if not exists atividade_empresa_idx on milterras.atividade (empresa_id, em desc);

-- ---------- Funções auxiliares ----------
create or replace function milterras.eh_admin() returns boolean
language sql stable security definer set search_path = milterras, public, extensions as
$$ select coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
      and exists (select 1 from milterras.plataforma_admins where lower(email) = lower(auth.jwt()->>'email')) $$;

-- Visita de suporte em vigor: só para o desenvolvedor, dentro do prazo e com a verificação em duas etapas
-- feita nesta sessão (aal2). Sem isso as funções abaixo ignoram a visita.
create or replace function milterras.visita_empresa() returns uuid
language sql stable security definer set search_path = milterras, public, extensions as
$$ select v.empresa_id from milterras.suporte_visitas v
    where v.user_id = auth.uid() and v.ate > now() and coalesce(auth.jwt()->>'aal', '') = 'aal2' and milterras.eh_admin() $$;

create or replace function milterras.visita_modo(p_empresa uuid) returns text
language sql stable security definer set search_path = milterras, public, extensions as
$$ select v.modo from milterras.suporte_visitas v
    where v.user_id = auth.uid() and v.empresa_id = p_empresa and v.ate > now() and coalesce(auth.jwt()->>'aal', '') = 'aal2' and milterras.eh_admin() $$;

-- Visita "só ver": o banco recusa qualquer gravação nessa empresa
create or replace function milterras.so_leitura(p_empresa uuid) returns boolean
language sql stable security definer set search_path = milterras, public, extensions as
$$ select coalesce(milterras.visita_modo(p_empresa) = 'leitura', false) $$;

create or replace function milterras.eh_gestao(p_empresa uuid) returns boolean
language sql stable security definer set search_path = milterras, public, extensions as
$$ select exists (select 1 from milterras.perfis where user_id = auth.uid() and empresa_id = p_empresa and papel in ('dono', 'gestor'))
       or milterras.visita_modo(p_empresa) is not null $$;

create or replace function milterras.eh_dono(p_empresa uuid) returns boolean
language sql stable security definer set search_path = milterras, public, extensions as
$$ select exists (select 1 from milterras.perfis where user_id = auth.uid() and empresa_id = p_empresa and papel = 'dono')
       or milterras.visita_modo(p_empresa) is not null $$;

create or replace function milterras.meu_ref(p_empresa uuid) returns text
language sql stable security definer set search_path = milterras, public, extensions as
$$ select ref from milterras.perfis where user_id = auth.uid() and empresa_id = p_empresa and papel = 'usuario' $$;

create or replace function milterras.minha_empresa() returns uuid
language sql stable security definer set search_path = milterras, public, extensions as
$$ select coalesce(milterras.visita_empresa(), (select empresa_id from milterras.perfis where user_id = auth.uid())) $$;

-- Empresa em dia: teste dentro do prazo, ou ativa com pagamento até 5 dias atrasado
create or replace function milterras.empresa_liberada(p_empresa uuid) returns boolean
language sql stable security definer set search_path = milterras, public, extensions as $$
  select exists (select 1 from milterras.empresas e where e.id = p_empresa and (
    (e.situacao = 'teste' and e.teste_ate >= current_date) or
    (e.situacao = 'ativa' and (e.pago_ate is null or e.pago_ate >= current_date - 5))))
$$;

create or replace function milterras.pode_ler(p_empresa uuid, p_colecao text, p_ref text) returns boolean
language plpgsql stable security definer set search_path = milterras, public, extensions as $$
declare v_ref text; v_leitura text;
begin
  if milterras.eh_gestao(p_empresa) then return true; end if;
  v_ref := milterras.meu_ref(p_empresa);
  if v_ref is null then return false; end if;
  select leitura into v_leitura from milterras.colecoes where nome = p_colecao;
  return v_leitura = 'todos' or (v_leitura = 'proprio' and p_ref = v_ref);
end $$;

create or replace function milterras.pode_gravar(p_empresa uuid, p_colecao text, p_ref text, p_data jsonb) returns boolean
language plpgsql stable security definer set search_path = milterras, public, extensions as $$
declare v_ref text; c milterras.colecoes;
begin
  if milterras.so_leitura(p_empresa) then return false; end if;
  if not milterras.empresa_liberada(p_empresa) then return false; end if;
  if milterras.eh_gestao(p_empresa) then return true; end if;
  v_ref := milterras.meu_ref(p_empresa);
  if v_ref is null then return false; end if;
  select * into c from milterras.colecoes where nome = p_colecao;
  if c.escrita <> 'proprio' or p_ref is distinct from v_ref then return false; end if;
  return c.trava is null or not coalesce((p_data->>c.trava)::boolean, false);
end $$;

-- Antes de gravar um documento: confere a coleção, preenche ref e protege campos do usuário
create or replace function milterras.preparar_doc() returns trigger
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare c milterras.colecoes; k text;
begin
  select * into c from milterras.colecoes where nome = new.colecao;
  if c.nome is null then raise exception 'Coleção desconhecida: %', new.colecao; end if;
  if tg_op = 'UPDATE' and new.colecao <> old.colecao then raise exception 'Não é permitido mudar a coleção'; end if;
  if auth.uid() is not null and not milterras.eh_gestao(new.empresa_id) then
    foreach k in array array_remove(c.protegidos || array[c.trava], null) loop
      if tg_op = 'UPDATE' and old.data ? k then new.data := jsonb_set(new.data, array[k], old.data->k);
      else new.data := new.data - k; end if;
    end loop;
    if tg_op = 'UPDATE' and c.trava is not null and coalesce((old.data->>c.trava)::boolean, false) then
      raise exception 'Este registro já foi conferido pela gestão';
    end if;
  end if;
  new.ref := case when c.campo_ref = 'id' then new.id when c.campo_ref is not null then new.data->>c.campo_ref end;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists tg_preparar_doc on milterras.docs;
create trigger tg_preparar_doc before insert or update on milterras.docs for each row execute function milterras.preparar_doc();

create or replace function milterras.gerar_codigo(n int) returns text language sql volatile as
$$ select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, n) $$;

-- Acessos: código gerado pelo banco; PIN trocado ou acesso desativado desconecta os aparelhos
create or replace function milterras.preparar_acesso() returns trigger
language plpgsql security definer set search_path = milterras, public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if new.codigo is null or new.codigo = '' then
      loop new.codigo := milterras.gerar_codigo(6); exit when not exists (select 1 from milterras.acessos where codigo = new.codigo); end loop;
    end if;
    new.codigo := upper(new.codigo);
    if new.pin is null or new.pin = '' then new.pin := lpad(floor(random() * 10000)::text, 4, '0'); end if;
  else
    new.codigo := old.codigo; new.empresa_id := old.empresa_id; new.ref := old.ref;
    if new.pin is distinct from old.pin or not new.ativo then
      delete from milterras.perfis where empresa_id = old.empresa_id and papel = 'usuario' and ref = old.ref;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tg_preparar_acesso on milterras.acessos;
create trigger tg_preparar_acesso before insert or update on milterras.acessos for each row execute function milterras.preparar_acesso();

create or replace function milterras.apagar_acesso() returns trigger
language plpgsql security definer set search_path = milterras, public, extensions as $$
begin
  delete from milterras.perfis where empresa_id = old.empresa_id and papel = 'usuario' and ref = old.ref;
  return old;
end $$;
drop trigger if exists tg_apagar_acesso on milterras.acessos;
create trigger tg_apagar_acesso after delete on milterras.acessos for each row execute function milterras.apagar_acesso();

-- ---------- Entrada e cadastro ----------
create or replace function milterras.meu_perfil() returns json
language sql stable security definer set search_path = milterras, public, extensions as $$
  -- visita de suporte em vigor: o desenvolvedor vê a empresa visitada como o administrador dela
  select json_build_object(
    'papel', 'dono', 'empresaId', e.id, 'ref', null, 'admin', true, 'email', auth.jwt()->>'email',
    'suporte', json_build_object('modo', v.modo, 'ate', v.ate),
    'empresa', json_build_object('nome', e.nome, 'situacao', e.situacao, 'plano', e.plano, 'testeAte', e.teste_ate,
                                 'pagoAte', e.pago_ate, 'liberada', milterras.empresa_liberada(e.id)))
  from milterras.suporte_visitas v join milterras.empresas e on e.id = v.empresa_id
  where v.user_id = auth.uid() and v.empresa_id = milterras.visita_empresa()
  union all
  select json_build_object(
    'papel', p.papel, 'empresaId', p.empresa_id, 'ref', p.ref, 'admin', milterras.eh_admin(),
    'email', (select email from auth.users where id = auth.uid()),
    'empresa', json_build_object('nome', e.nome, 'situacao', e.situacao, 'plano', e.plano, 'testeAte', e.teste_ate,
                                 'pagoAte', e.pago_ate, 'liberada', milterras.empresa_liberada(e.id)))
  from milterras.perfis p join milterras.empresas e on e.id = p.empresa_id where p.user_id = auth.uid() and milterras.visita_empresa() is null
  union all
  select json_build_object('papel', null, 'admin', true, 'email', auth.jwt()->>'email')
  where milterras.eh_admin() and milterras.visita_empresa() is null and not exists (select 1 from milterras.perfis where user_id = auth.uid())
$$;

-- Desenvolvedor: abre uma empresa no próprio app (só ver ou ver e corrigir) por 2 horas.
-- Exige a verificação em duas etapas nesta sessão. Fica no registro de atividades da empresa.
create or replace function milterras.suporte_abrir(p_empresa uuid, p_modo text) returns json
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_modo text := case when p_modo = 'edicao' then 'edicao' else 'leitura' end;
begin
  if not milterras.eh_admin() then raise exception 'Sem permissão'; end if;
  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then raise exception 'MFA: confirme o código de verificação em duas etapas'; end if;
  if not exists (select 1 from milterras.empresas where id = p_empresa) then raise exception 'Empresa não encontrada'; end if;
  insert into milterras.suporte_visitas (user_id, empresa_id, modo, desde, ate) values (auth.uid(), p_empresa, v_modo, now(), now() + interval '2 hours')
    on conflict (user_id) do update set empresa_id = excluded.empresa_id, modo = excluded.modo, desde = excluded.desde, ate = excluded.ate;
  insert into milterras.atividade (empresa_id, user_id, papel, quem, acao, depois)
  values (p_empresa, auth.uid(), 'suporte', 'Suporte (' || coalesce(auth.jwt()->>'email', '') || ')', 'acesso', jsonb_build_object('modo', v_modo));
  return milterras.meu_perfil();
end $$;

create or replace function milterras.suporte_sair() returns void
language sql security definer set search_path = milterras, public, extensions as
$$ delete from milterras.suporte_visitas where user_id = auth.uid() $$;

-- Cadastro livre: quem cria a conta com e-mail cria a própria empresa (vira dono, em período de teste)
create or replace function milterras.criar_empresa(p_nome text) returns uuid
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_id uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'Entre com e-mail e senha'; end if;
  if exists (select 1 from milterras.perfis where user_id = auth.uid()) then raise exception 'Esta conta já está ligada a uma empresa'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Informe o nome da empresa'; end if;
  insert into milterras.empresas (nome, criado_por) values (trim(p_nome), auth.uid()) returning id into v_id;
  insert into milterras.perfis (user_id, empresa_id, papel) values (auth.uid(), v_id, 'dono');
  return v_id;
end $$;

-- Convite de gestor (gerado pelo dono)
create or replace function milterras.entrar_convite(p_codigo text) returns boolean
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_conv milterras.convites;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'Entre com e-mail e senha'; end if;
  if exists (select 1 from milterras.perfis where user_id = auth.uid()) then raise exception 'Esta conta já está ligada a uma empresa'; end if;
  select * into v_conv from milterras.convites where codigo = upper(trim(p_codigo)) and usado_por is null and expira_em > now() for update;
  if v_conv.codigo is null then return false; end if;
  update milterras.convites set usado_por = auth.uid(), usado_em = now() where codigo = v_conv.codigo;
  insert into milterras.perfis (user_id, empresa_id, papel) values (auth.uid(), v_conv.empresa_id, coalesce(v_conv.papel, 'gestor'));
  return true;
end $$;

-- Desenvolvedor: convite de DONO para uma empresa (ex.: empresa criada para o cliente)
create or replace function milterras.plataforma_convite_dono(p_empresa uuid) returns text
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_codigo text := milterras.gerar_codigo(8);
begin
  if not milterras.eh_admin() then raise exception 'Sem permissão'; end if;
  if not exists (select 1 from milterras.empresas where id = p_empresa) then raise exception 'Empresa não encontrada'; end if;
  insert into milterras.convites (codigo, empresa_id, nome, criado_por, papel) values (v_codigo, p_empresa, 'Convite de dono', auth.uid(), 'dono');
  return v_codigo;
end $$;

-- Usuário do app de campo: login anônimo + código + PIN (bloqueio após 5 erros)
create or replace function milterras.vincular_usuario(p_codigo text, p_pin text) returns text
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_codigo text := upper(trim(p_codigo)); v_a milterras.acessos; v_t milterras.tentativas_login;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select * into v_t from milterras.tentativas_login where codigo = v_codigo;
  if v_t.bloqueado_ate is not null and v_t.bloqueado_ate > now() then raise exception 'Muitas tentativas. Tente novamente em alguns minutos.'; end if;
  select * into v_a from milterras.acessos where codigo = v_codigo and pin = trim(p_pin) and ativo;
  if v_a.codigo is null then
    insert into milterras.tentativas_login as t (codigo, falhas) values (v_codigo, 1)
      on conflict (codigo) do update set falhas = t.falhas + 1,
        bloqueado_ate = case when t.falhas + 1 >= 5 then now() + interval '15 minutes' else null end;
    return null;
  end if;
  delete from milterras.tentativas_login where codigo = v_codigo;
  if exists (select 1 from milterras.perfis where user_id = auth.uid() and papel in ('dono', 'gestor')) then
    raise exception 'Este aparelho está conectado como gestão. Saia antes de entrar como usuário.';
  end if;
  insert into milterras.perfis (user_id, empresa_id, papel, ref) values (auth.uid(), v_a.empresa_id, 'usuario', v_a.ref)
    on conflict (user_id) do update set empresa_id = excluded.empresa_id, papel = 'usuario', ref = excluded.ref;
  return v_a.ref;
end $$;

-- ---------- Equipe de gestão ----------
create or replace function milterras.criar_convite(p_nome text) returns text
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_codigo text := milterras.gerar_codigo(8); v_emp uuid := milterras.minha_empresa();
begin
  if not milterras.eh_dono(v_emp) or milterras.so_leitura(v_emp) then raise exception 'Somente o administrador pode convidar gestores'; end if;
  insert into milterras.convites (codigo, empresa_id, nome, criado_por) values (v_codigo, v_emp, nullif(trim(p_nome), ''), auth.uid());
  return v_codigo;
end $$;

create or replace function milterras.equipe() returns json
language plpgsql stable security definer set search_path = milterras, public, extensions as $$
declare v_emp uuid := milterras.minha_empresa();
begin
  if not milterras.eh_gestao(v_emp) then raise exception 'Sem permissão'; end if;
  return json_build_object(
    'membros', coalesce((select json_agg(json_build_object('userId', p.user_id, 'papel', p.papel, 'email', u.email, 'desde', p.criado_em, 'eu', p.user_id = auth.uid()) order by p.criado_em)
                         from milterras.perfis p join auth.users u on u.id = p.user_id where p.empresa_id = v_emp and p.papel in ('dono', 'gestor')), '[]'::json),
    'convites', case when milterras.eh_dono(v_emp) then coalesce((select json_agg(json_build_object('codigo', codigo, 'nome', nome, 'expira', expira_em) order by criado_em desc)
                         from milterras.convites where empresa_id = v_emp and usado_por is null and expira_em > now()), '[]'::json) else '[]'::json end);
end $$;

create or replace function milterras.remover_gestor(p_user uuid) returns void
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_emp uuid := milterras.minha_empresa();
begin
  if not milterras.eh_dono(v_emp) or milterras.so_leitura(v_emp) then raise exception 'Somente o administrador pode remover gestores'; end if;
  delete from milterras.perfis where user_id = p_user and empresa_id = v_emp and papel = 'gestor';
end $$;

create or replace function milterras.cancelar_convite(p_codigo text) returns void
language plpgsql security definer set search_path = milterras, public, extensions as $$
begin
  if not milterras.eh_dono(milterras.minha_empresa()) or milterras.so_leitura(milterras.minha_empresa()) then raise exception 'Sem permissão'; end if;
  delete from milterras.convites where codigo = upper(p_codigo) and empresa_id = milterras.minha_empresa() and usado_por is null;
end $$;

-- ---------- Registro de atividades ----------
create or replace function milterras.atividade_autor(out o_papel text, out o_quem text, out o_ref text)
language plpgsql stable security definer set search_path = milterras, public, extensions as $$
begin
  if auth.uid() is null then o_quem := 'Sistema'; return; end if;
  if milterras.visita_empresa() is not null then o_papel := 'suporte'; o_quem := 'Suporte (' || coalesce(auth.jwt()->>'email', '') || ')'; return; end if;
  select papel, ref into o_papel, o_ref from milterras.perfis where user_id = auth.uid();
  if o_papel = 'usuario' then o_quem := (select nome from milterras.acessos where empresa_id = milterras.minha_empresa() and ref = o_ref);
  else o_quem := (select email from auth.users where id = auth.uid()); end if;
end $$;

create or replace function milterras.registrar_atividade() returns trigger
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_old jsonb; v_new jsonb; v_antes jsonb; v_depois jsonb; v_reg text; v_col text; v_emp uuid; a record;
begin
  begin -- o registro nunca impede a gravação do app
    if tg_table_name = 'docs' then
      v_old := case when tg_op <> 'INSERT' then old.data end; v_new := case when tg_op <> 'DELETE' then new.data end;
      v_reg := coalesce(new.id, old.id); v_col := coalesce(new.colecao, old.colecao); v_emp := coalesce(new.empresa_id, old.empresa_id);
    elsif tg_table_name = 'acessos' then
      v_old := case when tg_op <> 'INSERT' then to_jsonb(old) - 'pin' end; v_new := case when tg_op <> 'DELETE' then to_jsonb(new) - 'pin' end;
      if tg_op = 'UPDATE' and old.pin is distinct from new.pin then v_new := v_new || '{"pinTrocado": true}'; end if;
      v_reg := coalesce(new.ref, old.ref); v_col := 'acessos'; v_emp := coalesce(new.empresa_id, old.empresa_id);
    else
      v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end; v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
      v_reg := coalesce(new.user_id, old.user_id)::text; v_col := 'perfis'; v_emp := coalesce(new.empresa_id, old.empresa_id);
    end if;
    if tg_op = 'UPDATE' then
      select jsonb_object_agg(k, v_old->k), jsonb_object_agg(k, v_new->k) into v_antes, v_depois
        from (select jsonb_object_keys(v_old || v_new) k) x where v_old->k is distinct from v_new->k;
      if v_depois is null then return null; end if;
    else v_antes := v_old; v_depois := v_new; end if;
    select * into a from milterras.atividade_autor();
    insert into milterras.atividade (empresa_id, user_id, papel, quem, ref, acao, colecao, registro, antes, depois)
    values (v_emp, auth.uid(), a.o_papel, a.o_quem, a.o_ref, lower(tg_op), v_col, v_reg, v_antes, v_depois);
  exception when others then raise warning 'registrar_atividade: %', sqlerrm;
  end;
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['docs', 'acessos', 'perfis'] loop
    execute format('drop trigger if exists tg_atividade on milterras.%I', t);
    execute format('create trigger tg_atividade after insert or update or delete on milterras.%I for each row execute function milterras.registrar_atividade()', t);
  end loop;
end $$;

create or replace function milterras.registrar_acesso() returns void
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare a record; v_emp uuid := milterras.minha_empresa();
begin
  if v_emp is null then return; end if;
  if exists (select 1 from milterras.atividade where user_id = auth.uid() and acao = 'acesso' and em > now() - interval '30 minutes') then return; end if;
  select * into a from milterras.atividade_autor();
  insert into milterras.atividade (empresa_id, user_id, papel, quem, ref, acao) values (v_emp, auth.uid(), a.o_papel, a.o_quem, a.o_ref, 'acesso');
  delete from milterras.atividade where em < now() - interval '1 year';
end $$;

-- Presença: o app aberto manda um sinal a cada 2 minutos (o painel de gestão mostra quem está conectado)
create or replace function milterras.sinal() returns void
language sql security definer set search_path = milterras, public, extensions as $$
  update milterras.perfis set visto_em = now() where user_id = auth.uid() and milterras.visita_empresa() is null;
$$;

create or replace function milterras.atividade_log(p_antes timestamptz default null, p_user uuid default null, p_desde timestamptz default null, p_limite int default 300) returns json
language plpgsql stable security definer set search_path = milterras, public, extensions as $$
declare v_emp uuid := milterras.minha_empresa();
begin
  if not milterras.eh_dono(v_emp) then raise exception 'Somente o administrador vê o registro de atividades'; end if;
  return json_build_object(
    'itens', coalesce((select json_agg(x order by x.em desc, x.id desc) from (
        select id, em, user_id "userId", papel, quem, ref, acao, colecao, registro, antes, depois from milterras.atividade
         where empresa_id = v_emp and (p_antes is null or em < p_antes) and (p_user is null or user_id = p_user) and (p_desde is null or em >= p_desde)
         order by em desc, id desc limit least(greatest(p_limite, 1), 1000)) x), '[]'::json),
    'pessoas', coalesce((select json_agg(x order by x.ultimo desc) from (
        select user_id "userId", (array_agg(papel order by em desc))[1] papel, (array_agg(quem order by em desc))[1] quem,
               max(em) ultimo, count(*) filter (where acao <> 'acesso') acoes, count(*) filter (where acao = 'acesso') acessos
          from milterras.atividade where empresa_id = v_emp and em > now() - interval '30 days' and user_id is not null group by user_id) x), '[]'::json));
end $$;

-- ---------- Plataforma (desenvolvedor da fábrica de apps) ----------
create or replace function milterras.plataforma_empresas() returns json
language plpgsql stable security definer set search_path = milterras, public, extensions as $$
begin
  if not milterras.eh_admin() then raise exception 'Sem permissão'; end if;
  return coalesce((select json_agg(x order by x."criadoEm" desc) from (
    select e.id, e.nome, e.plano, e.situacao, e.teste_ate "testeAte", e.pago_ate "pagoAte", e.valor_mensal "valorMensal", e.obs, e.criado_em "criadoEm",
           milterras.empresa_liberada(e.id) liberada,
           (select u.email from milterras.perfis p join auth.users u on u.id = p.user_id where p.empresa_id = e.id and p.papel = 'dono' limit 1) dono,
           (select count(*) from milterras.perfis p where p.empresa_id = e.id and p.papel in ('dono', 'gestor')) gestores,
           (select count(*) from milterras.acessos a where a.empresa_id = e.id and a.ativo) usuarios,
           (select count(*) from milterras.docs d where d.empresa_id = e.id) registros,
           (select max(em) from milterras.atividade a where a.empresa_id = e.id) "ultimoUso"
      from milterras.empresas e) x), '[]'::json);
end $$;

create or replace function milterras.plataforma_atualizar(p_empresa uuid, p_situacao text, p_plano text, p_teste_ate date, p_pago_ate date, p_valor numeric, p_obs text) returns void
language plpgsql security definer set search_path = milterras, public, extensions as $$
begin
  if not milterras.eh_admin() then raise exception 'Sem permissão'; end if;
  update milterras.empresas set situacao = p_situacao, plano = coalesce(nullif(trim(p_plano), ''), plano), teste_ate = coalesce(p_teste_ate, teste_ate),
         pago_ate = p_pago_ate, valor_mensal = p_valor, obs = nullif(trim(p_obs), '') where id = p_empresa;
end $$;

-- ---------- Permissões das funções ----------
do $$ declare f text; begin
  foreach f in array array['criar_empresa(text)', 'entrar_convite(text)', 'vincular_usuario(text, text)', 'criar_convite(text)', 'equipe()',
    'remover_gestor(uuid)', 'cancelar_convite(text)', 'registrar_acesso()', 'sinal()', 'atividade_log(timestamptz, uuid, timestamptz, int)',
    'plataforma_empresas()', 'plataforma_atualizar(uuid, text, text, date, date, numeric, text)', 'meu_perfil()',
    'suporte_abrir(uuid, text)', 'suporte_sair()', 'plataforma_convite_dono(uuid)'] loop
    execute format('revoke all on function milterras.%s from public, anon', f);
    execute format('grant execute on function milterras.%s to authenticated', f);
  end loop;
end $$;
revoke all on function milterras.atividade_autor() from public, anon, authenticated;

-- ---------- Row Level Security ----------
alter table milterras.empresas enable row level security;
alter table milterras.colecoes enable row level security;
alter table milterras.docs enable row level security;
alter table milterras.perfis enable row level security;
alter table milterras.acessos enable row level security;
alter table milterras.convites enable row level security;
alter table milterras.tentativas_login enable row level security;
alter table milterras.plataforma_admins enable row level security;
alter table milterras.atividade enable row level security;
alter table milterras.suporte_visitas enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'milterras' and policyname like 'ea_%' loop
    execute format('drop policy %I on milterras.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy ea_ler on milterras.docs for select to authenticated using (milterras.pode_ler(empresa_id, colecao, ref));
create policy ea_inserir on milterras.docs for insert to authenticated with check (milterras.pode_gravar(empresa_id, colecao, ref, data));
create policy ea_alterar on milterras.docs for update to authenticated using (milterras.pode_gravar(empresa_id, colecao, ref, data)) with check (milterras.pode_gravar(empresa_id, colecao, ref, data));
create policy ea_apagar on milterras.docs for delete to authenticated using (milterras.pode_gravar(empresa_id, colecao, ref, data));

create policy ea_empresa on milterras.empresas for select to authenticated using (id = milterras.minha_empresa());
create policy ea_empresa_nome on milterras.empresas for update to authenticated using (milterras.eh_dono(id) and not milterras.so_leitura(id)) with check (milterras.eh_dono(id) and not milterras.so_leitura(id));
create policy ea_colecoes on milterras.colecoes for select to authenticated using (true);
create policy ea_perfil on milterras.perfis for select to authenticated using (user_id = auth.uid() or milterras.eh_gestao(empresa_id));
create policy ea_acessos_ler on milterras.acessos for select to authenticated using (milterras.eh_gestao(empresa_id));
create policy ea_acessos on milterras.acessos for all to authenticated using (milterras.eh_gestao(empresa_id) and not milterras.so_leitura(empresa_id))
  with check (milterras.eh_gestao(empresa_id) and not milterras.so_leitura(empresa_id) and milterras.empresa_liberada(empresa_id));

grant select, insert, update, delete on milterras.docs, milterras.acessos to authenticated;
grant select on milterras.colecoes, milterras.perfis to authenticated;
grant select, update (nome) on milterras.empresas to authenticated;
revoke all on milterras.convites, milterras.tentativas_login, milterras.plataforma_admins, milterras.atividade, milterras.suporte_visitas from anon, authenticated;

-- ---------- Tempo real ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'milterras' and tablename = 'docs') then
    alter publication supabase_realtime add table milterras.docs;
  end if;
end $$;

-- ---------- Coleções do segmento (src/js/segmento.js) ----------
insert into milterras.colecoes (nome, leitura, escrita, campo_ref, protegidos, trava) values ('produtos', 'todos', 'gestao', null, array[]::text[], null)
  on conflict (nome) do update set leitura = excluded.leitura, escrita = excluded.escrita, campo_ref = excluded.campo_ref, protegidos = excluded.protegidos, trava = excluded.trava;
insert into milterras.colecoes (nome, leitura, escrita, campo_ref, protegidos, trava) values ('custos', 'gestao', 'gestao', null, array[]::text[], null)
  on conflict (nome) do update set leitura = excluded.leitura, escrita = excluded.escrita, campo_ref = excluded.campo_ref, protegidos = excluded.protegidos, trava = excluded.trava;
insert into milterras.colecoes (nome, leitura, escrita, campo_ref, protegidos, trava) values ('clientes', 'proprio', 'proprio', 'id', array[]::text[], null)
  on conflict (nome) do update set leitura = excluded.leitura, escrita = excluded.escrita, campo_ref = excluded.campo_ref, protegidos = excluded.protegidos, trava = excluded.trava;
insert into milterras.colecoes (nome, leitura, escrita, campo_ref, protegidos, trava) values ('movs', 'proprio', 'gestao', 'clienteId', array[]::text[], null)
  on conflict (nome) do update set leitura = excluded.leitura, escrita = excluded.escrita, campo_ref = excluded.campo_ref, protegidos = excluded.protegidos, trava = excluded.trava;
insert into milterras.colecoes (nome, leitura, escrita, campo_ref, protegidos, trava) values ('vendas', 'proprio', 'proprio', 'clienteId', array[]::text[], null)
  on conflict (nome) do update set leitura = excluded.leitura, escrita = excluded.escrita, campo_ref = excluded.campo_ref, protegidos = excluded.protegidos, trava = excluded.trava;
insert into milterras.colecoes (nome, leitura, escrita, campo_ref, protegidos, trava) values ('fechamentos', 'proprio', 'proprio', 'clienteId', array[]::text[], null)
  on conflict (nome) do update set leitura = excluded.leitura, escrita = excluded.escrita, campo_ref = excluded.campo_ref, protegidos = excluded.protegidos, trava = excluded.trava;
insert into milterras.colecoes (nome, leitura, escrita, campo_ref, protegidos, trava) values ('pedidos', 'proprio', 'proprio', 'clienteId', array[]::text[], null)
  on conflict (nome) do update set leitura = excluded.leitura, escrita = excluded.escrita, campo_ref = excluded.campo_ref, protegidos = excluded.protegidos, trava = excluded.trava;
insert into milterras.colecoes (nome, leitura, escrita, campo_ref, protegidos, trava) values ('despesas', 'gestao', 'gestao', null, array[]::text[], null)
  on conflict (nome) do update set leitura = excluded.leitura, escrita = excluded.escrita, campo_ref = excluded.campo_ref, protegidos = excluded.protegidos, trava = excluded.trava;

-- ---------- Período de teste das empresas novas (segmento.js › diasTeste) ----------
alter table milterras.empresas alter column teste_ate set default (current_date + 30);

-- ---------- Administradores da plataforma ----------

-- ---------- Regras específicas do segmento (supabase/segmento.sql) ----------
-- Regras específicas da Mil Terras (gatilhos e funções). As coleções e as regras gerais de acesso
-- estão em src/js/segmento.js; aqui ficam só as regras extras do parceiro (app Mil Terras Parceiro).
--   • cadastro (clientes): o parceiro só muda equipe (garcons), preços de carta e a fila de pedido
--   • fechamentos: o parceiro só ENVIA (status "enviado"), um por vez, e não altera depois
--   • pedidos: o parceiro pede (status "solicitado") dentro do estoque disponível e só cancela o que ainda não foi aprovado
--   • estoque_disponivel(): o parceiro enxerga só este número (não as movimentações nem os custos)

create or replace function milterras.mt_regras_parceiro() returns trigger
language plpgsql security definer set search_path = milterras, public, extensions as $$
declare v_ref text; v_disp json; v_item jsonb; v_emp uuid := coalesce(new.empresa_id, old.empresa_id); v_col text := coalesce(new.colecao, old.colecao);
begin
  if v_col not in ('clientes', 'fechamentos', 'pedidos') then return coalesce(new, old); end if;
  if auth.uid() is null or milterras.eh_gestao(v_emp) then
    -- gestão desativou o parceiro: bloqueia o acesso dele (desconecta os aparelhos)
    if tg_op = 'UPDATE' and v_col = 'clientes' and coalesce((new.data->>'ativo')::boolean, true) = false and coalesce((old.data->>'ativo')::boolean, true) then
      update milterras.acessos set ativo = false where empresa_id = new.empresa_id and ref = new.id and ativo;
    end if;
    return coalesce(new, old);
  end if;
  v_ref := milterras.meu_ref(v_emp);
  -- o app grava com upsert: o INSERT de um registro que já existe vira UPDATE (as regras do UPDATE valem nele)
  if tg_op = 'INSERT' and exists (select 1 from milterras.docs where empresa_id = new.empresa_id and id = new.id) then return new; end if;
  -- reenvio sem mudança (fila do aparelho)
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then return new; end if;
  if v_col = 'clientes' then
    if tg_op <> 'UPDATE' then raise exception 'Somente a Mil Terras cadastra ou exclui parceiros'; end if;
    new.data := old.data || jsonb_build_object('garcons', coalesce(new.data->'garcons', old.data->'garcons'),
                                                'precosCarta', coalesce(new.data->'precosCarta', old.data->'precosCarta'),
                                                'filaPedido', coalesce(new.data->'filaPedido', '{}'::jsonb));
    return new;
  end if;
  if v_col = 'fechamentos' then
    if tg_op <> 'INSERT' then raise exception 'O fechamento enviado só pode ser alterado pela Mil Terras'; end if;
    if new.data->>'status' is distinct from 'enviado' or new.data->>'clienteId' is distinct from v_ref then raise exception 'Fechamento inválido'; end if;
    if exists (select 1 from milterras.docs where empresa_id = new.empresa_id and colecao = 'fechamentos' and ref = v_ref and data->>'status' = 'enviado' and id <> new.id) then
      raise exception 'Já existe um fechamento aguardando conferência';
    end if;
    return new;
  end if;
  -- pedidos
  if tg_op = 'UPDATE' then raise exception 'O pedido só pode ser alterado pela Mil Terras'; end if;
  if tg_op = 'DELETE' then
    if old.data->>'status' is distinct from 'solicitado' then raise exception 'Este pedido já foi analisado'; end if;
    return old;
  end if;
  if new.data->>'status' is distinct from 'solicitado' or new.data->>'clienteId' is distinct from v_ref then raise exception 'Pedido inválido'; end if;
  v_disp := milterras.estoque_disponivel();
  for v_item in select * from jsonb_array_elements(coalesce(new.data->'itens', '[]'::jsonb)) loop
    if (v_item->>'qtd')::int > coalesce((v_disp->>(v_item->>'produtoId'))::int, 0) then raise exception 'Quantidade acima do estoque disponível'; end if;
  end loop;
  return new;
end $$;
drop trigger if exists tg_mt_regras_parceiro on milterras.docs;
create trigger tg_mt_regras_parceiro before insert or update or delete on milterras.docs for each row execute function milterras.mt_regras_parceiro();

-- Estoque disponível para pedidos: saldo central menos o que já foi pedido e ainda não aprovado
create or replace function milterras.estoque_disponivel() returns json
language sql stable security definer set search_path = milterras, public, extensions as $$
  with d as (select colecao, data from milterras.docs where empresa_id = milterras.minha_empresa()),
  central as (
    select data->>'produtoId' pid, sum(case data->>'tipo'
      when 'entrada' then (data->>'qtd')::int when 'devolucao' then (data->>'qtd')::int when 'ajuste' then (data->>'qtd')::int
      when 'remessa' then -(data->>'qtd')::int when 'venda_direta' then -(data->>'qtd')::int when 'perda' then -(data->>'qtd')::int
      else 0 end) q
    from d where colecao = 'movs' group by 1
  ), reservado as (
    select i->>'produtoId' pid, (i->>'qtd')::int q from d, jsonb_array_elements(coalesce(d.data->'itens', '[]'::jsonb)) i where d.colecao = 'pedidos' and d.data->>'status' = 'solicitado'
    union all
    select i->>'produtoId', (i->>'qtd')::int from d, jsonb_array_elements(coalesce(d.data->'reposicao', '[]'::jsonb)) i where d.colecao = 'fechamentos' and d.data->>'status' = 'enviado'
  )
  select coalesce(json_object_agg(p.id, greatest(0, coalesce(c.q, 0) - coalesce((select sum(r.q) from reservado r where r.pid = p.id), 0))), '{}'::json)
  from milterras.docs p left join central c on c.pid = p.id
  where p.empresa_id = milterras.minha_empresa() and p.colecao = 'produtos' and auth.uid() is not null
$$;
revoke all on function milterras.estoque_disponivel() from public, anon;
grant execute on function milterras.estoque_disponivel() to authenticated;
revoke all on function milterras.mt_regras_parceiro() from public, anon, authenticated;


select 'Instalação concluída' as resultado;-- =====================================================================
-- Mil Terras › molde EasyAPP-Base — PASSO 3 (uma vez só): copia os dados das tabelas antigas
-- (milterras_antigo) para a empresa "Mil Terras" no formato do molde. Se a empresa já existir, não faz nada.
-- =====================================================================
do $$
declare v_emp uuid; v_dono uuid;
begin
  if exists (select 1 from milterras.empresas) then raise notice 'a pasta milterras já tem empresa: passo 3 ignorado'; return; end if;
  if not exists (select 1 from pg_tables where schemaname = 'milterras_antigo' and tablename = 'produtos') then raise notice 'sem tabelas antigas: passo 3 ignorado'; return; end if;
  select user_id into v_dono from milterras_antigo.perfis where papel = 'dono' order by criado_em limit 1;
  insert into milterras.empresas (nome, criado_por, plano, situacao, teste_ate, obs, criado_em)
  values (coalesce((select data->>'empresa' from milterras_antigo.config where id = 'geral'), 'Mil Terras'), v_dono, 'personalizado', 'ativa', current_date,
          'Migrada do app próprio da Mil Terras para o molde em ' || to_char(now(), 'DD/MM/YYYY'),
          coalesce((select min(criado_em) from milterras_antigo.perfis), now()))
  returning id into v_emp;

  -- não registrar a cópia como atividade de ninguém
  alter table milterras.docs disable trigger tg_atividade;
  alter table milterras.acessos disable trigger tg_atividade;
  alter table milterras.perfis disable trigger tg_atividade;

  -- administradores da plataforma (desenvolvedor): os mesmos dos outros apps da fábrica
  if exists (select 1 from pg_tables where schemaname = 'frota' and tablename = 'plataforma_admins') then
    insert into milterras.plataforma_admins (email) select email from frota.plataforma_admins on conflict do nothing;
  end if;

  -- quem entra na Gestão (dono e usuários); aparelhos de parceiros entram de novo com código + PIN.
  -- O desenvolvedor não fica como dono nem usuário (abre a empresa pela Plataforma); se ele era o dono,
  -- o usuário mais antigo passa a ser o dono.
  insert into milterras.perfis (user_id, empresa_id, papel, criado_em)
  select p.user_id, v_emp, p.papel, p.criado_em from milterras_antigo.perfis p join auth.users u on u.id = p.user_id
   where p.papel in ('dono', 'gestor') and lower(coalesce(u.email, '')) not in (select lower(email) from milterras.plataforma_admins);
  if not exists (select 1 from milterras.perfis where empresa_id = v_emp and papel = 'dono') then
    update milterras.perfis set papel = 'dono' where user_id = (select user_id from milterras.perfis where empresa_id = v_emp order by criado_em limit 1);
  end if;
  update milterras.empresas set criado_por = (select user_id from milterras.perfis where empresa_id = v_emp and papel = 'dono' limit 1) where id = v_emp;

  -- documentos
  insert into milterras.docs (empresa_id, id, colecao, data)
  select v_emp, 'geral', 'config', data - 'pinGestor' from milterras_antigo.config where id = 'geral';
  insert into milterras.docs (empresa_id, id, colecao, data) select v_emp, id, 'produtos', data - 'custo' from milterras_antigo.produtos;
  insert into milterras.docs (empresa_id, id, colecao, data)
  select v_emp, 'cu-' || p.id, 'custos', jsonb_build_object('id', 'cu-' || p.id, 'produtoId', p.id, 'custo', coalesce(c.custo, (p.data->>'custo')::numeric, 0))
    from milterras_antigo.produtos p left join milterras_antigo.custos c on c.id = p.id;
  insert into milterras.docs (empresa_id, id, colecao, data) select v_emp, id, 'clientes', data - 'pin' - 'codigo' from milterras_antigo.clientes;
  insert into milterras.docs (empresa_id, id, colecao, data) select v_emp, id, 'movs', data from milterras_antigo.movs;
  insert into milterras.docs (empresa_id, id, colecao, data) select v_emp, id, 'vendas', data from milterras_antigo.vendas;
  insert into milterras.docs (empresa_id, id, colecao, data) select v_emp, id, 'fechamentos', data from milterras_antigo.fechamentos;
  insert into milterras.docs (empresa_id, id, colecao, data) select v_emp, id, 'pedidos', data from milterras_antigo.pedidos;
  insert into milterras.docs (empresa_id, id, colecao, data) select v_emp, id, 'despesas', data from milterras_antigo.despesas;

  -- código + PIN dos parceiros (os mesmos de antes)
  insert into milterras.acessos (codigo, empresa_id, ref, nome, pin, ativo)
  select upper(data->>'codigo'), v_emp, id, data->>'nome', coalesce(nullif(data->>'pin', ''), lpad(floor(random() * 10000)::text, 4, '0')), coalesce((data->>'ativo')::boolean, true)
    from milterras_antigo.clientes where coalesce(data->>'codigo', '') <> '';

  -- convites de gestor ainda válidos
  insert into milterras.convites (codigo, empresa_id, nome, criado_por, criado_em, expira_em)
  select codigo, v_emp, nome, criado_por, criado_em, expira_em from milterras_antigo.convites where usado_por is null and expira_em > now();

  -- histórico (registro de atividades)
  insert into milterras.atividade (empresa_id, em, user_id, papel, quem, ref, acao, colecao, registro, antes, depois)
  select v_emp, em, user_id, case when papel = 'parceiro' then 'usuario' else papel end, quem, cliente_id, acao, tabela, registro, antes, depois
    from milterras_antigo.atividade order by em;

  alter table milterras.docs enable trigger tg_atividade;
  alter table milterras.acessos enable trigger tg_atividade;
  alter table milterras.perfis enable trigger tg_atividade;

  -- painel da fábrica: Mil Terras agora é multiempresa, com a Gestão em /gestao/
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'fabrica_apps') then
    update public.fabrica_apps set multiempresa = true, url_gestao = replace(url_gestao, '/gestor/', '/gestao/') where pasta = 'milterras';
  end if;
  -- aviso por push quando alguém entra (a tabela atividade é nova)
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fabrica_avisar_acesso') then
    drop trigger if exists tg_fabrica_aviso on milterras.atividade;
    create trigger tg_fabrica_aviso after insert on milterras.atividade for each row execute function public.fabrica_avisar_acesso();
  end if;
  raise notice 'Mil Terras migrada: empresa %', v_emp;
end $$;

select (select count(*) from milterras.docs) documentos, (select count(*) from milterras.acessos) acessos_parceiros,
       (select count(*) from milterras.perfis) pessoas_gestao, (select count(*) from milterras.atividade) historico;
