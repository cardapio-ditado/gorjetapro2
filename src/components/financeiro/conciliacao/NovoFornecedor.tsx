import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Button, Combobox, Input, Modal, Segmented } from '../../ui';
import type { Categoria, Fornecedor } from './lancar';

type Tipo = 'geral' | 'rh' | 'musico' | 'extra';
interface Parecido { id: string; nome: string; cnpj: string | null; motivo: string; score: number }

interface Props {
  aberto: boolean;
  /** Nome digitado na busca (ou o nome de quem recebeu o Pix). */
  nomeInicial: string;
  /** CPF/CNPJ só com dígitos, vindo do extrato. */
  documento: string | null;
  categorias: Categoria[];
  onFechar: () => void;
  onCriado: (f: Fornecedor) => void;
}

const formatarDoc = (d: string | null) => {
  if (!d) return '';
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
};

/** Cadastro rápido de fornecedor sem sair da conciliação: nome e documento já vêm do extrato. */
export default function NovoFornecedor({ aberto, nomeInicial, documento, categorias, onFechar, onCriado }: Props) {
  const [nome, setNome] = useState(nomeInicial);
  const [doc, setDoc] = useState(formatarDoc(documento));
  const [tipo, setTipo] = useState<Tipo>(documento?.length === 11 ? 'rh' : 'geral');
  const [categoriaId, setCategoriaId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** cadastros com nome parecido: confirma antes de criar outro */
  const [parecidos, setParecidos] = useState<Parecido[] | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setNome(nomeInicial); setDoc(formatarDoc(documento)); setTipo(documento?.length === 11 ? 'rh' : 'geral');
    setCategoriaId(''); setErro(null); setParecidos(null);
  }, [aberto, nomeInicial, documento]);

  const usar = async (id: string) => {
    const { data: f } = await supabase.from('fornecedores').select('id, nome, categoria_padrao_id').eq('id', id).single();
    if (f) onCriado(f as Fornecedor);
  };

  const salvar = async () => {
    if (nome.trim().length < 2) { setErro('Escreva o nome.'); return; }
    setSalvando(true); setErro(null);
    try {
      // mesmo documento, ou mesmo nome sem acento/Ltda: usa o que existe em vez de duplicar
      const { data: igual } = await supabase.rpc('fn_fornecedor_encontrar', { p_nome: nome.trim(), p_cnpj: doc.trim() || null });
      if (igual) { await usar(igual as string); return; }
      // parecido (ASSAI × ASSAI ATACADISTA): mostra antes de criar outro
      if (!parecidos) {
        const { data: ps } = await supabase.rpc('fn_fornecedor_parecidos', { p_nome: nome.trim(), p_cnpj: doc.trim() || null });
        if (ps && (ps as Parecido[]).length) { setParecidos(ps as Parecido[]); return; }
      }
      const { data, error } = await supabase.from('fornecedores').insert({
        nome: nome.trim(), cnpj: doc.trim() || null, tipo, status: 'ativo', categoria_padrao_id: categoriaId || null,
        observacoes: 'Cadastrado na conciliação bancária',
      }).select('id, nome, categoria_padrao_id').single();
      if (error) throw error;
      onCriado(data as Fornecedor);
    } catch (e: any) {
      setErro(e.message || 'Não consegui cadastrar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Novo fornecedor" descricao="Fica cadastrado e já escolhido para este pagamento." largura="sm"
      rodape={(
        <>
          <Button variante="discreto" onClick={onFechar}>Cancelar</Button>
          <Button variante="primario" carregando={salvando} onClick={salvar}>{parecidos ? 'Cadastrar mesmo assim' : 'Cadastrar'}</Button>
        </>
      )}>
      <div className="flex flex-col gap-3">
        <Input rotulo="Nome" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
        <Input rotulo="CPF ou CNPJ" value={doc} onChange={e => setDoc(e.target.value)} dica="Veio do extrato. Serve para reconhecer os próximos pagamentos." />
        <Segmented rotulo="Tipo" valor={tipo} onMudar={v => setTipo(v)}
          opcoes={[{ valor: 'geral', rotulo: 'Fornecedor' }, { valor: 'rh', rotulo: 'Colaborador' }, { valor: 'musico', rotulo: 'Músico' }, { valor: 'extra', rotulo: 'Extra' }]} />
        <Combobox rotulo="Categoria padrão" valor={categoriaId} onEscolher={setCategoriaId}
          opcoes={categorias.map(c => ({ id: c.id, nome: c.nome }))} placeholder="Ex.: Pessoal, Bebidas…" />
        {parecidos && (
          <div className="aviso aviso-atencao flex flex-col gap-2" role="alert">
            <span>Já tem fornecedor com nome parecido. É algum destes?</span>
            {parecidos.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate"><strong>{p.nome}</strong> · {p.motivo}</span>
                <Button tamanho="sm" onClick={() => usar(p.id)}>Usar este</Button>
              </div>
            ))}
            <span className="t-caption">Se não for nenhum, clique em <strong>Cadastrar mesmo assim</strong>.</span>
          </div>
        )}
        {erro && <p className="aviso aviso-perigo" role="alert">{erro}</p>}
      </div>
    </Modal>
  );
}
