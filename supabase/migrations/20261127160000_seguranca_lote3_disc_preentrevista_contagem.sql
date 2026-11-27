-- Segurança, lote 3 parte 2 (Kadu, 27/11/2026): funções próprias para as três páginas públicas que ainda
-- liam e gravavam tabelas direto com a chave pública (anon):
--   /disc                    -> fn_disc_publico_abrir, fn_disc_publico_iniciar, fn_disc_publico_concluir
--   /pre-entrevista          -> fn_pre_entrevista_publica_abrir, fn_pre_entrevista_publica_salvar, fn_pre_entrevista_publica_concluir
--   /contagem-mobile/:token  -> fn_contagem_mobile_abrir, fn_contagem_mobile_salvar_item
-- Cada função recebe o token do link e só lê/grava o registro daquele token, conferindo se o status permite.
-- Esta migração só CRIA as funções: nada é revogado aqui e nenhum dado muda.
-- A revogação do acesso direto de anon fica em supabase/pendentes/ (aplicar só depois de publicar o site novo).
--
-- Contagem pelo celular: o celular só conta (quantidade e observação de itens da contagem em andamento).
-- Não finaliza, não processa, não reabre nem cancela; não mexe em saldo (o saldo só muda pelo processamento,
-- feito logado no sistema).

-- ═══════════════════════════════ DISC ═══════════════════════════════

-- Abre o link: diz se o token vale e devolve só o primeiro nome (para o "Olá, Fulano").
create or replace function public.fn_disc_publico_abrir(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
  v_nome text;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('situacao', 'invalido');
  end if;

  select ds.status, ds.expira_em,
         coalesce(c.nome_completo, rc.nome, ds.nome_respondente, 'Participante') as nome
    into s
    from rh_disc_sessoes ds
    left join colaboradores c on c.id = ds.colaborador_id
    left join rh_candidatos rc on rc.id = ds.candidato_id
   where ds.token = p_token;

  if not found then
    return jsonb_build_object('situacao', 'invalido');
  end if;

  v_nome := split_part(trim(s.nome), ' ', 1);

  if s.status = 'concluido' then
    return jsonb_build_object('situacao', 'ja_respondido', 'primeiro_nome', v_nome);
  end if;
  if s.status = 'expirado' or (s.expira_em is not null and s.expira_em < now()) then
    return jsonb_build_object('situacao', 'expirado');
  end if;

  return jsonb_build_object('situacao', 'ok', 'primeiro_nome', v_nome);
end;
$$;

-- Começa a avaliação: marca "em andamento" e devolve as perguntas ativas.
create or replace function public.fn_disc_publico_iniciar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from rh_disc_sessoes
   where token = p_token
     and coalesce(trim(p_token), '') <> ''
     and status in ('pendente', 'em_andamento')
     and (expira_em is null or expira_em >= now())
   for update;

  if v_id is null then
    raise exception 'Link inválido, expirado ou já respondido.';
  end if;

  update rh_disc_sessoes
     set status = 'em_andamento',
         iniciado_em = coalesce(iniciado_em, now())
   where id = v_id;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'pergunta', p.pergunta, 'instrucao', p.instrucao,
             'opcoes', p.opcoes, 'ordem', p.ordem) order by p.ordem)
      from rh_disc_perguntas p
     where p.ativo
  ), '[]'::jsonb);
end;
$$;

-- Conclui: recebe as respostas [{pergunta_id, mais, menos}] e a análise da IA, calcula os scores no banco
-- (mesma conta da página: MAIS +2, MENOS -1, normaliza para 100) e grava a sessão uma vez só.
-- O gatilho trg_disc_sessao_concluida leva o resultado para rh_disc_colaborador / rh_disc_resultados.
create or replace function public.fn_disc_publico_concluir(p_token text, p_respostas jsonb, p_analise jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ativas int;
  v_validas int;
  v_dist int;
  d int := 0; i int := 0; s int := 0; c int := 0;
  pd int; p_i int; ps int; pc int; tot int;
  sd int; si int; ss int; sc int;
  v_dom text; v_sec text;
  a jsonb;
  v_pf text[]; v_ad text[];
  r record;
begin
  select id into v_id
    from rh_disc_sessoes
   where token = p_token
     and coalesce(trim(p_token), '') <> ''
     and status in ('pendente', 'em_andamento')
     and (expira_em is null or expira_em >= now())
   for update;

  if v_id is null then
    raise exception 'Link inválido, expirado ou já respondido.';
  end if;

  if jsonb_typeof(p_respostas) is distinct from 'array' then
    raise exception 'Respostas inválidas.';
  end if;

  select count(*) into v_ativas from rh_disc_perguntas where ativo;

  -- Cada resposta tem que ser de uma pergunta ativa, com MAIS e MENOS diferentes e existentes na pergunta.
  select count(*), count(distinct p.id)
    into v_validas, v_dist
    from jsonb_array_elements(p_respostas) e
    join rh_disc_perguntas p
      on p.ativo and p.id = case when (e->>'pergunta_id') ~ '^\d+$' then (e->>'pergunta_id')::int end
   where e->>'mais' is distinct from e->>'menos'
     and exists (select 1 from jsonb_array_elements(p.opcoes) o where o->>'letra' = e->>'mais')
     and exists (select 1 from jsonb_array_elements(p.opcoes) o where o->>'letra' = e->>'menos');

  if v_ativas = 0 or v_validas <> jsonb_array_length(p_respostas) or v_dist <> v_validas or v_dist <> v_ativas then
    raise exception 'Responda todos os grupos antes de concluir.';
  end if;

  for r in
    select left(om->>'perfil', 1) as perfil_mais, left(ol->>'perfil', 1) as perfil_menos
      from jsonb_array_elements(p_respostas) e
      join rh_disc_perguntas p on p.id = (e->>'pergunta_id')::int
      left join lateral (select o from jsonb_array_elements(p.opcoes) o where o->>'letra' = e->>'mais' limit 1) x1(om) on true
      left join lateral (select o from jsonb_array_elements(p.opcoes) o where o->>'letra' = e->>'menos' limit 1) x2(ol) on true
  loop
    case r.perfil_mais when 'D' then d := d + 2; when 'I' then i := i + 2; when 'S' then s := s + 2; when 'C' then c := c + 2; else null; end case;
    case r.perfil_menos when 'D' then d := d - 1; when 'I' then i := i - 1; when 'S' then s := s - 1; when 'C' then c := c - 1; else null; end case;
  end loop;

  pd := greatest(d, 0); p_i := greatest(i, 0); ps := greatest(s, 0); pc := greatest(c, 0);
  tot := pd + p_i + ps + pc;
  if tot = 0 then tot := 1; end if;
  sd := round(pd * 100.0 / tot); si := round(p_i * 100.0 / tot);
  ss := round(ps * 100.0 / tot); sc := round(pc * 100.0 / tot);

  -- Ranking: maior score primeiro; empate fica na ordem D, I, S, C (igual à página).
  select p into v_dom from (values ('D', sd, 1), ('I', si, 2), ('S', ss, 3), ('C', sc, 4)) t(p, v, o) order by v desc, o limit 1;
  select p into v_sec from (values ('D', sd, 1), ('I', si, 2), ('S', ss, 3), ('C', sc, 4)) t(p, v, o) order by v desc, o offset 1 limit 1;

  -- Análise da IA: só objeto, tamanho limitado, campos no formato esperado.
  a := case when jsonb_typeof(p_analise) = 'object' and pg_column_size(p_analise) <= 32000 then p_analise end;
  if a is not null and jsonb_typeof(a->'pontos_fortes') = 'array' then
    select array_agg(left(x, 500)) into v_pf from jsonb_array_elements_text(a->'pontos_fortes') x;
  end if;
  if a is not null and jsonb_typeof(a->'areas_desenvolvimento') = 'array' then
    select array_agg(left(x, 500)) into v_ad from jsonb_array_elements_text(a->'areas_desenvolvimento') x;
  end if;
  if a is not null and jsonb_typeof(a->'pontos_fracos') is distinct from 'array' then
    a := a - 'pontos_fracos';
  end if;

  update rh_disc_sessoes
     set status = 'concluido',
         concluido_em = now(),
         iniciado_em = coalesce(iniciado_em, now()),
         score_d = sd, score_i = si, score_s = ss, score_c = sc,
         perfil_dominante = v_dom,
         perfil_secundario = v_sec,
         resumo_ia = left(a->>'resumo', 4000),
         pontos_fortes = v_pf,
         areas_desenvolvimento = v_ad,
         estilo_comunicacao = left(a->>'estilo_comunicacao', 2000),
         como_motivar = left(a->>'como_motivar', 2000),
         analise_ia = a
   where id = v_id;

  return jsonb_build_object('scoreD', sd, 'scoreI', si, 'scoreS', ss, 'scoreC', sc,
                            'dominante', v_dom, 'secundario', v_sec);
end;
$$;

-- ═══════════════════════════ PRÉ-ENTREVISTA ═══════════════════════════

-- Abre o link: devolve situação, conversa, dados da vaga e o primeiro nome do candidato.
-- Se estava "pendente", marca "em andamento" (como a página fazia) e avisa em "iniciou".
create or replace function public.fn_pre_entrevista_publica_abrir(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pe record;
  v_iniciou boolean := false;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('situacao', 'invalido');
  end if;

  select x.id, x.status, x.conversa, x.expira_em,
         v.titulo, v.descricao, v.requisitos, cg.nome as cargo_nome, ca.nome as candidato_nome
    into pe
    from rh_pre_entrevistas x
    left join rh_candidaturas cd on cd.id = x.candidatura_id
    left join rh_vagas v on v.id = cd.vaga_id
    left join rh_cargos cg on cg.id = v.cargo_id
    left join rh_candidatos ca on ca.id = cd.candidato_id
   where x.token = p_token
   for update of x;

  if not found then
    return jsonb_build_object('situacao', 'invalido');
  end if;
  if pe.status = 'concluida' then
    return jsonb_build_object('situacao', 'concluida');
  end if;
  if pe.status = 'expirada' or pe.expira_em < now() then
    return jsonb_build_object('situacao', 'expirada');
  end if;

  if pe.status = 'pendente' then
    update rh_pre_entrevistas set status = 'em_andamento', iniciada_em = now() where id = pe.id;
    v_iniciou := true;
  end if;

  return jsonb_build_object(
    'situacao', 'ok',
    'iniciou', v_iniciou,
    'conversa', coalesce(pe.conversa, '[]'::jsonb),
    'vaga', jsonb_build_object('titulo', pe.titulo, 'descricao', pe.descricao, 'requisitos', pe.requisitos,
                               'cargo', jsonb_build_object('nome', pe.cargo_nome)),
    'candidato', jsonb_build_object('nome', split_part(trim(coalesce(pe.candidato_nome, '')), ' ', 1))
  );
end;
$$;

-- Grava a conversa (lista de mensagens) da pré-entrevista em andamento.
create or replace function public.fn_pre_entrevista_publica_salvar(p_token text, p_conversa jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_conversa) is distinct from 'array'
     or jsonb_array_length(p_conversa) > 200
     or pg_column_size(p_conversa) > 300000 then
    raise exception 'Conversa inválida.';
  end if;

  update rh_pre_entrevistas
     set conversa = p_conversa
   where token = p_token
     and coalesce(trim(p_token), '') <> ''
     and status = 'em_andamento'
     and expira_em >= now()
  returning id into v_id;

  if v_id is null then
    raise exception 'Pré-entrevista inválida, expirada ou já concluída.';
  end if;
end;
$$;

-- Finaliza a pré-entrevista em andamento.
create or replace function public.fn_pre_entrevista_publica_concluir(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update rh_pre_entrevistas
     set status = 'concluida', concluida_em = now()
   where token = p_token
     and coalesce(trim(p_token), '') <> ''
     and status = 'em_andamento'
     and expira_em >= now()
  returning id into v_id;

  if v_id is null then
    raise exception 'Pré-entrevista inválida, expirada ou já concluída.';
  end if;
end;
$$;

-- ═══════════════════════════ CONTAGEM PELO CELULAR ═══════════════════════════

-- Abre o link: só contagem "em andamento" com o token válido. Devolve estoque, responsável e os itens.
create or replace function public.fn_contagem_mobile_abrir(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ct record;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('situacao', 'invalido');
  end if;

  select ce.id, ce.status, ce.token_expira_em, ce.responsavel, e.nome as estoque_nome
    into ct
    from contagens_estoque ce
    left join estoques e on e.id = ce.estoque_id
   where ce.token_acesso = p_token;

  if not found then
    return jsonb_build_object('situacao', 'invalido');
  end if;
  if ct.token_expira_em is not null and ct.token_expira_em < now() then
    return jsonb_build_object('situacao', 'expirado');
  end if;
  if ct.status <> 'em_andamento' then
    return jsonb_build_object('situacao', 'fechada', 'status', ct.status);
  end if;

  return jsonb_build_object(
    'situacao', 'ok',
    'contagem', jsonb_build_object('estoque_nome', coalesce(ct.estoque_nome, ''), 'responsavel', ct.responsavel),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ci.id,
               'item_estoque_id', ci.item_estoque_id,
               'item_nome', coalesce(ie.nome, ''),
               'item_codigo', coalesce(ie.codigo, ''),
               'unidade_medida', coalesce(ie.unidade_medida, 'UN'),
               'grupo_contagem', coalesce(ie.grupo_contagem, 'outros'),
               'ignorar_contagem_cadastro', coalesce(ie.ignorar_contagem, false),
               'ignorar_override', ci.ignorar_override,
               'quantidade_sistema', ci.quantidade_sistema,
               'quantidade_contada', ci.quantidade_contada,
               'valor_unitario', ci.valor_unitario,
               'diferenca', ci.diferenca,
               'valor_diferenca', ci.valor_diferenca,
               'observacao', ci.observacao) order by ci.item_estoque_id)
        from contagens_estoque_itens ci
        left join itens_estoque ie on ie.id = ci.item_estoque_id
       where ci.contagem_id = ct.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Grava a quantidade contada e/ou a observação de UM item da contagem do token.
-- p_campos: {"quantidade_contada": numero|null} e/ou {"observacao": texto}. Só contagem em andamento,
-- só item daquela contagem. Não mexe em saldo nem em status.
create or replace function public.fn_contagem_mobile_salvar_item(p_token text, p_item_id uuid, p_campos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contagem uuid;
  v_qtd numeric;
  v_row record;
begin
  if jsonb_typeof(p_campos) is distinct from 'object'
     or not (p_campos ? 'quantidade_contada' or p_campos ? 'observacao') then
    raise exception 'Nada para salvar.';
  end if;

  select id into v_contagem
    from contagens_estoque
   where token_acesso = p_token
     and coalesce(trim(p_token), '') <> ''
     and status = 'em_andamento'
     and (token_expira_em is null or token_expira_em >= now());

  if v_contagem is null then
    raise exception 'Contagem inválida, expirada ou fechada.';
  end if;

  if p_campos ? 'quantidade_contada' then
    if jsonb_typeof(p_campos->'quantidade_contada') = 'null' then
      v_qtd := null;
    elsif jsonb_typeof(p_campos->'quantidade_contada') = 'number' then
      v_qtd := (p_campos->>'quantidade_contada')::numeric;
      if v_qtd < 0 or v_qtd > 1000000 then
        raise exception 'Quantidade inválida.';
      end if;
    else
      raise exception 'Quantidade inválida.';
    end if;
  end if;

  update contagens_estoque_itens
     set quantidade_contada = case when p_campos ? 'quantidade_contada' then v_qtd else quantidade_contada end,
         contado_em         = case when p_campos ? 'quantidade_contada' then now() else contado_em end,
         observacao         = case when p_campos ? 'observacao' then left(coalesce(p_campos->>'observacao', ''), 1000) else observacao end
   where id = p_item_id
     and contagem_id = v_contagem
  returning quantidade_contada, diferenca, valor_diferenca, observacao into v_row;

  if not found then
    raise exception 'Item não pertence a esta contagem.';
  end if;

  return jsonb_build_object('quantidade_contada', v_row.quantidade_contada, 'diferenca', v_row.diferenca,
                            'valor_diferenca', v_row.valor_diferenca, 'observacao', v_row.observacao);
end;
$$;

-- ═══════════════════════════ PERMISSÕES ═══════════════════════════
revoke all on function public.fn_disc_publico_abrir(text) from public;
revoke all on function public.fn_disc_publico_iniciar(text) from public;
revoke all on function public.fn_disc_publico_concluir(text, jsonb, jsonb) from public;
revoke all on function public.fn_pre_entrevista_publica_abrir(text) from public;
revoke all on function public.fn_pre_entrevista_publica_salvar(text, jsonb) from public;
revoke all on function public.fn_pre_entrevista_publica_concluir(text) from public;
revoke all on function public.fn_contagem_mobile_abrir(text) from public;
revoke all on function public.fn_contagem_mobile_salvar_item(text, uuid, jsonb) from public;

grant execute on function public.fn_disc_publico_abrir(text) to anon, authenticated, service_role;
grant execute on function public.fn_disc_publico_iniciar(text) to anon, authenticated, service_role;
grant execute on function public.fn_disc_publico_concluir(text, jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.fn_pre_entrevista_publica_abrir(text) to anon, authenticated, service_role;
grant execute on function public.fn_pre_entrevista_publica_salvar(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.fn_pre_entrevista_publica_concluir(text) to anon, authenticated, service_role;
grant execute on function public.fn_contagem_mobile_abrir(text) to anon, authenticated, service_role;
grant execute on function public.fn_contagem_mobile_salvar_item(text, uuid, jsonb) to anon, authenticated, service_role;
