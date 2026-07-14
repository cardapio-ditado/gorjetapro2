/*
  # Corrigir permissões para usuário gerente

  1. Criar usuário gerente se não existir
  2. Configurar módulos e abas do sistema
  3. Atribuir permissões adequadas para o gerente
  4. Corrigir view de permissões
*/

-- Primeiro, garantir que os módulos existem
INSERT INTO modulos_sistema (nome, slug, icone, cor, ordem, ativo) VALUES
  ('Dashboard', 'dashboard', 'LayoutDashboard', 'from-blue-500 to-blue-600', 1, true),
  ('Financeiro', 'financeiro', 'DollarSign', 'from-green-500 to-emerald-600', 2, true),
  ('Estoque', 'estoque', 'Package', 'from-indigo-500 to-purple-600', 3, true),
  ('RH', 'rh', 'Users', 'from-purple-500 to-violet-600', 4, true),
  ('Músicos', 'musicos', 'Music', 'from-pink-500 to-rose-600', 5, true),
  ('Eventos', 'eventos', 'CalendarDays', 'from-indigo-500 to-blue-600', 6, true),
  ('Solicitações', 'solicitacoes', 'ClipboardList', 'from-teal-500 to-cyan-600', 7, true),
  ('Configurações', 'configuracoes', 'Settings', 'from-gray-500 to-slate-600', 8, true)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  icone = EXCLUDED.icone,
  cor = EXCLUDED.cor,
  ordem = EXCLUDED.ordem,
  ativo = EXCLUDED.ativo;

-- Criar abas para cada módulo
DO $$
DECLARE
  modulo_financeiro_id uuid;
  modulo_estoque_id uuid;
  modulo_rh_id uuid;
  modulo_config_id uuid;
BEGIN
  -- Obter IDs dos módulos
  SELECT id INTO modulo_financeiro_id FROM modulos_sistema WHERE slug = 'financeiro';
  SELECT id INTO modulo_estoque_id FROM modulos_sistema WHERE slug = 'estoque';
  SELECT id INTO modulo_rh_id FROM modulos_sistema WHERE slug = 'rh';
  SELECT id INTO modulo_config_id FROM modulos_sistema WHERE slug = 'configuracoes';

  -- Abas do Financeiro
  INSERT INTO abas_modulo (modulo_id, nome, slug, icone, ordem, ativo) VALUES
    (modulo_financeiro_id, 'Fluxo de Caixa', '0', 'TrendingUp', 1, true),
    (modulo_financeiro_id, 'Contas a Pagar', '1', 'CreditCard', 2, true),
    (modulo_financeiro_id, 'Aprovação do Dia', '2', 'Calendar', 3, true),
    (modulo_financeiro_id, 'Ficha Fornecedor', '3', 'Building2', 4, true),
    (modulo_financeiro_id, 'Kardex Fornecedor', '4', 'Activity', 5, true),
    (modulo_financeiro_id, 'Contas a Receber', '5', 'Receipt', 6, true),
    (modulo_financeiro_id, 'Relatórios Gerenciais', '6', 'PieChart', 7, true),
    (modulo_financeiro_id, 'Cadastros Gerais', '7', 'Settings', 8, true)
  ON CONFLICT (modulo_id, slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    icone = EXCLUDED.icone,
    ordem = EXCLUDED.ordem,
    ativo = EXCLUDED.ativo;

  -- Abas do Estoque
  INSERT INTO abas_modulo (modulo_id, nome, slug, icone, ordem, ativo) VALUES
    (modulo_estoque_id, 'Dashboard', '0', 'BarChart3', 1, true),
    (modulo_estoque_id, 'Estoques', '1', 'Warehouse', 2, true),
    (modulo_estoque_id, 'Itens', '2', 'Package', 3, true),
    (modulo_estoque_id, 'Fichas Técnicas', '3', 'ClipboardList', 4, true),
    (modulo_estoque_id, 'Compras', '4', 'ShoppingCart', 5, true),
    (modulo_estoque_id, 'Produção', '5', 'Factory', 6, true),
    (modulo_estoque_id, 'Relatórios', '6', 'FileText', 7, true),
    (modulo_estoque_id, 'Movimentações', '7', 'ArrowLeftRight', 8, true)
  ON CONFLICT (modulo_id, slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    icone = EXCLUDED.icone,
    ordem = EXCLUDED.ordem,
    ativo = EXCLUDED.ativo;

  -- Abas do RH
  INSERT INTO abas_modulo (modulo_id, nome, slug, icone, ordem, ativo) VALUES
    (modulo_rh_id, 'Colaboradores', '0', 'Users', 1, true),
    (modulo_rh_id, 'Escalas', '1', 'Calendar', 2, true),
    (modulo_rh_id, 'Férias', '2', 'CalendarDays', 3, true),
    (modulo_rh_id, 'Ocorrências', '3', 'AlertTriangle', 4, true),
    (modulo_rh_id, 'Extras/Freelancers', '4', 'UserPlus', 5, true),
    (modulo_rh_id, 'Funções', '5', 'Briefcase', 6, true),
    (modulo_rh_id, 'Configurações', '6', 'Settings', 7, true),
    (modulo_rh_id, 'Relatórios', '7', 'BarChart3', 8, true),
    (modulo_rh_id, 'Gorjetas', '8', 'Award', 9, true)
  ON CONFLICT (modulo_id, slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    icone = EXCLUDED.icone,
    ordem = EXCLUDED.ordem,
    ativo = EXCLUDED.ativo;

  -- Abas das Configurações
  INSERT INTO abas_modulo (modulo_id, nome, slug, icone, ordem, ativo) VALUES
    (modulo_config_id, 'Perfil', 'profile', 'User', 1, true),
    (modulo_config_id, 'Segurança', 'security', 'Lock', 2, true),
    (modulo_config_id, 'Notificações', 'notifications', 'Bell', 3, true),
    (modulo_config_id, 'Usuários', 'users', 'UserCog', 4, true),
    (modulo_config_id, 'Pagamentos', 'payment', 'CreditCard', 5, true),
    (modulo_config_id, 'Geral', 'global', 'Globe', 6, true)
  ON CONFLICT (modulo_id, slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    icone = EXCLUDED.icone,
    ordem = EXCLUDED.ordem,
    ativo = EXCLUDED.ativo;
END $$;

-- Criar usuário gerente se não existir
INSERT INTO usuarios_sistema (
  nome_completo,
  email,
  senha_hash,
  nivel,
  ativo,
  telefone,
  cargo,
  departamento,
  data_admissao
) VALUES (
  'Gerente Sistema',
  'gerente@ditadopopular.com',
  'hashed_gerente123',
  'admin',
  true,
  '(11) 99999-9999',
  'Gerente',
  'Administração',
  CURRENT_DATE
) ON CONFLICT (email) DO UPDATE SET
  nome_completo = EXCLUDED.nome_completo,
  nivel = EXCLUDED.nivel,
  ativo = EXCLUDED.ativo,
  telefone = EXCLUDED.telefone,
  cargo = EXCLUDED.cargo,
  departamento = EXCLUDED.departamento;

-- Criar permissões para o usuário gerente
DO $$
DECLARE
  gerente_id uuid;
  modulo_rec record;
  aba_rec record;
BEGIN
  -- Obter ID do usuário gerente
  SELECT id INTO gerente_id FROM usuarios_sistema WHERE email = 'gerente@ditadopopular.com';
  
  IF gerente_id IS NOT NULL THEN
    -- Remover permissões existentes do gerente
    DELETE FROM permissoes_usuario WHERE usuario_id = gerente_id;
    
    -- Para cada módulo ativo
    FOR modulo_rec IN 
      SELECT id, slug FROM modulos_sistema WHERE ativo = true
    LOOP
      -- Dar permissão de visualização ao módulo
      INSERT INTO permissoes_usuario (
        usuario_id,
        modulo_id,
        aba_id,
        pode_visualizar,
        pode_criar,
        pode_editar,
        pode_excluir,
        pode_aprovar
      ) VALUES (
        gerente_id,
        modulo_rec.id,
        NULL, -- Permissão para o módulo em si
        true,
        CASE 
          WHEN modulo_rec.slug IN ('dashboard', 'financeiro', 'estoque', 'rh', 'musicos', 'eventos', 'solicitacoes') THEN true
          ELSE false
        END,
        CASE 
          WHEN modulo_rec.slug IN ('financeiro', 'estoque', 'rh', 'musicos', 'eventos', 'solicitacoes') THEN true
          ELSE false
        END,
        CASE 
          WHEN modulo_rec.slug IN ('financeiro', 'estoque', 'rh', 'musicos', 'eventos', 'solicitacoes') THEN true
          ELSE false
        END,
        CASE 
          WHEN modulo_rec.slug IN ('financeiro', 'rh', 'solicitacoes') THEN true
          ELSE false
        END
      );
      
      -- Para cada aba do módulo
      FOR aba_rec IN 
        SELECT id, slug FROM abas_modulo WHERE modulo_id = modulo_rec.id AND ativo = true
      LOOP
        INSERT INTO permissoes_usuario (
          usuario_id,
          modulo_id,
          aba_id,
          pode_visualizar,
          pode_criar,
          pode_editar,
          pode_excluir,
          pode_aprovar
        ) VALUES (
          gerente_id,
          modulo_rec.id,
          aba_rec.id,
          true, -- Gerente pode visualizar todas as abas dos módulos permitidos
          CASE 
            WHEN modulo_rec.slug IN ('financeiro', 'estoque', 'rh', 'musicos', 'eventos', 'solicitacoes') THEN true
            WHEN modulo_rec.slug = 'configuracoes' AND aba_rec.slug IN ('profile', 'security', 'notifications') THEN true
            ELSE false
          END,
          CASE 
            WHEN modulo_rec.slug IN ('financeiro', 'estoque', 'rh', 'musicos', 'eventos', 'solicitacoes') THEN true
            WHEN modulo_rec.slug = 'configuracoes' AND aba_rec.slug IN ('profile', 'security', 'notifications') THEN true
            ELSE false
          END,
          CASE 
            WHEN modulo_rec.slug IN ('financeiro', 'estoque', 'rh', 'musicos', 'eventos', 'solicitacoes') THEN true
            ELSE false
          END,
          CASE 
            WHEN modulo_rec.slug IN ('financeiro', 'rh', 'solicitacoes') THEN true
            ELSE false
          END
        );
      END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Permissões criadas para o usuário gerente: %', gerente_id;
  ELSE
    RAISE NOTICE 'Usuário gerente não encontrado';
  END IF;
END $$;