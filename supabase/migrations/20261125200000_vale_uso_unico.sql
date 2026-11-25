-- Vale Ditado: uso único (Kadu, 25/11/2026). "O voucher não pode ser parcelado, usado duas vezes e ir abatendo
-- crédito: tem que ser usado numa visita só."
-- A primeira baixa abre o vale (aberto_em); dá para lançar o resto durante aquela noite (até fim_noite, 6h do dia
-- seguinte), porque o chopp sai aos poucos ao longo da noite. Depois disso o vale fecha e o que sobrou não vale mais
-- (sem troco, sem saldo para outra visita, sem estorno da sobra). Configurável: vale_campanha.uso_unico e fim_noite.

alter table public.vale_campanha add column uso_unico boolean not null default true;
alter table public.vale_campanha add column fim_noite time not null default '06:00';
alter table public.vale_codigos add column aberto_em timestamptz;

-- A "noite" de um instante: o dia de Cuiabá, contando até fim_noite da madrugada seguinte.
create or replace function public.fn_vale_noite(p_t timestamptz)
returns date language sql stable security definer set search_path = public as $$
  select ((p_t at time zone 'America/Cuiaba') - (select fim_noite from vale_campanha where id = 1))::date
$$;

-- Vale aberto numa noite que já passou (com o uso único ligado).
create or replace function public.fn_vale_fechado(p_aberto timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select p_aberto is not null and coalesce((select uso_unico from vale_campanha where id = 1), true)
     and fn_vale_noite(p_aberto) < fn_vale_noite(now())
$$;

-- Robô (pg_cron, de hora em hora): fecha os vales abertos em noites que já passaram.
create or replace function public.fn_vale_fechar_noites()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update vale_codigos set status = 'resgatado', atualizado_em = now()
   where status = 'parcial' and fn_vale_fechado(aberto_em);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.fn_vale_vitrine()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'agora', now(),
    'situacao', fn_vale_situacao_venda(),
    'campanha', (select jsonb_build_object(
        'fase', c.fase, 'modo_teste', c.modo_teste, 'venda_inicio', c.venda_inicio, 'venda_fim', c.venda_fim,
        'validade_meses', c.validade_meses, 'validade_ate', (fn_vale_hoje() + make_interval(months => c.validade_meses))::date,
        'happy_hour_fim', to_char(c.happy_hour_fim, 'HH24:MI'),
        'brinde_descricao', case when c.brinde_ate > now() then c.brinde_descricao end,
        'brinde_ate', case when c.brinde_ate > now() then c.brinde_ate end,
        'mostrar_contador', c.mostrar_contador, 'contador_fim', c.contador_fim,
        'mostrar_vendidos_a_partir', c.mostrar_vendidos_a_partir, 'hero_foto_url', c.hero_foto_url,
        'textos', c.textos, 'tem_regulamento', coalesce(c.regulamento_md, '') <> '', 'uso_unico', c.uso_unico,
        'fim_noite', to_char(c.fim_noite, 'HH24:MI'))
      from vale_campanha c where c.id = 1),
    'vendidos_total', (select coalesce(sum(lote_vendido), 0) from vale_produtos where ativo),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'nome', p.nome, 'composicao', p.composicao_texto, 'selo', p.selo_tematico,
        'preco_de', p.preco_de, 'preco_por', p.preco_por, 'tipo', p.tipo, 'credito_valor', p.credito_valor,
        'tem_alcool', p.tem_alcool, 'trava_happy_hour', p.trava_happy_hour, 'lote_total', p.lote_total,
        'restam', p.lote_total - p.lote_vendido - p.lote_reservado, 'vendidos', p.lote_vendido,
        'limite_por_cpf', p.limite_por_cpf, 'foto_url', p.foto_url, 'categoria', p.categoria,
        'destaque_black', p.destaque_black, 'destaque_natal', p.destaque_natal,
        'itens', coalesce((select jsonb_agg(jsonb_build_object('descricao', i.descricao, 'quantidade', i.quantidade,
                   'tem_alcool', i.tem_alcool) order by i.ordem) from vale_produto_itens i where i.produto_id = p.id), '[]'::jsonb))
        order by p.ordem, p.nome) from vale_produtos p where p.ativo), '[]'::jsonb)
  )
$$;

create or replace function public.fn_vale_codigo_json(p_codigo_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'codigo', k.codigo, 'produto', pr.nome, 'slug', pr.slug, 'tipo', pr.tipo, 'titular', fn_vale_nome_curto(k.titular_nome),
    'validade', k.validade, 'status', case when k.status = 'parcial' and fn_vale_fechado(k.aberto_em) then 'resgatado' else fn_vale_status_exibido(k.status, k.validade) end,
    'credito_total', k.credito_total, 'saldo_credito', k.saldo_credito, 'trava_happy_hour', pr.trava_happy_hour,
    'aberto_em', k.aberto_em,
    'saldos', coalesce((select jsonb_agg(jsonb_build_object('descricao', s.descricao, 'total', s.quantidade_total,
               'usado', s.quantidade_usada, 'brinde', s.brinde) order by s.ordem) from vale_codigo_saldos s where s.codigo_id = k.id), '[]'::jsonb))
  from vale_codigos k join vale_produtos pr on pr.id = k.produto_id where k.id = p_codigo_id
$$;

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
               'valor', r.valor, 'quem', r.usuario_nome, 'quando', r.criado_em, 'comanda', r.comanda_zig,
               'desfeito', r.desfeito_em is not null) order by r.criado_em desc) from vale_resgates r where r.codigo_id = k.id), '[]'::jsonb));
end $$;

create or replace function public.fn_vale_resgatar(p_codigo text, p_itens jsonb, p_valor numeric, p_comanda text,
                                                    p_documento boolean, p_credito_alcool boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k vale_codigos%rowtype; pr vale_produtos%rowtype; s vale_codigo_saldos%rowtype; it record;
  v_uid uuid := fn_usuario_sistema_id(); v_nome text := fn_vale_usuario_nome(); v_taxa numeric; v_n integer := 0;
  v_fator numeric;
begin
  if not fn_vale_pode(false) then raise exception 'sem acesso ao resgate de vales'; end if;
  select * into k from vale_codigos where codigo = upper(btrim(coalesce(p_codigo, ''))) for update;
  if k.id is null then raise exception 'vale não encontrado'; end if;
  if k.status = 'estornado' then raise exception 'este vale foi cancelado e o valor devolvido'; end if;
  if k.status = 'resgatado' then raise exception 'este vale já foi todo usado'; end if;
  if k.validade < fn_vale_hoje() then raise exception 'este vale venceu em %', to_char(k.validade, 'DD/MM/YYYY'); end if;
  -- uso único (Kadu, 25/11): a primeira baixa abre o vale; o resto só vale até o fim daquela noite
  if k.aberto_em is not null and fn_vale_fechado(k.aberto_em) then
    raise exception 'este vale já foi usado na noite de %: o que sobrou não vale mais', to_char(fn_vale_noite(k.aberto_em), 'DD/MM');
  end if;
  select * into pr from vale_produtos where id = k.produto_id;
  if pr.trava_happy_hour and fn_vale_happy_hour_agora() then
    raise exception 'produto com chopp não vale no happy hour: libera às %', (select to_char(happy_hour_fim, 'HH24:MI') from vale_campanha where id = 1);
  end if;
  -- 10% sobre o valor pago, proporcional ao preço de cardápio do que foi usado
  v_fator := case when pr.preco_de > 0 then k.preco_pago / pr.preco_de else 1 end;

  if pr.tipo = 'credito' then
    if p_valor is null or p_valor <= 0 then raise exception 'informe o valor a abater'; end if;
    if p_valor > k.saldo_credito then raise exception 'o valor passa do saldo (R$ %)', replace(to_char(k.saldo_credito, 'FM999990.00'), '.', ','); end if;
    if coalesce(p_credito_alcool, false) and not coalesce(p_documento, false) then raise exception 'confira o documento com foto antes de baixar bebida alcoólica'; end if;
    v_taxa := round(p_valor * (k.preco_pago / nullif(k.credito_total, 0)) * 0.10, 2);
    update vale_codigos set saldo_credito = saldo_credito - p_valor, atualizado_em = now(), aberto_em = coalesce(aberto_em, now()),
           status = case when saldo_credito - p_valor <= 0 then 'resgatado' else 'parcial' end where id = k.id;
    insert into vale_resgates (codigo_id, descricao, valor, taxa_servico_sugerida, usuario_id, usuario_nome, comanda_zig, documento_conferido)
    values (k.id, 'Crédito', round(p_valor, 2), v_taxa, v_uid, v_nome, nullif(btrim(coalesce(p_comanda, '')), ''), coalesce(p_documento, false));
    v_n := 1;
  else
    for it in select (x->>'saldo_id')::uuid saldo_id, (x->>'quantidade')::int q from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x loop
      if coalesce(it.q, 0) <= 0 then continue; end if;
      select * into s from vale_codigo_saldos where id = it.saldo_id and codigo_id = k.id for update;
      if s.id is null then raise exception 'item não pertence a este vale'; end if;
      if s.quantidade_usada + it.q > s.quantidade_total then
        raise exception 'só restam % de %', s.quantidade_total - s.quantidade_usada, s.descricao;
      end if;
      if s.tem_alcool and not coalesce(p_documento, false) then raise exception 'confira o documento com foto antes de baixar bebida alcoólica'; end if;
      update vale_codigo_saldos set quantidade_usada = quantidade_usada + it.q where id = s.id;
      v_taxa := case when s.brinde then 0 else round(coalesce(s.valor_cardapio, 0) * it.q * v_fator * 0.10, 2) end;
      insert into vale_resgates (codigo_id, saldo_id, descricao, quantidade, taxa_servico_sugerida, usuario_id, usuario_nome, comanda_zig, documento_conferido)
      values (k.id, s.id, s.descricao, it.q, v_taxa, v_uid, v_nome, nullif(btrim(coalesce(p_comanda, '')), ''), coalesce(p_documento, false));
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'escolha o que o cliente vai usar'; end if;
    update vale_codigos set atualizado_em = now(), aberto_em = coalesce(aberto_em, now()),
           status = case when not exists (select 1 from vale_codigo_saldos where codigo_id = k.id and quantidade_usada < quantidade_total)
                         then 'resgatado' else 'parcial' end
     where id = k.id;
  end if;
  return fn_vale_resgate_ler(k.codigo);
end $$;

create or replace function public.fn_vale_admin_painel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_vale_pode(true) then raise exception 'só gerente'; end if;
  return jsonb_build_object(
    'pedidos_pagos', (select count(*) from vale_pedidos where status = 'pago'),
    'receita', (select coalesce(sum(valor_total), 0) from vale_pedidos where status = 'pago'),
    'estornado', (select coalesce(sum(valor), 0) from vale_estornos where status = 'concluido'),
    'pendentes', (select count(*) from vale_pedidos where status = 'pendente'),
    'pago_sem_lote', (select count(*) from vale_pedidos where status = 'pago_sem_lote'),
    'vales', (select count(*) from vale_codigos where status <> 'estornado'),
    'por_produto', coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'vendidos', p.lote_vendido, 'reservados', p.lote_reservado,
        'lote', p.lote_total, 'receita', (select coalesce(sum(k.preco_pago), 0) from vale_codigos k where k.produto_id = p.id and k.status <> 'estornado'))
        order by p.ordem) from vale_produtos p), '[]'::jsonb),
    -- % resgatado e passivo (R$ pagos ainda a entregar), proporcional ao preço de cardápio do que falta
    'resgate', (select jsonb_build_object(
        'pct_resgatado', round(100 * coalesce(sum(k.preco_pago - z.passivo), 0) / nullif(sum(k.preco_pago), 0), 1),
        'passivo', round(coalesce(sum(z.passivo), 0), 2))
      from vale_codigos k join vale_produtos p on p.id = k.produto_id
      cross join lateral (select case
          when p.tipo = 'credito' then k.saldo_credito * k.preco_pago / nullif(k.credito_total, 0)
          else k.preco_pago * coalesce((select sum((s.quantidade_total - s.quantidade_usada) * coalesce(s.valor_cardapio, 1))
                 / nullif(sum(s.quantidade_total * coalesce(s.valor_cardapio, 1)), 0)
                 from vale_codigo_saldos s where s.codigo_id = k.id and not s.brinde), 0) end passivo) z
      where k.status not in ('estornado', 'resgatado') and k.validade >= fn_vale_hoje()
        and not (k.aberto_em is not null and fn_vale_fechado(k.aberto_em))),
    'compradores', (select jsonb_build_object(
        'total', count(*),
        'novos', count(*) filter (where f.cpf is null),
        'sumidos_60', count(*) filter (where f.ultima_visita < c.primeira_compra::date - 60),
        'ativos', count(*) filter (where f.ultima_visita >= c.primeira_compra::date - 60))
      from (select cpf, min(pago_em) primeira_compra from vale_pedidos where status = 'pago' group by cpf) c
      left join fidelidade_clientes f on f.cpf = c.cpf),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'pedidos', n, 'receita', v) order by dia) from (
        select (pago_em at time zone 'America/Cuiaba')::date dia, count(*) n, sum(valor_total) v from vale_pedidos where status = 'pago' group by 1) t), '[]'::jsonb),
    'por_origem', coalesce((select jsonb_agg(jsonb_build_object('origem', o, 'pedidos', n, 'receita', v)) from (
        select coalesce(nullif(origem->>'utm_source', ''), nullif(origem->>'seg', ''), 'direto') o, count(*) n, sum(valor_total) v
          from vale_pedidos where status = 'pago' group by 1) t), '[]'::jsonb));
end $$;

create or replace function public.fn_vale_estorno_preparar(p_pedido uuid, p_codigos uuid[], p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d vale_pedidos%rowtype; v_valor numeric := 0; v_id uuid; k record; v_cods uuid[];
begin
  if not fn_vale_pode(true) then raise exception 'só gerente faz estorno'; end if;
  select * into d from vale_pedidos where id = p_pedido for update;
  if d.id is null then raise exception 'pedido não encontrado'; end if;
  if d.status not in ('pago', 'pago_sem_lote') then raise exception 'pedido não está pago'; end if;
  if exists (select 1 from vale_estornos where pedido_id = d.id and status = 'solicitado') then raise exception 'já há um estorno em andamento neste pedido'; end if;

  if d.status = 'pago_sem_lote' then
    v_valor := coalesce(d.valor_pago, d.valor_total); v_cods := '{}';
  else
    select array_agg(id) into v_cods from vale_codigos
     where pedido_id = d.id and status not in ('estornado', 'resgatado') and (p_codigos is null or id = any (p_codigos))
       and not (aberto_em is not null and fn_vale_fechado(aberto_em));
    if v_cods is null then raise exception 'nenhum vale para estornar'; end if;
    for k in select c.*, p.tipo from vale_codigos c join vale_produtos p on p.id = c.produto_id where c.id = any (v_cods) loop
      v_valor := v_valor + case
        when k.tipo = 'credito' then k.preco_pago * k.saldo_credito / nullif(k.credito_total, 0)
        else k.preco_pago * coalesce((select sum((s.quantidade_total - s.quantidade_usada) * coalesce(s.valor_cardapio, 1))
               / nullif(sum(s.quantidade_total * coalesce(s.valor_cardapio, 1)), 0) from vale_codigo_saldos s where s.codigo_id = k.id and not s.brinde), 0) end;
    end loop;
    v_valor := round(v_valor, 2);
  end if;
  if v_valor <= 0 then raise exception 'não há valor a devolver: os vales já foram usados'; end if;
  insert into vale_estornos (pedido_id, codigos, valor, motivo, usuario_id, usuario_nome)
  values (d.id, v_cods, v_valor, nullif(btrim(coalesce(p_motivo, '')), ''), fn_usuario_sistema_id(), fn_vale_usuario_nome())
  returning id into v_id;
  return jsonb_build_object('estorno_id', v_id, 'valor', v_valor, 'pagamento_id', coalesce(d.gateway_pagamento_id, d.gateway_cobranca_id),
                            'total', d.valor_total, 'integral', v_valor >= d.valor_total);
end $$;

-- textos dos produtos que falavam em "várias visitas"
update public.vale_produtos set composicao_texto = '5 chopps Brahma 300 ml.', selo_tematico = 'Pra uma rodada' where slug = 'cartela-5';
update public.vale_produtos set composicao_texto = '10 chopps Brahma 300 ml, pra dividir com a mesa.', selo_tematico = 'Pra turma' where slug = 'cartela-10';

revoke all on function public.fn_vale_noite(timestamptz), public.fn_vale_fechado(timestamptz), public.fn_vale_fechar_noites()
  from public, anon, authenticated;
grant execute on function public.fn_vale_fechar_noites() to service_role;

select cron.schedule('vale-fechar-noites', '7 * * * *', $$select public.fn_vale_fechar_noites()$$);
