// ContagemResultado.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  ArrowLeft, CheckCircle, AlertTriangle, TrendingUp, TrendingDown,
  Calculator, RefreshCw, Download, Printer, Loader2, Package, Minus,
} from 'lucide-react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import type { ContagemResultado as ResultadoType, ContagemItem } from './types';
import * as service from './contagemService';
import { formatCurrency } from '../../../utils/currency';
import { useAuth } from '../../../contexts/AuthContext';

interface Props {
  contagemId: string;
  onVoltar: () => void;
  onReconferir: () => void;
  onProcessado: () => void;
}

type ResultFilter = 'todos' | 'divergentes' | 'sobras' | 'perdas' | 'ok';

const ContagemResultado: React.FC<Props> = ({ contagemId, onVoltar, onReconferir, onProcessado }) => {
  const { usuario } = useAuth();
  const [resultado, setResultado] = useState<ResultadoType | null>(null);
  const [loading, setLoading]     = useState(true);
  const [processando, setProcessando] = useState(false);
  const [filter, setFilter]       = useState<ResultFilter>('divergentes');

  useEffect(() => { load(); }, [contagemId]);

  const load = async () => {
    setLoading(true);
    try { setResultado(await service.loadContagemCompleta(contagemId)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleProcessar = async () => {
    if (!confirm('Deseja processar os ajustes? Será criada uma movimentação para cada diferença encontrada.')) return;
    setProcessando(true);
    try {
      const result = await service.processarContagem(contagemId, usuario?.id);
      if (result?.success === false) { alert(result.error || 'Erro ao processar'); return; }
      alert(`Ajustes processados! ${result?.total_ajustes || 0} movimentações criadas.`);
      onProcessado();
    } catch (err: any) {
      alert('Erro ao processar: ' + err.message);
    } finally { setProcessando(false); }
  };

  const handleReconferir = async () => {
    if (!confirm('Deseja reabrir esta contagem para reconferência?')) return;
    try {
      const result = await service.reabrirContagem(contagemId);
      if (result?.success === false) { alert(result.error || 'Erro ao reabrir'); return; }
      onReconferir();
    } catch (err: any) { alert('Erro ao reabrir: ' + err.message); }
  };

  const exportarXLSX = () => {
    if (!resultado) return;
    const rows = resultado.itens
      .filter(i => i.quantidade_contada !== null)
      .map(item => ({
        Código:          item.item_codigo,
        Item:            item.item_nome,
        Unidade:         item.unidade_medida,
        'Qtd. Sistema':  item.quantidade_sistema,
        'Qtd. Contada':  item.quantidade_contada,
        'Diferença':     item.diferenca,
        'Valor Unit.':   item.valor_unitario,
        'Valor Dif.':    item.valor_diferenca,
        Observação:      item.observacao || '',
      }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Resultado');
    XLSX.writeFile(wb, `contagem_${resultado.contagem.estoque_nome}_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const imprimirResultado = () => {
    if (!resultado || !stats) return;
    const contados = resultado.itens.filter(i => i.quantidade_contada !== null);
    const divergentes = contados.filter(i => i.diferenca !== null && i.diferenca !== 0);

    const linhas = divergentes.map(item => `
      <tr>
        <td>${item.item_codigo}</td>
        <td>${item.item_nome}</td>
        <td>${item.unidade_medida}</td>
        <td style="text-align:center">${item.quantidade_sistema}</td>
        <td style="text-align:center;font-weight:bold">${item.quantidade_contada}</td>
        <td style="text-align:center;color:${item.diferenca! > 0 ? 'green' : 'red'}">${item.diferenca! > 0 ? '+' : ''}${item.diferenca}</td>
        <td style="text-align:right">${formatCurrency(item.valor_unitario)}</td>
        <td style="text-align:right;color:${item.valor_diferenca! > 0 ? 'green' : 'red'}">${item.valor_diferenca! > 0 ? '+' : ''}${formatCurrency(item.valor_diferenca || 0)}</td>
        <td>${item.observacao || ''}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Contagem</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:16px}h2{font-size:13px;margin-top:16px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}
    th{background:#f5f5f5;font-size:10px}@media print{@page{margin:1cm;size:landscape}}</style></head><body>
    <h1>Resultado de Contagem — ${resultado.contagem.estoque_nome}</h1>
    <p>Responsável: ${resultado.contagem.responsavel} · ${dayjs(resultado.contagem.data_contagem).format('DD/MM/YYYY HH:mm')}</p>
    <p>Itens contados: <b>${stats.contados}</b> · Divergências: <b>${stats.comDiferenca}</b> · 
    Sobras: <b>${formatCurrency(stats.valorSobras)}</b> · Perdas: <b>${formatCurrency(stats.valorPerdas)}</b></p>
    <h2>Itens com Divergência (${divergentes.length})</h2>
    <table><thead><tr><th>Código</th><th>Item</th><th>Un.</th><th>Sistema</th><th>Contado</th>
    <th>Dif.</th><th>Val. Unit.</th><th>Val. Dif.</th><th>Obs.</th></tr></thead>
    <tbody>${linhas}</tbody></table>
    </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open(); doc.write(html); doc.close();
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 300);
    };
  };

  const stats = useMemo(() => {
    if (!resultado) return null;
    const contados   = resultado.itens.filter(i => i.quantidade_contada !== null);
    const comDif     = contados.filter(i => i.diferenca !== null && i.diferenca !== 0);
    const sobras     = comDif.filter(i => i.diferenca! > 0);
    const perdas     = comDif.filter(i => i.diferenca! < 0);
    const ok         = contados.filter(i => i.diferenca === 0);
    return {
      contados:     contados.length,
      comDiferenca: comDif.length,
      ok:           ok.length,
      sobras:       sobras.length,
      perdas:       perdas.length,
      valorSobras:  sobras.reduce((s, i) => s + (i.valor_diferenca || 0), 0),
      valorPerdas:  Math.abs(perdas.reduce((s, i) => s + (i.valor_diferenca || 0), 0)),
      valorLiquido: contados.reduce((s, i) => s + (i.valor_diferenca || 0), 0),
    };
  }, [resultado]);

  const filteredItens = useMemo(() => {
    if (!resultado) return [];
    const contados = resultado.itens.filter(i => i.quantidade_contada !== null);
    switch (filter) {
      case 'divergentes': return contados.filter(i => i.diferenca !== null && i.diferenca !== 0);
      case 'sobras':      return contados.filter(i => i.diferenca !== null && i.diferenca > 0);
      case 'perdas':      return contados.filter(i => i.diferenca !== null && i.diferenca < 0);
      case 'ok':          return contados.filter(i => i.diferenca === 0);
      default:            return contados;
    }
  }, [resultado, filter]);

  if (loading || !resultado || !stats) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-white/30" />
    </div>
  );

  const isProcessada = resultado.contagem.status === 'processada';
  const acuracia = stats.contados > 0 ? ((stats.ok / stats.contados) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onVoltar} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-white/50" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">Resultado da Contagem</h2>
            <p className="text-xs text-white/40">
              {resultado.contagem.estoque_nome} · {resultado.contagem.responsavel} · {dayjs(resultado.contagem.data_contagem).format('DD/MM/YYYY HH:mm')}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={imprimirResultado}
            className="px-4 py-2 bg-white/5 border border-white/10 text-white/80 rounded-xl text-sm font-medium hover:bg-white/10 flex items-center gap-2 shadow-sm">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
          <button onClick={exportarXLSX}
            className="px-4 py-2 bg-white/5 border border-white/10 text-white/80 rounded-xl text-sm font-medium hover:bg-white/10 flex items-center gap-2 shadow-sm">
            <Download className="w-4 h-4" /> Exportar XLSX
          </button>
          {!isProcessada && (
            <>
              <button onClick={handleReconferir}
                className="px-4 py-2 bg-white border border-orange-500/30 text-orange-400 rounded-xl text-sm font-medium hover:bg-orange-500/10 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Reconferir
              </button>
              <button onClick={handleProcessar} disabled={processando || stats.comDiferenca === 0}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
                {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Processar Ajustes
              </button>
            </>
          )}
          {isProcessada && (
            <span className="px-4 py-2 bg-green-500/15 text-green-400 rounded-xl text-sm font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Processada em {dayjs(resultado.contagem.processado_em).format('DD/MM/YYYY HH:mm')}
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Contados',     value: String(stats.contados),           color: 'blue',   icon: <Package className="w-4 h-4" /> },
          { label: 'Acurácia',     value: `${acuracia}%`,                   color: 'green',  icon: <CheckCircle className="w-4 h-4" /> },
          { label: 'Divergências', value: String(stats.comDiferenca),       color: 'orange', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Sobras',       value: formatCurrency(stats.valorSobras), color: 'green', icon: <TrendingUp className="w-4 h-4" />, sub: `${stats.sobras} itens` },
          { label: 'Perdas',       value: formatCurrency(stats.valorPerdas), color: 'red',   icon: <TrendingDown className="w-4 h-4" />, sub: `${stats.perdas} itens` },
          { label: 'Impacto',      value: formatCurrency(Math.abs(stats.valorLiquido)), color: stats.valorLiquido >= 0 ? 'green' : 'red', icon: <Calculator className="w-4 h-4" />, sub: stats.valorLiquido >= 0 ? 'Positivo' : 'Negativo' },
        ].map(k => (
          <div key={k.label} className="bg-[#12141f] rounded-xl border border-white/5 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-white/40 uppercase">{k.label}</span>
              <span className={k.color === 'red' ? 'text-red-400' : k.color === 'green' ? 'text-green-400' : k.color === 'orange' ? 'text-orange-400' : 'text-blue-400'}>{k.icon}</span>
            </div>
            <p className={`text-lg font-bold ${k.color === 'red' ? 'text-red-400' : k.color === 'green' ? 'text-green-400' : k.color === 'orange' ? 'text-orange-400' : 'text-white'}`}>{k.value}</p>
            {k.sub && <p className="text-[10px] text-white/30 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-[#12141f] rounded-2xl border border-white/5 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex flex-wrap gap-1">
          {[
            { value: 'divergentes' as ResultFilter, label: 'Divergentes', count: stats.comDiferenca },
            { value: 'perdas'      as ResultFilter, label: 'Perdas',       count: stats.perdas },
            { value: 'sobras'      as ResultFilter, label: 'Sobras',       count: stats.sobras },
            { value: 'ok'          as ResultFilter, label: 'OK',           count: stats.ok },
            { value: 'todos'       as ResultFilter, label: 'Todos',        count: stats.contados },
          ].map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'
              }`}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                {['Item', 'Sistema', 'Contado', 'Diferença', 'Val. Unit.', 'Val. Dif.', 'Obs.'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-white/40 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredItens.map(item => (
                <tr key={item.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-white text-sm">{item.item_nome}</div>
                    <div className="text-[11px] text-white/30">{item.item_codigo}</div>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-white/80 tabular-nums">{item.quantidade_sistema} {item.unidade_medida}</td>
                  <td className="px-4 py-2.5 text-sm font-semibold text-white tabular-nums">{item.quantidade_contada} {item.unidade_medida}</td>
                  <td className="px-4 py-2.5">
                    {item.diferenca !== null && item.diferenca !== 0 ? (
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${
                        item.diferenca > 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {item.diferenca > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {item.diferenca > 0 ? '+' : ''}{item.diferenca}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-medium bg-white/10 text-white/40">
                        <Minus className="w-3 h-3" /> OK
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-white/40 tabular-nums">{formatCurrency(item.valor_unitario)}</td>
                  <td className="px-4 py-2.5">
                    {item.valor_diferenca !== null && item.valor_diferenca !== 0 && (
                      <span className={`text-xs font-bold tabular-nums ${item.valor_diferenca > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {item.valor_diferenca > 0 ? '+' : ''}{formatCurrency(item.valor_diferenca)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-white/40 max-w-[200px] truncate">{item.observacao || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredItens.length === 0 && (
          <div className="py-12 text-center">
            <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-white/40">Nenhum item neste filtro</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContagemResultado;