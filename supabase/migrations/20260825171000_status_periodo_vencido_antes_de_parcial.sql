/*
  atualizar_status_periodos_aquisitivos: vencido vem ANTES de parcial.

  A ordem antiga testava "parcial" (tem gozo, não completou) antes de olhar o
  prazo — período com prazo estourado e gozo parcial virava "parcial" e o
  alerta de férias vencidas morria. Como a tela de Monitoramento chama esta
  função ao abrir, qualquer correção manual de status era desfeita na visita
  seguinte.

  Ordem correta: quitou → completo; prazo estourou → vencido; tem gozo →
  parcial; senão → pendente.
*/
CREATE OR REPLACE FUNCTION atualizar_status_periodos_aquisitivos()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE periodos_aquisitivos_ferias
  SET
    status = CASE
      WHEN dias_restantes <= 0 THEN 'completo'
      WHEN CURRENT_DATE > periodo_concessivo_fim THEN 'vencido'
      WHEN dias_gozados > 0 THEN 'parcial'
      ELSE 'pendente'
    END,
    atualizado_em = now()
  WHERE status IS DISTINCT FROM CASE
      WHEN dias_restantes <= 0 THEN 'completo'
      WHEN CURRENT_DATE > periodo_concessivo_fim THEN 'vencido'
      WHEN dias_gozados > 0 THEN 'parcial'
      ELSE 'pendente'
    END;
END;
$$;
