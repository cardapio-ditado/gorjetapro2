/*
  # Permitir acesso anônimo ao Banco de Talentos

  1. Alterações
    - Adicionar política para permitir acesso anônimo (leitura e escrita)
    - Manter políticas authenticated existentes
*/

-- Política para acesso anônimo completo
CREATE POLICY "Allow anonymous access to banco_talentos"
  ON banco_talentos FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
