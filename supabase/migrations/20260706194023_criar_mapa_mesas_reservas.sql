/*
# Mapa de Mesas e Reservas

1. Novas Tabelas
   - `mesas`: define cada mesa do estabelecimento com posição visual no mapa
     - numero, nome, capacidade, posição x/y (% relativo ao canvas), seção, formato, cor, ativo
   - `reservas_mesas`: reservas vinculadas a mesas específicas, feitas pelo link público
     - mesa_id, nome_cliente, telefone, data_reserva, horario, numero_pessoas, status, observacoes

2. Dados Iniciais
   - Insere ~20 mesas com layout padrão em 3 seções: Salão Principal, Varanda, VIP

3. Segurança
   - RLS habilitado em ambas as tabelas
   - Leitura e escrita pública (anon) para que o link externo funcione sem autenticação
*/

-- ─── Mesas ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mesas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero      text NOT NULL,
  nome        text,
  capacidade  int NOT NULL DEFAULT 4,
  posicao_x   numeric NOT NULL DEFAULT 10,  -- % horizontal no canvas (0-100)
  posicao_y   numeric NOT NULL DEFAULT 10,  -- % vertical no canvas (0-100)
  secao       text NOT NULL DEFAULT 'principal',
  formato     text NOT NULL DEFAULT 'round' CHECK (formato IN ('round','square','retangular')),
  largura     int NOT NULL DEFAULT 60,   -- px no canvas (para retangular)
  altura      int NOT NULL DEFAULT 60,   -- px no canvas
  cor         text NOT NULL DEFAULT '#7D1F2C',
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz DEFAULT now()
);

ALTER TABLE mesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_mesas"  ON mesas;
DROP POLICY IF EXISTS "anon_insert_mesas"  ON mesas;
DROP POLICY IF EXISTS "anon_update_mesas"  ON mesas;
DROP POLICY IF EXISTS "anon_delete_mesas"  ON mesas;

CREATE POLICY "anon_select_mesas" ON mesas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_mesas" ON mesas FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_mesas" ON mesas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_mesas" ON mesas FOR DELETE TO anon, authenticated USING (true);

-- ─── Reservas de Mesas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservas_mesas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mesa_id        uuid NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  nome_cliente   text NOT NULL,
  telefone       text,
  data_reserva   date NOT NULL,
  horario        text NOT NULL DEFAULT '20:00',
  numero_pessoas int NOT NULL DEFAULT 2 CHECK (numero_pessoas > 0),
  status         text NOT NULL DEFAULT 'confirmada'
                   CHECK (status IN ('pendente','confirmada','cancelada','finalizada')),
  observacoes    text,
  criado_em      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservas_mesas_data   ON reservas_mesas(data_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_mesas_mesa   ON reservas_mesas(mesa_id);
CREATE INDEX IF NOT EXISTS idx_reservas_mesas_status ON reservas_mesas(status);

ALTER TABLE reservas_mesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_reservas_mesas"  ON reservas_mesas;
DROP POLICY IF EXISTS "anon_insert_reservas_mesas"  ON reservas_mesas;
DROP POLICY IF EXISTS "anon_update_reservas_mesas"  ON reservas_mesas;
DROP POLICY IF EXISTS "anon_delete_reservas_mesas"  ON reservas_mesas;

CREATE POLICY "anon_select_reservas_mesas" ON reservas_mesas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_reservas_mesas" ON reservas_mesas FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_reservas_mesas" ON reservas_mesas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_reservas_mesas" ON reservas_mesas FOR DELETE TO anon, authenticated USING (true);

-- ─── Layout padrão de mesas ──────────────────────────────────────────────────
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato) VALUES
  -- Salão Principal – fileira A (topo)
  ('01', 'Mesa 01', 4, 8,  12, 'principal', 'round'),
  ('02', 'Mesa 02', 4, 22, 12, 'principal', 'round'),
  ('03', 'Mesa 03', 4, 36, 12, 'principal', 'round'),
  ('04', 'Mesa 04', 4, 50, 12, 'principal', 'round'),
  ('05', 'Mesa 05', 4, 64, 12, 'principal', 'round'),
  ('06', 'Mesa 06', 4, 78, 12, 'principal', 'round'),
  -- Salão Principal – fileira B (meio)
  ('07', 'Mesa 07', 4, 8,  38, 'principal', 'round'),
  ('08', 'Mesa 08', 4, 22, 38, 'principal', 'round'),
  ('09', 'Mesa 09', 6, 36, 36, 'principal', 'round'),
  ('10', 'Mesa 10', 6, 50, 36, 'principal', 'round'),
  ('11', 'Mesa 11', 4, 64, 38, 'principal', 'round'),
  ('12', 'Mesa 12', 4, 78, 38, 'principal', 'round'),
  -- Varanda
  ('13', 'Varanda 1', 2, 8,  65, 'varanda', 'square'),
  ('14', 'Varanda 2', 2, 22, 65, 'varanda', 'square'),
  ('15', 'Varanda 3', 4, 36, 65, 'varanda', 'square'),
  ('16', 'Varanda 4', 4, 50, 65, 'varanda', 'square'),
  -- VIP
  ('V1', 'VIP 1', 8, 65, 62, 'vip', 'retangular'),
  ('V2', 'VIP 2', 8, 80, 62, 'vip', 'retangular')
ON CONFLICT DO NOTHING;
