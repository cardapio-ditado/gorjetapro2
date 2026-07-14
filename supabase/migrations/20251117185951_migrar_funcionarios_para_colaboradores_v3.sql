/*
  # Migrar dados de funcionários para colaboradores

  1. Adicionar constraints necessárias
  2. Sincronizar cargos para funcoes_rh
  3. Migrar funcionários para colaboradores
*/

-- Adicionar constraint unique no nome de funcoes_rh
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'funcoes_rh_nome_key'
  ) THEN
    ALTER TABLE funcoes_rh ADD CONSTRAINT funcoes_rh_nome_key UNIQUE (nome);
  END IF;
END $$;

-- Adicionar constraint unique no CPF de colaboradores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'colaboradores_cpf_key'
  ) THEN
    ALTER TABLE colaboradores ADD CONSTRAINT colaboradores_cpf_key UNIQUE (cpf);
  END IF;
END $$;

-- Sincronizar cargos para funcoes_rh
INSERT INTO funcoes_rh (nome, salario_base, percentual_comissao, descricao, status)
SELECT 
  nome,
  salario_base,
  0, -- percentual_comissao padrão
  descricao,
  status
FROM cargos
ON CONFLICT (nome) DO UPDATE SET
  salario_base = EXCLUDED.salario_base,
  descricao = EXCLUDED.descricao,
  status = EXCLUDED.status;

-- Limpar colaboradores existentes para evitar conflitos
TRUNCATE TABLE colaboradores CASCADE;

-- Migrar dados de funcionarios para colaboradores
INSERT INTO colaboradores (
  nome_completo,
  cpf,
  data_admissao,
  funcao_id,
  funcao_personalizada,
  tipo_vinculo,
  status,
  salario_fixo,
  valor_diaria,
  percentual_comissao,
  observacoes
)
SELECT 
  f.nome,
  f.cpf,
  f.admissao,
  fr.id, -- funcao_id
  f.funcao, -- funcao_personalizada (texto original)
  'clt', -- tipo_vinculo padrão
  CASE 
    WHEN f.status = 'ativo' THEN 'ativo'
    WHEN f.status = 'inativo' THEN 'inativo'
    ELSE 'inativo'
  END,
  COALESCE(f.salario, 0),
  0, -- valor_diaria
  0, -- percentual_comissao
  f.observacoes
FROM funcionarios f
LEFT JOIN funcoes_rh fr ON fr.nome = f.funcao
WHERE f.cpf IS NOT NULL
ORDER BY f.nome;

-- Verificar resultado
SELECT COUNT(*) as total_migrado FROM colaboradores;
