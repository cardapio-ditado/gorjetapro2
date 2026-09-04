-- ═══════════════════════════════════════════════════════════════════════════
-- TAXA RETIDA PELA ADQUIRENTE — o fim do "AJUSTE SALDO"
--
-- As vendas em cartão entram pelo valor líquido (o que a ZIG/PagSeguro
-- deposita). A taxa da adquirente é lançada como conta a pagar e "paga" pela
-- conta do PagSeguro — mas esse dinheiro nunca saiu: já veio descontado. Para
-- o saldo bater, lançava-se um crédito "AJUSTE SALDO" sem categoria, que
-- inflava as entradas e ficava sem origem.
--
-- Agora a história é contada como aconteceu: a venda vale o valor cheio, a
-- adquirente ficou com a taxa, o resto caiu na conta.
--   1. categoria "Taxa retida pela adquirente (complemento do bruto)" sob
--      Receitas Operacionais;
--   2. forma de pagamento "RETIDO PELA ADQUIRENTE";
--   3. gatilho: toda saída de conta a pagar com essa forma gera sozinha a
--      entrada de complemento na categoria certa (e some junto no estorno);
--   4. os ajustes de julho e agosto de 2026 reclassificados;
--   5. o fechamento de sócios informa quanto ficou com a adquirente.
-- ═══════════════════════════════════════════════════════════════════════════

-- 0. a coluna origem aceita uma lista fixa; entra a nova origem
alter table fluxo_caixa drop constraint if exists fluxo_caixa_origem_check;
alter table fluxo_caixa add constraint fluxo_caixa_origem_check
  check (origem = any (array['manual'::text, 'conta_pagar'::text, 'conta_receber'::text, 'recorrente'::text, 'transferencia'::text, 'retencao_adquirente'::text]));

-- 1. categoria
insert into categorias_financeiras (nome, tipo, categoria_pai_id, descricao, status, ordem, grupo_dre)
select 'Taxa retida pela adquirente (complemento do bruto)', 'receita', p.id,
       'Complemento que leva a venda em cartão ao valor cheio. A taxa correspondente está em Tarifas Bancárias, paga com a forma "Retido pela adquirente".',
       'ativo', 99, 'receita_bruta'
  from categorias_financeiras p
 where p.nome = 'Receitas Operacionais' and p.categoria_pai_id is null
   and not exists (select 1 from categorias_financeiras where nome = 'Taxa retida pela adquirente (complemento do bruto)');

-- 2. forma de pagamento
insert into formas_pagamento (nome, observacoes, status)
select 'RETIDO PELA ADQUIRENTE',
       'A adquirente (ZIG, PagSeguro) descontou antes de depositar. O dinheiro não sai da conta: o sistema lança junto o complemento do valor bruto como receita.',
       'ativo'
 where not exists (select 1 from formas_pagamento where nome = 'RETIDO PELA ADQUIRENTE');

-- 3. gatilho
create or replace function public.fn_fluxo_retencao_adquirente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_forma_retida uuid;
  v_forma_linha  uuid;
  v_categoria    uuid;
begin
  select id into v_forma_retida from formas_pagamento where nome = 'RETIDO PELA ADQUIRENTE' limit 1;
  if v_forma_retida is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.tipo <> 'saida' or coalesce(new.origem, '') <> 'conta_pagar' then
      return new;
    end if;
    v_forma_linha := new.forma_pagamento_id;
    if v_forma_linha is null and new.pagamento_id is not null then
      select forma_pagamento_id into v_forma_linha from pagamentos_contas where id = new.pagamento_id;
    end if;
    if v_forma_linha is distinct from v_forma_retida then
      return new;
    end if;

    select id into v_categoria from categorias_financeiras
     where nome = 'Taxa retida pela adquirente (complemento do bruto)' limit 1;

    insert into fluxo_caixa (tipo, valor, data, descricao, categoria_id, conta_bancaria_id, forma_pagamento_id, origem, observacoes, criado_por)
    values ('entrada', new.valor, new.data,
            'Complemento do valor bruto — taxa retida pela adquirente (' || coalesce(nullif(trim(replace(new.descricao, 'Pagamento:', '')), ''), 'taxa') || ')',
            v_categoria, new.conta_bancaria_id, v_forma_retida, 'retencao_adquirente',
            'Gerado automaticamente. Compensa a saída ' || new.id::text || (case when new.pagamento_id is not null then ' (pagamento ' || new.pagamento_id::text || ')' else '' end) || '. A taxa já veio descontada pela adquirente; este lançamento leva a venda ao valor cheio.',
            new.criado_por);
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.tipo = 'saida' and coalesce(old.origem, '') = 'conta_pagar' then
      delete from fluxo_caixa
       where origem = 'retencao_adquirente'
         and observacoes like '%' || old.id::text || '%';
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_fluxo_retencao_adquirente on fluxo_caixa;
create trigger trg_fluxo_retencao_adquirente
  after insert or delete on fluxo_caixa
  for each row execute function public.fn_fluxo_retencao_adquirente();

-- 4. reclassificação dos ajustes de julho e agosto de 2026
create table if not exists _backup_ajustes_adquirente_20260904 as
  select *, now() as salvo_em from fluxo_caixa where false;
insert into _backup_ajustes_adquirente_20260904
  select *, now() from fluxo_caixa
   where id in ('1a4b024c-515b-4f58-b13c-e7f80adbdf4c', '32857c84-63d8-4d76-aa01-d02f7e7e6512');

-- agosto: 19.385,23 = 15.953,96 (ZIG) + 3.431,27 (PagSeguro), exato
update fluxo_caixa f
   set categoria_id = c.id,
       origem = 'retencao_adquirente',
       forma_pagamento_id = (select id from formas_pagamento where nome = 'RETIDO PELA ADQUIRENTE'),
       descricao = 'Complemento do valor bruto — taxa retida pela adquirente (ZIG R$ 15.953,96 + PagSeguro R$ 3.431,27)',
       observacoes = coalesce(f.observacoes || ' | ', '') || 'Reclassificado em 04/09/2026: era "AJUSTE SALDO" sem categoria. Compensa as saídas 68860d3f (ZIG) e 173c4166 (PagSeguro) de 31/08/2026.'
  from categorias_financeiras c
 where f.id = '32857c84-63d8-4d76-aa01-d02f7e7e6512'
   and c.nome = 'Taxa retida pela adquirente (complemento do bruto)';

-- julho: 12.467,81 lançados; as taxas de julho somam 9.467,81 (ZIG 8.854,41 + PagSeguro 613,40).
-- Os R$ 3.000,00 restantes não são taxa: ficam como ajuste, à parte, para não virar receita.
update fluxo_caixa f
   set valor = 9467.81,
       categoria_id = c.id,
       origem = 'retencao_adquirente',
       forma_pagamento_id = (select id from formas_pagamento where nome = 'RETIDO PELA ADQUIRENTE'),
       descricao = 'Complemento do valor bruto — taxa retida pela adquirente (ZIG R$ 8.854,41 + PagSeguro R$ 613,40)',
       observacoes = coalesce(f.observacoes || ' | ', '') || 'Reclassificado em 04/09/2026: era "AJUSTE ZIG/PAGSEGURO" de R$ 12.467,81 sem categoria. A parte que corresponde às taxas de julho ficou aqui; os R$ 3.000,00 restantes foram separados num ajuste próprio.'
  from categorias_financeiras c
 where f.id = '1a4b024c-515b-4f58-b13c-e7f80adbdf4c'
   and c.nome = 'Taxa retida pela adquirente (complemento do bruto)';

insert into fluxo_caixa (tipo, valor, data, descricao, conta_bancaria_id, origem, observacoes, criado_por)
select 'entrada', 3000.00, data, 'AJUSTE SALDO — parcela de 31/07/2026 não explicada pelas taxas de cartão (conferir)',
       conta_bancaria_id, 'manual',
       'Separado em 04/09/2026 do ajuste de R$ 12.467,81: R$ 9.467,81 eram taxas de adquirência (reclassificadas); estes R$ 3.000,00 não têm origem identificada.',
       criado_por
  from fluxo_caixa where id = '1a4b024c-515b-4f58-b13c-e7f80adbdf4c'
   and not exists (select 1 from fluxo_caixa where observacoes like 'Separado em 04/09/2026 do ajuste de R$ 12.467,81%');

-- 5. o fechamento informa quanto ficou com a adquirente
create or replace function public.fn_fechamento_socios_periodo(
  p_inicio date, p_fim date, p_com_anterior boolean default true, p_com_extrato boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with contas as (
  select b.id, b.banco, b.tipo_conta, coalesce(b.saldo_inicial, 0) as saldo_inicial
    from bancos_contas b
   where b.status = 'ativo'
),
saldo_ini as (
  select c.id, c.banco, c.tipo_conta,
         c.saldo_inicial + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0) as saldo
    from contas c
    left join fluxo_caixa f on f.conta_bancaria_id = c.id and f.data < p_inicio
   group by c.id, c.banco, c.tipo_conta, c.saldo_inicial
),
saldo_fim as (
  select c.id, c.banco, c.tipo_conta,
         c.saldo_inicial + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0) as saldo
    from contas c
    left join fluxo_caixa f on f.conta_bancaria_id = c.id and f.data <= p_fim
   group by c.id, c.banco, c.tipo_conta, c.saldo_inicial
),
mov as (
  select f.id, f.data, f.tipo, f.valor, f.categoria_id, f.descricao, f.origem,
         coalesce(p.id, c.id)               as grupo_id,
         coalesce(p.nome, c.nome)           as grupo_nome,
         coalesce(p.grupo_dre, c.grupo_dre) as grupo_dre,
         c.nome                             as categoria_nome,
         b.banco                            as conta_nome,
         fp.nome                            as forma_nome
    from fluxo_caixa f
    left join categorias_financeiras c on c.id = f.categoria_id
    left join categorias_financeiras p on p.id = c.categoria_pai_id
    left join bancos_contas b on b.id = f.conta_bancaria_id
    left join formas_pagamento fp on fp.id = f.forma_pagamento_id
   where f.data between p_inicio and p_fim
),
mov_op as (
  select * from mov where coalesce(origem, '') <> 'transferencia'
),
cat as (
  select tipo, grupo_id, grupo_nome, grupo_dre, categoria_nome,
         sum(valor) as total, count(*) as qtd
    from mov_op
   where categoria_id is not null
   group by 1, 2, 3, 4, 5
),
grp as (
  select tipo, grupo_id, grupo_nome, grupo_dre,
         sum(total) as total, sum(qtd) as qtd,
         jsonb_agg(jsonb_build_object('nome', categoria_nome, 'total', total, 'qtd', qtd) order by total desc) as categorias
    from cat
   group by 1, 2, 3, 4
),
bloco as (
  select tipo,
         sum(total) as total_categorizado,
         jsonb_agg(jsonb_build_object(
           'id', grupo_id, 'nome', grupo_nome, 'grupo_dre', grupo_dre,
           'total', total, 'qtd', qtd, 'categorias', categorias
         ) order by total desc) as grupos
    from grp
   group by tipo
),
semcat as (
  select tipo, sum(valor) as total, count(*) as qtd
    from mov_op
   where categoria_id is null
   group by tipo
),
transf as (
  select coalesce(sum(case when tipo = 'entrada' then valor else 0 end), 0) as entradas,
         coalesce(sum(case when tipo = 'saida'   then valor else 0 end), 0) as saidas
    from mov
   where origem = 'transferencia'
),
retido as (
  select coalesce(sum(valor), 0) as total, count(*) as qtd
    from mov
   where tipo = 'entrada' and origem = 'retencao_adquirente'
),
sem_conta as (
  select coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0) as liquido, count(*) as qtd
    from fluxo_caixa f
   where f.data between p_inicio and p_fim
     and f.conta_bancaria_id is null
),
extrato as (
  select jsonb_agg(jsonb_build_object(
           'data', data, 'tipo', tipo, 'valor', valor, 'descricao', descricao,
           'grupo', grupo_nome, 'categoria', categoria_nome, 'conta', conta_nome,
           'forma', forma_nome, 'origem', origem
         ) order by data, id) as linhas
    from mov
)
select jsonb_build_object(
  'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'dias', (p_fim - p_inicio + 1)),
  'saldo_inicial', jsonb_build_object(
     'total', (select coalesce(sum(saldo), 0) from saldo_ini),
     'contas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'banco', banco, 'tipo', tipo_conta, 'saldo', saldo) order by banco), '[]'::jsonb) from saldo_ini)),
  'saldo_final', jsonb_build_object(
     'total', (select coalesce(sum(saldo), 0) from saldo_fim),
     'contas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'banco', banco, 'tipo', tipo_conta, 'saldo', saldo) order by banco), '[]'::jsonb) from saldo_fim)),
  'entradas', jsonb_build_object(
     'total', coalesce((select total_categorizado from bloco where tipo = 'entrada'), 0) + coalesce((select total from semcat where tipo = 'entrada'), 0),
     'grupos', coalesce((select grupos from bloco where tipo = 'entrada'), '[]'::jsonb),
     'sem_categoria', jsonb_build_object('total', coalesce((select total from semcat where tipo = 'entrada'), 0), 'qtd', coalesce((select qtd from semcat where tipo = 'entrada'), 0))),
  'saidas', jsonb_build_object(
     'total', coalesce((select total_categorizado from bloco where tipo = 'saida'), 0) + coalesce((select total from semcat where tipo = 'saida'), 0),
     'grupos', coalesce((select grupos from bloco where tipo = 'saida'), '[]'::jsonb),
     'sem_categoria', jsonb_build_object('total', coalesce((select total from semcat where tipo = 'saida'), 0), 'qtd', coalesce((select qtd from semcat where tipo = 'saida'), 0))),
  'transferencias', (select jsonb_build_object('entradas', entradas, 'saidas', saidas, 'liquido', entradas - saidas) from transf),
  'retido_adquirente', (select jsonb_build_object('total', total, 'qtd', qtd) from retido),
  'sem_conta', (select jsonb_build_object('liquido', liquido, 'qtd', qtd) from sem_conta),
  'extrato', case when p_com_extrato then coalesce((select linhas from extrato), '[]'::jsonb) else null end,
  'anterior', case when p_com_anterior then (
     select jsonb_build_object(
       'inicio', a->'periodo'->>'inicio', 'fim', a->'periodo'->>'fim',
       'saldo_inicial', a->'saldo_inicial'->'total',
       'entradas', a->'entradas'->'total',
       'saidas', a->'saidas'->'total',
       'saldo_final', a->'saldo_final'->'total')
       from fn_fechamento_socios_periodo(
         p_inicio - (p_fim - p_inicio + 1), p_inicio - 1, false, false) a
  ) else null end
);
$$;
