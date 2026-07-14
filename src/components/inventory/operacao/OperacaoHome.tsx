import React, { useEffect, useState } from 'react';
import { Package, ArrowLeftRight, Factory, ClipboardCheck, Clock, FileText, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

interface Props {
  onAcao: (acao: 'receber' | 'transferir' | 'produzir' | 'contar' | 'requisicoes') => void;
}

interface MovRecente {
  id: string;
  tipo_movimentacao: string;
  quantidade: number;
  criado_em: string;
  origem_id: string | null;
  item: { nome: string } | null;
  estoque_origem: { nome: string } | null;
  estoque_destino: { nome: string } | null;
}

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência',
  ajuste_positivo: 'Ajuste +', ajuste_negativo: 'Ajuste -',
  producao: 'Produção', consumo: 'Consumo', perda: 'Perda',
  venda: 'Venda', devolucao: 'Devolução',
};

const TIPO_COLOR: Record<string, string> = {
  entrada: 'text-green-400 bg-green-500/10',
  producao: 'text-green-400 bg-green-500/10',
  devolucao: 'text-green-400 bg-green-500/10',
  ajuste_positivo: 'text-green-400 bg-green-500/10',
  transferencia: 'text-blue-400 bg-blue-500/10',
  saida: 'text-red-400 bg-red-500/10',
  consumo: 'text-red-400 bg-red-500/10',
  perda: 'text-red-400 bg-red-500/10',
  venda: 'text-red-400 bg-red-500/10',
  ajuste_negativo: 'text-red-400 bg-red-500/10',
};

function fmtHora(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function OperacaoHome({ onAcao }: Props) {
  const { usuario } = useAuth();
  const [movs, setMovs] = useState<MovRecente[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendentes, setPendentes] = useState(0);
  // Map origem_id → requisicao info for requester display
  const [reqMap, setReqMap] = useState<Record<string, { funcionario_nome: string; setor: string }>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const hoje = new Date().toISOString().split('T')[0];
      let query = supabase
        .from('movimentacoes_estoque')
        .select('id, tipo_movimentacao, quantidade, criado_em, origem_id, item:itens_estoque(nome), estoque_origem:estoque_origem_id(nome), estoque_destino:estoque_destino_id(nome)')
        .gte('criado_em', hoje + 'T00:00:00')
        .order('criado_em', { ascending: false })
        .limit(5);

      if (usuario?.id) {
        query = (query as any).eq('criado_por', usuario.id);
      }

      const [movsRes, pendentesRes] = await Promise.all([
        query,
        supabase.from('requisicoes_internas').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      ]);

      const movsData = (movsRes.data || []) as unknown as MovRecente[];
      setMovs(movsData);
      setPendentes(pendentesRes.count || 0);

      // Load requester info for movements that have origem_id
      const origemIds = movsData
        .filter(m => m.origem_id)
        .map(m => m.origem_id as string);

      if (origemIds.length > 0) {
        const { data: reqs } = await supabase
          .from('requisicoes_internas')
          .select('id, funcionario_nome, setor')
          .in('id', origemIds);
        if (reqs) {
          const map: Record<string, { funcionario_nome: string; setor: string }> = {};
          reqs.forEach((r: any) => { map[r.id] = { funcionario_nome: r.funcionario_nome, setor: r.setor }; });
          setReqMap(map);
        }
      }

      setLoading(false);
    };
    load();
  }, [usuario?.id]);

  const acoes: { key: Parameters<Props['onAcao']>[0]; label: string; icon: React.ElementType; desc: string; color: string; border: string; iconColor: string }[] = [
    {
      key: 'receber',
      label: 'Receber mercadoria',
      icon: Package,
      desc: 'Conferir e registrar entradas',
      color: 'from-green-600/30 to-green-700/20',
      border: 'border-green-500/30',
      iconColor: 'text-green-400',
    },
    {
      key: 'transferir',
      label: 'Transferir estoque',
      icon: ArrowLeftRight,
      desc: 'Mover itens entre estoques',
      color: 'from-blue-600/30 to-blue-700/20',
      border: 'border-blue-500/30',
      iconColor: 'text-blue-400',
    },
    {
      key: 'produzir',
      label: 'Produzir',
      icon: Factory,
      desc: 'Registrar produção',
      color: 'from-amber-600/30 to-amber-700/20',
      border: 'border-amber-500/30',
      iconColor: 'text-amber-400',
    },
    {
      key: 'contar',
      label: 'Contar',
      icon: ClipboardCheck,
      desc: 'Fazer contagem de estoque',
      color: 'from-purple-600/30 to-purple-700/20',
      border: 'border-purple-500/30',
      iconColor: 'text-purple-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 4 botões + requisições */}
      <div className="grid grid-cols-2 gap-4">
        {acoes.map(({ key, label, icon: Icon, desc, color, border, iconColor }) => (
          <button
            key={key}
            onClick={() => onAcao(key)}
            className={`flex flex-col items-start gap-3 p-5 rounded-2xl bg-gradient-to-br ${color} border ${border} hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 text-left min-h-[140px]`}
          >
            <div className="p-3 rounded-xl bg-white/5">
              <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">{label}</p>
              <p className="text-white/40 text-xs mt-0.5">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Requisições pendentes */}
      <button
        onClick={() => onAcao('requisicoes')}
        className="flex items-center justify-between w-full px-5 py-4 bg-[#12141f] border border-white/[0.07] rounded-2xl hover:border-white/20 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/5">
            <FileText className="w-5 h-5 text-white/50" />
          </div>
          <div className="text-left">
            <p className="text-white font-semibold text-sm">Requisições internas</p>
            <p className="text-white/30 text-xs mt-0.5">Gerenciar requisições de transferência</p>
          </div>
        </div>
        {pendentes > 0 && (
          <span className="flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30">
            {pendentes}
          </span>
        )}
      </button>

      {/* Últimas ações */}
      <div className="bg-[#12141f] border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.07]">
          <Clock className="w-4 h-4 text-white/30" />
          <p className="text-sm font-semibold text-white/60">Minhas ações de hoje</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
          </div>
        ) : movs.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-8">Nenhuma ação registrada hoje.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {movs.map((m) => {
              const cor = TIPO_COLOR[m.tipo_movimentacao] || 'text-white/60 bg-white/5';
              const [textCor, bgCor] = cor.split(' ');
              const estoque = m.estoque_origem?.nome || m.estoque_destino?.nome || '—';
              const req = m.origem_id ? reqMap[m.origem_id] : null;
              return (
                <div key={m.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0 ${bgCor} ${textCor}`}>
                      {TIPO_LABEL[m.tipo_movimentacao] || m.tipo_movimentacao}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{m.item?.nome || '—'}</p>
                      <p className="text-xs text-white/30 truncate">{estoque}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-white/70">
                        {m.tipo_movimentacao === 'transferencia' ? '↔' : m.tipo_movimentacao === 'entrada' ? '+' : '−'}
                        {Number(m.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                      </p>
                      <p className="text-[10px] text-white/25">{fmtHora(m.criado_em)}</p>
                    </div>
                  </div>
                  {req && (
                    <p className="text-[11px] text-blue-400/60 mt-1 ml-[52px] truncate">
                      Req. por {req.funcionario_nome} · {req.setor}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
