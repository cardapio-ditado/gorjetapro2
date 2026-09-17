-- ═════════════════════════════════════════════════════════════════════════════
-- Contagem: calendário (agenda) de blocos por dia
--
-- O gestor arrasta cada bloco para o dia da semana em que ele deve ser
-- contado e replica a semana para as próximas. Quando o estoque tem agenda,
-- o painel "Contagem do dia" obedece a ela (bloco agendado hoje = vence hoje;
-- agendado em dia passado e não contado desde então = atrasado). Sem agenda,
-- vale o ciclo por categoria de antes.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.contagem_agenda (
  id          uuid primary key default gen_random_uuid(),
  estoque_id  uuid not null references public.estoques(id) on delete cascade,
  bloco       text not null,
  dia         date not null,
  criado_em   timestamptz not null default now(),
  criado_por  uuid,
  unique (estoque_id, bloco, dia)
);
create index if not exists idx_contagem_agenda_estoque_dia on public.contagem_agenda(estoque_id, dia);
alter table public.contagem_agenda enable row level security;
revoke all on public.contagem_agenda from public, anon, authenticated;

-- ─── 1. Ler a agenda de um período (com o que já foi contado) ────────────────
create or replace function public.fn_contagem_agenda(p_estoque_id uuid, p_inicio date, p_fim date)
returns jsonb
language sql stable security definer set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Cuiaba')::date as d),
  contadas as (
    select c.bloco, c.data_contagem::date as dia, c.id, c.status
      from contagens_estoque c
     where c.estoque_id = p_estoque_id and c.bloco is not null and c.status <> 'cancelada'
       and c.data_contagem::date between p_inicio and p_fim
  )
  select jsonb_build_object(
    'hoje', (select d from hoje),
    'inicio', p_inicio, 'fim', p_fim,
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'bloco', a.bloco, 'dia', a.dia,
        'contagem_id', ct.id, 'contagem_status', ct.status,
        'situacao', case when ct.status = 'processada' then 'feita'
                         when ct.status in ('em_andamento', 'finalizada') then 'em_andamento'
                         when a.dia < (select d from hoje) then 'perdida'
                         when a.dia = (select d from hoje) then 'hoje'
                         else 'agendada' end)
        order by a.dia, a.bloco)
      from contagem_agenda a
      left join lateral (select id, status from contadas c where c.bloco = a.bloco and c.dia = a.dia order by (status = 'processada') desc limit 1) ct on true
      where a.estoque_id = p_estoque_id and a.dia between p_inicio and p_fim), '[]'::jsonb)
  );
$$;

-- ─── 2. Agendar / mover / remover ────────────────────────────────────────────
create or replace function public.fn_contagem_agenda_definir(p_estoque_id uuid, p_bloco text, p_dia date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_bloco is null or btrim(p_bloco) = '' then raise exception 'Bloco vazio'; end if;
  insert into contagem_agenda (estoque_id, bloco, dia, criado_por) values (p_estoque_id, p_bloco, p_dia, auth.uid())
  on conflict (estoque_id, bloco, dia) do update set criado_em = contagem_agenda.criado_em
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id, 'bloco', p_bloco, 'dia', p_dia);
end;
$$;

create or replace function public.fn_contagem_agenda_mover(p_id uuid, p_dia date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from contagem_agenda where id = p_id;
  if r.id is null then raise exception 'Agendamento não encontrado'; end if;
  if exists (select 1 from contagem_agenda where estoque_id = r.estoque_id and bloco = r.bloco and dia = p_dia and id <> p_id) then
    delete from contagem_agenda where id = p_id;   -- já existe no dia de destino: só some daqui
  else
    update contagem_agenda set dia = p_dia where id = p_id;
  end if;
  return jsonb_build_object('success', true, 'id', p_id, 'dia', p_dia);
end;
$$;

create or replace function public.fn_contagem_agenda_remover(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from contagem_agenda where id = p_id;
  return jsonb_build_object('success', true, 'id', p_id);
end;
$$;

-- ─── 3. Replicar a semana para as próximas N ─────────────────────────────────
-- Copia os agendamentos de [p_inicio, p_inicio+6] para as N semanas seguintes,
-- sem duplicar o que já existe.
create or replace function public.fn_contagem_agenda_replicar(p_estoque_id uuid, p_inicio date, p_semanas integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if p_semanas is null or p_semanas < 1 or p_semanas > 52 then raise exception 'Semanas entre 1 e 52'; end if;
  insert into contagem_agenda (estoque_id, bloco, dia, criado_por)
  select a.estoque_id, a.bloco, a.dia + (7 * s.n), auth.uid()
    from contagem_agenda a
    cross join generate_series(1, p_semanas) as s(n)
   where a.estoque_id = p_estoque_id and a.dia between p_inicio and p_inicio + 6
  on conflict (estoque_id, bloco, dia) do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('success', true, 'criados', v_n, 'semanas', p_semanas);
end;
$$;

-- Limpar a agenda a partir de uma data (para refazer).
create or replace function public.fn_contagem_agenda_limpar(p_estoque_id uuid, p_a_partir date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from contagem_agenda where estoque_id = p_estoque_id and dia >= p_a_partir;
  get diagnostics v_n = row_count;
  return jsonb_build_object('success', true, 'removidos', v_n);
end;
$$;

-- ─── 4. Painel do dia obedece à agenda quando ela existe ─────────────────────
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
agenda as (
  select bloco,
         bool_or(dia = (select d from hoje)) as agendado_hoje,
         max(dia) filter (where dia < (select d from hoje) and dia >= (select d from hoje) - 14) as anterior,
         min(dia) filter (where dia > (select d from hoje)) as proximo
    from contagem_agenda where estoque_id = p_estoque_id
   group by bloco
),
tem_agenda as (select exists (select 1 from contagem_agenda where estoque_id = p_estoque_id and dia >= (select d from hoje) - 14) as v),
linhas as (
  select b.bloco, b.itens, coalesce(cc.ciclo_dias, 7) as ciclo_dias, u.dia as ultima_contagem,
         case when (select v from tem_agenda) then coalesce(case when ag.agendado_hoje then (select d from hoje) end, ag.proximo)
              when u.dia is null then null else u.dia + coalesce(cc.ciclo_dias, 7) end as vence_em,
         hc.id as contagem_hoje_id, hc.status as contagem_hoje_status, hc.contados as contados_hoje, hc.total as total_hoje,
         false as especial,
         coalesce(ag.agendado_hoje, false) as agendado_hoje, ag.anterior as agendado_antes, ag.proximo as agendado_proximo
    from blocos b
    left join contagem_ciclos cc on cc.categoria = b.bloco
    left join ultima u on u.bloco = b.bloco
    left join hoje_c hc on hc.bloco = b.bloco
    left join agenda ag on ag.bloco = b.bloco
  union all
  select '__zerados', (select itens from zerados), 1, u.dia, null,
         hc.id, hc.status, hc.contados, hc.total, true, false, null, null
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
              when (select v from tem_agenda) then
                   case when l.agendado_hoje then 'vence_hoje'
                        when l.agendado_antes is not null and (l.ultima_contagem is null or l.ultima_contagem < l.agendado_antes) then 'atrasado'
                        when l.agendado_proximo is not null then 'em_dia'
                        else 'sem_agenda' end
              when l.ultima_contagem is null then 'nunca'
              when l.vence_em < (select d from hoje) then 'atrasado'
              when l.vence_em = (select d from hoje) then 'vence_hoje'
              else 'em_dia' end as situacao
    from linhas l
)
select jsonb_build_object(
  'hoje', (select d from hoje),
  'estoque', (select jsonb_build_object('id', id, 'nome', nome, 'tipo', tipo) from e),
  'tem_agenda', (select v from tem_agenda),
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

-- ─── 5. Permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_contagem_agenda(uuid, date, date) from public, anon;
revoke all on function public.fn_contagem_agenda_definir(uuid, text, date) from public, anon;
revoke all on function public.fn_contagem_agenda_mover(uuid, date) from public, anon;
revoke all on function public.fn_contagem_agenda_remover(uuid) from public, anon;
revoke all on function public.fn_contagem_agenda_replicar(uuid, date, integer) from public, anon;
revoke all on function public.fn_contagem_agenda_limpar(uuid, date) from public, anon;
grant execute on function public.fn_contagem_agenda(uuid, date, date) to authenticated;
grant execute on function public.fn_contagem_agenda_definir(uuid, text, date) to authenticated;
grant execute on function public.fn_contagem_agenda_mover(uuid, date) to authenticated;
grant execute on function public.fn_contagem_agenda_remover(uuid) to authenticated;
grant execute on function public.fn_contagem_agenda_replicar(uuid, date, integer) to authenticated;
grant execute on function public.fn_contagem_agenda_limpar(uuid, date) to authenticated;
