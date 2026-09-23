import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MotorService } from '../../services/motor.service';
import { ServicosService } from '../../services/servicos.service';
import { EstatisticasService } from '../../services/estatisticas.service';
import { ToastService } from '../../services/toast.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor } from '../../utils/formatacao';

@Component({
  selector: 'app-hoje',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hoje.html'
})
export class HojeComponent implements OnInit, OnDestroy {
  subAbaHoje: string = 'fila';
  mostrarAdiados: boolean = false;
  itemParaExcluirDaFila: any = null;

  servicoPorServicoId: string = 'todos';
  filtroStatusPorServico: string = 'Todos';

  readonly formatarValor = formatarValor;

  private desregistrar!: () => void;

  constructor(
    public motorService: MotorService,
    public servicosService: ServicosService,
    public estatisticasService: EstatisticasService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private refresco: RefrescoService
  ) {}

  ngOnInit() {
    this.desregistrar = this.refresco.registrar(() => this.cdr.detectChanges());

    // A fila em si já é carregada pelo Shell (login/reload) -- aqui só
    // garantimos que ela existe caso o usuário caia direto nessa rota.
    if (!this.motorService.filaHoje.length && !this.motorService.clientesAdiados.length) {
      this.motorService.montarFilaDeHoje();
    }
  }

  ngOnDestroy() {
    this.desregistrar();
  }

  trocarSubAbaHoje(aba: string) {
    this.subAbaHoje = aba;
    if (aba === 'contatados' && !this.motorService.contatadosCarregados) {
      this.motorService.carregarContatados();
    }
    if (aba === 'servico' && !this.motorService.clientesPorServicoCarregados) {
      this.filtrarClientesPorServico();
    }
  }

  filtrarClientesPorServico() {
    this.filtroStatusPorServico = 'Todos';
    this.motorService.filtrarClientesPorServico(this.servicoPorServicoId);
  }

  clientesPorServicoFiltrados() {
    if (this.filtroStatusPorServico === 'Todos') return this.motorService.clientesPorServico;
    return this.motorService.clientesPorServico.filter(item => item.status === this.filtroStatusPorServico);
  }

  classeStatus(status: string): string {
    return this.motorService.classeStatus(status);
  }

  // "X" do card: só tira o cliente da fila de HOJE (local, sem registrar
  // contato nenhum no motor) -- diferente do Adiar, não afeta a reentrada.
  abrirConfirmacaoExcluirDaFila(item: any) {
    this.itemParaExcluirDaFila = item;
  }

  fecharConfirmacaoExcluirDaFila() {
    this.itemParaExcluirDaFila = null;
  }

  confirmarExclusaoDaFila() {
    if (!this.itemParaExcluirDaFila) return;
    const item = this.itemParaExcluirDaFila;
    this.motorService.excluirDaFilaLocal(item);
    this.itemParaExcluirDaFila = null;
    this.toast.mostrar(`${item.cliente.nome} foi tirado da fila de hoje.`, '#28a745');
  }
}
