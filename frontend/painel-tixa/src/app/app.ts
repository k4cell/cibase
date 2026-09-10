import { Component, OnInit, ChangeDetectorRef, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

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

  // Cor de destaque (botões, aba ativa, links) -- só a marca/ação, nunca o
  // verde de receita nem o vermelho de risco, que têm significado próprio.
  // Guardado no localStorage do navegador (preferência de tela, não do negócio).
  mostrarSeletorCor: boolean = false;
  corSelecionada: string = 'Azul';

  readonly PALETAS_COR = [
    { nome: 'Azul',     primary: '#3b82f6', hover: '#60a5fa', soft: '#1e3a5f', border: '#1d4ed8', textSoft: '#93c5fd', ring: 'rgba(59, 130, 246, 0.35)',  onPrimary: '#fff' },
    { nome: 'Violeta',  primary: '#8b5cf6', hover: '#a78bfa', soft: '#2e1f4d', border: '#6d28d9', textSoft: '#c4b5fd', ring: 'rgba(139, 92, 246, 0.35)',  onPrimary: '#fff' },
    { nome: 'Amarelo',  primary: '#eab308', hover: '#facc15', soft: '#3d2e06', border: '#a16207', textSoft: '#fde68a', ring: 'rgba(234, 179, 8, 0.35)',   onPrimary: '#1c1917' },
    { nome: 'Ciano',    primary: '#06b6d4', hover: '#22d3ee', soft: '#0e3a42', border: '#0e7490', textSoft: '#67e8f9', ring: 'rgba(6, 182, 212, 0.35)',   onPrimary: '#fff' },
    { nome: 'Magenta',  primary: '#d946ef', hover: '#e879f9', soft: '#3d1a42', border: '#a21caf', textSoft: '#f0abfc', ring: 'rgba(217, 70, 239, 0.35)',  onPrimary: '#fff' },
    { nome: 'Laranja',  primary: '#f97316', hover: '#fb923c', soft: '#3d2410', border: '#c2410c', textSoft: '#fdba74', ring: 'rgba(249, 115, 22, 0.35)',  onPrimary: '#fff' },
    { nome: 'Rosa',     primary: '#ec4899', hover: '#f472b6', soft: '#3d1830', border: '#be185d', textSoft: '#f9a8d4', ring: 'rgba(236, 72, 153, 0.35)',  onPrimary: '#fff' },
  ];

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef, private elementRef: ElementRef) {}

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
    estilo.setProperty('--tx-primary-soft', paleta.soft);
    estilo.setProperty('--tx-primary-border', paleta.border);
    estilo.setProperty('--tx-primary-text-soft', paleta.textSoft);
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

  ngOnInit() {
    // A tela abre em branco de propósito. Os dados só serão carregados APÓS o login!
    this.carregarCorSalva();
  }

  // ==============================================================================
  // SISTEMA DE LOGIN E SEGURANÇA
  // ==============================================================================
  fazerLogin() {
    if (!this.loginEmail || !this.loginSenha) {
      this.mostrarToast('Preencha o e-mail e a senha para entrar.', '#ffc107');
      return;
    }

    this.carregandoLogin = true;
    const credenciais = { email: this.loginEmail, senha: this.loginSenha };

    this.http.post<any>('http://127.0.0.1:8000/login', credenciais).subscribe({
      next: (resposta) => {
        this.carregandoLogin = false;
        
        if (resposta.erro) {
          this.mostrarToast(resposta.erro, '#dc3545'); // Erro vermelho
        } else {
          this.estaLogado = true; // Libera o painel
          this.abaAtiva = 'inicio'; // Login sempre cai na Home, nunca numa aba residual
          this.mostrarToast('Bem-vindo ao Painel Tixa!', '#28a745');
          
          // Somente AGORA buscamos o dinheiro e os clientes no banco de dados!
          this.carregarConfiguracoes();
          this.carregarEstatisticas();
          this.carregarReceitaMensal();
          this.carregarClientesPeriodo();
          this.carregarClientes();
          this.carregarClientesArquivados();
        }
      },
      error: (erro) => {
        this.carregandoLogin = false;
        this.mostrarToast('Servidor offline. Verifique o Python.', '#dc3545');
      }
    });
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
    this.http.get<any>('http://127.0.0.1:8000/clientes').subscribe({
      next: (dados) => {
        this.clientes = dados.clientes;
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao conectar com o banco de clientes.', '#dc3545')
    });
  }

  carregarClientesArquivados() {
    this.http.get<any>('http://127.0.0.1:8000/clientes/arquivados').subscribe({
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

    const dadosDoFormulario = {
      nome: nomeLimpo,
      telefone: this.novoTelefone,
      cpf: this.novoCpf,
      email: this.novoEmail,
      data_nascimento: this.novoDataNascimento
    };

    this.salvandoCliente = true; 

    if (this.clienteEditandoId) {
      this.http.put<any>(`http://127.0.0.1:8000/clientes/${this.clienteEditandoId}`, dadosDoFormulario).subscribe({
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
      this.http.post<any>('http://127.0.0.1:8000/clientes', dadosDoFormulario).subscribe({
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

    this.http.post<any>('http://127.0.0.1:8000/importar-clientes', formData).subscribe({
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

    this.http.post<any>('http://127.0.0.1:8000/importar-vendas', formData).subscribe({
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

    this.http.delete<any>(`http://127.0.0.1:8000/clientes/${id}`).subscribe({
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
    this.http.put<any>(`http://127.0.0.1:8000/clientes/${cliente.id}/reativar`, {}).subscribe({
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

    this.http.delete<any>(`http://127.0.0.1:8000/clientes/${id}/permanente`).subscribe({
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
    this.http.get<any>('http://127.0.0.1:8000/estatisticas').subscribe({
      next: (dados) => {
        this.totalRecuperado = dados.total_recuperado;
        this.clientesReativados = dados.clientes_reativados;
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao calcular as estatísticas.', '#dc3545')
    });
  }

  carregarConfiguracoes() {
    this.http.get<any>('http://127.0.0.1:8000/configuracoes').subscribe({
      next: (dados) => {
        if (!dados.erro) {
          this.configDiasAtencao = dados.dias_atencao;
          this.configDiasRisco = dados.dias_risco;
          this.cdr.detectChanges();
        }
      },
      error: (erro) => this.mostrarToast('Falha ao carregar as configurações.', '#dc3545')
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

    this.http.put<any>('http://127.0.0.1:8000/configuracoes', dados).subscribe({
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
    this.http.get<any>(`http://127.0.0.1:8000/estatisticas/receita-mensal?unidade=${unidade}&quantidade=${quantidade}&passo=${passo}`).subscribe({
      next: (dados) => {
        this.receitaMensal = dados.meses || [];
        this.cdr.detectChanges();
      },
      error: (erro) => this.mostrarToast('Falha ao carregar a receita mensal.', '#dc3545')
    });
  }

  carregarClientesPeriodo() {
    const { unidade, quantidade, passo } = this.periodoParams();
    this.http.get<any>(`http://127.0.0.1:8000/estatisticas/clientes-periodo?unidade=${unidade}&quantidade=${quantidade}&passo=${passo}`).subscribe({
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
    if (!cliente.ultima_compra || cliente.ultima_compra === 'Sem vendas') {
      return { texto: '🎯 Novo Lead', corFundo: '#0c3a5f', corTexto: '#93c5fd' };
    }

    const dataCompra = new Date(cliente.ultima_compra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));
    const valor = cliente.valor_recuperado;

    if (diasInativos > this.configDiasRisco && valor >= 400) {
      return { texto: '💎 Valioso em Risco', corFundo: '#450a0a', corTexto: '#fca5a5' };
    } else if (diasInativos > this.configDiasRisco) {
      return { texto: '💤 Adormecido', corFundo: '#334155', corTexto: '#cbd5e1' };
    } else if (diasInativos <= this.configDiasAtencao && valor >= 400) {
      return { texto: '⭐ Promotor', corFundo: '#064e3b', corTexto: '#6ee7b7' };
    } else if (diasInativos > this.configDiasAtencao && diasInativos <= this.configDiasRisco) {
      return { texto: '🔥 Recompra Provável', corFundo: '#451a03', corTexto: '#fcd34d' };
    } else {
      return { texto: '🔄 Recente', corFundo: '#134e4a', corTexto: '#5eead4' };
    }
  }

  calcularRiscoCor(dataUltimaCompra: string): string {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return 'transparent';

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

    if (diasInativos <= this.configDiasAtencao) return '#064e3b';
    if (diasInativos <= this.configDiasRisco) return '#451a03';
    return '#450a0a';
  }

  exibirTextoDias(dataUltimaCompra: string): string {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return 'Sem vendas';

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

    return `${dataUltimaCompra} (${diasInativos} dias)`;
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
      valor: this.novaVendaValor
    };

    this.fecharModalVenda();
    this.cdr.detectChanges(); 

    this.http.post<any>('http://127.0.0.1:8000/vendas', dadosVenda).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          this.mostrarToast('Erro: ' + resposta.erro, '#dc3545');
        } else {
          this.mostrarToast('Venda registrada!', '#28a745');
          this.carregarClientes(); 
          this.carregarEstatisticas();
          this.carregarReceitaMensal();
          this.carregarClientesPeriodo();
        }
      },
      error: (erro) => this.mostrarToast('Falha ao registrar venda.', '#dc3545')
    });
  }

  abrirWhatsApp(cliente: any) {
    let telefoneLimpo = cliente.telefone.replace(/\D/g, '');
    if (telefoneLimpo.length === 10 || telefoneLimpo.length === 11) {
      telefoneLimpo = '55' + telefoneLimpo;
    }

    let mensagem = '';
    const corRisco = this.calcularRiscoCor(cliente.ultima_compra);

    if (corRisco === '#450a0a') {
      mensagem = `Olá, ${cliente.nome}! Tudo bem? Já faz um tempo desde a sua última visita. Temos condições especiais para você voltar, podemos conversar?`;
    } else if (corRisco === '#451a03') {
      mensagem = `Oi, ${cliente.nome}! Tudo certo? Viemos saber se você está precisando de alguma manutenção ou novidade. Nossa equipe está à disposição!`;
    } else if (corRisco === '#064e3b') {
      mensagem = `Olá, ${cliente.nome}! Muito obrigado pela sua preferência recente. Como está sendo sua experiência com a nossa empresa?`;
    } else { 
      mensagem = `Olá, ${cliente.nome}! Tudo bem? Vimos o seu cadastro aqui e queremos te apresentar nossos serviços. Posso te enviar nosso catálogo?`;
    }

    const textoCodificado = encodeURIComponent(mensagem);
    const url = `https://wa.me/${telefoneLimpo}?text=${textoCodificado}`;
    window.open(url, '_blank');
  }

  // ==============================================================================
  // CONTROLES DE INTERFACE E FILTROS
  // ==============================================================================
  definirFiltro(cor: string) {
    this.filtroAtual = cor;
  }

  obterClientesFiltrados() {
    if (this.filtroAtual === 'Todos') return this.clientes;
    return this.clientes.filter(cliente => this.calcularRiscoCor(cliente.ultima_compra) === this.filtroAtual);
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

    this.http.get<any>(`http://127.0.0.1:8000/clientes/${cliente.id}/vendas`).subscribe({
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
  }

  fecharModalVenda() {
    this.clienteVendaId = null;
    this.clienteVendaNome = '';
    this.novaVendaValor = null;
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