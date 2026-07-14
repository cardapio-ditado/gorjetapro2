import React, { useState, useEffect } from 'react';
import { Shield, Search, Save, RotateCcw, CheckCircle, XCircle, Eye, Plus, CreditCard as Edit, Trash2, Lock, Unlock, Crown, Star, User, Settings, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ModuloSistema {
  id: string;
  nome: string;
  slug: string;
  icone: string;
  ativo: boolean;
  abas: AbaModulo[];
}

interface AbaModulo {
  id: string;
  modulo_id: string;
  nome: string;
  slug: string;
  icone: string;
  ativo: boolean;
}

interface PermissaoUsuario {
  id?: string; // ID da permissão no banco, opcional para novas
  usuario_id: string;
  modulo_id: string;
  aba_id: string | null; // Pode ser null para permissões de módulo
  pode_visualizar: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
  pode_aprovar: boolean;
  observacoes?: string;
}

interface GerenciamentoPermissoesProps {
  usuarioId: string;
  usuarioNome: string;
  onClose: () => void;
  onSave: () => void;
}

const GerenciamentoPermissoes: React.FC<GerenciamentoPermissoesProps> = ({
  usuarioId,
  usuarioNome,
  onClose,
  onSave
}) => {
  const { isMaster } = useAuth();
  const [modulos, setModulos] = useState<ModuloSistema[]>([]);
  const [permissoes, setPermissoes] = useState<PermissaoUsuario[]>([]);
  const [permissoesOriginais, setPermissoesOriginais] = useState<PermissaoUsuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduloExpandido, setModuloExpandido] = useState<string | null>(null);

  useEffect(() => {
    if (isMaster()) {
      fetchModulosEAbas();
      fetchPermissoesUsuario();
    }
  }, [usuarioId]);

  const fetchModulosEAbas = async () => {
    try {
      // Buscar módulos
      const { data: modulosData, error: modulosError } = await supabase
        .from('modulos_sistema')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (modulosError) throw modulosError;

      // Buscar abas para cada módulo
      const { data: abasData, error: abasError } = await supabase
        .from('abas_modulo')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (abasError) throw abasError;

      // Organizar dados
      const modulosComAbas: ModuloSistema[] = (modulosData || []).map(modulo => ({
        ...modulo,
        abas: (abasData || []).filter(aba => aba.modulo_id === modulo.id)
      }));

      setModulos(modulosComAbas);
    } catch (err) {
      console.error('Error fetching modules and tabs:', err);
      setError('Erro ao carregar módulos e abas');
    }
  };

  const fetchPermissoesUsuario = async () => {
    try {
      const { data, error } = await supabase
        .from('permissoes_usuario')
        .select('*')
        .eq('usuario_id', usuarioId);

      if (error) throw error;

      const permissoesExistentes = data || [];
      setPermissoes(permissoesExistentes);
      setPermissoesOriginais(JSON.parse(JSON.stringify(permissoesExistentes)));
    } catch (err) {
      console.error('Error fetching user permissions:', err);
      setError('Erro ao carregar permissões do usuário');
    } finally {
      setLoading(false);
    }
  };

  const atualizarPermissao = (moduloId: string, abaId: string | null, campo: keyof PermissaoUsuario, valor: boolean) => {
    setPermissoes(permissoesAtuais => {
      const novasPermissoes = [...permissoesAtuais];
      
      // Buscar permissão existente ou criar uma nova
      let permissao = novasPermissoes.find(p => 
        p.modulo_id === moduloId && p.aba_id === abaId
      );

      if (!permissao) {
        permissao = {
          usuario_id: usuarioId,
          modulo_id: moduloId,
          aba_id: abaId,
          pode_visualizar: false,
          pode_criar: false,
          pode_editar: false,
          pode_excluir: false,
          pode_aprovar: false
        };
        novasPermissoes.push(permissao);
      }

      // Atualizar o campo específico
      (permissao as any)[campo] = valor;

      // Lógica de consistência:
      // Se desmarcar visualizar, desmarcar todas as outras
      if (campo === 'pode_visualizar' && !valor) {
        permissao.pode_criar = false;
        permissao.pode_editar = false;
        permissao.pode_excluir = false;
        permissao.pode_aprovar = false;
      } 
      // Se marcar qualquer outra permissão, marcar visualizar automaticamente
      else if (campo !== 'pode_visualizar' && valor) {
        permissao.pode_visualizar = true;
      }

      return novasPermissoes;
    });
  };

  const obterPermissao = (moduloId: string, abaId: string | null): PermissaoUsuario | null => {
    return permissoes.find(p => p.modulo_id === moduloId && p.aba_id === abaId) || null;
  };

  const handleSalvarPermissoes = async () => {
    try {
      setSaving(true);
      setError(null);

      // Remover permissões existentes do usuário
      const { error: deleteError } = await supabase
        .from('permissoes_usuario')
        .delete()
        .eq('usuario_id', usuarioId);

      if (deleteError) throw deleteError;

      // Inserir novas permissões (apenas as que têm pelo menos uma permissão ativa)
      const permissoesParaInserir = permissoes.filter(p => 
        p.pode_visualizar || p.pode_criar || p.pode_editar || p.pode_excluir || p.pode_aprovar
      );

      if (permissoesParaInserir.length > 0) {
        const { error: insertError } = await supabase
          .from('permissoes_usuario')
          .insert(permissoesParaInserir.map(p => ({
            usuario_id: p.usuario_id,
            modulo_id: p.modulo_id,
            aba_id: p.aba_id,
            pode_visualizar: p.pode_visualizar,
            pode_criar: p.pode_criar,
            pode_editar: p.pode_editar,
            pode_excluir: p.pode_excluir,
            pode_aprovar: p.pode_aprovar,
            observacoes: p.observacoes
          })));

        if (insertError) throw insertError;
      }

      onSave();
      alert('Permissões salvas com sucesso!');
    } catch (err) {
      console.error('Error saving permissions:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar permissões');
    } finally {
      setSaving(false);
    }
  };

  const resetarPermissoes = () => {
    if (confirm('Tem certeza que deseja descartar todas as alterações?')) {
      setPermissoes(JSON.parse(JSON.stringify(permissoesOriginais)));
    }
  };

  const aplicarPermissoesPadrao = async (nivel: 'admin' | 'usuario' | 'visitante') => {
    if (!confirm(`Aplicar permissões padrão de ${nivel} para ${usuarioNome}? Isso substituirá todas as permissões atuais.`)) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Chamar função do banco para criar permissões padrão
      const { error } = await supabase.rpc('criar_permissoes_padrao', {
        p_usuario_id: usuarioId,
        p_nivel: nivel
      });

      if (error) throw error;

      // Recarregar permissões
      await fetchPermissoesUsuario();
      alert(`Permissões padrão de ${nivel} aplicadas com sucesso!`);
    } catch (err) {
      console.error('Error applying default permissions:', err);
      setError(err instanceof Error ? err.message : 'Erro ao aplicar permissões padrão');
    } finally {
      setSaving(false);
    }
  };

  const modulosFiltrados = modulos.filter(modulo =>
    modulo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    modulo.abas.some(aba => aba.nome.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const temAlteracoes = () => {
    return JSON.stringify(permissoes) !== JSON.stringify(permissoesOriginais);
  };

  if (!isMaster()) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Acesso Negado</h3>
          <p className="text-white/50">
            Apenas usuários Master podem gerenciar permissões.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-white">
            Permissões - {usuarioNome}
          </h3>
          <p className="text-sm text-white/70">
            Configure o acesso aos módulos e funcionalidades do sistema
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => aplicarPermissoesPadrao('visitante')}
            disabled={saving}
            className="px-3 py-1 bg-white/50 text-white text-sm rounded-md hover:bg-gray-600 disabled:opacity-50"
          >
            Visitante
          </button>
          <button
            onClick={() => aplicarPermissoesPadrao('usuario')}
            disabled={saving}
            className="px-3 py-1 bg-blue-500/100 text-white text-sm rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            Usuário
          </button>
          <button
            onClick={() => aplicarPermissoesPadrao('admin')}
            disabled={saving}
            className="px-3 py-1 bg-purple-500/100 text-white text-sm rounded-md hover:bg-purple-600 disabled:opacity-50"
          >
            Admin
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Controles */}
      <div className="bg-[#12141f] p-4 rounded-lg shadow-sm border border-white/10">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar módulos ou abas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              />
            </div>
            {temAlteracoes() && (
              <div className="flex items-center text-sm text-orange-400">
                <AlertTriangle className="w-4 h-4 mr-1" />
                Alterações não salvas
              </div>
            )}
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={resetarPermissoes}
              disabled={!temAlteracoes() || saving}
              className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4 inline mr-2" />
              Resetar
            </button>
            <button
              onClick={handleSalvarPermissoes}
              disabled={!temAlteracoes() || saving}
              className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50"
            >
              <Save className="w-4 h-4 inline mr-2" />
              {saving ? 'Salvando...' : 'Salvar Permissões'}
            </button>
          </div>
        </div>
      </div>

      {/* Grid de Permissões */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10">
          <div className="p-6">
            <div className="space-y-6">
              {modulosFiltrados.map((modulo) => (
                <div key={modulo.id} className="border border-white/10 rounded-lg">
                  <div 
                    className="p-4 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                    onClick={() => setModuloExpandido(moduloExpandido === modulo.id ? null : modulo.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="p-2 bg-[#7D1F2C] rounded-lg mr-3">
                          <Shield className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h4 className="font-medium text-white">{modulo.nome}</h4>
                          <p className="text-sm text-white/50">
                            {modulo.abas.length} aba(s) disponível(is)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-white/50">
                          {permissoes.filter(p => p.modulo_id === modulo.id && p.aba_id === null && p.pode_visualizar).length > 0 ? 'Acesso ao Módulo' : 'Sem Acesso Direto'}
                        </span>
                        <div className={`transform transition-transform ${
                          moduloExpandido === modulo.id ? 'rotate-180' : ''
                        }`}>
                          <svg className="w-5 h-5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {moduloExpandido === modulo.id && (
                    <div className="p-4 border-t border-white/10">
                      <div className="space-y-3">
                        {/* Permissão para o módulo em si (aba_id = null) */}
                        {(() => {
                          const permissaoModulo = obterPermissao(modulo.id, null);
                          return (
                            <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg border border-white/10">
                              <div className="flex items-center">
                                <div className="p-2 bg-gray-200 rounded-lg mr-3">
                                  <Settings className="w-4 h-4 text-white/70" />
                                </div>
                                <div>
                                  <h5 className="font-medium text-white">Acesso Geral ao Módulo</h5>
                                  <p className="text-sm text-white/50">Aplica-se ao módulo como um todo</p>
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-4">
                                {/* Visualizar */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoModulo?.pode_visualizar || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, null, 'pode_visualizar', e.target.checked)}
                                    className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <Eye className="w-4 h-4 inline mr-1" />
                                    Ver
                                  </span>
                                </label>

                                {/* Criar */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoModulo?.pode_criar || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, null, 'pode_criar', e.target.checked)}
                                    className="rounded border-white/20 text-green-400 focus:ring-green-500"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <Plus className="w-4 h-4 inline mr-1" />
                                    Criar
                                  </span>
                                </label>

                                {/* Editar */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoModulo?.pode_editar || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, null, 'pode_editar', e.target.checked)}
                                    className="rounded border-white/20 text-blue-400 focus:ring-blue-500"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <Edit className="w-4 h-4 inline mr-1" />
                                    Editar
                                  </span>
                                </label>

                                {/* Excluir */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoModulo?.pode_excluir || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, null, 'pode_excluir', e.target.checked)}
                                    className="rounded border-white/20 text-red-400 focus:ring-red-500"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <Trash2 className="w-4 h-4 inline mr-1" />
                                    Excluir
                                  </span>
                                </label>

                                {/* Aprovar */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoModulo?.pode_aprovar || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, null, 'pode_aprovar', e.target.checked)}
                                    className="rounded border-white/20 text-purple-400 focus:ring-purple-500"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 inline mr-1" />
                                    Aprovar
                                  </span>
                                </label>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Abas do Módulo */}
                        {modulo.abas.map((aba) => {
                          const permissaoAba = obterPermissao(modulo.id, aba.id);
                          
                          return (
                            <div key={aba.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                              <div className="flex items-center">
                                <div className="p-2 bg-blue-500/15 rounded-lg mr-3">
                                  <Settings className="w-4 h-4 text-blue-400" />
                                </div>
                                <div>
                                  <h5 className="font-medium text-white">{aba.nome}</h5>
                                  <p className="text-sm text-white/50">Aba: {aba.slug}</p>
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-4">
                                {/* Visualizar */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoAba?.pode_visualizar || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, aba.id, 'pode_visualizar', e.target.checked)}
                                    className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <Eye className="w-4 h-4 inline mr-1" />
                                    Ver
                                  </span>
                                </label>

                                {/* Criar */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoAba?.pode_criar || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, aba.id, 'pode_criar', e.target.checked)}
                                    className="rounded border-white/20 text-green-400 focus:ring-green-500"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <Plus className="w-4 h-4 inline mr-1" />
                                    Criar
                                  </span>
                                </label>

                                {/* Editar */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoAba?.pode_editar || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, aba.id, 'pode_editar', e.target.checked)}
                                    className="rounded border-white/20 text-blue-400 focus:ring-blue-500"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <Edit className="w-4 h-4 inline mr-1" />
                                    Editar
                                  </span>
                                </label>

                                {/* Excluir */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoAba?.pode_excluir || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, aba.id, 'pode_excluir', e.target.checked)}
                                    className="rounded border-white/20 text-red-400 focus:ring-red-500"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <Trash2 className="w-4 h-4 inline mr-1" />
                                    Excluir
                                  </span>
                                </label>

                                {/* Aprovar */}
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={permissaoAba?.pode_aprovar || false}
                                    onChange={(e) => atualizarPermissao(modulo.id, aba.id, 'pode_aprovar', e.target.checked)}
                                    className="rounded border-white/20 text-purple-400 focus:ring-purple-500"
                                  />
                                  <span className="ml-2 text-sm text-white/80">
                                    <CheckCircle className="w-4 h-4 inline mr-1" />
                                    Aprovar
                                  </span>
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {modulosFiltrados.length === 0 && (
                <div className="text-center py-8">
                  <Shield className="w-12 h-12 text-white/30 mx-auto mb-4" />
                  <p className="text-white/50">
                    {searchTerm ? 'Nenhum módulo encontrado' : 'Nenhum módulo disponível'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Legenda */}
      <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-200">
        <h4 className="font-medium text-blue-300 mb-2">Legenda das Permissões</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="flex items-center">
            <Eye className="w-4 h-4 text-[#7D1F2C] mr-2" />
            <span><strong>Ver:</strong> Visualizar dados</span>
          </div>
          <div className="flex items-center">
            <Plus className="w-4 h-4 text-green-400 mr-2" />
            <span><strong>Criar:</strong> Adicionar novos registros</span>
          </div>
          <div className="flex items-center">
            <Edit className="w-4 h-4 text-blue-400 mr-2" />
            <span><strong>Editar:</strong> Modificar registros</span>
          </div>
          <div className="flex items-center">
            <Trash2 className="w-4 h-4 text-red-400 mr-2" />
            <span><strong>Excluir:</strong> Remover registros</span>
          </div>
          <div className="flex items-center">
            <CheckCircle className="w-4 h-4 text-purple-400 mr-2" />
            <span><strong>Aprovar:</strong> Autorizar ações</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GerenciamentoPermissoes;
