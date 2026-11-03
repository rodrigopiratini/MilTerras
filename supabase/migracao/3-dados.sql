-- =====================================================================
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

  -- quem entra na Gestão (dono e gestores); aparelhos de parceiros entram de novo com código + PIN
  insert into milterras.perfis (user_id, empresa_id, papel, criado_em)
  select user_id, v_emp, papel, criado_em from milterras_antigo.perfis where papel in ('dono', 'gestor');

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

  -- administradores da plataforma: os mesmos dos outros apps da fábrica
  if exists (select 1 from pg_tables where schemaname = 'frota' and tablename = 'plataforma_admins') then
    insert into milterras.plataforma_admins (email) select email from frota.plataforma_admins on conflict do nothing;
  end if;

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
