-- Clube do Whisky: imagem propria para o aviso de vencimento
-- (agente_config.clube_imagem_vencimento_url); clube_imagem_url fica sendo
-- a da boas-vindas.

create or replace function public.fn_clube_whisky_config()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'modelo_boas_vindas', (select valor #>> '{}' from agente_config where chave = 'clube_modelo_boas_vindas'),
    'modelo_vencimento', (select valor #>> '{}' from agente_config where chave = 'clube_modelo'),
    'imagem_url', (select valor #>> '{}' from agente_config where chave = 'clube_imagem_url'),
    'imagem_vencimento_url', (select valor #>> '{}' from agente_config where chave = 'clube_imagem_vencimento_url'),
    'pode_editar', fn_usuario_sistema_id()::text in (
      select jsonb_array_elements_text(coalesce((select valor from configuracoes_sistema where chave = 'portal_gestores'), '[]')::jsonb)))
  where auth.uid() is not null;
$function$;

create or replace function public.fn_clube_whisky_config_salvar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record;
begin
  if coalesce(fn_usuario_sistema_id()::text, '') not in (
       select jsonb_array_elements_text(coalesce((select valor from configuracoes_sistema where chave = 'portal_gestores'), '[]')::jsonb)) then
    raise exception 'So o gestor muda as mensagens do Clube.';
  end if;
  for r in select * from (values ('modelo_boas_vindas', 'clube_modelo_boas_vindas'), ('modelo_vencimento', 'clube_modelo'),
                                 ('imagem_url', 'clube_imagem_url'), ('imagem_vencimento_url', 'clube_imagem_vencimento_url')) v(campo, chave) loop
    if p ? r.campo then
      insert into agente_config (chave, valor, atualizado_em)
      values (r.chave, coalesce(to_jsonb(nullif(btrim(p ->> r.campo), '')), 'null'::jsonb), now())
      on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
    end if;
  end loop;
  return fn_clube_whisky_config();
end $function$;
