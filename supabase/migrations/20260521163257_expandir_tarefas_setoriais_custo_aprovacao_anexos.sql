/*
  # Expandir Metas & Tarefas — Custo, Aprovação e Anexos

  Adiciona campos de gestão de processo completa às tarefas setoriais:
  - Custo (tem custo? valor estimado, valor real)
  - Aprovação (requer aprovação, status, quem aprovou, observação)
  - Solicitante (quem criou/solicitou)
  - Tags de processo

  Cria tabela de anexos para orçamentos e documentos relacionados.
  Cria bucket de storage para os arquivos.

  ## Novas colunas em tarefas_setoriais
  - solicitante: quem está pedindo/solicitando
  - tem_custo: boolean indica se há custo envolvido
  - valor_estimado: valor previsto (orçamento)
  - valor_real: custo efetivo após execução
  - requer_aprovacao: boolean se precisa de aprovação antes de executar
  - status_aprovacao: pendente | aprovado | rejeitado (null se não requer)
  - aprovado_por: nome de quem aprovou/rejeitou
  - aprovado_em: timestamp da aprovação
  - obs_aprovacao: observação do aprovador
  - checklist: jsonb array de itens de checklist [{id, texto, concluido}]
  - tags: array de texto para categorização
  - numero_tarefa: número sequencial para referência

  ## Nova tabela tarefas_anexos
  - Armazena referências a arquivos (orçamentos, documentos, imagens)
  - Vinculada a tarefas_setoriais por tarefa_id
*/

-- Adicionar colunas à tabela existente
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='solicitante') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN solicitante text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='tem_custo') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN tem_custo boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='valor_estimado') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN valor_estimado numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='valor_real') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN valor_real numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='requer_aprovacao') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN requer_aprovacao boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='status_aprovacao') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN status_aprovacao text CHECK (status_aprovacao IN ('pendente','aprovado','rejeitado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='aprovado_por') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN aprovado_por text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='aprovado_em') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN aprovado_em timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='obs_aprovacao') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN obs_aprovacao text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='checklist') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN checklist jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tarefas_setoriais' AND column_name='numero_tarefa') THEN
    ALTER TABLE tarefas_setoriais ADD COLUMN numero_tarefa serial;
  END IF;
END $$;

-- Tabela de anexos
CREATE TABLE IF NOT EXISTS tarefas_anexos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id     uuid        NOT NULL REFERENCES tarefas_setoriais(id) ON DELETE CASCADE,
  nome_arquivo  text        NOT NULL,
  url_arquivo   text        NOT NULL,
  storage_path  text,
  tipo_mime     text,
  tamanho_bytes bigint,
  descricao     text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tarefas_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated select tarefas_anexos"
  ON tarefas_anexos FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated insert tarefas_anexos"
  ON tarefas_anexos FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated delete tarefas_anexos"
  ON tarefas_anexos FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "anon select tarefas_anexos"
  ON tarefas_anexos FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert tarefas_anexos"
  ON tarefas_anexos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon delete tarefas_anexos"
  ON tarefas_anexos FOR DELETE TO anon USING (true);

-- Storage bucket para anexos de tarefas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tarefas-anexos',
  'tarefas-anexos',
  true,
  20971520,
  ARRAY['image/jpeg','image/png','image/webp','image/gif',
        'application/pdf','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "tarefas_anexos_storage_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'tarefas-anexos');

CREATE POLICY "tarefas_anexos_storage_insert"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'tarefas-anexos');

CREATE POLICY "tarefas_anexos_storage_delete"
  ON storage.objects FOR DELETE TO public
  USING (bucket_id = 'tarefas-anexos');
