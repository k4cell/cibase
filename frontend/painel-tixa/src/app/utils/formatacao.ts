// Funções puras de formatação, sem estado nem dependência -- reaproveitadas
// em quase toda página, por isso viram funções soltas em vez de um serviço.

// Formata valores em dinheiro no padrão brasileiro (separador de milhar com
// ponto, decimal com vírgula) -- .toFixed(2) sozinho não faz isso, então
// "418410.00" aparecia sem separador nenhum, difícil de ler rápido.
export function formatarValor(valor: number): string {
  return (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function exibirTextoDias(dataUltimaCompra: string): string {
  if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return 'Sem vendas';

  const dataCompra = new Date(dataUltimaCompra);
  const hoje = new Date();
  const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

  return `${dataUltimaCompra} (${diasInativos} dias)`;
}
