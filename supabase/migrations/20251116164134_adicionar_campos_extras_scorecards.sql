/*
  # Adicionar Campos Extras aos Scorecards

  ## Descrição
  Adiciona campos de remuneração, benefícios e formato de trabalho aos scorecards
  para facilitar o preenchimento automático ao criar vagas.

  ## Alterações
  1. Adiciona colunas `remuneracao`, `beneficios_cargo` e `formato_trabalho` à tabela rh_cargos
  2. Atualiza os cargos existentes com essas informações
*/

-- Adicionar novas colunas
ALTER TABLE rh_cargos 
  ADD COLUMN IF NOT EXISTS remuneracao text,
  ADD COLUMN IF NOT EXISTS beneficios_cargo text,
  ADD COLUMN IF NOT EXISTS formato_trabalho text;

COMMENT ON COLUMN rh_cargos.remuneracao IS 'Faixa salarial ou remuneração do cargo';
COMMENT ON COLUMN rh_cargos.beneficios_cargo IS 'Benefícios oferecidos para o cargo';
COMMENT ON COLUMN rh_cargos.formato_trabalho IS 'Formato e horários de trabalho';

-- Atualizar cargos existentes com informações completas

UPDATE rh_cargos SET 
  remuneracao = 'R$ 2.550,00',
  beneficios_cargo = 'Salário compatível com o mercado • Oportunidades de treinamento e desenvolvimento profissional na área de gastronomia • Trabalho em ambiente dinâmico e acolhedor',
  formato_trabalho = 'Presencial, exigindo disponibilidade para trabalhar em turnos, incluindo noites, fins de semana e feriados. Horário: 16:00 às 00:20 h, com 1 hora de intervalo.'
WHERE nome = 'Auxiliar de Cozinha';

UPDATE rh_cargos SET 
  remuneracao = 'R$ 1.412,00 + gorjetas',
  beneficios_cargo = 'Gorjetas • Ambiente de trabalho dinâmico',
  formato_trabalho = 'Presencial, com horários flexíveis de acordo com a programação do bar e eventos especiais. Possibilidade de trabalho em turnos, incluindo fins de semana e feriados. Horário: 17:00 às 01:20 h, com 01 hora de intervalo'
WHERE nome = 'Garçom';

UPDATE rh_cargos SET 
  remuneracao = 'A definir',
  beneficios_cargo = 'Salário compatível com o mercado • Oportunidade de fazer parte de uma equipe dinâmica e em um ambiente de trabalho respeitável • Treinamento em higiene e segurança alimentar',
  formato_trabalho = 'Presencial, exigindo flexibilidade para cobrir diferentes turnos conforme a necessidade operacional do bar.'
WHERE nome = 'Auxiliar de Limpeza na Cozinha';

UPDATE rh_cargos SET 
  remuneracao = 'R$ 3.200,00',
  beneficios_cargo = 'Salário competitivo no mercado • Oportunidade de crescimento profissional e desenvolvimento de habilidades culinárias • Ambiente de trabalho dinâmico e de apoio',
  formato_trabalho = 'Presencial, exigindo flexibilidade para trabalhar em turnos, incluindo noites, fins de semana e feriados. Horário: 16:00 às 00:20 h, com 1 hora de intervalo.'
WHERE nome = 'Cozinheiro';

UPDATE rh_cargos SET 
  remuneracao = 'R$ 2.450,00',
  beneficios_cargo = 'Salário competitivo no mercado • Oportunidades de treinamento em mixologia e tendências de bebidas • Ambiente de trabalho vibrante e dinâmico',
  formato_trabalho = 'Presencial, com necessidade de flexibilidade para trabalhar em turnos variados, incluindo noites, fins de semana e feriados. Horário: 17:00 às 01:20 h.'
WHERE nome = 'Barman';

UPDATE rh_cargos SET 
  remuneracao = 'A definir',
  beneficios_cargo = 'Salário competitivo no mercado • Ambiente de trabalho acolhedor e dinâmico • Oportunidades de treinamento em saúde e segurança no trabalho',
  formato_trabalho = 'Presencial, com horários flexíveis dependendo das necessidades do bar, incluindo possibilidade de trabalho em turnos e fins de semana.'
WHERE nome = 'Auxiliar de Limpeza';

UPDATE rh_cargos SET 
  remuneracao = 'R$ 1.800,00 + gorjetas',
  beneficios_cargo = 'Salário compatível com o mercado • Participação em gorjetas • Oportunidade de crescimento e desenvolvimento dentro da equipe',
  formato_trabalho = 'Presencial, necessitando disponibilidade para trabalhar em turnos, incluindo noites, fins de semana e feriados. Horário: 17:00 às 01:20 h, com 01 hora de intervalo.'
WHERE nome = 'Cumim';

UPDATE rh_cargos SET 
  remuneracao = 'R$ 2.170,00',
  beneficios_cargo = 'Salário compatível com o mercado • Oportunidade de aprendizado e crescimento na área de bares e bebidas • Ambiente de trabalho dinâmico e acolhedor',
  formato_trabalho = 'Presencial, exigindo disponibilidade para trabalhar em turnos, incluindo noites, fins de semana e feriados. Horários: 18:00 às 02:20 h, 16:00 às 00:20 h, ambos com intervalo de 1 hora.'
WHERE nome = 'Auxiliar de Bar';

UPDATE rh_cargos SET 
  remuneracao = 'R$ 2.160,00 (incluso quebra de caixa)',
  beneficios_cargo = 'Salário competitivo no mercado • Oportunidades de desenvolvimento profissional e treinamento em atendimento ao cliente e operações financeiras',
  formato_trabalho = 'Presencial, exigindo flexibilidade para trabalhar em turnos variados, incluindo fins de semana e feriados. Entrada: 17:00 - intervalo de 1 hora - saída 01:20h. Nas sextas e sábados duas atendentes entram às 18:00 e saem às 02:20 h.'
WHERE nome = 'Atendente';

UPDATE rh_cargos SET 
  remuneracao = 'A definir',
  beneficios_cargo = 'Salário compatível com o mercado • Possibilidade de bonificações baseadas em desempenho e precisão • Oportunidades de treinamento em atendimento ao cliente e gestão financeira',
  formato_trabalho = 'Presencial, com necessidade de flexibilidade para cobrir diferentes turnos, incluindo noites, fins de semana e feriados.'
WHERE nome = 'Caixa de PDV';
