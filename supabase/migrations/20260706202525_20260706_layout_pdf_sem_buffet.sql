
-- Delete existing reservas and mesas, then reinsert correct layout from PDF (no buffet section)
DELETE FROM reservas_mesas;
DELETE FROM mesas;

-- ─── SALÃO PRINCIPAL (top section, BANHEIROS zone) ───────────────────────────
-- PDF top section: rows of rectangular 4-person tables + 1 oval cap-8 top-right + PALCO zone
-- After removing BUFFET: keep right-side tables only
-- Canvas uses paddingBottom ~130% (portrait), x/y in percentages

-- Top row above BANHEIROS zone divider (y~4%)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, ativo) VALUES
  ('S01','Mesa S01',4, 44, 4, 'salao','retangular',true),
  ('S02','Mesa S02',4, 55, 4, 'salao','retangular',true),
  ('S03','Mesa S03',4, 66, 4, 'salao','retangular',true),
  ('S04','Mesa S04',8, 81, 3, 'salao','round',true),

-- Second top row (y~11%)
  ('S05','Mesa S05',4, 20, 11, 'salao','retangular',true),
  ('S06','Mesa S06',4, 33, 11, 'salao','retangular',true),
  ('S07','Mesa S07',4, 46, 11, 'salao','retangular',true),
  ('S08','Mesa S08',4, 59, 11, 'salao','retangular',true),
  ('S09','Mesa S09',4, 72, 11, 'salao','retangular',true),

-- Row 3 (y~19%)
  ('S10','Mesa S10',4, 20, 19, 'salao','retangular',true),
  ('S11','Mesa S11',4, 33, 19, 'salao','retangular',true),
  ('S12','Mesa S12',4, 46, 19, 'salao','retangular',true),
  ('S13','Mesa S13',4, 59, 19, 'salao','retangular',true),
  ('S14','Mesa S14',4, 72, 19, 'salao','retangular',true),

-- Row 4 (y~27%)
  ('S15','Mesa S15',4, 20, 27, 'salao','retangular',true),
  ('S16','Mesa S16',4, 33, 27, 'salao','retangular',true),
  ('S17','Mesa S17',4, 46, 27, 'salao','retangular',true),
  ('S18','Mesa S18',4, 59, 27, 'salao','retangular',true),
  ('S19','Mesa S19',4, 72, 27, 'salao','retangular',true),

-- Row 5 – partial left (PALCO takes right side from ~x=68%) (y~35%)
  ('S20','Mesa S20',4, 20, 35, 'salao','retangular',true),
  ('S21','Mesa S21',4, 33, 35, 'salao','retangular',true),
  ('S22','Mesa S22',4, 46, 35, 'salao','retangular',true),

-- Row 6 – partial left (y~43%)
  ('S23','Mesa S23',4, 20, 43, 'salao','retangular',true),
  ('S24','Mesa S24',4, 33, 43, 'salao','retangular',true),
  ('S25','Mesa S25',4, 46, 43, 'salao','retangular',true),

-- ─── BAR DE DRINK (middle section) ───────────────────────────────────────────
-- 5 rows, x columns at ~20,33,46,59,72

-- Row 1 (y~52%) – 5 tables
  ('D01','Mesa D01',4, 20, 52, 'bar_drink','retangular',true),
  ('D02','Mesa D02',4, 33, 52, 'bar_drink','retangular',true),
  ('D03','Mesa D03',4, 46, 52, 'bar_drink','retangular',true),
  ('D04','Mesa D04',4, 59, 52, 'bar_drink','retangular',true),
  ('D05','Mesa D05',4, 72, 52, 'bar_drink','retangular',true),

-- Row 2 (y~58%) – 5 tables, skip position 4 (gap between 3rd and last 2)
  ('D06','Mesa D06',4, 20, 58, 'bar_drink','retangular',true),
  ('D07','Mesa D07',4, 33, 58, 'bar_drink','retangular',true),
  ('D08','Mesa D08',4, 46, 58, 'bar_drink','retangular',true),
  ('D09','Mesa D09',4, 63, 58, 'bar_drink','retangular',true),
  ('D10','Mesa D10',4, 76, 58, 'bar_drink','retangular',true),

-- Row 3 (y~64%) – 5 tables
  ('D11','Mesa D11',4, 20, 64, 'bar_drink','retangular',true),
  ('D12','Mesa D12',4, 33, 64, 'bar_drink','retangular',true),
  ('D13','Mesa D13',4, 46, 64, 'bar_drink','retangular',true),
  ('D14','Mesa D14',4, 59, 64, 'bar_drink','retangular',true),
  ('D15','Mesa D15',4, 72, 64, 'bar_drink','retangular',true),

-- Row 4 (y~70%) – 5 tables
  ('D16','Mesa D16',4, 20, 70, 'bar_drink','retangular',true),
  ('D17','Mesa D17',4, 33, 70, 'bar_drink','retangular',true),
  ('D18','Mesa D18',4, 46, 70, 'bar_drink','retangular',true),
  ('D19','Mesa D19',4, 59, 70, 'bar_drink','retangular',true),
  ('D20','Mesa D20',4, 72, 70, 'bar_drink','retangular',true),

-- Row 5 (y~76%) – 3 tables right-center
  ('D21','Mesa D21',4, 46, 76, 'bar_drink','retangular',true),
  ('D22','Mesa D22',4, 59, 76, 'bar_drink','retangular',true),
  ('D23','Mesa D23',4, 72, 76, 'bar_drink','retangular',true),

-- ─── BAR DE CHOPP (bottom section) ───────────────────────────────────────────
-- Left column: 6 tables cap-4 (x~38%), Right column: 4 tables cap-6 (x~72%)

  ('C01','Mesa C01',4, 38, 82, 'bar_chopp','retangular',true),
  ('C02','Mesa C02',4, 38, 86, 'bar_chopp','retangular',true),
  ('C03','Mesa C03',4, 38, 90, 'bar_chopp','retangular',true),
  ('C04','Mesa C04',4, 38, 94, 'bar_chopp','retangular',true),
  ('C05','Mesa C05',4, 38, 98, 'bar_chopp','retangular',true),
  ('C06','Mesa C06',4, 38,102, 'bar_chopp','retangular',true),

  ('C07','Mesa C07',6, 72, 83, 'bar_chopp','retangular',true),
  ('C08','Mesa C08',6, 72, 89, 'bar_chopp','retangular',true),
  ('C09','Mesa C09',6, 72, 95, 'bar_chopp','retangular',true),
  ('C10','Mesa C10',6, 72,101, 'bar_chopp','retangular',true);
