import { useState, useEffect, useRef } from 'react';
import {
  ShoppingCart, RefreshCw, CheckCircle2, Circle,
  Package, Truck, Store, Filter, ChevronDown, ChevronRight,
  Printer, ClipboardList, Search, X,
  BarChart2, Check, Link, Copy
} from 'lucide-react';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type TipoCompra = 'todos' | 'rua' | 'fornecedor' | 'ambos';
type StatusLista = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada';

interface ItemLista {
  id: string; lista_id: string; item_id: string;
  nome_item: string; categoria: string; unidade_medida: string;
  tipo_compra: TipoCompra;
  fornecedor_nome: string | null; fornecedor_tel: string | null;
  estoque_atual: number; estoque_minimo: number; ponto_reposicao: number;
  quantidade_sugerida: number; quantidade_comprar: number;
  custo_unitario: number; custo_estimado: number;
  comprado: boolean; comprado_em: string | null;
  observacao: string | null; ordem: number;
}

interface Lista {
  id: string; numero: string; titulo: string;
  tipo_compra: TipoCompra; status: StatusLista;
  gerado_por: string; observacoes: string | null;
  total_itens: number; itens_comprados: number;
  valor_estimado: number; criado_em: string; concluido_em: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  rua: 'Compra na Rua', fornecedor: 'Pedido Fornecedor', ambos: 'Ambos', todos: 'Todos',
};
const TIPO_COLOR: Record<string, string> = {
  rua: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  fornecedor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  ambos: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  todos: 'bg-[#12141f]/10 text-white/60 border-white/10',
};
const STATUS_COLOR: Record<StatusLista, string> = {
  aberta: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  em_andamento: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  concluida: 'bg-green-500/10 text-green-400 border-green-500/30',
  cancelada: 'bg-red-500/10 text-red-500 border-red-500/30',
};

function fmt(n: number, dec = 2) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtMoeda(n: number) { return 'R$ ' + fmt(n); }

// ─── Componente de impressão ────────────────────────────────────────────────
function PrintView({ lista, itens }: { lista: Lista; itens: ItemLista[] }) {
  const categorias = [...new Set(itens.map(i => i.categoria))].sort();
  const total = itens.reduce((s, i) => s + i.custo_estimado, 0);
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#111', background: '#fff', padding: '20px' }}>
      <div style={{ borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>📋 LISTA DE COMPRAS</h1>
            <p style={{ margin: '4px 0 0', color: '#555' }}>{lista.numero} — {lista.titulo}</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#555' }}>
            <p style={{ margin: 0 }}>Data: {new Date(lista.criado_em).toLocaleDateString('pt-BR')}</p>
            <p style={{ margin: 0 }}>Total: {lista.total_itens} itens</p>
            <p style={{ margin: 0 }}>Valor est.: {fmtMoeda(lista.valor_estimado)}</p>
          </div>
        </div>
        {lista.observacoes && (
          <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#666', fontStyle: 'italic' }}>Obs: {lista.observacoes}</p>
        )}
      </div>
      {categorias.map(cat => {
        const itensCat = itens.filter(i => i.categoria === cat);
        return (
          <div key={cat} style={{ marginBottom: '16px', pageBreakInside: 'avoid' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px', padding: '4px 8px', background: '#f0f0f0', borderLeft: '3px solid #7D1F2C' }}>
              {cat} ({itensCat.length} {itensCat.length === 1 ? 'item' : 'itens'})
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa', fontSize: '10px', color: '#666' }}>
                  <th style={{ width: '20px', padding: '4px', textAlign: 'center', border: '1px solid #ddd' }}>✓</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #ddd' }}>Item</th>
                  <th style={{ width: '60px', padding: '4px', textAlign: 'center', border: '1px solid #ddd' }}>Tipo</th>
                  <th style={{ width: '70px', padding: '4px', textAlign: 'center', border: '1px solid #ddd' }}>Em estoque</th>
                  <th style={{ width: '55px', padding: '4px', textAlign: 'center', border: '1px solid #ddd' }}>Mínimo</th>
                  <th style={{ width: '80px', padding: '4px', textAlign: 'center', border: '1px solid #ddd' }}>Qtd comprar</th>
                  <th style={{ width: '70px', padding: '4px', textAlign: 'center', border: '1px solid #ddd' }}>Vlr Unit.</th>
                  <th style={{ width: '75px', padding: '4px', textAlign: 'center', border: '1px solid #ddd' }}>Total Est.</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #ddd' }}>Fornecedor</th>
                </tr>
              </thead>
              <tbody>
                {itensCat.map((item, idx) => (
                  <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '6px 4px', textAlign: 'center', border: '1px solid #ddd' }}>
                      <div style={{ width: '14px', height: '14px', border: '1.5px solid #999', borderRadius: '3px', margin: '0 auto' }} />
                    </td>
                    <td style={{ padding: '6px 8px', border: '1px solid #ddd', fontWeight: '500' }}>{item.nome_item}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'center', border: '1px solid #ddd', fontSize: '10px' }}>
                      {item.tipo_compra === 'rua' ? '🛒 Rua' : item.tipo_compra === 'fornecedor' ? '🚚 Forn.' : '🔀'}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center', border: '1px solid #ddd', color: '#e55' }}>
                      {fmt(item.estoque_atual, item.estoque_atual % 1 === 0 ? 0 : 2)} {item.unidade_medida}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center', border: '1px solid #ddd', color: '#888' }}>
                      {fmt(item.estoque_minimo, 0)}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center', border: '1px solid #ddd', fontWeight: 'bold', fontSize: '13px' }}>
                      {fmt(item.quantidade_comprar, item.quantidade_comprar % 1 === 0 ? 0 : 2)} {item.unidade_medida}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center', border: '1px solid #ddd', color: '#555', fontSize: '10px' }}>
                      {item.custo_unitario > 0 ? fmtMoeda(item.custo_unitario) : '—'}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center', border: '1px solid #ddd', color: '#333' }}>
                      {item.custo_estimado > 0 ? fmtMoeda(item.custo_estimado) : '—'}
                    </td>
                    <td style={{ padding: '6px 8px', border: '1px solid #ddd', fontSize: '10px', color: '#555' }}>
                      {item.fornecedor_nome || '—'}
                      {item.fornecedor_tel && <span style={{ display: 'block', color: '#888' }}>{item.fornecedor_tel}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div style={{ borderTop: '2px solid #333', marginTop: '20px', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
        <div>
          <strong>Total:</strong> {itens.length} itens &nbsp;|&nbsp;
          <strong>Valor estimado:</strong> {fmtMoeda(total)}
        </div>
        <div style={{ color: '#888' }}>
          Gerado por: {lista.gerado_por} &nbsp;|&nbsp; {new Date(lista.criado_em).toLocaleString('pt-BR')}
        </div>
      </div>
    </div>
  );
}

interface Sugestao {
  item_id: string; nome: string; categoria: string; unidade_medida: string;
  fornecedor_nome: string | null; ciclo_dias: number;
  consumo_medio_diario: number; demanda_prevista: number;
  saldo_atual: number; em_lista_aberta: number;
  quantidade_sugerida: number; custo_medio: number; custo_estimado: number;
  criterio: string;
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function ListaCompras() {
  const [aba, setAba] = useState<'nova' | 'historico'>('nova');
  const [tipoFiltro, setTipoFiltro] = useState<TipoCompra>('todos');
  const [titulo, setTitulo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erroGerar, setErroGerar] = useState('');
  const [listaAtiva, setListaAtiva] = useState<Lista | null>(null);
  const [itens, setItens] = useState<ItemLista[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [busca, setBusca] = useState('');
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);

  const [listas, setListas] = useState<Lista[]>([]);
  const [carregandoListas, setCarregandoListas] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const headers = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };

  const carregarListas = async () => {
    setCarregandoListas(true);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/listas_compra?select=*&order=criado_em.desc&limit=30`, { headers });
    const d = await r.json();
    if (Array.isArray(d)) setListas(d);
    setCarregandoListas(false);
  };

  const carregarItens = async (listaId: string) => {
    setCarregandoItens(true);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/listas_compra_itens?lista_id=eq.${listaId}&order=categoria,nome_item`, { headers });
    const d = await r.json();
    if (Array.isArray(d)) {
      setItens(d);
      setExpandidas(new Set(d.map((i: ItemLista) => i.categoria)));
    }
    setCarregandoItens(false);
  };

  useEffect(() => { if (aba === 'historico') carregarListas(); }, [aba]);

  useEffect(() => {
    if (aba === 'nova' && !listaAtiva) carregarSugestoes();
  }, [aba, listaAtiva]);

  const carregarSugestoes = async () => {
    setCarregandoSugestoes(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_sugestao_compra`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_ciclo_padrao: 1, p_dias_seguranca: 1, p_dias_historico: 28 }),
      });
      const d = await r.json();
      if (Array.isArray(d)) setSugestoes(d);
    } catch { /* silently fail */ }
    setCarregandoSugestoes(false);
  };

  const gerarLista = async () => {
    setGerando(true); setErroGerar('');
    try {
      // 1. Buscar sugestões via fn_sugestao_compra (baseado em consumo médio diário)
      const rSug = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_sugestao_compra`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_ciclo_padrao: 1, p_dias_seguranca: 1, p_dias_historico: 28 }),
      });
      const sugestoesAll: Sugestao[] = await rSug.json();
      if (!Array.isArray(sugestoesAll)) { setErroGerar('Erro ao calcular sugestões.'); return; }

      // Filtrar por tipo se necessário
      const sugestoesFiltradas = sugestoesAll;
      if (sugestoesFiltradas.length === 0) {
        setErroGerar('✅ Todos os itens estão com estoque suficiente para o período!');
        return;
      }

      const numero = `LC-${Date.now().toString().slice(-6)}`;
      const tituloFinal = titulo || `Lista de Compras – ${new Date().toLocaleDateString('pt-BR')}`;
      const valorTotal = sugestoesFiltradas.reduce((s, i) => s + Number(i.custo_estimado), 0);

      // 2. Criar registro de lista
      const rLista = await fetch(`${SUPABASE_URL}/rest/v1/listas_compra`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          numero,
          titulo: tituloFinal,
          tipo_compra: tipoFiltro,
          status: 'aberta',
          gerado_por: 'Sistema',
          observacoes: observacoes || null,
          total_itens: sugestoesFiltradas.length,
          itens_comprados: 0,
          valor_estimado: valorTotal,
        }),
      });
      const dLista = await rLista.json();
      const lista = Array.isArray(dLista) ? dLista[0] : dLista;
      if (!lista?.id) { setErroGerar('Erro ao criar lista.'); return; }

      // 3. Inserir itens
      const itensParaInserir = sugestoesFiltradas.map(s => ({
        lista_id: lista.id,
        item_id: s.item_id,
        nome_item: s.nome,
        categoria: s.categoria,
        unidade_medida: s.unidade_medida,
        tipo_compra: 'todos',
        fornecedor_nome: s.fornecedor_nome || null,
        fornecedor_tel: null,
        estoque_atual: Number(s.saldo_atual),
        estoque_minimo: 0,
        ponto_reposicao: 0,
        quantidade_sugerida: Number(s.quantidade_sugerida),
        quantidade_comprar: Number(s.quantidade_sugerida),
        custo_unitario: Number(s.custo_medio),
        custo_estimado: Number(s.custo_estimado),
        comprado: false,
        comprado_em: null,
        observacao: s.criterio !== 'historico' ? s.criterio : null,
        ordem: 0,
      }));

      await fetch(`${SUPABASE_URL}/rest/v1/listas_compra_itens`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(itensParaInserir),
      });

      await abrirLista(lista.id);
    } catch (e: any) { setErroGerar(e.message); }
    finally { setGerando(false); }
  };

  const abrirLista = async (id: string) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/listas_compra?id=eq.${id}&select=*`, { headers });
    const d = await r.json();
    if (d[0]) { setListaAtiva(d[0]); await carregarItens(d[0].id); }
  };

  const toggleComprado = async (item: ItemLista) => {
    const novo = !item.comprado;
    setSalvando(item.id);
    setItens(prev => prev.map(i => i.id === item.id ? { ...i, comprado: novo, comprado_em: novo ? new Date().toISOString() : null } : i));
    await fetch(`${SUPABASE_URL}/rest/v1/listas_compra_itens?id=eq.${item.id}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ comprado: novo, comprado_em: novo ? new Date().toISOString() : null }),
    });
    if (listaAtiva) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/listas_compra?id=eq.${listaAtiva.id}&select=*`, { headers });
      const d = await r.json();
      if (d[0]) setListaAtiva(d[0]);
    }
    setSalvando(null);
  };

  const atualizarQtd = async (item: ItemLista, qtd: number) => {
    const novaQtd = Math.max(0, qtd);
    const novoCusto = Number((item.custo_unitario * novaQtd).toFixed(2));
    setItens(prev => prev.map(i => i.id === item.id ? { ...i, quantidade_comprar: novaQtd, custo_estimado: novoCusto } : i));
    await fetch(`${SUPABASE_URL}/rest/v1/listas_compra_itens?id=eq.${item.id}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ quantidade_comprar: novaQtd, custo_estimado: novoCusto }),
    });
  };

  const concluirLista = async () => {
    if (!listaAtiva) return;
    await fetch(`${SUPABASE_URL}/rest/v1/listas_compra?id=eq.${listaAtiva.id}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'concluida', concluido_em: new Date().toISOString() }),
    });
    setListaAtiva(prev => prev ? { ...prev, status: 'concluida' } : null);
  };

  // ─── IMPRESSÃO via iframe oculto (não depende de popup) ─────────────────
  const imprimir = () => {
    if (!listaAtiva || itens.length === 0) return;

    const categorias = [...new Set(itens.map(i => i.categoria))].sort();
    const total = itens.reduce((s, i) => s + i.custo_estimado, 0);
    const loc = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    const linhasTabela = (cat: string) =>
      itens.filter(i => i.categoria === cat).map((item, idx) => `
        <tr style="background:${idx % 2 === 0 ? '#fff' : '#fafafa'}">
          <td style="padding:6px 4px;text-align:center;border:1px solid #ddd">
            <div style="width:14px;height:14px;border:1.5px solid #999;border-radius:3px;margin:0 auto"></div>
          </td>
          <td style="padding:6px 8px;border:1px solid #ddd;font-weight:500">${item.nome_item}</td>
          <td style="padding:6px 4px;text-align:center;border:1px solid #ddd;font-size:10px">
            ${item.tipo_compra === 'rua' ? 'Rua' : item.tipo_compra === 'fornecedor' ? 'Forn.' : 'Ambos'}
          </td>
          <td style="padding:6px 4px;text-align:center;border:1px solid #ddd;color:#cc3333">
            ${item.estoque_atual % 1 === 0 ? item.estoque_atual : item.estoque_atual.toFixed(2)} ${item.unidade_medida}
          </td>
          <td style="padding:6px 4px;text-align:center;border:1px solid #ddd;color:#888">${item.estoque_minimo}</td>
          <td style="padding:6px 4px;text-align:center;border:1px solid #ddd;font-weight:bold;font-size:13px">
            ${item.quantidade_comprar % 1 === 0 ? item.quantidade_comprar : item.quantidade_comprar.toFixed(2)} ${item.unidade_medida}
          </td>
          <td style="padding:6px 4px;text-align:center;border:1px solid #ddd;color:#555;font-size:10px">
            ${item.custo_unitario > 0 ? 'R$ ' + loc(item.custo_unitario) : '-'}
          </td>
          <td style="padding:6px 4px;text-align:center;border:1px solid #ddd">
            ${item.custo_estimado > 0 ? 'R$ ' + loc(item.custo_estimado) : '-'}
          </td>
          <td style="padding:6px 8px;border:1px solid #ddd;font-size:10px;color:#555">
            ${item.fornecedor_nome || '-'}${item.fornecedor_tel ? '<br>' + item.fornecedor_tel : ''}
          </td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Lista ${listaAtiva.numero}</title>
<style>
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 20px; background: #fff; }
h1 { font-size: 18px; font-weight: bold; margin: 0; }
h3 { font-size: 13px; font-weight: bold; margin: 0 0 6px; padding: 4px 8px; background: #f0f0f0; border-left: 3px solid #7D1F2C; }
table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
th { background: #fafafa; font-size: 10px; color: #666; padding: 4px; border: 1px solid #ddd; }
td { border: 1px solid #ddd; }
.header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
.footer { border-top: 2px solid #333; margin-top: 20px; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; }
@media print { @page { margin: 1cm; size: landscape; } body { margin: 0; } }
</style></head><body>
<div class="header">
  <div>
    <h1>LISTA DE COMPRAS</h1>
    <p style="margin:4px 0 0;color:#555">${listaAtiva.numero} - ${listaAtiva.titulo}</p>
  </div>
  <div style="text-align:right;font-size:11px;color:#555">
    <p style="margin:0">Data: ${new Date(listaAtiva.criado_em).toLocaleDateString('pt-BR')}</p>
    <p style="margin:0">Total: ${listaAtiva.total_itens} itens</p>
    <p style="margin:0">Valor est.: R$ ${loc(listaAtiva.valor_estimado)}</p>
  </div>
</div>
${categorias.map(cat => `
<div style="page-break-inside:avoid;margin-bottom:16px">
  <h3>${cat} (${itens.filter(i => i.categoria === cat).length} itens)</h3>
  <table>
    <thead><tr>
      <th style="width:20px">V</th>
      <th style="text-align:left">Item</th>
      <th style="width:55px">Tipo</th>
      <th style="width:75px">Em estoque</th>
      <th style="width:55px">Minimo</th>
      <th style="width:80px">Qtd comprar</th>
      <th style="width:70px">Vlr Unit.</th>
      <th style="width:75px">Total Est.</th>
      <th style="text-align:left">Fornecedor</th>
    </tr></thead>
    <tbody>${linhasTabela(cat)}</tbody>
  </table>
</div>`).join('')}
<div class="footer">
  <div><strong>Total:</strong> ${itens.length} itens &nbsp;|&nbsp; <strong>Valor estimado:</strong> R$ ${loc(total)}</div>
  <div style="color:#888">Gerado por: ${listaAtiva.gerado_por} | ${new Date(listaAtiva.criado_em).toLocaleString('pt-BR')}</div>
</div>
</body></html>`;

    // Cria iframe oculto, injeta o HTML e imprime via iframe
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    // Aguarda carregamento e imprime
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 300);
    };
  };

  const itensFiltrados = busca
    ? itens.filter(i =>
        i.nome_item.toLowerCase().includes(busca.toLowerCase()) ||
        i.categoria.toLowerCase().includes(busca.toLowerCase()) ||
        (i.fornecedor_nome || '').toLowerCase().includes(busca.toLowerCase()))
    : itens;

  const categorias = [...new Set(itensFiltrados.map(i => i.categoria))].sort();
  const totalItens = itens.length;
  const totalComprados = itens.filter(i => i.comprado).length;
  const pct = totalItens > 0 ? Math.round((totalComprados / totalItens) * 100) : 0;
  const valorTotal = itens.reduce((s, i) => s + i.custo_estimado, 0);

  return (
    <div className="h-full flex flex-col bg-[#12141f]/5">
      {/* Header */}
      <div className="bg-[#12141f] border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#7D1F2C] rounded-xl flex items-center justify-center">
              <ShoppingCart size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Lista de Compras</h1>
              <p className="text-sm text-white/40">Geração automática por estoque mínimo</p>
            </div>
          </div>
          <div className="flex gap-2">
            {(['nova', 'historico'] as const).map(a => (
              <button key={a} onClick={() => setAba(a)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${aba === a ? 'bg-[#7D1F2C] text-white border-[#7D1F2C]' : 'bg-[#12141f]/5 text-white/60 border-white/10 hover:bg-[#12141f]/10'}`}>
                {a === 'nova' ? '+ Nova Lista' : '📋 Histórico'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">

        {/* ─── ABA NOVA LISTA (formulário) ─── */}
        {aba === 'nova' && !listaAtiva && (
          <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
            <div className="bg-[#12141f] rounded-2xl border border-white/10 p-6 space-y-5">
              <h2 className="font-semibold text-white/90 flex items-center gap-2">
                <BarChart2 size={16} className="text-[#7D1F2C]" /> Gerar nova lista
              </h2>

              <div>
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-2 block">Tipo de compra</label>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { v: 'todos', label: 'Todos', icon: <Filter size={14}/> },
                    { v: 'rua', label: 'Compra na rua', icon: <Store size={14}/> },
                    { v: 'fornecedor', label: 'Fornecedor', icon: <Truck size={14}/> },
                    { v: 'ambos', label: 'Ambos', icon: <Package size={14}/> },
                  ] as {v: TipoCompra; label: string; icon: any}[]).map(op => (
                    <button key={op.v} onClick={() => setTipoFiltro(op.v)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${tipoFiltro === op.v ? 'bg-[#7D1F2C] text-white border-[#7D1F2C]' : 'bg-[#12141f]/5 text-white/60 border-white/10 hover:bg-[#12141f]/10'}`}>
                      {op.icon}
                      <span className="text-center leading-tight">{op.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1 block">Título (opcional)</label>
                <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
                  placeholder={`Lista ${TIPO_LABEL[tipoFiltro]} - ${new Date().toLocaleDateString('pt-BR')}`}
                  className="w-full bg-[#12141f]/5 border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30" />
              </div>

              <div>
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1 block">Observações (opcional)</label>
                <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2}
                  placeholder="Ex: Priorizar compras no atacado..."
                  className="w-full bg-[#12141f]/5 border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30 resize-none" />
              </div>

              {/* Prévia de sugestões da função de cálculo */}
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-white/5">
                  <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">
                    Prévia — {carregandoSugestoes ? 'carregando...' : `${sugestoes.length} itens sugeridos`}
                  </span>
                  <button onClick={carregarSugestoes} className="text-white/30 hover:text-white/60 transition-colors">
                    <RefreshCw size={13} className={carregandoSugestoes ? 'animate-spin' : ''} />
                  </button>
                </div>
                {sugestoes.length > 0 && (
                  <div className="overflow-x-auto max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0">
                        <tr className="bg-[#0c1018] text-white/40">
                          <th className="px-3 py-2 text-left font-medium">Item</th>
                          <th className="px-3 py-2 text-right font-medium">Cons./dia</th>
                          <th className="px-3 py-2 text-right font-medium">Previsto p/ período</th>
                          <th className="px-3 py-2 text-right font-medium">Ciclo</th>
                          <th className="px-3 py-2 text-right font-medium">Qtd sugerida</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {sugestoes.map(s => {
                          const isFallback = s.criterio === 'fallback_minimo' || s.criterio === 'sem_dados';
                          return (
                            <tr key={s.item_id} className="hover:bg-white/[0.02]">
                              <td className="px-3 py-2">
                                <p className="text-white/80 font-medium truncate max-w-[180px]">{s.nome}</p>
                                {s.fornecedor_nome && <p className="text-white/30 text-[10px]">{s.fornecedor_nome}</p>}
                              </td>
                              <td className="px-3 py-2 text-right text-white/50">
                                {fmt(s.consumo_medio_diario, 2)} {s.unidade_medida}
                              </td>
                              <td className="px-3 py-2 text-right text-white/70 font-medium">
                                {fmt(s.demanda_prevista, 2)} {s.unidade_medida}
                              </td>
                              <td className="px-3 py-2 text-right text-white/50">
                                {s.ciclo_dias === 1 ? 'diário' : `${s.ciclo_dias}d`}
                              </td>
                              <td className="px-3 py-2 text-right text-white font-semibold">
                                {fmt(s.quantidade_sugerida, 2)} {s.unidade_medida}
                              </td>
                              <td className="px-2 py-2">
                                {isFallback && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-white/40 border border-white/10">
                                    {s.criterio === 'sem_dados' ? 'sem dados' : 'mínimo'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {!carregandoSugestoes && sugestoes.length === 0 && (
                  <p className="px-4 py-3 text-xs text-white/30">Nenhum item abaixo do ponto de reposição no momento.</p>
                )}
              </div>

              {erroGerar && (
                <div className={`rounded-xl p-3 text-sm border ${erroGerar.startsWith('✅') ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                  {erroGerar}
                </div>
              )}

              <button onClick={gerarLista} disabled={gerando}
                className="w-full flex items-center justify-center gap-2 bg-[#7D1F2C] hover:bg-[#6a1a25] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
                <ShoppingCart size={18} className={gerando ? 'animate-pulse' : ''} />
                {gerando ? 'Analisando estoque...' : 'Gerar Lista de Compras'}
              </button>
            </div>
          </div>
        )}

        {/* ─── LISTA ATIVA ─── */}
        {aba === 'nova' && listaAtiva && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Barra superior */}
            <div className="border-b border-white/5 px-6 py-3 space-y-2" style={{ background: 'var(--bg-card)' }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setListaAtiva(null); setItens([]); setErroGerar(''); }}
                    className="text-white/30 hover:text-white/80 text-sm">← Nova lista</button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{listaAtiva.numero}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLOR[listaAtiva.status]}`}>{listaAtiva.status.replace('_', ' ')}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${TIPO_COLOR[listaAtiva.tipo_compra]}`}>{TIPO_LABEL[listaAtiva.tipo_compra]}</span>
                    </div>
                    <p className="text-xs text-white/40">{listaAtiva.titulo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right text-xs text-white/40 mr-2">
                    <p className="font-semibold text-white">{totalComprados}/{totalItens} itens</p>
                    <p>{fmtMoeda(valorTotal)} est.</p>
                  </div>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/compras-publica/${listaAtiva.id}`;
                      navigator.clipboard.writeText(url).then(() => alert(`Link copiado!\n${url}`));
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 text-sm font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
                    title="Gerar link externo para o comprador"
                  >
                    <Link size={14}/> Link Externo
                  </button>
                  <button onClick={imprimir}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5 disabled:opacity-50">
                    <Printer size={15}/> Imprimir
                  </button>
                  {listaAtiva.status !== 'concluida' && (
                    <button onClick={concluirLista}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                      <Check size={15}/> Concluir
                    </button>
                  )}
                </div>
              </div>
              {/* Barra de progresso */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-[#12141f]/10 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-semibold text-white/60 min-w-[36px]">{pct}%</span>
              </div>
            </div>

            {/* Busca */}
            <div className="px-6 py-3 bg-[#12141f]/5 border-b border-white/5">
              <div className="relative max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item..."
                  className="w-full pl-9 pr-8 py-2 text-sm border border-white/10 rounded-xl bg-[#12141f] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30" />
                {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X size={14}/></button>}
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {carregandoItens ? (
                <div className="text-center py-16 text-white/30">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
                  <p>Carregando itens...</p>
                </div>
              ) : categorias.length === 0 ? (
                <div className="text-center py-16 text-white/30">
                  <Package size={32} className="mx-auto mb-3 opacity-40" />
                  <p>Nenhum item encontrado</p>
                </div>
              ) : categorias.map(cat => {
                const itensCat = itensFiltrados.filter(i => i.categoria === cat);
                const comprados = itensCat.filter(i => i.comprado).length;
                const isExp = expandidas.has(cat);
                return (
                  <div key={cat} className="bg-[#12141f] rounded-2xl border border-white/10 overflow-hidden">
                    <button onClick={() => setExpandidas(prev => { const s = new Set(prev); if (s.has(cat)) s.delete(cat); else s.add(cat); return s; })}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#12141f]/5 transition-colors">
                      <div className="flex items-center gap-3">
                        {isExp ? <ChevronDown size={16} className="text-white/30"/> : <ChevronRight size={16} className="text-white/30"/>}
                        <span className="font-semibold text-white/90">{cat}</span>
                        <span className="text-xs text-white/30">{itensCat.length} {itensCat.length === 1 ? 'item' : 'itens'}</span>
                      </div>
                      {comprados > 0 && <span className="text-xs text-green-400 font-medium">{comprados}/{itensCat.length} ✓</span>}
                    </button>
                    {isExp && (
                      <div className="divide-y divide-white/5">
                        {itensCat.map(item => (
                          <div key={item.id} className={`flex items-start gap-3 px-5 py-3 transition-colors ${item.comprado ? 'bg-green-500/10' : ''} ${salvando === item.id ? 'opacity-60' : ''}`}>
                            <button onClick={() => toggleComprado(item)} className="mt-0.5 flex-shrink-0">
                              {item.comprado
                                ? <CheckCircle2 size={22} className="text-green-500" />
                                : <Circle size={22} className="text-white/20 hover:text-[#7D1F2C]" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm font-medium ${item.comprado ? 'line-through text-white/30' : 'text-white/90'}`}>{item.nome_item}</p>
                                <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-md border ${TIPO_COLOR[item.tipo_compra] || 'bg-[#12141f]/10 text-white/40 border-white/10'}`}>
                                  {item.tipo_compra === 'rua' ? '🛒 Rua' : item.tipo_compra === 'fornecedor' ? '🚚 Forn.' : '🔀 Ambos'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <span className="text-xs text-red-500">Estoque: <strong>{fmt(item.estoque_atual, item.estoque_atual % 1 === 0 ? 0 : 2)} {item.unidade_medida}</strong></span>
                                <span className="text-xs text-white/30">Mín: {fmt(item.estoque_minimo, 0)}</span>
                                <span className="text-xs text-amber-400">Meta: {fmt(item.estoque_minimo * 1.2, item.estoque_minimo % 1 === 0 ? 0 : 1)}</span>
                                {item.fornecedor_nome && (
                                  <span className="text-xs text-blue-400">📦 {item.fornecedor_nome}{item.fornecedor_tel && ` · ${item.fornecedor_tel}`}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0 flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1">
                                <button onClick={() => atualizarQtd(item, item.quantidade_comprar - 1)} className="w-6 h-6 rounded-lg bg-[#12141f]/10 hover:bg-white/15 text-white/60 text-sm font-bold flex items-center justify-center">−</button>
                                <input type="number" value={item.quantidade_comprar} min={0} step={0.5}
                                  onChange={e => atualizarQtd(item, parseFloat(e.target.value) || 0)}
                                  className="w-16 text-center text-sm font-bold border border-white/10 rounded-lg py-0.5 bg-[#12141f] text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30" />
                                <button onClick={() => atualizarQtd(item, item.quantidade_comprar + 1)} className="w-6 h-6 rounded-lg bg-[#12141f]/10 hover:bg-white/15 text-white/60 text-sm font-bold flex items-center justify-center">+</button>
                                <span className="text-xs text-white/30 ml-1">{item.unidade_medida}</span>
                              </div>
                              {item.custo_estimado > 0 && <span className="text-xs text-white/40">{fmtMoeda(item.custo_estimado)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── HISTÓRICO ─── */}
        {aba === 'historico' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white/90">Listas geradas</h2>
              <button onClick={carregarListas} className="p-2 rounded-xl hover:bg-[#12141f]/10 text-white/40">
                <RefreshCw size={15} className={carregandoListas ? 'animate-spin' : ''} />
              </button>
            </div>
            {carregandoListas ? (
              <div className="text-center py-16 text-white/30"><RefreshCw size={24} className="animate-spin mx-auto mb-3" /></div>
            ) : listas.length === 0 ? (
              <div className="text-center py-16 text-white/30">
                <ClipboardList size={32} className="mx-auto mb-3 opacity-40" />
                <p>Nenhuma lista gerada ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {listas.map(lista => {
                  const pctLista = lista.total_itens > 0 ? Math.round((lista.itens_comprados / lista.total_itens) * 100) : 0;
                  return (
                    <div key={lista.id} className="bg-[#12141f] rounded-2xl border border-white/10 p-4 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-white/90">{lista.numero}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLOR[lista.status]}`}>{lista.status.replace('_', ' ')}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${TIPO_COLOR[lista.tipo_compra]}`}>{TIPO_LABEL[lista.tipo_compra]}</span>
                          </div>
                          <p className="text-sm text-white/60 truncate">{lista.titulo}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
                            <span>{lista.total_itens} itens</span>
                            <span>{fmtMoeda(lista.valor_estimado)} est.</span>
                            <span>{new Date(lista.criado_em).toLocaleDateString('pt-BR')}</span>
                          </div>
                          {lista.total_itens > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 h-1.5 bg-[#12141f]/10 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: `${pctLista}%` }} />
                              </div>
                              <span className="text-xs text-white/40">{lista.itens_comprados}/{lista.total_itens}</span>
                            </div>
                          )}
                        </div>
                        <button onClick={() => { abrirLista(lista.id); setAba('nova'); }}
                          className="flex-shrink-0 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-[#7D1F2C] hover:text-white hover:border-[#7D1F2C] transition-all">
                          Abrir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ref para impressão (não usado mais, mantido por compatibilidade) */}
      <div ref={printRef} style={{ display: 'none' }} />
    </div>
  );
}
