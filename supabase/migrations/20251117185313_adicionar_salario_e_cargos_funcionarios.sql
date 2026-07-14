/*
  # Adicionar campo salário e ajustar cargos

  1. Alterações na tabela funcionarios
    - Adicionar campo salario
    - Adicionar campo cargo_id (referência para tabela de cargos)
    
  2. Nova tabela cargos
    - id, nome, descricao, salario_base, nivel
    
  3. Popular cargos existentes na empresa
*/

-- Criar tabela de cargos se não existir
CREATE TABLE IF NOT EXISTS cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  salario_base numeric(10,2),
  nivel text CHECK (nivel IN ('I', 'II', 'III', 'IV', 'V')),
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamp with time zone DEFAULT now()
);

-- Adicionar campo salario na tabela funcionarios
ALTER TABLE funcionarios 
  ADD COLUMN IF NOT EXISTS salario numeric(10,2) DEFAULT 0;

-- Adicionar campo cargo_id na tabela funcionarios
ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES cargos(id);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_funcionarios_cargo_id ON funcionarios(cargo_id);
CREATE INDEX IF NOT EXISTS idx_cargos_nome ON cargos(nome);

-- Habilitar RLS na tabela cargos
ALTER TABLE cargos ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS para cargos
DROP POLICY IF EXISTS "Allow all operations on cargos" ON cargos;
CREATE POLICY "Allow all operations on cargos" 
  ON cargos FOR ALL 
  TO anon, authenticated 
  USING (true) 
  WITH CHECK (true);

-- Popular tabela de cargos com os cargos da empresa
INSERT INTO cargos (nome, salario_base, nivel, descricao) VALUES
  ('GARCON - Nivel I', 1570.00, 'I', 'Garçom nível iniciante'),
  ('GARCOM', 1570.00, NULL, 'Garçom'),
  ('CUMIM', 1570.00, NULL, 'Cumim'),
  ('AUXILIAR DE PRODUCAO', 2249.47, NULL, 'Auxiliar de produção'),
  ('AUXILIAR DE BAR', 1570.00, NULL, 'Auxiliar de bar'),
  ('COZINHEIRO', 2212.91, NULL, 'Cozinheiro'),
  ('SUBGERENTE OPERACIONAL', 3525.94, NULL, 'Subgerente operacional'),
  ('Vigia', 1570.00, NULL, 'Vigia'),
  ('GERENTE OPERACIONAL', 4286.99, NULL, 'Gerente operacional'),
  ('AUX. DE ESTOQUE', 1570.00, NULL, 'Auxiliar de estoque'),
  ('GERENTE RH', 6965.15, NULL, 'Gerente de recursos humanos'),
  ('SERVICOS GERAIS', 1570.00, NULL, 'Serviços gerais'),
  ('Nutricionista', 4804.80, NULL, 'Nutricionista'),
  ('BARMAN', 1570.00, NULL, 'Barman'),
  ('ENCARREGADO DE BAR', 1570.00, NULL, 'Encarregado de bar'),
  ('CHEFE DE COZINHA', 2096.13, NULL, 'Chefe de cozinha'),
  ('AUX. DE COZINHA', 1570.00, NULL, 'Auxiliar de cozinha'),
  ('ATENDENTE', 1570.00, NULL, 'Atendente'),
  ('COODENADORA DE SERVICO GERAIS', 1771.23, NULL, 'Coordenadora de serviços gerais'),
  ('TECNICO DE SOM', 2100.00, NULL, 'Técnico de som'),
  ('Administrador', 1518.00, NULL, 'Administrador')
ON CONFLICT (nome) DO NOTHING;
