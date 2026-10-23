-- Numero de fora (cliente) escrevendo no WhatsApp do agente: o robo nao
-- atende. Aqui se decide a resposta automatica (no maximo uma a cada 12 h),
-- registra na ficha da garrafa do Clube do Whisky e avisa quem responde os
-- clientes (agente_config.clientes_responsavel, uma pessoa da equipe).

insert into public.agente_config (chave, valor)
select 'clientes_resposta', to_jsonb(convert_from(decode(
  'T2zDoSEgRXN0ZSBuw7ptZXJvIGVudmlhIHPDsyBhdmlzb3MgYXV0b23DoXRpY29zIGRvIERpdGFkbyBQb3B1bGFyLiBQYXJhIGZhbGFyIGNvbSBhIGdlbnRlLCBjaGFtZSBubyBXaGF0c0FwcCAoNjUpIDQxNDEtMzY1NS4g8J+lgw==',
  'base64'), 'UTF8'))
where not exists (select 1 from public.agente_config where chave = 'clientes_resposta');

insert into public.agente_config (chave, valor)
select 'clientes_whatsapp_casa', to_jsonb('6541413655'::text)
where not exists (select 1 from public.agente_config where chave = 'clientes_whatsapp_casa');

insert into public.agente_config (chave, valor)
select 'clientes_responsavel', to_jsonb('9ff44074-92fc-432a-8636-e95d9ca12aac'::text)
where not exists (select 1 from public.agente_config where chave = 'clientes_responsavel');

create or replace function public.fn_agente_cliente_escreveu(p_telefone text, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_fim text := right(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), 8);
  v_texto text := left(btrim(coalesce(p_texto, '')), 500);
  v_resp agente_equipe;
  v_casa text := (select valor #>> '{}' from agente_config where chave = 'clientes_whatsapp_casa');
  v_resposta text := (select valor #>> '{}' from agente_config where chave = 'clientes_resposta');
  v_nome text;
  v_garrafas text;
  v_responder boolean;
  v_aviso text;
  v_fmt text;
  v_casafmt text;
begin
  if length(v_fim) < 8 then return jsonb_build_object('responder', false); end if;
  -- Alguem da equipe (inativo ou fora do modo so_dono) nao e cliente.
  if exists (select 1 from agente_equipe where right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_fim) then
    return jsonb_build_object('responder', false);
  end if;

  select min(g.nome), string_agg(initcap(btrim(regexp_replace(regexp_replace(g.garrafa_nome, '\s+GF\s*$', '', 'i'), '\s+', ' ', 'g'))) || U&', vale at\00E9 ' || to_char(g.validade, 'DD/MM'), '; ')
    into v_nome, v_garrafas
    from clube_whisky_garrafas g
   where g.status = 'ativa' and right(regexp_replace(coalesce(g.telefone, ''), '\D', '', 'g'), 8) = v_fim;
  if v_nome is null then
    select nome into v_nome from fidelidade_clientes where right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = v_fim limit 1;
  end if;

  insert into clube_whisky_historico (garrafa_id, tipo, texto, por_nome)
  select g.id, 'resposta', 'Cliente escreveu no WhatsApp: ' || coalesce(nullif(v_texto, ''), '(sem texto)'), 'Cliente'
    from clube_whisky_garrafas g
   where g.status = 'ativa' and right(regexp_replace(coalesce(g.telefone, ''), '\D', '', 'g'), 8) = v_fim;

  v_responder := v_resposta is not null and not exists (
    select 1 from agente_mensagens where direcao = 'saida' and telefone = v_tel and uso ->> 'auto_cliente' = 'true'
       and criado_em > now() - interval '12 hours');

  -- Avisa quem responde os clientes; no maximo um aviso a cada 30 min por cliente.
  select * into v_resp from agente_equipe
   where id::text = (select valor #>> '{}' from agente_config where chave = 'clientes_responsavel') and ativo;
  if v_resp.id is not null and v_resp.telefone is not null and not exists (
       select 1 from agente_mensagens where equipe_id = v_resp.id and direcao = 'saida' and uso ->> 'cliente_tel' = v_tel
          and criado_em > now() - interval '30 minutes') then
    v_fmt := case when length(v_tel) >= 12 and left(v_tel, 2) = '55' then substr(v_tel, 3) else v_tel end;
    v_casafmt := case when length(v_casa) >= 10 then '(' || left(v_casa, 2) || ') ' || substr(v_casa, 3, length(v_casa) - 6) || '-' || right(v_casa, 4) else v_casa end;
    v_fmt := '(' || left(v_fmt, 2) || ') ' || substr(v_fmt, 3, length(v_fmt) - 6) || '-' || right(v_fmt, 4);
    v_aviso := convert_from(decode('8J+TqSA=', 'base64'), 'UTF8') || 'Um cliente escreveu no WhatsApp de avisos.' || chr(10)
      || 'Cliente: ' || coalesce(v_nome, 'sem cadastro') || ' ' || v_fmt || chr(10)
      || coalesce('Clube do Whisky: ' || v_garrafas || chr(10), '')
      || 'Mensagem: "' || coalesce(nullif(v_texto, ''), '(sem texto)') || '"' || chr(10) || chr(10)
      || U&'Ele recebeu a resposta autom\00E1tica com o WhatsApp da casa'
      || coalesce(' ' || v_casafmt, '') || '. Responda por l' || U&'\00E1' || ': https://wa.me/'
      || case when left(v_tel, 2) = '55' then v_tel else '55' || v_tel end;
    insert into agente_mensagens (equipe_id, telefone, direcao, tipo, texto, status, uso)
    values (v_resp.id, v_resp.telefone, 'saida', 'texto', v_aviso, 'pendente_envio',
            jsonb_build_object('cliente_tel', v_tel, 'aviso_cliente', true));
  end if;

  return jsonb_build_object('responder', v_responder, 'resposta', v_resposta, 'nome', v_nome);
end $function$;

revoke execute on function public.fn_agente_cliente_escreveu(text, text) from public, anon, authenticated;
