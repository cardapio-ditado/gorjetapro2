import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  Search,
  Calendar,
  Loader2,
  History,
  Filter,
  Download,
} from 'lucide-react';
import dayjs from 'dayjs';
import type { Contagem, Estoque } from './types';
import * as service from './contagemService';
import { formatCurrency } from '../../../utils/currency';

interface Props {
  onVoltar: () => void;
  onVerContagem: (contagem: Contagem) => void;
}

const ContagemHistorico: React.FC<Props> = ({ onVoltar, onVerContagem }) => {
  const [historico, setHistorico] = useState<Contagem[]>([]);
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroEstoque, setFiltroEstoque] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');

  useEffect(() => {
    service.loadEstoques().then(setEstoques);
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await service.loadHistorico({
        estoqueId: filtroEstoque || undefined,
        responsavel: filtroResponsavel || undefined,
        dataInicio: filtroDataInicio || undefined,
        dataFim: filtroDataFim || undefined,
      });
      setHistorico(data);
    } catch (err) {
      console.error('Erro ao carregar historico:', err);
    } finally {
      setLoading(false);
    }
  };

  const limparFiltros = () => {
    setFiltroEstoque('');
    setFiltroResponsavel('');
    setFiltroDataInicio('');
    setFiltroDataFim('');
  };

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [filtroEstoque, filtroResponsavel, filtroDataInicio, filtroDataFim]);

  const hasFilters = filtroEstoque || filtroResponsavel || filtroDataInicio || filtroDataFim;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onVoltar}
            className="p-2 hover:bg-white/10/10 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white/50" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">Historico de Contagens</h2>
            <p className="text-xs text-white/40">Contagens processadas e finalizadas</p>
          </div>
        </div>
      </div>

      <div className="bg-[#12141f] rounded-2xl border border-white/5 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-white/30" />
          <span className="text-sm font-medium text-white/50">Filtros</span>
          {hasFilters && (
            <button
              onClick={limparFiltros}
              className="text-xs text-blue-400 hover:text-blue-300 ml-auto"
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={filtroEstoque}
            onChange={(e) => setFiltroEstoque(e.target.value)}
            className="px-3 py-2 text-sm border border-white/10 rounded-xl bg-[#1a1d2e] text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os estoques</option>
            {estoques.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={filtroResponsavel}
              onChange={(e) => setFiltroResponsavel(e.target.value)}
              placeholder="Responsavel..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-white/10 rounded-xl bg-[#1a1d2e] text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-white/10 rounded-xl bg-[#1a1d2e] text-white focus:ring-2 focus:ring-blue-500"
              placeholder="Data inicio"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-white/10 rounded-xl bg-[#1a1d2e] text-white focus:ring-2 focus:ring-blue-500"
              placeholder="Data fim"
            />
          </div>
        </div>
      </div>

      <div className="bg-[#12141f] rounded-2xl border border-white/5 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : historico.length === 0 ? (
          <div className="py-16 text-center">
            <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-white/40">
              {hasFilters
                ? 'Nenhuma contagem encontrada com estes filtros'
                : 'Nenhuma contagem processada ainda'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-white/40 uppercase">
                    Data
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-white/40 uppercase">
                    Estoque
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-white/40 uppercase">
                    Responsavel
                  </th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-white/40 uppercase">
                    Itens
                  </th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-white/40 uppercase">
                    Divergencias
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-white/40 uppercase">
                    Valor Ajustes
                  </th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-white/40 uppercase w-16">
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {historico.map((c) => (
                  <tr key={c.id} className="hover:bg-white/10/5/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-white/80">
                      {dayjs(c.processado_em || c.data_contagem).format('DD/MM/YYYY')}
                      <span className="text-white/30 ml-1 text-xs">
                        {dayjs(c.processado_em || c.data_contagem).format('HH:mm')}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-white text-sm">
                      {c.estoque_nome}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50">{c.responsavel}</td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-white">
                      {c.total_itens_contados}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                          c.total_diferencas > 0
                            ? 'bg-orange-500/15 text-orange-400'
                            : 'bg-green-500/15 text-green-400'
                        }`}
                      >
                        {c.total_diferencas}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-white tabular-nums">
                      {formatCurrency(Math.abs(c.valor_total_diferencas))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onVerContagem(c)}
                        className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="Ver detalhes"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContagemHistorico;
