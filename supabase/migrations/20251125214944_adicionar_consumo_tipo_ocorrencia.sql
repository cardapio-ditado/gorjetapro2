/*
  # Adicionar tipo "consumo" ao enum de ocorrências
  
  1. Alterações
    - Adiciona o valor "consumo" ao enum `tipo_ocorrencia_enum`
    - Permite registrar ocorrências de consumo de funcionários
  
  2. Uso
    - Consumos importados via Excel serão registrados com tipo "consumo"
    - Garçons continuam usando a tabela descontos_consumo
*/

-- Adicionar 'consumo' ao enum tipo_ocorrencia_enum
ALTER TYPE tipo_ocorrencia_enum ADD VALUE IF NOT EXISTS 'consumo';
