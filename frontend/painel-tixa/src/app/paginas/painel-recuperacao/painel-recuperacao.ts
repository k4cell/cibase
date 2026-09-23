import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientesService } from '../../services/clientes.service';
import { ConfiguracoesService } from '../../services/configuracoes.service';
import { EstatisticasService } from '../../services/estatisticas.service';
import { MotorService } from '../../services/motor.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor } from '../../utils/formatacao';

@Component({
  selector: 'app-painel-recuperacao',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './painel-recuperacao.html'
})
export class PainelRecuperacaoComponent implements OnInit, OnDestroy {
  filtroAtual: string = 'Todos';

  readonly formatarValor = formatarValor;

  private desregistrar!: () => void;

  constructor(
    public clientesService: ClientesService,
    public configuracoesService: ConfiguracoesService,
    public estatisticasService: EstatisticasService,
    public motorService: MotorService,
    private cdr: ChangeDetectorRef,
    private refresco: RefrescoService
  ) {}

  ngOnInit() {
    this.desregistrar = this.refresco.registrar(() => this.cdr.detectChanges());
  }

  ngOnDestroy() {
    this.desregistrar();
  }

  definirFiltro(cor: string) {
    this.filtroAtual = cor;
  }

  obterClientesFiltrados() {
    if (this.filtroAtual === 'Todos') return this.clientesService.clientes;
    return this.clientesService.clientes.filter(cliente =>
      this.clientesService.classificarRisco(cliente.ultima_compra, this.configuracoesService.diasAtencao, this.configuracoesService.diasRisco) === this.filtroAtual
    );
  }

  perfilMotorCliente(clienteId: number) {
    return this.motorService.perfilMotorCliente(clienteId);
  }

  classeStatus(status: string): string {
    return this.motorService.classeStatus(status);
  }

  abrirWhatsApp(cliente: any) {
    this.clientesService.abrirWhatsApp(cliente, this.configuracoesService.diasAtencao, this.configuracoesService.diasRisco);
  }
}
