-- ═══════════════════════════════════════════════════════════════════════════
-- CADASTRO DO BALCÃO
--
-- Cada balcão (Bar, Cozinha) passa a ter um cadastro explícito: quais itens
-- ficam nele, a quantidade para abrir a casa (nível) e como o item é
-- controlado:
--   venda    = a venda ZIG dá baixa; a reposição sai da diferença nível − saldo
--   contagem = não baixa com a venda (frutas, condimentos, gelo...); o balcão
--              conta pelo link e a reposição só entra depois da contagem
-- Antes o sistema deduzia isso do mapeamento/ficha técnica, e errava (ex.:
-- morango em fichas com "baixa estoque" desligado). Agora a dedução vira só
-- uma sugestão na tela; quem manda é o cadastro.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.itens_estoque_niveis add column if not exists controle text not null default 'venda';
alter table public.itens_estoque_niveis drop constraint if exists itens_estoque_niveis_controle_check;
alter table public.itens_estoque_niveis add constraint itens_estoque_niveis_controle_check check (controle in ('venda', 'contagem'));
comment on column public.itens_estoque_niveis.controle is 'venda = baixa pela venda ZIG; contagem = não baixa, o balcão conta';

-- O que o sistema detecta (vira sugestão na tela)
create or replace function public.fn_balcao_detectar_baixa(p_item_id uuid, p_estoque_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from mapeamento_itens_vendas m
                  where m.item_estoque_id = p_item_id and m.estoque_id = p_estoque_id and not coalesce(m.ignorar_estoque, false)) then 'vendido'
    when exists (select 1 from ficha_ingredientes fi
                   join mapeamento_itens_vendas m on m.ficha_tecnica_id = fi.ficha_id and m.estoque_id = p_estoque_id
                  where fi.item_estoque_id = p_item_id and coalesce(fi.baixa_estoque, true)) then 'ficha'
    else 'sem_baixa' end;
$$;

-- Semente: o que hoje é deduzido como "sem baixa" vira controle = contagem
update public.itens_estoque_niveis n
   set controle = 'contagem'
 where fn_balcao_detectar_baixa(n.item_id, n.estoque_id) = 'sem_baixa';

-- ─── Cadastro completo de um balcão para a tela ──────────────────────────────
create or replace function public.fn_balcao_cadastro(p_estoque_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
with central as (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1)
select jsonb_build_object(
  'estoque_id', p_estoque_id,
  'nome', (select nome from estoques where id = p_estoque_id),
  'itens', coalesce((select jsonb_agg(jsonb_build_object(
      'item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida,
      'nivel', n.nivel_reposicao, 'controle', n.controle,
      'detectado', fn_balcao_detectar_baixa(i.id, p_estoque_id),
      'saldo_local', round(coalesce(sl.quantidade_atual, 0), 3),
      'saldo_central', round(coalesce(sc.quantidade_atual, 0), 3),
      'ultima_contagem', bc.contado_em,
      'vendas_30d', coalesce((select sum(m.quantidade) from movimentacoes_estoque m
                               where m.item_id = i.id and m.estoque_origem_id = p_estoque_id and m.origem_tipo = 'zig'
                                 and m.data_movimentacao > current_date - 30), 0)
    ) order by i.categoria nulls last, i.nome)
    from itens_estoque_niveis n
    join itens_estoque i on i.id = n.item_id and i.status = 'ativo'
    left join saldos_estoque sl on sl.item_id = i.id and sl.estoque_id = p_estoque_id
    left join saldos_estoque sc on sc.item_id = i.id and sc.estoque_id = (select id from central)
    left join balcao_contagens bc on bc.item_id = i.id and bc.estoque_id = p_estoque_id
   where n.estoque_id = p_estoque_id), '[]'::jsonb)
);
$$;

-- Salvar um item do cadastro (insere ou atualiza)
create or replace function public.fn_balcao_cadastro_salvar(
  p_estoque_id uuid, p_item_id uuid, p_nivel numeric, p_controle text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_controle not in ('venda', 'contagem') then raise exception 'controle inválido: %', p_controle; end if;
  if p_nivel is null or p_nivel < 0 then raise exception 'Nível inválido'; end if;
  insert into itens_estoque_niveis (item_id, estoque_id, nivel_reposicao, controle, atualizado_em)
  values (p_item_id, p_estoque_id, p_nivel, p_controle, now())
  on conflict (item_id, estoque_id) do update
    set nivel_reposicao = excluded.nivel_reposicao, controle = excluded.controle, atualizado_em = now();
end;
$$;

-- ─── Dados do link do setor: grupo vem do cadastro ───────────────────────────
create or replace function public.fn_pedido_setor_dados(p_setor text)
returns jsonb
language sql stable security definer set search_path = public as $$
with s as (select * from fn_pedido_setor_estoque(p_setor)),
central as (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1),
itens as (
  select jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida,
           'nivel', n.nivel_reposicao,
           'saldo_local', round(coalesce(sl.quantidade_atual, 0), 3),
           'saldo_central', round(coalesce(sc.quantidade_atual, 0), 3),
           'grupo', case when n.controle = 'contagem' then 'sem_baixa'
                         else case fn_balcao_detectar_baixa(i.id, n.estoque_id) when 'vendido' then 'vendido' else 'ficha' end end,
           'fracionado', lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros'])
         ) order by i.categoria nulls last, i.nome) as lista
    from itens_estoque_niveis n
    join itens_estoque i on i.id = n.item_id and i.status = 'ativo'
    left join saldos_estoque sl on sl.item_id = n.item_id and sl.estoque_id = n.estoque_id
    left join saldos_estoque sc on sc.item_id = n.item_id and sc.estoque_id = (select id from central)
   where n.estoque_id = (select estoque_id from s)
),
outros as (
  select jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida,
           'saldo_central', round(coalesce(sc.quantidade_atual, 0), 3)) order by i.nome) as lista
    from itens_estoque i
    left join saldos_estoque sc on sc.item_id = i.id and sc.estoque_id = (select id from central)
   where i.status = 'ativo'
     and not exists (select 1 from itens_estoque_niveis n where n.item_id = i.id and n.estoque_id = (select estoque_id from s))
),
pessoas as (
  select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome_completo) order by c.nome_completo) as lista
    from colaboradores c join setores st on st.id = c.setor_id
   where c.status = 'ativo' and lower(st.nome) = lower((select setor_nome from s))
),
ultimos as (
  select jsonb_agg(jsonb_build_object(
           'numero', r.numero_requisicao, 'quando', r.data_requisicao, 'solicitante', r.funcionario_nome,
           'status', r.status, 'itens', (select count(*) from requisicoes_internas_itens ri where ri.requisicao_id = r.id),
           'entregue_em', r.data_conclusao) order by r.data_requisicao desc) as lista
    from (select * from requisicoes_internas
           where estoque_destino_id = (select estoque_id from s)
           order by data_requisicao desc limit 8) r
)
select case when (select estoque_id from s) is null then jsonb_build_object('erro', 'setor desconhecido')
       else jsonb_build_object(
         'setor', (select jsonb_build_object('slug', lower(trim(p_setor)), 'estoque_id', estoque_id, 'nome', setor_nome) from s),
         'central_id', (select id from central),
         'itens', coalesce((select lista from itens), '[]'::jsonb),
         'outros_itens', coalesce((select lista from outros), '[]'::jsonb),
         'pessoas', coalesce((select lista from pessoas), '[]'::jsonb),
         'ultimos_pedidos', coalesce((select lista from ultimos), '[]'::jsonb)
       ) end;
$$;

-- ─── Cálculo da reposição: grupo vem do cadastro ─────────────────────────────
create or replace function public.fn_reposicao_balcao_calcular(p_estoque_id uuid)
returns table (
  item_id uuid, nome text, categoria text, um text, nivel numeric,
  saldo_local numeric, saldo_central numeric, grupo text, fracionado boolean,
  sugestao numeric, contado_em timestamptz)
language sql stable security definer set search_path = public as $$
with central as (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1),
base as (
  select n.item_id, i.nome, i.categoria, i.unidade_medida as um, n.nivel_reposicao as nivel,
         round(coalesce(sl.quantidade_atual, 0), 3) as saldo_local,
         round(coalesce(sc.quantidade_atual, 0), 3) as saldo_central,
         case when n.controle = 'contagem' then 'sem_baixa'
              else case fn_balcao_detectar_baixa(n.item_id, n.estoque_id) when 'vendido' then 'vendido' else 'ficha' end end as grupo,
         lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros']) as fracionado,
         bc.contado_em
    from itens_estoque_niveis n
    join itens_estoque i on i.id = n.item_id and i.status = 'ativo'
    left join saldos_estoque sl on sl.item_id = n.item_id and sl.estoque_id = n.estoque_id
    left join saldos_estoque sc on sc.item_id = n.item_id and sc.estoque_id = (select id from central)
    left join balcao_contagens bc on bc.item_id = n.item_id and bc.estoque_id = n.estoque_id
   where n.estoque_id = p_estoque_id and coalesce(n.nivel_reposicao, 0) > 0
)
select item_id, nome, categoria, um, nivel, saldo_local, saldo_central, grupo, fracionado,
       case when nivel - greatest(saldo_local, 0) <= 0 then 0
            when fracionado then round(nivel - greatest(saldo_local, 0), 3)
            else ceil(nivel - greatest(saldo_local, 0)) end as sugestao,
       contado_em
  from base
 order by categoria nulls last, nome;
$$;

-- ─── Permissões ───────────────────────────────────────────────────────────────
revoke execute on function public.fn_balcao_detectar_baixa(uuid, uuid) from public;
revoke execute on function public.fn_balcao_cadastro(uuid) from public;
revoke execute on function public.fn_balcao_cadastro_salvar(uuid, uuid, numeric, text) from public;
grant execute on function public.fn_balcao_detectar_baixa(uuid, uuid) to authenticated, service_role;
grant execute on function public.fn_balcao_cadastro(uuid) to authenticated, service_role;
grant execute on function public.fn_balcao_cadastro_salvar(uuid, uuid, numeric, text) to authenticated, service_role;

-- ─── Semente do cadastro ──────────────────────────────────────────────────────
-- Itens que o Central transferiu para o balcão nos últimos 120 dias e que não
-- estavam no cadastro entram com nível 0 (a definir) e controle pelo que o
-- sistema detecta. Backup: _backup_itens_estoque_niveis_20260911.
create table if not exists public._backup_itens_estoque_niveis_20260911 as select * from public.itens_estoque_niveis;
with b as (select * from fn_reposicao_balcao_estoques()),
t as (
  select distinct b.estoque_id, m.item_id
    from movimentacoes_estoque m join b on b.estoque_id = m.estoque_destino_id
   where m.tipo_movimentacao = 'transferencia' and m.data_movimentacao > current_date - 120
)
insert into itens_estoque_niveis (item_id, estoque_id, nivel_reposicao, controle, atualizado_em)
select t.item_id, t.estoque_id, 0,
       case when fn_balcao_detectar_baixa(t.item_id, t.estoque_id) = 'sem_baixa' then 'contagem' else 'venda' end, now()
  from t join itens_estoque i on i.id = t.item_id and i.status = 'ativo'
 where not exists (select 1 from itens_estoque_niveis n where n.item_id = t.item_id and n.estoque_id = t.estoque_id);
