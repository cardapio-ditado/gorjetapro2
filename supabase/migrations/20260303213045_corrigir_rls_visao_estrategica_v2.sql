/*
  # Corrigir RLS para permitir acesso completo à Visão Estratégica
  
  ## Descrição
  Permite que todos os usuários (autenticados e anônimos) acessem o módulo de Visão Estratégica
  
  ## Alterações
  Atualiza políticas RLS de todas as tabelas do módulo para permitir acesso total
  
  ## Tabelas Afetadas
  - visao_estrategica_semanas
  - visao_estrategica_despesas
  - visao_estrategica_entradas
  - visao_estrategica_dividas
  - visao_estrategica_pagamentos_dividas
  - visao_estrategica_categorias
  - visao_estrategica_subcategorias
  - visao_estrategica_config
  - visao_estrategica_projecoes_futuras
*/

-- ============================================
-- visao_estrategica_semanas
-- ============================================
DROP POLICY IF EXISTS "Permitir leitura de semanas" ON visao_estrategica_semanas;
DROP POLICY IF EXISTS "Permitir criação de semanas" ON visao_estrategica_semanas;
DROP POLICY IF EXISTS "Permitir atualização de semanas" ON visao_estrategica_semanas;
DROP POLICY IF EXISTS "Permitir exclusão de semanas" ON visao_estrategica_semanas;

CREATE POLICY "Permitir leitura de semanas"
  ON visao_estrategica_semanas FOR SELECT
  USING (true);

CREATE POLICY "Permitir criação de semanas"
  ON visao_estrategica_semanas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de semanas"
  ON visao_estrategica_semanas FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão de semanas"
  ON visao_estrategica_semanas FOR DELETE
  USING (true);

-- ============================================
-- visao_estrategica_despesas
-- ============================================
DROP POLICY IF EXISTS "Permitir acesso a despesas" ON visao_estrategica_despesas;
DROP POLICY IF EXISTS "Permitir leitura de despesas" ON visao_estrategica_despesas;
DROP POLICY IF EXISTS "Permitir criação de despesas" ON visao_estrategica_despesas;
DROP POLICY IF EXISTS "Permitir atualização de despesas" ON visao_estrategica_despesas;
DROP POLICY IF EXISTS "Permitir exclusão de despesas" ON visao_estrategica_despesas;

CREATE POLICY "Permitir leitura de despesas"
  ON visao_estrategica_despesas FOR SELECT
  USING (true);

CREATE POLICY "Permitir criação de despesas"
  ON visao_estrategica_despesas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de despesas"
  ON visao_estrategica_despesas FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão de despesas"
  ON visao_estrategica_despesas FOR DELETE
  USING (true);

-- ============================================
-- visao_estrategica_entradas
-- ============================================
DROP POLICY IF EXISTS "Permitir acesso a entradas" ON visao_estrategica_entradas;
DROP POLICY IF EXISTS "Permitir leitura de entradas" ON visao_estrategica_entradas;
DROP POLICY IF EXISTS "Permitir criação de entradas" ON visao_estrategica_entradas;
DROP POLICY IF EXISTS "Permitir atualização de entradas" ON visao_estrategica_entradas;
DROP POLICY IF EXISTS "Permitir exclusão de entradas" ON visao_estrategica_entradas;

CREATE POLICY "Permitir leitura de entradas"
  ON visao_estrategica_entradas FOR SELECT
  USING (true);

CREATE POLICY "Permitir criação de entradas"
  ON visao_estrategica_entradas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de entradas"
  ON visao_estrategica_entradas FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão de entradas"
  ON visao_estrategica_entradas FOR DELETE
  USING (true);

-- ============================================
-- visao_estrategica_dividas
-- ============================================
DROP POLICY IF EXISTS "Permitir acesso a dívidas" ON visao_estrategica_dividas;
DROP POLICY IF EXISTS "Permitir leitura de dívidas" ON visao_estrategica_dividas;
DROP POLICY IF EXISTS "Permitir criação de dívidas" ON visao_estrategica_dividas;
DROP POLICY IF EXISTS "Permitir atualização de dívidas" ON visao_estrategica_dividas;
DROP POLICY IF EXISTS "Permitir exclusão de dívidas" ON visao_estrategica_dividas;

CREATE POLICY "Permitir leitura de dívidas"
  ON visao_estrategica_dividas FOR SELECT
  USING (true);

CREATE POLICY "Permitir criação de dívidas"
  ON visao_estrategica_dividas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de dívidas"
  ON visao_estrategica_dividas FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão de dívidas"
  ON visao_estrategica_dividas FOR DELETE
  USING (true);

-- ============================================
-- visao_estrategica_pagamentos_dividas
-- ============================================
DROP POLICY IF EXISTS "Permitir acesso a pagamentos" ON visao_estrategica_pagamentos_dividas;
DROP POLICY IF EXISTS "Permitir leitura de pagamentos" ON visao_estrategica_pagamentos_dividas;
DROP POLICY IF EXISTS "Permitir criação de pagamentos" ON visao_estrategica_pagamentos_dividas;
DROP POLICY IF EXISTS "Permitir atualização de pagamentos" ON visao_estrategica_pagamentos_dividas;
DROP POLICY IF EXISTS "Permitir exclusão de pagamentos" ON visao_estrategica_pagamentos_dividas;

CREATE POLICY "Permitir leitura de pagamentos"
  ON visao_estrategica_pagamentos_dividas FOR SELECT
  USING (true);

CREATE POLICY "Permitir criação de pagamentos"
  ON visao_estrategica_pagamentos_dividas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de pagamentos"
  ON visao_estrategica_pagamentos_dividas FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão de pagamentos"
  ON visao_estrategica_pagamentos_dividas FOR DELETE
  USING (true);

-- ============================================
-- visao_estrategica_categorias
-- ============================================
DROP POLICY IF EXISTS "Permitir acesso a categorias" ON visao_estrategica_categorias;
DROP POLICY IF EXISTS "Permitir leitura de categorias" ON visao_estrategica_categorias;
DROP POLICY IF EXISTS "Permitir criação de categorias" ON visao_estrategica_categorias;
DROP POLICY IF EXISTS "Permitir atualização de categorias" ON visao_estrategica_categorias;
DROP POLICY IF EXISTS "Permitir exclusão de categorias" ON visao_estrategica_categorias;

CREATE POLICY "Permitir leitura de categorias"
  ON visao_estrategica_categorias FOR SELECT
  USING (true);

CREATE POLICY "Permitir criação de categorias"
  ON visao_estrategica_categorias FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de categorias"
  ON visao_estrategica_categorias FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão de categorias"
  ON visao_estrategica_categorias FOR DELETE
  USING (true);

-- ============================================
-- visao_estrategica_subcategorias
-- ============================================
DROP POLICY IF EXISTS "Permitir acesso a subcategorias" ON visao_estrategica_subcategorias;
DROP POLICY IF EXISTS "Permitir leitura de subcategorias" ON visao_estrategica_subcategorias;
DROP POLICY IF EXISTS "Permitir criação de subcategorias" ON visao_estrategica_subcategorias;
DROP POLICY IF EXISTS "Permitir atualização de subcategorias" ON visao_estrategica_subcategorias;
DROP POLICY IF EXISTS "Permitir exclusão de subcategorias" ON visao_estrategica_subcategorias;

CREATE POLICY "Permitir leitura de subcategorias"
  ON visao_estrategica_subcategorias FOR SELECT
  USING (true);

CREATE POLICY "Permitir criação de subcategorias"
  ON visao_estrategica_subcategorias FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de subcategorias"
  ON visao_estrategica_subcategorias FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão de subcategorias"
  ON visao_estrategica_subcategorias FOR DELETE
  USING (true);

-- ============================================
-- visao_estrategica_config
-- ============================================
DROP POLICY IF EXISTS "Permitir acesso a config" ON visao_estrategica_config;
DROP POLICY IF EXISTS "Permitir leitura de config" ON visao_estrategica_config;
DROP POLICY IF EXISTS "Permitir criação de config" ON visao_estrategica_config;
DROP POLICY IF EXISTS "Permitir atualização de config" ON visao_estrategica_config;
DROP POLICY IF EXISTS "Permitir exclusão de config" ON visao_estrategica_config;

CREATE POLICY "Permitir leitura de config"
  ON visao_estrategica_config FOR SELECT
  USING (true);

CREATE POLICY "Permitir criação de config"
  ON visao_estrategica_config FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de config"
  ON visao_estrategica_config FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão de config"
  ON visao_estrategica_config FOR DELETE
  USING (true);

-- ============================================
-- visao_estrategica_projecoes_futuras
-- ============================================
DROP POLICY IF EXISTS "Permitir acesso a projecoes" ON visao_estrategica_projecoes_futuras;
DROP POLICY IF EXISTS "Permitir leitura de projecoes" ON visao_estrategica_projecoes_futuras;
DROP POLICY IF EXISTS "Permitir criação de projecoes" ON visao_estrategica_projecoes_futuras;
DROP POLICY IF EXISTS "Permitir atualização de projecoes" ON visao_estrategica_projecoes_futuras;
DROP POLICY IF EXISTS "Permitir exclusão de projecoes" ON visao_estrategica_projecoes_futuras;

CREATE POLICY "Permitir leitura de projecoes"
  ON visao_estrategica_projecoes_futuras FOR SELECT
  USING (true);

CREATE POLICY "Permitir criação de projecoes"
  ON visao_estrategica_projecoes_futuras FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de projecoes"
  ON visao_estrategica_projecoes_futuras FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão de projecoes"
  ON visao_estrategica_projecoes_futuras FOR DELETE
  USING (true);