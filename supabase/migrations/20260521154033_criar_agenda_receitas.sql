/*
  # Create agenda_receitas table

  Stores individual income entries (PIX, cash, etc.) for each daily session
  in the Agenda Diária module. This replaces the static saldo inputs on agenda_sessoes.

  1. New Tables
    - `agenda_receitas`
      - `id` (uuid, pk)
      - `sessao_id` (uuid, fk agenda_sessoes)
      - `data_base` (date, NOT NULL) — the session date
      - `descricao` (text) — e.g. "PIX evento", "Dinheiro bar"
      - `valor` (numeric, default 0)
      - `tipo` (text) — 'pix' | 'dinheiro' | 'outro'
      - `criado_em` (timestamptz)

  2. Security
    - RLS enabled
    - Full access for authenticated users
    - Full access for anon (same pattern as agenda_pagamentos)
*/

CREATE TABLE IF NOT EXISTS agenda_receitas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id   uuid REFERENCES agenda_sessoes(id) ON DELETE CASCADE,
  data_base   date NOT NULL,
  descricao   text NOT NULL,
  valor       numeric DEFAULT 0,
  tipo        text DEFAULT 'outro',
  criado_em   timestamptz DEFAULT now()
);

ALTER TABLE agenda_receitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access receitas"
  ON agenda_receitas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on agenda_receitas"
  ON agenda_receitas FOR ALL TO anon USING (true) WITH CHECK (true);
