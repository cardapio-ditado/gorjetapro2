import React, { useState, useEffect, useCallback } from "react";
import {
  Users, AlertTriangle, Umbrella, Star, Brain, UserPlus,
  Download, RefreshCw, ChevronDown, ChevronRight, Calendar,
  TrendingUp, FileText, Search,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtData = (d: string | null) =>
  d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : "—";
const fmtMes = (d: string | null) =>
  d ? new Date(d + "T12:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—";
const fmtR = (v: number | null) =>
  v != null ? `R$ ${Number(v).toFixed(2).replace(".", ",")}` : "—";

// ─── Badge helpers ─────────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
  ativo:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  inativo:    "bg-white/10 text-white/60 border-white/20",
  afastado:   "bg-orange-500/15 text-orange-400 border-orange-500/30",
  aprovado:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  pendente:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  rejeitado:  "bg-red-500/15 text-red-400 border-red-500/30",
  cancelado:  "bg-white/10 text-white/60 border-white/20",
  pago:       "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  a_pagar:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
};
const StatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${statusColors[status] ?? "bg-white/10 text-white/60 border-white/20"}`}>
    {status.replace(/_/g, " ")}
  </span>
);

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Aba = "colaboradores" | "ocorrencias" | "ferias" | "avaliacoes" | "disc" | "extras";

interface Colaborador {
  id: string; nome_completo: string; status: string; tipo_vinculo: string;
  data_admissao: string | null; data_demissao: string | null;
  funcao_personalizada: string | null; salario_fixo: number | null;
  telefone: string | null; email: string | null;
}
interface Ocorrencia {
  id: string; colaborador_nome: string; data_ocorrencia: string;
  tipo_ocorrencia: string; descricao: string; status: string;
  valor_vale: number | null; dias_afastamento: number | null; impacta_folha: boolean;
}
interface Ferias {
  id: string; colaborador_nome: string; data_inicio: string; data_fim: string;
  dias_corridos: number | null; status: string; observacoes: string | null;
}
interface Avaliacao {
  id: string; colaborador_nome: string; data_avaliacao: string; tipo: string;
  avaliador_nome: string | null; nota_geral: number | null; resultado: string | null;
  status: string;
}
interface DiscResult {
  id: string; colaborador_nome: string; data_aplicacao: string;
  perfil_dominante: string; perfil_secundario: string;
  score_d: number; score_i: number; score_s: number; score_c: number;
}
interface Extra {
  id: string; nome: string; funcao_temporaria: string | null; data_trabalho: string;
  setor: string | null; valor_diaria: number | null; status_pagamento: string | null;
}

// ─── Componentes base ─────────────────────────────────────────────────────────
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-[#12141f] border border-white/10 rounded-xl ${className}`}>{children}</div>
);

const KPI = ({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) => (
  <Card className="p-4 flex items-center gap-3">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div>
      <p className="text-xs text-white/60 font-medium">{label}</p>
      <p className="text-xl font-black text-white">{value}</p>
    </div>
  </Card>
);

const TableWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">{children}</table>
  </div>
);

const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-white/60 bg-white/5 border-b border-white/10 ${right ? "text-right" : "text-left"}`}>
    {children}
  </th>
);

const Td = ({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) => (
  <td className={`px-4 py-3 border-b border-white/5 ${right ? "text-right" : ""} ${muted ? "text-white/40 text-xs" : "text-white/90"}`}>
    {children}
  </td>
);

// ─── Exportar CSV simples ─────────────────────────────────────────────────────
function exportCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(";"),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, "'")}"` ).join(";")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Aba: Colaboradores ───────────────────────────────────────────────────────
const AbaColaboradores = () => {
  const [dados, setDados] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  useEffect(() => {
    supabase.from("colaboradores").select("id, nome_completo, status, tipo_vinculo, data_admissao, data_demissao, funcao_personalizada, salario_fixo, telefone, email")
      .order("nome_completo")
      .then(({ data }) => { setDados(data ?? []); setLoading(false); });
  }, []);

  const filtrados = dados.filter(c => {
    const mb = !busca || c.nome_completo.toLowerCase().includes(busca.toLowerCase());
    const ms = filtroStatus === "todos" || c.status === filtroStatus;
    return mb && ms;
  });

  const ativos    = dados.filter(c => c.status === "ativo").length;
  const inativos  = dados.filter(c => c.status === "inativo").length;
  const clt       = dados.filter(c => c.tipo_vinculo === "clt").length;
  const freelance = dados.filter(c => c.tipo_vinculo === "freelancer").length;

  const csvRows = filtrados.map(c => ({
    Nome: c.nome_completo,
    Status: c.status,
    Vinculo: c.tipo_vinculo,
    Funcao: c.funcao_personalizada ?? "",
    Admissao: fmtData(c.data_admissao),
    Demissao: fmtData(c.data_demissao),
    Salario: c.salario_fixo ?? "",
    Telefone: c.telefone ?? "",
    Email: c.email ?? "",
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total"        value={dados.length} icon={Users}      color="bg-[#7D1F2C]/10 text-[#7D1F2C]" />
        <KPI label="Ativos"       value={ativos}       icon={TrendingUp}  color="bg-emerald-50 text-emerald-600" />
        <KPI label="CLT"          value={clt}          icon={FileText}    color="bg-blue-50 text-blue-600" />
        <KPI label="Freelancers"  value={freelance}    icon={UserPlus}    color="bg-orange-50 text-orange-600" />
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {["todos", "ativo", "inativo", "afastado"].map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filtroStatus === s ? "bg-[#7D1F2C] text-white" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                {s === "todos" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..."
                className="pl-9 pr-3 py-1.5 border border-white/20 rounded-lg text-sm text-white placeholder-white/40 bg-white/5 focus:outline-none focus:border-[#7D1F2C]/50 w-52" />
            </div>
            <button onClick={() => exportCSV("colaboradores.csv", csvRows)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/70 hover:bg-white/20 transition-all">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {loading ? <p className="text-center py-10 text-white/40 text-sm">Carregando...</p> : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Nome</Th><Th>Função</Th><Th>Vínculo</Th><Th>Status</Th>
                <Th>Admissão</Th><Th right>Salário</Th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(c => (
                <tr key={c.id} className="hover:bg-white/5 transition-colors">
                  <Td><span className="font-medium text-white">{c.nome_completo}</span></Td>
                  <Td muted>{c.funcao_personalizada ?? "—"}</Td>
                  <Td><span className="text-xs font-semibold text-white/70 uppercase">{c.tipo_vinculo}</span></Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td muted>{fmtData(c.data_admissao)}</Td>
                  <Td right><span className="font-semibold text-white/90">{fmtR(c.salario_fixo)}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
        <div className="px-5 py-3 border-t border-white/10 text-xs text-white/40">
          {filtrados.length} de {dados.length} colaboradores
        </div>
      </Card>
    </div>
  );
};

// ─── Aba: Ocorrências ─────────────────────────────────────────────────────────
const AbaOcorrencias = () => {
  const [dados, setDados] = useState<Ocorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [dtInicio, setDtInicio] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split("T")[0];
  });
  const [dtFim, setDtFim] = useState(() => new Date().toISOString().split("T")[0]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ocorrencias_colaborador")
      .select("id, data_ocorrencia, tipo_ocorrencia, descricao, status, valor_vale, dias_afastamento, impacta_folha, colaborador_id, colaboradores(nome_completo)")
      .gte("data_ocorrencia", dtInicio)
      .lte("data_ocorrencia", dtFim)
      .order("data_ocorrencia", { ascending: false });
    setDados((data ?? []).map((d: any) => ({
      ...d, colaborador_nome: d.colaboradores?.nome_completo ?? "—",
    })));
    setLoading(false);
  }, [dtInicio, dtFim]);

  useEffect(() => { load(); }, [load]);

  const tipos = ["todos", ...Array.from(new Set(dados.map(d => d.tipo_ocorrencia)))];
  const filtrados = filtroTipo === "todos" ? dados : dados.filter(d => d.tipo_ocorrencia === filtroTipo);

  const totalVales = dados.filter(d => d.valor_vale).reduce((a, b) => a + (b.valor_vale ?? 0), 0);
  const totalAfastamento = dados.filter(d => d.dias_afastamento).reduce((a, b) => a + (b.dias_afastamento ?? 0), 0);

  const csvRows = filtrados.map(d => ({
    Colaborador: d.colaborador_nome,
    Data: fmtData(d.data_ocorrencia),
    Tipo: d.tipo_ocorrencia,
    Descricao: d.descricao,
    Status: d.status,
    Valor_Vale: d.valor_vale ?? "",
    Dias_Afastamento: d.dias_afastamento ?? "",
    Impacta_Folha: d.impacta_folha ? "Sim" : "Não",
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPI label="Ocorrências no período" value={dados.length}    icon={AlertTriangle} color="bg-orange-50 text-orange-600" />
        <KPI label="Total em vales"          value={fmtR(totalVales)} icon={FileText}    color="bg-blue-50 text-blue-600" />
        <KPI label="Dias de afastamento"     value={totalAfastamento} icon={Calendar}   color="bg-red-50 text-red-600" />
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2 flex-wrap items-center">
            <div>
              <label className="text-xs text-gray-500 block mb-1">De</label>
              <input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#7D1F2C]/50" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Até</label>
              <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#7D1F2C]/50" />
            </div>
            <button onClick={load} className="mt-4 p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-all">
              <RefreshCw className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <div className="flex gap-2">
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="border border-white/20 bg-white/5 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none">
              {tipos.map(t => <option key={t} value={t}>{t === "todos" ? "Todos os tipos" : t.replace(/_/g, " ")}</option>)}
            </select>
            <button onClick={() => exportCSV("ocorrencias.csv", csvRows)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/70 hover:bg-white/20 transition-all">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {loading ? <p className="text-center py-10 text-white/40 text-sm">Carregando...</p> : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Colaborador</Th><Th>Data</Th><Th>Tipo</Th><Th>Descrição</Th>
                <Th>Status</Th><Th right>Vale</Th><Th right>Dias Afst.</Th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0
                ? <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">Nenhuma ocorrência no período.</td></tr>
                : filtrados.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <Td><span className="font-medium text-gray-900">{d.colaborador_nome}</span></Td>
                    <Td muted>{fmtData(d.data_ocorrencia)}</Td>
                    <Td><span className="text-xs font-medium text-white/70">{d.tipo_ocorrencia.replace(/_/g, " ")}</span></Td>
                    <Td><span className="text-xs text-white/60 line-clamp-2 max-w-xs">{d.descricao}</span></Td>
                    <Td><StatusBadge status={d.status} /></Td>
                    <Td right>{d.valor_vale ? <span className="font-semibold text-orange-400">{fmtR(d.valor_vale)}</span> : <span className="text-white/30">—</span>}</Td>
                    <Td right>{d.dias_afastamento ? <span className="font-semibold text-red-400">{d.dias_afastamento}d</span> : <span className="text-white/30">—</span>}</Td>
                  </tr>
                ))
              }
            </tbody>
          </TableWrapper>
        )}
        <div className="px-5 py-3 border-t border-white/10 text-xs text-white/40">
          {filtrados.length} ocorrência{filtrados.length !== 1 ? "s" : ""}
        </div>
      </Card>
    </div>
  );
};

// ─── Aba: Férias ──────────────────────────────────────────────────────────────
const AbaFerias = () => {
  const [dados, setDados] = useState<Ferias[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("todos");

  useEffect(() => {
    supabase.from("ferias_colaboradores")
      .select("id, data_inicio, data_fim, dias_corridos, status, observacoes, colaborador_id, colaboradores(nome_completo)")
      .order("data_inicio", { ascending: false })
      .then(({ data }) => {
        setDados((data ?? []).map((d: any) => ({ ...d, colaborador_nome: d.colaboradores?.nome_completo ?? "—" })));
        setLoading(false);
      });
  }, []);

  const filtrados = filtroStatus === "todos" ? dados : dados.filter(d => d.status === filtroStatus);
  const totalDias = filtrados.reduce((a, b) => a + (b.dias_corridos ?? 0), 0);

  const csvRows = filtrados.map(d => ({
    Colaborador: d.colaborador_nome,
    Inicio: fmtData(d.data_inicio),
    Fim: fmtData(d.data_fim),
    Dias: d.dias_corridos ?? "",
    Status: d.status,
    Observacoes: d.observacoes ?? "",
  }));

  const agendadas = dados.filter(d => d.status === "aprovado").length;
  const pendentes  = dados.filter(d => d.status === "pendente").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total registros" value={dados.length}  icon={Umbrella}  color="bg-[#7D1F2C]/10 text-[#7D1F2C]" />
        <KPI label="Aprovadas"       value={agendadas}     icon={Calendar}  color="bg-emerald-50 text-emerald-600" />
        <KPI label="Pendentes"       value={pendentes}     icon={AlertTriangle} color="bg-yellow-50 text-yellow-600" />
        <KPI label="Dias (filtro)"   value={totalDias}     icon={TrendingUp} color="bg-blue-50 text-blue-600" />
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {["todos", "aprovado", "pendente", "rejeitado", "cancelado"].map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filtroStatus === s ? "bg-[#7D1F2C] text-white" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                {s === "todos" ? "Todas" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => exportCSV("ferias.csv", csvRows)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/70 hover:bg-white/20 transition-all">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>

        {loading ? <p className="text-center py-10 text-white/40 text-sm">Carregando...</p> : (
          <TableWrapper>
            <thead>
              <tr><Th>Colaborador</Th><Th>Início</Th><Th>Fim</Th><Th right>Dias</Th><Th>Status</Th><Th>Observações</Th></tr>
            </thead>
            <tbody>
              {filtrados.length === 0
                ? <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">Nenhum registro encontrado.</td></tr>
                : filtrados.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <Td><span className="font-medium text-gray-900">{d.colaborador_nome}</span></Td>
                    <Td muted>{fmtData(d.data_inicio)}</Td>
                    <Td muted>{fmtData(d.data_fim)}</Td>
                    <Td right><span className="font-bold text-white/90">{d.dias_corridos ?? "—"}</span></Td>
                    <Td><StatusBadge status={d.status} /></Td>
                    <Td muted>{d.observacoes ?? "—"}</Td>
                  </tr>
                ))
              }
            </tbody>
          </TableWrapper>
        )}
        <div className="px-5 py-3 border-t border-white/10 text-xs text-white/40">
          {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""} · {totalDias} dias no total
        </div>
      </Card>
    </div>
  );
};

// ─── Aba: Avaliações ──────────────────────────────────────────────────────────
const AbaAvaliacoes = () => {
  const [dados, setDados] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("rh_avaliacoes")
      .select("id, data_avaliacao, tipo, avaliador_nome, nota_geral, resultado, status, colaborador_id, colaboradores(nome_completo)")
      .order("data_avaliacao", { ascending: false })
      .then(({ data }) => {
        setDados((data ?? []).map((d: any) => ({ ...d, colaborador_nome: d.colaboradores?.nome_completo ?? "—" })));
        setLoading(false);
      });
  }, []);

  const media = dados.length ? (dados.reduce((a, b) => a + (b.nota_geral ?? 0), 0) / dados.filter(d => d.nota_geral).length) : 0;

  const csvRows = dados.map(d => ({
    Colaborador: d.colaborador_nome,
    Data: fmtData(d.data_avaliacao),
    Tipo: d.tipo,
    Avaliador: d.avaliador_nome ?? "",
    Nota_Geral: d.nota_geral ?? "",
    Resultado: d.resultado ?? "",
    Status: d.status,
  }));

  const notaColor = (n: number | null) => {
    if (!n) return "text-gray-400";
    if (n >= 8) return "text-emerald-600 font-bold";
    if (n >= 6) return "text-blue-600 font-bold";
    if (n >= 4) return "text-yellow-600 font-bold";
    return "text-red-600 font-bold";
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPI label="Total avaliações"  value={dados.length}           icon={Star}     color="bg-[#7D1F2C]/10 text-[#7D1F2C]" />
        <KPI label="Nota média"        value={media.toFixed(1)}       icon={TrendingUp} color="bg-emerald-50 text-emerald-600" />
        <KPI label="Concluídas"        value={dados.filter(d => d.status === "concluida" || d.status === "aprovado").length} icon={FileText} color="bg-blue-50 text-blue-600" />
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <p className="text-sm font-bold text-white/80">Histórico de Avaliações</p>
          <button onClick={() => exportCSV("avaliacoes.csv", csvRows)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white/70 hover:bg-white/20 transition-all">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>

        {loading ? <p className="text-center py-10 text-white/40 text-sm">Carregando...</p> : (
          <TableWrapper>
            <thead>
              <tr><Th>Colaborador</Th><Th>Data</Th><Th>Tipo</Th><Th>Avaliador</Th><Th right>Nota</Th><Th>Resultado</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {dados.length === 0
                ? <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">Nenhuma avaliação registrada.</td></tr>
                : dados.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <Td><span className="font-medium text-gray-900">{d.colaborador_nome}</span></Td>
                    <Td muted>{fmtData(d.data_avaliacao)}</Td>
                    <Td><span className="text-xs text-white/70">{d.tipo}</span></Td>
                    <Td muted>{d.avaliador_nome ?? "—"}</Td>
                    <Td right><span className={`text-base ${notaColor(d.nota_geral)}`}>{d.nota_geral ?? "—"}</span></Td>
                    <Td muted>{d.resultado ?? "—"}</Td>
                    <Td><StatusBadge status={d.status} /></Td>
                  </tr>
                ))
              }
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </div>
  );
};

// ─── Aba: DISC ────────────────────────────────────────────────────────────────
const AbaDISC = () => {
  const [dados, setDados] = useState<DiscResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("rh_disc_colaborador")
      .select("id, data_aplicacao, perfil_dominante, perfil_secundario, score_d, score_i, score_s, score_c, colaborador_id, colaboradores(nome_completo)")
      .order("data_aplicacao", { ascending: false })
      .then(({ data }) => {
        setDados((data ?? []).map((d: any) => ({ ...d, colaborador_nome: d.colaboradores?.nome_completo ?? "—" })));
        setLoading(false);
      });
  }, []);

  const perfilDist = dados.reduce((acc, d) => {
    acc[d.perfil_dominante] = (acc[d.perfil_dominante] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const perfilColors: Record<string, string> = {
    D: "bg-red-100 text-red-700 border-red-200",
    I: "bg-yellow-100 text-yellow-700 border-yellow-200",
    S: "bg-green-100 text-green-700 border-green-200",
    C: "bg-blue-100 text-blue-700 border-blue-200",
  };
  const perfilLabels: Record<string, string> = { D: "Dominância", I: "Influência", S: "Estabilidade", C: "Conformidade" };

  const csvRows = dados.map(d => ({
    Colaborador: d.colaborador_nome,
    Data: fmtData(d.data_aplicacao),
    Perfil_Dominante: d.perfil_dominante,
    Perfil_Secundario: d.perfil_secundario,
    Score_D: d.score_d,
    Score_I: d.score_i,
    Score_S: d.score_s,
    Score_C: d.score_c,
  }));

  return (
    <div className="space-y-5">
      {/* Distribuição */}
      {dados.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(perfilLabels).map(([k, v]) => (
            <Card key={k} className="p-4 text-center">
              <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-black border mb-2 ${perfilColors[k]}`}>{k}</span>
              <p className="text-xs text-gray-500 font-medium">{v}</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{perfilDist[k] ?? 0}</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <p className="text-sm font-bold text-gray-700">Perfis DISC da Equipe</p>
          <button onClick={() => exportCSV("disc.csv", csvRows)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>

        {loading ? <p className="text-center py-10 text-white/40 text-sm">Carregando...</p> : (
          <TableWrapper>
            <thead>
              <tr><Th>Colaborador</Th><Th>Data</Th><Th>Perfil</Th><Th right>D%</Th><Th right>I%</Th><Th right>S%</Th><Th right>C%</Th></tr>
            </thead>
            <tbody>
              {dados.length === 0
                ? <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">Nenhum DISC aplicado.</td></tr>
                : dados.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <Td><span className="font-medium text-gray-900">{d.colaborador_nome}</span></Td>
                    <Td muted>{fmtData(d.data_aplicacao)}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${perfilColors[d.perfil_dominante]}`}>{d.perfil_dominante}</span>
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${perfilColors[d.perfil_secundario]}`}>{d.perfil_secundario}</span>
                      </div>
                    </Td>
                    {[d.score_d, d.score_i, d.score_s, d.score_c].map((sc, i) => (
                      <Td key={i} right>
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#7D1F2C] rounded-full" style={{ width: `${sc}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-white/70 w-8">{sc}%</span>
                        </div>
                      </Td>
                    ))}
                  </tr>
                ))
              }
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </div>
  );
};

// ─── Aba: Extras / Freelancers ────────────────────────────────────────────────
const AbaExtras = () => {
  const [dados, setDados] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [dtInicio, setDtInicio] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0];
  });
  const [dtFim, setDtFim] = useState(() => new Date().toISOString().split("T")[0]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("extras_freelancers")
      .select("id, nome, funcao_temporaria, data_trabalho, setor, valor_diaria, status_pagamento")
      .gte("data_trabalho", dtInicio)
      .lte("data_trabalho", dtFim)
      .order("data_trabalho", { ascending: false });
    setDados(data ?? []);
    setLoading(false);
  }, [dtInicio, dtFim]);

  useEffect(() => { load(); }, [load]);

  const totalPago = dados.filter(d => d.status_pagamento === "pago").reduce((a, b) => a + (b.valor_diaria ?? 0), 0);
  const aPagar = dados.filter(d => d.status_pagamento !== "pago").reduce((a, b) => a + (b.valor_diaria ?? 0), 0);

  const csvRows = dados.map(d => ({
    Nome: d.nome,
    Funcao: d.funcao_temporaria ?? "",
    Data: fmtData(d.data_trabalho),
    Setor: d.setor ?? "",
    Diaria: d.valor_diaria ?? "",
    Status: d.status_pagamento ?? "",
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPI label="Extras no período"  value={dados.length}   icon={UserPlus}  color="bg-[#7D1F2C]/10 text-[#7D1F2C]" />
        <KPI label="Total pago"         value={fmtR(totalPago)} icon={FileText} color="bg-emerald-50 text-emerald-600" />
        <KPI label="A pagar"            value={fmtR(aPagar)}   icon={AlertTriangle} color="bg-orange-50 text-orange-600" />
      </div>

      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2 flex-wrap items-center">
            <div>
              <label className="text-xs text-gray-500 block mb-1">De</label>
              <input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#7D1F2C]/50" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Até</label>
              <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#7D1F2C]/50" />
            </div>
            <button onClick={load} className="mt-4 p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-all">
              <RefreshCw className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <button onClick={() => exportCSV("extras.csv", csvRows)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>

        {loading ? <p className="text-center py-10 text-white/40 text-sm">Carregando...</p> : (
          <TableWrapper>
            <thead>
              <tr><Th>Nome</Th><Th>Função</Th><Th>Data</Th><Th>Setor</Th><Th right>Diária</Th><Th>Pagamento</Th></tr>
            </thead>
            <tbody>
              {dados.length === 0
                ? <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">Nenhum extra no período.</td></tr>
                : dados.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <Td><span className="font-medium text-gray-900">{d.nome}</span></Td>
                    <Td muted>{d.funcao_temporaria ?? "—"}</Td>
                    <Td muted>{fmtData(d.data_trabalho)}</Td>
                    <Td muted>{d.setor ?? "—"}</Td>
                    <Td right><span className="font-semibold text-white/90">{fmtR(d.valor_diaria)}</span></Td>
                    <Td><StatusBadge status={d.status_pagamento ?? "pendente"} /></Td>
                  </tr>
                ))
              }
            </tbody>
          </TableWrapper>
        )}
        <div className="px-5 py-3 border-t border-white/10 text-xs text-white/40">
          {dados.length} registro{dados.length !== 1 ? "s" : ""}
        </div>
      </Card>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────
const ABAS: { key: Aba; label: string; icon: React.ElementType }[] = [
  { key: "colaboradores", label: "Colaboradores",  icon: Users },
  { key: "ocorrencias",   label: "Ocorrências",    icon: AlertTriangle },
  { key: "ferias",        label: "Férias",          icon: Umbrella },
  { key: "avaliacoes",    label: "Avaliações",      icon: Star },
  { key: "disc",          label: "Perfil DISC",     icon: Brain },
  { key: "extras",        label: "Extras/Freelas",  icon: UserPlus },
];

const RelatoriosRH: React.FC = () => {
  const [aba, setAba] = useState<Aba>("colaboradores");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Relatórios de RH</h2>
          <p className="text-sm text-white/60 mt-0.5">Consulte e exporte dados de todos os módulos de pessoas.</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1.5 flex-wrap border-b border-white/10 pb-0">
        {ABAS.map(a => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
              aba === a.key
                ? "border-[#7D1F2C] text-[#7D1F2C] bg-[#7D1F2C]/5"
                : "border-transparent text-white/60 hover:text-white/80 hover:bg-white/5"
            }`}
          >
            <a.icon className="w-4 h-4" />
            {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div>
        {aba === "colaboradores" && <AbaColaboradores />}
        {aba === "ocorrencias"   && <AbaOcorrencias />}
        {aba === "ferias"        && <AbaFerias />}
        {aba === "avaliacoes"    && <AbaAvaliacoes />}
        {aba === "disc"          && <AbaDISC />}
        {aba === "extras"        && <AbaExtras />}
      </div>
    </div>
  );
};

export default RelatoriosRH;
