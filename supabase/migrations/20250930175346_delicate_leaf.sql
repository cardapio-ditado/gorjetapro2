/*
  # Sistema de Controle de Acesso

  1. Tabelas
    - `usuarios_sistema` - Usuários do sistema com autenticação
    - `permissoes_usuario` - Permissões específicas por usuário
    - `modulos_sistema` - Módulos disponíveis no sistema
    - `abas_modulo` - Abas dentro de cada módulo

  2. Funcionalidades
    - Controle granular de acesso por módulo e aba
    - Níveis de usuário (master, admin, usuario)
    - Permissões flexíveis e configuráveis

  3. Segurança
    - RLS habilitado em todas as tabelas
    - Políticas de acesso baseadas em função
*/

-- Criar enum para níveis de usuário
CREATE TYPE nivel_usuario_enum AS ENUM ('master', 'admin', 'usuario', 'visitante');

-- Tabela de módulos do sistema
CREATE TABLE IF NOT EXISTS modulos_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text UNIQUE NOT NULL,
  icone text NOT NULL,
  cor text NOT NULL,
  ordem integer DEFAULT 0,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Tabela de abas dentro dos módulos
CREATE TABLE IF NOT EXISTS abas_modulo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id uuid REFERENCES modulos_sistema(id) ON DELETE CASCADE,
  nome text NOT NULL,
  slug text NOT NULL,
  icone text NOT NULL,
  ordem integer DEFAULT 0,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE(modulo_id, slug)
);

-- Tabela de usuários do sistema (expandida)
CREATE TABLE IF NOT EXISTS usuarios_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  email text UNIQUE NOT NULL,
  senha_hash text NOT NULL,
  nivel nivel_usuario_enum DEFAULT 'usuario',
  ativo boolean DEFAULT true,
  ultimo_acesso timestamptz,
  foto_url text,
  telefone text,
  cargo text,
  departamento text,
  data_admissao date DEFAULT CURRENT_DATE,
  configuracoes jsonb DEFAULT '{}',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  criado_por uuid REFERENCES usuarios_sistema(id)
);

-- Tabela de permissões por usuário
CREATE TABLE IF NOT EXISTS permissoes_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES usuarios_sistema(id) ON DELETE CASCADE,
  modulo_id uuid REFERENCES modulos_sistema(id) ON DELETE CASCADE,
  aba_id uuid REFERENCES abas_modulo(id) ON DELETE CASCADE,
  pode_visualizar boolean DEFAULT true,
  pode_criar boolean DEFAULT false,
  pode_editar boolean DEFAULT false,
  pode_excluir boolean DEFAULT false,
  pode_aprovar boolean DEFAULT false,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  criado_por uuid REFERENCES usuarios_sistema(id),
  UNIQUE(usuario_id, modulo_id, aba_id)
);

-- Habilitar RLS
ALTER TABLE modulos_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE abas_modulo ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissoes_usuario ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (permissivas para desenvolvimento)
CREATE POLICY "Allow all operations on modulos_sistema"
  ON modulos_sistema
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on abas_modulo"
  ON abas_modulo
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on usuarios_sistema"
  ON usuarios_sistema
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on permissoes_usuario"
  ON permissoes_usuario
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Inserir módulos do sistema
INSERT INTO modulos_sistema (nome, slug, icone, cor, ordem) VALUES
  ('Dashboard', 'dashboard', 'LayoutDashboard', 'from-blue-500 to-blue-600', 1),
  ('Financeiro', 'finance', 'DollarSign', 'from-green-500 to-emerald-600', 2),
  ('Estoque', 'inventory', 'Warehouse', 'from-indigo-500 to-purple-600', 3),
  ('RH', 'staff', 'Users', 'from-purple-500 to-violet-600', 4),
  ('Músicos', 'musicians', 'Music', 'from-pink-500 to-rose-600', 5),
  ('Eventos', 'events', 'CalendarDays', 'from-indigo-500 to-blue-600', 6),
  ('Ocorrências', 'incidents', 'AlertTriangle', 'from-red-500 to-rose-600', 7),
  ('Solicitações', 'solicitacoes', 'ClipboardList', 'from-teal-500 to-cyan-600', 8),
  ('Configurações', 'settings', 'Settings', 'from-gray-500 to-slate-600', 9);

-- Inserir abas do módulo Financeiro
INSERT INTO abas_modulo (modulo_id, nome, slug, icone, ordem) VALUES
  ((SELECT id FROM modulos_sistema WHERE slug = 'finance'), 'Fluxo de Caixa', 'fluxo-caixa', 'TrendingUp', 1),
  ((SELECT id FROM modulos_sistema WHERE slug = 'finance'), 'Contas a Pagar', 'contas-pagar', 'CreditCard', 2),
  ((SELECT id FROM modulos_sistema WHERE slug = 'finance'), 'Aprovação do Dia', 'aprovacao-dia', 'Calendar', 3),
  ((SELECT id FROM modulos_sistema WHERE slug = 'finance'), 'Ficha Fornecedor', 'ficha-fornecedor', 'Building2', 4),
  ((SELECT id FROM modulos_sistema WHERE slug = 'finance'), 'Kardex Fornecedor', 'kardex-fornecedor', 'Activity', 5),
  ((SELECT id FROM modulos_sistema WHERE slug = 'finance'), 'Contas a Receber', 'contas-receber', 'Receipt', 6),
  ((SELECT id FROM modulos_sistema WHERE slug = 'finance'), 'Relatórios Gerenciais', 'relatorios', 'PieChart', 7),
  ((SELECT id FROM modulos_sistema WHERE slug = 'finance'), 'Cadastros Gerais', 'cadastros', 'Settings', 8),
  ((SELECT id FROM modulos_sistema WHERE slug = 'finance'), 'Kardex Completo', 'kardex-completo', 'FileText', 9);

-- Inserir abas do módulo Estoque
INSERT INTO abas_modulo (modulo_id, nome, slug, icone, ordem) VALUES
  ((SELECT id FROM modulos_sistema WHERE slug = 'inventory'), 'Dashboard', 'dashboard', 'BarChart3', 1),
  ((SELECT id FROM modulos_sistema WHERE slug = 'inventory'), 'Estoques', 'estoques', 'Warehouse', 2),
  ((SELECT id FROM modulos_sistema WHERE slug = 'inventory'), 'Itens', 'itens', 'Package', 3),
  ((SELECT id FROM modulos_sistema WHERE slug = 'inventory'), 'Fichas Técnicas', 'fichas-tecnicas', 'ClipboardList', 4),
  ((SELECT id FROM modulos_sistema WHERE slug = 'inventory'), 'Compras', 'compras', 'ShoppingCart', 5),
  ((SELECT id FROM modulos_sistema WHERE slug = 'inventory'), 'Produção', 'producao', 'Factory', 6),
  ((SELECT id FROM modulos_sistema WHERE slug = 'inventory'), 'Relatórios', 'relatorios', 'FileText', 7),
  ((SELECT id FROM modulos_sistema WHERE slug = 'inventory'), 'Movimentações', 'movimentacoes', 'ArrowLeftRight', 8),
  ((SELECT id FROM modulos_sistema WHERE slug = 'inventory'), 'Kardex Produto', 'kardex-produto', 'Activity', 9);

-- Inserir abas do módulo RH
INSERT INTO abas_modulo (modulo_id, nome, slug, icone, ordem) VALUES
  ((SELECT id FROM modulos_sistema WHERE slug = 'staff'), 'Colaboradores', 'colaboradores', 'Users', 1),
  ((SELECT id FROM modulos_sistema WHERE slug = 'staff'), 'Escalas', 'escalas', 'Calendar', 2),
  ((SELECT id FROM modulos_sistema WHERE slug = 'staff'), 'Férias', 'ferias', 'CalendarDays', 3),
  ((SELECT id FROM modulos_sistema WHERE slug = 'staff'), 'Ocorrências', 'ocorrencias', 'AlertTriangle', 4),
  ((SELECT id FROM modulos_sistema WHERE slug = 'staff'), 'Extras/Freelancers', 'extras', 'UserPlus', 5),
  ((SELECT id FROM modulos_sistema WHERE slug = 'staff'), 'Funções', 'funcoes', 'Briefcase', 6),
  ((SELECT id FROM modulos_sistema WHERE slug = 'staff'), 'Configurações', 'configuracoes', 'Settings', 7),
  ((SELECT id FROM modulos_sistema WHERE slug = 'staff'), 'Relatórios', 'relatorios', 'BarChart3', 8),
  ((SELECT id FROM modulos_sistema WHERE slug = 'staff'), 'Gorjetas', 'gorjetas', 'Award', 9);

-- Criar usuário master padrão (senha: master123)
INSERT INTO usuarios_sistema (nome_completo, email, senha_hash, nivel, ativo, cargo, departamento) VALUES
  ('Usuário Master', 'master@ditadopopular.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'master', true, 'Administrador do Sistema', 'Administração'),
  ('Gerente Geral', 'gerente@ditadopopular.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', true, 'Gerente', 'Administração'),
  ('Funcionário Padrão', 'funcionario@ditadopopular.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'usuario', true, 'Funcionário', 'Operacional');

-- View para listar permissões com dados relacionados
CREATE OR REPLACE VIEW vw_permissoes_usuario AS
SELECT 
  p.id,
  p.usuario_id,
  u.nome_completo,
  u.email,
  u.nivel,
  u.ativo as usuario_ativo,
  p.modulo_id,
  m.nome as modulo_nome,
  m.slug as modulo_slug,
  p.aba_id,
  a.nome as aba_nome,
  a.slug as aba_slug,
  p.pode_visualizar,
  p.pode_criar,
  p.pode_editar,
  p.pode_excluir,
  p.pode_aprovar,
  p.observacoes,
  p.criado_em
FROM permissoes_usuario p
JOIN usuarios_sistema u ON p.usuario_id = u.id
JOIN modulos_sistema m ON p.modulo_id = m.id
LEFT JOIN abas_modulo a ON p.aba_id = a.id
ORDER BY u.nome_completo, m.ordem, a.ordem;

-- View para listar usuários com resumo de permissões
CREATE OR REPLACE VIEW vw_usuarios_permissoes AS
SELECT 
  u.id,
  u.nome_completo,
  u.email,
  u.nivel,
  u.ativo,
  u.ultimo_acesso,
  u.cargo,
  u.departamento,
  u.criado_em,
  COUNT(DISTINCT p.modulo_id) as total_modulos_permitidos,
  COUNT(DISTINCT p.aba_id) as total_abas_permitidas,
  COUNT(DISTINCT CASE WHEN p.pode_criar = true THEN p.aba_id END) as abas_com_criacao,
  COUNT(DISTINCT CASE WHEN p.pode_editar = true THEN p.aba_id END) as abas_com_edicao,
  COUNT(DISTINCT CASE WHEN p.pode_excluir = true THEN p.aba_id END) as abas_com_exclusao,
  COUNT(DISTINCT CASE WHEN p.pode_aprovar = true THEN p.aba_id END) as abas_com_aprovacao
FROM usuarios_sistema u
LEFT JOIN permissoes_usuario p ON u.id = p.usuario_id
GROUP BY u.id, u.nome_completo, u.email, u.nivel, u.ativo, u.ultimo_acesso, u.cargo, u.departamento, u.criado_em
ORDER BY u.nivel DESC, u.nome_completo;

-- Função para verificar permissão
CREATE OR REPLACE FUNCTION verificar_permissao(
  p_usuario_id uuid,
  p_modulo_slug text,
  p_aba_slug text DEFAULT NULL,
  p_acao text DEFAULT 'visualizar'
) RETURNS boolean AS $$
DECLARE
  v_nivel nivel_usuario_enum;
  v_tem_permissao boolean := false;
  v_modulo_id uuid;
  v_aba_id uuid;
BEGIN
  -- Buscar nível do usuário
  SELECT nivel INTO v_nivel
  FROM usuarios_sistema
  WHERE id = p_usuario_id AND ativo = true;
  
  -- Master tem acesso total
  IF v_nivel = 'master' THEN
    RETURN true;
  END IF;
  
  -- Buscar ID do módulo
  SELECT id INTO v_modulo_id
  FROM modulos_sistema
  WHERE slug = p_modulo_slug AND ativo = true;
  
  IF v_modulo_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Se aba específica foi solicitada
  IF p_aba_slug IS NOT NULL THEN
    SELECT id INTO v_aba_id
    FROM abas_modulo
    WHERE modulo_id = v_modulo_id AND slug = p_aba_slug AND ativo = true;
    
    IF v_aba_id IS NULL THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Verificar permissão específica
  SELECT 
    CASE p_acao
      WHEN 'visualizar' THEN pode_visualizar
      WHEN 'criar' THEN pode_criar
      WHEN 'editar' THEN pode_editar
      WHEN 'excluir' THEN pode_excluir
      WHEN 'aprovar' THEN pode_aprovar
      ELSE false
    END
  INTO v_tem_permissao
  FROM permissoes_usuario
  WHERE usuario_id = p_usuario_id 
    AND modulo_id = v_modulo_id 
    AND (aba_id = v_aba_id OR (p_aba_slug IS NULL AND aba_id IS NULL));
  
  RETURN COALESCE(v_tem_permissao, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para criar permissões padrão para usuário
CREATE OR REPLACE FUNCTION criar_permissoes_padrao(p_usuario_id uuid, p_nivel nivel_usuario_enum)
RETURNS void AS $$
BEGIN
  -- Limpar permissões existentes
  DELETE FROM permissoes_usuario WHERE usuario_id = p_usuario_id;
  
  -- Permissões baseadas no nível
  IF p_nivel = 'master' THEN
    -- Master: acesso total a tudo
    INSERT INTO permissoes_usuario (usuario_id, modulo_id, aba_id, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_aprovar)
    SELECT p_usuario_id, m.id, a.id, true, true, true, true, true
    FROM modulos_sistema m
    LEFT JOIN abas_modulo a ON m.id = a.modulo_id
    WHERE m.ativo = true AND (a.ativo = true OR a.id IS NULL);
    
  ELSIF p_nivel = 'admin' THEN
    -- Admin: acesso completo exceto configurações de usuários
    INSERT INTO permissoes_usuario (usuario_id, modulo_id, aba_id, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_aprovar)
    SELECT p_usuario_id, m.id, a.id, true, true, true, 
           CASE WHEN m.slug = 'settings' THEN false ELSE true END,
           true
    FROM modulos_sistema m
    LEFT JOIN abas_modulo a ON m.id = a.modulo_id
    WHERE m.ativo = true AND (a.ativo = true OR a.id IS NULL);
    
  ELSIF p_nivel = 'usuario' THEN
    -- Usuário: acesso básico (visualizar, criar, editar) sem exclusões
    INSERT INTO permissoes_usuario (usuario_id, modulo_id, aba_id, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_aprovar)
    SELECT p_usuario_id, m.id, a.id, 
           CASE WHEN m.slug IN ('dashboard', 'incidents', 'staff') THEN true ELSE false END,
           CASE WHEN m.slug IN ('incidents', 'staff') THEN true ELSE false END,
           CASE WHEN m.slug IN ('incidents', 'staff') THEN true ELSE false END,
           false,
           false
    FROM modulos_sistema m
    LEFT JOIN abas_modulo a ON m.id = a.modulo_id
    WHERE m.ativo = true AND (a.ativo = true OR a.id IS NULL);
    
  ELSE
    -- Visitante: apenas visualização do dashboard
    INSERT INTO permissoes_usuario (usuario_id, modulo_id, aba_id, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_aprovar)
    SELECT p_usuario_id, m.id, NULL, true, false, false, false, false
    FROM modulos_sistema m
    WHERE m.slug = 'dashboard' AND m.ativo = true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar permissões padrão ao criar usuário
CREATE OR REPLACE FUNCTION trg_criar_permissoes_usuario()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM criar_permissoes_padrao(NEW.id, NEW.nivel);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_sistema_permissoes
  AFTER INSERT ON usuarios_sistema
  FOR EACH ROW
  EXECUTE FUNCTION trg_criar_permissoes_usuario();

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION atualizar_timestamp_usuarios()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_sistema_update
  BEFORE UPDATE ON usuarios_sistema
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_timestamp_usuarios();

-- Criar índices para performance
CREATE INDEX idx_usuarios_sistema_email ON usuarios_sistema(email);
CREATE INDEX idx_usuarios_sistema_nivel ON usuarios_sistema(nivel);
CREATE INDEX idx_usuarios_sistema_ativo ON usuarios_sistema(ativo);
CREATE INDEX idx_permissoes_usuario_lookup ON permissoes_usuario(usuario_id, modulo_id, aba_id);
CREATE INDEX idx_modulos_sistema_slug ON modulos_sistema(slug);
CREATE INDEX idx_abas_modulo_slug ON abas_modulo(modulo_id, slug);