-- Adiciona grupo_reserva_id para reservas agrupadas
ALTER TABLE reservas_mesas ADD COLUMN IF NOT EXISTS grupo_reserva_id uuid;

-- Remove dados antigos
DELETE FROM reservas_mesas;
DELETE FROM mesas;

-- ═══════════════════════════════════════════
-- SEÇÃO: BAR DE CHOPP  (y = 0–30)
-- ═══════════════════════════════════════════

-- Oval topo-direito
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('V1', 'VIP Topo Direito', 8, 90, 5, 'bar_chopp', 'round', 65, 65, '#7D1F2C', true);

-- Linha principal do chopp (y=2, 5 mesas)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('01', 'Mesa 01', 4, 35, 2, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('02', 'Mesa 02', 4, 45, 2, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('03', 'Mesa 03', 4, 55, 2, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('04', 'Mesa 04', 4, 65, 2, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('05', 'Mesa 05', 4, 75, 2, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true);

-- Cluster 2×2 topo-direito isolado
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('T1', 'Mesa T1', 4, 82, 2, 'bar_chopp', 'square', 50, 50, '#7D1F2C', true),
  ('T2', 'Mesa T2', 4, 92, 2, 'bar_chopp', 'square', 50, 50, '#7D1F2C', true),
  ('T3', 'Mesa T3', 4, 82, 8, 'bar_chopp', 'square', 50, 50, '#7D1F2C', true),
  ('T4', 'Mesa T4', 4, 92, 8, 'bar_chopp', 'square', 50, 50, '#7D1F2C', true);

-- Linha chopp 6 lugares (y=20, 4 mesas)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('06', 'Mesa 06', 6, 35, 20, 'bar_chopp', 'retangular', 68, 50, '#7D1F2C', true),
  ('07', 'Mesa 07', 6, 45, 20, 'bar_chopp', 'retangular', 68, 50, '#7D1F2C', true),
  ('08', 'Mesa 08', 6, 55, 20, 'bar_chopp', 'retangular', 68, 50, '#7D1F2C', true),
  ('09', 'Mesa 09', 6, 65, 20, 'bar_chopp', 'retangular', 68, 50, '#7D1F2C', true);

-- ═══════════════════════════════════════════
-- SEÇÃO: BAR DE DRINK  (y = 35–55)
-- ═══════════════════════════════════════════

-- Linha 1 drink (y=38, 6 mesas)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('10', 'Mesa 10', 4, 35, 38, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('11', 'Mesa 11', 4, 45, 38, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('12', 'Mesa 12', 4, 55, 38, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('13', 'Mesa 13', 4, 65, 38, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('14', 'Mesa 14', 4, 75, 38, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('15', 'Mesa 15', 4, 85, 38, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true);

-- Linha 2 drink (y=45, 6 mesas)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('16', 'Mesa 16', 4, 35, 45, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('17', 'Mesa 17', 4, 45, 45, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('18', 'Mesa 18', 4, 55, 45, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('19', 'Mesa 19', 4, 65, 45, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('20', 'Mesa 20', 4, 75, 45, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('21', 'Mesa 21', 4, 85, 45, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true);

-- ═══════════════════════════════════════════
-- SEÇÃO: SALÃO PRINCIPAL  (y = 55–100)
-- ═══════════════════════════════════════════

-- 3 ovais laterais esquerda (y=55)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('V2', 'VIP Oval 1', 8,  5, 55, 'salao', 'round', 62, 62, '#7D1F2C', true),
  ('V3', 'VIP Oval 2', 6, 12, 55, 'salao', 'round', 58, 58, '#7D1F2C', true),
  ('V4', 'VIP Oval 3', 8, 19, 55, 'salao', 'round', 62, 62, '#7D1F2C', true);

-- Bloco principal 3×3 (y=60,67,74)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('22', 'Mesa 22', 4, 40, 60, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('23', 'Mesa 23', 4, 50, 60, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('24', 'Mesa 24', 4, 60, 60, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('25', 'Mesa 25', 4, 40, 67, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('26', 'Mesa 26', 4, 50, 67, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('27', 'Mesa 27', 4, 60, 67, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('28', 'Mesa 28', 4, 40, 74, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('29', 'Mesa 29', 4, 50, 74, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('30', 'Mesa 30', 4, 60, 74, 'salao', 'retangular', 68, 46, '#7D1F2C', true);

-- Bloco fundo linha 1 (y=84, 5 mesas)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('31', 'Mesa 31', 4, 35, 84, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('32', 'Mesa 32', 4, 45, 84, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('33', 'Mesa 33', 4, 55, 84, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('34', 'Mesa 34', 4, 65, 84, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('35', 'Mesa 35', 4, 75, 84, 'salao', 'retangular', 68, 46, '#7D1F2C', true);

-- Bloco fundo linha 2 (y=90, 5 mesas)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('36', 'Mesa 36', 4, 35, 90, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('37', 'Mesa 37', 4, 45, 90, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('38', 'Mesa 38', 4, 55, 90, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('39', 'Mesa 39', 4, 65, 90, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('40', 'Mesa 40', 4, 75, 90, 'salao', 'retangular', 68, 46, '#7D1F2C', true);

-- Bloco fundo linha 3 (y=96, 4 mesas)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('41', 'Mesa 41', 4, 35, 96, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('42', 'Mesa 42', 4, 45, 96, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('43', 'Mesa 43', 4, 55, 96, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('44', 'Mesa 44', 4, 65, 96, 'salao', 'retangular', 68, 46, '#7D1F2C', true);

-- Oval fundo-direito
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('V5', 'VIP Fundo Direito', 8, 90, 95, 'salao', 'round', 65, 65, '#7D1F2C', true);
