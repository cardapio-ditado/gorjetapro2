/*
  # RLS para tabelas do módulo Controle De Ville

  Habilita acesso para roles anon e authenticated em todas as tabelas
  isoladas do módulo De Ville. As tabelas são privadas ao sistema
  (não há dados de usuários individuais), portanto policies amplas
  são adequadas aqui.

  Tabelas:
    - fornecedor_catalogo
    - fornecedor_notas
    - fornecedor_notas_itens
    - fornecedor_pagamentos
    - fornecedor_consignado_movimentos
    - fornecedor_estoque_saldo
    - fornecedor_estoque_movimentos
*/

-- ── fornecedor_catalogo ────────────────────────────────────────────────────────
ALTER TABLE fornecedor_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deville catalogo select" ON fornecedor_catalogo FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Deville catalogo insert" ON fornecedor_catalogo FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Deville catalogo update" ON fornecedor_catalogo FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deville catalogo delete" ON fornecedor_catalogo FOR DELETE TO anon, authenticated USING (true);

-- ── fornecedor_notas ───────────────────────────────────────────────────────────
ALTER TABLE fornecedor_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deville notas select" ON fornecedor_notas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Deville notas insert" ON fornecedor_notas FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Deville notas update" ON fornecedor_notas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deville notas delete" ON fornecedor_notas FOR DELETE TO anon, authenticated USING (true);

-- ── fornecedor_notas_itens ─────────────────────────────────────────────────────
ALTER TABLE fornecedor_notas_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deville notas itens select" ON fornecedor_notas_itens FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Deville notas itens insert" ON fornecedor_notas_itens FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Deville notas itens update" ON fornecedor_notas_itens FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deville notas itens delete" ON fornecedor_notas_itens FOR DELETE TO anon, authenticated USING (true);

-- ── fornecedor_pagamentos ──────────────────────────────────────────────────────
ALTER TABLE fornecedor_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deville pagamentos select" ON fornecedor_pagamentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Deville pagamentos insert" ON fornecedor_pagamentos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Deville pagamentos update" ON fornecedor_pagamentos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deville pagamentos delete" ON fornecedor_pagamentos FOR DELETE TO anon, authenticated USING (true);

-- ── fornecedor_consignado_movimentos ──────────────────────────────────────────
ALTER TABLE fornecedor_consignado_movimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deville consig mov select" ON fornecedor_consignado_movimentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Deville consig mov insert" ON fornecedor_consignado_movimentos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Deville consig mov update" ON fornecedor_consignado_movimentos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deville consig mov delete" ON fornecedor_consignado_movimentos FOR DELETE TO anon, authenticated USING (true);

-- ── fornecedor_estoque_saldo ───────────────────────────────────────────────────
ALTER TABLE fornecedor_estoque_saldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deville estoque saldo select" ON fornecedor_estoque_saldo FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Deville estoque saldo insert" ON fornecedor_estoque_saldo FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Deville estoque saldo update" ON fornecedor_estoque_saldo FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deville estoque saldo delete" ON fornecedor_estoque_saldo FOR DELETE TO anon, authenticated USING (true);

-- ── fornecedor_estoque_movimentos ──────────────────────────────────────────────
ALTER TABLE fornecedor_estoque_movimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deville estoque mov select" ON fornecedor_estoque_movimentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Deville estoque mov insert" ON fornecedor_estoque_movimentos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Deville estoque mov update" ON fornecedor_estoque_movimentos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Deville estoque mov delete" ON fornecedor_estoque_movimentos FOR DELETE TO anon, authenticated USING (true);
