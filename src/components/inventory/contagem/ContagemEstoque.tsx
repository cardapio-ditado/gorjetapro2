// ContagemEstoque.tsx
import React, { useState, useCallback } from 'react';
import type { Contagem, ContagemView } from './types';
import * as service from './contagemService';
import ContagemListView from './ContagemListView';
import ContagemNovaModal from './ContagemNovaModal';
import ContagemContador from './ContagemContador';
import ContagemResultado from './ContagemResultado';
import ContagemHistorico from './ContagemHistorico';

const ContagemEstoque: React.FC = () => {
  const [view, setView] = useState<ContagemView>('list');
  const [showNovaModal, setShowNovaModal] = useState(false);
  const [contagemId, setContagemId] = useState<string | null>(null);
  const [estoqueName, setEstoqueName] = useState('');

  const handleNovaContagem = useCallback(() => setShowNovaModal(true), []);

  const handleContagemCreated = useCallback(async (id: string) => {
    setShowNovaModal(false);
    setContagemId(id);
    const data = await service.loadContagemCompleta(id);
    setEstoqueName(data.contagem.estoque_nome);
    setView('counting');
  }, []);

  const handleContinuar = useCallback((contagem: Contagem) => {
    setContagemId(contagem.id);
    setEstoqueName(contagem.estoque_nome);
    setView('counting');
  }, []);

  const handleVerResultado = useCallback((contagem: Contagem) => {
    setContagemId(contagem.id);
    setEstoqueName(contagem.estoque_nome);
    setView('result');
  }, []);

  const handleFinalizar = useCallback(async () => {
    if (!contagemId) return;
    if (!confirm('Deseja finalizar a contagem? Você poderá reabrir depois se necessário.')) return;
    try {
      const result = await service.finalizarContagem(contagemId);
      if (result?.success === false) { alert(result.error || 'Erro ao finalizar'); return; }
      setView('result');
    } catch (err: any) {
      alert('Erro ao finalizar: ' + err.message);
    }
  }, [contagemId]);

  return (
    <div>
      {view === 'list' && (
        <ContagemListView
          onNovaContagem={handleNovaContagem}
          onContinuarContagem={handleContinuar}
          onVerResultado={handleVerResultado}
          onHistorico={() => setView('history')}
        />
      )}

      {view === 'counting' && contagemId && (
        <ContagemContador
          contagemId={contagemId}
          estoqueName={estoqueName}
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
          onCreated={handleContagemCreated}
        />
      )}
    </div>
  );
};

export default ContagemEstoque;