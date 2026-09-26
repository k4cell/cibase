import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MotorService } from '../../services/motor.service';
import { EstatisticasService } from '../../services/estatisticas.service';
import { ToastService } from '../../services/toast.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor, formatarData, classeCorServico, classeFaixaValor } from '../../utils/formatacao';
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

  // "Falar depois": cliente que respondeu "me procure mais tarde".
  contatadoParaAdiar: any = null;
  dataFalarDepois: string = '';
  salvandoDesfecho: boolean = false;

  readonly formatarValor = formatarValor;
  readonly formatarData = formatarData;
  readonly classeCorServico = classeCorServico;
  readonly classeFaixaValor = classeFaixaValor;

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
    // Sempre recarrega ao abrir: quem foi contatado agora há pouco (pela fila
    // ou pelos Adiados) tem que estar na lista, não só quem já estava na 1ª carga.
    if (aba === 'contatados') this.motorService.carregarContatados();
  }

  classeStatus(status: string): string {
    return this.motorService.classeStatus(status);
  }

  classeTextoStatus(status: string): string {
    return this.motorService.classeTextoStatus(status);
  }

  // Data local (hoje + N dias) em aaaa-mm-dd, sem passar por UTC.
  dataEmDias(dias: number): string {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  }

  registrarRecusa(contatado: any) {
    this.motorService.registrarDesfecho(contatado, 'recusou', null, () => this.cdr.detectChanges());
  }

  abrirFalarDepois(contatado: any) {
    this.contatadoParaAdiar = contatado;
    this.dataFalarDepois = this.dataEmDias(30);
  }

  fecharFalarDepois() {
    this.contatadoParaAdiar = null;
  }

  confirmarFalarDepois() {
    if (!this.contatadoParaAdiar) return;
    if (!this.dataFalarDepois || this.dataFalarDepois <= this.dataEmDias(0)) {
      this.toast.mostrar('Escolha uma data depois de hoje.', '#ffc107');
      return;
    }

    this.salvandoDesfecho = true;
    this.motorService.registrarDesfecho(this.contatadoParaAdiar, 'adiar_com_data', this.dataFalarDepois, (sucesso) => {
      this.salvandoDesfecho = false;
      if (sucesso) this.contatadoParaAdiar = null;
      this.cdr.detectChanges();
    });
  }

  // Clientes distintos -- a mesma pessoa contatada duas vezes (ou por dois
  // serviços) que voltou a comprar conta uma vez só.
  clientesReativados(): number {
    const ids = new Set(this.motorService.contatados.filter(c => c.reativado).map(c => c.cliente_id));
    return ids.size;
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
