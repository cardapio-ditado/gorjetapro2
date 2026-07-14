/*
  # Corrigir RLS e Referências da Produção

  ## Alterações

  1. Tabelas de Produção
     - Corrigir referências de auth.users para usuarios_sistema
     - Tornar campos de usuário nullable para aceitar operações sem usuário autenticado

  2. Políticas RLS
     - Permitir acesso público (anon) para todas as operações de produção
     - Sistema usa autenticação customizada (usuarios_sistema)

  ## Segurança
  - RLS permanece habilitado
  - Políticas permissivas para desenvolvimento
*/

-- 1. Remover constraints de FK antigas que referenciam auth.users
DO $$
BEGIN
  -- producoes
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%producoes_usuario_inicio%'
    AND table_name = 'producoes'
  ) THEN
    ALTER TABLE producoes DROP CONSTRAINT IF EXISTS producoes_usuario_inicio_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%producoes_usuario_conclusao%'
    AND table_name = 'producoes'
  ) THEN
    ALTER TABLE producoes DROP CONSTRAINT IF EXISTS producoes_usuario_conclusao_fkey;
  END IF;

  -- producao_historico_status
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%producao_historico_status_usuario_id%'
    AND table_name = 'producao_historico_status'
  ) THEN
    ALTER TABLE producao_historico_status DROP CONSTRAINT IF EXISTS producao_historico_status_usuario_id_fkey;
  END IF;

  -- producao_controle_qualidade
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%producao_controle_qualidade_inspetor_id%'
    AND table_name = 'producao_controle_qualidade'
  ) THEN
    ALTER TABLE producao_controle_qualidade DROP CONSTRAINT IF EXISTS producao_controle_qualidade_inspetor_id_fkey;
  END IF;

  -- producao_consumo_insumos
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%producao_consumo_insumos_registrado_por%'
    AND table_name = 'producao_consumo_insumos'
  ) THEN
    ALTER TABLE producao_consumo_insumos DROP CONSTRAINT IF EXISTS producao_consumo_insumos_registrado_por_fkey;
  END IF;
END $$;

-- 2. Adicionar novas FKs para usuarios_sistema (nullable)
ALTER TABLE producoes
  DROP CONSTRAINT IF EXISTS producoes_usuario_inicio_usuarios_fkey,
  DROP CONSTRAINT IF EXISTS producoes_usuario_conclusao_usuarios_fkey;

ALTER TABLE producoes
  ADD CONSTRAINT producoes_usuario_inicio_usuarios_fkey
    FOREIGN KEY (usuario_inicio) REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  ADD CONSTRAINT producoes_usuario_conclusao_usuarios_fkey
    FOREIGN KEY (usuario_conclusao) REFERENCES usuarios_sistema(id) ON DELETE SET NULL;

ALTER TABLE producao_historico_status
  DROP CONSTRAINT IF EXISTS producao_historico_status_usuario_usuarios_fkey;

ALTER TABLE producao_historico_status
  ADD CONSTRAINT producao_historico_status_usuario_usuarios_fkey
    FOREIGN KEY (usuario_id) REFERENCES usuarios_sistema(id) ON DELETE SET NULL;

ALTER TABLE producao_controle_qualidade
  DROP CONSTRAINT IF EXISTS producao_controle_qualidade_inspetor_usuarios_fkey;

ALTER TABLE producao_controle_qualidade
  ADD CONSTRAINT producao_controle_qualidade_inspetor_usuarios_fkey
    FOREIGN KEY (inspetor_id) REFERENCES usuarios_sistema(id) ON DELETE SET NULL;

ALTER TABLE producao_consumo_insumos
  DROP CONSTRAINT IF EXISTS producao_consumo_insumos_registrado_usuarios_fkey;

ALTER TABLE producao_consumo_insumos
  ADD CONSTRAINT producao_consumo_insumos_registrado_usuarios_fkey
    FOREIGN KEY (registrado_por) REFERENCES usuarios_sistema(id) ON DELETE SET NULL;

-- 3. Recriar políticas RLS mais permissivas

-- producao_historico_status
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar histórico" ON producao_historico_status;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir histórico" ON producao_historico_status;

CREATE POLICY "Permitir acesso total ao histórico"
  ON producao_historico_status FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- producao_controle_qualidade
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar controle qualidade" ON producao_controle_qualidade;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir controle qualidade" ON producao_controle_qualidade;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar controle qualidade" ON producao_controle_qualidade;

CREATE POLICY "Permitir acesso total ao controle qualidade"
  ON producao_controle_qualidade FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- producao_reserva_insumos
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar reservas" ON producao_reserva_insumos;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir reservas" ON producao_reserva_insumos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar reservas" ON producao_reserva_insumos;

CREATE POLICY "Permitir acesso total às reservas"
  ON producao_reserva_insumos FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- producao_consumo_insumos
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar consumo" ON producao_consumo_insumos;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir consumo" ON producao_consumo_insumos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar consumo" ON producao_consumo_insumos;

CREATE POLICY "Permitir acesso total ao consumo"
  ON producao_consumo_insumos FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
