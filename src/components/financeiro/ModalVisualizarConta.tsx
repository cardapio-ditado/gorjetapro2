import React from 'react';
import { X, Calendar, DollarSign, FileText, Building2, CreditCard, User, Tag, AlertCircle, CheckCircle, Clock, Receipt } from 'lucide-react';
import dayjs from 'dayjs';
import { formatCurrency } from '../../utils/reportGenerator';

interface PagamentoParcial {
  id: string;
  valor: number;
  data: string;
  forma_pagamento: string;
  conta_bancaria: string;
  numero_comprovante?: string;
  observacoes?: string;
  criado_em: string;
}

interface ContaPagar {
  id: string;
  fornecedor_nome: string;
  descricao: string;
  categoria_nome?: string;
  centro_custo_nome?: string;
  forma_pagamento_nome?: string;
  valor_total: number;
  valor_pago: number;
  saldo_restante: number;
  data_vencimento: string;
  data_emissao: string;
  data_primeira_baixa?: string;
  data_baixa_integral?: string;
  numero_documento?: string;
  status: string;
  aprovado_para_pagamento: boolean;
  aprovado_por_nome?: string;
  data_aprovacao?: string;
  observacoes?: string;
  criado_por_nome?: string;
  criado_em: string;
  pagamentos_historico?: PagamentoParcial[];
  total_pagamentos_parciais?: number;
}

interface ModalVisualizarContaProps {
  isOpen: boolean;
  conta: ContaPagar | null;
  onClose: () => void;
}

const ModalVisualizarConta: React.FC<ModalVisualizarContaProps> = ({ isOpen, conta, onClose }) => {
  if (!isOpen || !conta) return null;

  const getStatusBadge = (status: string) => {
    const badges = {
      'em_aberto': { color: 'bg-yellow-500/10 text-yellow-400', icon: Clock, label: 'Em Aberto' },
      'parcialmente_pago': { color: 'bg-blue-900/30 text-[#D4AF37]', icon: AlertCircle, label: 'Parcialmente Pago' },
      'pago': { color: 'bg-green-900/30 text-green-400', icon: CheckCircle, label: 'Pago' },
      'vencido': { color: 'bg-red-900/30 text-red-400', icon: AlertCircle, label: 'Vencido' },
      'cancelado': { color: 'bg-white/10 text-white/90', icon: X, label: 'Cancelado' }
    };

    const badge = badges[status as keyof typeof badges] || badges.em_aberto;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        <Icon className="w-4 h-4" />
        {badge.label}
      </span>
    );
  };

  const pagamentos = conta.pagamentos_historico || [];
  const percentualPago = conta.valor_total > 0 ? (conta.valor_pago / conta.valor_total) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#0f1020] border-b border-white/10 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">Detalhes da Conta</h2>
            <p className="text-sm text-white/50 mt-1">
              Criado em {dayjs(conta.criado_em).format('DD/MM/YYYY [às] HH:mm')}
              {conta.criado_por_nome && ` por ${conta.criado_por_nome}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/60 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status e Valores */}
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">{conta.descricao}</h3>
                {getStatusBadge(conta.status)}
              </div>
              <div className="text-right">
                <div className="text-sm text-white/50">Valor Total</div>
                <div className="text-2xl font-bold text-white">{formatCurrency(conta.valor_total)}</div>
              </div>
            </div>

            {/* Barra de Progresso de Pagamento */}
            {conta.valor_pago > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-white/60 mb-2">
                  <span>Valor Pago: {formatCurrency(conta.valor_pago)}</span>
                  <span>Saldo Restante: {formatCurrency(conta.saldo_restante)}</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(percentualPago, 100)}%` }}
                  />
                </div>
                <div className="text-center text-sm text-white/60 mt-1">
                  {percentualPago.toFixed(1)}% pago
                </div>
              </div>
            )}
          </div>

          {/* Informações Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Coluna Esquerda */}
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1">
                  <Building2 className="w-4 h-4" />
                  Fornecedor
                </label>
                <p className="text-white bg-white/5 px-3 py-2 rounded">{conta.fornecedor_nome}</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1">
                  <Tag className="w-4 h-4" />
                  Categoria
                </label>
                <p className="text-white bg-white/5 px-3 py-2 rounded">{conta.categoria_nome || 'N/A'}</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1">
                  <FileText className="w-4 h-4" />
                  Centro de Custo
                </label>
                <p className="text-white bg-white/5 px-3 py-2 rounded">{conta.centro_custo_nome || 'N/A'}</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1">
                  <CreditCard className="w-4 h-4" />
                  Forma de Pagamento
                </label>
                <p className="text-white bg-white/5 px-3 py-2 rounded">{conta.forma_pagamento_nome || 'N/A'}</p>
              </div>
            </div>

            {/* Coluna Direita */}
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1">
                  <Calendar className="w-4 h-4" />
                  Data de Emissão
                </label>
                <p className="text-white bg-white/5 px-3 py-2 rounded">
                  {dayjs(conta.data_emissao).format('DD/MM/YYYY')}
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1">
                  <Calendar className="w-4 h-4" />
                  Data de Vencimento
                </label>
                <p className="text-white bg-white/5 px-3 py-2 rounded">
                  {dayjs(conta.data_vencimento).format('DD/MM/YYYY')}
                </p>
              </div>

              {conta.data_primeira_baixa && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1">
                    <Calendar className="w-4 h-4" />
                    Data da Primeira Baixa
                  </label>
                  <p className="text-white bg-green-500/5 px-3 py-2 rounded">
                    {dayjs(conta.data_primeira_baixa).format('DD/MM/YYYY [às] HH:mm')}
                  </p>
                </div>
              )}

              {conta.data_baixa_integral && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1">
                    <CheckCircle className="w-4 h-4" />
                    Data da Baixa Integral
                  </label>
                  <p className="text-white bg-green-500/5 px-3 py-2 rounded font-medium">
                    {dayjs(conta.data_baixa_integral).format('DD/MM/YYYY [às] HH:mm')}
                  </p>
                </div>
              )}

              {conta.numero_documento && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/80 mb-1">
                    <Receipt className="w-4 h-4" />
                    Número do Documento
                  </label>
                  <p className="text-white bg-white/5 px-3 py-2 rounded">{conta.numero_documento}</p>
                </div>
              )}
            </div>
          </div>

          {/* Aprovação */}
          {conta.aprovado_para_pagamento && (
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-300 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Aprovado para Pagamento</span>
              </div>
              {conta.aprovado_por_nome && conta.data_aprovacao && (
                <p className="text-sm text-green-400">
                  Aprovado por {conta.aprovado_por_nome} em {dayjs(conta.data_aprovacao).format('DD/MM/YYYY [às] HH:mm')}
                </p>
              )}
            </div>
          )}

          {/* Observações */}
          {conta.observacoes && (
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">Observações</label>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="text-white/80 whitespace-pre-wrap">{conta.observacoes}</p>
              </div>
            </div>
          )}

          {/* Histórico de Pagamentos Parciais */}
          {pagamentos.length > 0 && (
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/15 rounded-lg p-5 border-2 border-blue-500/30">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[#D4AF37]" />
                Histórico de Pagamentos
                <span className="ml-2 px-3 py-1 bg-blue-600 text-white text-sm rounded-full">
                  {pagamentos.length} {pagamentos.length === 1 ? 'pagamento' : 'pagamentos'}
                </span>
              </h3>
              <div className="space-y-3">
                {pagamentos.map((pagamento, index) => (
                  <div key={pagamento.id} className="bg-[#0f0a0b] border border-white/5 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                          {pagamentos.length - index}
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-white">
                            Pagamento Parcial
                          </span>
                          <p className="text-xs text-white/60 mt-0.5">
                            Registrado em {dayjs(pagamento.criado_em).format('DD/MM/YYYY [às] HH:mm')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-bold text-[#D4AF37]">
                          {formatCurrency(pagamento.valor)}
                        </span>
                        <p className="text-xs text-white/50 mt-0.5">Valor Pago</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm bg-white/5 rounded-lg p-3">
                      <div>
                        <span className="text-white/60 text-xs">Data do Pagamento:</span>
                        <p className="text-white font-medium">{dayjs(pagamento.data).format('DD/MM/YYYY')}</p>
                      </div>
                      <div>
                        <span className="text-white/60 text-xs">Forma de Pagamento:</span>
                        <p className="text-white font-medium">{pagamento.forma_pagamento || 'N/A'}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-white/60 text-xs">Conta Bancária:</span>
                        <p className="text-white font-medium">{pagamento.conta_bancaria}</p>
                      </div>
                      {pagamento.numero_comprovante && (
                        <div className="col-span-2">
                          <span className="text-white/60 text-xs">Nº Comprovante:</span>
                          <p className="text-white font-medium">{pagamento.numero_comprovante}</p>
                        </div>
                      )}
                    </div>
                    {pagamento.observacoes && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <span className="text-xs text-white/60 font-medium">Observações:</span>
                        <p className="text-sm text-white/80 mt-1 bg-white/5 p-2 rounded border border-white/10">
                          {pagamento.observacoes}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Resumo dos Pagamentos */}
              <div className="mt-4 bg-[#0f0a0b] rounded-lg p-4 border border-white/10">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-white/60 mb-1">Total de Pagamentos</p>
                    <p className="text-lg font-bold text-[#D4AF37]">{pagamentos.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/60 mb-1">Total Pago</p>
                    <p className="text-lg font-bold text-green-400">{formatCurrency(conta.valor_pago)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/60 mb-1">Saldo Restante</p>
                    <p className={`text-lg font-bold ${conta.saldo_restante > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {formatCurrency(conta.saldo_restante)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white/5 border-t border-white/10 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalVisualizarConta;
