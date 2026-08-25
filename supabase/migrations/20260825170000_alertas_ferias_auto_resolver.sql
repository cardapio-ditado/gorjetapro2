/*
  # Alertas de férias: a geradora aprende a fechar o que deixou de valer

  gerar_alertas_ferias() só criava alertas — nunca resolvia. Quando o período
  saía de "vencido" para "completo" (ou o prazo mudava), o alerta ficava ativo
  para sempre; foi assim que a tela acumulou 100+ notificações já resolvidas.

  Agora a função abre com um passo de auto-resolução: alerta ativo cuja
  condição não existe mais no período de hoje é marcado como resolvido. O
  critério espelha exatamente o critério de criação, para não haver
  pingue-pongue resolve/recria entre execuções.

  De passagem, esta migration alinha o repositório à versão viva da função,
  que já corrigira um `paf.` fora de escopo no primeiro laço (o arquivo
  20251117193716 ainda carrega o bug).
*/

CREATE OR REPLACE FUNCTION gerar_alertas_ferias()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_periodo RECORD;
  v_dias_ate_vencimento integer;
  v_prioridade text;
  v_titulo text;
  v_mensagem text;
BEGIN
  -- Limpar alertas antigos resolvidos (mais de 90 dias)
  DELETE FROM alertas_ferias
  WHERE status = 'resolvido'
    AND resolvido_em < CURRENT_DATE - interval '90 days';

  -- Auto-resolução: alerta cuja condição deixou de existir se fecha sozinho.
  -- O NOT espelha os WHERE dos dois laços de criação abaixo.
  UPDATE alertas_ferias a
     SET status = 'resolvido', resolvido_em = now()
    FROM periodos_aquisitivos_ferias p
   WHERE p.id = a.periodo_aquisitivo_id
     AND a.status = 'ativo'
     AND NOT (
       (a.tipo_alerta = 'ferias_vencidas'
          AND p.status = 'vencido' AND p.dias_restantes > 0)
       OR
       (a.tipo_alerta = 'periodo_concessivo_vencendo'
          AND p.status IN ('pendente', 'parcial') AND p.dias_restantes > 0)
       OR
       (a.tipo_alerta = 'periodo_aquisitivo_finalizando'
          AND p.periodo_aquisitivo_fim >= CURRENT_DATE)
     );

  -- Alerta órfão (período apagado) também se resolve.
  UPDATE alertas_ferias
     SET status = 'resolvido', resolvido_em = now()
   WHERE status = 'ativo'
     AND periodo_aquisitivo_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM periodos_aquisitivos_ferias p
        WHERE p.id = alertas_ferias.periodo_aquisitivo_id
     );

  -- Gerar alertas para períodos próximos ao vencimento
  FOR v_periodo IN
    SELECT
      paf.*,
      c.nome_completo,
      c.funcao_personalizada
    FROM periodos_aquisitivos_ferias paf
    JOIN colaboradores c ON c.id = paf.colaborador_id
    WHERE paf.status IN ('pendente', 'parcial')
      AND paf.dias_restantes > 0
      AND c.status = 'ativo'
  LOOP
    v_dias_ate_vencimento := v_periodo.periodo_concessivo_fim - CURRENT_DATE;

    IF v_dias_ate_vencimento <= 15 THEN
      v_prioridade := 'urgente';
    ELSIF v_dias_ate_vencimento <= 30 THEN
      v_prioridade := 'alta';
    ELSIF v_dias_ate_vencimento <= 60 THEN
      v_prioridade := 'media';
    ELSE
      v_prioridade := 'baixa';
    END IF;

    v_titulo := format('Férias vencendo em %s dias - %s', v_dias_ate_vencimento, v_periodo.nome_completo);
    v_mensagem := format(
      'O colaborador %s (%s) possui %s dias de férias restantes do período aquisitivo %s a %s. O prazo para gozo termina em %s (%s dias).',
      v_periodo.nome_completo,
      v_periodo.funcao_personalizada,
      v_periodo.dias_restantes,
      to_char(v_periodo.periodo_aquisitivo_inicio, 'DD/MM/YYYY'),
      to_char(v_periodo.periodo_aquisitivo_fim, 'DD/MM/YYYY'),
      to_char(v_periodo.periodo_concessivo_fim, 'DD/MM/YYYY'),
      v_dias_ate_vencimento
    );

    INSERT INTO alertas_ferias (
      colaborador_id, periodo_aquisitivo_id, tipo_alerta, prioridade,
      titulo, mensagem, data_alerta, dias_ate_vencimento
    )
    SELECT
      v_periodo.colaborador_id, v_periodo.id, 'periodo_concessivo_vencendo', v_prioridade,
      v_titulo, v_mensagem, CURRENT_DATE, v_dias_ate_vencimento
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_ferias
      WHERE periodo_aquisitivo_id = v_periodo.id
        AND status = 'ativo'
        AND tipo_alerta = 'periodo_concessivo_vencendo'
    );
  END LOOP;

  -- Gerar alertas para férias já vencidas
  FOR v_periodo IN
    SELECT
      paf.*,
      c.nome_completo,
      c.funcao_personalizada
    FROM periodos_aquisitivos_ferias paf
    JOIN colaboradores c ON c.id = paf.colaborador_id
    WHERE paf.status = 'vencido'
      AND paf.dias_restantes > 0
      AND c.status = 'ativo'
  LOOP
    v_dias_ate_vencimento := CURRENT_DATE - v_periodo.periodo_concessivo_fim;
    v_titulo := format('FÉRIAS VENCIDAS - %s', v_periodo.nome_completo);
    v_mensagem := format(
      'ATENÇÃO! O colaborador %s (%s) possui %s dias de férias VENCIDAS do período aquisitivo %s a %s. O prazo terminou em %s (há %s dias). Providências urgentes são necessárias.',
      v_periodo.nome_completo,
      v_periodo.funcao_personalizada,
      v_periodo.dias_restantes,
      to_char(v_periodo.periodo_aquisitivo_inicio, 'DD/MM/YYYY'),
      to_char(v_periodo.periodo_aquisitivo_fim, 'DD/MM/YYYY'),
      to_char(v_periodo.periodo_concessivo_fim, 'DD/MM/YYYY'),
      v_dias_ate_vencimento
    );

    INSERT INTO alertas_ferias (
      colaborador_id, periodo_aquisitivo_id, tipo_alerta, prioridade,
      titulo, mensagem, data_alerta, dias_ate_vencimento
    )
    SELECT
      v_periodo.colaborador_id, v_periodo.id, 'ferias_vencidas', 'urgente',
      v_titulo, v_mensagem, CURRENT_DATE, -v_dias_ate_vencimento
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_ferias
      WHERE periodo_aquisitivo_id = v_periodo.id
        AND status = 'ativo'
        AND tipo_alerta = 'ferias_vencidas'
    );
  END LOOP;
END;
$$;
