import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, RefreshCw } from 'lucide-react';
import { Button, IconButton, Input, PageHeader } from '../ui';
import { relatorioDia } from './api';
import { Formatado } from './ConversasAgente';

interface Props { onVoltar: () => void }

/** AAAA-MM-DD somando dias, sem passar por fuso. */
function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const hojeCuiaba = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });

/**
 * O relatório do dia que antes ia no WhatsApp às 07:00: vendas e baixa da Zig,
 * furos, notas, transferências, perdas, caderno de bordo. Abre no de ontem.
 */
const RelatorioDia: React.FC<Props> = ({ onVoltar }) => {
  const [dia, setDia] = useState<string | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = async (d: string | null) => {
    setCarregando(true); setErro(null); setCopiado(false);
    try {
      const r = await relatorioDia(d);
      setDia(r.data); setTexto(r.texto);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(null); }, []);

  const hoje = hojeCuiaba();
  const copiar = async () => {
    if (!texto) return;
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { setErro('Não deu para copiar.'); }
  };

  return (
    <div className="max-w-3xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Relatórios']} title="Relatório do dia"
        subtitle="O mesmo relatório que o agente manda no WhatsApp quando alguém pede. Lançamentos das 07:00 do dia às 07:00 do dia seguinte."
        actions={<IconButton aria-label="Atualizar" onClick={() => void carregar(dia)}><RefreshCw size={16} /></IconButton>} />

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <IconButton aria-label="Dia anterior" disabled={!dia || carregando} onClick={() => dia && void carregar(somarDias(dia, -1))}><ChevronLeft size={16} /></IconButton>
        <Input rotulo="Dia" type="date" value={dia ?? ''} max={hoje} onChange={e => e.target.value && void carregar(e.target.value)} />
        <IconButton aria-label="Dia seguinte" disabled={!dia || dia >= hoje || carregando} onClick={() => dia && void carregar(somarDias(dia, 1))}><ChevronRight size={16} /></IconButton>
        <Button icone={<Copy size={16} />} onClick={() => void copiar()} disabled={!texto}>{copiado ? 'Copiado' : 'Copiar texto'}</Button>
      </div>

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="card p-4" aria-busy={carregando}>
        {texto === null
          ? <p className="t-body" style={{ color: 'var(--text-secondary)', margin: 0 }}>Carregando…</p>
          : <p className="t-body" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: carregando ? 0.5 : 1 }}><Formatado texto={texto} /></p>}
      </div>
    </div>
  );
};

export default RelatorioDia;
