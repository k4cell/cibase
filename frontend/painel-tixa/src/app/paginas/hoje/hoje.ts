import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MotorService } from '../../services/motor.service';
import { EstatisticasService } from '../../services/estatisticas.service';
import { ToastService } from '../../services/toast.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor } from '../../utils/formatacao';
import { ArrastarRolarDirective } from '../../utils/arrastar-rolar.directive';

@Component({
  selector: 'app-hoje',
  standalone: true,
  imports: [CommonModule, FormsModule, ArrastarRolarDirective],
  templateUrl: './hoje.html'
})
export class HojeComponent implements OnInit, OnDestroy {
  subAbaHoje: string = 'fila';
  mostrarAdiados: boolean = false;
  itemParaExcluirDaFila: any = null;

  readonly formatarValor = formatarValor;

  private desregistrar!: () => void;

  constructor(
    public motorService: MotorService,
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
  }

  classeStatus(status: string): string {
    return this.motorService.classeStatus(status);
  }

  // Outros serviços do MESMO cliente que também estão com recompra próxima --
  // avisa isso no card pra não precisar contatar de novo em pouco tempo: no
  // primeiro contato o vendedor já avisa de tudo que está por vir.
  servicosComRecompraProxima(item: any): string[] {
    const linhas = this.motorService.classificacaoPorCliente[item.cliente.id] || [];
    return linhas
      .filter(l => l.status === 'Recompra próxima' && l.servico_id !== item.servicoId)
      .map(l => l.servico_nome);
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
