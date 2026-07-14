/*
  # Add Cofre (Cash Vault) Option to Bank Accounts

  1. Schema Changes
    - Update bancos_contas table to include 'cofre' as a valid tipo_conta option
    - This allows tracking cash on hand as a separate account type

  2. Benefits
    - Better cash flow management
    - Separate tracking of physical cash vs bank balances
    - Improved financial reporting accuracy
*/

-- Update the check constraint to include 'cofre' option
ALTER TABLE bancos_contas DROP CONSTRAINT IF EXISTS bancos_contas_tipo_conta_check;

ALTER TABLE bancos_contas ADD CONSTRAINT bancos_contas_tipo_conta_check 
CHECK (tipo_conta IN ('corrente', 'poupanca', 'investimento', 'cofre'));

-- Insert a default cash vault account
INSERT INTO bancos_contas (
  banco,
  tipo_conta,
  titular,
  saldo_inicial,
  saldo_atual,
  status
) VALUES (
  'Cofre Principal',
  'cofre',
  'Ditado Popular',
  0,
  0,
  'ativo'
) ON CONFLICT DO NOTHING;