import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X, ShoppingCart, AlertCircle, Package, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SearchableSelect } from '../common/SearchableSelect';
import { getDataAtual } from '../../lib/dayjs';

interface LancarVendasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ItemVenda {
  id: string;
  tipo: 'item_direto' | 'ficha_tecnica';
  item_id?: string;
  ficha_tecnica_id?: string;
  nome_display: string;
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
}

interface ItemEstoque {
  id: string;
  codigo?: string;
  nome: string;
  unidade_medida: string;
  custo_medio: number;
  estoque_id: string;
  estoque_nome: string;
  quantidade_atual: number;
}

interface FichaTecnica {
  id: string;
  nome: string;
  custo_total: number;
  ativo: boolean;
}

interface Estoque {
  id: string;
  nome: string;
  status: boolean;
}

const LancarVendasModal: React.FC<LancarVendasModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [itensVenda, setItensVenda] = useState<ItemVenda[]>([]);
  const [itensEstoque, setItensEstoque] = useState<ItemEstoque[]>([]);
  const [fichasTecnicas, setFichasTecnicas] = useState<FichaTecnica[]>([]);
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [estoqueOrigem, setEstoqueOrigem] = useState<string>('');
  const [dataVenda, setDataVenda] = useState<string>(getDataAtual());
  const [observacoes, setObservacoes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchEstoques();
      fetchFichasTecnicas();
    }
  }, [isOpen]);

  useEffect(() => {
    if (estoqueOrigem) {
      fetchItensEstoque();
    }
  }, [estoqueOrigem]);

  const fetchEstoques = async () => {
    try {
      const { data, error } = await supabase
        .from('estoques')
        .select('*')
        .eq('status', true)
        .order('nome');

      if (error) throw error;
      setEstoques(data || []);
    } catch (err) {
      console.error('Erro ao buscar estoques:', err);
    }
  };

  const fetchItensEstoque = async () => {
    try {
      const { data, error } = await supabase
        .from('saldos_estoque')
        .select(`
          *,
          itens_estoque!inner(
            id,
            codigo,
            nome,
            unidade_medida,
            custo_medio,
            status
          ),
          estoques!inner(
            id,
            nome
          )
        `)
        .eq('estoque_id', estoqueOrigem)
        .gt('quantidade_atual', 0)
        .eq('itens_estoque.status', 'ativo')
        .order('itens_estoque(nome)');

      if (error) throw error;

      const itensProcessados: ItemEstoque[] = (data || []).map(saldo => ({
        id: saldo.item_id,
        codigo: saldo.itens_estoque?.codigo,
        nome: saldo.itens_estoque?.nome || 'Item não encontrado',
        unidade_medida: saldo.itens_estoque?.unidade_medida || 'un',
        custo_medio: saldo.itens_estoque?.custo_medio || 0,
        estoque_id: saldo.estoque_id,
        estoque_nome: saldo.estoques?.nome || 'Estoque não encontrado',
        quantidade_atual: saldo.quantidade_atual || 0
      }));

      setItensEstoque(itensProcessados);
    } catch (err) {
      console.error('Erro ao buscar itens:', err);
      setItensEstoque([]);
    }
  };

  const fetchFichasTecnicas = async () => {
    try {
      const { data, error } = await supabase
        .from('fichas_tecnicas')
        .select('id, nome, custo_total, ativo')
        .eq('ativo', true)
        .eq('tipo_consumo', 'venda_direta')
        .order('nome');

      if (error) throw error;
      setFichasTecnicas(data || []);
    } catch (err) {
      console.error('Erro ao buscar fichas técnicas:', err);
      setFichasTecnicas([]);
    }
  };

  const adicionarItem = () => {
    const novoItem: ItemVenda = {
      id: `temp-${Date.now()}`,
      tipo: 'item_direto',
      nome_display: '',
      quantidade: 1,
      custo_unitario: 0,
      custo_total: 0
    };
    setItensVenda([...itensVenda, novoItem]);
  };

  const removerItem = (id: string) => {
    setItensVenda(itensVenda.filter(item => item.id !== id));
  };

  const atualizarItem = (id: string, campo: keyof ItemVenda, valor: any) => {
    setItensVenda(itensVenda.map(item => {
      if (item.id === id) {
        const itemAtualizado = { ...item, [campo]: valor };

        if (campo === 'quantidade') {
          itemAtualizado.custo_total = itemAtualizado.quantidade * itemAtualizado.custo_unitario;
        }

        if (campo === 'tipo') {
          itemAtualizado.item_id = undefined;
          itemAtualizado.ficha_tecnica_id = undefined;
          itemAtualizado.nome_display = '';
          itemAtualizado.custo_unitario = 0;
          itemAtualizado.custo_total = 0;
        }

        if (campo === 'item_id' && valor) {
          const itemEstoque = itensEstoque.find(i => i.id === valor);
          if (itemEstoque) {
            itemAtualizado.nome_display = itemEstoque.nome;
            itemAtualizado.custo_unitario = itemEstoque.custo_medio;
            itemAtualizado.custo_total = itemAtualizado.quantidade * itemEstoque.custo_medio;
          }
        }

        if (campo === 'ficha_tecnica_id' && valor) {
          const ficha = fichasTecnicas.find(f => f.id === valor);
          if (ficha) {
            itemAtualizado.nome_display = ficha.nome;
            itemAtualizado.custo_unitario = ficha.custo_total;
            itemAtualizado.custo_total = itemAtualizado.quantidade * ficha.custo_total;
          }
        }

        return itemAtualizado;
      }
      return item;
    }));
  };

  const validarVendas = (): string | null => {
    if (!estoqueOrigem) {
      return 'Selecione o estoque de origem';
    }

    if (itensVenda.length === 0) {
      return 'Adicione pelo menos um item para vender';
    }

    for (const item of itensVenda) {
      if (item.tipo === 'item_direto' && !item.item_id) {
        return 'Todos os itens diretos devem ter um produto selecionado';
      }

      if (item.tipo === 'ficha_tecnica' && !item.ficha_tecnica_id) {
        return 'Todas as fichas técnicas devem estar selecionadas';
      }

      if (item.quantidade <= 0) {
        return `Item "${item.nome_display}" deve ter quantidade maior que zero`;
      }

      if (item.tipo === 'item_direto' && item.item_id) {
        const itemEstoque = itensEstoque.find(i => i.id === item.item_id);
        if (itemEstoque && itemEstoque.quantidade_atual < item.quantidade) {
          return `Item "${item.nome_display}" tem quantidade insuficiente no estoque. Disponível: ${itemEstoque.quantidade_atual.toFixed(3)}`;
        }
      }
    }

    return null;
  };

  const processarVendas = async () => {
    try {
      setLoading(true);
      setError(null);

      const erroValidacao = validarVendas();
      if (erroValidacao) {
        setError(erroValidacao);
        return;
      }

      for (const item of itensVenda) {
        if (item.tipo === 'item_direto' && item.item_id) {
          const { error: errorMov } = await supabase
            .from('movimentacoes_estoque')
            .insert([{
              estoque_origem_id: estoqueOrigem,
              estoque_destino_id: null,
              item_id: item.item_id,
              tipo_movimentacao: 'saida',
              quantidade: item.quantidade,
              custo_unitario: item.custo_unitario,
              custo_total: item.custo_total,
              data_movimentacao: dataVenda,
              motivo: 'Venda Manual',
              observacoes: observacoes || null,
              origem_tipo: 'venda_manual'
            }]);

          if (errorMov) throw errorMov;
        }

        if (item.tipo === 'ficha_tecnica' && item.ficha_tecnica_id) {
          const { data: ingredientes, error: errorIngredientes } = await supabase
            .from('ficha_ingredientes')
            .select('item_estoque_id, quantidade')
            .eq('ficha_id', item.ficha_tecnica_id);

          if (errorIngredientes) throw errorIngredientes;

          if (!ingredientes || ingredientes.length === 0) {
            throw new Error(`Ficha técnica "${item.nome_display}" não tem ingredientes cadastrados`);
          }

          const { data: movComposta, error: errorComposta } = await supabase
            .from('movimentacoes_compostas')
            .insert([{
              tipo: 'venda',
              referencia_tipo: 'ficha_tecnica',
              referencia_id: item.ficha_tecnica_id,
              descricao: `Venda Manual - ${item.nome_display}`
            }])
            .select()
            .single();

          if (errorComposta) throw errorComposta;

          const movimentacoes = ingredientes.map(ing => ({
            estoque_origem_id: estoqueOrigem,
            estoque_destino_id: null,
            item_id: ing.item_estoque_id,
            tipo_movimentacao: 'saida',
            quantidade: ing.quantidade * item.quantidade,
            custo_unitario: 0,
            custo_total: 0,
            data_movimentacao: dataVenda,
            motivo: `Venda Manual - ${item.nome_display}`,
            observacoes: observacoes || null,
            origem_tipo: 'venda_ficha_tecnica_manual'
          }));

          const { data: movsInsert, error: errorMovs } = await supabase
            .from('movimentacoes_estoque')
            .insert(movimentacoes)
            .select();

          if (errorMovs) throw errorMovs;

          const itensComposta = (movsInsert || []).map(mov => ({
            composta_id: movComposta.id,
            movimentacao_id: mov.id,
            tipo_item: 'insumo'
          }));

          const { error: errorItens } = await supabase
            .from('movimentacoes_compostas_itens')
            .insert(itensComposta);

          if (errorItens) throw errorItens;
        }
      }

      onSuccess();
      limparFormulario();
    } catch (err) {
      console.error('Erro ao processar vendas:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar vendas');
    } finally {
      setLoading(false);
    }
  };

  const limparFormulario = () => {
    setItensVenda([]);
    setEstoqueOrigem('');
    setDataVenda(getDataAtual());
    setObservacoes('');
    setError(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getTotalGeral = () => {
    return itensVenda.reduce((sum, item) => sum + item.custo_total, 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto border border-white/10">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-green-400" />
            <h3 className="text-xl font-semibold text-white">Lançar Vendas Manualmente</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-500/30 text-red-300 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Estoque de Origem *
            </label>
            <SearchableSelect
              options={estoques.map(e => ({ value: e.id, label: e.nome }))}
              value={estoqueOrigem}
              onChange={setEstoqueOrigem}
              placeholder="Selecione o estoque..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Data da Venda *
            </label>
            <input
              type="date"
              value={dataVenda}
              onChange={(e) => setDataVenda(e.target.value)}
              className="w-full rounded-md border-white/20 shadow-sm focus:border-green-500 focus:ring focus:ring-green-500 focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Observações
            </label>
            <input
              type="text"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full rounded-md border-white/20 shadow-sm focus:border-green-500 focus:ring focus:ring-green-500 focus:ring-opacity-50"
              placeholder="Ex: Venda evento X"
            />
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-lg font-medium text-white">Itens da Venda</h4>
            <button
              onClick={adicionarItem}
              disabled={!estoqueOrigem}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Adicionar Item
            </button>
          </div>

          {!estoqueOrigem && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span>Selecione o estoque de origem antes de adicionar itens</span>
            </div>
          )}

          {itensVenda.length === 0 && estoqueOrigem && (
            <div className="text-center py-12 border-2 border-dashed border-white/20 rounded-lg">
              <Package className="w-12 h-12 text-white/30 mx-auto mb-2" />
              <p className="text-white/40">Nenhum item adicionado ainda</p>
              <p className="text-sm text-white/30 mt-1">Clique em "Adicionar Item" para começar</p>
            </div>
          )}

          <div className="space-y-3">
            {itensVenda.map((item, index) => (
              <div key={item.id} className="p-4 border border-white/10 rounded-lg bg-white/5">
                <div className="grid grid-cols-12 gap-3 items-start">
                  <div className="col-span-1 flex items-center justify-center pt-6">
                    <span className="text-lg font-bold text-white/30">#{index + 1}</span>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-white/80 mb-1">
                      Tipo *
                    </label>
                    <select
                      value={item.tipo}
                      onChange={(e) => atualizarItem(item.id, 'tipo', e.target.value)}
                      className="w-full rounded-md border-white/20 shadow-sm focus:border-green-500 focus:ring focus:ring-green-500 focus:ring-opacity-50 text-sm"
                    >
                      <option value="item_direto">Item Direto</option>
                      <option value="ficha_tecnica">Ficha Técnica</option>
                    </select>
                  </div>

                  <div className="col-span-5">
                    <label className="block text-xs font-medium text-white/80 mb-1">
                      {item.tipo === 'item_direto' ? 'Produto *' : 'Ficha Técnica *'}
                    </label>
                    {item.tipo === 'item_direto' ? (
                      <SearchableSelect
                        options={itensEstoque.map(i => ({
                          value: i.id,
                          label: i.codigo ? `${i.codigo} - ${i.nome}` : i.nome,
                          sublabel: `${i.quantidade_atual.toFixed(3)} ${i.unidade_medida} | Custo: ${formatCurrency(i.custo_medio)}`
                        }))}
                        value={item.item_id || ''}
                        onChange={(value) => atualizarItem(item.id, 'item_id', value)}
                        placeholder="Selecione o produto..."
                        emptyMessage="Nenhum item disponível no estoque"
                      />
                    ) : (
                      <SearchableSelect
                        options={fichasTecnicas.map(f => ({
                          value: f.id,
                          label: f.nome,
                          sublabel: `Custo: ${formatCurrency(f.custo_total)}`
                        }))}
                        value={item.ficha_tecnica_id || ''}
                        onChange={(value) => atualizarItem(item.id, 'ficha_tecnica_id', value)}
                        placeholder="Selecione a ficha técnica..."
                        emptyMessage="Nenhuma ficha técnica disponível"
                      />
                    )}
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-white/80 mb-1">
                      Quantidade *
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={item.quantidade}
                      onChange={(e) => atualizarItem(item.id, 'quantidade', parseFloat(e.target.value) || 0)}
                      className="w-full rounded-md border-white/20 shadow-sm focus:border-green-500 focus:ring focus:ring-green-500 focus:ring-opacity-50 text-sm"
                    />
                    {item.tipo === 'item_direto' && item.item_id && (
                      <p className="text-xs text-white/40 mt-1">
                        Disponível: {itensEstoque.find(i => i.id === item.item_id)?.quantidade_atual.toFixed(3)}
                      </p>
                    )}
                  </div>

                  <div className="col-span-1 flex flex-col items-end justify-center pt-6">
                    {item.custo_unitario > 0 && (
                      <div className="text-right mb-2">
                        <p className="text-xs text-white/40">CMV</p>
                        <p className="text-sm font-semibold text-white">
                          {formatCurrency(item.custo_total)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="col-span-1 flex items-center justify-center pt-6">
                    <button
                      onClick={() => removerItem(item.id)}
                      className="text-red-400 hover:text-red-300"
                      title="Remover item"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {itensVenda.length > 0 && (
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-semibold text-blue-300">Resumo da Venda</h4>
                <p className="text-sm text-blue-400">
                  {itensVenda.length} {itensVenda.length === 1 ? 'item' : 'itens'} a processar
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-blue-400">CMV Total (Custo)</p>
                <p className="text-2xl font-bold text-blue-300">
                  {formatCurrency(getTotalGeral())}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={() => {
              limparFormulario();
              onClose();
            }}
            disabled={loading}
            className="px-6 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/10/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={processarVendas}
            disabled={loading || itensVenda.length === 0 || !estoqueOrigem}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Processando...
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                Processar Vendas
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LancarVendasModal;
