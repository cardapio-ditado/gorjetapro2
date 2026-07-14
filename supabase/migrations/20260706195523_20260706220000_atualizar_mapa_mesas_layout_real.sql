-- Remove todas as mesas e reservas existentes e recria com o layout real do estabelecimento
DELETE FROM reservas_mesas;
DELETE FROM mesas;

-- ═══════════════════════════════════════════════════════
-- SALÃO PRINCIPAL
-- ═══════════════════════════════════════════════════════

-- Mesas VIP ovais nos cantos superiores (cap 8)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('V1', 'VIP Canto Esquerdo', 8,  6, 4, 'salao', 'round', 65, 65, '#7D1F2C', true),
  ('V2', 'VIP Canto Direito',  8, 91, 4, 'salao', 'round', 65, 65, '#7D1F2C', true);

-- Cluster 2×2 no canto superior esquerdo (cap 4 cada)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('01', 'Mesa 01', 4, 20,  7, 'salao', 'square', 52, 52, '#7D1F2C', true),
  ('02', 'Mesa 02', 4, 30,  7, 'salao', 'square', 52, 52, '#7D1F2C', true),
  ('03', 'Mesa 03', 4, 20, 13, 'salao', 'square', 52, 52, '#7D1F2C', true),
  ('04', 'Mesa 04', 4, 30, 13, 'salao', 'square', 52, 52, '#7D1F2C', true);

-- Mesas ovais laterais esquerda (cap 8, 6, 8)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('V3', 'VIP Lateral 1', 8, 14, 24, 'salao', 'round', 62, 62, '#7D1F2C', true),
  ('V4', 'VIP Lateral 2', 6, 14, 33, 'salao', 'round', 58, 58, '#7D1F2C', true),
  ('V5', 'VIP Lateral 3', 8, 14, 42, 'salao', 'round', 62, 62, '#7D1F2C', true);

-- Fileira A – 5 mesas retangulares (y=20)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('05', 'Mesa 05', 4, 35, 20, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('06', 'Mesa 06', 4, 48, 20, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('07', 'Mesa 07', 4, 61, 20, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('08', 'Mesa 08', 4, 74, 20, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('09', 'Mesa 09', 4, 87, 20, 'salao', 'retangular', 68, 46, '#7D1F2C', true);

-- Fileira B – 5 mesas retangulares (y=28)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('10', 'Mesa 10', 4, 35, 28, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('11', 'Mesa 11', 4, 48, 28, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('12', 'Mesa 12', 4, 61, 28, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('13', 'Mesa 13', 4, 74, 28, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('14', 'Mesa 14', 4, 87, 28, 'salao', 'retangular', 68, 46, '#7D1F2C', true);

-- Fileira C – 4 mesas retangulares (y=36)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('15', 'Mesa 15', 4, 35, 36, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('16', 'Mesa 16', 4, 48, 36, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('17', 'Mesa 17', 4, 61, 36, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('18', 'Mesa 18', 4, 74, 36, 'salao', 'retangular', 68, 46, '#7D1F2C', true);

-- Fileira D – 3 mesas retangulares (y=44)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('19', 'Mesa 19', 4, 35, 44, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('20', 'Mesa 20', 4, 48, 44, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('21', 'Mesa 21', 4, 61, 44, 'salao', 'retangular', 68, 46, '#7D1F2C', true);

-- Fileira E – 3 mesas retangulares (y=51)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('22', 'Mesa 22', 4, 35, 51, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('23', 'Mesa 23', 4, 48, 51, 'salao', 'retangular', 68, 46, '#7D1F2C', true),
  ('24', 'Mesa 24', 4, 61, 51, 'salao', 'retangular', 68, 46, '#7D1F2C', true);

-- ═══════════════════════════════════════════════════════
-- BAR DE DRINK
-- ═══════════════════════════════════════════════════════

-- Fileira F – 5 mesas (y=63)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('25', 'Mesa 25', 4, 30, 63, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('26', 'Mesa 26', 4, 44, 63, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('27', 'Mesa 27', 4, 57, 63, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('28', 'Mesa 28', 4, 70, 63, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('29', 'Mesa 29', 4, 83, 63, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true);

-- Fileira G – 5 mesas (y=71)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('30', 'Mesa 30', 4, 30, 71, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('31', 'Mesa 31', 4, 44, 71, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('32', 'Mesa 32', 4, 57, 71, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('33', 'Mesa 33', 4, 70, 71, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true),
  ('34', 'Mesa 34', 4, 83, 71, 'bar_drink', 'retangular', 68, 46, '#7D1F2C', true);

-- ═══════════════════════════════════════════════════════
-- BAR DE CHOPP
-- ═══════════════════════════════════════════════════════

-- 5 fileiras × 3 colunas (y=79,84,88,92,96)
INSERT INTO mesas (numero, nome, capacidade, posicao_x, posicao_y, secao, formato, largura, altura, cor, ativo) VALUES
  ('35', 'Mesa 35', 4, 42, 79, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('36', 'Mesa 36', 4, 57, 79, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('37', 'Mesa 37', 4, 72, 79, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('38', 'Mesa 38', 4, 42, 84, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('39', 'Mesa 39', 4, 57, 84, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('40', 'Mesa 40', 4, 72, 84, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('41', 'Mesa 41', 4, 42, 88, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('42', 'Mesa 42', 4, 57, 88, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('43', 'Mesa 43', 4, 72, 88, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('44', 'Mesa 44', 4, 42, 92, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('45', 'Mesa 45', 4, 57, 92, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('46', 'Mesa 46', 4, 72, 92, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('47', 'Mesa 47', 4, 42, 96, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('48', 'Mesa 48', 4, 57, 96, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true),
  ('49', 'Mesa 49', 4, 72, 96, 'bar_chopp', 'retangular', 68, 46, '#7D1F2C', true);
