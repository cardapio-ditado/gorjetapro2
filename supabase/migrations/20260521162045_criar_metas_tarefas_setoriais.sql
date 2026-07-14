/*
  # Metas e Tarefas por Setor

  Cria tabela para o novo módulo de Metas & Tarefas separado por setor,
  substituindo a aba de tarefas da Agenda Diária.

  ## Setores
  - gestao (Financeiro / Compras / Estoque)
  - marketing (Marketing e Vendas)
  - cozinha
  - bar
  - salao

  ## Estrutura
  - tarefas_setoriais: tarefas/metas com fase kanban, prioridade, setor e responsável
*/

CREATE TABLE IF NOT EXISTS tarefas_setoriais (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  setor         text        NOT NULL CHECK (setor IN ('gestao','marketing','cozinha','bar','salao')),
  titulo        text        NOT NULL,
  descricao     text,
  responsavel   text,
  prioridade    text        NOT NULL DEFAULT 'media' CHECK (prioridade IN ('urgente','alta','media','baixa')),
  fase          text        NOT NULL DEFAULT 'solicitado' CHECK (fase IN ('solicitado','em_andamento','concluido','cancelado')),
  data_limite   date,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tarefas_setoriais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access tarefas_setoriais"
  ON tarefas_setoriais FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated insert tarefas_setoriais"
  ON tarefas_setoriais FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update tarefas_setoriais"
  ON tarefas_setoriais FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated delete tarefas_setoriais"
  ON tarefas_setoriais FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- anon read so public-facing pages can load
CREATE POLICY "Anon read tarefas_setoriais"
  ON tarefas_setoriais FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon insert tarefas_setoriais"
  ON tarefas_setoriais FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon update tarefas_setoriais"
  ON tarefas_setoriais FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon delete tarefas_setoriais"
  ON tarefas_setoriais FOR DELETE
  TO anon
  USING (true);
