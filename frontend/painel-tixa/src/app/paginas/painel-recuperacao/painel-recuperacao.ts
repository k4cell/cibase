import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientesService } from '../../services/clientes.service';
import { ConfiguracoesService } from '../../services/configuracoes.service';
import { EstatisticasService } from '../../services/estatisticas.service';
import { MotorService } from '../../services/motor.service';
import { ServicosService } from '../../services/servicos.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor, formatarCiclo, formatarData } from '../../utils/formatacao';
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
  // "Carteira" = todos os clientes com o pior status de cada um; "Situação por
  // serviço" = um card por serviço e, ao escolher um, abre uma aba com a
  // carteira só daquele serviço (quem já o comprou, do mais atrasado pro mais
  // em dia).
  subAba: 'carteira' | 'servico' = 'carteira';
  filtroAtual: string = 'Todos';
  // 'todos' na aba Carteira = visão geral; em Situação por serviço = nenhum
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
  readonly formatarData = formatarData;

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

  selecionarServico(servicoId: number) {
    this.servicoFiltroId = String(servicoId);
    this.filtroAtual = 'Todos';
  }

  // Fecha a aba do serviço e volta pros cards.
  fecharServico() {
    this.servicoFiltroId = 'todos';
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
    if (this.servicoFiltroId === 'todos') {
      if (this.filtroAtual === 'Todos') return this.clientesService.clientes;
      return this.clientesService.clientes.filter(cliente => this.statusServicoCliente(cliente.id).status === this.filtroAtual);
    }

    // Do mais atrasado (maior razão dias sem comprar / ciclo) pro mais em dia.
    return this.clientesService.clientes
      .filter(cliente => this.linhaDoServico(cliente.id) !== undefined)
      .filter(cliente => this.filtroAtual === 'Todos' || this.statusServicoCliente(cliente.id).status === this.filtroAtual)
      .sort((a, b) => this.linhaDoServico(b.id).razao - this.linhaDoServico(a.id).razao);
  }

  // Datas da carteira do serviço, derivadas da linha do motor: a última compra
  // é hoje menos os dias sem comprar, e a próxima prevista é ela mais o ciclo
  // esperado (negativo em 'diasParaProxima' = já passou do ciclo).
  datasDoServico(clienteId: number): { ultima: string; diasDesdeUltima: number; proxima: string; diasParaProxima: number } | null {
    const linha = this.linhaDoServico(clienteId);
    if (!linha) return null;
    return {
      ultima: this.dataIso(-linha.dias_sem_comprar),
      diasDesdeUltima: linha.dias_sem_comprar,
      proxima: this.dataIso(linha.ciclo_esperado - linha.dias_sem_comprar),
      diasParaProxima: linha.ciclo_esperado - linha.dias_sem_comprar
    };
  }

  // Data local (hoje + N dias) em aaaa-mm-dd, sem passar por UTC.
  private dataIso(diasAPartirDeHoje: number): string {
    const data = new Date();
    data.setDate(data.getDate() + diasAPartirDeHoje);
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  }

  textoProximaCompra(dias: number): string {
    if (dias === 0) return 'hoje';
    if (dias > 0) return dias === 1 ? 'em 1 dia' : `em ${dias} dias`;
    return dias === -1 ? 'atrasada há 1 dia' : `atrasada há ${-dias} dias`;
  }

  private linhaDoServico(clienteId: number): any {
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
    // Sem o nome do serviço no badge: a aba já se chama como ele.
    return { servicoNome: '', status: linha ? linha.status : 'Sem histórico', extras: 0 };
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
