-- Relatório de contagem (Bar e Central): linhas por estoque e item.
-- Troque __DATA__ pela data da contagem (horário de Cuiabá), ex.: '2026-10-26'.
-- Rodar com mcp__Supabase__execute_sql no projeto nzdiojmrukdxavrdazot e salvar o JSON da coluna "r".
--
-- Para cada item contado na contagem do dia (processada), em cada estoque:
--   anterior  = o que a contagem anterior achou (null se o item não foi contado nela)
--   entrou    = compras + transferências (entrando − saindo) + correções, entre as duas contagens
--   vendeu    = baixas da Zig (origem_tipo 'zig') entre as duas contagens
--   deveria   = saldo do sistema na hora de fechar = anterior + entrou − vendeu
--   contado   = o que foi contado hoje
--   pos_qtd   = acertos lançados depois do fechamento (correções de transferência, zerar negativo, complemento)
with est(id, nome) as (values
  ('10b3aacf-61b1-4add-91ac-0949d3e7f3a3'::uuid, 'Bar'),
  ('ea043464-d54e-4f42-8e40-4edddc5b4b51'::uuid, 'Central')),
atual as (
  select c.*, e.nome est_nome from contagens_estoque c join est e on e.id = c.estoque_id
  where c.status = 'processada' and (c.data_contagem at time zone 'America/Cuiaba')::date = '__DATA__'::date),
janela as (
  select a.estoque_id, min(a.criado_em) abriu, max(a.processado_em) t1,
    (select max(p.processado_em) from contagens_estoque p
      where p.estoque_id = a.estoque_id and p.status = 'processada' and p.processado_em < min(a.criado_em)) t0
  from atual a group by a.estoque_id),
anterior as (
  select distinct on (p.estoque_id, pi.item_estoque_id) p.estoque_id, pi.item_estoque_id, pi.quantidade_contada,
    (p.data_contagem at time zone 'America/Cuiaba')::date dia
  from contagens_estoque p join contagens_estoque_itens pi on pi.contagem_id = p.id
  join janela j on j.estoque_id = p.estoque_id
  where p.status = 'processada' and p.processado_em <= j.t0 and pi.quantidade_contada is not null
    and p.processado_em > j.t0 - interval '3 days'
  order by p.estoque_id, pi.item_estoque_id, p.processado_em desc),
linhas as (
  select a.est_nome est, a.estoque_id, ci.item_estoque_id item_id, i.nome, i.categoria, i.unidade_medida um,
    ci.quantidade_sistema deveria, ci.quantidade_contada contado, coalesce(ci.valor_unitario, 0) custo, ci.partes,
    j.t0, j.t1
  from atual a join contagens_estoque_itens ci on ci.contagem_id = a.id
  join itens_estoque i on i.id = ci.item_estoque_id join janela j on j.estoque_id = a.estoque_id
  where ci.quantidade_contada is not null)
select json_build_object(
  'contagem', (select to_char(min(a.data_contagem at time zone 'America/Cuiaba'), 'DD/MM/YYYY') from atual a),
  'itens_por_estoque', (select json_object_agg(x.est_nome, x.n) from (
      select a.est_nome, count(*) n from atual a join contagens_estoque_itens ci on ci.contagem_id = a.id
      where ci.quantidade_contada is not null group by a.est_nome) x),
  'acertos', (select json_agg(json_build_object(
      'est', e.nome, 'item', i.nome, 'cat', i.categoria,
      'qtd', round(case when mv.estoque_destino_id = e.id then mv.quantidade else -mv.quantidade end, 3),
      'custo_total', round(coalesce(mv.custo_total, 0), 2), 'tipo', mv.tipo_movimentacao,
      'origem', mv.origem_tipo, 'motivo', mv.motivo, 'obs', mv.observacoes,
      'saldo', (select round(s.quantidade_atual, 3) from saldos_estoque s where s.item_id = mv.item_id and s.estoque_id = e.id),
      'contado_hoje', exists (select 1 from atual a join contagens_estoque_itens ci on ci.contagem_id = a.id
        where a.estoque_id = e.id and ci.item_estoque_id = mv.item_id and ci.quantidade_contada is not null),
      'custo_un', (select round(coalesce(nullif(s.custo_medio, 0), i.custo_medio, 0), 4) from saldos_estoque s where s.item_id = mv.item_id and s.estoque_id = e.id)) order by i.nome, e.nome)
    from movimentacoes_estoque mv join itens_estoque i on i.id = mv.item_id
    join est e on e.id in (mv.estoque_origem_id, mv.estoque_destino_id)
    join janela j on j.estoque_id = e.id
    where mv.criado_em > j.t1 and mv.criado_em < j.t1 + interval '2 days'
      and coalesce(mv.origem_tipo, '') in ('correcao', 'contagem')),
  'janela', (select json_agg(json_build_object('est', e.nome,
      't0', to_char(j.t0 at time zone 'America/Cuiaba', 'DD/MM HH24:MI'),
      't1', to_char(j.t1 at time zone 'America/Cuiaba', 'DD/MM HH24:MI')))
    from janela j join est e on e.id = j.estoque_id),
  'linhas', (select json_agg(json_build_object(
      'est', l.est, 'item', l.nome, 'cat', l.categoria, 'um', l.um,
      'anterior', (select round(an.quantidade_contada, 3) from anterior an where an.estoque_id = l.estoque_id and an.item_estoque_id = l.item_id),
      'anterior_dia', (select to_char(an.dia, 'DD/MM') from anterior an where an.estoque_id = l.estoque_id and an.item_estoque_id = l.item_id),
      'entrou', round(coalesce(m.entrou, 0), 3), 'vendeu', round(coalesce(m.vendeu, 0), 3),
      'deveria', round(l.deveria, 3), 'contado', round(l.contado, 3), 'custo', round(l.custo, 4),
      'pos_qtd', round(coalesce(p.qtd, 0), 3), 'pos_obs', p.obs, 'partes', l.partes) order by l.nome, l.est)
    from linhas l
    left join lateral (
      select sum(case when mv.origem_tipo = 'zig' then 0
                      when mv.estoque_destino_id = l.estoque_id then mv.quantidade
                      when mv.estoque_origem_id = l.estoque_id then -mv.quantidade else 0 end) entrou,
             sum(case when mv.origem_tipo = 'zig' and mv.estoque_origem_id = l.estoque_id then mv.quantidade
                      when mv.origem_tipo = 'zig' and mv.estoque_destino_id = l.estoque_id then -mv.quantidade else 0 end) vendeu
      from movimentacoes_estoque mv
      where mv.item_id = l.item_id and mv.criado_em > l.t0 and mv.criado_em < l.t1
        and coalesce(mv.origem_tipo, '') <> 'contagem'
        and (mv.estoque_origem_id = l.estoque_id or mv.estoque_destino_id = l.estoque_id)) m on true
    left join lateral (
      select sum(case when mv.estoque_destino_id = l.estoque_id then mv.quantidade else -mv.quantidade end) qtd,
             string_agg(distinct mv.motivo, ' / ') obs
      from movimentacoes_estoque mv
      where mv.item_id = l.item_id and mv.criado_em > l.t1 and coalesce(mv.origem_tipo, '') in ('correcao', 'contagem')
        and (mv.estoque_origem_id = l.estoque_id or mv.estoque_destino_id = l.estoque_id)) p on true)
) r;
