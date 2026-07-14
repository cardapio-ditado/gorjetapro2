/*
  # Adicionar consumo_bar ao enum tipo_ocorrencia_enum

  Adiciona o valor 'consumo_bar' ao enum para suportar o novo tipo
  "Consumo no Bar" nas ocorrências financeiras.
*/

ALTER TYPE tipo_ocorrencia_enum ADD VALUE IF NOT EXISTS 'consumo_bar';
