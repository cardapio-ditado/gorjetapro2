// ContagemEstoque.tsx
import React, { useState, useCallback } from 'react';
import type { Contagem, ContagemView } from './types';
import { nomeBloco } from './types';
import * as service from './contagemService';
import ContagemBlocos from './ContagemBlocos';
import ContagemNovaModal from './ContagemNovaModal';
import ContagemContador from './ContagemContador';
import ContagemResultado from './ContagemResultado';
import ContagemHistorico from './ContagemHistorico';
import { useAuth } from '../../../contexts/AuthContext';

const ContagemEstoque: React.FC = () => {
  const { usuario } = useAuth();
  const [view, setView] = useState<ContagemView>('list');
  const [showNovaModal, setShowNovaModal] = useState(false);
  const [contagemId, setContagemId] = useState<string | null>(null);
  const [estoqueName, setEstoqueName] = useState('');
  const [bloco, setBloco] = useState<string | null>(null);

  /** Abre qualquer contagem (por bloco ou completa) no contador. */
  const abrirContagem = useCallback(async (id: string) => {
    setShowNovaModal(false);
    setContagemId(id);
    const data = await service.loadContagemCompleta(id);
    setEstoqueName(data.contagem.estoque_nome);
    setBloco(data.contagem.bloco ?? null);
    setView('counting');
  }, []);

  const verResultado = useCallback(async (id: string) => {
    setContagemId(id);
    const data = await service.loadContagemCompleta(id);
    setEstoqueName(data.contagem.estoque_nome);
    setBloco(data.contagem.bloco ?? null);
    setView('result');
  }, []);

  const handleVerResultado = useCallback((contagem: Contagem) => {
    setContagemId(contagem.id);
    setEstoqueName(contagem.estoque_nome);
    setBloco(contagem.bloco ?? null);
    setView('result');
  }, []);

  const handleFinalizar = useCallback(async () => {
    if (!contagemId) return;
    try {
      if (bloco) {
        // Bloco: finalizar + processar num passo. O ajuste entra na hora.
        if (!confirm(`Concluir o bloco "${nomeBloco(bloco)}"? Os ajustes de estoque entram agora.`)) return;
        const r = await service.concluirBloco(contagemId, usuario?.id);
        if (!r.success) { alert(r.error || 'Erro ao concluir o bloco'); return; }
        setView('result');
        return;
      }
      if (!confirm('Deseja finalizar a contagem? Você poderá reabrir depois se necessário.')) return;
      const result = await service.finalizarContagem(contagemId);
      if (result?.success === false) { alert(result.error || 'Erro ao finalizar'); return; }
      setView('result');
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message || '');
      // A contagem já está gravada; só a finalização falhou.
      alert(/jwt|expired|token/i.test(msg)
        ? 'Sua sessão venceu. Nada foi perdido: a contagem está salva. Entre de novo e clique em Concluir.'
        : 'Erro ao concluir: ' + msg);
    }
  }, [contagemId, bloco, usuario?.id]);

  return (
    <div>
      {view === 'list' && (
        <ContagemBlocos
          onAbrirContagem={abrirContagem}
          onVerResultado={verResultado}
          onHistorico={() => setView('history')}
          onContagemCompleta={() => setShowNovaModal(true)}
        />
      )}

      {view === 'counting' && contagemId && (
        <ContagemContador
          contagemId={contagemId}
          estoqueName={estoqueName}
          bloco={bloco}
          onVoltar={() => setView('list')}
          onFinalizar={handleFinalizar}
        />
      )}

      {view === 'result' && contagemId && (
        <ContagemResultado
          contagemId={contagemId}
          onVoltar={() => setView('list')}
          onReconferir={() => setView('counting')}
          onProcessado={() => setView('list')}
        />
      )}

      {view === 'history' && (
        <ContagemHistorico
          onVoltar={() => setView('list')}
          onVerContagem={handleVerResultado}
        />
      )}

      {showNovaModal && (
        <ContagemNovaModal
          onClose={() => setShowNovaModal(false)}
          onCreated={abrirContagem}
        />
      )}
    </div>
  );
};

export default ContagemEstoque;
