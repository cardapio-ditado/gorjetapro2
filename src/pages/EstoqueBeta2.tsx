/**
 * Estoque Beta 2 — protótipo visual isolado da base oficial.
 *
 * A prévia é um HTML estático mantido em public/estoque-beta2/index.html.
 * O iframe usa sandbox sem allow-same-origin: o protótipo não recebe a
 * sessão, cookies ou credenciais Supabase do Gorjeta Pro.
 * Não reutilizar RPCs do Estoque Beta 1 nesta tela.
 */
const EstoqueBeta2 = () => (
  <div className="-m-5 lg:-m-7 flex flex-col min-w-0" style={{ background: '#120e17' }}>
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-white/10"
      style={{ background: '#211724' }}>
      <div className="text-sm font-semibold" style={{ color: '#f5e7eb' }}>
        Estoque Beta 2 <span className="ml-2 text-xs font-normal" style={{ color: '#f1c788' }}>Prévia interativa</span>
      </div>
      <div className="text-xs" style={{ color: '#cbbac8' }}>
        Dados simulados · sem acesso aos saldos oficiais
      </div>
    </div>
    <iframe
      title="Estoque Beta 2 — Demonstração interativa"
      src="/estoque-beta2/index.html?v=20260922-4"
      sandbox="allow-scripts allow-forms"
      className="w-full block"
      style={{ height: 'calc(100dvh - 135px)', minHeight: 660, border: 0, background: '#120e17' }}
    />
  </div>
);

export default EstoqueBeta2;
