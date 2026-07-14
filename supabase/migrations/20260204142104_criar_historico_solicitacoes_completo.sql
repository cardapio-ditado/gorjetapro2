/*
  # Sistema de Histórico de Solicitações
  
  ## Nova Tabela
  - `solicitacoes_historico`
    - `id` (uuid, primary key)
    - `solicitacao_id` (uuid, referência para solicitacoes)
    - `tipo_alteracao` (text) - tipo de mudança: status, financeiro, dados, etc
    - `campo_alterado` (text) - nome do campo que mudou
    - `valor_anterior` (text) - valor antes da alteração
    - `valor_novo` (text) - valor depois da alteração
    - `descricao` (text) - descrição da alteração
    - `usuario` (text) - quem fez a alteração
    - `criado_em` (timestamptz)
  
  ## Funcionalidade
  - Registra automaticamente todas as mudanças em solicitações
  - Trigger automático para capturar alterações de status
  - Trigger para capturar alterações financeiras
  - Trigger para capturar alterações de dados gerais
  
  ## Segurança
  - RLS habilitado
  - Usuários autenticados podem ver histórico
  - Apenas sistema pode inserir (via triggers)
*/

-- Criar tabela de histórico
CREATE TABLE IF NOT EXISTS solicitacoes_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  tipo_alteracao text NOT NULL,
  campo_alterado text,
  valor_anterior text,
  valor_novo text,
  descricao text NOT NULL,
  usuario text DEFAULT 'Sistema',
  criado_em timestamptz DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_historico_solicitacao 
  ON solicitacoes_historico(solicitacao_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_historico_tipo 
  ON solicitacoes_historico(tipo_alteracao);

-- Habilitar RLS
ALTER TABLE solicitacoes_historico ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Authenticated: Select all"
  ON solicitacoes_historico
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon: Select public requests"
  ON solicitacoes_historico
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM solicitacoes s
      WHERE s.id = solicitacoes_historico.solicitacao_id
        AND s.origem = 'publico'
    )
  );

-- Função para registrar histórico de status
CREATE OR REPLACE FUNCTION registrar_historico_status()
RETURNS TRIGGER AS $$
DECLARE
  status_anterior_texto text;
  status_novo_texto text;
BEGIN
  -- Mapear status para texto legível
  status_anterior_texto := CASE OLD.status
    WHEN 'rascunho' THEN 'Rascunho'
    WHEN 'enviado' THEN 'Enviado'
    WHEN 'em_analise' THEN 'Em Análise'
    WHEN 'aprovado' THEN 'Aprovado'
    WHEN 'em_execucao' THEN 'Em Execução'
    WHEN 'aguardando_orcamento' THEN 'Aguardando Orçamento'
    WHEN 'orcamento_aprovado' THEN 'Orçamento Aprovado'
    WHEN 'concluido' THEN 'Concluído'
    WHEN 'rejeitado' THEN 'Rejeitado'
    WHEN 'cancelado' THEN 'Cancelado'
    ELSE OLD.status
  END;
  
  status_novo_texto := CASE NEW.status
    WHEN 'rascunho' THEN 'Rascunho'
    WHEN 'enviado' THEN 'Enviado'
    WHEN 'em_analise' THEN 'Em Análise'
    WHEN 'aprovado' THEN 'Aprovado'
    WHEN 'em_execucao' THEN 'Em Execução'
    WHEN 'aguardando_orcamento' THEN 'Aguardando Orçamento'
    WHEN 'orcamento_aprovado' THEN 'Orçamento Aprovado'
    WHEN 'concluido' THEN 'Concluído'
    WHEN 'rejeitado' THEN 'Rejeitado'
    WHEN 'cancelado' THEN 'Cancelado'
    ELSE NEW.status
  END;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao,
      usuario
    ) VALUES (
      NEW.id,
      'status',
      'status',
      status_anterior_texto,
      status_novo_texto,
      'Status alterado de "' || status_anterior_texto || '" para "' || status_novo_texto || '"',
      'Sistema'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para registrar histórico financeiro
CREATE OR REPLACE FUNCTION registrar_historico_financeiro()
RETURNS TRIGGER AS $$
BEGIN
  -- Valor estimado
  IF OLD.valor_estimado IS DISTINCT FROM NEW.valor_estimado THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao
    ) VALUES (
      NEW.id,
      'financeiro',
      'valor_estimado',
      COALESCE(OLD.valor_estimado::text, '0'),
      COALESCE(NEW.valor_estimado::text, '0'),
      'Valor estimado alterado de R$ ' || 
      COALESCE(TO_CHAR(OLD.valor_estimado, 'FM999G999G999D00'), '0,00') || 
      ' para R$ ' || 
      COALESCE(TO_CHAR(NEW.valor_estimado, 'FM999G999G999D00'), '0,00')
    );
  END IF;

  -- Valor orçado
  IF OLD.valor_total_orcado IS DISTINCT FROM NEW.valor_total_orcado THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao
    ) VALUES (
      NEW.id,
      'financeiro',
      'valor_total_orcado',
      COALESCE(OLD.valor_total_orcado::text, '0'),
      COALESCE(NEW.valor_total_orcado::text, '0'),
      'Valor orçado alterado de R$ ' || 
      COALESCE(TO_CHAR(OLD.valor_total_orcado, 'FM999G999G999D00'), '0,00') || 
      ' para R$ ' || 
      COALESCE(TO_CHAR(NEW.valor_total_orcado, 'FM999G999G999D00'), '0,00')
    );
  END IF;

  -- Valor aprovado
  IF OLD.valor_aprovado IS DISTINCT FROM NEW.valor_aprovado THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao
    ) VALUES (
      NEW.id,
      'financeiro',
      'valor_aprovado',
      COALESCE(OLD.valor_aprovado::text, '0'),
      COALESCE(NEW.valor_aprovado::text, '0'),
      'Valor aprovado alterado de R$ ' || 
      COALESCE(TO_CHAR(OLD.valor_aprovado, 'FM999G999G999D00'), '0,00') || 
      ' para R$ ' || 
      COALESCE(TO_CHAR(NEW.valor_aprovado, 'FM999G999G999D00'), '0,00')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para registrar histórico de dados gerais
CREATE OR REPLACE FUNCTION registrar_historico_dados_gerais()
RETURNS TRIGGER AS $$
BEGIN
  -- Prioridade
  IF OLD.prioridade IS DISTINCT FROM NEW.prioridade THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao
    ) VALUES (
      NEW.id,
      'dados',
      'prioridade',
      OLD.prioridade,
      NEW.prioridade,
      'Prioridade alterada de "' || OLD.prioridade || '" para "' || NEW.prioridade || '"'
    );
  END IF;

  -- Data limite
  IF OLD.data_limite IS DISTINCT FROM NEW.data_limite THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao
    ) VALUES (
      NEW.id,
      'dados',
      'data_limite',
      COALESCE(TO_CHAR(OLD.data_limite, 'DD/MM/YYYY'), 'Não definida'),
      COALESCE(TO_CHAR(NEW.data_limite, 'DD/MM/YYYY'), 'Não definida'),
      'Data limite alterada de ' || 
      COALESCE(TO_CHAR(OLD.data_limite, 'DD/MM/YYYY'), 'não definida') || 
      ' para ' || 
      COALESCE(TO_CHAR(NEW.data_limite, 'DD/MM/YYYY'), 'não definida')
    );
  END IF;

  -- Título
  IF OLD.titulo IS DISTINCT FROM NEW.titulo THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao
    ) VALUES (
      NEW.id,
      'dados',
      'titulo',
      OLD.titulo,
      NEW.titulo,
      'Título alterado'
    );
  END IF;

  -- Descrição
  IF OLD.descricao IS DISTINCT FROM NEW.descricao THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao
    ) VALUES (
      NEW.id,
      'dados',
      'descricao',
      LEFT(OLD.descricao, 50) || '...',
      LEFT(NEW.descricao, 50) || '...',
      'Descrição foi atualizada'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para registrar criação
CREATE OR REPLACE FUNCTION registrar_criacao_solicitacao()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO solicitacoes_historico (
    solicitacao_id,
    tipo_alteracao,
    campo_alterado,
    valor_anterior,
    valor_novo,
    descricao,
    usuario
  ) VALUES (
    NEW.id,
    'criacao',
    NULL,
    NULL,
    NEW.status,
    'Solicitação criada com status "' || 
    CASE NEW.status
      WHEN 'rascunho' THEN 'Rascunho'
      WHEN 'enviado' THEN 'Enviado'
      WHEN 'em_analise' THEN 'Em Análise'
      ELSE NEW.status
    END || '"',
    NEW.solicitante_nome
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar triggers
DROP TRIGGER IF EXISTS trigger_historico_status ON solicitacoes;
CREATE TRIGGER trigger_historico_status
  AFTER UPDATE ON solicitacoes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION registrar_historico_status();

DROP TRIGGER IF EXISTS trigger_historico_financeiro ON solicitacoes;
CREATE TRIGGER trigger_historico_financeiro
  AFTER UPDATE ON solicitacoes
  FOR EACH ROW
  WHEN (
    OLD.valor_estimado IS DISTINCT FROM NEW.valor_estimado OR
    OLD.valor_total_orcado IS DISTINCT FROM NEW.valor_total_orcado OR
    OLD.valor_aprovado IS DISTINCT FROM NEW.valor_aprovado
  )
  EXECUTE FUNCTION registrar_historico_financeiro();

DROP TRIGGER IF EXISTS trigger_historico_dados_gerais ON solicitacoes;
CREATE TRIGGER trigger_historico_dados_gerais
  AFTER UPDATE ON solicitacoes
  FOR EACH ROW
  WHEN (
    OLD.prioridade IS DISTINCT FROM NEW.prioridade OR
    OLD.data_limite IS DISTINCT FROM NEW.data_limite OR
    OLD.titulo IS DISTINCT FROM NEW.titulo OR
    OLD.descricao IS DISTINCT FROM NEW.descricao
  )
  EXECUTE FUNCTION registrar_historico_dados_gerais();

DROP TRIGGER IF EXISTS trigger_criacao_solicitacao ON solicitacoes;
CREATE TRIGGER trigger_criacao_solicitacao
  AFTER INSERT ON solicitacoes
  FOR EACH ROW
  EXECUTE FUNCTION registrar_criacao_solicitacao();

-- Registrar histórico de anexos
CREATE OR REPLACE FUNCTION registrar_historico_anexo()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao
    ) VALUES (
      NEW.solicitacao_id,
      'anexo',
      'adicionar',
      NULL,
      NEW.nome_arquivo,
      'Anexo "' || NEW.nome_arquivo || '" foi adicionado'
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO solicitacoes_historico (
      solicitacao_id,
      tipo_alteracao,
      campo_alterado,
      valor_anterior,
      valor_novo,
      descricao
    ) VALUES (
      OLD.solicitacao_id,
      'anexo',
      'remover',
      OLD.nome_arquivo,
      NULL,
      'Anexo "' || OLD.nome_arquivo || '" foi removido'
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_historico_anexo ON solicitacoes_anexos;
CREATE TRIGGER trigger_historico_anexo
  AFTER INSERT OR DELETE ON solicitacoes_anexos
  FOR EACH ROW
  EXECUTE FUNCTION registrar_historico_anexo();

-- Registrar histórico de comentários
CREATE OR REPLACE FUNCTION registrar_historico_comentario()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO solicitacoes_historico (
    solicitacao_id,
    tipo_alteracao,
    campo_alterado,
    valor_anterior,
    valor_novo,
    descricao,
    usuario
  ) VALUES (
    NEW.solicitacao_id,
    'comentario',
    NEW.tipo_comentario,
    NULL,
    LEFT(NEW.comentario, 100),
    'Comentário do tipo "' || NEW.tipo_comentario || '" foi adicionado',
    NEW.autor_nome
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_historico_comentario ON comentarios_solicitacao;
CREATE TRIGGER trigger_historico_comentario
  AFTER INSERT ON comentarios_solicitacao
  FOR EACH ROW
  EXECUTE FUNCTION registrar_historico_comentario();
