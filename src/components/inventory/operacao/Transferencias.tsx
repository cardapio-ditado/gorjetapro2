import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeftRight, PackageCheck, History } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import TransferirEstoque from './TransferirEstoque';
import RequisicoesLista from './RequisicoesLista';

type Aba = 'nova' | 'pendentes' | 'historico';

interface Props { onVoltar: () => void; }

export default function Transferencias({ onVoltar }: Props) {
  const location = useLocation();
  const [aba, setAba] = useState<Aba>('nova');
  const [qtdPendentes, setQtdPendentes] = useState(0);

  // ?aba=pendentes abre direto na fila
  useEffect(() => {
    const abaParam = new URLSearchParams(location.search).get('aba');
    if (abaParam === 'pendentes' || abaParam === 'historico' || abaParam === 'nova') {
      setAba(abaParam);
    }
  }, [location.search]);

  const carregarPendentes = useCallback(async () => {
    const { count } = await supabase
      .from('requisicoes_internas')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pendente', 'aprovado']);
    setQtdPendentes(count || 0);
  }, []);

  useEffect(() => { carregarPendentes(); }, [carregarPendentes]);

  const abas: { key: Aba; label: string; icon: typeof ArrowLeftRight }[] = [
    { key: 'nova',      label: 'Nova transferência', icon: ArrowLeftRight },
    { key: 'pendentes', label: qtdPendentes > 0 ? `Pendentes (${qtdPendentes})` : 'Pendentes', icon: PackageCheck },
    { key: 'historico', label: 'Histórico', icon: History },
  ];

  return (
    <div className="space-y-5">
      {/* Abas */}
      <div className="grid grid-cols-3 gap-2">
        {abas.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setAba(key); carregarPendentes(); }}
            className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-sm font-semibold border transition-colors ${
              aba === key ? 'bg-wine border-wine text-white' : 'bg-[#12141f] border-white/10 text-white/60'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {aba === 'nova' && (
        <TransferirEstoque
          onVoltar={onVoltar}
          onVerPendentes={() => { carregarPendentes(); setAba('pendentes'); }}
        />
      )}
      {aba === 'pendentes' && (
        <RequisicoesLista modo="pendentes" onMudou={carregarPendentes} />
      )}
      {aba === 'historico' && (
        <RequisicoesLista modo="historico" onMudou={carregarPendentes} />
      )}
    </div>
  );
}
