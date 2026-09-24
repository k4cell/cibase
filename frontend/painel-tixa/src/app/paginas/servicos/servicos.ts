import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServicosService } from '../../services/servicos.service';
import { MotorService } from '../../services/motor.service';
import { ToastService } from '../../services/toast.service';
import { RefrescoService } from '../../services/refresco.service';

// Mesma aproximação usada no motor (backend/motor_reentrada.py:
// DIAS_POR_MES = 30) -- só pra converter o número digitado em "meses" pro
// dias_ciclo que o resto do sistema entende. A unidade em si (unidade_ciclo)
// é guardada só pra reexibir do jeito que foi digitado (mecânica pensa em
// meses, manicure pensa em dias); o motor de recomendação nunca vê "meses".
const DIAS_POR_MES = 30;

@Component({
  selector: 'app-servicos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './servicos.html'
})
export class ServicosComponent implements OnInit, OnDestroy {
  novoServicoNome: string = '';
  novoServicoCiclo: number | null = null;
  novoServicoUnidade: 'dias' | 'meses' = 'dias';
  salvandoServico: boolean = false;

  servicoEditandoId: number | null = null;
  servicoEditandoNome: string = '';
  servicoEditandoCiclo: number | null = null;
  servicoEditandoUnidade: 'dias' | 'meses' = 'dias';
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

  // Texto do card: reexibe o número na MESMA unidade que foi digitada
  // (dividindo de volta por 30 se for "meses"), em vez de sempre mostrar em
  // dias -- é o texto que aparece já do jeito que o dono do negócio pensa.
  exibirCiclo(servico: any): string {
    if (!servico.dias_ciclo) return 'Ciclo ainda não definido';
    if (servico.unidade_ciclo === 'meses') {
      const meses = Math.round(servico.dias_ciclo / DIAS_POR_MES);
      return `${meses} ${meses === 1 ? 'mês' : 'meses'} de ciclo esperado`;
    }
    return `${servico.dias_ciclo} ${servico.dias_ciclo === 1 ? 'dia' : 'dias'} de ciclo esperado`;
  }

  adicionarServico() {
    if (!this.novoServicoNome.trim()) {
      this.toast.mostrar('Dê um nome ao serviço.', '#ffc107');
      return;
    }
    if (!this.novoServicoCiclo || this.novoServicoCiclo <= 0) {
      this.toast.mostrar('Informe o ciclo esperado.', '#ffc107');
      return;
    }

    const diasCiclo = this.novoServicoUnidade === 'meses' ? this.novoServicoCiclo * DIAS_POR_MES : this.novoServicoCiclo;

    this.salvandoServico = true;
    this.servicosService.adicionarServico(
      this.novoServicoNome.trim(),
      diasCiclo,
      this.novoServicoUnidade,
      () => { this.novoServicoNome = ''; this.novoServicoCiclo = null; this.novoServicoUnidade = 'dias'; },
      () => { this.salvandoServico = false; }
    );
  }

  iniciarEdicaoServico(servico: any) {
    this.servicoEditandoId = servico.id;
    this.servicoEditandoNome = servico.nome;
    this.servicoEditandoUnidade = servico.unidade_ciclo === 'meses' ? 'meses' : 'dias';
    this.servicoEditandoCiclo = servico.dias_ciclo
      ? (this.servicoEditandoUnidade === 'meses' ? Math.round(servico.dias_ciclo / DIAS_POR_MES) : servico.dias_ciclo)
      : null;
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
      this.toast.mostrar('Informe o ciclo esperado.', '#ffc107');
      return;
    }

    const diasCiclo = this.servicoEditandoUnidade === 'meses' ? this.servicoEditandoCiclo * DIAS_POR_MES : this.servicoEditandoCiclo;

    this.salvandoEdicaoServico = true;
    this.servicosService.salvarEdicaoServico(
      this.servicoEditandoId!,
      this.servicoEditandoNome.trim(),
      diasCiclo,
      this.servicoEditandoUnidade,
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
