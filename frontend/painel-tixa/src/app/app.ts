import { Component, OnInit, ChangeDetectorRef, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';
import { API_BASE_URL } from './api.config';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit {
  // ==============================================================================
  // MEMÓRIAS DE ESTADO (VARIÁVEIS GLOBAIS)
  // ==============================================================================
  clientes: any[] = [];
  clientesArquivados: any[] = [];

  novoNome: string = '';
  novoTelefone: string = '';
  novoCpf: string = ''; 
  novoEmail: string = ''; 
  novoDataNascimento: string = ''; 
  clienteEditandoId: number | null = null;

  clienteVendaId: number | null = null;
  clienteVendaNome: string = '';
  novaVendaValor: number | null = null;
  novaVendaServicoId: string = '';

  // Controle do menu de navegação (abas)
  abaAtiva: string = 'inicio';

  clienteDetalhe: any = null;
  vendasClienteDetalhe: any[] = [];
  carregandoVendasDetalhe: boolean = false;

  mostrarModalCadastro: boolean = false;
  salvandoCliente: boolean = false;
  filtroAtual: string = 'Todos';

  toastMensagem: string = '';
  toastCor: string = '';
  toastVisivel: boolean = false;
  toastTimeoutId: any = null;

  totalRecuperado: number = 0;
  clientesReativados: number = 0;
  receitaMensal: any[] = [];

  // Memórias de Segurança (Login)
  estaLogado: boolean = false;
  loginEmail: string = '';
  loginSenha: string = '';
  carregandoLogin: boolean = false;
  mostrarSenhaLogin: boolean = false;

  // Importação de clientes via planilha (CSV ou Excel)
  importandoPlanilha: boolean = false;
  importandoVendas: boolean = false;

  // Arquivamento de cliente (confirmação via modal, não mais confirm() nativo)
  clienteParaArquivar: any = null;
  arquivandoCliente: boolean = false;

  // Exclusão permanente (a partir da aba Arquivados)
  clienteParaExcluirPermanente: any = null;
  excluindoPermanente: boolean = false;

  // Régua de relacionamento (Farol de Risco) -- configurável em "Configurações",
  // usada em classificarOportunidade() e calcularRiscoCor(). 30/90 são só o
  // valor padrão até a configuração real chegar do backend após o login.
  configDiasAtencao: number = 30;
  configDiasRisco: number = 90;
  salvandoConfiguracoes: boolean = false;

  // Catálogo de serviços -- motor de recomendação: a unidade passa a ser
  // cliente + serviço, cada um com seu próprio ciclo esperado de recompra.
  servicos: any[] = [];
  novoServicoNome: string = '';
  novoServicoCiclo: number | null = null;
  salvandoServico: boolean = false;
  servicoEditandoId: number | null = null;
  servicoEditandoNome: string = '';
  servicoEditandoCiclo: number | null = null;
  salvandoEdicaoServico: boolean = false;
  servicoParaExcluir: any = null;
  excluindoServico: boolean = false;

  // Fila "Oportunidades de hoje" -- consome o motor de recomendação
  // (GET /motor/fila no backend: classificação por cliente+serviço, travas
  // e ordenação conforme o documento "motor-de-recomendacao.pdf"). Nunca
  // mostra mais do que LIMITE_FILA_HOJE por dia.
  readonly LIMITE_FILA_HOJE = 10;
  filaHoje: any[] = [];
  itemParaExcluirDaFila: any = null;
  clientesAdiados: any[] = [];
  mostrarAdiados: boolean = false;
  recuperadoNoMesAtual: number = 0;
  subAbaHoje: string = 'fila';
  servicoPorServicoId: string = 'todos';
  clientesPorServico: any[] = [];
  clientesPorServicoCarregados: boolean = false;
  filtroStatusPorServico: string = 'Todos';
  contatados: any[] = [];
  contatadosCarregados: boolean = false;

  // Cor de destaque (botões, aba ativa, links) -- só a marca/ação, nunca o
  // verde de receita nem o vermelho de risco, que têm significado próprio.
  // Guardado no localStorage do navegador (preferência de tela, não do negócio).
  mostrarSeletorCor: boolean = false;
  mostrarMenuUsuario: boolean = false;
  corSelecionada: string = 'Azul';

  // "soft"/"textSoft" são o fundo/texto suaves no tema escuro; "softClaro" é o
  // equivalente bem claro pro tema claro (o "border" já serve de texto escuro
  // nos dois casos, por isso não precisa de um par "textSoftClaro" à parte).
  readonly PALETAS_COR = [
    { nome: 'Azul',     primary: '#3b82f6', hover: '#60a5fa', soft: '#1e3a5f', softClaro: '#eff6ff', border: '#1d4ed8', textSoft: '#93c5fd', ring: 'rgba(59, 130, 246, 0.35)',  onPrimary: '#fff' },
    { nome: 'Violeta',  primary: '#8b5cf6', hover: '#a78bfa', soft: '#2e1f4d', softClaro: '#f5f3ff', border: '#6d28d9', textSoft: '#c4b5fd', ring: 'rgba(139, 92, 246, 0.35)',  onPrimary: '#fff' },
    { nome: 'Amarelo',  primary: '#eab308', hover: '#facc15', soft: '#3d2e06', softClaro: '#fefce8', border: '#a16207', textSoft: '#fde68a', ring: 'rgba(234, 179, 8, 0.35)',   onPrimary: '#1c1917' },
    { nome: 'Ciano',    primary: '#06b6d4', hover: '#22d3ee', soft: '#0e3a42', softClaro: '#ecfeff', border: '#0e7490', textSoft: '#67e8f9', ring: 'rgba(6, 182, 212, 0.35)',   onPrimary: '#fff' },
    { nome: 'Magenta',  primary: '#d946ef', hover: '#e879f9', soft: '#3d1a42', softClaro: '#fdf4ff', border: '#a21caf', textSoft: '#f0abfc', ring: 'rgba(217, 70, 239, 0.35)',  onPrimary: '#fff' },
    { nome: 'Laranja',  primary: '#f97316', hover: '#fb923c', soft: '#3d2410', softClaro: '#fff7ed', border: '#c2410c', textSoft: '#fdba74', ring: 'rgba(249, 115, 22, 0.35)',  onPrimary: '#fff' },
    { nome: 'Rosa',     primary: '#ec4899', hover: '#f472b6', soft: '#3d1830', softClaro: '#fdf2f8', border: '#be185d', textSoft: '#f9a8d4', ring: 'rgba(236, 72, 153, 0.35)',  onPrimary: '#fff' },
  ];

  // Tema claro/escuro -- troca os tokens de superfície/texto em runtime, do
  // mesmo jeito que a cor de destaque. "não definitivo" até aqui virou isto:
  // claro chegou, mas o mecanismo (CSS vars trocadas via JS) é o mesmo.
  temaAtual: 'escuro' | 'claro' = 'escuro';

  private readonly TEMAS: Record<'escuro' | 'claro', any> = {
    escuro: {
      bg: '#0f172a', surface: '#1e293b', surfaceAlt: '#263449', border: '#334155', borderStrong: '#475569',
      title: '#f1f5f9', body: '#cbd5e1', label: '#94a3b8', faint: '#64748b',
      emeraldSoft: '#064e3b', amberSoft: '#451a03', orangeSoft: '#431407', redSoft: '#450a0a',
      navbarBg: 'rgba(15, 23, 42, 0.85)',
      shadowXs: '0 1px 2px 0 rgb(0 0 0 / 0.3)',
      shadowSm: '0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4)',
      shadowMd: '0 4px 12px -2px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.4)',
      shadowLg: '0 24px 48px -16px rgb(0 0 0 / 0.65), 0 8px 16px -8px rgb(0 0 0 / 0.5)',
      dangerInk: '#f87171', dangerInkForte: '#fca5a5',
      warningInk: '#fbbf24', warningInkForte: '#fcd34d',
      orangeInk: '#fdba74',
      successInk: '#34d399', successInkForte: '#6ee7b7',
      oportunidade: {
        novoLead:         { fundo: '#0c3a5f', texto: '#93c5fd' },
        valiosoEmRisco:   { fundo: '#450a0a', texto: '#fca5a5' },
        adormecido:       { fundo: '#334155', texto: '#cbd5e1' },
        promotor:         { fundo: '#064e3b', texto: '#6ee7b7' },
        recompraProvavel: { fundo: '#451a03', texto: '#fcd34d' },
        recente:          { fundo: '#134e4a', texto: '#5eead4' },
      }
    },
    claro: {
      bg: '#f8fafc', surface: '#ffffff', surfaceAlt: '#f1f5f9', border: '#e2e8f0', borderStrong: '#cbd5e1',
      title: '#0f172a', body: '#334155', label: '#64748b', faint: '#94a3b8',
      emeraldSoft: '#d1fae5', amberSoft: '#fef3c7', orangeSoft: '#ffedd5', redSoft: '#fee2e2',
      navbarBg: 'rgba(255, 255, 255, 0.85)',
      shadowXs: '0 1px 2px 0 rgb(15 23 42 / 0.06)',
      shadowSm: '0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.08)',
      shadowMd: '0 4px 12px -2px rgb(15 23 42 / 0.1), 0 2px 4px -2px rgb(15 23 42 / 0.06)',
      shadowLg: '0 20px 40px -16px rgb(15 23 42 / 0.16), 0 8px 16px -8px rgb(15 23 42 / 0.08)',
      dangerInk: '#dc2626', dangerInkForte: '#b91c1c',
      warningInk: '#b45309', warningInkForte: '#92400e',
      orangeInk: '#c2410c',
      successInk: '#059669', successInkForte: '#047857',
      oportunidade: {
        novoLead:         { fundo: '#eff6ff', texto: '#1d4ed8' },
        valiosoEmRisco:   { fundo: '#fee2e2', texto: '#991b1b' },
        adormecido:       { fundo: '#f1f5f9', texto: '#475569' },
        promotor:         { fundo: '#d1fae5', texto: '#065f46' },
        recompraProvavel: { fundo: '#fef3c7', texto: '#92400e' },
        recente:          { fundo: '#f0fdfa', texto: '#0f766e' },
      }
    }
  };

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
    private authService: AuthService
  ) {}

  carregarCorSalva() {
    let nomeSalvo: string | null = null;
    try {
      nomeSalvo = localStorage.getItem('tx-cor-destaque');
    } catch {
      return;
    }

    const paleta = this.PALETAS_COR.find(p => p.nome === nomeSalvo);
    if (paleta) {
      this.corSelecionada = paleta.nome;
      this.aplicarPaleta(paleta);
    }
  }

  aplicarPaleta(paleta: any) {
    const estilo = this.elementRef.nativeElement.style;
    estilo.setProperty('--tx-primary', paleta.primary);
    estilo.setProperty('--tx-primary-hover', paleta.hover);
    estilo.setProperty('--tx-primary-soft', this.temaAtual === 'claro' ? paleta.softClaro : paleta.soft);
    estilo.setProperty('--tx-primary-border', paleta.border);
    estilo.setProperty('--tx-primary-text-soft', this.temaAtual === 'claro' ? paleta.border : paleta.textSoft);
    estilo.setProperty('--tx-primary-ring', paleta.ring);
    estilo.setProperty('--tx-on-primary', paleta.onPrimary);
  }

  selecionarCorDestaque(paleta: any) {
    this.corSelecionada = paleta.nome;
    this.aplicarPaleta(paleta);
    this.mostrarSeletorCor = false;
    try {
      localStorage.setItem('tx-cor-destaque', paleta.nome);
    } catch {
      // Preferência não persiste (ex: navegação privada) -- sem problema, só não sobrevive ao reload.
    }
  }

  aplicarTema(tema: 'escuro' | 'claro') {
    this.temaAtual = tema;
    const t = this.TEMAS[tema];
    const estilo = this.elementRef.nativeElement.style;
    estilo.setProperty('--tx-bg', t.bg);
    estilo.setProperty('--tx-surface', t.surface);
    estilo.setProperty('--tx-surface-alt', t.surfaceAlt);
    estilo.setProperty('--tx-border', t.border);
    estilo.setProperty('--tx-border-strong', t.borderStrong);
    estilo.setProperty('--tx-title', t.title);
    estilo.setProperty('--tx-body', t.body);
    estilo.setProperty('--tx-label', t.label);
    estilo.setProperty('--tx-faint', t.faint);
    estilo.setProperty('--tx-emerald-soft', t.emeraldSoft);
    estilo.setProperty('--tx-amber-soft', t.amberSoft);
    estilo.setProperty('--tx-orange-soft', t.orangeSoft);
    estilo.setProperty('--tx-red-soft', t.redSoft);
    estilo.setProperty('--tx-navbar-bg', t.navbarBg);
    estilo.setProperty('--tx-shadow-xs', t.shadowXs);
    estilo.setProperty('--tx-shadow-sm', t.shadowSm);
    estilo.setProperty('--tx-shadow-md', t.shadowMd);
    estilo.setProperty('--tx-shadow-lg', t.shadowLg);
    estilo.setProperty('--tx-danger-ink', t.dangerInk);
    estilo.setProperty('--tx-danger-ink-forte', t.dangerInkForte);
    estilo.setProperty('--tx-warning-ink', t.warningInk);
    estilo.setProperty('--tx-warning-ink-forte', t.warningInkForte);
    estilo.setProperty('--tx-orange-ink', t.orangeInk);
    estilo.setProperty('--tx-success-ink', t.successInk);
    estilo.setProperty('--tx-success-ink-forte', t.successInkForte);

    // soft/textSoft da cor de destaque dependem do tema -- reaplica.
    const paleta = this.PALETAS_COR.find(p => p.nome === this.corSelecionada);
    if (paleta) this.aplicarPaleta(paleta);
  }

  alternarTema() {
    const novo = this.temaAtual === 'escuro' ? 'claro' : 'escuro';
    this.aplicarTema(novo);
    try {
      localStorage.setItem('tx-tema', novo);
    } catch {
      // Preferência não persiste (ex: navegação privada) -- sem problema, só não sobrevive ao reload.
    }
  }

  carregarTemaSalvo() {
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem('tx-tema');
    } catch {
      salvo = null;
    }
    this.aplicarTema(salvo === 'claro' ? 'claro' : 'escuro');
  }

  ngOnInit() {
    // A tela abre em branco de propósito. Os dados só serão carregados APÓS o login!
    this.carregarCorSalva();
    this.carregarTemaSalvo();
  }

  // ==============================================================================
  // SISTEMA DE LOGIN E SEGURANÇA
  // ==============================================================================
  async fazerLogin() {
    if (!this.loginEmail || !this.loginSenha) {
      this.mostrarToast('Preencha o e-mail e a senha para entrar.', '#ffc107');
      return;
    }

    this.carregandoLogin = true;

    try {
      // O Firebase confere e-mail/senha nos servidores dele -- se der certo,
      // authService.usuarioAtual passa a existir e já dá pra pedir um token.
      await this.authService.login(this.loginEmail, this.loginSenha);

      this.carregandoLogin = false;
      this.estaLogado = true; // Libera o painel
      this.abaAtiva = 'inicio'; // Login sempre cai na Home, nunca numa aba residual
      this.mostrarToast('Bem-vindo ao Painel Tixa!', '#28a745');

      // Somente AGORA buscamos o dinheiro e os clientes no banco de dados!
      this.carregarConfiguracoes();
      this.carregarEstatisticas();
      this.carregarReceitaMensal();
      this.carregarClientesPeriodo();
      this.carregarRecuperadoNoMes();
      this.carregarClientes();
      this.carregarClientesArquivados();
      this.carregarServicos();
    } catch (erro: any) {
      this.carregandoLogin = false;
      this.mostrarToast(this.mensagemErroLogin(erro?.code), '#dc3545');
    }

    this.cdr.detectChanges();
  }

  private mensagemErroLogin(codigo: string): string {
    // O Firebase manda um "código" (ex: auth/invalid-credential) em vez de
    // uma frase pronta -- traduzimos os mais comuns pra português.
    switch (codigo) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha incorretos.';
      case 'auth/invalid-email':
        return 'E-mail inválido.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas erradas. Espere um pouco e tente de novo.';
      default:
        return 'Não foi possível entrar. Verifique sua conexão.';
    }
  }

  sair() {
    this.authService.logout();
    this.estaLogado = false;
    this.loginSenha = '';
  }

  mudarUsuario() {
    // Placeholder -- ainda não existe múltiplas contas no Tixa, isso entra
    // quando fizermos essa parte de verdade.
    this.mostrarMenuUsuario = false;
    this.mostrarToast('Em breve.', '#ffc107');
  }

  esqueciSenha() {
    // Placeholder -- fluxo de redefinição de senha do Firebase ainda não
    // está ligado na tela.
    this.mostrarToast('Em breve.', '#ffc107');
  }

  criarConta() {
    // Placeholder -- cadastro de conta ainda não está ligado na tela.
    this.mostrarToast('Em breve.', '#ffc107');
  }

  // ==============================================================================
  // FORMATAÇÃO VISUAL E MÁSCARAS
  // ==============================================================================
  formatarNome(event: any) {
    const input = event.target as HTMLInputElement;
    let valor = input.value.replace(/[0-9]/g, '');
    input.value = valor; 
    this.novoNome = valor;
  }

  formatarCpf(event: any) {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, ''); 
    if (v.length > 11) v = v.substring(0, 11);
    
    if (v.length > 9) v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/^(\d{3})(\d+)/, '$1.$2');
    
    input.value = v;
    this.novoCpf = v;
  }

  formatarTelefone(event: any) {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, ''); 
    if (v.length > 11) v = v.substring(0, 11);
    
    if (v.length > 6) v = v.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d+)/, '($1) $2');
    
    input.value = v; 
    this.novoTelefone = v;
  }

  // ==============================================================================
  // COMUNICAÇÃO COM O BACKEND
  // ==============================================================================
  carregarClientes() {
    this.http.get<any>(`${API_BASE_URL}/clientes`).subscribe({
      next: (dados) => {
        this.clientes = dados.clientes;
        this.montarFilaDeHoje();
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao conectar com o banco de clientes.', '#dc3545')
    });
  }

  carregarClientesArquivados() {
    this.http.get<any>(`${API_BASE_URL}/clientes/arquivados`).subscribe({
      next: (dados) => {
        this.clientesArquivados = dados.clientes;
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao conectar com o banco de arquivados.', '#dc3545')
    });
  }

  salvarCliente() {
    const nomeLimpo = this.novoNome.trim(); 
    const cpfLimpo = this.novoCpf.replace(/\D/g, ''); 
    const telefoneLimpo = this.novoTelefone.replace(/\D/g, ''); 

    if (!nomeLimpo || !this.novoTelefone || !this.novoCpf || !this.novoEmail || !this.novoDataNascimento) {
      this.mostrarToast('Por favor, preencha todos os campos.', '#dc3545');
      return; 
    }
    if (nomeLimpo.length < 3) {
      this.mostrarToast('O nome do cliente deve ter no mínimo 3 letras.', '#dc3545');
      return;
    }
    if (cpfLimpo.length !== 11) {
      this.mostrarToast('CPF inválido! O CPF deve ter exatamente 11 números.', '#dc3545');
      return;
    }
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
      this.mostrarToast('Telefone inválido!', '#ffc107');
      return;
    }

    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    if (!regexEmail.test(this.novoEmail)) {
      this.mostrarToast('E-mail inválido.', '#dc3545');
      return;
    }

    // O regex acima aceita qualquer TLD de 2-4 letras, então "gmail.co" passa
    // como formato válido -- mas não existe esse domínio, é sempre um "gmail.com"
    // digitado errado. Só barra quando bate com o NOME de um provedor conhecido
    // seguido de ponto (evita falso positivo em domínio próprio tipo "empresa.co").
    const dominiosConhecidos: Record<string, string> = {
      gmail: 'gmail.com', hotmail: 'hotmail.com', outlook: 'outlook.com',
      yahoo: 'yahoo.com', icloud: 'icloud.com', live: 'live.com'
    };
    const dominioDigitado = (this.novoEmail.split('@')[1] || '').toLowerCase();
    const provedor = Object.keys(dominiosConhecidos).find(p => dominioDigitado.startsWith(p + '.'));
    if (provedor && dominioDigitado !== dominiosConhecidos[provedor]) {
      const usuario = this.novoEmail.split('@')[0];
      this.mostrarToast(`E-mail inválido. Você quis dizer "${usuario}@${dominiosConhecidos[provedor]}"?`, '#dc3545');
      return;
    }

    const dadosDoFormulario = {
      nome: nomeLimpo,
      telefone: this.novoTelefone,
      cpf: this.novoCpf,
      email: this.novoEmail,
      data_nascimento: this.novoDataNascimento
    };

    this.salvandoCliente = true; 

    if (this.clienteEditandoId) {
      this.http.put<any>(`${API_BASE_URL}/clientes/${this.clienteEditandoId}`, dadosDoFormulario).subscribe({
        next: (resposta) => {
          this.salvandoCliente = false; 
          if (resposta.erro) {
            this.mostrarToast('Atenção: ' + resposta.erro, '#ffc107'); 
          } else {
            this.mostrarToast('Cliente atualizado com sucesso!', '#28a745');
            this.fecharModalCadastro(); 
            this.carregarClientes(); 
          }
        },
        error: (erro) => {
          this.salvandoCliente = false; 
          this.mostrarToast('Falha ao atualizar o cliente.', '#dc3545');
        }
      });
    } else {
      this.http.post<any>(`${API_BASE_URL}/clientes`, dadosDoFormulario).subscribe({
        next: (resposta) => {
          this.salvandoCliente = false; 
          if (resposta.erro) {
            this.mostrarToast('Atenção: ' + resposta.erro, '#ffc107'); 
          } else {
            this.mostrarToast('Cliente cadastrado com sucesso!', '#28a745');
            this.fecharModalCadastro(); 
            this.carregarClientes();
          }
        },
        error: (erro) => {
          this.salvandoCliente = false;
          this.mostrarToast('Falha ao salvar o cliente.', '#dc3545');
        }
      });
    }
  }

  importarPlanilha(event: any) {
    const arquivo: File = event.target.files[0];
    if (!arquivo) return;

    const nomeArquivo = arquivo.name.toLowerCase();
    if (!nomeArquivo.endsWith('.csv') && !nomeArquivo.endsWith('.xlsx')) {
      this.mostrarToast('Selecione um arquivo .csv ou .xlsx válido.', '#dc3545');
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('arquivo', arquivo);

    this.importandoPlanilha = true;

    this.http.post<any>(`${API_BASE_URL}/importar-clientes`, formData).subscribe({
      next: (resposta) => {
        this.importandoPlanilha = false;
        event.target.value = '';

        if (resposta.erro) {
          this.mostrarToast(resposta.erro, '#dc3545');
          return;
        }

        const inseridos = resposta.clientes_inseridos;
        const duplicados = resposta.clientes_ignorados_por_duplicidade;
        const incompletos = resposta.clientes_ignorados_por_dados_incompletos || 0;
        const vendasInseridas = resposta.vendas_inseridas || 0;
        const vendasSemCliente = resposta.vendas_ignoradas_sem_cliente_correspondente || 0;

        const partes: string[] = [];
        if (inseridos > 0) partes.push(inseridos === 1 ? '1 cliente novo cadastrado' : `${inseridos} clientes novos cadastrados`);
        if (duplicados > 0) partes.push(duplicados === 1 ? '1 já estava cadastrado (CPF repetido)' : `${duplicados} já estavam cadastrados (CPF repetido)`);
        if (incompletos > 0) partes.push(incompletos === 1 ? '1 linha ignorada por dados incompletos' : `${incompletos} linhas ignoradas por dados incompletos`);
        if (vendasInseridas > 0) partes.push(vendasInseridas === 1 ? '1 venda importada' : `${vendasInseridas} vendas importadas`);
        if (vendasSemCliente > 0) partes.push(vendasSemCliente === 1 ? '1 venda ignorada (CPF não encontrado)' : `${vendasSemCliente} vendas ignoradas (CPF não encontrado)`);

        const mensagem = partes.length > 0 ? partes.join('. ') + '.' : 'Nenhum cliente encontrado no arquivo.';
        const cor = (inseridos > 0 || vendasInseridas > 0) ? '#28a745' : '#ffc107';

        this.mostrarToast(mensagem, cor);
        this.carregarClientes();
        this.carregarEstatisticas();
        this.carregarReceitaMensal();
        this.carregarClientesPeriodo();
      },
      error: (erro) => {
        this.importandoPlanilha = false;
        event.target.value = '';
        this.mostrarToast('Falha ao importar a planilha.', '#dc3545');
      }
    });
  }

  importarVendas(event: any) {
    const arquivo: File = event.target.files[0];
    if (!arquivo) return;

    const nomeArquivo = arquivo.name.toLowerCase();
    if (!nomeArquivo.endsWith('.csv') && !nomeArquivo.endsWith('.xlsx')) {
      this.mostrarToast('Selecione um arquivo .csv ou .xlsx válido.', '#dc3545');
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('arquivo', arquivo);

    this.importandoVendas = true;

    this.http.post<any>(`${API_BASE_URL}/importar-vendas`, formData).subscribe({
      next: (resposta) => {
        this.importandoVendas = false;
        event.target.value = '';

        if (resposta.erro) {
          this.mostrarToast(resposta.erro, '#dc3545');
          return;
        }

        const inseridas = resposta.vendas_inseridas;
        const semCliente = resposta.vendas_ignoradas_sem_cliente_correspondente || 0;
        const invalidas = resposta.vendas_ignoradas_por_dados_invalidos || 0;

        const partes: string[] = [];
        if (inseridas > 0) partes.push(inseridas === 1 ? '1 venda importada' : `${inseridas} vendas importadas`);
        if (semCliente > 0) partes.push(semCliente === 1 ? '1 venda ignorada (CPF não encontrado na base)' : `${semCliente} vendas ignoradas (CPF não encontrado na base)`);
        if (invalidas > 0) partes.push(invalidas === 1 ? '1 linha ignorada por dados inválidos' : `${invalidas} linhas ignoradas por dados inválidos`);

        const mensagem = partes.length > 0 ? partes.join('. ') + '.' : 'Nenhuma venda encontrada no arquivo.';
        this.mostrarToast(mensagem, inseridas > 0 ? '#28a745' : '#ffc107');

        this.carregarClientes();
        this.carregarEstatisticas();
        this.carregarReceitaMensal();
        this.carregarClientesPeriodo();
      },
      error: (erro) => {
        this.importandoVendas = false;
        event.target.value = '';
        this.mostrarToast('Falha ao importar a planilha de vendas.', '#dc3545');
      }
    });
  }

  abrirConfirmacaoArquivar(cliente: any) {
    this.clienteParaArquivar = cliente;
  }

  fecharConfirmacaoArquivar() {
    this.clienteParaArquivar = null;
  }

  confirmarArquivamento() {
    if (!this.clienteParaArquivar) return;
    const id = this.clienteParaArquivar.id;

    this.arquivandoCliente = true;

    this.http.delete<any>(`${API_BASE_URL}/clientes/${id}`).subscribe({
      next: (resposta) => {
        this.arquivandoCliente = false;
        this.clienteParaArquivar = null;

        if (resposta.erro) {
          this.mostrarToast('Atenção: ' + resposta.erro, '#ffc107');
        } else {
          this.mostrarToast('Cliente arquivado com sucesso!', '#28a745');
          this.carregarClientes();
          this.carregarClientesArquivados();
        }
      },
      error: (erro) => {
        this.arquivandoCliente = false;
        this.clienteParaArquivar = null;
        this.mostrarToast('Falha ao arquivar cliente.', '#dc3545');
      }
    });
  }

  reativarCliente(cliente: any) {
    this.http.put<any>(`${API_BASE_URL}/clientes/${cliente.id}/reativar`, {}).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          this.mostrarToast('Atenção: ' + resposta.erro, '#ffc107');
        } else {
          this.mostrarToast('Cliente reativado com sucesso!', '#28a745');
          this.carregarClientes();
          this.carregarClientesArquivados();
        }
      },
      error: (erro) => this.mostrarToast('Falha ao reativar cliente.', '#dc3545')
    });
  }

  abrirConfirmacaoExclusaoPermanente(cliente: any) {
    this.clienteParaExcluirPermanente = cliente;
  }

  fecharConfirmacaoExclusaoPermanente() {
    this.clienteParaExcluirPermanente = null;
  }

  confirmarExclusaoPermanente() {
    if (!this.clienteParaExcluirPermanente) return;
    const id = this.clienteParaExcluirPermanente.id;

    this.excluindoPermanente = true;

    this.http.delete<any>(`${API_BASE_URL}/clientes/${id}/permanente`).subscribe({
      next: (resposta) => {
        this.excluindoPermanente = false;
        this.clienteParaExcluirPermanente = null;

        if (resposta.erro) {
          this.mostrarToast('Atenção: ' + resposta.erro, '#ffc107');
        } else {
          this.mostrarToast('Cliente excluído permanentemente.', '#28a745');
          this.carregarClientesArquivados();
          this.carregarEstatisticas();
          this.carregarReceitaMensal();
          this.carregarClientesPeriodo();
        }
      },
      error: (erro) => {
        this.excluindoPermanente = false;
        this.clienteParaExcluirPermanente = null;
        this.mostrarToast('Falha ao excluir cliente permanentemente.', '#dc3545');
      }
    });
  }

  // ==============================================================================
  // INTELIGÊNCIA COMERCIAL E DASHBOARD
  // ==============================================================================
  carregarEstatisticas() {
    this.http.get<any>(`${API_BASE_URL}/estatisticas`).subscribe({
      next: (dados) => {
        this.totalRecuperado = dados.total_recuperado;
        this.clientesReativados = dados.clientes_reativados;
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao calcular as estatísticas.', '#dc3545')
    });
  }

  carregarConfiguracoes() {
    this.http.get<any>(`${API_BASE_URL}/configuracoes`).subscribe({
      next: (dados) => {
        if (!dados.erro) {
          this.configDiasAtencao = dados.dias_atencao;
          this.configDiasRisco = dados.dias_risco;
          this.montarFilaDeHoje();
          this.cdr.detectChanges();
        }
      },
      error: (erro) => this.mostrarToast('Falha ao carregar as configurações.', '#dc3545')
    });
  }

  carregarRecuperadoNoMes() {
    this.http.get<any>(`${API_BASE_URL}/estatisticas/receita-mensal?unidade=mes&quantidade=1&passo=1`).subscribe({
      next: (dados) => {
        const meses = dados.meses || [];
        this.recuperadoNoMesAtual = meses.length ? meses[meses.length - 1].valor : 0;
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao calcular o recuperado no mês.', '#dc3545')
    });
  }

  salvarConfiguracoes() {
    if (this.configDiasAtencao <= 0 || this.configDiasRisco <= 0) {
      this.mostrarToast('Os prazos precisam ser maiores que zero.', '#ffc107');
      return;
    }
    if (this.configDiasAtencao >= this.configDiasRisco) {
      this.mostrarToast('O prazo de "Atenção" precisa ser menor que o de "Risco Alto".', '#ffc107');
      return;
    }

    this.salvandoConfiguracoes = true;
    const dados = { dias_atencao: this.configDiasAtencao, dias_risco: this.configDiasRisco };

    this.http.put<any>(`${API_BASE_URL}/configuracoes`, dados).subscribe({
      next: (resposta) => {
        this.salvandoConfiguracoes = false;
        if (resposta.erro) {
          this.mostrarToast(resposta.erro, '#ffc107');
        } else {
          this.mostrarToast('Configurações salvas! O farol de risco já está atualizado.', '#28a745');
        }
      },
      error: (erro) => {
        this.salvandoConfiguracoes = false;
        this.mostrarToast('Falha ao salvar as configurações.', '#dc3545');
      }
    });
  }

  carregarServicos() {
    this.http.get<any>(`${API_BASE_URL}/servicos`).subscribe({
      next: (dados) => {
        this.servicos = dados.servicos || [];
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao carregar o catálogo de serviços.', '#dc3545')
    });
  }

  adicionarServico() {
    if (!this.novoServicoNome.trim()) {
      this.mostrarToast('Dê um nome ao serviço.', '#ffc107');
      return;
    }
    if (!this.novoServicoCiclo || this.novoServicoCiclo <= 0) {
      this.mostrarToast('Informe o ciclo esperado em dias.', '#ffc107');
      return;
    }

    this.salvandoServico = true;
    const dados = { nome: this.novoServicoNome.trim(), dias_ciclo: this.novoServicoCiclo };

    this.http.post<any>(`${API_BASE_URL}/servicos`, dados).subscribe({
      next: (resposta) => {
        this.salvandoServico = false;
        if (resposta.erro) {
          this.mostrarToast(resposta.erro, '#ffc107');
        } else {
          this.mostrarToast('Serviço cadastrado!', '#28a745');
          this.novoServicoNome = '';
          this.novoServicoCiclo = null;
          this.carregarServicos();
        }
      },
      error: (erro) => {
        this.salvandoServico = false;
        this.mostrarToast('Falha ao cadastrar o serviço.', '#dc3545');
      }
    });
  }

  iniciarEdicaoServico(servico: any) {
    this.servicoEditandoId = servico.id;
    this.servicoEditandoNome = servico.nome;
    this.servicoEditandoCiclo = servico.dias_ciclo ?? null;
  }

  cancelarEdicaoServico() {
    this.servicoEditandoId = null;
  }

  salvarEdicaoServico() {
    if (!this.servicoEditandoNome.trim()) {
      this.mostrarToast('Dê um nome ao serviço.', '#ffc107');
      return;
    }
    if (!this.servicoEditandoCiclo || this.servicoEditandoCiclo <= 0) {
      this.mostrarToast('Informe o ciclo esperado em dias.', '#ffc107');
      return;
    }

    this.salvandoEdicaoServico = true;
    const dados = { nome: this.servicoEditandoNome.trim(), dias_ciclo: this.servicoEditandoCiclo };

    this.http.put<any>(`${API_BASE_URL}/servicos/${this.servicoEditandoId}`, dados).subscribe({
      next: (resposta) => {
        this.salvandoEdicaoServico = false;
        if (resposta.erro) {
          this.mostrarToast(resposta.erro, '#ffc107');
          return;
        }
        this.mostrarToast('Serviço atualizado!', '#28a745');
        this.servicoEditandoId = null;
        this.carregarServicos();
        this.montarFilaDeHoje(); // mudar o ciclo ou o nome reflete na fila de hoje
      },
      error: (erro) => {
        this.salvandoEdicaoServico = false;
        this.mostrarToast('Falha ao atualizar o serviço.', '#dc3545');
      }
    });
  }

  abrirConfirmacaoExcluirServico(servico: any) {
    this.servicoParaExcluir = servico;
  }

  fecharConfirmacaoExcluirServico() {
    this.servicoParaExcluir = null;
  }

  confirmarExclusaoServico() {
    if (!this.servicoParaExcluir) return;
    const id = this.servicoParaExcluir.id;

    this.excluindoServico = true;

    this.http.delete<any>(`${API_BASE_URL}/servicos/${id}`).subscribe({
      next: (resposta) => {
        this.excluindoServico = false;
        this.servicoParaExcluir = null;

        if (resposta.erro) {
          this.mostrarToast(resposta.erro, '#ffc107');
        } else {
          this.mostrarToast('Serviço excluído.', '#28a745');
          this.carregarServicos();
        }
      },
      error: (erro) => {
        this.excluindoServico = false;
        this.servicoParaExcluir = null;
        this.mostrarToast('Falha ao excluir o serviço.', '#dc3545');
      }
    });
  }

  // Valor do <select>. Períodos curtos mostram mais detalhe (blocos de semana(s))
  // em vez de virar só 3 ou 6 pontos no gráfico:
  // 3m -> 12 blocos de 1 semana | 6m -> 13 blocos de 2 semanas | 12m -> 12 meses | 5a -> 5 anos
  periodoSelecionado: string = '12m';
  clientesPeriodoTotal: number = 0;
  topClientesPeriodo: any[] = [];

  private readonly PERIODOS: { [chave: string]: { unidade: string; quantidade: number; passo: number; label: string } } = {
    '3m': { unidade: 'semana', quantidade: 12, passo: 1, label: '3 meses' },
    '6m': { unidade: 'semana', quantidade: 13, passo: 2, label: '6 meses' },
    '12m': { unidade: 'mes', quantidade: 12, passo: 1, label: '12 meses' },
    '5a': { unidade: 'ano', quantidade: 5, passo: 1, label: '5 anos' }
  };

  private periodoParams() {
    return this.PERIODOS[this.periodoSelecionado] || this.PERIODOS['12m'];
  }

  periodoLabelTexto(): string {
    return this.periodoParams().label;
  }

  carregarReceitaMensal() {
    const { unidade, quantidade, passo } = this.periodoParams();
    this.http.get<any>(`${API_BASE_URL}/estatisticas/receita-mensal?unidade=${unidade}&quantidade=${quantidade}&passo=${passo}`).subscribe({
      next: (dados) => {
        this.receitaMensal = dados.meses || [];
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao carregar a receita mensal.', '#dc3545')
    });
  }

  carregarClientesPeriodo() {
    const { unidade, quantidade, passo } = this.periodoParams();
    this.http.get<any>(`${API_BASE_URL}/estatisticas/clientes-periodo?unidade=${unidade}&quantidade=${quantidade}&passo=${passo}`).subscribe({
      next: (dados) => {
        this.clientesPeriodoTotal = dados.total_clientes_periodo || 0;
        this.topClientesPeriodo = dados.top_clientes || [];
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao carregar os clientes do período.', '#dc3545')
    });
  }

  receitaDoPeriodo(): number {
    return this.receitaMensal.reduce((soma: number, item: any) => soma + item.valor, 0);
  }

  vendasDoPeriodo(): number {
    return this.receitaMensal.reduce((soma: number, item: any) => soma + item.quantidade, 0);
  }

  // Gráfico de linha: coordenadas em porcentagem (0-100) numa margem interna,
  // pra ficarem idênticas entre o SVG (linha/área) e os pontos/rótulos em HTML.
  // "campo" escolhe qual métrica plotar: 'valor' (receita) ou 'quantidade' (nº de vendas).
  private readonly margemGraficoPct = 8;

  posXGraficoPct(indice: number): number {
    const n = this.receitaMensal.length;
    if (n <= 1) return 50;
    const usavel = 100 - 2 * this.margemGraficoPct;
    return this.margemGraficoPct + (indice / (n - 1)) * usavel;
  }

  posYGraficoPct(item: any, campo: 'valor' | 'quantidade'): number {
    const maior = Math.max(...this.receitaMensal.map((m: any) => m[campo]), 1);
    const usavel = 100 - 2 * this.margemGraficoPct;
    return this.margemGraficoPct + (item[campo] / maior) * usavel;
  }

  pontosLinhaGrafico(campo: 'valor' | 'quantidade'): string {
    return this.receitaMensal
      .map((item: any, i: number) => `${this.posXGraficoPct(i)},${100 - this.posYGraficoPct(item, campo)}`)
      .join(' ');
  }

  pontosAreaGrafico(campo: 'valor' | 'quantidade'): string {
    if (this.receitaMensal.length === 0) return '';
    const linha = this.pontosLinhaGrafico(campo);
    const ultimoIndice = this.receitaMensal.length - 1;
    return `${this.posXGraficoPct(0)},100 ${linha} ${this.posXGraficoPct(ultimoIndice)},100`;
  }

  mudarPeriodoGrafico() {
    this.carregarReceitaMensal();
    this.carregarClientesPeriodo();
  }

  classificarOportunidade(cliente: any): any {
    const cores = this.TEMAS[this.temaAtual].oportunidade;

    if (!cliente.ultima_compra || cliente.ultima_compra === 'Sem vendas') {
      return { texto: '🎯 Novo Lead', corFundo: cores.novoLead.fundo, corTexto: cores.novoLead.texto };
    }

    const dataCompra = new Date(cliente.ultima_compra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));
    const valor = cliente.valor_recuperado;

    if (diasInativos > this.configDiasRisco && valor >= 400) {
      return { texto: '💎 Valioso em Risco', corFundo: cores.valiosoEmRisco.fundo, corTexto: cores.valiosoEmRisco.texto };
    } else if (diasInativos > this.configDiasRisco) {
      return { texto: '💤 Adormecido', corFundo: cores.adormecido.fundo, corTexto: cores.adormecido.texto };
    } else if (diasInativos <= this.configDiasAtencao && valor >= 400) {
      return { texto: '⭐ Promotor', corFundo: cores.promotor.fundo, corTexto: cores.promotor.texto };
    } else if (diasInativos > this.configDiasAtencao && diasInativos <= this.configDiasRisco) {
      return { texto: '🔥 Recompra Provável', corFundo: cores.recompraProvavel.fundo, corTexto: cores.recompraProvavel.texto };
    } else {
      return { texto: '🔄 Recente', corFundo: cores.recente.fundo, corTexto: cores.recente.texto };
    }
  }

  // Identidade da classificação (usada em filtros e na escolha de mensagem) --
  // separada da cor, porque a cor muda de tema e a identidade não pode mudar junto.
  classificarRisco(dataUltimaCompra: string): 'saudavel' | 'atencao' | 'risco' | '' {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return '';

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

    if (diasInativos <= this.configDiasAtencao) return 'saudavel';
    if (diasInativos <= this.configDiasRisco) return 'atencao';
    return 'risco';
  }

  calcularRiscoCor(dataUltimaCompra: string): string {
    const chave = this.classificarRisco(dataUltimaCompra);
    const t = this.TEMAS[this.temaAtual];
    if (chave === 'saudavel') return t.emeraldSoft;
    if (chave === 'atencao') return t.amberSoft;
    if (chave === 'risco') return t.redSoft;
    return 'transparent';
  }

  // Formata valores em dinheiro no padrão brasileiro (separador de milhar
  // com ponto, decimal com vírgula) -- .toFixed(2) sozinho não faz isso,
  // então "418410.00" aparecia sem separador nenhum, difícil de ler rápido.
  formatarValor(valor: number): string {
    return (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  exibirTextoDias(dataUltimaCompra: string): string {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return 'Sem vendas';

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

    return `${dataUltimaCompra} (${diasInativos} dias)`;
  }

  // ==============================================================================
  // FILA "OPORTUNIDADES DE HOJE" (Fase 5 do motor de recomendação)
  //
  // Não calcula mais nada aqui -- só consome o motor do backend
  // (classificação por cliente+serviço, travas e ordenação, conforme o
  // documento "motor-de-recomendacao.pdf"). O nome do método continua
  // "montarFilaDeHoje" pra quem já chamava ele (carregarClientes,
  // carregarConfiguracoes) não precisar mudar.
  // ==============================================================================
  montarFilaDeHoje() {
    this.carregarFilaMotor();
    this.carregarAdiadosMotor();
  }

  trocarSubAbaHoje(aba: string) {
    this.subAbaHoje = aba;
    if (aba === 'contatados' && !this.contatadosCarregados) {
      this.carregarContatados();
    }
    if (aba === 'servico' && !this.clientesPorServicoCarregados) {
      this.filtrarClientesPorServico();
    }
  }

  filtrarClientesPorServico() {
    this.filtroStatusPorServico = 'Todos';
    this.clientesPorServicoCarregados = true;
    const filtroServico = this.servicoPorServicoId === 'todos' ? '' : `&servico_id=${this.servicoPorServicoId}`;
    this.http.get<any>(`${API_BASE_URL}/motor/fila?tamanho=9999${filtroServico}`).subscribe({
      next: (dados) => {
        if (dados.erro) { this.mostrarToast('Erro: ' + dados.erro, '#dc3545'); return; }
        this.clientesPorServico = (dados.fila || []).map((linha: any) => this.montarItemFila(linha));
        this.cdr.detectChanges();
      },
      error: () => this.mostrarToast('Falha ao carregar os clientes desse serviço.', '#dc3545')
    });
  }

  clientesPorServicoFiltrados() {
    if (this.filtroStatusPorServico === 'Todos') return this.clientesPorServico;
    return this.clientesPorServico.filter(item => item.status === this.filtroStatusPorServico);
  }

  carregarContatados() {
    this.http.get<any>(`${API_BASE_URL}/motor/contatados`).subscribe({
      next: (dados) => {
        if (dados.erro) { this.mostrarToast('Erro: ' + dados.erro, '#dc3545'); return; }
        this.contatados = dados.contatados || [];
        this.contatadosCarregados = true;
        this.cdr.detectChanges();
      },
      error: () => this.mostrarToast('Falha ao carregar os contatados.', '#dc3545')
    });
  }

  private carregarFilaMotor() {
    this.http.get<any>(`${API_BASE_URL}/motor/fila?tamanho=${this.LIMITE_FILA_HOJE}`).subscribe({
      next: (dados) => {
        if (dados.erro) { this.mostrarToast('Erro: ' + dados.erro, '#dc3545'); return; }
        this.filaHoje = (dados.fila || []).map((linha: any) => this.montarItemFila(linha));
        this.cdr.detectChanges();
      },
      error: () => this.mostrarToast('Falha ao montar a fila de hoje.', '#dc3545')
    });
  }

  // O motor devolve cliente_id/servico_id; o resto dos dados do cliente
  // (telefone, valor recuperado) já está carregado em this.clientes.
  private montarItemFila(linha: any) {
    const cliente = this.clientes.find(c => c.id === linha.cliente_id)
      || { id: linha.cliente_id, nome: linha.cliente_nome, telefone: '', valor_recuperado: 0 };

    return {
      cliente,
      servicoId: linha.servico_id,
      servicoNome: linha.servico_nome,
      dias: linha.dias_sem_comprar,
      status: linha.status,
      faixaValor: linha.faixa_valor,
      baixaConfianca: linha.baixa_confianca,
      motivo: this.motivoFila(linha),
      mensagemDraft: this.mensagemSugeridaFila(cliente.nome, linha.status)
    };
  }

  // Classe de cor do badge de status do motor -- por gravidade (razão do
  // ciclo): Recompra próxima é a mais leve, Frio a mais grave. Não usa a cor
  // de destaque (que o usuário escolhe livremente), porque status é um
  // significado fixo, igual já vale pro verde/vermelho do farol de risco.
  classeStatus(status: string): string {
    const mapa: { [key: string]: string } = {
      'Recompra próxima': 'tx-status--recompra',
      'Atrasado': 'tx-status--atrasado',
      'Adormecido': 'tx-status--adormecido',
      'Frio': 'tx-status--frio'
    };
    return mapa[status] || '';
  }

  private motivoFila(linha: any): string {
    const base = `Está há ${linha.dias_sem_comprar} dias sem comprar (ciclo esperado: ${linha.ciclo_esperado} dias).`;
    return linha.baixa_confianca ? `${base} Estimativa com poucos dados ainda.` : base;
  }

  // Mensagem específica da fila do motor, baseada no status (Atrasado /
  // Adormecido / Recompra próxima / Frio) -- diferente da mensagemSugerida()
  // geral (usada na Ficha e nas tabelas), que continua baseada no farol de
  // risco configurável e não deve mudar.
  private mensagemSugeridaFila(nome: string, status: string): string {
    if (status === 'Frio') {
      return `Olá, ${nome}! Faz bastante tempo que não nos vemos. Temos condições especiais pra você voltar, podemos conversar?`;
    } else if (status === 'Adormecido') {
      return `Olá, ${nome}! Tudo bem? Já faz um tempo desde a sua última visita. Podemos te ajudar com alguma coisa?`;
    } else if (status === 'Recompra próxima') {
      return `Oi, ${nome}! Passando pra lembrar que já está quase na hora de voltar. Quer agendar?`;
    }
    return `Oi, ${nome}! Tudo certo? Estamos à disposição caso precise de algo.`; // Atrasado
  }

  private carregarAdiadosMotor() {
    this.http.get<any>(`${API_BASE_URL}/motor/adiados`).subscribe({
      next: (dados) => {
        if (dados.erro) { this.mostrarToast('Erro: ' + dados.erro, '#dc3545'); return; }
        this.clientesAdiados = (dados.adiados || []).map((item: any) => ({
          contatoId: item.contato_id,
          clienteId: item.cliente_id,
          clienteNome: item.cliente_nome,
          servicoId: item.servico_id,
          servicoNome: item.servico_nome,
          textoRetorno: this.textoRetorno(item.dias_restantes)
        }));
        this.cdr.detectChanges();
      },
      error: () => this.mostrarToast('Falha ao carregar os adiados.', '#dc3545')
    });
  }

  // Contatar direto quem está adiado, sem precisar trazer de volta pra fila
  // antes -- assume silêncio igual ao Enviar da fila (mesma regra do
  // documento) e recalcula a data de reentrada a partir de agora.
  contatarAdiado(item: any) {
    const cliente = this.clientes.find(c => c.id === item.clienteId);
    const mensagem = `Oi, ${item.clienteNome}! Tudo bem? Passando pra saber se podemos te ajudar com alguma coisa.`;
    window.open(this.linkWhatsApp(cliente?.telefone || '', mensagem), '_blank');

    const corpo = { cliente_id: item.clienteId, servico_id: item.servicoId, resultado: 'silencio' };
    this.http.post<any>(`${API_BASE_URL}/motor/contatos`, corpo).subscribe({
      next: (resposta) => {
        if (resposta.erro) { this.mostrarToast('Erro: ' + resposta.erro, '#dc3545'); return; }
        this.mostrarToast(`Mensagem aberta pra ${item.clienteNome}.`, '#28a745');
        this.carregarAdiadosMotor();
      },
      error: () => this.mostrarToast('Falha ao registrar o contato.', '#dc3545')
    });
  }

  private textoRetorno(dias: number): string {
    if (dias <= 1) return 'Volta amanhã';
    return `Volta em ${dias} dias`;
  }

  // "Trazer de volta agora" = desfazer o último contato registrado pra essa
  // linha (documento: "desfazer é obrigatório") -- some a trava de reentrada.
  trazerDeVoltaAgora(item: any) {
    this.http.delete<any>(`${API_BASE_URL}/motor/contatos/${item.contatoId}`).subscribe({
      next: (resposta) => {
        if (resposta.erro) { this.mostrarToast('Erro: ' + resposta.erro, '#dc3545'); return; }
        this.mostrarToast(`${item.clienteNome} volta a aparecer na fila.`, '#28a745');
        this.montarFilaDeHoje();
      },
      error: () => this.mostrarToast('Falha ao trazer o cliente de volta.', '#dc3545')
    });
  }

  // Mandar a mensagem assume silêncio por padrão -- o documento é explícito:
  // "o sistema não espera pra concluir que não houve resposta, assume isso
  // desde o clique". Se a pessoa clicar em Adiar ou Recusar depois, esse
  // registro é substituído por um mais específico.
  enviarMensagemFila(item: any) {
    window.open(this.linkWhatsApp(item.cliente.telefone, item.mensagemDraft), '_blank');
    this.registrarContatoFila(item, 'silencio', `Mensagem enviada. Se ${item.cliente.nome} não responder, ele volta à fila automaticamente.`);
  }

  adiarContatoFila(item: any) {
    this.registrarContatoFila(item, 'adiar_sem_data', `${item.cliente.nome} volta à fila mais pra frente.`);
  }

  // "X" do card: só tira o cliente da fila de HOJE (local, sem registrar
  // contato nenhum no motor) -- diferente do Adiar, não afeta a reentrada.
  // Volta a aparecer normalmente na próxima vez que a fila for recalculada.
  abrirConfirmacaoExcluirDaFila(item: any) {
    this.itemParaExcluirDaFila = item;
  }

  fecharConfirmacaoExcluirDaFila() {
    this.itemParaExcluirDaFila = null;
  }

  confirmarExclusaoDaFila() {
    if (!this.itemParaExcluirDaFila) return;
    const item = this.itemParaExcluirDaFila;
    this.filaHoje = this.filaHoje.filter(f => !(f.cliente.id === item.cliente.id && f.servicoId === item.servicoId));
    this.itemParaExcluirDaFila = null;
    this.mostrarToast(`${item.cliente.nome} foi tirado da fila de hoje.`, '#28a745');
  }

  private registrarContatoFila(item: any, resultado: string, mensagemToast: string) {
    const corpo = { cliente_id: item.cliente.id, servico_id: item.servicoId, resultado };
    this.http.post<any>(`${API_BASE_URL}/motor/contatos`, corpo).subscribe({
      next: (resposta) => {
        if (resposta.erro) { this.mostrarToast('Erro: ' + resposta.erro, '#dc3545'); return; }

        this.filaHoje = this.filaHoje.filter(f => !(f.cliente.id === item.cliente.id && f.servicoId === item.servicoId));
        const texto = resposta.vira_nao_contatar
          ? `${item.cliente.nome} recusou 3 vezes seguidas e foi marcado como "não contatar".`
          : mensagemToast;
        this.mostrarToast(texto, '#28a745');
        this.carregarAdiadosMotor();
      },
      error: () => this.mostrarToast('Falha ao registrar o contato.', '#dc3545')
    });
  }

  // ==============================================================================
  // VENDAS E AUTOMAÇÃO
  // ==============================================================================
  salvarVenda() {
    if (!this.novaVendaValor || this.novaVendaValor <= 0) {
      this.mostrarToast('Por favor, insira um valor válido.', '#ffc107');
      return;
    }

    const dadosVenda = {
      cliente_id: this.clienteVendaId,
      valor: this.novaVendaValor,
      servico_id: this.novaVendaServicoId ? parseInt(this.novaVendaServicoId, 10) : null
    };

    this.fecharModalVenda();
    this.cdr.detectChanges(); 

    this.http.post<any>(`${API_BASE_URL}/vendas`, dadosVenda).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          this.mostrarToast('Erro: ' + resposta.erro, '#dc3545');
        } else {
          this.mostrarToast('Venda registrada!', '#28a745');
          this.carregarClientes();
          this.carregarEstatisticas();
          this.carregarReceitaMensal();
          this.carregarClientesPeriodo();
          this.carregarRecuperadoNoMes();
        }
      },
      error: (erro) => this.mostrarToast('Falha ao registrar venda.', '#dc3545')
    });
  }

  private mensagemSugerida(cliente: any): string {
    const chave = this.classificarRisco(cliente.ultima_compra);

    if (chave === 'risco') {
      return `Olá, ${cliente.nome}! Tudo bem? Já faz um tempo desde a sua última visita. Temos condições especiais para você voltar, podemos conversar?`;
    } else if (chave === 'atencao') {
      return `Oi, ${cliente.nome}! Tudo certo? Viemos saber se você está precisando de alguma manutenção ou novidade. Nossa equipe está à disposição!`;
    } else if (chave === 'saudavel') {
      return `Olá, ${cliente.nome}! Muito obrigado pela sua preferência recente. Como está sendo sua experiência com a nossa empresa?`;
    }
    return `Olá, ${cliente.nome}! Tudo bem? Vimos o seu cadastro aqui e queremos te apresentar nossos serviços. Posso te enviar nosso catálogo?`;
  }

  private linkWhatsApp(telefone: string, mensagem: string): string {
    let telefoneLimpo = telefone.replace(/\D/g, '');
    if (telefoneLimpo.length === 10 || telefoneLimpo.length === 11) {
      telefoneLimpo = '55' + telefoneLimpo;
    }
    return `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`;
  }

  abrirWhatsApp(cliente: any) {
    window.open(this.linkWhatsApp(cliente.telefone, this.mensagemSugerida(cliente)), '_blank');
  }

  // ==============================================================================
  // CONTROLES DE INTERFACE E FILTROS
  // ==============================================================================
  definirFiltro(cor: string) {
    this.filtroAtual = cor;
  }

  obterClientesFiltrados() {
    if (this.filtroAtual === 'Todos') return this.clientes;
    return this.clientes.filter(cliente => this.classificarRisco(cliente.ultima_compra) === this.filtroAtual);
  }

  editarCliente(cliente: any) {
    this.clienteEditandoId = cliente.id;
    this.novoNome = cliente.nome;
    this.novoTelefone = cliente.telefone;
    this.novoCpf = cliente.cpf !== 'Não informado' ? cliente.cpf : '';
    this.novoEmail = cliente.email !== 'Não informado' ? cliente.email : '';
    this.novoDataNascimento = cliente.data_nascimento !== 'Não informado' ? cliente.data_nascimento : '';
    this.mostrarModalCadastro = true;
  }

  abrirModalCadastro() {
    this.limparFormulario(); 
    this.mostrarModalCadastro = true;
  }

  fecharModalCadastro() {
    this.mostrarModalCadastro = false;
    this.limparFormulario();
  }

  limparFormulario() {
    this.novoNome = '';
    this.novoTelefone = '';
    this.novoCpf = '';
    this.novoEmail = '';
    this.novoDataNascimento = '';
    this.clienteEditandoId = null;
  }

  abrirFichaCliente(cliente: any) {
    this.clienteDetalhe = cliente;
    this.vendasClienteDetalhe = [];
    this.carregandoVendasDetalhe = true;

    this.http.get<any>(`${API_BASE_URL}/clientes/${cliente.id}/vendas`).subscribe({
      next: (dados) => {
        this.carregandoVendasDetalhe = false;
        this.vendasClienteDetalhe = dados.vendas || [];
        this.cdr.detectChanges();
      },
      error: (erro) => {
        this.carregandoVendasDetalhe = false;
        this.mostrarToast('Falha ao carregar histórico de compras.', '#dc3545');
      }
    });
  }

  fecharFichaCliente() {
    this.clienteDetalhe = null;
    this.vendasClienteDetalhe = [];
  }

  abrirModalVenda(cliente: any) {
    this.clienteVendaId = cliente.id;
    this.clienteVendaNome = cliente.nome;
    this.novaVendaValor = null;
    this.novaVendaServicoId = '';
  }

  fecharModalVenda() {
    this.clienteVendaId = null;
    this.clienteVendaNome = '';
    this.novaVendaValor = null;
    this.novaVendaServicoId = '';
  }

  mostrarToast(mensagem: string, cor: string = '#28a745') {
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }

    this.toastMensagem = mensagem;
    this.toastCor = cor;
    this.toastVisivel = true;
    this.cdr.detectChanges();

    // Mensagens mais longas ficam visíveis por mais tempo (mín. 3,5s, máx. 12s).
    const duracao = Math.min(12000, Math.max(3500, mensagem.length * 80));

    this.toastTimeoutId = setTimeout(() => {
      this.toastVisivel = false;
      this.toastTimeoutId = null;
      this.cdr.detectChanges();
    }, duracao);
  }

  fecharToast() {
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
      this.toastTimeoutId = null;
    }
    this.toastVisivel = false;
  }
}