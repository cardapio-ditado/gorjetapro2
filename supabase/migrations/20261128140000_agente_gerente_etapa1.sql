-- Agente do gerente, etapa 1 (Kadu, 28/11/2026): o Gilberto (papel gerente_noite) continua com o estoque e ganha,
-- no mesmo número do agente, reservas (consultar, confirmar ou recusar pré-reserva) e o Livro da Noite (registrar
-- ocorrência). Resumo da noite todo dia às 16h (Cuiabá) para quem tem o papel na configuração resumo_gerente.
-- Tudo grava em nome de quem pediu, em agente_gerente_log. Nada de financeiro.

insert into agente_permissoes (papel, acao, modo) values
  ('gerente_noite', 'reservas', 'direto'), ('gerente_noite', 'livro', 'direto'),
  ('dono', 'reservas', 'direto'), ('dono', 'livro', 'direto')
on conflict do nothing;

insert into agente_config (chave, valor) values
  ('resumo_gerente', '{"ativo": true, "papeis": ["gerente_noite"]}'::jsonb)
on conflict (chave) do nothing;

create table if not exists public.agente_gerente_log (
  id bigint generated always as identity primary key,
  equipe_id uuid not null references agente_equipe(id),
  pessoa_nome text not null,
  operacao text not null,
  args jsonb not null default '{}'::jsonb,
  resultado jsonb,
  criado_em timestamptz not null default now()
);
alter table public.agente_gerente_log enable row level security;
revoke all on public.agente_gerente_log from anon, authenticated;

-- Reservas de um dia (sem as recusadas e canceladas), pré-reservas pendentes de hoje em diante, eventos, extras e shows.
create or replace function public.fn_agente_gerente_noite(p_data date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'data', p_data,
    'reservas', coalesce((
      select jsonb_agg(r order by r->>'horario', r->>'nome') from (
        select jsonb_build_object('reserva_id', id, 'nome', nome_cliente, 'horario', to_char(horario, 'HH24:MI'),
                 'pessoas', numero_pessoas, 'local', local_bar, 'obs', nullif(btrim(coalesce(observacoes, '')), ''),
                 'situacao', situacao, 'pelo_link', origem = 'link') r
          from reservas_normais where data_reserva = p_data and situacao <> 'recusada'
        union all
        select jsonb_build_object('nome', nome_cliente, 'horario', left(horario, 5), 'pessoas', numero_pessoas,
                 'local', 'Mesa', 'obs', nullif(btrim(coalesce(observacoes, '')), ''), 'situacao', 'confirmada')
          from reservas_mesas where data_reserva = p_data and coalesce(status, '') <> 'cancelada') x), '[]'::jsonb),
    'pre_reservas_pendentes', coalesce((
      select jsonb_agg(jsonb_build_object('reserva_id', id, 'nome', nome_cliente, 'dia', to_char(data_reserva, 'DD/MM'),
               'horario', to_char(horario, 'HH24:MI'), 'pessoas', numero_pessoas, 'local', local_bar,
               'obs', nullif(btrim(coalesce(observacoes, '')), '')) order by data_reserva, horario)
        from reservas_normais where situacao = 'pre_reserva' and data_reserva >= fn_livro_data_noite()), '[]'::jsonb),
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome_evento, 'pessoas', quantidade_pessoas, 'hora', to_char(horario_inicio, 'HH24:MI'))
               order by horario_inicio)
        from eventos_fechados where data_evento = p_data), '[]'::jsonb),
    'extras', coalesce((
      select jsonb_agg(jsonb_build_object('nome', coalesce(p.nome, f.nome), 'funcao', f.funcao_temporaria, 'setor', f.setor,
               'presenca', f.presenca) order by f.setor, coalesce(p.nome, f.nome))
        from extras_freelancers f left join extras_pessoas p on p.id = f.pessoa_id
       where f.data_trabalho = p_data and coalesce(f.status_pagamento, '') <> 'cancelado' and f.presenca is distinct from 'faltou'), '[]'::jsonb),
    'shows', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'inicio', to_char(horario_inicio, 'HH24:MI'), 'fim', to_char(horario_fim, 'HH24:MI'))
               order by horario_inicio)
        from musicos where data_evento = p_data), '[]'::jsonb)
  )
$$;

-- Texto do resumo da noite (WhatsApp). A primeira linha vira a prévia do aviso quando a pessoa está fora da janela.
create or replace function public.fn_agente_gerente_resumo_texto(p_data date default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_d date := coalesce(p_data, fn_livro_data_noite());
  v jsonb := fn_agente_gerente_noite(v_d);
  v_dia text := (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow from v_d)::int + 1];
  t text; x jsonb; n_res int; n_pes int;
begin
  t := 'Resumo da noite de ' || v_dia || ' ' || to_char(v_d, 'DD/MM') || E'\n';
  select count(*), coalesce(sum((r->>'pessoas')::int), 0) into n_res, n_pes
    from jsonb_array_elements(v->'reservas') r where r->>'situacao' = 'confirmada';

  t := t || E'\n*Reservas confirmadas* (' || n_res || ', ' || n_pes || ' pessoas)';
  if n_res = 0 then t := t || E'\n• nenhuma'; end if;
  for x in select r from jsonb_array_elements(v->'reservas') r where r->>'situacao' = 'confirmada' loop
    t := t || E'\n• ' || coalesce(x->>'horario', '?') || ' ' || coalesce(x->>'nome', '?') || ', ' || coalesce(x->>'pessoas', '?') || ' pessoas'
           || coalesce(' · ' || nullif(x->>'local', ''), '') || coalesce(' · ' || (x->>'obs'), '');
  end loop;

  if jsonb_array_length(v->'pre_reservas_pendentes') > 0 then
    t := t || E'\n\n*Pré-reservas esperando resposta* (' || jsonb_array_length(v->'pre_reservas_pendentes') || ')';
    for x in select r from jsonb_array_elements(v->'pre_reservas_pendentes') r loop
      t := t || E'\n• ' || (x->>'dia') || ' ' || coalesce(x->>'horario', '?') || ' ' || coalesce(x->>'nome', '?') || ', '
             || coalesce(x->>'pessoas', '?') || ' pessoas';
    end loop;
    t := t || E'\nResponda "confirmar" ou "recusar" com o nome que eu faço.';
  end if;

  if jsonb_array_length(v->'eventos') > 0 then
    t := t || E'\n\n*Eventos*';
    for x in select r from jsonb_array_elements(v->'eventos') r loop
      t := t || E'\n• ' || coalesce(x->>'hora' || ' ', '') || coalesce(x->>'nome', '?') || coalesce(', ' || (x->>'pessoas') || ' pessoas', '');
    end loop;
  end if;

  t := t || E'\n\n*Extras escalados* (' || jsonb_array_length(v->'extras') || ')';
  if jsonb_array_length(v->'extras') = 0 then t := t || E'\n• nenhum'; end if;
  for x in select r from jsonb_array_elements(v->'extras') r loop
    t := t || E'\n• ' || coalesce(x->>'nome', '?') || coalesce(' · ' || nullif(x->>'funcao', ''), '');
  end loop;
  if jsonb_array_length(v->'extras') > 0 and v_d >= (select inicio from extras_ponto_config) then
    t := t || E'\nLembre de mandar o link do ponto pelo Portal do Gerente.';
  end if;

  t := t || E'\n\n*Shows*';
  if jsonb_array_length(v->'shows') = 0 then t := t || E'\n• nenhum'; end if;
  for x in select r from jsonb_array_elements(v->'shows') r loop
    t := t || E'\n• ' || coalesce(x->>'inicio', '?') || coalesce(' às ' || (x->>'fim'), '') || ' ' || coalesce(x->>'nome', '?');
  end loop;
  return t;
end $$;

-- Operações do gerente pelo agente. Confere o papel; escrita respeita o modo ensaio e fica no log em nome da pessoa.
create or replace function public.fn_agente_gerente(p_pessoa uuid, p_op text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_e agente_equipe;
  v_acao text := case when p_op in ('noite', 'resumo', 'responder_reserva') then 'reservas'
                      when p_op in ('livro', 'registrar_ocorrencia') then 'livro' end;
  v_ensaio boolean := coalesce((fn_agente_cfg('modo_ensaio') #>> '{}')::boolean, true);
  v_hoje date := fn_livro_data_noite();
  v_data date;
  v_quem text;
  v_r reservas_normais;
  v_n livro_noites;
  v_res jsonb;
  v_dig text;
  v_txt text;
  v_setor text; v_tipo text; v_grav text; v_texto text;
begin
  select * into v_e from agente_equipe where id = p_pessoa and ativo;
  if not found then return jsonb_build_object('status', 'erro', 'motivo', 'Pessoa não cadastrada ou inativa.'); end if;
  if v_acao is null then return jsonb_build_object('status', 'erro', 'motivo', 'Operação desconhecida.'); end if;
  if not exists (select 1 from agente_permissoes where papel = v_e.papel and acao = v_acao) then
    return jsonb_build_object('status', 'negado', 'motivo', 'O seu papel não permite esta ação.');
  end if;
  v_quem := v_e.nome || ' (WhatsApp)';
  begin
    v_data := coalesce(nullif(p_args->>'data', '')::date, v_hoje);
  exception when others then
    return jsonb_build_object('status', 'erro', 'motivo', 'Data inválida. Use AAAA-MM-DD.');
  end;

  if p_op = 'noite' then
    return fn_agente_gerente_noite(v_data);
  end if;

  if p_op = 'resumo' then
    return jsonb_build_object('texto', fn_agente_gerente_resumo_texto(v_data));
  end if;

  if p_op = 'livro' then
    select * into v_n from livro_noites where data = v_data;
    return jsonb_build_object(
      'data', v_data, 'livro_aberto', v_n.id is null or v_n.status = 'aberto', 'existe', v_n.id is not null,
      'ocorrencias', coalesce((select jsonb_agg(jsonb_build_object('setor', o.setor, 'tipo', o.tipo, 'gravidade', o.gravidade,
                       'texto', o.texto, 'por', o.criado_por_nome, 'hora', to_char(o.criado_em at time zone 'America/Cuiaba', 'HH24:MI'))
                       order by o.criado_em) from livro_ocorrencias o where o.noite_id = v_n.id), '[]'::jsonb),
      'adendos', coalesce((select jsonb_agg(jsonb_build_object('texto', a.texto, 'por', a.por_nome) order by a.criado_em)
                    from livro_adendos a where a.noite_id = v_n.id), '[]'::jsonb),
      'pendencias_abertas', (select count(*) from livro_ocorrencias o join livro_noites n on n.id = o.noite_id
                              where o.precisa_providencia and o.status_pendencia = 'aberta' and n.data < v_data));
  end if;

  if p_op = 'responder_reserva' then
    select * into v_r from reservas_normais where id = nullif(p_args->>'reserva_id', '')::uuid for update;
    if not found then return jsonb_build_object('status', 'erro', 'motivo', 'Reserva não encontrada.'); end if;
    if v_r.situacao <> 'pre_reserva' then
      return jsonb_build_object('status', 'erro', 'motivo', 'Esta reserva já está ' || v_r.situacao || '.');
    end if;
    if v_r.data_reserva < v_hoje then return jsonb_build_object('status', 'erro', 'motivo', 'A data desta pré-reserva já passou.'); end if;
    if jsonb_typeof(p_args->'confirmar') is distinct from 'boolean' then
      return jsonb_build_object('status', 'erro', 'motivo', 'Diga se é para confirmar ou recusar.');
    end if;
    v_txt := to_char(v_r.data_reserva, 'DD/MM') || ' às ' || to_char(v_r.horario, 'HH24:MI') || ', ' || v_r.numero_pessoas
             || case when v_r.numero_pessoas = 1 then ' pessoa' else ' pessoas' end;
    v_txt := case when (p_args->>'confirmar')::boolean
      then 'Olá, ' || split_part(v_r.nome_cliente, ' ', 1) || '! Aqui é do Ditado Popular. Sua reserva para ' || v_txt || ' está CONFIRMADA. Até lá!'
      else 'Olá, ' || split_part(v_r.nome_cliente, ' ', 1) || '! Aqui é do Ditado Popular. Infelizmente não conseguimos reservar mesa para '
           || v_txt || '. Se quiser outro dia ou horário, é só responder esta mensagem.' end;
    v_dig := regexp_replace(coalesce(v_r.telefone_cliente, ''), '\D', '', 'g');
    if v_dig <> '' and left(v_dig, 2) <> '55' then v_dig := '55' || v_dig; end if;
    v_res := jsonb_build_object('nome', v_r.nome_cliente, 'situacao', case when (p_args->>'confirmar')::boolean then 'confirmada' else 'recusada' end,
               'whats_cliente', nullif(v_dig, ''), 'mensagem_cliente', v_txt, 'vai_para_brasa', v_r.origem = 'link');
    if v_ensaio then return jsonb_build_object('status', 'ensaio') || v_res; end if;
    update reservas_normais set situacao = v_res->>'situacao' where id = v_r.id;
    insert into agente_gerente_log (equipe_id, pessoa_nome, operacao, args, resultado)
    values (p_pessoa, v_quem, p_op, p_args, v_res);
    return jsonb_build_object('status', 'feito') || v_res;
  end if;

  if p_op = 'registrar_ocorrencia' then
    if v_data > v_hoje or v_data < v_hoje - 7 then
      return jsonb_build_object('status', 'erro', 'motivo', 'Só dá para registrar nas últimas 7 noites.');
    end if;
    v_setor := coalesce(nullif(p_args->>'setor', ''), 'geral');
    v_tipo := coalesce(nullif(p_args->>'tipo', ''), 'outro');
    v_grav := coalesce(nullif(p_args->>'gravidade', ''), 'info');
    v_texto := btrim(coalesce(p_args->>'texto', ''));
    if v_setor not in ('salao', 'bar', 'cozinha', 'caixa', 'seguranca', 'limpeza', 'estoque', 'manutencao', 'geral') then
      return jsonb_build_object('status', 'erro', 'motivo', 'Setor inválido.');
    end if;
    if v_tipo not in ('pessoal', 'cliente', 'falta_produto', 'equipamento', 'seguranca', 'elogio', 'outro') then
      return jsonb_build_object('status', 'erro', 'motivo', 'Tipo inválido.');
    end if;
    if v_grav not in ('info', 'atencao', 'grave') then return jsonb_build_object('status', 'erro', 'motivo', 'Gravidade inválida.'); end if;
    if length(v_texto) < 3 then return jsonb_build_object('status', 'erro', 'motivo', 'Falta o texto da ocorrência.'); end if;
    if v_ensaio then return jsonb_build_object('status', 'ensaio', 'data', v_data, 'setor', v_setor, 'tipo', v_tipo); end if;

    select * into v_n from livro_noites where data = v_data;
    if v_n.id is null then insert into livro_noites (data) values (v_data) returning * into v_n; end if;
    if v_n.status = 'fechado' then
      -- Livro fechado só aceita adendo.
      insert into livro_adendos (noite_id, texto, por_nome)
      values (v_n.id, '[' || v_setor || ' · ' || v_tipo || '] ' || v_texto
                      || coalesce(' · Envolvidos: ' || nullif(btrim(p_args->>'envolvidos'), ''), ''), v_quem);
      v_res := jsonb_build_object('data', v_data, 'como', 'adendo', 'motivo', 'O livro desta noite já estava fechado.');
    else
      insert into livro_ocorrencias (noite_id, setor, tipo, gravidade, texto, envolvidos, precisa_providencia, responsavel, criado_por_nome)
      values (v_n.id, v_setor, v_tipo, v_grav, v_texto, nullif(btrim(coalesce(p_args->>'envolvidos', '')), ''),
              coalesce((p_args->>'precisa_providencia')::boolean, false), nullif(btrim(coalesce(p_args->>'responsavel', '')), ''), v_quem);
      v_res := jsonb_build_object('data', v_data, 'como', 'ocorrencia');
    end if;
    insert into agente_gerente_log (equipe_id, pessoa_nome, operacao, args, resultado)
    values (p_pessoa, v_quem, p_op, p_args, v_res);
    return jsonb_build_object('status', 'feito') || v_res;
  end if;

  return jsonb_build_object('status', 'erro', 'motivo', 'Operação desconhecida.');
end $$;

-- Resumo das 16h: entra na fila do agente; fora da janela de 24 h, a pessoa recebe o aviso e toca em "Ver".
create or replace function public.fn_agente_gerente_resumo_enviar()
returns integer language plpgsql security definer set search_path = public as $$
declare v_cfg jsonb := fn_agente_cfg('resumo_gerente'); v_texto text; e record; n int := 0;
begin
  if not coalesce((v_cfg->>'ativo')::boolean, false) then return 0; end if;
  v_texto := fn_agente_gerente_resumo_texto(fn_livro_data_noite());
  for e in
    select q.* from agente_equipe q
     where q.ativo and q.telefone is not null
       and q.papel in (select jsonb_array_elements_text(coalesce(v_cfg->'papeis', '[]'::jsonb)))
  loop
    insert into agente_mensagens (equipe_id, telefone, jid, direcao, tipo, texto, status)
    values (e.id, e.telefone,
            (select m.jid from agente_mensagens m where m.equipe_id = e.id and m.direcao = 'entrada' and m.jid is not null order by m.id desc limit 1),
            'saida', 'texto', v_texto, 'pendente_envio');
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.fn_agente_gerente_noite(date), public.fn_agente_gerente_resumo_texto(date),
  public.fn_agente_gerente(uuid, text, jsonb), public.fn_agente_gerente_resumo_enviar() from public, anon, authenticated;
grant execute on function public.fn_agente_gerente_noite(date), public.fn_agente_gerente_resumo_texto(date),
  public.fn_agente_gerente(uuid, text, jsonb), public.fn_agente_gerente_resumo_enviar() to service_role;

-- 16h em Cuiabá = 20h UTC
select cron.schedule('agente-gerente-resumo', '0 20 * * *', $$select public.fn_agente_gerente_resumo_enviar()$$);
