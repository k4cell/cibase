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
  abaAtiva: string = 'recuperacao';

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