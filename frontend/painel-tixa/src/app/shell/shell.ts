import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../auth.service';
import { ToastService } from '../services/toast.service';
import { TemaService } from '../services/tema.service';
import { ClientesService } from '../services/clientes.service';
import { ServicosService } from '../services/servicos.service';
import { ConfiguracoesService } from '../services/configuracoes.service';
import { EstatisticasService } from '../services/estatisticas.service';
import { MotorService } from '../services/motor.service';
import { RefrescoService } from '../services/refresco.service';
import { formatarValor, formatarData, exibirTextoDias } from '../utils/formatacao';
import { ArrastarRolarDirective } from '../utils/arrastar-rolar.directive';

// Casca autenticada: navbar (marca + navegação + tema/cor + menu do usuário)
// e os modais que são compartilhados por 2+ páginas (Cadastro/Edição, Ficha,
// Nova Venda, Arquivar, Excluir Permanente) -- cada página só dispara essas
// ações através do ClientesService, quem desenha o modal é sempre aqui.
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, ArrastarRolarDirective],
  templateUrl: './shell.html'
})
export class ShellComponent implements OnInit, OnDestroy {
  mostrarSeletorCor: boolean = false;
  mostrarMenuUsuario: boolean = false;

  readonly formatarValor = formatarValor;
  readonly formatarData = formatarData;
  readonly exibirTextoDias = exibirTextoDias;

  private desregistrar!: () => void;

  constructor(
    public authService: AuthService,
    private router: Router,
    private toast: ToastService,
    public tema: TemaService,
    public clientesService: ClientesService,
    public servicosService: ServicosService,
    public configuracoesService: ConfiguracoesService,
    public estatisticasService: EstatisticasService,
    public motorService: MotorService,
    private cdr: ChangeDetectorRef,
    private refresco: RefrescoService
  ) {}

  ngOnInit() {
    this.desregistrar = this.refresco.registrar(() => this.cdr.detectChanges());

    // Só busca os dados agora que existe sessão de verdade (guard já
    // confirmou) -- e dispara tudo em paralelo, cada um no seu serviço.
    this.configuracoesService.carregarConfiguracoes(() => this.motorService.montarFilaDeHoje());
    this.estatisticasService.carregarEstatisticas();
    this.estatisticasService.carregarReceitaMensal();
    this.estatisticasService.carregarClientesPeriodo();
    this.estatisticasService.carregarRecuperadoNoMes();
    this.clientesService.carregarClientes(() => this.motorService.montarFilaDeHoje());
    this.clientesService.carregarClientesArquivados();
    this.servicosService.carregarServicos();
    this.motorService.carregarClassificacaoMotor();
  }

  ngOnDestroy() {
    this.desregistrar();
  }

  // Clicar fora fecha a paleta de cores e o menu do usuário. Escutamos o
  // documento inteiro em vez de usar uma "cortina" (backdrop) transparente
  // dentro da navbar: a navbar tem backdrop-filter, e isso faz um elemento
  // position:fixed dentro dela cobrir só a própria barra, não a tela toda --
  // por isso clicar no conteúdo da página não fechava nada.
  @HostListener('document:click', ['$event'])
  aoClicarNoDocumento(evento: MouseEvent) {
    const alvo = evento.target as HTMLElement | null;
    if (this.mostrarSeletorCor && !alvo?.closest('.tx-color-picker-wrap')) this.mostrarSeletorCor = false;
    if (this.mostrarMenuUsuario && !alvo?.closest('.tx-user-menu-wrap')) this.mostrarMenuUsuario = false;
  }

  // Esc fecha o que estiver aberto por cima: menus da navbar ou a Ficha.
  @HostListener('document:keydown.escape')
  aoApertarEsc() {
    if (this.mostrarSeletorCor || this.mostrarMenuUsuario) {
      this.mostrarSeletorCor = false;
      this.mostrarMenuUsuario = false;
    } else if (this.clientesService.clienteDetalhe) {
      this.clientesService.fecharFichaCliente();
    }
  }

  // Clicar no fundo escurecido (fora do cartão) fecha a Ficha -- só quando o
  // clique COMEÇA no fundo, pra arrastar um texto de dentro pra fora não fechar.
  aoClicarNoFundoDaFicha(evento: MouseEvent) {
    if (evento.target === evento.currentTarget) this.clientesService.fecharFichaCliente();
  }

  sair() {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  mudarUsuario() {
    // Placeholder -- ainda não existe múltiplas contas na CiBase, isso entra
    // quando fizermos essa parte de verdade.
    this.mostrarMenuUsuario = false;
    this.toast.mostrar('Em breve.', '#ffc107');
  }

  formatarNome(event: any) {
    const input = event.target as HTMLInputElement;
    let valor = input.value.replace(/[0-9]/g, '');
    input.value = valor;
    this.clientesService.novoNome = valor;
  }

  formatarCpf(event: any) {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);

    if (v.length > 9) v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/^(\d{3})(\d+)/, '$1.$2');

    input.value = v;
    this.clientesService.novoCpf = v;
  }

  formatarTelefone(event: any) {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);

    if (v.length > 6) v = v.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d+)/, '($1) $2');

    input.value = v;
    this.clientesService.novoTelefone = v;
  }

  classificarOportunidade(cliente: any) {
    return this.clientesService.classificarOportunidade(
      cliente, this.configuracoesService.diasAtencao, this.configuracoesService.diasRisco
    );
  }

  abrirWhatsApp(cliente: any) {
    this.clientesService.abrirWhatsApp(cliente, this.configuracoesService.diasAtencao, this.configuracoesService.diasRisco);
  }

  // Nome de exibição vem do perfil (Configurações > Perfil) -- "Administrador"
  // é só o valor padrão pra contas que nunca definiram um nome.
  nomeUsuarioExibicao(): string {
    return this.authService.usuarioAtual?.displayName || 'Administrador';
  }

  inicialUsuario(): string {
    return this.nomeUsuarioExibicao().charAt(0).toUpperCase();
  }

  // Situação de cada serviço que o cliente aberto na Ficha já comprou (ver
  // services/motor.service.ts), do mais atrasado pro mais em dia.
  statusServicosCliente(clienteId: number | undefined): any[] {
    if (!clienteId) return [];
    return [...(this.motorService.classificacaoPorCliente[clienteId] || [])].sort((a, b) => b.razao - a.razao);
  }

  // "há 39 dias" da última compra do cliente (qualquer serviço) pro card da Ficha.
  diasDesdeUltimaCompra(cliente: any): string {
    if (!cliente?.ultima_compra || cliente.ultima_compra === 'Sem vendas') return 'nenhuma compra ainda';
    const dias = Math.floor((Date.now() - new Date(cliente.ultima_compra).getTime()) / (1000 * 3600 * 24));
    if (dias <= 0) return 'hoje';
    return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
  }
}
