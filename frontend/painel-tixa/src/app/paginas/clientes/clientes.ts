import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ClientesService } from '../../services/clientes.service';
import { ConfiguracoesService } from '../../services/configuracoes.service';
import { VendasService } from '../../services/vendas.service';
import { EstatisticasService } from '../../services/estatisticas.service';
import { ToastService } from '../../services/toast.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor, formatarData } from '../../utils/formatacao';
import { ArrastarRolarDirective } from '../../utils/arrastar-rolar.directive';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, RouterLink, ArrastarRolarDirective],
  templateUrl: './clientes.html'
})
export class ClientesComponent implements OnInit, OnDestroy {
  importandoPlanilha: boolean = false;
  importandoVendas: boolean = false;

  readonly formatarValor = formatarValor;
  readonly formatarData = formatarData;

  private desregistrar!: () => void;

  constructor(
    public clientesService: ClientesService,
    public configuracoesService: ConfiguracoesService,
    private vendasService: VendasService,
    private estatisticasService: EstatisticasService,
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

  abrirWhatsApp(cliente: any) {
    this.clientesService.abrirWhatsApp(cliente, this.configuracoesService.diasAtencao, this.configuracoesService.diasRisco);
  }

  importarPlanilha(event: any) {
    const arquivo: File = event.target.files[0];
    if (!arquivo) return;

    const nomeArquivo = arquivo.name.toLowerCase();
    if (!nomeArquivo.endsWith('.csv') && !nomeArquivo.endsWith('.xlsx')) {
      this.toast.mostrar('Selecione um arquivo .csv ou .xlsx válido.', '#dc3545');
      event.target.value = '';
      return;
    }

    this.importandoPlanilha = true;
    this.clientesService.importarPlanilha(arquivo, () => {
      this.importandoPlanilha = false;
      event.target.value = '';
    });
  }

  importarVendas(event: any) {
    const arquivo: File = event.target.files[0];
    if (!arquivo) return;

    const nomeArquivo = arquivo.name.toLowerCase();
    if (!nomeArquivo.endsWith('.csv') && !nomeArquivo.endsWith('.xlsx')) {
      this.toast.mostrar('Selecione um arquivo .csv ou .xlsx válido.', '#dc3545');
      event.target.value = '';
      return;
    }

    this.importandoVendas = true;
    this.vendasService.importarVendas(arquivo, (sucesso) => {
      this.importandoVendas = false;
      event.target.value = '';
      if (sucesso) {
        this.clientesService.carregarClientes();
        this.estatisticasService.carregarEstatisticas();
        this.estatisticasService.carregarReceitaMensal();
        this.estatisticasService.carregarClientesPeriodo();
      }
    });
  }
}
