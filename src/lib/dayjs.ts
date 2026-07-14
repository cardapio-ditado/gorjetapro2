import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import 'dayjs/locale/pt-br';

// Registrar plugins
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

// Configurar locale padrão
dayjs.locale('pt-br');

// Configurar timezone padrão para São Paulo (Brasil)
dayjs.tz.setDefault('America/Sao_Paulo');

// Função auxiliar para obter data/hora atual no timezone do Brasil
export const getDataHoraAtual = () => {
  return dayjs().tz('America/Sao_Paulo');
};

// Função auxiliar para obter data atual (sem hora) no formato ISO
export const getDataAtual = () => {
  return dayjs().tz('America/Sao_Paulo').format('YYYY-MM-DD');
};

// Função auxiliar para obter data/hora atual no formato ISO completo
export const getDataHoraAtualISO = () => {
  return dayjs().tz('America/Sao_Paulo').toISOString();
};

// Função para obter período da semana ISO
export const getPeriodoSemana = (semana: number, ano: number): { inicio: string; fim: string } => {
  const inicioSemana = dayjs().year(ano).isoWeek(semana).startOf('isoWeek');
  const fimSemana = dayjs().year(ano).isoWeek(semana).endOf('isoWeek');
  
  return {
    inicio: inicioSemana.format('DD/MM/YYYY'),
    fim: fimSemana.format('DD/MM/YYYY')
  };
};

// Função para obter semana ISO atual
const getSemanaAtual = () => {
  return {
    semana: dayjs().isoWeek(),
    ano: dayjs().year()
  };
};

export default dayjs;