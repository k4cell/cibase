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
  clientes: any[] = [];
  
  novoNome: string = '';
  novoTelefone: string = '';
  novoCpf: string = ''; 
  novoEmail: string = ''; 
  novoDataNascimento: string = ''; 

  clienteVendaId: number | null = null;
  clienteVendaNome: string = '';
  novaVendaValor: number | null = null;

  clienteEditandoId: number | null = null;
  
  // Variável que memoriza qual filtro está ativo (Versão 0.7)
  filtroAtual: string = 'Todos';
  // Memórias do Dashboard de Estatísticas (Versão 0.8)
  totalRecuperado: number = 0;
  clientesReativados: number = 0;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.carregarClientes();
    this.carregarEstatisticas();
  }

  // --- LÓGICA DE FORMATAÇÃO (Máscaras de Limpeza) ---
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
    if (v.length > 9) {
      v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4');
    } else if (v.length > 6) {
      v = v.replace(/^(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
    } else if (v.length > 3) {
      v = v.replace(/^(\d{3})(\d+)/, '$1.$2');
    }
    input.value = v;
    this.novoCpf = v;
  }

  formatarTelefone(event: any) {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, ''); 
    if (v.length > 11) v = v.substring(0, 11);
    if (v.length > 6) {
      v = v.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
    } else if (v.length > 2) {
      v = v.replace(/^(\d{2})(\d+)/, '($1) $2');
    }
    input.value = v; 
    this.novoTelefone = v;
  }
  // -----------------------------

  carregarClientes() {
    this.http.get<any>('http://127.0.0.1:8000/clientes').subscribe({
      next: (dados) => {
        this.clientes = dados.clientes;
        this.cdr.detectChanges(); 
      },
      error: (erro) => console.error('Erro ao buscar clientes:', erro)
    });
  }

  salvarCliente() {
    const nomeLimpo = this.novoNome.trim(); 
    const cpfLimpo = this.novoCpf.replace(/\D/g, ''); 
    const telefoneLimpo = this.novoTelefone.replace(/\D/g, ''); 

    if (!nomeLimpo || !this.novoTelefone || !this.novoCpf || !this.novoEmail || !this.novoDataNascimento) {
      alert('Por favor, preencha todos os campos, incluindo a Data de Nascimento.');
      return; 
    }

    if (nomeLimpo.length < 3) {
      alert('O nome do cliente deve ter no mínimo 3 letras.');
      return;
    }
    if (cpfLimpo.length !== 11) {
      alert('CPF inválido! O CPF deve ter exatamente 11 números.');
      return;
    }
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
      alert('Telefone inválido! Digite o DDD e o número correto (10 ou 11 números).');
      return;
    }

    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    if (!regexEmail.test(this.novoEmail)) {
      alert('Por favor, digite um endereço de e-mail válido (ex: contato@empresa.com).');
      return;
    }

    const dadosDoFormulario = {
      nome: nomeLimpo,
      telefone: this.novoTelefone,
      cpf: this.novoCpf,
      email: this.novoEmail,
      data_nascimento: this.novoDataNascimento
    };

    if (this.clienteEditandoId) {
      this.http.put<any>(`http://127.0.0.1:8000/clientes/${this.clienteEditandoId}`, dadosDoFormulario).subscribe({
        next: (resposta) => {
          if (resposta.erro) {
            alert('Atenção: ' + resposta.erro); 
          } else {
            this.limparFormulario(); 
            this.carregarClientes(); 
          }
        },
        error: (erro) => alert('Falha ao atualizar.')
      });
    } else {
      this.http.post<any>('http://127.0.0.1:8000/clientes', dadosDoFormulario).subscribe({
        next: (resposta) => {
          if (resposta.erro) {
            alert('Atenção: ' + resposta.erro); 
          } else {
            this.limparFormulario();
            this.carregarClientes();
          }
        },
        error: (erro) => alert('Falha ao salvar.')
      });
    }
  }

  editarCliente(cliente: any) {
    this.clienteEditandoId = cliente.id;
    this.novoNome = cliente.nome;
    this.novoTelefone = cliente.telefone;
    this.novoCpf = cliente.cpf !== 'Não informado' ? cliente.cpf : '';
    this.novoEmail = cliente.email !== 'Não informado' ? cliente.email : '';
    this.novoDataNascimento = cliente.data_nascimento !== 'Não informado' ? cliente.data_nascimento : '';
  }

  limparFormulario() {
    this.novoNome = '';
    this.novoTelefone = '';
    this.novoCpf = '';
    this.novoEmail = '';
    this.novoDataNascimento = '';
    this.clienteEditandoId = null;
  }

  excluirCliente(id: number) {
    const confirmacao = confirm('Tem certeza que deseja excluir este cliente?');
    if (!confirmacao) return; 

    this.http.delete<any>(`http://127.0.0.1:8000/clientes/${id}`).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          alert('Atenção: O banco bloqueou a exclusão!\n\nMotivo: ' + resposta.erro);
        } else {
          this.carregarClientes(); 
        }
      },
      error: (erro) => alert('Falha ao excluir.')
    });
  }

  // --- LÓGICA DO FAROL DE RISCO ---
  calcularRiscoCor(dataUltimaCompra: string): string {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') {
      return 'transparent';
    }

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diferencaTempo = hoje.getTime() - dataCompra.getTime();
    const diasInativos = Math.floor(diferencaTempo / (1000 * 3600 * 24));

    if (diasInativos <= 30) {
      return '#d4edda'; 
    } else if (diasInativos <= 90) {
      return '#fff3cd'; 
    } else {
      return '#f8d7da'; 
    }
  }

  exibirTextoDias(dataUltimaCompra: string): string {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') {
      return 'Sem vendas';
    }

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diferencaTempo = hoje.getTime() - dataCompra.getTime();
    const diasInativos = Math.floor(diferencaTempo / (1000 * 3600 * 24));

    return `${dataUltimaCompra} (${diasInativos} dias)`;
  }

  // --- LÓGICA DE REGISTRO DE VENDAS ---
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

  salvarVenda() {
    if (!this.novaVendaValor || this.novaVendaValor <= 0) {
      alert('Por favor, insira um valor válido maior que zero.');
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
          alert('Erro: ' + resposta.erro);
        } else {
          this.carregarClientes();
          this.carregarEstatisticas(); 
        }
      },
      error: (erro) => alert('Falha ao registrar venda.')
    });
  }

  // --- LÓGICA DE AUTOMAÇÃO DE WHATSAPP (VERSÃO 0.7) ---
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

  // --- LÓGICA DE FILTROS DE RISCO (VERSÃO 0.7) ---
  definirFiltro(cor: string) {
    this.filtroAtual = cor;
  }

  obterClientesFiltrados() {
    if (this.filtroAtual === 'Todos') {
      return this.clientes;
    }
    // Filtra a lista comparando a cor do farol do cliente com a cor do filtro clicado
    return this.clientes.filter(cliente => this.calcularRiscoCor(cliente.ultima_compra) === this.filtroAtual);
  }
  // --- LÓGICA DO DASHBOARD DE RECEITA (VERSÃO 0.8) ---
  carregarEstatisticas() {
    this.http.get<any>('http://127.0.0.1:8000/estatisticas').subscribe({
      next: (dados) => {
        this.totalRecuperado = dados.total_recuperado;
        this.clientesReativados = dados.clientes_reativados;
        this.cdr.detectChanges(); 
      },
      error: (erro) => console.error('Erro ao buscar estatísticas:', erro)
    });
  }
}