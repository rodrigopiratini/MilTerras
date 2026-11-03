-- Regras específicas da Mil Terras (gatilhos e funções). As coleções e as regras gerais de acesso
-- estão em src/js/segmento.js; aqui ficam só as regras extras do parceiro (app Mil Terras Parceiro).
--   • cadastro (clientes): o parceiro só muda equipe (garcons), preços de carta e a fila de pedido
--   • fechamentos: o parceiro só ENVIA (status "enviado"), um por vez, e não altera depois
--   • pedidos: o parceiro pede (status "solicitado") dentro do estoque disponível e só cancela o que ainda não foi aprovado
--   • estoque_disponivel(): o parceiro enxerga só este número (não as movimentações nem os custos)

create or replace function public.mt_regras_parceiro() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ref text; v_disp json; v_item jsonb; v_emp uuid := coalesce(new.empresa_id, old.empresa_id); v_col text := coalesce(new.colecao, old.colecao);
begin
  if v_col not in ('clientes', 'fechamentos', 'pedidos') then return coalesce(new, old); end if;
  if auth.uid() is null or public.eh_gestao(v_emp) then
    -- gestão desativou o parceiro: bloqueia o acesso dele (desconecta os aparelhos)
    if tg_op = 'UPDATE' and v_col = 'clientes' and coalesce((new.data->>'ativo')::boolean, true) = false and coalesce((old.data->>'ativo')::boolean, true) then
      update public.acessos set ativo = false where empresa_id = new.empresa_id and ref = new.id and ativo;
    end if;
    return coalesce(new, old);
  end if;
  v_ref := public.meu_ref(v_emp);
  -- o app grava com upsert: o INSERT de um registro que já existe vira UPDATE (as regras do UPDATE valem nele)
  if tg_op = 'INSERT' and exists (select 1 from public.docs where empresa_id = new.empresa_id and id = new.id) then return new; end if;
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
    if exists (select 1 from public.docs where empresa_id = new.empresa_id and colecao = 'fechamentos' and ref = v_ref and data->>'status' = 'enviado' and id <> new.id) then
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
  v_disp := public.estoque_disponivel();
  for v_item in select * from jsonb_array_elements(coalesce(new.data->'itens', '[]'::jsonb)) loop
    if (v_item->>'qtd')::int > coalesce((v_disp->>(v_item->>'produtoId'))::int, 0) then raise exception 'Quantidade acima do estoque disponível'; end if;
  end loop;
  return new;
end $$;
drop trigger if exists tg_mt_regras_parceiro on public.docs;
create trigger tg_mt_regras_parceiro before insert or update or delete on public.docs for each row execute function public.mt_regras_parceiro();

-- Estoque disponível para pedidos: saldo central menos o que já foi pedido e ainda não aprovado
create or replace function public.estoque_disponivel() returns json
language sql stable security definer set search_path = public as $$
  with d as (select colecao, data from public.docs where empresa_id = public.minha_empresa()),
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
  from public.docs p left join central c on c.pid = p.id
  where p.empresa_id = public.minha_empresa() and p.colecao = 'produtos' and auth.uid() is not null
$$;
revoke all on function public.estoque_disponivel() from public, anon;
grant execute on function public.estoque_disponivel() to authenticated;
revoke all on function public.mt_regras_parceiro() from public, anon, authenticated;
