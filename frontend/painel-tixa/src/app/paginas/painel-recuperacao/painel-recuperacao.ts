import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientesService } from '../../services/clientes.service';
import { ConfiguracoesService } from '../../services/configuracoes.service';
import { EstatisticasService } from '../../services/estatisticas.service';
import { MotorService } from '../../services/motor.service';
import { ServicosService } from '../../services/servicos.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor, formatarCiclo } from '../../utils/formatacao';
import { ArrastarRolarDirective } from '../../utils/arrastar-rolar.directive';

// Status do Serviço de cada cliente nesta tela -- SEMPRE pela última compra:
// na Carteira é o pior status entre os serviços dele; escolhendo um serviço,
// é o status só daquele serviço. "Em dia" = comprou e ainda está dentro do
// ciclo. Cliente sem nenhuma compra é "Sem histórico" (não dá pra dizer que
// está em dia sem ter comprado nada).
interface StatusServico { servicoNome: string; status: string; extras: number; }

// Ordem em que os status aparecem nos chips dos cards de resumo.
const STATUS_RESUMO = ['Recompra próxima', 'Atrasado', 'Adormecido', 'Frio', 'Em dia'];

@Component({
  selector: 'app-painel-recuperacao',
  standalone: true,
  imports: [CommonModule, FormsModule, ArrastarRolarDirective],
  templateUrl: './painel-recuperacao.html'
})
export class PainelRecuperacaoComponent implements OnInit, OnDestroy {
  // "Carteira" = todos os clientes com o pior status de cada um; "Por serviço"
  // = um card por serviço e, ao escolher um, a mesma tabela só daquele serviço.
  subAba: 'carteira' | 'servico' = 'carteira';
  filtroAtual: string = 'Todos';
  // 'todos' na aba Carteira = visão geral; na aba Por serviço = nenhum
  // serviço escolhido ainda (só os cards aparecem).
  servicoFiltroId: string = 'todos';

  // Régua de Relacionamento -- morava em Configurações, mudou pra cá porque
  // é aqui que o efeito dela aparece de verdade (badge de oportunidade na Ficha).
  mostrarModalRegua: boolean = false;
  diasAtencaoEdicao: number = 30;
  diasRiscoEdicao: number = 90;
  salvandoRegua: boolean = false;

  readonly formatarValor = formatarValor;
  readonly formatarCiclo = formatarCiclo;

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

  trocarSubAba(aba: 'carteira' | 'servico') {
    this.subAba = aba;
    // Cada aba começa limpa -- um filtro de status ou serviço escolhido numa
    // não pode "vazar" pra outra e deixar a tabela vazia sem explicação.
    this.filtroAtual = 'Todos';
    this.servicoFiltroId = 'todos';
  }

  // Clicar no card já escolhido desmarca (volta a só os cards).
  selecionarServico(servicoId: number) {
    const id = String(servicoId);
    this.servicoFiltroId = this.servicoFiltroId === id ? 'todos' : id;
    this.filtroAtual = 'Todos';
  }

  resumoPorServico() {
    const contagem: { [servicoId: number]: { [status: string]: number } } = {};
    for (const linhas of Object.values(this.motorService.classificacaoPorCliente)) {
      for (const linha of linhas) {
        const porStatus = (contagem[linha.servico_id] ??= {});
        porStatus[linha.status] = (porStatus[linha.status] || 0) + 1;
      }
    }

    return this.servicosService.servicos.map(servico => {
      const porStatus = contagem[servico.id] || {};
      const contagens = STATUS_RESUMO
        .map(status => ({ status, qtd: porStatus[status] || 0 }))
        .filter(c => c.qtd > 0);
      return { servico, contagens };
    });
  }

  trackPorServico(_indice: number, resumo: { servico: any }) {
    return resumo.servico.id;
  }

  servicoSelecionado(): any {
    return this.servicosService.servicos.find(s => String(s.id) === this.servicoFiltroId) || null;
  }

  obterClientesFiltrados() {
    // Num serviço específico só entra quem JÁ comprou aquele serviço --
    // quem nunca comprou não tem situação nenhuma nele pra mostrar.
    const base = this.servicoFiltroId === 'todos'
      ? this.clientesService.clientes
      : this.clientesService.clientes.filter(cliente => this.linhaDoServico(cliente.id) !== undefined);

    if (this.filtroAtual === 'Todos') return base;
    return base.filter(cliente => this.statusServicoCliente(cliente.id).status === this.filtroAtual);
  }

  private linhaDoServico(clienteId: number) {
    return (this.motorService.classificacaoPorCliente[clienteId] || [])
      .find(l => String(l.servico_id) === this.servicoFiltroId);
  }

  // Nome + status do "Status do Serviço" no filtro/coluna atual -- ver a nota
  // no topo do arquivo sobre a diferença entre "Todos os serviços" e um
  // serviço específico selecionado.
  statusServicoCliente(clienteId: number): StatusServico {
    if (this.servicoFiltroId === 'todos') {
      const perfil = this.motorService.perfilMotorCliente(clienteId);
      if (perfil) return perfil;
      const status = this.motorService.temHistoricoDeCompra(clienteId) ? 'Em dia' : 'Sem histórico';
      return { servicoNome: '', status, extras: 0 };
    }

    const linha = this.linhaDoServico(clienteId);
    return linha
      ? { servicoNome: linha.servico_nome, status: linha.status, extras: 0 }
      : { servicoNome: '', status: 'Sem histórico', extras: 0 };
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
