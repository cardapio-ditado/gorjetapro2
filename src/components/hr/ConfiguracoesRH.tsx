import React, { useState } from "react";
import { Save, Info } from "lucide-react";

const ConfiguracoesRH: React.FC = () => {
  const [cfg, setCfg] = useState({
    percentual_base: 0.05,
    bonus_meta1_pct: 0.01,
    bonus_meta2_pct: 0.02,
    meta1_valor: 17000,
    meta2_valor: 24000,
    teto_adiantamento_semanal: 395,
    adiantamento_abate_saldo: true,
  });
  const [saved, setSaved] = useState(false);

  function handleNumber<K extends keyof typeof cfg>(key: K, value: string) {
    const parsed = Number(value.replace(",", "."));
    setCfg((s) => ({ ...s, [key]: isNaN(parsed) ? s[key] : parsed }) as typeof s);
  }

  function handleBoolean<K extends keyof typeof cfg>(key: K, value: boolean) {
    setCfg((s) => ({ ...s, [key]: value }));
  }

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-white">{label}</label>
      {children}
      {hint && <p className="text-xs text-white/50">{hint}</p>}
    </div>
  );

  const TextInput = ({ value, onChange }: { value: number; onChange: (v: string) => void }) => (
    <input
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30 focus:border-[#7D1F2C]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Configurações de Gorjetas</h2>
        <p className="text-sm text-white/50 mt-1">Parâmetros utilizados no cálculo semanal de gorjetas e adiantamentos.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Percentuais */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide border-b border-white/10 pb-2">Percentuais</h3>
          <Field label="% Base da gorjeta">
            <TextInput value={cfg.percentual_base} onChange={(v) => handleNumber("percentual_base", v)} />
          </Field>
          <Field label="Bônus Meta 1 (%)">
            <TextInput value={cfg.bonus_meta1_pct} onChange={(v) => handleNumber("bonus_meta1_pct", v)} />
          </Field>
          <Field label="Bônus Meta 2 (%)">
            <TextInput value={cfg.bonus_meta2_pct} onChange={(v) => handleNumber("bonus_meta2_pct", v)} />
          </Field>
        </div>

        {/* Metas */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide border-b border-white/10 pb-2">Metas Semanais (R$)</h3>
          <Field label="Meta 1 — faixa inicial (R$)">
            <TextInput value={cfg.meta1_valor} onChange={(v) => handleNumber("meta1_valor", v)} />
          </Field>
          <Field label="Meta 2 — a partir de (R$)">
            <TextInput value={cfg.meta2_valor} onChange={(v) => handleNumber("meta2_valor", v)} />
          </Field>
          <div className="flex gap-2 bg-blue-900/30 border border-blue-500/30 rounded-lg px-3 py-2.5">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300 leading-relaxed">
              Meta 1: R$ {cfg.meta1_valor.toLocaleString('pt-BR')} até R$ {(cfg.meta2_valor - 1).toLocaleString('pt-BR')} (+{(cfg.bonus_meta1_pct * 100).toFixed(1)}%).
              Meta 2: acima de R$ {cfg.meta2_valor.toLocaleString('pt-BR')} (+{(cfg.bonus_meta2_pct * 100).toFixed(1)}%).
            </p>
          </div>
        </div>

        {/* Adiantamentos */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4 md:col-span-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide border-b border-white/10 pb-2">Adiantamentos (Vales)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Teto semanal por garçom (R$)" hint="Valor máximo de vale por semana por colaborador.">
              <TextInput value={cfg.teto_adiantamento_semanal} onChange={(v) => handleNumber("teto_adiantamento_semanal", v)} />
            </Field>
            <Field label="Abater adiantamento no saldo?" hint="Com abate: saldo = máx(0, líquida − adiantamentos pagos).">
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => handleBoolean("adiantamento_abate_saldo", !cfg.adiantamento_abate_saldo)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    cfg.adiantamento_abate_saldo ? "bg-[#7D1F2C]" : "bg-gray-300"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    cfg.adiantamento_abate_saldo ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
                <span className={`text-sm font-medium ${cfg.adiantamento_abate_saldo ? "text-[#7D1F2C]" : "text-gray-500"}`}>
                  {cfg.adiantamento_abate_saldo ? "Ativo" : "Inativo"}
                </span>
              </div>
            </Field>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-[#7D1F2C] text-white hover:bg-[#9B2535] transition-all active:scale-95"
        >
          <Save className="w-4 h-4" />
          {saved ? "Salvo!" : "Salvar configurações"}
        </button>
        <p className="text-xs text-white/50">* Integração com banco de dados pendente. Valores aplicados localmente.</p>
      </div>
    </div>
  );
};

export default ConfiguracoesRH;
