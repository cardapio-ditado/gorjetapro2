/*
  # Adicionar suporte a valores parciais na agenda de pagamentos

  1. Novas Colunas
    - `valor_original` (numeric) - Valor original da conta
    - `valor_aprovado` (numeric) - Valor aprovado para pagamento (pode ser menor)
    
  2. Atualizações
    - Trigger para calcular valor_aprovado baseado no valor original
    - RPC atualizada para suportar aprovação parcial
    - View para relatórios detalhados
*/

-- Adicionar colunas para valores parciais
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agenda_pagamento_itens' AND column_name = 'valor_original'
  ) THEN
    ALTER TABLE agenda_pagamento_itens ADD COLUMN valor_original numeric(14,2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agenda_pagamento_itens' AND column_name = 'valor_aprovado'
  ) THEN
    ALTER TABLE agenda_pagamento_itens ADD COLUMN valor_aprovado numeric(14,2);
  END IF;
END $$;

-- Atualizar registros existentes para ter valor_original
UPDATE agenda_pagamento_itens 
SET valor_original = valor, valor_aprovado = valor 
WHERE valor_original IS NULL;

-- Adicionar constraints
ALTER TABLE agenda_pagamento_itens 
ADD CONSTRAINT agenda_itens_valor_original_check CHECK (valor_original >= 0),
ADD CONSTRAINT agenda_itens_valor_aprovado_check CHECK (valor_aprovado >= 0),
ADD CONSTRAINT agenda_itens_valor_aprovado_menor_igual_original CHECK (valor_aprovado <= valor_original);

-- Trigger para atualizar valor quando valor_aprovado muda
CREATE OR REPLACE FUNCTION atualizar_valor_agenda_item()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando valor_aprovado é alterado, atualizar o campo valor para manter compatibilidade
  IF NEW.valor_aprovado IS DISTINCT FROM OLD.valor_aprovado THEN
    NEW.valor = NEW.valor_aprovado;
  END IF;
  
  -- Se valor_original não está definido, usar o valor
  IF NEW.valor_original IS NULL THEN
    NEW.valor_original = NEW.valor;
  END IF;
  
  -- Se valor_aprovado não está definido, usar valor_original
  IF NEW.valor_aprovado IS NULL THEN
    NEW.valor_aprovado = NEW.valor_original;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atualizar_valor_agenda_item ON agenda_pagamento_itens;
CREATE TRIGGER trg_atualizar_valor_agenda_item 
  BEFORE INSERT OR UPDATE ON agenda_pagamento_itens 
  FOR EACH ROW 
  EXECUTE FUNCTION atualizar_valor_agenda_item();

-- Atualizar RPC para suportar valores parciais
CREATE OR REPLACE FUNCTION api_fin_set_status_item_parcial(
  p_item_id uuid, 
  p_novo_status text, 
  p_valor_aprovado numeric DEFAULT NULL,
  p_usuario uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE agenda_pagamento_itens 
  SET 
    status = p_novo_status,
    valor_aprovado = COALESCE(p_valor_aprovado, valor_original),
    valor = COALESCE(p_valor_aprovado, valor_original),
    aprovado_por = CASE WHEN p_novo_status = 'aprovado' THEN p_usuario ELSE aprovado_por END,
    aprovado_em = CASE WHEN p_novo_status = 'aprovado' THEN now() ELSE aprovado_em END,
    atualizado_em = now()
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item da agenda não encontrado: %', p_item_id;
  END IF;
END;
$$;

-- Atualizar RPC de fechamento para lidar com valores parciais
CREATE OR REPLACE FUNCTION api_fin_fechar_agenda(
  p_agenda_id uuid, 
  p_usuario uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec_item RECORD;
BEGIN
  -- Verificar se agenda existe e está aberta
  IF NOT EXISTS (
    SELECT 1 FROM agenda_pagamentos 
    WHERE id = p_agenda_id AND status = 'aberta'
  ) THEN
    RAISE EXCEPTION 'Agenda não encontrada ou já está fechada';
  END IF;

  -- Processar itens aprovados
  FOR rec_item IN 
    SELECT * FROM agenda_pagamento_itens 
    WHERE agenda_id = p_agenda_id AND status = 'aprovado'
  LOOP
    -- Se é item do AP, registrar pagamento
    IF rec_item.origem = 'ap' AND rec_item.conta_pagar_id IS NOT NULL THEN
      -- Registrar pagamento na tabela pagamentos_contas
      INSERT INTO pagamentos_contas (
        conta_pagar_id,
        valor_pagamento,
        data_pagamento,
        numero_comprovante,
        observacoes,
        criado_por
      ) VALUES (
        rec_item.conta_pagar_id,
        rec_item.valor_aprovado,
        CURRENT_DATE,
        'AGENDA-' || rec_item.agenda_id::text,
        'Pagamento executado via agenda do dia - ' || COALESCE(rec_item.observacao, ''),
        p_usuario
      );
    END IF;
    
    -- Marcar item como executado
    UPDATE agenda_pagamento_itens 
    SET 
      status = 'executado',
      executado_por = p_usuario,
      executado_em = now(),
      atualizado_em = now()
    WHERE id = rec_item.id;
  END LOOP;

  -- Fechar agenda
  UPDATE agenda_pagamentos 
  SET 
    status = 'fechada',
    fechado_por = p_usuario,
    fechado_em = now()
  WHERE id = p_agenda_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION api_fin_set_status_item_parcial TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_fin_fechar_agenda TO anon, authenticated, service_role;

-- View para relatórios detalhados
CREATE OR REPLACE VIEW vw_agenda_relatorio AS
SELECT 
  ap.id as agenda_id,
  ap.data_base,
  ap.status as agenda_status,
  ap.criado_em as agenda_criada_em,
  ap.fechado_em as agenda_fechada_em,
  
  api.id as item_id,
  api.origem,
  api.conta_pagar_id,
  api.fornecedor,
  api.descricao,
  api.valor_original,
  api.valor_aprovado,
  api.valor,
  api.vencimento,
  api.status as item_status,
  api.observacao,
  api.aprovado_em,
  api.executado_em,
  
  -- Informações da conta a pagar (se aplicável)
  cp.numero_documento,
  cp.data_emissao as conta_data_emissao,
  
  -- Categorização para relatório
  CASE 
    WHEN api.origem = 'ap' THEN 'Contas a Pagar'
    WHEN api.origem = 'ad-hoc' THEN 'Pagamento Ad-hoc'
    ELSE 'Outros'
  END as tipo_pagamento,
  
  -- Indicador de valor parcial
  CASE 
    WHEN api.valor_aprovado < api.valor_original THEN true
    ELSE false
  END as eh_valor_parcial
  
FROM agenda_pagamentos ap
LEFT JOIN agenda_pagamento_itens api ON ap.id = api.agenda_id
LEFT JOIN contas_pagar cp ON api.conta_pagar_id = cp.id
ORDER BY ap.data_base DESC, api.vencimento ASC;

-- Grant permissions na view
GRANT SELECT ON vw_agenda_relatorio TO anon, authenticated, service_role;