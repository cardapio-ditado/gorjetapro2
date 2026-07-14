/*
  # Integração de Eventos com Contas a Receber

  1. Alterações
    - Adiciona categoria financeira "Receita de Eventos"
    - Adiciona coluna conta_receber_id na tabela eventos_fechados
    - Cria função para gerar conta a receber automaticamente

  2. Notas
    - Quando um evento tiver contrato assinado, poderá gerar uma conta a receber
    - A conta a receber será vinculada ao evento
*/

-- Adicionar coluna conta_receber_id na tabela eventos_fechados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eventos_fechados' AND column_name = 'conta_receber_id'
  ) THEN
    ALTER TABLE eventos_fechados ADD COLUMN conta_receber_id uuid REFERENCES contas_receber(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_eventos_fechados_conta_receber ON eventos_fechados(conta_receber_id);
  END IF;
END $$;

-- Inserir categoria "Receita de Eventos" se não existir
INSERT INTO categorias_financeiras (nome, tipo, descricao)
VALUES ('Receita de Eventos', 'receita', 'Receitas provenientes de eventos fechados, festas privadas e locações de espaço')
ON CONFLICT DO NOTHING;

-- Função para criar conta a receber a partir de um evento
CREATE OR REPLACE FUNCTION criar_conta_receber_evento(
  p_evento_id uuid,
  p_data_vencimento date DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_evento RECORD;
  v_categoria_id uuid;
  v_cliente_id uuid;
  v_conta_id uuid;
  v_data_venc date;
BEGIN
  -- Buscar dados do evento
  SELECT * INTO v_evento
  FROM eventos_fechados
  WHERE id = p_evento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado';
  END IF;

  -- Verificar se já existe conta a receber vinculada
  IF v_evento.conta_receber_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este evento já possui uma conta a receber vinculada';
  END IF;

  -- Buscar categoria "Receita de Eventos"
  SELECT id INTO v_categoria_id
  FROM categorias_financeiras
  WHERE nome = 'Receita de Eventos' AND tipo = 'receita'
  LIMIT 1;

  -- Buscar ou criar cliente baseado no nome do cliente responsável
  SELECT id INTO v_cliente_id
  FROM clientes
  WHERE nome = v_evento.cliente_responsavel
  LIMIT 1;

  -- Se cliente não existe, criar um novo
  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes (nome, telefone, tipo, observacoes)
    VALUES (
      v_evento.cliente_responsavel,
      v_evento.telefone_cliente,
      'fisico',
      'Cliente criado automaticamente via evento: ' || v_evento.nome_evento
    )
    RETURNING id INTO v_cliente_id;
  END IF;

  -- Definir data de vencimento (usar a fornecida ou data do evento)
  v_data_venc := COALESCE(p_data_vencimento, v_evento.data_evento);

  -- Criar conta a receber
  INSERT INTO contas_receber (
    cliente_id,
    descricao,
    categoria_id,
    valor_total,
    data_emissao,
    data_vencimento,
    numero_documento,
    status,
    observacoes
  ) VALUES (
    v_cliente_id,
    'Evento: ' || v_evento.nome_evento,
    v_categoria_id,
    v_evento.valor_total,
    CURRENT_DATE,
    v_data_venc,
    'EVENTO-' || to_char(CURRENT_DATE, 'YYYY-MM') || '-' || substring(v_evento.id::text from 1 for 8),
    'em_aberto',
    'Conta gerada automaticamente do evento ' || v_evento.nome_evento || 
    '. Data do evento: ' || to_char(v_evento.data_evento, 'DD/MM/YYYY') ||
    CASE WHEN v_evento.quantidade_pessoas IS NOT NULL 
      THEN '. Quantidade de pessoas: ' || v_evento.quantidade_pessoas::text
      ELSE ''
    END
  )
  RETURNING id INTO v_conta_id;

  -- Atualizar evento com a referência da conta
  UPDATE eventos_fechados
  SET 
    conta_receber_id = v_conta_id,
    atualizado_em = now()
  WHERE id = p_evento_id;

  RETURN v_conta_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION criar_conta_receber_evento IS 'Cria uma conta a receber vinculada a um evento fechado';
