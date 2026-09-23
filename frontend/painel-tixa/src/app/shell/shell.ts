import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
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
import { formatarValor, exibirTextoDias } from '../utils/formatacao';
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

  // Status do motor por serviço (ver services/motor.service.ts) do cliente
  // aberto na Ficha -- só os serviços fora do "Em dia" aparecem aqui, os
  // demais estão implicitamente em dia.
  statusServicosCliente(clienteId: number | undefined): any[] {
    if (!clienteId) return [];
    return this.motorService.classificacaoPorCliente[clienteId] || [];
  }
}
