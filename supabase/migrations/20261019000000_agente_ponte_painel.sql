-- Conexão do WhatsApp do estoque pela tela, no lugar do terminal da VPS.
--
-- agente_ponte: uma linha só. A ponte grava como está a cada 5 s (conectada,
-- esperando leitura do QR, parada) e leva o comando que a tela deixou.
-- Comando com mais de 2 minutos é descartado: a ponte estava fora e quem
-- clicou já desistiu.
--
-- O QR liga o WhatsApp do estoque em qualquer aparelho, então a tabela não
-- tem política nenhuma: só as funções abaixo leem e gravam, e a da tela exige
-- admin ou master.
--
-- agente_mensagens.tentativas: mensagem que falhou volta para a fila e é
-- tentada de novo (até 4 vezes, uma por minuto) em vez de virar falha na
-- primeira.

create table if not exists public.agente_ponte (
  id smallint primary key default 1 check (id = 1),
  status text,
  qr text,
  codigo text,
  telefone text,
  versao text,
  detalhe text,
  atualizado_em timestamptz,
  fora_desde timestamptz,
  comando text check (comando in ('reconectar', 'desconectar', 'codigo')),
  comando_numero text,
  comando_em timestamptz,
  comando_por uuid
);
alter table public.agente_ponte enable row level security;
insert into public.agente_ponte (id) values (1) on conflict do nothing;

alter table public.agente_mensagens add column if not exists tentativas smallint not null default 0;

-- Chamada pela função agente-whatsapp (?acao=estado) com o que a ponte mandou.
create or replace function public.fn_agente_ponte_sinal(p_estado jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text := coalesce(p_estado->>'status', 'desconhecido');
  v_cmd text; v_num text; v_em timestamptz;
begin
  insert into agente_ponte (id) values (1) on conflict do nothing;
  select comando, comando_numero, comando_em into v_cmd, v_num, v_em from agente_ponte where id = 1 for update;
  update agente_ponte set
    fora_desde = case when v_status = 'conectado' then null
                      when status = 'conectado' or fora_desde is null then now()
                      else fora_desde end,
    status = v_status,
    qr = p_estado->>'qr',
    codigo = p_estado->>'codigo',
    telefone = coalesce(p_estado->>'telefone', telefone),
    versao = p_estado->>'versao',
    detalhe = p_estado->>'detalhe',
    atualizado_em = now(),
    comando = null, comando_numero = null
  where id = 1;
  if v_cmd is null or v_em < now() - interval '2 minutes' then
    return jsonb_build_object('comando', null);
  end if;
  return jsonb_build_object('comando', v_cmd, 'numero', v_num);
end
$function$;

revoke all on function public.fn_agente_ponte_sinal(jsonb) from public, anon, authenticated;
grant execute on function public.fn_agente_ponte_sinal(jsonb) to service_role;

create or replace function public.fn_agente_ponte_eh_gestor()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce((select nivel in ('admin', 'master') from usuarios_sistema where id = fn_usuario_sistema_id()), false)
$function$;

-- Tela "WhatsApp do estoque". Sem sinal há mais de 45 s, a ponte está fora
-- (VPS desligada, serviço parado) e o QR guardado não vale mais.
create or replace function public.fn_agente_ponte_tela()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  r agente_ponte;
  v_sem_sinal boolean;
begin
  if not fn_agente_ponte_eh_gestor() then
    raise exception 'Só admin ou master mexe na conexão do WhatsApp.';
  end if;
  select * into r from agente_ponte where id = 1;
  v_sem_sinal := r.atualizado_em is null or r.atualizado_em < now() - interval '45 seconds';
  return jsonb_build_object(
    'status', case when v_sem_sinal then 'sem_sinal' else r.status end,
    'qr', case when v_sem_sinal then null else r.qr end,
    'codigo', case when v_sem_sinal then null else r.codigo end,
    'telefone', r.telefone,
    'versao', r.versao,
    'detalhe', r.detalhe,
    'sinal_em', r.atualizado_em,
    'fora_desde', case when v_sem_sinal and r.status = 'conectado' then r.atualizado_em
                       when v_sem_sinal then coalesce(r.fora_desde, r.atualizado_em)
                       else r.fora_desde end,
    'comando', case when r.comando_em >= now() - interval '2 minutes' then r.comando end,
    'fila', (select jsonb_build_object(
               'pendentes', count(*) filter (where status = 'pendente_envio'),
               'mais_antiga', min(criado_em) filter (where status = 'pendente_envio'),
               'falhas_24h', count(*) filter (where status = 'falha_envio' and criado_em > now() - interval '24 hours'))
             from agente_mensagens
             where direcao = 'saida' and status in ('pendente_envio', 'falha_envio'))
  );
end
$function$;

create or replace function public.fn_agente_ponte_comando(p_comando text, p_numero text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_num text := nullif(regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'), '');
begin
  if not fn_agente_ponte_eh_gestor() then
    raise exception 'Só admin ou master mexe na conexão do WhatsApp.';
  end if;
  if p_comando not in ('reconectar', 'desconectar', 'codigo') then
    raise exception 'Comando inválido: %', p_comando;
  end if;
  if p_comando = 'codigo' then
    if v_num is null or length(v_num) < 10 then
      raise exception 'Informe o número do chip com DDD.';
    end if;
    if length(v_num) <= 11 then v_num := '55' || v_num; end if;
  else
    v_num := null;
  end if;
  insert into agente_ponte (id) values (1) on conflict do nothing;
  update agente_ponte
     set comando = p_comando, comando_numero = v_num, comando_em = now(), comando_por = fn_usuario_sistema_id()
   where id = 1;
  return jsonb_build_object('ok', true, 'comando', p_comando);
end
$function$;

revoke all on function public.fn_agente_ponte_eh_gestor() from public, anon;
revoke all on function public.fn_agente_ponte_tela() from public, anon;
revoke all on function public.fn_agente_ponte_comando(text, text) from public, anon;
grant execute on function public.fn_agente_ponte_eh_gestor() to authenticated;
grant execute on function public.fn_agente_ponte_tela() to authenticated;
grant execute on function public.fn_agente_ponte_comando(text, text) to authenticated;
