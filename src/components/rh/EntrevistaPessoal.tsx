import React, { useState } from 'react';
import { X, Mic, Upload, Loader2, CheckCircle, AlertCircle, FileAudio, Brain } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface EntrevistaPessoalProps {
  candidatura_id: string;
  onClose: () => void;
}

export default function EntrevistaPessoal({ candidatura_id, onClose }: EntrevistaPessoalProps) {
  const [formData, setFormData] = useState({
    entrevistador: '',
    cargo_avaliado: '',
    notas_entrevistador: ''
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo
      const validTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/webm'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|mp4|webm)$/i)) {
        alert('Por favor, selecione um arquivo de áudio válido (MP3, WAV, M4A, MP4, WEBM)');
        return;
      }

      // Validar tamanho (max 25MB)
      if (file.size > 25 * 1024 * 1024) {
        alert('O arquivo é muito grande. Tamanho máximo: 25MB');
        return;
      }

      setAudioFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!audioFile) {
      alert('Por favor, selecione um arquivo de áudio da entrevista');
      return;
    }

    try {
      setUploading(true);

      // Criar registro inicial da entrevista
      const { data: entrevista, error: entrevistaError } = await supabase
        .from('entrevistas_pessoais')
        .insert({
          candidatura_id,
          entrevistador: formData.entrevistador,
          cargo_avaliado: formData.cargo_avaliado,
          notas_entrevistador: formData.notas_entrevistador,
          status: 'realizada'
        })
        .select()
        .single();

      if (entrevistaError) throw entrevistaError;

      // Upload do áudio para o Storage do Supabase
      const fileName = `${entrevista.id}_${Date.now()}_${audioFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('entrevistas-audio')
        .upload(fileName, audioFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Erro no upload:', uploadError);
        throw new Error('Erro ao fazer upload do áudio');
      }

      // Obter URL pública do áudio
      const { data: publicUrlData } = supabase.storage
        .from('entrevistas-audio')
        .getPublicUrl(fileName);

      // Atualizar entrevista com URL do áudio
      const { error: updateError } = await supabase
        .from('entrevistas_pessoais')
        .update({ audio_url: publicUrlData.publicUrl })
        .eq('id', entrevista.id);

      if (updateError) throw updateError;

      setUploading(false);
      setAnalyzing(true);

      // Chamar a função Edge para análise do áudio
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analisar-entrevista-audio`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entrevista_id: entrevista.id,
            audio_url: publicUrlData.publicUrl
          })
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao analisar áudio');
      }

      alert('Entrevista registrada e análise iniciada com sucesso!\n\nA análise da IA pode levar alguns minutos.');
      onClose();
    } catch (error) {
      console.error('Erro ao processar entrevista:', error);
      alert('Erro ao processar entrevista: ' + (error as Error).message);
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#12141f] rounded-xl max-w-2xl w-full">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Mic className="w-8 h-8 text-purple-400" />
            Registrar Entrevista Pessoal
          </h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/50 transition-colors"
            disabled={uploading || analyzing}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-300">
                <p className="font-medium mb-1">Instruções:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Faça upload do áudio da entrevista (MP3, WAV, M4A, MP4, WEBM)</li>
                  <li>Tamanho máximo: 25MB</li>
                  <li>A IA vai transcrever e analisar automaticamente</li>
                  <li>O processo pode levar alguns minutos</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Entrevistador *
            </label>
            <input
              type="text"
              required
              value={formData.entrevistador}
              onChange={(e) => setFormData({ ...formData, entrevistador: e.target.value })}
              className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Nome do entrevistador"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Cargo Avaliado *
            </label>
            <input
              type="text"
              required
              value={formData.cargo_avaliado}
              onChange={(e) => setFormData({ ...formData, cargo_avaliado: e.target.value })}
              className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Ex: Garçom, Bartender, Cozinheiro..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Notas do Entrevistador
            </label>
            <textarea
              value={formData.notas_entrevistador}
              onChange={(e) => setFormData({ ...formData, notas_entrevistador: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Impressões, observações e notas sobre a entrevista..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Áudio da Entrevista *
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-white/20 border-dashed rounded-lg hover:border-purple-400 transition-colors">
              <div className="space-y-2 text-center">
                {audioFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileAudio className="w-8 h-8 text-purple-400" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-white">{audioFile.name}</p>
                      <p className="text-xs text-white/40">
                        {(audioFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAudioFile(null)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Mic className="mx-auto h-12 w-12 text-white/30" />
                    <div className="flex text-sm text-white/50">
                      <label
                        htmlFor="audio-upload"
                        className="relative cursor-pointer bg-[#12141f] rounded-md font-medium text-purple-300 hover:text-purple-200 focus-within:outline-none"
                      >
                        <span>Selecione um arquivo</span>
                        <input
                          id="audio-upload"
                          name="audio-upload"
                          type="file"
                          accept="audio/*,.mp3,.wav,.m4a,.mp4,.webm"
                          className="sr-only"
                          onChange={handleFileChange}
                          disabled={uploading || analyzing}
                        />
                      </label>
                      <p className="pl-1">ou arraste aqui</p>
                    </div>
                    <p className="text-xs text-white/40">
                      MP3, WAV, M4A, MP4, WEBM até 25MB
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-white/80 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
              disabled={uploading || analyzing}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={uploading || analyzing || !audioFile}
              className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Enviando...
                </>
              ) : analyzing ? (
                <>
                  <Brain className="w-5 h-5 animate-pulse" />
                  Analisando...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Enviar e Analisar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
