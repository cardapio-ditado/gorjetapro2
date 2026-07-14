import React from 'react';
import { Package, Smartphone, CheckCircle, Clock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function CartazRequisicao() {
  const linkRequisicao = 'https://www.ditado.org/requisicao-estoque';

  return (
    <div className="min-h-screen bg-[#0d0f1a] p-8">
      {/* Botão de Impressão */}
      <div className="max-w-4xl mx-auto mb-6 no-print">
        <button
          onClick={() => window.print()}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 flex items-center gap-2 font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimir Cartaz
        </button>
      </div>

      {/* Cartaz */}
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl p-12 print:shadow-none">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full mb-4">
            <Package className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Requisição de Material</h1>
          <p className="text-xl text-gray-500">Solicite itens do estoque de forma rápida e fácil</p>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center mb-10 p-8 bg-blue-50 rounded-xl">
          <div className="bg-white p-6 rounded-xl shadow-lg mb-4">
            <QRCodeSVG value={linkRequisicao} size={256} level="H" includeMargin={true} />
          </div>
          <p className="text-lg font-medium text-gray-700 mb-2">Aponte a câmera do celular para o QR Code</p>
          <p className="text-sm text-gray-500 text-center max-w-md">Ou acesse diretamente:</p>
          <div className="mt-3 px-6 py-3 bg-white rounded-xl border-2 border-blue-200">
            <code className="text-blue-600 font-mono text-sm break-all">{linkRequisicao}</code>
          </div>
        </div>

        {/* Como Funciona */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">Como Funciona?</h2>
          <div className="grid grid-cols-4 gap-6">
            {[
              { icon: <Smartphone className="w-8 h-8 text-blue-500" />, bg: 'bg-blue-50', title: '1. Acesse o Link', desc: 'Escaneie o QR Code ou acesse o link' },
              { icon: <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>, bg: 'bg-green-50', title: '2. Preencha', desc: 'Informe seus dados e os itens necessários' },
              { icon: <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>, bg: 'bg-purple-50', title: '3. Envie', desc: 'Clique em enviar requisição' },
              { icon: <Clock className="w-8 h-8 text-orange-500" />, bg: 'bg-orange-50', title: '4. Aguarde', desc: 'Estoquista entrará em contato via WhatsApp' },
            ].map((step, i) => (
              <div key={i} className="text-center">
                <div className={`inline-flex items-center justify-center w-16 h-16 ${step.bg} rounded-full mb-3`}>
                  {step.icon}
                </div>
                <h3 className="font-bold text-gray-800 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Importante */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 mb-10">
          <h3 className="font-bold text-yellow-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Importante
          </h3>
          <ul className="space-y-2 text-sm text-yellow-800">
            {[
              'Sempre informe seu WhatsApp correto para receber o contato',
              'Verifique as quantidades disponíveis antes de solicitar',
              'Guarde o número da requisição para acompanhamento',
              'Não precisa fazer login — sistema totalmente público!',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-yellow-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-400 text-sm border-t pt-6">
          <p className="mb-2">Sistema de Gestão — Ditado Popular</p>
          <p>Dúvidas? Fale com o administrador do sistema</p>
        </div>
      </div>

      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  );
}