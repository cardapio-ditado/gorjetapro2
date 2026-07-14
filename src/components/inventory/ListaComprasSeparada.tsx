import React, { useState, useEffect } from 'react';
import { ShoppingCart, Store, Truck, Download, AlertCircle, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../utils/currency';

interface ItemCompra {
  id: string;
  codigo: string;
  nome: string;
  unidade_medida: string;
  estoque_minimo: number;
  quantidade_atual: number;
  quantidade_sugerida: number;
  categoria: string;
  tipo_compra: string;
  observacoes: string | null;
  custo_medio: number;
  valor_estimado: number;
  fornecedor_padrao_id?: string;
  fornecedor_nome?: string;
  fornecedor_telefone?: string;
  fornecedor_email?: string;
}

type TipoLista = 'rua' | 'fornecedor';

const ListaComprasSeparada: React.FC = () => {
  const [tipoLista, setTipoLista] = useState<TipoLista>('rua');
  const [itensRua, setItensRua] = useState<ItemCompra[]>([]);
  const [itensFornecedor, setItensFornecedor] = useState<ItemCompra[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    carregarListas();
  }, []);

  const carregarListas = async () => {
    setLoading(true);
    try {
      const [resultRua, resultFornecedor] = await Promise.all([
        supabase.from('vw_lista_compras_rua').select('*'),
        supabase.from('vw_lista_compras_fornecedor').select('*')
      ]);

      if (resultRua.error) throw resultRua.error;
      if (resultFornecedor.error) throw resultFornecedor.error;

      setItensRua(resultRua.data || []);
      setItensFornecedor(resultFornecedor.data || []);
    } catch (error) {
      console.error('Erro ao carregar listas:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportarParaTexto = (tipo: TipoLista) => {
    const itens = tipo === 'rua' ? itensRua : itensFornecedor;

    if (itens.length === 0) {
      alert('Nenhum item para exportar');
      return;
    }

    let texto = '';

    if (tipo === 'rua') {
      texto = '═══════════════════════════════════════\n';
      texto += '      LISTA DE COMPRAS - RUA/FEIRA\n';
      texto += '═══════════════════════════════════════\n\n';

      const itensPorCategoria = itens.reduce((acc, item) => {
        if (!acc[item.categoria]) acc[item.categoria] = [];
        acc[item.categoria].push(item);
        return acc;
      }, {} as Record<string, ItemCompra[]>);

      Object.entries(itensPorCategoria).forEach(([categoria, itensCategoria]) => {
        texto += `\n📦 ${categoria.toUpperCase()}\n`;
        texto += '─────────────────────────────────────\n';

        itensCategoria.forEach(item => {
          texto += `☐ ${item.nome}\n`;
          texto += `  Qtd: ${item.quantidade_sugerida.toFixed(2)} ${item.unidade_medida}\n`;
          if (item.custo_medio > 0) {
            texto += `  Valor estimado: ${formatCurrency(item.valor_estimado)}\n`;
          }
          texto += '\n';
        });
      });

      const totalEstimado = itens.reduce((sum, item) => sum + item.valor_estimado, 0);
      texto += '\n═══════════════════════════════════════\n';
      texto += `VALOR TOTAL ESTIMADO: ${formatCurrency(totalEstimado)}\n`;
      texto += '═══════════════════════════════════════\n';

    } else {
      texto = '═══════════════════════════════════════\n';
      texto += '   LISTA DE COMPRAS - FORNECEDORES\n';
      texto += '═══════════════════════════════════════\n\n';

      const itensPorFornecedor = itens.reduce((acc, item) => {
        const fornecedor = item.fornecedor_nome || 'Sem fornecedor';
        if (!acc[fornecedor]) acc[fornecedor] = [];
        acc[fornecedor].push(item);
        return acc;
      }, {} as Record<string, ItemCompra[]>);

      Object.entries(itensPorFornecedor).forEach(([fornecedor, itensFornecedor]) => {
        const itemFornecedor = itensFornecedor[0];

        texto += `\n🏢 ${fornecedor.toUpperCase()}\n`;
        if (itemFornecedor.fornecedor_telefone) {
          texto += `   Tel: ${itemFornecedor.fornecedor_telefone}\n`;
        }
        if (itemFornecedor.fornecedor_email) {
          texto += `   Email: ${itemFornecedor.fornecedor_email}\n`;
        }
        texto += '─────────────────────────────────────\n';

        itensFornecedor.forEach(item => {
          texto += `☐ ${item.nome}\n`;
          texto += `  Qtd: ${item.quantidade_sugerida.toFixed(2)} ${item.unidade_medida}\n`;
          if (item.custo_medio > 0) {
            texto += `  Custo unitário: ${formatCurrency(item.custo_medio)}\n`;
            texto += `  Total: ${formatCurrency(item.valor_estimado)}\n`;
          }
          texto += '\n';
        });

        const subtotal = itensFornecedor.reduce((sum, item) => sum + item.valor_estimado, 0);
        texto += `   SUBTOTAL: ${formatCurrency(subtotal)}\n`;
      });

      const totalGeral = itens.reduce((sum, item) => sum + item.valor_estimado, 0);
      texto += '\n═══════════════════════════════════════\n';
      texto += `VALOR TOTAL ESTIMADO: ${formatCurrency(totalGeral)}\n`;
      texto += '═══════════════════════════════════════\n';
    }

    const blob = new Blob([texto], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lista-compras-${tipo}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const itensAtual = tipoLista === 'rua' ? itensRua : itensFornecedor;
  const totalEstimado = itensAtual.reduce((sum, item) => sum + item.valor_estimado, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Lista de Compras</h2>
          <p className="mt-1 text-sm text-white/40">
            Itens com estoque abaixo do mínimo, separados por tipo de compra
          </p>
        </div>
        <button
          onClick={carregarListas}
          disabled={loading}
          className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6B1A26] disabled:opacity-50"
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-white/10">
        <div className="border-b border-white/10">
          <div className="flex">
            <button
              onClick={() => setTipoLista('rua')}
              className={`flex-1 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                tipoLista === 'rua'
                  ? 'border-[#7D1F2C] text-[#7D1F2C] bg-red-500/10'
                  : 'border-transparent text-white/40 hover:text-white/80 hover:bg-white/10/5'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <Store className="w-5 h-5" />
                <span>Compras na Rua</span>
                <span className="ml-2 px-2 py-0.5 bg-white/10 text-white/80 rounded-full text-xs font-semibold">
                  {itensRua.length}
                </span>
              </div>
            </button>

            <button
              onClick={() => setTipoLista('fornecedor')}
              className={`flex-1 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                tipoLista === 'fornecedor'
                  ? 'border-[#7D1F2C] text-[#7D1F2C] bg-red-500/10'
                  : 'border-transparent text-white/40 hover:text-white/80 hover:bg-white/10/5'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <Truck className="w-5 h-5" />
                <span>Pedidos Fornecedores</span>
                <span className="ml-2 px-2 py-0.5 bg-white/10 text-white/80 rounded-full text-xs font-semibold">
                  {itensFornecedor.length}
                </span>
              </div>
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C] mx-auto"></div>
              <p className="mt-4 text-white/40">Carregando itens...</p>
            </div>
          ) : itensAtual.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-white/40">
                {tipoLista === 'rua'
                  ? 'Nenhum item para compra na rua no momento'
                  : 'Nenhum item para pedido de fornecedores no momento'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2">
                    <p className="text-xs text-blue-400 font-medium">Total de Itens</p>
                    <p className="text-2xl font-bold text-blue-300">{itensAtual.length}</p>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2">
                    <p className="text-xs text-green-400 font-medium">Valor Estimado</p>
                    <p className="text-2xl font-bold text-green-300">{formatCurrency(totalEstimado)}</p>
                  </div>
                </div>
                <button
                  onClick={() => exportarParaTexto(tipoLista)}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar Lista</span>
                </button>
              </div>

              {tipoLista === 'rua' ? (
                <ListaComprasRua itens={itensRua} />
              ) : (
                <ListaComprasFornecedor itens={itensFornecedor} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const ListaComprasRua: React.FC<{ itens: ItemCompra[] }> = ({ itens }) => {
  const itensPorCategoria = itens.reduce((acc, item) => {
    if (!acc[item.categoria]) acc[item.categoria] = [];
    acc[item.categoria].push(item);
    return acc;
  }, {} as Record<string, ItemCompra[]>);

  return (
    <div className="space-y-6">
      {Object.entries(itensPorCategoria).map(([categoria, itensCategoria]) => (
        <div key={categoria} className="border border-white/10 rounded-lg overflow-hidden">
          <div className="bg-white/5 px-4 py-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">{categoria}</h3>
          </div>
          <div className="divide-y divide-white/10">
            {itensCategoria.map(item => (
              <div key={item.id} className="p-4 hover:bg-white/10/5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-white">{item.nome}</h4>
                    {item.observacoes && (
                      <p className="mt-1 text-xs text-white/40">{item.observacoes}</p>
                    )}
                    <div className="mt-2 flex items-center space-x-4 text-xs text-white/40">
                      <span>Atual: {item.quantidade_atual?.toFixed(2) || 0} {item.unidade_medida}</span>
                      <span>•</span>
                      <span>Mínimo: {item.estoque_minimo.toFixed(2)} {item.unidade_medida}</span>
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-lg font-bold text-[#7D1F2C]">
                      {item.quantidade_sugerida.toFixed(2)} {item.unidade_medida}
                    </p>
                    {item.valor_estimado > 0 && (
                      <p className="mt-1 text-xs text-white/40">
                        ~{formatCurrency(item.valor_estimado)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const ListaComprasFornecedor: React.FC<{ itens: ItemCompra[] }> = ({ itens }) => {
  const itensPorFornecedor = itens.reduce((acc, item) => {
    const fornecedor = item.fornecedor_nome || 'Sem fornecedor definido';
    if (!acc[fornecedor]) acc[fornecedor] = [];
    acc[fornecedor].push(item);
    return acc;
  }, {} as Record<string, ItemCompra[]>);

  return (
    <div className="space-y-6">
      {Object.entries(itensPorFornecedor).map(([fornecedor, itensFornecedor]) => {
        const itemInfo = itensFornecedor[0];
        const subtotal = itensFornecedor.reduce((sum, item) => sum + item.valor_estimado, 0);

        return (
          <div key={fornecedor} className="border border-white/10 rounded-lg overflow-hidden">
            <div className="bg-blue-500/10 px-4 py-3 border-b border-blue-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{fornecedor}</h3>
                  <div className="mt-1 flex items-center space-x-3 text-xs text-white/50">
                    {itemInfo.fornecedor_telefone && (
                      <span>Tel: {itemInfo.fornecedor_telefone}</span>
                    )}
                    {itemInfo.fornecedor_email && (
                      <span>Email: {itemInfo.fornecedor_email}</span>
                    )}
                  </div>
                </div>
                {subtotal > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-white/50">Subtotal</p>
                    <p className="text-lg font-bold text-blue-300">{formatCurrency(subtotal)}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="divide-y divide-white/10">
              {itensFornecedor.map(item => (
                <div key={item.id} className="p-4 hover:bg-white/10/5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-white">{item.nome}</h4>
                      <p className="mt-1 text-xs text-white/40">{item.categoria}</p>
                      {item.observacoes && (
                        <p className="mt-1 text-xs text-white/40">{item.observacoes}</p>
                      )}
                      <div className="mt-2 flex items-center space-x-4 text-xs text-white/40">
                        <span>Atual: {item.quantidade_atual?.toFixed(2) || 0} {item.unidade_medida}</span>
                        <span>•</span>
                        <span>Mínimo: {item.estoque_minimo.toFixed(2)} {item.unidade_medida}</span>
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-lg font-bold text-[#7D1F2C]">
                        {item.quantidade_sugerida.toFixed(2)} {item.unidade_medida}
                      </p>
                      {item.custo_medio > 0 && (
                        <>
                          <p className="mt-1 text-xs text-white/40">
                            {formatCurrency(item.custo_medio)}/{item.unidade_medida}
                          </p>
                          <p className="mt-1 text-sm font-medium text-white/80">
                            {formatCurrency(item.valor_estimado)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ListaComprasSeparada;
