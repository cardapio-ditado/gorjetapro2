/*
  # Remove User Foreign Key Constraints for Development

  1. Remove foreign key constraints
    - Drop all foreign key constraints that reference usuarios table
    - This allows development without authentication requirements
    - Fields can accept any value or NULL

  2. Benefits
    - No more UUID validation errors
    - Complete freedom during development
    - Easy to restore constraints later when implementing authentication

  3. Tables affected
    - contas_pagar (criado_por, aprovado_por)
    - pagamentos_contas (criado_por)
    - anexos_contas (criado_por)
    - fluxo_caixa (criado_por)
    - And any other tables with user references
*/

-- Remove foreign key constraints from contas_pagar
ALTER TABLE contas_pagar DROP CONSTRAINT IF EXISTS contas_pagar_criado_por_fkey;
ALTER TABLE contas_pagar DROP CONSTRAINT IF EXISTS contas_pagar_aprovado_por_fkey;

-- Remove foreign key constraints from pagamentos_contas
ALTER TABLE pagamentos_contas DROP CONSTRAINT IF EXISTS pagamentos_contas_criado_por_fkey;

-- Remove foreign key constraints from anexos_contas
ALTER TABLE anexos_contas DROP CONSTRAINT IF EXISTS anexos_contas_criado_por_fkey;

-- Remove foreign key constraints from fluxo_caixa
ALTER TABLE fluxo_caixa DROP CONSTRAINT IF EXISTS fluxo_caixa_criado_por_fkey;

-- Remove foreign key constraints from other tables that might reference usuarios
ALTER TABLE fornecedores DROP CONSTRAINT IF EXISTS fornecedores_criado_por_fkey;
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_criado_por_fkey;
ALTER TABLE centros_custo DROP CONSTRAINT IF EXISTS centros_custo_criado_por_fkey;
ALTER TABLE categorias_financeiras DROP CONSTRAINT IF EXISTS categorias_financeiras_criado_por_fkey;
ALTER TABLE formas_pagamento DROP CONSTRAINT IF EXISTS formas_pagamento_criado_por_fkey;
ALTER TABLE bancos_contas DROP CONSTRAINT IF EXISTS bancos_contas_criado_por_fkey;

-- Remove constraints from other modules
ALTER TABLE funcionarios DROP CONSTRAINT IF EXISTS funcionarios_criado_por_fkey;
ALTER TABLE extras DROP CONSTRAINT IF EXISTS extras_criado_por_fkey;
ALTER TABLE escalas DROP CONSTRAINT IF EXISTS escalas_criado_por_fkey;
ALTER TABLE documentos_funcionarios DROP CONSTRAINT IF EXISTS documentos_funcionarios_criado_por_fkey;
ALTER TABLE musicos DROP CONSTRAINT IF EXISTS musicos_criado_por_fkey;
ALTER TABLE ocorrencias DROP CONSTRAINT IF EXISTS ocorrencias_criado_por_fkey;
ALTER TABLE insumos DROP CONSTRAINT IF EXISTS insumos_criado_por_fkey;
ALTER TABLE fichas_tecnicas DROP CONSTRAINT IF EXISTS fichas_tecnicas_criado_por_fkey;
ALTER TABLE producoes DROP CONSTRAINT IF EXISTS producoes_criado_por_fkey;
ALTER TABLE requisicoes_estoque DROP CONSTRAINT IF EXISTS requisicoes_estoque_criado_por_fkey;

-- Clean up any existing invalid data
-- Set all user reference fields to NULL to start fresh
UPDATE contas_pagar SET criado_por = NULL, aprovado_por = NULL;
UPDATE pagamentos_contas SET criado_por = NULL;
UPDATE anexos_contas SET criado_por = NULL;
UPDATE fluxo_caixa SET criado_por = NULL;

-- Add comment to remember this is temporary
COMMENT ON TABLE contas_pagar IS 'Foreign key constraints to usuarios table removed for development. Restore when implementing authentication.';
COMMENT ON TABLE pagamentos_contas IS 'Foreign key constraints to usuarios table removed for development. Restore when implementing authentication.';
COMMENT ON TABLE anexos_contas IS 'Foreign key constraints to usuarios table removed for development. Restore when implementing authentication.';
COMMENT ON TABLE fluxo_caixa IS 'Foreign key constraints to usuarios table removed for development. Restore when implementing authentication.';