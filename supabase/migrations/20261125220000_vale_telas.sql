-- Vale Ditado: telas de resgate e admin (25/11/2026).
-- Resgate mostra os 10% sugeridos de cada baixa; o admin salva o uso único e o horário de fechamento da noite.

create or replace function public.fn_vale_resgate_ler(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k vale_codigos%rowtype; pr vale_produtos%rowtype; v_cod text;
begin
  if not fn_vale_pode(false) then raise exception 'sem acesso ao resgate de vales'; end if;
  v_cod := upper(btrim(regexp_replace(coalesce(p_codigo, ''), '^.*/', '')));
  if v_cod !~ '^DIT-' and length(v_cod) = 8 then v_cod := 'DIT-' || left(v_cod, 4) || '-' || right(v_cod, 4); end if;
  select * into k from vale_codigos where codigo = v_cod;
  if k.id is null then return jsonb_build_object('encontrado', false); end if;
  select * into pr from vale_produtos where id = k.produto_id;
  return jsonb_build_object(
    'encontrado', true, 'id', k.id, 'codigo', k.codigo, 'produto', pr.nome, 'tipo', pr.tipo,
    'titular', fn_vale_nome_curto(k.titular_nome), 'validade', k.validade,
    'status', fn_vale_status_exibido(k.status, k.validade), 'preco_pago', k.preco_pago, 'preco_de', pr.preco_de,
    'credito_total', k.credito_total, 'saldo_credito', k.saldo_credito,
    'trava_happy_hour', pr.trava_happy_hour, 'happy_hour_agora', fn_vale_happy_hour_agora(),
    'uso_unico', (select uso_unico from vale_campanha where id = 1), 'aberto_em', k.aberto_em,
    'fechado', k.aberto_em is not null and fn_vale_fechado(k.aberto_em),
    'happy_hour_fim', (select to_char(happy_hour_fim, 'HH24:MI') from vale_campanha where id = 1),
    'saldos', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'descricao', s.descricao, 'total', s.quantidade_total,
               'usado', s.quantidade_usada, 'tem_alcool', s.tem_alcool, 'brinde', s.brinde) order by s.ordem)
               from vale_codigo_saldos s where s.codigo_id = k.id), '[]'::jsonb),
    'resgates', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'descricao', r.descricao, 'quantidade', r.quantidade,
               'valor', r.valor, 'taxa', r.taxa_servico_sugerida, 'quem', r.usuario_nome, 'quando', r.criado_em, 'comanda', r.comanda_zig,
               'desfeito', r.desfeito_em is not null) order by r.criado_em desc) from vale_resgates r where r.codigo_id = k.id), '[]'::jsonb));
end $$;

create or replace function public.fn_vale_admin_campanha_salvar(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_vale_pode(true) then raise exception 'só gerente'; end if;
  update vale_campanha c set
    fase = coalesce(p->>'fase', c.fase),
    ativo = coalesce((p->>'ativo')::boolean, c.ativo),
    modo_teste = coalesce((p->>'modo_teste')::boolean, c.modo_teste),
    venda_inicio = coalesce((p->>'venda_inicio')::timestamptz, c.venda_inicio),
    venda_fim = coalesce((p->>'venda_fim')::timestamptz, c.venda_fim),
    validade_meses = coalesce((p->>'validade_meses')::int, c.validade_meses),
    happy_hour_inicio = coalesce((p->>'happy_hour_inicio')::time, c.happy_hour_inicio),
    happy_hour_fim = coalesce((p->>'happy_hour_fim')::time, c.happy_hour_fim),
    happy_hour_dias = coalesce((select array_agg(x::int) from jsonb_array_elements_text(p->'happy_hour_dias') x), c.happy_hour_dias),
    brinde_descricao = case when p ? 'brinde_descricao' then nullif(btrim(p->>'brinde_descricao'), '') else c.brinde_descricao end,
    brinde_ate = case when p ? 'brinde_ate' then (p->>'brinde_ate')::timestamptz else c.brinde_ate end,
    brinde_valor_cardapio = case when p ? 'brinde_valor_cardapio' then (p->>'brinde_valor_cardapio')::numeric else c.brinde_valor_cardapio end,
    mostrar_contador = coalesce((p->>'mostrar_contador')::boolean, c.mostrar_contador),
    uso_unico = coalesce((p->>'uso_unico')::boolean, c.uso_unico),
    fim_noite = coalesce((p->>'fim_noite')::time, c.fim_noite),
    contador_fim = case when p ? 'contador_fim' then (p->>'contador_fim')::timestamptz else c.contador_fim end,
    mostrar_vendidos_a_partir = coalesce((p->>'mostrar_vendidos_a_partir')::int, c.mostrar_vendidos_a_partir),
    hero_foto_url = case when p ? 'hero_foto_url' then nullif(p->>'hero_foto_url', '') else c.hero_foto_url end,
    textos = case when p ? 'textos' then coalesce(p->'textos', '{}'::jsonb) else c.textos end,
    regulamento_md = case when p ? 'regulamento_md' then p->>'regulamento_md' else c.regulamento_md end,
    atualizado_em = now(), atualizado_por = fn_usuario_sistema_id()
  where c.id = 1;
end $$;
