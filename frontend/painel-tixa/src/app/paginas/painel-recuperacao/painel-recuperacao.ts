import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientesService } from '../../services/clientes.service';
import { ConfiguracoesService } from '../../services/configuracoes.service';
import { EstatisticasService } from '../../services/estatisticas.service';
import { MotorService } from '../../services/motor.service';
import { ServicosService } from '../../services/servicos.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor } from '../../utils/formatacao';
import { ArrastarRolarDirective } from '../../utils/arrastar-rolar.directive';

// Status do Serviço de cada cliente nesta tela: quando "Todos os serviços"
// está selecionado, é o pior status entre os serviços dele (igual antes);
// quando um serviço específico é escolhido, é o status SÓ daquele serviço --
// ausência de linha na classificação do motor = "Em dia" (nenhum problema
// pendente com esse serviço, dentro do ciclo esperado).
interface StatusServico { servicoNome: string; status: string; extras: number; }

@Component({
  selector: 'app-painel-recuperacao',
  standalone: true,
  imports: [CommonModule, FormsModule, ArrastarRolarDirective],
  templateUrl: './painel-recuperacao.html'
})
export class PainelRecuperacaoComponent implements OnInit, OnDestroy {
  filtroAtual: string = 'Todos';
  servicoFiltroId: string = 'todos';

  // Régua de Relacionamento -- morava em Configurações, mudou pra cá porque
  // é aqui que o efeito dela aparece de verdade (badge de oportunidade na Ficha).
  mostrarModalRegua: boolean = false;
  diasAtencaoEdicao: number = 30;
  diasRiscoEdicao: number = 90;
  salvandoRegua: boolean = false;

  readonly formatarValor = formatarValor;

  private desregistrar!: () => void;

  constructor(
    public clientesService: ClientesService,
    public configuracoesService: ConfiguracoesService,
    public estatisticasService: EstatisticasService,
    public motorService: MotorService,
    public servicosService: ServicosService,
    private cdr: ChangeDetectorRef,
    private refresco: RefrescoService
  ) {}

  ngOnInit() {
    this.desregistrar = this.refresco.registrar(() => this.cdr.detectChanges());
  }

  ngOnDestroy() {
    this.desregistrar();
  }

  definirFiltro(status: string) {
    this.filtroAtual = status;
  }

  obterClientesFiltrados() {
    if (this.filtroAtual === 'Todos') return this.clientesService.clientes;
    return this.clientesService.clientes.filter(cliente =>
      this.statusServicoCliente(cliente.id).status === this.filtroAtual
    );
  }

  // Nome + status do "Status do Serviço" no filtro/coluna atual -- ver a nota
  // no topo do arquivo sobre a diferença entre "Todos os serviços" e um
  // serviço específico selecionado.
  statusServicoCliente(clienteId: number): StatusServico {
    if (this.servicoFiltroId === 'todos') {
      return this.motorService.perfilMotorCliente(clienteId) || { servicoNome: '', status: 'Em dia', extras: 0 };
    }
    const linhas = this.motorService.classificacaoPorCliente[clienteId] || [];
    const linha = linhas.find(l => String(l.servico_id) === this.servicoFiltroId);
    return linha
      ? { servicoNome: linha.servico_nome, status: linha.status, extras: 0 }
      : { servicoNome: this.nomeServicoFiltro(), status: 'Em dia', extras: 0 };
  }

  private nomeServicoFiltro(): string {
    return this.servicosService.servicos.find(s => String(s.id) === this.servicoFiltroId)?.nome || '';
  }

  classeStatus(status: string): string {
    return this.motorService.classeStatus(status);
  }

  abrirWhatsApp(cliente: any) {
    this.clientesService.abrirWhatsApp(cliente, this.configuracoesService.diasAtencao, this.configuracoesService.diasRisco);
  }

  abrirModalRegua() {
    this.diasAtencaoEdicao = this.configuracoesService.diasAtencao;
    this.diasRiscoEdicao = this.configuracoesService.diasRisco;
    this.mostrarModalRegua = true;
  }

  fecharModalRegua() {
    this.mostrarModalRegua = false;
  }

  salvarRegua() {
    this.salvandoRegua = true;
    this.configuracoesService.salvarConfiguracoes(this.diasAtencaoEdicao, this.diasRiscoEdicao, (sucesso) => {
      this.salvandoRegua = false;
      if (sucesso) this.mostrarModalRegua = false;
    });
  }
}
