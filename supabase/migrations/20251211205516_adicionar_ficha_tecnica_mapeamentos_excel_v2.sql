/*
  # Adicionar suporte a Fichas Técnicas no Mapeamento Excel

  ## Descrição
  Permite mapear nomes externos tanto para itens de estoque quanto para fichas técnicas.

  ## Alterações
  1. Adicionar coluna `ficha_tecnica_id` (opcional, FK para fichas_tecnicas)
  2. Tornar `estoque_id` nullable (agora opcional)
  3. Adicionar constraint para garantir que ou `estoque_id` ou `ficha_tecnica_id` esteja preenchido
  4. Atualizar funções para suportar fichas técnicas

  ## Notas
  - Mapeamentos podem ser de item OU de ficha técnica, não ambos
*/

-- Adicionar nova coluna para fichas técnicas
ALTER TABLE mapeamentos_itens_excel
ADD COLUMN IF NOT EXISTS ficha_tecnica_id uuid REFERENCES fichas_tecnicas(id) ON DELETE CASCADE;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_mapeamentos_ficha_tecnica 
  ON mapeamentos_itens_excel(ficha_tecnica_id) WHERE ficha_tecnica_id IS NOT NULL;

-- Adicionar constraint para garantir que ou estoque_id ou ficha_tecnica_id esteja preenchido
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'mapeamento_item_ou_ficha'
  ) THEN
    ALTER TABLE mapeamentos_itens_excel
    ADD CONSTRAINT mapeamento_item_ou_ficha 
    CHECK (
      (estoque_id IS NOT NULL AND ficha_tecnica_id IS NULL) OR
      (estoque_id IS NULL AND ficha_tecnica_id IS NOT NULL)
    );
  END IF;
END $$;

-- Remover funções antigas para recriar com nova assinatura
DROP FUNCTION IF EXISTS buscar_mapeamento(text, text);
DROP FUNCTION IF EXISTS sugerir_mapeamentos(integer, text);
DROP FUNCTION IF EXISTS sugerir_mapeamentos(text, integer, text);
DROP FUNCTION IF EXISTS importar_mapeamentos_excel(jsonb, text, uuid);

-- Recriar função de buscar mapeamento para suportar fichas técnicas
CREATE FUNCTION buscar_mapeamento(
  p_nome_externo text,
  p_tipo_origem text DEFAULT 'vendas'
)
RETURNS TABLE(
  id uuid,
  nome_item_externo text,
  estoque_id uuid,
  ficha_tecnica_id uuid,
  nome_item_estoque text,
  unidade_medida text,
  nome_ficha_tecnica text,
  confianca integer,
  total_usos integer,
  ultimo_uso timestamptz,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_nome_normalizado text;
BEGIN
  v_nome_normalizado := normalizar_texto_busca(p_nome_externo);
  
  RETURN QUERY
  SELECT 
    m.id,
    m.nome_item_externo,
    m.estoque_id,
    m.ficha_tecnica_id,
    ie.nome as nome_item_estoque,
    ie.unidade_medida,
    ft.nome as nome_ficha_tecnica,
    m.confianca,
    m.total_usos,
    m.ultimo_uso,
    m.metadata
  FROM mapeamentos_itens_excel m
  LEFT JOIN itens_estoque ie ON ie.id = m.estoque_id
  LEFT JOIN fichas_tecnicas ft ON ft.id = m.ficha_tecnica_id
  WHERE m.nome_normalizado = v_nome_normalizado
    AND m.tipo_origem = p_tipo_origem
    AND m.ativo = true
  ORDER BY m.confianca DESC, m.total_usos DESC
  LIMIT 1;
END;
$$;

-- Recriar função de sugerir mapeamentos para incluir fichas técnicas
CREATE FUNCTION sugerir_mapeamentos(
  p_nome_externo text,
  p_limite integer DEFAULT 5,
  p_tipo_origem text DEFAULT 'vendas'
)
RETURNS TABLE(
  id uuid,
  nome_item_externo text,
  estoque_id uuid,
  ficha_tecnica_id uuid,
  nome_item_estoque text,
  unidade_medida text,
  nome_ficha_tecnica text,
  similaridade real,
  confianca integer,
  total_usos integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_nome_normalizado text;
BEGIN
  v_nome_normalizado := normalizar_texto_busca(p_nome_externo);
  
  RETURN QUERY
  SELECT 
    m.id,
    m.nome_item_externo,
    m.estoque_id,
    m.ficha_tecnica_id,
    ie.nome as nome_item_estoque,
    ie.unidade_medida,
    ft.nome as nome_ficha_tecnica,
    similarity(m.nome_normalizado, v_nome_normalizado) as similaridade,
    m.confianca,
    m.total_usos
  FROM mapeamentos_itens_excel m
  LEFT JOIN itens_estoque ie ON ie.id = m.estoque_id
  LEFT JOIN fichas_tecnicas ft ON ft.id = m.ficha_tecnica_id
  WHERE m.tipo_origem = p_tipo_origem
    AND m.ativo = true
    AND similarity(m.nome_normalizado, v_nome_normalizado) > 0.3
  ORDER BY 
    similarity(m.nome_normalizado, v_nome_normalizado) DESC,
    m.total_usos DESC,
    m.confianca DESC
  LIMIT p_limite;
END;
$$;

-- Recriar função de importação para suportar fichas técnicas
CREATE FUNCTION importar_mapeamentos_excel(
  p_mapeamentos jsonb,
  p_tipo_origem text DEFAULT 'vendas',
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(
  sucesso boolean,
  total_importados integer,
  total_atualizados integer,
  total_erros integer,
  erros jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_mapeamento jsonb;
  v_estoque_id uuid;
  v_ficha_tecnica_id uuid;
  v_nome_externo text;
  v_nome_estoque text;
  v_nome_ficha text;
  v_tipo_mapeamento text;
  v_confianca integer;
  v_metadata jsonb;
  v_total_importados integer := 0;
  v_total_atualizados integer := 0;
  v_total_erros integer := 0;
  v_erros jsonb := '[]'::jsonb;
  v_usuario_id uuid;
BEGIN
  v_usuario_id := COALESCE(p_usuario_id, auth.uid());
  
  FOR v_mapeamento IN SELECT * FROM jsonb_array_elements(p_mapeamentos)
  LOOP
    BEGIN
      v_nome_externo := v_mapeamento->>'nome_externo';
      v_nome_estoque := v_mapeamento->>'nome_estoque';
      v_nome_ficha := v_mapeamento->>'nome_ficha';
      v_tipo_mapeamento := COALESCE(v_mapeamento->>'tipo_mapeamento', 'item');
      v_confianca := COALESCE((v_mapeamento->>'confianca')::integer, 100);
      v_metadata := COALESCE(v_mapeamento->'metadata', '{}'::jsonb);
      
      -- Determinar se é item ou ficha técnica
      IF v_tipo_mapeamento = 'ficha_tecnica' OR v_nome_ficha IS NOT NULL THEN
        -- Buscar ficha técnica pelo nome
        SELECT id INTO v_ficha_tecnica_id
        FROM fichas_tecnicas
        WHERE lower(trim(nome)) = lower(trim(COALESCE(v_nome_ficha, v_nome_estoque)))
        AND ativo = true
        LIMIT 1;
        
        IF v_ficha_tecnica_id IS NULL THEN
          v_total_erros := v_total_erros + 1;
          v_erros := v_erros || jsonb_build_object(
            'nome_externo', v_nome_externo,
            'nome_ficha', COALESCE(v_nome_ficha, v_nome_estoque),
            'erro', 'Ficha técnica não encontrada'
          );
          CONTINUE;
        END IF;
        
        v_estoque_id := NULL;
      ELSE
        -- Buscar item de estoque pelo nome
        SELECT id INTO v_estoque_id
        FROM itens_estoque
        WHERE lower(trim(nome)) = lower(trim(v_nome_estoque))
        AND status = 'ativo'
        LIMIT 1;
        
        IF v_estoque_id IS NULL THEN
          v_total_erros := v_total_erros + 1;
          v_erros := v_erros || jsonb_build_object(
            'nome_externo', v_nome_externo,
            'nome_estoque', v_nome_estoque,
            'erro', 'Item não encontrado no estoque'
          );
          CONTINUE;
        END IF;
        
        v_ficha_tecnica_id := NULL;
      END IF;
      
      -- Verificar se já existe mapeamento
      IF EXISTS (
        SELECT 1 FROM mapeamentos_itens_excel
        WHERE nome_normalizado = normalizar_texto_busca(v_nome_externo)
          AND tipo_origem = p_tipo_origem
          AND ativo = true
      ) THEN
        -- Atualizar mapeamento existente
        UPDATE mapeamentos_itens_excel
        SET 
          estoque_id = v_estoque_id,
          ficha_tecnica_id = v_ficha_tecnica_id,
          confianca = v_confianca,
          metadata = v_metadata,
          atualizado_em = now()
        WHERE nome_normalizado = normalizar_texto_busca(v_nome_externo)
          AND tipo_origem = p_tipo_origem
          AND ativo = true;
        
        v_total_atualizados := v_total_atualizados + 1;
      ELSE
        -- Inserir novo mapeamento
        INSERT INTO mapeamentos_itens_excel (
          nome_item_externo,
          nome_normalizado,
          estoque_id,
          ficha_tecnica_id,
          tipo_origem,
          confianca,
          metadata,
          criado_por
        ) VALUES (
          v_nome_externo,
          normalizar_texto_busca(v_nome_externo),
          v_estoque_id,
          v_ficha_tecnica_id,
          p_tipo_origem,
          v_confianca,
          v_metadata,
          v_usuario_id
        );
        
        v_total_importados := v_total_importados + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_total_erros := v_total_erros + 1;
      v_erros := v_erros || jsonb_build_object(
        'nome_externo', v_nome_externo,
        'nome_item', COALESCE(v_nome_ficha, v_nome_estoque),
        'erro', SQLERRM
      );
    END;
  END LOOP;
  
  RETURN QUERY SELECT 
    true as sucesso,
    v_total_importados,
    v_total_atualizados,
    v_total_erros,
    v_erros;
END;
$$;

-- Comentários
COMMENT ON COLUMN mapeamentos_itens_excel.ficha_tecnica_id IS 'ID da ficha técnica mapeada (alternativa ao estoque_id)';
