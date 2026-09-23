import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../api.config';
import { ToastService } from './toast.service';
import { RefrescoService } from './refresco.service';

// Valor do período. Períodos curtos mostram mais detalhe (blocos de semana(s))
// em vez de virar só 3 ou 6 pontos no gráfico:
// 3m -> 12 blocos de 1 semana | 6m -> 13 blocos de 2 semanas | 12m -> 12 meses | 5a -> 5 anos
const PERIODOS: { [chave: string]: { unidade: string; quantidade: number; passo: number; label: string } } = {
  '3m': { unidade: 'semana', quantidade: 12, passo: 1, label: '3 meses' },
  '6m': { unidade: 'semana', quantidade: 13, passo: 2, label: '6 meses' },
  '12m': { unidade: 'mes', quantidade: 12, passo: 1, label: '12 meses' },
  '5a': { unidade: 'ano', quantidade: 5, passo: 1, label: '5 anos' }
};

@Injectable({ providedIn: 'root' })
export class EstatisticasService {
  totalRecuperado: number = 0;
  clientesReativados: number = 0;
  recuperadoNoMesAtual: number = 0;

  periodoSelecionado: string = '12m';
  receitaMensal: any[] = [];
  clientesPeriodoTotal: number = 0;
  topClientesPeriodo: any[] = [];

  constructor(private http: HttpClient, private toast: ToastService, private refresco: RefrescoService) {}

  private periodoParams() {
    return PERIODOS[this.periodoSelecionado] || PERIODOS['12m'];
  }

  periodoLabelTexto(): string {
    return this.periodoParams().label;
  }

  carregarEstatisticas() {
    this.http.get<any>(`${API_BASE_URL}/estatisticas`).subscribe({
      next: (dados) => {
        this.totalRecuperado = dados.total_recuperado;
        this.clientesReativados = dados.clientes_reativados;
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao calcular as estatísticas.', '#dc3545')
    });
  }

  carregarRecuperadoNoMes() {
    this.http.get<any>(`${API_BASE_URL}/estatisticas/receita-mensal?unidade=mes&quantidade=1&passo=1`).subscribe({
      next: (dados) => {
        const meses = dados.meses || [];
        this.recuperadoNoMesAtual = meses.length ? meses[meses.length - 1].valor : 0;
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao calcular o recuperado no mês.', '#dc3545')
    });
  }

  carregarReceitaMensal() {
    const { unidade, quantidade, passo } = this.periodoParams();
    this.http.get<any>(`${API_BASE_URL}/estatisticas/receita-mensal?unidade=${unidade}&quantidade=${quantidade}&passo=${passo}`).subscribe({
      next: (dados) => { this.receitaMensal = dados.meses || []; this.refresco.notificar(); },
      error: () => this.toast.mostrar('Falha ao carregar a receita mensal.', '#dc3545')
    });
  }

  carregarClientesPeriodo() {
    const { unidade, quantidade, passo } = this.periodoParams();
    this.http.get<any>(`${API_BASE_URL}/estatisticas/clientes-periodo?unidade=${unidade}&quantidade=${quantidade}&passo=${passo}`).subscribe({
      next: (dados) => {
        this.clientesPeriodoTotal = dados.total_clientes_periodo || 0;
        this.topClientesPeriodo = dados.top_clientes || [];
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao carregar os clientes do período.', '#dc3545')
    });
  }

  mudarPeriodoGrafico() {
    this.carregarReceitaMensal();
    this.carregarClientesPeriodo();
  }

  receitaDoPeriodo(): number {
    return this.receitaMensal.reduce((soma: number, item: any) => soma + item.valor, 0);
  }

  vendasDoPeriodo(): number {
    return this.receitaMensal.reduce((soma: number, item: any) => soma + item.quantidade, 0);
  }

  // Gráfico de linha: coordenadas em porcentagem (0-100) numa margem interna,
  // pra ficarem idênticas entre o SVG (linha/área) e os pontos/rótulos em HTML.
  // "campo" escolhe qual métrica plotar: 'valor' (receita) ou 'quantidade' (nº de vendas).
  private readonly margemGraficoPct = 8;

  posXGraficoPct(indice: number): number {
    const n = this.receitaMensal.length;
    if (n <= 1) return 50;
    const usavel = 100 - 2 * this.margemGraficoPct;
    return this.margemGraficoPct + (indice / (n - 1)) * usavel;
  }

  posYGraficoPct(item: any, campo: 'valor' | 'quantidade'): number {
    const maior = Math.max(...this.receitaMensal.map((m: any) => m[campo]), 1);
    const usavel = 100 - 2 * this.margemGraficoPct;
    return this.margemGraficoPct + (item[campo] / maior) * usavel;
  }

  pontosLinhaGrafico(campo: 'valor' | 'quantidade'): string {
    return this.receitaMensal
      .map((item: any, i: number) => `${this.posXGraficoPct(i)},${100 - this.posYGraficoPct(item, campo)}`)
      .join(' ');
  }

  pontosAreaGrafico(campo: 'valor' | 'quantidade'): string {
    if (this.receitaMensal.length === 0) return '';
    const linha = this.pontosLinhaGrafico(campo);
    const ultimoIndice = this.receitaMensal.length - 1;
    return `${this.posXGraficoPct(0)},100 ${linha} ${this.posXGraficoPct(ultimoIndice)},100`;
  }
}
