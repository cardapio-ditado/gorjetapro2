/*
  # Sistema Completo de Mapeamento de Itens via Excel

  ## Descrição
  Sistema robusto para mapear nomes de produtos externos (Excel, PDFs, sistemas de vendas)
  para itens do estoque interno. Suporta importação em lote, validação automática,
  sugestões por similaridade e histórico de uso.

  ## Novas Tabelas
  
  ### `mapeamentos_itens_excel`
  Armazena os mapeamentos entre nomes externos e itens do estoque
  - `id` (uuid, PK)
  - `nome_item_externo` (text) - Nome como aparece no arquivo/sistema externo
  - `nome_normalizado` (text) - Nome normalizado para busca (lowercase, sem acentos)
  - `estoque_id` (uuid, FK) - Referência ao item do estoque interno
  - `tipo_origem` (text) - Tipo de origem: 'vendas', 'compras', 'producao', etc
  - `ativo` (boolean) - Se o mapeamento está ativo
  - `confianca` (integer) - Nível de confiança (0-100): 100=manual, <100=sugerido
  - `metadata` (jsonb) - Informações adicionais (unidade, observações, etc)
  - `criado_por` (uuid) - Usuário que criou
  - `criado_em` (timestamptz)
  - `atualizado_em` (timestamptz)
  - `total_usos` (integer) - Contador de quantas vezes foi usado
  - `ultimo_uso` (timestamptz) - Data do último uso
  
  ### `historico_uso_mapeamentos`
  Registra cada vez que um mapeamento é utilizado
  - `id` (uuid, PK)
  - `mapeamento_id` (uuid, FK)
  - `tipo_operacao` (text) - 'importacao_vendas', 'importacao_compras', etc
  - `referencia_operacao` (text) - ID ou referência da operação
  - `usado_em` (timestamptz)
  - `criado_por` (uuid)

  ## Funções

  ### `normalizar_texto_busca(texto)`
  Normaliza texto para busca (remove acentos, lowercase, trim)

  ### `buscar_mapeamento(nome_externo, tipo_origem)`
  Busca mapeamento exato ativo para um nome externo

  ### `sugerir_mapeamentos(nome_externo, limite, tipo_origem)`
  Sugere mapeamentos por similaridade usando trigram

  ### `registrar_uso_mapeamento(mapeamento_id, tipo_operacao, referencia, usuario_id)`
  Registra uso de um mapeamento e atualiza contadores

  ### `importar_mapeamentos_excel(mapeamentos_json)`
  Importa mapeamentos em lote a partir de JSON

  ## Índices
  - Índice GIN em nome_normalizado para busca por trigram
  - Índice em estoque_id
  - Índice em tipo_origem + ativo
  - Índice composto em (nome_normalizado, tipo_origem, ativo)

  ## Segurança
  - RLS habilitado em todas as tabelas
  - Usuários autenticados podem ler todos os mapeamentos ativos
  - Apenas usuários autenticados podem criar/editar mapeamentos
  - Histórico é apenas leitura para usuários autenticados
*/

-- Criar extensão para busca por similaridade (se não existir)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tabela principal de mapeamentos
CREATE TABLE IF NOT EXISTS mapeamentos_itens_excel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_item_externo text NOT NULL,
  nome_normalizado text NOT NULL,
  estoque_id uuid REFERENCES itens_estoque(id) ON DELETE CASCADE,
  tipo_origem text NOT NULL DEFAULT 'vendas',
  ativo boolean DEFAULT true,
  confianca integer DEFAULT 100 CHECK (confianca >= 0 AND confianca <= 100),
  metadata jsonb DEFAULT '{}'::jsonb,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  total_usos integer DEFAULT 0,
  ultimo_uso timestamptz,
  
  CONSTRAINT nome_externo_nao_vazio CHECK (length(trim(nome_item_externo)) > 0)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_mapeamentos_nome_normalizado_trgm 
  ON mapeamentos_itens_excel USING gin(nome_normalizado gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_mapeamentos_estoque_id 
  ON mapeamentos_itens_excel(estoque_id);

CREATE INDEX IF NOT EXISTS idx_mapeamentos_tipo_origem_ativo 
  ON mapeamentos_itens_excel(tipo_origem, ativo) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_mapeamentos_busca_rapida 
  ON mapeamentos_itens_excel(nome_normalizado, tipo_origem, ativo) 
  WHERE ativo = true;

-- Tabela de histórico de uso
CREATE TABLE IF NOT EXISTS historico_uso_mapeamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapeamento_id uuid REFERENCES mapeamentos_itens_excel(id) ON DELETE CASCADE,
  tipo_operacao text NOT NULL,
  referencia_operacao text,
  usado_em timestamptz DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_historico_mapeamento_id 
  ON historico_uso_mapeamentos(mapeamento_id);

CREATE INDEX IF NOT EXISTS idx_historico_usado_em 
  ON historico_uso_mapeamentos(usado_em DESC);

-- Função para normalizar texto (remove acentos, lowercase, trim)
CREATE OR REPLACE FUNCTION normalizar_texto_busca(texto text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN lower(trim(
    translate(
      texto,
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
    )
  ));
END;
$$;

-- Trigger para manter nome_normalizado atualizado
CREATE OR REPLACE FUNCTION atualizar_nome_normalizado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.nome_normalizado := normalizar_texto_busca(NEW.nome_item_externo);
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_normalizar_nome ON mapeamentos_itens_excel;
CREATE TRIGGER trigger_normalizar_nome
  BEFORE INSERT OR UPDATE OF nome_item_externo
  ON mapeamentos_itens_excel
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_nome_normalizado();

-- Função para buscar mapeamento exato
CREATE OR REPLACE FUNCTION buscar_mapeamento(
  p_nome_externo text,
  p_tipo_origem text DEFAULT 'vendas'
)
RETURNS TABLE(
  id uuid,
  nome_item_externo text,
  estoque_id uuid,
  nome_item_estoque text,
  unidade_medida text,
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
    ie.nome as nome_item_estoque,
    ie.unidade_medida,
    m.confianca,
    m.total_usos,
    m.ultimo_uso,
    m.metadata
  FROM mapeamentos_itens_excel m
  INNER JOIN itens_estoque ie ON ie.id = m.estoque_id
  WHERE m.nome_normalizado = v_nome_normalizado
    AND m.tipo_origem = p_tipo_origem
    AND m.ativo = true
  ORDER BY m.confianca DESC, m.total_usos DESC
  LIMIT 1;
END;
$$;

-- Função para sugerir mapeamentos por similaridade
CREATE OR REPLACE FUNCTION sugerir_mapeamentos(
  p_nome_externo text,
  p_limite integer DEFAULT 5,
  p_tipo_origem text DEFAULT 'vendas'
)
RETURNS TABLE(
  id uuid,
  nome_item_externo text,
  estoque_id uuid,
  nome_item_estoque text,
  unidade_medida text,
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
    ie.nome as nome_item_estoque,
    ie.unidade_medida,
    similarity(m.nome_normalizado, v_nome_normalizado) as similaridade,
    m.confianca,
    m.total_usos
  FROM mapeamentos_itens_excel m
  INNER JOIN itens_estoque ie ON ie.id = m.estoque_id
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

-- Função para registrar uso de mapeamento
CREATE OR REPLACE FUNCTION registrar_uso_mapeamento(
  p_mapeamento_id uuid,
  p_tipo_operacao text,
  p_referencia text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Inserir no histórico
  INSERT INTO historico_uso_mapeamentos (
    mapeamento_id,
    tipo_operacao,
    referencia_operacao,
    criado_por
  ) VALUES (
    p_mapeamento_id,
    p_tipo_operacao,
    p_referencia,
    COALESCE(p_usuario_id, auth.uid())
  );
  
  -- Atualizar contadores no mapeamento
  UPDATE mapeamentos_itens_excel
  SET 
    total_usos = total_usos + 1,
    ultimo_uso = now(),
    atualizado_em = now()
  WHERE id = p_mapeamento_id;
END;
$$;

-- Função para importar mapeamentos em lote a partir de JSON
CREATE OR REPLACE FUNCTION importar_mapeamentos_excel(
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
  v_nome_externo text;
  v_nome_estoque text;
  v_confianca integer;
  v_metadata jsonb;
  v_total_importados integer := 0;
  v_total_atualizados integer := 0;
  v_total_erros integer := 0;
  v_erros jsonb := '[]'::jsonb;
  v_usuario_id uuid;
BEGIN
  v_usuario_id := COALESCE(p_usuario_id, auth.uid());
  
  -- Iterar sobre cada mapeamento no JSON
  FOR v_mapeamento IN SELECT * FROM jsonb_array_elements(p_mapeamentos)
  LOOP
    BEGIN
      v_nome_externo := v_mapeamento->>'nome_externo';
      v_nome_estoque := v_mapeamento->>'nome_estoque';
      v_confianca := COALESCE((v_mapeamento->>'confianca')::integer, 100);
      v_metadata := COALESCE(v_mapeamento->'metadata', '{}'::jsonb);
      
      -- Buscar estoque_id pelo nome
      SELECT id INTO v_estoque_id
      FROM itens_estoque
      WHERE lower(trim(nome)) = lower(trim(v_nome_estoque))
      LIMIT 1;
      
      IF v_estoque_id IS NULL THEN
        -- Item não encontrado no estoque
        v_total_erros := v_total_erros + 1;
        v_erros := v_erros || jsonb_build_object(
          'nome_externo', v_nome_externo,
          'nome_estoque', v_nome_estoque,
          'erro', 'Item não encontrado no estoque'
        );
        CONTINUE;
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
          tipo_origem,
          confianca,
          metadata,
          criado_por
        ) VALUES (
          v_nome_externo,
          normalizar_texto_busca(v_nome_externo),
          v_estoque_id,
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
        'nome_estoque', v_nome_estoque,
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

-- RLS Policies

ALTER TABLE mapeamentos_itens_excel ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_uso_mapeamentos ENABLE ROW LEVEL SECURITY;

-- Políticas para mapeamentos_itens_excel
DROP POLICY IF EXISTS "Usuários autenticados podem ler mapeamentos ativos" ON mapeamentos_itens_excel;
CREATE POLICY "Usuários autenticados podem ler mapeamentos ativos"
  ON mapeamentos_itens_excel FOR SELECT
  TO authenticated
  USING (ativo = true);

DROP POLICY IF EXISTS "Usuários autenticados podem criar mapeamentos" ON mapeamentos_itens_excel;
CREATE POLICY "Usuários autenticados podem criar mapeamentos"
  ON mapeamentos_itens_excel FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar mapeamentos" ON mapeamentos_itens_excel;
CREATE POLICY "Usuários autenticados podem atualizar mapeamentos"
  ON mapeamentos_itens_excel FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem desativar mapeamentos" ON mapeamentos_itens_excel;
CREATE POLICY "Usuários autenticados podem desativar mapeamentos"
  ON mapeamentos_itens_excel FOR DELETE
  TO authenticated
  USING (true);

-- Políticas para historico_uso_mapeamentos
DROP POLICY IF EXISTS "Usuários autenticados podem ler histórico" ON historico_uso_mapeamentos;
CREATE POLICY "Usuários autenticados podem ler histórico"
  ON historico_uso_mapeamentos FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Sistema pode inserir histórico" ON historico_uso_mapeamentos;
CREATE POLICY "Sistema pode inserir histórico"
  ON historico_uso_mapeamentos FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Comentários nas tabelas
COMMENT ON TABLE mapeamentos_itens_excel IS 'Mapeamentos entre nomes de produtos externos (Excel, PDFs, sistemas) e itens do estoque interno';
COMMENT ON TABLE historico_uso_mapeamentos IS 'Histórico de utilização dos mapeamentos em operações';

COMMENT ON COLUMN mapeamentos_itens_excel.nome_normalizado IS 'Nome normalizado para busca (lowercase, sem acentos)';
COMMENT ON COLUMN mapeamentos_itens_excel.confianca IS 'Nível de confiança do mapeamento: 100=manual, <100=sugerido por IA';
COMMENT ON COLUMN mapeamentos_itens_excel.metadata IS 'Dados adicionais: unidade, observações, sinônimos, etc';
