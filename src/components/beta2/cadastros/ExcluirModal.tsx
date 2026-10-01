import React, { useEffect, useState } from 'react';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Modal } from '../../ui';
import { cadastrosApi, type TipoCadastro, type Vinculos } from './api';

interface Props {
  tipo: TipoCadastro;
  id: string | null;
  nome: string;
  arquivado: boolean;
  onFechar: () => void;
  /** Chamado depois de arquivar, restaurar ou excluir, com a frase para mostrar na lista. */
  onFeito: (mensagem: string) => void;
}

const ROTULO: Record<TipoCadastro, string> = { item: 'o item', estoque: 'o estoque', ficha: 'a ficha', fornecedor: 'o fornecedor' };

/**
 * Um só "Excluir" para todo cadastro. Mostra em palavras o que depende do
 * registro e oferece Arquivar (reversível, histórico fica) ou Excluir de vez
 * (só quando nada de histórico depende dele; o que dá para desfazer sozinho,
 * o sistema desfaz e conta).
 */
const ExcluirModal: React.FC<Props> = ({ tipo, id, nome, arquivado, onFechar, onFeito }) => {
  const [dados, setDados] = useState<Vinculos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setDados(null); setErro(null);
    cadastrosApi.vinculos(tipo, id).then(setDados).catch(e => setErro(e instanceof Error ? e.message : 'Erro ao verificar'));
  }, [tipo, id]);

  const agir = async (modo: 'arquivar' | 'restaurar' | 'excluir') => {
    if (!id) return;
    if (modo === 'excluir' && !window.confirm(`Excluir de vez ${ROTULO[tipo]} "${nome}"? Não dá para desfazer.`)) return;
    setOcupado(modo); setErro(null);
    try {
      const r = await cadastrosApi.excluir(tipo, id, modo);
      const extras = r.feito.map(f => `${f.qtd} ${f.rotulo}`).join('; ');
      onFeito(modo === 'arquivar' ? `"${nome}" arquivado. Some das listas, histórico fica.` : modo === 'restaurar' ? `"${nome}" restaurado.` : `"${nome}" excluído de vez.${extras ? ` ${extras}.` : ''}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setOcupado(null);
    }
  };

  const bloqueados = dados?.vinculos.filter(v => v.bloqueia) ?? [];
  const desfeitos = dados?.vinculos.filter(v => !v.bloqueia) ?? [];

  return (
    <Modal aberto={!!id} onFechar={onFechar} titulo={`Excluir ${nome}`} travado={!!ocupado} largura="md"
      rodape={<>
        <Button onClick={onFechar} disabled={!!ocupado}>Cancelar</Button>
        {arquivado
          ? <Button icone={<RotateCcw size={14} />} onClick={() => agir('restaurar')} carregando={ocupado === 'restaurar'}>Restaurar</Button>
          : <Button icone={<Archive size={14} />} onClick={() => agir('arquivar')} carregando={ocupado === 'arquivar'}>Arquivar</Button>}
        <Button variante="perigo" icone={<Trash2 size={14} />} onClick={() => agir('excluir')} carregando={ocupado === 'excluir'} disabled={!dados || !dados.pode_excluir}>Excluir de vez</Button>
      </>}
    >
      {erro && <div className="aviso aviso-perigo" role="alert">{erro}</div>}
      {!dados && !erro && <p className="t-body" style={{ margin: 0, color: 'var(--text-secondary)' }}>Verificando o que depende deste registro…</p>}
      {dados && (
        <>
          {bloqueados.length > 0 && (
            <div className="aviso aviso-atencao">
              <strong>Tem histórico, não dá para excluir de vez.</strong> Arquive: some das listas e buscas, e tudo abaixo continua inteiro.
              <ul className="mt-2 pl-4" style={{ listStyle: 'disc' }}>
                {bloqueados.map(v => <li key={v.rotulo}>{v.qtd} {v.rotulo}{v.detalhe ? ` (${v.detalhe})` : ''}</li>)}
              </ul>
            </div>
          )}
          {desfeitos.length > 0 && (
            <div className="aviso">
              <strong>Ao excluir de vez, o sistema desfaz sozinho:</strong>
              <ul className="mt-2 pl-4" style={{ listStyle: 'disc' }}>
                {desfeitos.map(v => <li key={v.rotulo}>{v.qtd} {v.rotulo}{v.detalhe ? ` (${v.detalhe})` : ''}</li>)}
              </ul>
            </div>
          )}
          {dados.vinculos.length === 0 && <div className="aviso aviso-certo">Nada depende deste registro. Pode excluir de vez ou só arquivar.</div>}
          <p className="t-caption" style={{ margin: 0 }}>Arquivar é reversível. Excluir de vez não é.</p>
        </>
      )}
    </Modal>
  );
};

export default ExcluirModal;
