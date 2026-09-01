-- ═══════════════════════════════════════════════════════════════════════════
-- FÉRIAS — abono pecuniário ("vender férias"), CLT art. 143
--
-- O empregado pode converter 1/3 das férias em dinheiro: 10 dias de 30,
-- 8 de 24, 6 de 18, 4 de 12. Os dias vendidos saem do saldo do ano base
-- como se tivessem sido tirados. O saldo (dias_restantes) passa a ser
-- direito − tirados − vendidos.
-- ═══════════════════════════════════════════════════════════════════════════

alter table periodos_aquisitivos_ferias
  add column if not exists dias_vendidos integer not null default 0,
  add column if not exists abono_observacoes text;

alter table periodos_aquisitivos_ferias
  drop constraint if exists periodos_aquisitivos_ferias_abono_um_terco;
alter table periodos_aquisitivos_ferias
  add constraint periodos_aquisitivos_ferias_abono_um_terco
  check (dias_vendidos >= 0 and dias_vendidos * 3 <= coalesce(dias_direito, 30));

-- dias_restantes é coluna gerada; para trocar a fórmula é preciso recriá-la,
-- e a view de alertas a referencia.
drop view if exists vw_alertas_ferias_pendentes;

alter table periodos_aquisitivos_ferias drop column dias_restantes;
alter table periodos_aquisitivos_ferias
  add column dias_restantes integer
  generated always as (coalesce(dias_direito, 30) - coalesce(dias_gozados, 0) - dias_vendidos) stored;

create view vw_alertas_ferias_pendentes as
 SELECT af.id,
    af.colaborador_id,
    c.nome_completo,
    c.funcao_personalizada,
    af.tipo_alerta,
    af.prioridade,
    af.titulo,
    af.mensagem,
    af.data_alerta,
    af.dias_ate_vencimento,
    paf.periodo_aquisitivo_inicio,
    paf.periodo_aquisitivo_fim,
    paf.periodo_concessivo_fim,
    paf.dias_restantes,
    af.criado_em
   FROM ((alertas_ferias af
     JOIN colaboradores c ON ((c.id = af.colaborador_id)))
     LEFT JOIN periodos_aquisitivos_ferias paf ON ((paf.id = af.periodo_aquisitivo_id)))
  WHERE ((af.status = 'ativo'::text) AND (c.status = 'ativo'::text))
  ORDER BY
        CASE af.prioridade
            WHEN 'urgente'::text THEN 1
            WHEN 'alta'::text THEN 2
            WHEN 'media'::text THEN 3
            ELSE 4
        END, af.dias_ate_vencimento;

grant select on vw_alertas_ferias_pendentes to anon, authenticated;

select atualizar_status_periodos_aquisitivos();
