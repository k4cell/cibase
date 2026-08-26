import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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

  // 1. Dados Principais
  clientes: any[] = [];
  
  // 2. Memórias do Formulário de Clientes (Cadastro/Edição)
  novoNome: string = '';
  novoTelefone: string = '';
  novoCpf: string = ''; 
  novoEmail: string = ''; 
  novoDataNascimento: string = ''; 
  clienteEditandoId: number | null = null;

  // 3. Memórias do Formulário de Vendas
  clienteVendaId: number | null = null;
  clienteVendaNome: string = '';
  novaVendaValor: number | null = null;

  // 4. Controles de Interface (UI) e Carregamento
  mostrarModalCadastro: boolean = false;
  salvandoCliente: boolean = false;
  filtroAtual: string = 'Todos';

  // 5. Sistema de Avisos Flutuantes (Toast)
  toastMensagem: string = '';
  toastCor: string = '';
  toastVisivel: boolean = false;

  // 6. Dashboard de Estatísticas
  totalRecuperado: number = 0;
  clientesReativados: number = 0;


  // ==============================================================================
  // INICIALIZAÇÃO
  // ==============================================================================
  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.carregarClientes();
    this.carregarEstatisticas();
  }


  // ==============================================================================
  // 1. FORMATAÇÃO VISUAL E MÁSCARAS DE TECLADO (TEMPO REAL)
  // ==============================================================================

  /** Impede a digitação de números e símbolos no campo de nome */
  formatarNome(event: any) {
    const input = event.target as HTMLInputElement;
    let valor = input.value.replace(/[0-9]/g, '');
    input.value = valor; 
    this.novoNome = valor;
  }

  /** Aplica a máscara padrão de CPF (XXX.XXX.XXX-XX) instantaneamente na digitação */
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

  /** Aplica a máscara padrão de Telefone Brasileiro (DDD) XXXX-XXXX */
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
  // 2. COMUNICAÇÃO COM O BACKEND PYTHON (CRUD DE CLIENTES)
  // ==============================================================================

  /** Busca a lista de clientes com as receitas atualizadas no motor Python */
  carregarClientes() {
    this.http.get<any>('http://127.0.0.1:8000/clientes').subscribe({
      next: (dados) => {
        this.clientes = dados.clientes;
        this.cdr.detectChanges(); 
      },
      error: (erro) => this.mostrarToast('Falha ao conectar com o banco de clientes. O servidor está ligado?', '#dc3545')
    });
  }

  /** Avalia as regras de negócio e envia o formulário validado para o Python */
  salvarCliente() {
    const nomeLimpo = this.novoNome.trim(); 
    const cpfLimpo = this.novoCpf.replace(/\D/g, ''); 
    const telefoneLimpo = this.novoTelefone.replace(/\D/g, ''); 

    // Validação 1: Bloqueia envio se qualquer campo fundamental estiver vazio
    if (!nomeLimpo || !this.novoTelefone || !this.novoCpf || !this.novoEmail || !this.novoDataNascimento) {
      this.mostrarToast('Por favor, preencha todos os campos, incluindo a Data de Nascimento.', '#dc3545');
      return; 
    }

    // Validação 2: Auditoria Matemática de Comprimento
    if (nomeLimpo.length < 3) {
      this.mostrarToast('O nome do cliente deve ter no mínimo 3 letras.', '#dc3545');
      return;
    }
    if (cpfLimpo.length !== 11) {
      this.mostrarToast('CPF inválido! O CPF deve ter exatamente 11 números.', '#dc3545');
      return;
    }
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
      this.mostrarToast('Telefone inválido! Digite o DDD e o número correto (10 ou 11 números).', '#ffc107');
      return;
    }

    // Validação 3: Validador Universal de Formato de E-mail (Regex)
    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    if (!regexEmail.test(this.novoEmail)) {
      this.mostrarToast('Por favor, digite um endereço de e-mail válido (ex: contato@empresa.com).', '#dc3545');
      return;
    }

    const dadosDoFormulario = {
      nome: nomeLimpo,
      telefone: this.novoTelefone,
      cpf: this.novoCpf,
      email: this.novoEmail,
      data_nascimento: this.novoDataNascimento
    };

    this.salvandoCliente = true; // Aciona a ampulheta do estado de carregamento

    // Direciona para Rota PUT (Editar) ou POST (Novo)
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

  /** Dispara a exclusão. O PostgreSQL cuidará de proteger clientes que possuem histórico de compras. */
  excluirCliente(id: number) {
    const confirmacao = confirm('Tem certeza que deseja excluir este cliente?');
    if (!confirmacao) return;

    this.http.delete<any>(`http://127.0.0.1:8000/clientes/${id}`).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          this.mostrarToast('Atenção: O banco bloqueou a exclusão! ' + resposta.erro, '#ffc107');
        } else {
          this.mostrarToast('Cliente excluído com sucesso!', '#28a745');
          this.carregarClientes();
        }
      },
      error: (erro) => this.mostrarToast('Falha ao excluir cliente.', '#dc3545')
    });
  }


  // ==============================================================================
  // 3. INTELIGÊNCIA COMERCIAL (DASHBOARD E CLASSIFICAÇÃO IA)
  // ==============================================================================

  /** Busca os totais gerais (Dinheiro Faturado e Clientes Salvos) */
  carregarEstatisticas() {
    this.http.get<any>('http://127.0.0.1:8000/estatisticas').subscribe({
      next: (dados) => {
        this.totalRecuperado = dados.total_recuperado;
        this.clientesReativados = dados.clientes_reativados;
        this.cdr.detectChanges(); 
      },
      error: (erro) => this.mostrarToast('Falha ao calcular as estatísticas do painel.', '#dc3545')
    });
  }

  /** Motor Local: Avalia o tempo de inatividade + faturamento para gerar Tags Estratégicas */
  classificarOportunidade(cliente: any): any {
    if (!cliente.ultima_compra || cliente.ultima_compra === 'Sem vendas') {
      return { texto: '🎯 Novo Lead', corFundo: '#e0f3ff', corTexto: '#004085' }; 
    }

    const dataCompra = new Date(cliente.ultima_compra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));
    const valor = cliente.valor_recuperado;

    // Regras de negócio de Vendas e Marketing
    if (diasInativos > 90 && valor >= 400) {
      return { texto: '💎 Valioso em Risco', corFundo: '#f8d7da', corTexto: '#721c24' }; 
    } else if (diasInativos > 90) {
      return { texto: '💤 Adormecido', corFundo: '#e2e3e5', corTexto: '#383d41' }; 
    } else if (diasInativos <= 30 && valor >= 400) {
      return { texto: '⭐ Promotor', corFundo: '#d4edda', corTexto: '#155724' }; 
    } else if (diasInativos > 30 && diasInativos <= 90) {
      return { texto: '🔥 Recompra Provável', corFundo: '#fff3cd', corTexto: '#856404' }; 
    } else {
      return { texto: '🔄 Recente', corFundo: '#d1ecf1', corTexto: '#0c5460' }; 
    }
  }

  /** Converte a data da última compra num Alerta Visual (Verde, Amarelo, Vermelho) */
  calcularRiscoCor(dataUltimaCompra: string): string {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return 'transparent';

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

    if (diasInativos <= 30) return '#d4edda'; // Saudável
    if (diasInativos <= 90) return '#fff3cd'; // Esfriando
    return '#f8d7da'; // Crítico
  }

  /** Converte a data do banco em um texto legível contendo a passagem do tempo */
  exibirTextoDias(dataUltimaCompra: string): string {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return 'Sem vendas';

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

    return `${dataUltimaCompra} (${diasInativos} dias)`;
  }


  // ==============================================================================
  // 4. MÓDULO FINANCEIRO E AUTOMAÇÃO (VENDAS E WHATSAPP)
  // ==============================================================================

  /** Grava um faturamento no banco e força a atualização do Dashboard e do Farol na mesma hora */
  salvarVenda() {
    if (!this.novaVendaValor || this.novaVendaValor <= 0) {
      this.mostrarToast('Por favor, insira um valor válido maior que zero.', '#ffc107');
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
          this.mostrarToast('Venda registrada com sucesso!', '#28a745');
          this.carregarClientes(); 
          this.carregarEstatisticas();
        }
      },
      error: (erro) => this.mostrarToast('Falha ao registrar venda.', '#dc3545')
    });
  }

  /** Monta um script comercial persuasivo baseado na Tag do cliente e abre o WhatsApp Web */
  abrirWhatsApp(cliente: any) {
    let telefoneLimpo = cliente.telefone.replace(/\D/g, '');
    if (telefoneLimpo.length === 10 || telefoneLimpo.length === 11) {
      telefoneLimpo = '55' + telefoneLimpo; // Garante o código DDI do Brasil para a API da Meta
    }

    let mensagem = '';
    const corRisco = this.calcularRiscoCor(cliente.ultima_compra);

    if (corRisco === '#f8d7da') { 
      mensagem = `Olá, ${cliente.nome}! Tudo bem? Já faz um tempo desde a sua última visita. Temos condições especiais para você voltar, podemos conversar?`;
    } else if (corRisco === '#fff3cd') { 
      mensagem = `Oi, ${cliente.nome}! Tudo certo? Viemos saber se você está precisando de alguma manutenção ou novidade. Nossa equipe está à disposição!`;
    } else if (corRisco === '#d4edda') { 
      mensagem = `Olá, ${cliente.nome}! Muito obrigado pela sua preferência recente. Como está sendo sua experiência com a nossa empresa?`;
    } else { 
      mensagem = `Olá, ${cliente.nome}! Tudo bem? Vimos o seu cadastro aqui e queremos te apresentar nossos serviços. Posso te enviar nosso catálogo?`;
    }

    const textoCodificado = encodeURIComponent(mensagem);
    const url = `https://wa.me/${telefoneLimpo}?text=${textoCodificado}`;
    window.open(url, '_blank');
  }


  // ==============================================================================
  // 5. FILTROS DA TABELA E CONTROLES DE INTERFACE (MODAIS E AVISOS)
  // ==============================================================================

  /** Atualiza o estado da memória para o filtro selecionado no topo da tela */
  definirFiltro(cor: string) {
    this.filtroAtual = cor;
  }

  /** Retorna apenas os clientes que batem com a cor do filtro escolhido */
  obterClientesFiltrados() {
    if (this.filtroAtual === 'Todos') return this.clientes;
    return this.clientes.filter(cliente => this.calcularRiscoCor(cliente.ultima_compra) === this.filtroAtual);
  }

  /** Transfere os dados do cliente para a memória do formulário e abre o pop-up */
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

  /** Dispara uma barra flutuante (Toast) na tela que desaparece automaticamente após 3.5s */
  mostrarToast(mensagem: string, cor: string = '#28a745') { 
    this.toastMensagem = mensagem;
    this.toastCor = cor;
    this.toastVisivel = true;
    this.cdr.detectChanges(); 

    setTimeout(() => {
      this.toastVisivel = false;
      this.cdr.detectChanges();
    }, 3500);
  }
}