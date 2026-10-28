-- Mil Terras — banco na nuvem (Supabase / PostgreSQL)
-- Fase 2: substitui o armazenamento local (src/js/core/store.js) para que Gestão e Parceiros
-- compartilhem os dados em tempo real, de qualquer aparelho.
--
-- Segurança: Row Level Security (RLS). O gestor (perfil 'gestor') vê tudo; cada parceiro
-- (perfil 'parceiro') só lê o próprio estabelecimento, registra as próprias vendas e envia
-- os próprios fechamentos. Aprovação, remessas, estoque central e financeiro são só do gestor.

create extension if not exists pgcrypto;

-- ---------- Cadastros ----------
create table produtos (
  id text primary key,
  nome text not null,
  tipo text not null check (tipo in ('Tinto','Branco','Rosé','Espumante')),
  regiao text, classificacao text, uvas text, teor text, safra int, servir text,
  descricao text, harmonizacao text, foto text,
  preco numeric(10,2) not null,            -- preço de tabela p/ o parceiro
  custo numeric(10,2) not null default 0,  -- custo de aquisição (só gestor)
  preco_carta numeric(10,2),               -- sugestão de preço na carta
  estoque_min int not null default 24,
  ativo boolean not null default true
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null, tipo text, cidade text, regiao text,
  contato text, telefone text, email text, cnpj text,
  formas_pagamento text[] not null default '{PIX}',
  forma_padrao text not null default 'PIX',
  prazo_dias int not null default 7,
  ciclo_dias int not null default 15,
  codigo text unique not null,
  ativo boolean not null default true,
  desde date not null default current_date
);

create table garcons (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null, ativo boolean not null default true
);

create table precos_carta (
  cliente_id uuid references clientes(id) on delete cascade,
  produto_id text references produtos(id),
  preco numeric(10,2) not null,
  primary key (cliente_id, produto_id)
);

-- Usuários do Supabase Auth ligados a um perfil
create table perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel text not null check (papel in ('gestor','parceiro')),
  cliente_id uuid references clientes(id)
);

-- ---------- Movimentos ----------
-- Saldo central e saldo consignado são somas destes movimentos (ver views abaixo)
create table movimentos (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  tipo text not null check (tipo in ('entrada','remessa','devolucao','consumo','venda_direta','perda','ajuste')),
  produto_id text not null references produtos(id),
  qtd int not null,
  cliente_id uuid references clientes(id),
  custo_unit numeric(10,2), preco_unit numeric(10,2),
  fechamento_id uuid, obs text,
  criado_em timestamptz not null default now(), criado_por uuid default auth.uid()
);

create table vendas (  -- registro de vendas feito pelo parceiro (alimenta relatórios por vinho/garçom)
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  produto_id text not null references produtos(id),
  garcom_id uuid references garcons(id),
  qtd int not null default 1,
  preco_carta numeric(10,2) not null, preco numeric(10,2) not null,
  data date not null default current_date, hora time default localtime,
  criado_em timestamptz not null default now()
);

create table fechamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  inicio date not null, fim date not null,
  status text not null default 'enviado' check (status in ('rascunho','enviado','aprovado','pago')),
  criado_por text not null default 'cliente',
  total numeric(12,2) not null default 0, garrafas int not null default 0,
  forma_pagamento text, obs text,
  enviado_em date, aprovado_em date, vencimento date, pago_em date
);

create table fechamento_itens (
  fechamento_id uuid references fechamentos(id) on delete cascade,
  produto_id text references produtos(id),
  saldo_anterior int not null, contagem int not null, vendido int not null,
  registrado int not null default 0, preco numeric(10,2) not null,
  primary key (fechamento_id, produto_id)
);

create table fechamento_reposicao (
  fechamento_id uuid references fechamentos(id) on delete cascade,
  produto_id text references produtos(id),
  qtd_solicitada int not null, qtd_enviada int,
  primary key (fechamento_id, produto_id)
);

create table despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null, categoria text not null, descricao text, valor numeric(12,2) not null, pago boolean default true
);

-- ---------- Views de saldo ----------
create view v_estoque_central as
select p.id produto_id, coalesce(sum(case m.tipo
  when 'entrada' then m.qtd when 'devolucao' then m.qtd when 'ajuste' then m.qtd
  when 'remessa' then -m.qtd when 'venda_direta' then -m.qtd when 'perda' then -m.qtd else 0 end),0) saldo
from produtos p left join movimentos m on m.produto_id = p.id group by p.id;

create view v_consignado as
select cliente_id, produto_id, sum(case tipo when 'remessa' then qtd when 'devolucao' then -qtd when 'consumo' then -qtd else 0 end) saldo
from movimentos where cliente_id is not null group by cliente_id, produto_id;

-- ---------- RLS ----------
create function eh_gestor() returns boolean language sql stable security definer as
$$ select exists (select 1 from perfis where user_id = auth.uid() and papel = 'gestor') $$;
create function meu_cliente() returns uuid language sql stable security definer as
$$ select cliente_id from perfis where user_id = auth.uid() $$;

alter table produtos enable row level security;
alter table clientes enable row level security;
alter table garcons enable row level security;
alter table precos_carta enable row level security;
alter table movimentos enable row level security;
alter table vendas enable row level security;
alter table fechamentos enable row level security;
alter table fechamento_itens enable row level security;
alter table fechamento_reposicao enable row level security;
alter table despesas enable row level security;
alter table perfis enable row level security;

create policy gestor_tudo_produtos on produtos for all using (eh_gestor()) with check (eh_gestor());
create policy parceiro_le_produtos on produtos for select using (ativo);           -- custo deve ser ocultado via view pública
create policy gestor_tudo_clientes on clientes for all using (eh_gestor()) with check (eh_gestor());
create policy parceiro_le_cliente on clientes for select using (id = meu_cliente());
create policy gestor_tudo_garcons on garcons for all using (eh_gestor()) with check (eh_gestor());
create policy parceiro_garcons on garcons for all using (cliente_id = meu_cliente()) with check (cliente_id = meu_cliente());
create policy gestor_tudo_precos on precos_carta for all using (eh_gestor()) with check (eh_gestor());
create policy parceiro_precos on precos_carta for all using (cliente_id = meu_cliente()) with check (cliente_id = meu_cliente());
create policy gestor_tudo_mov on movimentos for all using (eh_gestor()) with check (eh_gestor());
create policy parceiro_le_mov on movimentos for select using (cliente_id = meu_cliente());
create policy gestor_le_vendas on vendas for select using (eh_gestor());
create policy parceiro_vendas on vendas for all using (cliente_id = meu_cliente()) with check (cliente_id = meu_cliente());
create policy gestor_tudo_fech on fechamentos for all using (eh_gestor()) with check (eh_gestor());
create policy parceiro_le_fech on fechamentos for select using (cliente_id = meu_cliente());
create policy parceiro_envia_fech on fechamentos for insert with check (cliente_id = meu_cliente() and status = 'enviado');
create policy gestor_tudo_itens on fechamento_itens for all using (eh_gestor()) with check (eh_gestor());
create policy parceiro_itens on fechamento_itens for all using (exists (select 1 from fechamentos f where f.id = fechamento_id and f.cliente_id = meu_cliente() and f.status = 'enviado'));
create policy gestor_tudo_repo on fechamento_reposicao for all using (eh_gestor()) with check (eh_gestor());
create policy parceiro_repo on fechamento_reposicao for all using (exists (select 1 from fechamentos f where f.id = fechamento_id and f.cliente_id = meu_cliente() and f.status = 'enviado'));
create policy gestor_despesas on despesas for all using (eh_gestor()) with check (eh_gestor());
create policy perfil_proprio on perfis for select using (user_id = auth.uid() or eh_gestor());

-- Tempo real: Gestão recebe na hora o fechamento enviado; Parceiro recebe a aprovação
alter publication supabase_realtime add table fechamentos, vendas, movimentos;
