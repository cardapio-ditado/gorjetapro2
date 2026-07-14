/*
  # Add INSERT policy for bancos_contas table

  1. Security Changes
    - Add INSERT policy for authenticated users on bancos_contas table
    - This allows authenticated users to create new bank accounts
    - Maintains existing ALL policy for managers and financial users

  2. Policy Details
    - Policy name: "Authenticated users can insert bank accounts"
    - Allows INSERT operations for any authenticated user
    - Works alongside existing management policy
*/

-- Add INSERT policy for authenticated users to create bank accounts
CREATE POLICY "Authenticated users can insert bank accounts"
  ON bancos_contas
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);