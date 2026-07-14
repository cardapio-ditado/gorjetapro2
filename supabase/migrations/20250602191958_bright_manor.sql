/*
  # Add RLS policies for financial transactions

  1. Security Changes
    - Enable RLS on `fluxo_caixa` table if not already enabled
    - Add policy for authenticated users with 'gerente' or 'financeiro' roles to manage transactions
    - Add policy for authenticated users to insert transactions
    - Add policy for users to view transactions they created

  This migration ensures proper access control for financial data while maintaining security.
*/

-- Enable RLS
ALTER TABLE fluxo_caixa ENABLE ROW LEVEL SECURITY;

-- Policy for managers and financial staff to manage all transactions
CREATE POLICY "Managers and financial can manage transactions"
ON fluxo_caixa
FOR ALL
TO authenticated
USING (
  (auth.jwt() ->> 'funcao'::text) IN ('gerente', 'financeiro')
);

-- Policy for authenticated users to insert transactions
CREATE POLICY "Users can insert transactions"
ON fluxo_caixa
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy for users to view their own transactions
CREATE POLICY "Users can view transactions they created"
ON fluxo_caixa
FOR SELECT
TO authenticated
USING (
  auth.uid() = criado_por
);