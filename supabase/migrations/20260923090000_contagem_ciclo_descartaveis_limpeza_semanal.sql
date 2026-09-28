/*
  # Descartáveis e Produtos de Limpeza: contagem semanal no Central

  Esses itens são comprados toda semana, então a zona deles no Central
  precisa vencer a cada 7 dias, não a cada 30.
*/

UPDATE contagem_ciclos
SET ciclo_dias = 7, atualizado_em = now()
WHERE categoria IN ('Descartáveis', 'Produtos de Limpeza');
