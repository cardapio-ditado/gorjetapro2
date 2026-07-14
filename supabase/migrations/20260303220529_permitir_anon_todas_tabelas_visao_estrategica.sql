/*
  # Permitir Acesso Anônimo a Todas as Tabelas da Visão Estratégica
  
  ## Resumo
  Ajusta as políticas RLS de todas as tabelas do módulo Visão Estratégica
  para permitir acesso tanto de usuários autenticados quanto anônimos.
  
  ## Tabelas Afetadas
  - visao_estrategica_config
  - visao_estrategica_semanas
  - visao_estrategica_despesas
  - visao_estrategica_dividas
  - visao_estrategica_pagamentos_dividas
  - visao_estrategica_entradas
  - visao_estrategica_projecoes_futuras
  
  ## Segurança
  - Permite acesso completo para desenvolvimento
  - Todas as operações (SELECT, INSERT, UPDATE, DELETE) liberadas
*/

-- ============================================
-- visao_estrategica_config
-- ============================================
DROP POLICY IF EXISTS "Permitir leitura config" ON visao_estrategica_config;
DROP POLICY IF EXISTS "Permitir inserção config" ON visao_estrategica_config;
DROP POLICY IF EXISTS "Permitir atualização config" ON visao_estrategica_config;
DROP POLICY IF EXISTS "Permitir exclusão config" ON visao_estrategica_config;

CREATE POLICY "Permitir leitura config"
  ON visao_estrategica_config FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Permitir inserção config"
  ON visao_estrategica_config FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir atualização config"
  ON visao_estrategica_config FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão config"
  ON visao_estrategica_config FOR DELETE
  TO authenticated, anon
  USING (true);

-- ============================================
-- visao_estrategica_semanas
-- ============================================
DROP POLICY IF EXISTS "Permitir leitura semanas" ON visao_estrategica_semanas;
DROP POLICY IF EXISTS "Permitir inserção semanas" ON visao_estrategica_semanas;
DROP POLICY IF EXISTS "Permitir atualização semanas" ON visao_estrategica_semanas;
DROP POLICY IF EXISTS "Permitir exclusão semanas" ON visao_estrategica_semanas;

CREATE POLICY "Permitir leitura semanas"
  ON visao_estrategica_semanas FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Permitir inserção semanas"
  ON visao_estrategica_semanas FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir atualização semanas"
  ON visao_estrategica_semanas FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão semanas"
  ON visao_estrategica_semanas FOR DELETE
  TO authenticated, anon
  USING (true);

-- ============================================
-- visao_estrategica_despesas
-- ============================================
DROP POLICY IF EXISTS "Permitir leitura despesas" ON visao_estrategica_despesas;
DROP POLICY IF EXISTS "Permitir inserção despesas" ON visao_estrategica_despesas;
DROP POLICY IF EXISTS "Permitir atualização despesas" ON visao_estrategica_despesas;
DROP POLICY IF EXISTS "Permitir exclusão despesas" ON visao_estrategica_despesas;

CREATE POLICY "Permitir leitura despesas"
  ON visao_estrategica_despesas FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Permitir inserção despesas"
  ON visao_estrategica_despesas FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir atualização despesas"
  ON visao_estrategica_despesas FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão despesas"
  ON visao_estrategica_despesas FOR DELETE
  TO authenticated, anon
  USING (true);

-- ============================================
-- visao_estrategica_dividas
-- ============================================
DROP POLICY IF EXISTS "Permitir leitura dividas" ON visao_estrategica_dividas;
DROP POLICY IF EXISTS "Permitir inserção dividas" ON visao_estrategica_dividas;
DROP POLICY IF EXISTS "Permitir atualização dividas" ON visao_estrategica_dividas;
DROP POLICY IF EXISTS "Permitir exclusão dividas" ON visao_estrategica_dividas;

CREATE POLICY "Permitir leitura dividas"
  ON visao_estrategica_dividas FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Permitir inserção dividas"
  ON visao_estrategica_dividas FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir atualização dividas"
  ON visao_estrategica_dividas FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão dividas"
  ON visao_estrategica_dividas FOR DELETE
  TO authenticated, anon
  USING (true);

-- ============================================
-- visao_estrategica_pagamentos_dividas
-- ============================================
DROP POLICY IF EXISTS "Permitir leitura pagamentos" ON visao_estrategica_pagamentos_dividas;
DROP POLICY IF EXISTS "Permitir inserção pagamentos" ON visao_estrategica_pagamentos_dividas;
DROP POLICY IF EXISTS "Permitir atualização pagamentos" ON visao_estrategica_pagamentos_dividas;
DROP POLICY IF EXISTS "Permitir exclusão pagamentos" ON visao_estrategica_pagamentos_dividas;

CREATE POLICY "Permitir leitura pagamentos"
  ON visao_estrategica_pagamentos_dividas FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Permitir inserção pagamentos"
  ON visao_estrategica_pagamentos_dividas FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir atualização pagamentos"
  ON visao_estrategica_pagamentos_dividas FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão pagamentos"
  ON visao_estrategica_pagamentos_dividas FOR DELETE
  TO authenticated, anon
  USING (true);

-- ============================================
-- visao_estrategica_entradas
-- ============================================
DROP POLICY IF EXISTS "Permitir leitura entradas" ON visao_estrategica_entradas;
DROP POLICY IF EXISTS "Permitir inserção entradas" ON visao_estrategica_entradas;
DROP POLICY IF EXISTS "Permitir atualização entradas" ON visao_estrategica_entradas;
DROP POLICY IF EXISTS "Permitir exclusão entradas" ON visao_estrategica_entradas;

CREATE POLICY "Permitir leitura entradas"
  ON visao_estrategica_entradas FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Permitir inserção entradas"
  ON visao_estrategica_entradas FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir atualização entradas"
  ON visao_estrategica_entradas FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão entradas"
  ON visao_estrategica_entradas FOR DELETE
  TO authenticated, anon
  USING (true);

-- ============================================
-- visao_estrategica_projecoes_futuras
-- ============================================
DROP POLICY IF EXISTS "Permitir leitura projecoes" ON visao_estrategica_projecoes_futuras;
DROP POLICY IF EXISTS "Permitir inserção projecoes" ON visao_estrategica_projecoes_futuras;
DROP POLICY IF EXISTS "Permitir atualização projecoes" ON visao_estrategica_projecoes_futuras;
DROP POLICY IF EXISTS "Permitir exclusão projecoes" ON visao_estrategica_projecoes_futuras;

CREATE POLICY "Permitir leitura projecoes"
  ON visao_estrategica_projecoes_futuras FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Permitir inserção projecoes"
  ON visao_estrategica_projecoes_futuras FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir atualização projecoes"
  ON visao_estrategica_projecoes_futuras FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão projecoes"
  ON visao_estrategica_projecoes_futuras FOR DELETE
  TO authenticated, anon
  USING (true);
