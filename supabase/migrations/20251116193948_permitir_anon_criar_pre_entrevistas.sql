/*
  # Permitir acesso anônimo para criar pré-entrevistas

  1. Adicionar política INSERT para anon
    - Permite que o sistema crie pré-entrevistas sem autenticação Supabase Auth
    - O sistema usa autenticação customizada própria
*/

-- Adicionar política de INSERT para anon
CREATE POLICY "Acesso anônimo pode criar pré-entrevistas"
  ON rh_pre_entrevistas FOR INSERT
  TO anon
  WITH CHECK (true);
