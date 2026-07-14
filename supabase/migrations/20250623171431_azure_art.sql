/*
  # Add insert policy for contas_pagar

  1. Security Changes
    - Add policy to allow all authenticated users to insert into contas_pagar
    - This complements the existing policy for managers and financial staff

  This migration resolves the RLS policy violation when inserting new records.
*/

-- Add policy to allow all authenticated users to insert into contas_pagar
CREATE POLICY "Permitir inserção para todos os usuários autenticados"
ON contas_pagar
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');