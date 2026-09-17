-- ═════════════════════════════════════════════════════════════════════════════
-- Contagem por blocos
--
-- Em vez de abrir uma contagem com 636 itens que ninguém termina, conta-se
-- por bloco (a categoria do item): abre Cervejas, conta, conclui; abre
-- Carnes, conta, conclui. Cada bloco é uma contagem própria (reaproveita
-- finalizar/processar que já existem). O painel do dia mostra os blocos do
-- estoque, o ciclo de cada um (giro: 2 dias; higiene/secos: 7; resto: 30),
-- quais vencem hoje e quantos itens faltam.
--
-- Bloco especial "Zerados na última contagem": itens que a última contagem
-- processada deixou em zero nos últimos 10 dias, para reconferir.
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.contagens_estoque add column if not exists bloco text;
create index if not exists idx_contagens_estoque_bloco on public.contagens_estoque(estoque_id, bloco, data_contagem desc);

-- ─── 1. Ciclo por bloco (categoria) ──────────────────────────────────────────
create table if not exists public.contagem_ciclos (
  categoria   text primary key,
  ciclo_dias  integer not null check (ciclo_dias between 1 and 90),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.contagem_ciclos enable row level security;
revoke all on public.contagem_ciclos from public, anon, authenticated;

insert into public.contagem_ciclos (categoria, ciclo_dias) values
  ('Carnes', 2), ('Carnes Bovinas', 2), ('Vegetais', 2), ('Frios e embutidos', 2), ('Laticínios', 2),
  ('Pães e Padaria', 2), ('Frutos do Mar', 2), ('Bebidas Alcoólicas', 2), ('Bebidas Não Alcoólicas', 2),
  ('Bebidas', 2), ('Doces e Sobremesas', 2),
  ('Descartáveis', 7), ('Produtos de Limpeza', 7), ('Temperos e Condimentos', 7), ('Grãos e Cereais', 7),
  ('Óleos e Gorduras', 7), ('Massas', 7), ('Outros', 7),
  ('Utensílios', 30), ('Equipamentos', 30), ('Material de Escritório', 30), ('Uniformes', 30), ('MANUTENÇÃO  DE CARRO', 30)
on conflict (categoria) do nothing;

create or replace function public.fn_contagem_ciclo_definir(p_categoria text, p_ciclo_dias integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_ciclo_dias is null or p_ciclo_dias < 1 or p_ciclo_dias > 90 then raise exception 'Ciclo entre 1 e 90 dias'; end if;
  insert into contagem_ciclos (categoria, ciclo_dias) values (p_categoria, p_ciclo_dias)
  on conflict (categoria) do update set ciclo_dias = excluded.ciclo_dias, atualizado_em = now();
  return jsonb_build_object('success', true, 'categoria', p_categoria, 'ciclo_dias', p_ciclo_dias);
end;
$$;

-- ─── 2. Itens de um bloco num estoque (mesma regra do bulk_import) ───────────
create or replace function public.fn_contagem_itens_do_bloco(p_estoque_id uuid, p_bloco text)
returns table (item_id uuid)
language sql stable security definer set search_path = public as $$
  with e as (select tipo from estoques where id = p_estoque_id),
  zerados as (
    -- último resultado processado de cada item neste estoque, nos últimos 10 dias
    select distinct on (ci.item_estoque_id) ci.item_estoque_id, ci.quantidade_contada
      from contagens_estoque_itens ci
      join contagens_estoque c on c.id = ci.contagem_id
     where c.estoque_id = p_estoque_id and c.status = 'processada'
       and c.data_contagem >= current_date - 10 and ci.quantidade_contada is not null
     order by ci.item_estoque_id, c.data_contagem desc, c.processado_em desc
  )
  select ie.id
    from itens_estoque ie
   where ie.status = 'ativo' and coalesce(ie.ignorar_contagem, false) = false
     and (case when (select tipo from e) = 'central'
               then (ie.estoque_nativo_id is null or ie.estoque_nativo_id = p_estoque_id)
               else exists (select 1 from itens_estoque_niveis n where n.item_id = ie.id and n.estoque_id = p_estoque_id)
                    or exists (select 1 from saldos_estoque s where s.item_id = ie.id and s.estoque_id = p_estoque_id and s.quantidade_atual <> 0)
          end)
     and (case when p_bloco = '__zerados'
               then exists (select 1 from zerados z where z.item_estoque_id = ie.id and z.quantidade_contada = 0)
               else coalesce(nullif(btrim(ie.categoria), ''), 'Sem categoria') = p_bloco end);
$$;

-- ─── 3. Painel: blocos do estoque, ciclo, vencimento, contagem de hoje ───────
create or replace function public.fn_contagem_blocos(p_estoque_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
with hoje as (select (now() at time zone 'America/Cuiaba')::date as d),
e as (select id, nome, tipo from estoques where id = p_estoque_id),
itens as (
  select ie.id, coalesce(nullif(btrim(ie.categoria), ''), 'Sem categoria') as bloco
    from itens_estoque ie
   where ie.status = 'ativo' and coalesce(ie.ignorar_contagem, false) = false
     and (case when (select tipo from e) = 'central'
               then (ie.estoque_nativo_id is null or ie.estoque_nativo_id = p_estoque_id)
               else exists (select 1 from itens_estoque_niveis n where n.item_id = ie.id and n.estoque_id = p_estoque_id)
                    or exists (select 1 from saldos_estoque s where s.item_id = ie.id and s.estoque_id = p_estoque_id and s.quantidade_atual <> 0)
          end)
),
blocos as (
  select bloco, count(*) as itens from itens group by bloco
),
-- Última contagem do bloco: qualquer contagem processada em que algum item
-- da categoria foi contado (as contagens completas antigas contam).
ultima as (
  select coalesce(nullif(btrim(ie.categoria), ''), 'Sem categoria') as bloco, max(c.data_contagem::date) as dia
    from contagens_estoque c
    join contagens_estoque_itens ci on ci.contagem_id = c.id and ci.quantidade_contada is not null
    join itens_estoque ie on ie.id = ci.item_estoque_id
   where c.estoque_id = p_estoque_id and c.status = 'processada'
   group by 1
  union all
  select '__zerados', max(c.data_contagem::date)
    from contagens_estoque c
   where c.estoque_id = p_estoque_id and c.status = 'processada' and c.bloco = '__zerados'
),
hoje_c as (
  select distinct on (c.bloco) c.bloco, c.id, c.status, c.total_itens_contados,
         (select count(*) from contagens_estoque_itens ci where ci.contagem_id = c.id and ci.quantidade_contada is not null) as contados,
         (select count(*) from contagens_estoque_itens ci where ci.contagem_id = c.id) as total
    from contagens_estoque c
   where c.estoque_id = p_estoque_id and c.bloco is not null
     and c.data_contagem::date = (select d from hoje) and c.status <> 'cancelada'
   order by c.bloco, (c.status = 'em_andamento') desc, c.criado_em desc
),
zerados as (
  select count(*) as itens from fn_contagem_itens_do_bloco(p_estoque_id, '__zerados')
),
linhas as (
  select b.bloco, b.itens, coalesce(cc.ciclo_dias, 7) as ciclo_dias, u.dia as ultima_contagem,
         case when u.dia is null then null else u.dia + coalesce(cc.ciclo_dias, 7) end as vence_em,
         hc.id as contagem_hoje_id, hc.status as contagem_hoje_status, hc.contados as contados_hoje, hc.total as total_hoje,
         false as especial
    from blocos b
    left join contagem_ciclos cc on cc.categoria = b.bloco
    left join ultima u on u.bloco = b.bloco
    left join hoje_c hc on hc.bloco = b.bloco
  union all
  select '__zerados', (select itens from zerados), 1, u.dia, null,
         hc.id, hc.status, hc.contados, hc.total, true
    from (select 1) x
    left join ultima u on u.bloco = '__zerados'
    left join hoje_c hc on hc.bloco = '__zerados'
   where (select itens from zerados) > 0
),
classificadas as (
  select l.*,
         case when l.contagem_hoje_status = 'processada' then 'concluido_hoje'
              when l.contagem_hoje_status in ('em_andamento', 'finalizada') then 'em_andamento'
              when l.especial then 'vence_hoje'
              when l.ultima_contagem is null then 'nunca'
              when l.vence_em < (select d from hoje) then 'atrasado'
              when l.vence_em = (select d from hoje) then 'vence_hoje'
              else 'em_dia' end as situacao
    from linhas l
)
select jsonb_build_object(
  'hoje', (select d from hoje),
  'estoque', (select jsonb_build_object('id', id, 'nome', nome, 'tipo', tipo) from e),
  'blocos', coalesce((select jsonb_agg(jsonb_build_object(
      'bloco', bloco, 'especial', especial, 'itens', itens, 'ciclo_dias', ciclo_dias,
      'ultima_contagem', ultima_contagem, 'vence_em', vence_em, 'situacao', situacao,
      'contagem_hoje_id', contagem_hoje_id, 'contagem_hoje_status', contagem_hoje_status,
      'contados_hoje', contados_hoje, 'total_hoje', total_hoje)
      order by case situacao when 'em_andamento' then 0 when 'atrasado' then 1 when 'vence_hoje' then 2 when 'nunca' then 3 when 'em_dia' then 4 else 5 end,
               especial desc, itens desc, bloco)
    from classificadas), '[]'::jsonb),
  'resumo', (select jsonb_build_object(
      'blocos', count(*),
      'devidos_hoje', count(*) filter (where situacao in ('atrasado', 'vence_hoje', 'nunca', 'em_andamento', 'concluido_hoje') and not especial),
      'concluidos_hoje', count(*) filter (where situacao = 'concluido_hoje'),
      'em_andamento', count(*) filter (where situacao = 'em_andamento'),
      'faltam_itens', coalesce(sum(case when situacao in ('atrasado', 'vence_hoje', 'nunca') and not especial then itens
                                        when situacao = 'em_andamento' then greatest(total_hoje - contados_hoje, 0) else 0 end), 0))
    from classificadas)
);
$$;

-- ─── 4. Abrir um bloco (cria a contagem só com os itens dele) ────────────────
create or replace function public.fn_contagem_bloco_abrir(p_estoque_id uuid, p_bloco text, p_responsavel text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_id uuid; v_n int;
  v_nome text := case when p_bloco = '__zerados' then 'Zerados na última contagem' else p_bloco end;
begin
  if not exists (select 1 from estoques where id = p_estoque_id and status = true) then raise exception 'Estoque não encontrado'; end if;

  -- Já tem uma em andamento hoje para este bloco: continua nela.
  select id into v_id from contagens_estoque
   where estoque_id = p_estoque_id and bloco = p_bloco and status = 'em_andamento'
     and data_contagem::date = v_hoje
   order by criado_em desc limit 1;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'criada', false, 'bloco', p_bloco, 'nome', v_nome);
  end if;

  insert into contagens_estoque (estoque_id, responsavel, observacoes, criado_por, bloco, status)
  values (p_estoque_id, coalesce(nullif(btrim(p_responsavel), ''), 'Bloco'), 'Bloco: ' || v_nome, auth.uid(), p_bloco, 'em_andamento')
  returning id into v_id;

  insert into contagens_estoque_itens (contagem_id, item_estoque_id, quantidade_sistema, valor_unitario)
  select v_id, b.item_id, calcular_saldo_item_estoque(b.item_id, p_estoque_id), coalesce(ie.custo_medio, 0)
    from fn_contagem_itens_do_bloco(p_estoque_id, p_bloco) b
    join itens_estoque ie on ie.id = b.item_id
   order by ie.nome;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    delete from contagens_estoque where id = v_id;
    raise exception 'Bloco sem itens para contar';
  end if;

  return jsonb_build_object('id', v_id, 'criada', true, 'bloco', p_bloco, 'nome', v_nome, 'itens', v_n);
end;
$$;

-- ─── 5. Concluir bloco = finalizar + processar, num passo ────────────────────
create or replace function public.fn_contagem_bloco_concluir(p_contagem_id uuid, p_usuario_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fin json; v_proc jsonb; v_status text;
begin
  select status into v_status from contagens_estoque where id = p_contagem_id;
  if v_status is null then return jsonb_build_object('success', false, 'error', 'Contagem não encontrada'); end if;
  if v_status = 'em_andamento' then
    v_fin := finalizar_contagem_estoque(p_contagem_id);
    if coalesce((v_fin->>'success')::boolean, false) = false then return v_fin::jsonb; end if;
  elsif v_status <> 'finalizada' then
    return jsonb_build_object('success', false, 'error', 'Contagem já ' || v_status);
  end if;
  v_proc := processar_contagem_estoque(p_contagem_id, p_usuario_id);
  return v_proc || jsonb_build_object('finalizada', coalesce(v_fin::jsonb, '{}'::jsonb));
end;
$$;

-- ─── 6. Permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_contagem_ciclo_definir(text, integer) from public, anon;
revoke all on function public.fn_contagem_itens_do_bloco(uuid, text) from public, anon;
revoke all on function public.fn_contagem_blocos(uuid) from public, anon;
revoke all on function public.fn_contagem_bloco_abrir(uuid, text, text) from public, anon;
revoke all on function public.fn_contagem_bloco_concluir(uuid, uuid) from public, anon;
grant execute on function public.fn_contagem_ciclo_definir(text, integer) to authenticated;
grant execute on function public.fn_contagem_itens_do_bloco(uuid, text) to authenticated;
grant execute on function public.fn_contagem_blocos(uuid) to authenticated;
grant execute on function public.fn_contagem_bloco_abrir(uuid, text, text) to authenticated;
grant execute on function public.fn_contagem_bloco_concluir(uuid, uuid) to authenticated;
