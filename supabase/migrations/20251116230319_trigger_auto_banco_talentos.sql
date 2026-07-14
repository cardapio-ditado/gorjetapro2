/*
  # Trigger para adicionar automaticamente ao banco de talentos

  1. Alterações
    - Criar função que adiciona candidato ao banco_talentos quando status muda
    - Criar trigger que executa a função automaticamente
    - Inserir candidatos existentes que já têm status banco_talentos
*/

-- Função para adicionar ao banco de talentos automaticamente
CREATE OR REPLACE FUNCTION adicionar_banco_talentos_automatico()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o status mudou para banco_talentos
  IF NEW.status = 'banco_talentos' AND (OLD.status IS NULL OR OLD.status != 'banco_talentos') THEN
    -- Inserir no banco de talentos se ainda não existe
    INSERT INTO banco_talentos (
      candidato_id,
      candidatura_id,
      motivo_inclusao,
      status
    )
    VALUES (
      NEW.candidato_id,
      NEW.id,
      'Aprovado após processo seletivo',
      'ativo'
    )
    ON CONFLICT (candidato_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_adicionar_banco_talentos ON rh_candidaturas;

-- Criar trigger
CREATE TRIGGER trigger_adicionar_banco_talentos
  AFTER INSERT OR UPDATE ON rh_candidaturas
  FOR EACH ROW
  EXECUTE FUNCTION adicionar_banco_talentos_automatico();

-- Adicionar candidatos existentes que já têm status banco_talentos
INSERT INTO banco_talentos (
  candidato_id,
  candidatura_id,
  motivo_inclusao,
  status
)
SELECT 
  candidato_id,
  id,
  'Aprovado após processo seletivo',
  'ativo'
FROM rh_candidaturas
WHERE status = 'banco_talentos'
ON CONFLICT (candidato_id) DO NOTHING;
