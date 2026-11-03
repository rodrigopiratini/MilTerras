-- Mil Terras — depois da mudança para a pasta milterras: apaga as funções antigas que ficaram em "public".
-- Rode por último (passo 3), depois do instalar.sql. Seguro: só apaga funções da Mil Terras que ninguém mais usa.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(array[
    'eh_gestor','eh_dono','meu_cliente','tocar_updated_at','proteger_cliente','proteger_fechamento','estoque_disponivel','proteger_pedido',
    'vincular_parceiro','tornar_gestor','criar_convite','equipe','remover_gestor','cancelar_convite','meu_perfil','atividade_autor',
    'registrar_atividade','registrar_acesso','atividade_log']) loop
    execute 'drop function ' || r.f;
  end loop;
end $$;
select count(*) as "funções da Mil Terras que sobraram em public (esperado 0)" from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('eh_gestor','meu_perfil','vincular_parceiro','tornar_gestor','registrar_atividade');
