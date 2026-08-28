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
  clientes: any[] = [];
  
  novoNome: string = '';
  novoTelefone: string = '';
  novoCpf: string = ''; 
  novoEmail: string = ''; 
  novoDataNascimento: string = ''; 
  clienteEditandoId: number | null = null;

  clienteVendaId: number | null = null;
  clienteVendaNome: string = '';
  novaVendaValor: number | null = null;

  clienteDetalhe: any = null;

  mostrarModalCadastro: boolean = false;
  salvandoCliente: boolean = false;
  filtroAtual: string = 'Todos';

  toastMensagem: string = '';
  toastCor: string = '';
  toastVisivel: boolean = false;

  totalRecuperado: number = 0;
  clientesReativados: number = 0;

  // Memórias de Segurança (Login)
  estaLogado: boolean = false;
  loginEmail: string = '';
  loginSenha: string = '';
  carregandoLogin: boolean = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // A tela abre em branco de propósito. Os dados só serão carregados APÓS o login!
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
          this.mostrarToast('Bem-vindo ao Painel Tixa!', '#28a745');
          
          // Somente AGORA buscamos o dinheiro e os clientes no banco de dados!
          this.carregarEstatisticas();
          this.carregarClientes();
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

  excluirCliente(id: number) {
    const confirmacao = confirm('Tem certeza que deseja excluir este cliente?');
    if (!confirmacao) return;

    this.http.delete<any>(`http://127.0.0.1:8000/clientes/${id}`).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          this.mostrarToast('Atenção: ' + resposta.erro, '#ffc107');
        } else {
          this.mostrarToast('Cliente excluído com sucesso!', '#28a745');
          this.carregarClientes();
        }
      },
      error: (erro) => this.mostrarToast('Falha ao excluir cliente.', '#dc3545')
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

  classificarOportunidade(cliente: any): any {
    if (!cliente.ultima_compra || cliente.ultima_compra === 'Sem vendas') {
      return { texto: '🎯 Novo Lead', corFundo: '#e0f3ff', corTexto: '#004085' }; 
    }

    const dataCompra = new Date(cliente.ultima_compra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));
    const valor = cliente.valor_recuperado;

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

  calcularRiscoCor(dataUltimaCompra: string): string {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return 'transparent';

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

    if (diasInativos <= 30) return '#d4edda'; 
    if (diasInativos <= 90) return '#fff3cd'; 
    return '#f8d7da'; 
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
  }

  fecharFichaCliente() {
    this.clienteDetalhe = null;
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