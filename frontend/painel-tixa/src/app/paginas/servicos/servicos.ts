import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServicosService } from '../../services/servicos.service';
import { MotorService } from '../../services/motor.service';
import { ToastService } from '../../services/toast.service';
import { RefrescoService } from '../../services/refresco.service';

@Component({
  selector: 'app-servicos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './servicos.html'
})
export class ServicosComponent implements OnInit, OnDestroy {
  novoServicoNome: string = '';
  novoServicoCiclo: number | null = null;
  salvandoServico: boolean = false;

  servicoEditandoId: number | null = null;
  servicoEditandoNome: string = '';
  servicoEditandoCiclo: number | null = null;
  salvandoEdicaoServico: boolean = false;

  servicoParaExcluir: any = null;
  excluindoServico: boolean = false;

  private desregistrar!: () => void;

  constructor(
    public servicosService: ServicosService,
    private motorService: MotorService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private refresco: RefrescoService
  ) {}

  ngOnInit() {
    this.desregistrar = this.refresco.registrar(() => this.cdr.detectChanges());
  }

  ngOnDestroy() {
    this.desregistrar();
  }

  adicionarServico() {
    if (!this.novoServicoNome.trim()) {
      this.toast.mostrar('Dê um nome ao serviço.', '#ffc107');
      return;
    }
    if (!this.novoServicoCiclo || this.novoServicoCiclo <= 0) {
      this.toast.mostrar('Informe o ciclo esperado em dias.', '#ffc107');
      return;
    }

    this.salvandoServico = true;
    this.servicosService.adicionarServico(
      this.novoServicoNome.trim(),
      this.novoServicoCiclo,
      () => { this.novoServicoNome = ''; this.novoServicoCiclo = null; },
      () => { this.salvandoServico = false; }
    );
  }

  iniciarEdicaoServico(servico: any) {
    this.servicoEditandoId = servico.id;
    this.servicoEditandoNome = servico.nome;
    this.servicoEditandoCiclo = servico.dias_ciclo ?? null;
  }

  cancelarEdicaoServico() {
    this.servicoEditandoId = null;
  }

  salvarEdicaoServico() {
    if (!this.servicoEditandoNome.trim()) {
      this.toast.mostrar('Dê um nome ao serviço.', '#ffc107');
      return;
    }
    if (!this.servicoEditandoCiclo || this.servicoEditandoCiclo <= 0) {
      this.toast.mostrar('Informe o ciclo esperado em dias.', '#ffc107');
      return;
    }

    this.salvandoEdicaoServico = true;
    this.servicosService.salvarEdicaoServico(
      this.servicoEditandoId!,
      this.servicoEditandoNome.trim(),
      this.servicoEditandoCiclo,
      () => {
        this.servicoEditandoId = null;
        this.motorService.montarFilaDeHoje(); // mudar o ciclo ou o nome reflete na fila de hoje
      },
      () => { this.salvandoEdicaoServico = false; }
    );
  }

  abrirConfirmacaoExcluirServico(servico: any) {
    this.servicoParaExcluir = servico;
  }

  fecharConfirmacaoExcluirServico() {
    this.servicoParaExcluir = null;
  }

  confirmarExclusaoServico() {
    if (!this.servicoParaExcluir) return;
    this.excluindoServico = true;
    this.servicosService.excluirServico(this.servicoParaExcluir.id, () => {
      this.excluindoServico = false;
      this.servicoParaExcluir = null;
    });
  }
}
