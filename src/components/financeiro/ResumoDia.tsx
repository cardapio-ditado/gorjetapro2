import React, { useState, useEffect } from 'react';
import {
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface ExtratoDia {
  data: string;
  saldo_anterior: number;
  total_entradas: number;
  total_saidas: number;
  saldo_final: number;
  qtd_entradas: number;
  qtd_saidas: number;
}

const ResumoDia: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [resumo, setResumo] = useState<ExtratoDia | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResumoDia();
  }, [selectedDate]);

  const fetchResumoDia = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('vw_extrato_consolidado')
        .select('*')
        .eq('data', selectedDate)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setResumo({
            data: selectedDate,
            saldo_anterior: 0,
            total_entradas: 0,
            total_saidas: 0,
            saldo_final: 0,
            qtd_entradas: 0,
            qtd_saidas: 0
          });
        } else {
          throw error;
        }
      } else {
        setResumo(data);
      }
    } catch (err) {
      console.error('Error fetching resumo:', err);
      setResumo({
        data: selectedDate,
        saldo_anterior: 0,
        total_entradas: 0,
        total_saidas: 0,
        saldo_final: 0,
        qtd_entradas: 0,
        qtd_saidas: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Resumo do Dia</h2>
      </div>

      {/* Seletor de Data */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <label className="block text-sm font-medium text-white/80 mb-2">
          Selecione a Data
        </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-4 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
        />
      </div>

      {/* Cards de Resumo */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : resumo ? (
        <>
          {/* Card de Saldo Anterior */}
          <div className="bg-[#12141f] p-6 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/60 mb-1">Saldo Anterior</p>
                <p className={`text-3xl font-bold ${resumo.saldo_anterior >= 0 ? 'text-white/60' : 'text-red-400'}`}>
                  {formatCurrency(resumo.saldo_anterior)}
                </p>
                <p className="text-xs text-white/40 mt-1">
                  Acumulado até {dayjs(selectedDate).subtract(1, 'day').format('DD/MM/YYYY')}
                </p>
              </div>
              <div className="w-14 h-14 bg-white/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-7 h-7 text-white/60" />
              </div>
            </div>
          </div>

          {/* Cards de Movimentação do Dia */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Entradas do Dia</p>
                  <p className="text-2xl font-bold text-green-400">
                    {formatCurrency(resumo.total_entradas)}
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    {resumo.qtd_entradas} lançamento(s)
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-500/15 rounded-lg flex items-center justify-center">
                  <ArrowUpRight className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </div>

            <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Saídas do Dia</p>
                  <p className="text-2xl font-bold text-red-400">
                    {formatCurrency(resumo.total_saidas)}
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    {resumo.qtd_saidas} lançamento(s)
                  </p>
                </div>
                <div className="w-12 h-12 bg-red-500/15 rounded-lg flex items-center justify-center">
                  <ArrowDownRight className="w-6 h-6 text-red-400" />
                </div>
              </div>
            </div>

            <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Resultado do Dia</p>
                  <p className={`text-2xl font-bold ${(resumo.total_entradas - resumo.total_saidas) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(resumo.total_entradas - resumo.total_saidas)}
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    Variação diária
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  (resumo.total_entradas - resumo.total_saidas) >= 0 ? 'bg-green-500/15' : 'bg-red-500/15'
                }`}>
                  <DollarSign className={`w-6 h-6 ${(resumo.total_entradas - resumo.total_saidas) >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Card de Saldo Final */}
          <div className="bg-[#12141f] p-6 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/60 mb-1">Saldo Final do Dia</p>
                <p className={`text-3xl font-bold ${resumo.saldo_final >= 0 ? 'text-white' : 'text-red-400'}`}>
                  {formatCurrency(resumo.saldo_final)}
                </p>
                <p className="text-xs text-white/40 mt-1">
                  Acumulado até {dayjs(selectedDate).format('DD/MM/YYYY')}
                </p>
              </div>
              <div className="w-14 h-14 bg-white/10 rounded-lg flex items-center justify-center">
                <DollarSign className="w-7 h-7 text-[#D4AF37]" />
              </div>
            </div>
          </div>

          {/* Explicação da Conta */}
          <div className="bg-white/5 p-4 rounded-lg border border-gray-500/40">
            <h3 className="text-sm font-semibold text-white/90 mb-2">Como é calculado:</h3>
            <div className="space-y-1 text-sm text-white/80">
              <div className="flex justify-between items-center">
                <span>Saldo Anterior:</span>
                <span className="font-mono">{formatCurrency(resumo.saldo_anterior)}</span>
              </div>
              <div className="flex justify-between items-center text-green-400">
                <span>+ Entradas do Dia:</span>
                <span className="font-mono">+ {formatCurrency(resumo.total_entradas)}</span>
              </div>
              <div className="flex justify-between items-center text-red-400">
                <span>- Saídas do Dia:</span>
                <span className="font-mono">- {formatCurrency(resumo.total_saidas)}</span>
              </div>
              <div className="border-t border-white/20 pt-2 mt-2 flex justify-between items-center font-semibold">
                <span>= Saldo Final:</span>
                <span className={`font-mono ${resumo.saldo_final >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(resumo.saldo_final)}
                </span>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* Informação Adicional */}
      <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
        <p className="text-sm text-blue-300">
          <strong>Dica:</strong> Este é um resumo rápido do dia selecionado. Para ver o extrato completo com saldos acumulados,
          acesse a aba "Extrato Diário".
        </p>
      </div>
    </div>
  );
};

export default ResumoDia;
