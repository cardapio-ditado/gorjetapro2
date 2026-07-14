/*
  # Disable Authentication Requirements

  1. Security Changes
    - Disable RLS on all tables
    - Remove authentication-dependent policies
    - Make all data publicly accessible for development

  2. Schema Changes
    - Make all user-related fields optional (NULL)
    - Remove NOT NULL constraints from user fields

  3. Public Access
    - Allow anonymous access to all tables
    - Remove role-based restrictions
*/

-- Disable RLS on all tables
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE fluxo_caixa DISABLE ROW LEVEL SECURITY;
ALTER TABLE insumos DISABLE ROW LEVEL SECURITY;
ALTER TABLE fichas_tecnicas DISABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_ingredientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE producoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE requisicoes_estoque DISABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE extras DISABLE ROW LEVEL SECURITY;
ALTER TABLE escalas DISABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_funcionarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE musicos DISABLE ROW LEVEL SECURITY;
ALTER TABLE ocorrencias DISABLE ROW LEVEL SECURITY;
ALTER TABLE centros_custo DISABLE ROW LEVEL SECURITY;
ALTER TABLE fornecedores DISABLE ROW LEVEL SECURITY;
ALTER TABLE clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_financeiras DISABLE ROW LEVEL SECURITY;
ALTER TABLE formas_pagamento DISABLE ROW LEVEL SECURITY;
ALTER TABLE bancos_contas DISABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar DISABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_contas DISABLE ROW LEVEL SECURITY;
ALTER TABLE anexos_contas DISABLE ROW LEVEL SECURITY;

-- Drop all existing RLS policies
DROP POLICY IF EXISTS "Gerentes podem ver todos os usuários" ON usuarios;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios dados" ON usuarios;
DROP POLICY IF EXISTS "Gerentes e financeiro podem ver transações" ON fluxo_caixa;
DROP POLICY IF EXISTS "Managers and financial can manage transactions" ON fluxo_caixa;
DROP POLICY IF EXISTS "Users can insert transactions" ON fluxo_caixa;
DROP POLICY IF EXISTS "Users can view transactions they created" ON fluxo_caixa;
DROP POLICY IF EXISTS "Gerentes e estoquistas podem ver estoque" ON insumos;
DROP POLICY IF EXISTS "Gerentes e RH podem ver funcionários" ON funcionarios;
DROP POLICY IF EXISTS "Gerentes podem ver músicos" ON musicos;
DROP POLICY IF EXISTS "Gerentes e operadores podem ver ocorrências" ON ocorrencias;
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar centros de custo" ON centros_custo;
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar fornecedores" ON fornecedores;
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar clientes" ON clientes;
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar categorias" ON categorias_financeiras;
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar formas de pagamento" ON formas_pagamento;
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar bancos e contas" ON bancos_contas;
DROP POLICY IF EXISTS "Allow all operations for anonymous users" ON bancos_contas;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON bancos_contas;
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar contas a pagar" ON contas_pagar;
DROP POLICY IF EXISTS "Permitir inserção para todos os usuários autenticados" ON contas_pagar;
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar pagamentos" ON pagamentos_contas;
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar anexos" ON anexos_contas;

-- Make user-related fields optional (NULL) where they aren't already
-- fluxo_caixa
ALTER TABLE fluxo_caixa ALTER COLUMN criado_por DROP NOT NULL;

-- ocorrencias (if it has user fields)
-- ALTER TABLE ocorrencias ALTER COLUMN criado_por DROP NOT NULL; -- Uncomment if needed

-- Clean up any invalid UUID values in user fields
UPDATE fluxo_caixa 
SET criado_por = NULL 
WHERE criado_por IS NOT NULL 
AND (
  criado_por::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR LENGTH(criado_por::text) != 36
);

-- Grant public access to all tables for anonymous users
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- Grant public access for authenticated users as well (for future use)
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Update default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;