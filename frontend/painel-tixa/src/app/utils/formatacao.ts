// Funções puras de formatação, sem estado nem dependência -- reaproveitadas
// em quase toda página, por isso viram funções soltas em vez de um serviço.

// Formata valores em dinheiro no padrão brasileiro (separador de milhar com
// ponto, decimal com vírgula) -- .toFixed(2) sozinho não faz isso, então
// "418410.00" aparecia sem separador nenhum, difícil de ler rápido.
export function formatarValor(valor: number): string {
  return (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// O backend manda data em ISO (aaaa-mm-dd) -- exibição tem que estar no
// padrão brasileiro (dd/mm/aaaa). Valores que não são data de verdade (ex:
// "Não informado", "Sem vendas") passam direto, sem tentar formatar.
//
// Formata via split de string em vez de Date/toLocaleDateString de propósito:
// `new Date("aaaa-mm-dd")` interpreta a string como UTC meia-noite, e em
// fusos com offset negativo (todo o Brasil) isso pode voltar um dia --
// virando bug de "aniversário/venda um dia antes" só por causa do fuso.
export function formatarData(data: string): string {
  if (!data) return data;
  const [semHora] = data.split('T');
  const partes = semHora.split('-');
  if (partes.length !== 3) return data;

  const [ano, mes, dia] = partes;
  if (!/^\d{4}$/.test(ano) || !/^\d{2}$/.test(mes) || !/^\d{2}$/.test(dia)) return data;

  return `${dia}/${mes}/${ano}`;
}

// Mesma aproximação do motor (backend/motor_reentrada.py: DIAS_POR_MES = 30).
// O frontend converte meses -> dias antes de enviar; dias_ciclo é sempre em
// dias no banco e unidade_ciclo só guarda como reexibir o número.
export const DIAS_POR_MES = 30;

// "6 meses" / "1 mês" / "15 dias" -- o ciclo do jeito que foi digitado.
// String vazia quando o serviço ainda não tem ciclo definido.
export function formatarCiclo(servico: any): string {
  if (!servico?.dias_ciclo) return '';
  if (servico.unidade_ciclo === 'meses') {
    const meses = Math.round(servico.dias_ciclo / DIAS_POR_MES);
    return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  }
  return `${servico.dias_ciclo} ${servico.dias_ciclo === 1 ? 'dia' : 'dias'}`;
}

export function exibirTextoDias(dataUltimaCompra: string): string {
  if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return 'Sem vendas';

  const dataCompra = new Date(dataUltimaCompra);
  const hoje = new Date();
  const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

  return `${formatarData(dataUltimaCompra)} (${diasInativos} dias)`;
}
