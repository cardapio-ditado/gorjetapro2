import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { X, Upload, FileSpreadsheet, Sparkles, CheckCircle, AlertCircle, CreditCard as Edit3, Building2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ImportarVendasIAProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export interface ImportarVendasIAHandle {
  reabrirImportacao: (importacaoId: string) => Promise<void>;
}

interface ItemImportacao {
  id: string;
  linha_numero: number;
  nome_produto_externo: string;
  quantidade: number;
  valor_unitario: number | null;
  item_estoque_id: string | null;
  item_estoque_nome: string | null;
  ficha_tecnica_id: string | null;
  tipo_mapeamento: 'item' | 'ficha_tecnica' | null;
  estoque_id: string | null;
  status: string;
  confianca_mapeamento: number;
  confianca_estoque: number;
}

const ImportarVendasIA = forwardRef<ImportarVendasIAHandle, ImportarVendasIAProps>(({ isOpen, onClose, onSuccess }, ref) => {
  const [etapa, setEtapa] = useState<'upload' | 'processando' | 'revisao' | 'finalizando' | 'concluido'>('upload');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [estoques, setEstoques] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemImportacao[]>([]);
  const [todosItensEstoque, setTodosItensEstoque] = useState<any[]>([]);
  const [fichasTecnicas, setFichasTecnicas] = useState<any[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tipoEdicao, setTipoEdicao] = useState<'item' | 'ficha_tecnica'>('item');
  const [salvarMapeamentos, setSalvarMapeamentos] = useState(true);
  const [resultado, setResultado] = useState<any>(null);
  const [buscaItem, setBuscaItem] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      carregarEstoques();
      carregarTodosItensEstoque();
      carregarFichasTecnicas();
    }
  }, [isOpen]);

  useImperativeHandle(ref, () => ({
    reabrirImportacao: async (importacaoId: string) => {
      await reabrirImportacao(importacaoId);
    }
  }));

  const carregarEstoques = async () => {
    const { data } = await supabase
      .from('estoques')
      .select('*')
      .eq('status', true)
      .order('nome');

    if (data) setEstoques(data);
  };

  const carregarTodosItensEstoque = async () => {
    // Buscar relação item x estoque através de saldos_estoque
    const { data } = await supabase
      .from('saldos_estoque')
      .select(`
        estoque_id,
        item_id,
        itens_estoque (
          id,
          nome,
          codigo,
          status
        )
      `)
      .gt('quantidade_atual', 0);

    console.log('[Frontend] Saldos carregados:', data?.length || 0);

    if (data) {
      // Transformar para formato esperado
      const itensComEstoque = data
        .filter(s => s.itens_estoque && s.itens_estoque.status === 'ativo')
        .map(s => ({
          id: s.itens_estoque.id,
          nome: s.itens_estoque.nome,
          codigo: s.itens_estoque.codigo,
          estoque_id: s.estoque_id
        }));

      console.log('[Frontend] Itens transformados:', itensComEstoque.length);
      if (itensComEstoque.length > 0) {
        console.log('[Frontend] Exemplo item:', itensComEstoque[0]);
      }

      setTodosItensEstoque(itensComEstoque);
    }
  };

  const carregarFichasTecnicas = async () => {
    const { data } = await supabase
      .from('fichas_tecnicas')
      .select('id, nome, tipo_consumo, custo_total, ativo')
      .eq('ativo', true)
      .eq('tipo_consumo', 'venda_direta')
      .order('nome');

    console.log('[Frontend] Fichas técnicas carregadas:', data?.length || 0);

    if (data) {
      setFichasTecnicas(data);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setArquivo(file);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!arquivo) {
      setError('Selecione um arquivo');
      return;
    }

    setLoading(true);
    setError(null);
    setEtapa('processando');

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const formData = new FormData();
      formData.append('file', arquivo);
      formData.append('user_id', user?.id || '');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/importar-vendas-estoque`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });

      const data = await response.json();
      console.log('[Frontend] Resposta da API:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao processar arquivo');
      }

      console.log('[Frontend] Importação criada:', data.importacao_id);
      console.log('[Frontend] Total itens:', data.total_itens);
      console.log('[Frontend] Mapeados:', data.mapeados);
      console.log('[Frontend] Pendentes:', data.pendentes);

      setImportacaoId(data.importacao_id);
      await carregarItensImportacao(data.importacao_id);
      setEtapa('revisao');

    } catch (err) {
      console.error('Erro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
      setEtapa('upload');
    } finally {
      setLoading(false);
    }
  };

  const carregarItensImportacao = async (impId: string) => {
    console.log('[Frontend] Carregando itens para importação:', impId);

    // Verificar se usuário está autenticado
    const { data: { user } } = await supabase.auth.getUser();
    console.log('[Frontend] Usuário autenticado:', user?.id || 'não autenticado');

    const { data, error, count } = await supabase
      .from('itens_importacao_vendas')
      .select('*', { count: 'exact' })
      .eq('importacao_id', impId)
      .order('linha_numero');

    console.log('[Frontend] Itens carregados:', data?.length || 0, 'erro:', error);
    console.log('[Frontend] Count total:', count);

    if (error) {
      console.error('[Frontend] Erro detalhado:', error);
    }

    if (data) {
      setItens(data);
      console.log('[Frontend] State atualizado com', data.length, 'itens');
    }
  };

  const handleEditarItem = (itemId: string, novoItemEstoqueId: string, novoEstoqueId?: string) => {
    const itemEstoque = todosItensEstoque.find(i => i.id === novoItemEstoqueId);

    setItens(prev => prev.map(item =>
      item.id === itemId
        ? {
            ...item,
            item_estoque_id: novoItemEstoqueId,
            item_estoque_nome: itemEstoque?.nome || null,
            ficha_tecnica_id: null,
            tipo_mapeamento: 'item',
            estoque_id: novoEstoqueId || itemEstoque?.estoque_id || null,
            confianca_mapeamento: 1.0,
            confianca_estoque: 1.0
          }
        : item
    ));

    // Limpar busca após selecionar
    setBuscaItem('');
    setEditandoId(null);
  };

  const handleEditarFichaTecnica = (itemId: string, fichaId: string, novoEstoqueId: string) => {
    const ficha = fichasTecnicas.find(f => f.id === fichaId);

    setItens(prev => prev.map(item =>
      item.id === itemId
        ? {
            ...item,
            item_estoque_id: null,
            item_estoque_nome: null,
            ficha_tecnica_id: fichaId,
            tipo_mapeamento: 'ficha_tecnica',
            estoque_id: novoEstoqueId,
            confianca_mapeamento: 1.0,
            confianca_estoque: 1.0
          }
        : item
    ));

    // Limpar busca após selecionar
    setBuscaItem('');
    setEditandoId(null);
  };

  const handleEditarEstoque = (itemId: string, novoEstoqueId: string) => {
    setItens(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, estoque_id: novoEstoqueId, confianca_estoque: 1.0 }
        : item
    ));
  };

  const handleConfirmar = async () => {
    if (!importacaoId) return;

    const itensSemEstoque = itens.filter(i => i.item_estoque_id && !i.estoque_id);
    if (itensSemEstoque.length > 0) {
      setError(`${itensSemEstoque.length} itens mapeados não têm estoque definido.`);
      return;
    }

    setLoading(true);
    setEtapa('finalizando');
    setError(null);

    try {
      const itensRevisados = itens
        .filter(i => (i.item_estoque_id || i.ficha_tecnica_id) && i.estoque_id && (i.confianca_mapeamento === 1.0 || i.confianca_estoque === 1.0))
        .map(i => ({
          id: i.id,
          item_estoque_id: i.item_estoque_id,
          item_estoque_nome: i.item_estoque_nome,
          ficha_tecnica_id: i.ficha_tecnica_id,
          tipo_mapeamento: i.tipo_mapeamento,
          estoque_id: i.estoque_id
        }));

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/confirmar-importacao-vendas`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          importacao_id: importacaoId,
          itens_revisados: itensRevisados.length > 0 ? itensRevisados : null,
          salvar_mapeamentos: salvarMapeamentos
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao confirmar importação');
      }

      setResultado(data);
      setEtapa('concluido');

      setTimeout(() => {
        onSuccess();
        handleFechar();
      }, 3000);

    } catch (err) {
      console.error('Erro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao confirmar importação');
      setEtapa('revisao');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessarBaixaAutomatica = async () => {
    if (!importacaoId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('processar_vendas_importacao', {
        p_importacao_id: importacaoId
      });

      if (error) throw error;

      const resultado = data?.[0];

      if (resultado) {
        alert(`
✅ Processamento de baixa automática concluído!

Total de itens: ${resultado.total_itens}
Processados com sucesso: ${resultado.processados}
Com erro: ${resultado.com_erro}

Verifique as movimentações de estoque para confirmar as baixas.
        `);

        onSuccess();
        handleFechar();
      }
    } catch (err) {
      console.error('Erro ao processar baixa automática:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar baixa automática');
    } finally {
      setLoading(false);
    }
  };

  const reabrirImportacao = async (impId: string) => {
    setLoading(true);
    setError(null);

    try {
      setImportacaoId(impId);
      await carregarItensImportacao(impId);
      setEtapa('revisao');
    } catch (err) {
      console.error('Erro ao reabrir importação:', err);
      setError(err instanceof Error ? err.message : 'Erro ao reabrir importação');
    } finally {
      setLoading(false);
    }
  };

  const handleFechar = () => {
    setEtapa('upload');
    setArquivo(null);
    setImportacaoId(null);
    setItens([]);
    setError(null);
    setResultado(null);
    setEditandoId(null);
    setBuscaItem('');
    onClose();
  };

  if (!isOpen) return null;

  const itensMapeados = itens.filter(i => (i.item_estoque_id || i.ficha_tecnica_id) && i.estoque_id).length;
  const itensPendentes = itens.filter(i => (!i.item_estoque_id && !i.ficha_tecnica_id) || !i.estoque_id).length;

  const getEstoqueNome = (estoqueId: string | null) => {
    if (!estoqueId) return '';
    return estoques.find(e => e.id === estoqueId)?.nome || '';
  };

  const getItensDoEstoque = (estoqueId: string) => {
    let itens = todosItensEstoque.filter(i => i.estoque_id === estoqueId);

    // Aplicar filtro de busca
    if (buscaItem.trim()) {
      const termo = buscaItem.toLowerCase();
      itens = itens.filter(i =>
        i.nome?.toLowerCase().includes(termo) ||
        i.codigo?.toLowerCase().includes(termo)
      );
    }

    console.log('[Frontend] Filtrando estoque:', estoqueId, 'Busca:', buscaItem, 'Total:', todosItensEstoque.length, 'Filtrados:', itens.length);
    return itens;
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Importar Vendas com IA</h3>
                <p className="text-sm text-blue-100 mt-1">A IA aprende qual estoque usar para cada produto</p>
              </div>
            </div>
            <button onClick={handleFechar} className="text-white hover:text-blue-100">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {etapa === 'upload' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Arquivo de Vendas (XLS ou PDF)</label>
                <div className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                  <input
                    type="file"
                    accept=".xls,.xlsx,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <FileSpreadsheet className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <p className="text-sm text-white/50">{arquivo ? arquivo.name : 'Clique para selecionar XLS ou PDF'}</p>
                    <p className="text-xs text-white/40 mt-2">Planilha Excel ou PDF de relatório de vendas</p>
                  </label>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <h4 className="font-semibold text-blue-300 mb-2">Como funciona:</h4>
                <ol className="text-sm text-blue-300 space-y-1 list-decimal list-inside">
                  <li>Envie XLS (Excel) ou PDF (relatório de vendas)</li>
                  <li>Sistema extrai produtos e quantidades automaticamente</li>
                  <li>IA mapeia com itens do estoque e sugere estoques</li>
                  <li>Você revisa e ajusta se necessário</li>
                  <li>Saídas criadas automaticamente</li>
                  <li>Sistema aprende para próximas importações</li>
                </ol>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </div>
          )}

          {etapa === 'processando' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-lg font-medium text-white">Processando com IA...</p>
              <p className="text-sm text-white/50 mt-2">Mapeando produtos e sugerindo estoques</p>
            </div>
          )}

          {etapa === 'revisao' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-500/30 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-white/50">Total</p>
                    <p className="text-2xl font-bold text-white">{itens.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-white/50">Mapeados</p>
                    <p className="text-2xl font-bold text-green-400">{itensMapeados}</p>
                  </div>
                  <div>
                    <p className="text-sm text-white/50">Pendentes</p>
                    <p className="text-2xl font-bold text-orange-400">{itensPendentes}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="salvar-map"
                  checked={salvarMapeamentos}
                  onChange={(e) => setSalvarMapeamentos(e.target.checked)}
                  className="w-4 h-4 text-blue-400 rounded"
                />
                <label htmlFor="salvar-map" className="text-sm text-white/80">
                  Salvar aprendizado (IA lembrará qual estoque usar)
                </label>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {itens.map(item => {
                  const estoqueNome = getEstoqueNome(item.estoque_id);
                  const ok = (item.item_estoque_id || item.ficha_tecnica_id) && item.estoque_id;
                  const fichaTexto = item.ficha_tecnica_id ? fichasTecnicas.find(f => f.id === item.ficha_tecnica_id)?.nome : null;

                  return (
                    <div key={item.id} className={`border rounded-lg p-4 ${ok ? 'border-green-500/30 bg-green-500/10' : 'border-orange-500/30 bg-orange-500/10'}`}>
                      <div className="flex justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium text-white">{item.nome_produto_externo}</p>
                          <p className="text-sm text-white/50">Qtd: {item.quantidade}</p>

                          {editandoId === item.id ? (
                            <div className="mt-3 space-y-2">
                              {/* Seletor de Tipo */}
                              <div className="flex gap-2 p-2 bg-white/10 rounded-lg">
                                <button
                                  onClick={() => setTipoEdicao('item')}
                                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                                    tipoEdicao === 'item'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white text-white/80 hover:bg-white/10/5'
                                  }`}
                                >
                                  Item Simples
                                </button>
                                <button
                                  onClick={() => setTipoEdicao('ficha_tecnica')}
                                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                                    tipoEdicao === 'ficha_tecnica'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white text-white/80 hover:bg-white/10/5'
                                  }`}
                                >
                                  Ficha Técnica
                                </button>
                              </div>

                              <select
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                value={item.estoque_id || ''}
                                onChange={(e) => handleEditarEstoque(item.id, e.target.value)}
                              >
                                <option value="">Selecione o estoque...</option>
                                {estoques.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                              </select>

                              {item.estoque_id && tipoEdicao === 'item' && (
                                <>
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/30" />
                                    <input
                                      type="text"
                                      placeholder="Buscar item por nome ou código..."
                                      value={buscaItem}
                                      onChange={(e) => setBuscaItem(e.target.value)}
                                      className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    {buscaItem && (
                                      <div className="text-xs text-white/40 mt-1">
                                        {getItensDoEstoque(item.estoque_id).length} itens encontrados
                                      </div>
                                    )}
                                  </div>
                                  <select
                                    key={`${item.estoque_id}-${buscaItem}`}
                                    className="w-full px-3 py-2 border rounded-lg text-sm"
                                    value={item.item_estoque_id || ''}
                                    onChange={(e) => handleEditarItem(item.id, e.target.value, item.estoque_id || undefined)}
                                  >
                                    <option value="">Selecione o item...</option>
                                    {getItensDoEstoque(item.estoque_id).map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                                  </select>
                                </>
                              )}

                              {item.estoque_id && tipoEdicao === 'ficha_tecnica' && (
                                <select
                                  className="w-full px-3 py-2 border rounded-lg text-sm"
                                  value={item.ficha_tecnica_id || ''}
                                  onChange={(e) => handleEditarFichaTecnica(item.id, e.target.value, item.estoque_id || '')}
                                >
                                  <option value="">Selecione a ficha técnica...</option>
                                  {fichasTecnicas.map(f => (
                                    <option key={f.id} value={f.id}>{f.nome}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          ) : (
                            <>
                              {ok ? (
                                <div className="mt-2 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    {item.tipo_mapeamento === 'ficha_tecnica' ? (
                                      <>
                                        <span className="text-sm text-green-400">{fichaTexto}</span>
                                        <span className="text-xs bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded">Ficha Técnica</span>
                                      </>
                                    ) : (
                                      <span className="text-sm text-green-400">{item.item_estoque_nome}</span>
                                    )}
                                    {item.confianca_mapeamento < 1 && <span className="text-xs text-green-400">({Math.round(item.confianca_mapeamento * 100)}%)</span>}
                                  </div>
                                  <div className="flex items-center gap-2 ml-6">
                                    <Building2 className="w-3 h-3 text-green-400" />
                                    <span className="text-xs text-green-400">{estoqueNome}</span>
                                    {item.confianca_estoque < 1 && <span className="text-xs text-green-400">({Math.round(item.confianca_estoque * 100)}%)</span>}
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-2 flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4 text-orange-400" />
                                  <span className="text-sm text-orange-400">{(!item.item_estoque_id && !item.ficha_tecnica_id) ? 'Não mapeado' : 'Estoque não definido'}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <button onClick={() => {
                          setBuscaItem('');
                          setEditandoId(editandoId === item.id ? null : item.id);
                        }} className="p-2 text-blue-400 hover:bg-blue-500/15 rounded-lg">
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {etapa === 'finalizando' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-lg font-medium text-white">Criando saídas...</p>
            </div>
          )}

          {etapa === 'concluido' && resultado && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-400" />
              </div>
              <p className="text-xl font-semibold text-white">Concluído!</p>
              <p className="text-sm text-white/50 mt-2">{resultado.total_sucesso} saídas criadas</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-white/5">
          <div className="flex justify-end gap-3">
            {etapa === 'upload' && (
              <>
                <button onClick={handleFechar} className="px-6 py-2 border rounded-lg text-white/80 hover:bg-white/10/10">Cancelar</button>
                <button onClick={handleUpload} disabled={!arquivo || loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Processar
                </button>
              </>
            )}

            {etapa === 'revisao' && (
              <>
                <button onClick={handleFechar} className="px-6 py-2 border rounded-lg text-white/80 hover:bg-white/10/10">Cancelar</button>
                <button onClick={handleConfirmar} disabled={itensMapeados === 0 || loading} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  Confirmar ({itensMapeados})
                </button>
                <button
                  onClick={handleProcessarBaixaAutomatica}
                  disabled={itensMapeados === 0 || loading}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  title="Processa baixa automática de insumos via fichas técnicas"
                >
                  <Sparkles className="w-5 h-5" />
                  Processar Baixa Automática
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ImportarVendasIA.displayName = 'ImportarVendasIA';

export default ImportarVendasIA;
