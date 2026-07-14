/*
  # Criar Extrato de Fluxo de Caixa Diário
  
  1. Objetivo
    - Criar view que mostra movimentação diária como extrato bancário
    - Calcular saldo anterior, entradas, saídas e saldo final por dia
    - Permitir filtros por período, conta bancária e centro de custo
  
  2. Funcionalidades
    - Saldo acumulado dia a dia
    - Entradas e saídas do dia
    - Quantidade de lançamentos
    - Formato similar a extrato bancário
*/

-- View simplificada consolidada (sem filtros)
CREATE OR REPLACE VIEW vw_extrato_consolidado AS
WITH movimentacao_diaria AS (
  SELECT 
    DATE(fc.data) as data,
    SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE 0 END) as total_entradas,
    SUM(CASE WHEN fc.tipo = 'saida' THEN ABS(fc.valor) ELSE 0 END) as total_saidas,
    COUNT(*) as quantidade_lancamentos,
    COUNT(CASE WHEN fc.tipo = 'entrada' THEN 1 END) as qtd_entradas,
    COUNT(CASE WHEN fc.tipo = 'saida' THEN 1 END) as qtd_saidas
  FROM fluxo_caixa fc
  GROUP BY DATE(fc.data)
),
saldos_acumulados AS (
  SELECT 
    md.data,
    md.total_entradas,
    md.total_saidas,
    md.quantidade_lancamentos,
    md.qtd_entradas,
    md.qtd_saidas,
    COALESCE(
      (
        SELECT SUM(
          CASE 
            WHEN fc2.tipo = 'entrada' THEN fc2.valor
            ELSE -ABS(fc2.valor)
          END
        )
        FROM fluxo_caixa fc2
        WHERE DATE(fc2.data) < md.data
      ),
      0
    ) as saldo_anterior,
    COALESCE(
      (
        SELECT SUM(
          CASE 
            WHEN fc2.tipo = 'entrada' THEN fc2.valor
            ELSE -ABS(fc2.valor)
          END
        )
        FROM fluxo_caixa fc2
        WHERE DATE(fc2.data) <= md.data
      ),
      0
    ) as saldo_final
  FROM movimentacao_diaria md
)
SELECT 
  data,
  saldo_anterior,
  total_entradas,
  total_saidas,
  saldo_final,
  quantidade_lancamentos,
  qtd_entradas,
  qtd_saidas,
  EXTRACT(YEAR FROM data) as ano,
  EXTRACT(MONTH FROM data) as mes,
  EXTRACT(DAY FROM data) as dia
FROM saldos_acumulados
ORDER BY data DESC;

ALTER VIEW vw_extrato_consolidado OWNER TO postgres;
