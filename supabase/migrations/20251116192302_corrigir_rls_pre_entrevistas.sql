/*
  # Corrigir RLS de Pré-Entrevistas

  1. Adicionar política UPDATE para authenticated
    - Permite que RH atualize status e dados das pré-entrevistas
*/

-- Adicionar política de UPDATE para authenticated
CREATE POLICY "Usuários autenticados podem atualizar pré-entrevistas"
  ON rh_pre_entrevistas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
