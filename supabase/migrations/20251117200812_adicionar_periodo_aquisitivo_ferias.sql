/*
  # Adicionar campo período aquisitivo em férias

  1. Alterações
    - Adicionar campo periodo_aquisitivo_id em ferias_colaboradores
    - Criar trigger para atualizar dias gozados no período aquisitivo
*/

-- Adicionar campo periodo_aquisitivo_id
ALTER TABLE ferias_colaboradores
  ADD COLUMN IF NOT EXISTS periodo_aquisitivo_id uuid REFERENCES periodos_aquisitivos_ferias(id) ON DELETE SET NULL;

-- Criar índice
CREATE INDEX IF NOT EXISTS idx_ferias_periodo_aquisitivo ON ferias_colaboradores(periodo_aquisitivo_id);

-- Função para atualizar dias gozados no período aquisitivo
CREATE OR REPLACE FUNCTION atualizar_dias_gozados_periodo()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando férias forem aprovadas ou gozadas, atualizar o período aquisitivo
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.periodo_aquisitivo_id IS NOT NULL THEN
    IF NEW.status IN ('aprovado', 'gozado') THEN
      -- Atualizar dias gozados somando os dias corridos desta férias
      UPDATE periodos_aquisitivos_ferias
      SET dias_gozados = (
        SELECT COALESCE(SUM(f.dias_corridos), 0)
        FROM ferias_colaboradores f
        WHERE f.periodo_aquisitivo_id = NEW.periodo_aquisitivo_id
          AND f.status IN ('aprovado', 'gozado')
      )
      WHERE id = NEW.periodo_aquisitivo_id;
    END IF;
  END IF;

  -- Quando férias forem excluídas, recalcular os dias gozados
  IF TG_OP = 'DELETE' AND OLD.periodo_aquisitivo_id IS NOT NULL THEN
    UPDATE periodos_aquisitivos_ferias
    SET dias_gozados = (
      SELECT COALESCE(SUM(f.dias_corridos), 0)
      FROM ferias_colaboradores f
      WHERE f.periodo_aquisitivo_id = OLD.periodo_aquisitivo_id
        AND f.status IN ('aprovado', 'gozado')
        AND f.id != OLD.id
    )
    WHERE id = OLD.periodo_aquisitivo_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS trigger_atualizar_dias_gozados_periodo ON ferias_colaboradores;
CREATE TRIGGER trigger_atualizar_dias_gozados_periodo
  AFTER INSERT OR UPDATE OR DELETE ON ferias_colaboradores
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_dias_gozados_periodo();
