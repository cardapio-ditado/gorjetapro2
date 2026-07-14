/*
  # Adicionar colunas de aprovação à tabela solicitacoes

  O componente AprovacoesSolicitacoes.tsx tenta gravar `data_aprovacao` e
  `observacoes_aprovacao` na tabela `solicitacoes`, mas essas colunas não
  existiam, causando erro ao aprovar/rejeitar.

  Também adiciona `data_resolucao` que é usada ao marcar como concluído.

  ## Novas colunas em solicitacoes
  - data_aprovacao: timestamp de quando foi aprovada/rejeitada
  - observacoes_aprovacao: texto livre com justificativa da decisão
  - aprovado_por: quem aprovou/rejeitou
  - data_resolucao: timestamp de quando foi marcada como concluída
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='solicitacoes' AND column_name='data_aprovacao') THEN
    ALTER TABLE solicitacoes ADD COLUMN data_aprovacao timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='solicitacoes' AND column_name='observacoes_aprovacao') THEN
    ALTER TABLE solicitacoes ADD COLUMN observacoes_aprovacao text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='solicitacoes' AND column_name='aprovado_por') THEN
    ALTER TABLE solicitacoes ADD COLUMN aprovado_por text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='solicitacoes' AND column_name='data_resolucao') THEN
    ALTER TABLE solicitacoes ADD COLUMN data_resolucao timestamptz;
  END IF;
END $$;
