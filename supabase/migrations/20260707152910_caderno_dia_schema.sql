/*
# Caderno do Dia — Daily Notebook Schema

Replaces the per-incident "ocorrencias_setor" workflow with a daily notebook model.
Managers write everything that happened in one session, organized by sector.

## New Tables

### caderno_dia
One row per (date + sector). Stores the narrative of what happened in each sector on a given day.
- id (uuid, PK)
- data_registro (date) — the calendar day this entry belongs to
- setor (text) — bar | cozinha | administrativo | salao | relacionamento_clientes | seguranca
- acontecimentos (text) — free-form narrative of events/incidents
- acoes_tomadas (text) — actions taken by management
- observacoes (text) — additional notes
- registrado_por (text) — manager name who wrote the entry
- criado_em / atualizado_em (timestamps)

### caderno_faltas
One row per absent employee, linked to a caderno_dia entry.
- id (uuid, PK)
- caderno_id (uuid, FK → caderno_dia.id, CASCADE DELETE)
- funcionario_nome (text) — employee name
- motivo (text) — reason for absence
- justificada (boolean) — whether the absence is justified/excused
- criado_em (timestamp)

## Security
- RLS enabled on both tables.
- All policies use TO anon, authenticated — the app uses a custom auth system (not Supabase auth),
  so the anon-key client must be able to read and write freely.
*/

CREATE TABLE IF NOT EXISTS caderno_dia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_registro date NOT NULL DEFAULT CURRENT_DATE,
  setor text NOT NULL,
  acontecimentos text,
  acoes_tomadas text,
  observacoes text,
  registrado_por text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE (data_registro, setor)
);

CREATE TABLE IF NOT EXISTS caderno_faltas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caderno_id uuid NOT NULL REFERENCES caderno_dia(id) ON DELETE CASCADE,
  funcionario_nome text NOT NULL,
  motivo text,
  justificada boolean NOT NULL DEFAULT false,
  criado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caderno_dia_data ON caderno_dia(data_registro DESC);
CREATE INDEX IF NOT EXISTS idx_caderno_faltas_caderno ON caderno_faltas(caderno_id);

ALTER TABLE caderno_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE caderno_faltas ENABLE ROW LEVEL SECURITY;

-- caderno_dia policies
DROP POLICY IF EXISTS "anon_select_caderno_dia" ON caderno_dia;
CREATE POLICY "anon_select_caderno_dia" ON caderno_dia FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_caderno_dia" ON caderno_dia;
CREATE POLICY "anon_insert_caderno_dia" ON caderno_dia FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_caderno_dia" ON caderno_dia;
CREATE POLICY "anon_update_caderno_dia" ON caderno_dia FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_caderno_dia" ON caderno_dia;
CREATE POLICY "anon_delete_caderno_dia" ON caderno_dia FOR DELETE
  TO anon, authenticated USING (true);

-- caderno_faltas policies
DROP POLICY IF EXISTS "anon_select_caderno_faltas" ON caderno_faltas;
CREATE POLICY "anon_select_caderno_faltas" ON caderno_faltas FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_caderno_faltas" ON caderno_faltas;
CREATE POLICY "anon_insert_caderno_faltas" ON caderno_faltas FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_caderno_faltas" ON caderno_faltas;
CREATE POLICY "anon_update_caderno_faltas" ON caderno_faltas FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_caderno_faltas" ON caderno_faltas;
CREATE POLICY "anon_delete_caderno_faltas" ON caderno_faltas FOR DELETE
  TO anon, authenticated USING (true);
