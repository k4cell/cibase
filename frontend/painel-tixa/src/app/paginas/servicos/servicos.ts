import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServicosService } from '../../services/servicos.service';
import { MotorService } from '../../services/motor.service';
import { ToastService } from '../../services/toast.service';
import { RefrescoService } from '../../services/refresco.service';
import { DIAS_POR_MES, formatarCiclo } from '../../utils/formatacao';

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
  importandoServicos: boolean = false;

  servicoEditandoId: number | null = null;
  servicoEditandoNome: string = '';
  servicoEditandoCiclo: number | null = null;
  servicoEditandoUnidade: 'dias' | 'meses' = 'dias';
  servicoEditandoMensagem: string = '';
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
    const ciclo = formatarCiclo(servico);
    return ciclo ? `${ciclo} de ciclo esperado` : 'Ciclo ainda não definido';
  }

  importarServicos(event: any) {
    const arquivo: File = event.target.files[0];
    if (!arquivo) return;

    const nomeArquivo = arquivo.name.toLowerCase();
    if (!nomeArquivo.endsWith('.csv') && !nomeArquivo.endsWith('.xlsx')) {
      this.toast.mostrar('Selecione um arquivo .csv ou .xlsx válido.', '#dc3545');
      event.target.value = '';
      return;
    }

    this.importandoServicos = true;
    this.servicosService.importarServicos(arquivo, (sucesso) => {
      this.importandoServicos = false;
      event.target.value = '';
      // Ciclo novo muda o status de quem já comprou o serviço e a fila de hoje.
      if (sucesso) {
        this.motorService.carregarClassificacaoMotor();
        this.motorService.montarFilaDeHoje();
      }
    });
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
    this.servicoEditandoMensagem = servico.mensagem_modelo || '';
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
      this.servicoEditandoMensagem,
      () => {
        this.servicoEditandoId = null;
        // mudar o ciclo ou o nome reflete no status de cada cliente e na fila de hoje
        this.motorService.carregarClassificacaoMotor();
        this.motorService.montarFilaDeHoje();
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
