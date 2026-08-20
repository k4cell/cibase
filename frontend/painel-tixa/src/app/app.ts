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
  // A variável 'clientes' guarda a lista que vem do Python para desenhar a tabela
  clientes: any[] = [];
  
  // Estas variáveis são as "memórias" das caixas de texto.
  novoNome: string = '';
  novoTelefone: string = '';
  novoCpf: string = ''; 
  novoEmail: string = ''; 
  
  // Se esta variável tiver um número, significa que estamos EDITANDO. Se for null, estamos CRIANDO.
  clienteEditandoId: number | null = null;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.carregarClientes();
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
    // 1. Limpamos os dados apenas para validação matemática exata
    const nomeLimpo = this.novoNome.trim(); 
    const cpfLimpo = this.novoCpf.replace(/\D/g, ''); 
    const telefoneLimpo = this.novoTelefone.replace(/\D/g, ''); 

    // 2. Validação 1: Bloqueia se algum campo estiver vazio
    if (!nomeLimpo || !this.novoTelefone || !this.novoCpf || !this.novoEmail) {
      alert('Por favor, preencha Nome, E-mail, CPF e Telefone.');
      return; 
    }

    // 3. Validação 2: Tamanhos Mínimos e Máximos (A regra rigorosa voltou!)
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

    // 4. Validação 3: Formato do E-mail
    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    if (!regexEmail.test(this.novoEmail)) {
      alert('Por favor, digite um endereço de e-mail válido (ex: contato@empresa.com).');
      return;
    }

    // 5. "Empacota" os dados validados para mandar para o Python
    const dadosDoFormulario = {
      nome: nomeLimpo,
      telefone: this.novoTelefone,
      cpf: this.novoCpf,
      email: this.novoEmail
    };

    if (this.clienteEditandoId) {
      // Usamos <any> para conseguir ler a resposta de erro do Python no PUT
      this.http.put<any>(`http://127.0.0.1:8000/clientes/${this.clienteEditandoId}`, dadosDoFormulario).subscribe({
        next: (resposta) => {
          if (resposta.erro) {
            alert('Atenção: ' + resposta.erro); // Exibe alerta se o CPF já for de outro cliente
          } else {
            this.limparFormulario(); 
            this.carregarClientes(); 
          }
        },
        error: (erro) => alert('Falha ao atualizar.')
      });
    } else {
      // Usamos <any> para conseguir ler a resposta de erro do Python no POST
      this.http.post<any>('http://127.0.0.1:8000/clientes', dadosDoFormulario).subscribe({
        next: (resposta) => {
          if (resposta.erro) {
            alert('Atenção: ' + resposta.erro); // Exibe aviso de CPF duplicado no novo cadastro
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
  }

  limparFormulario() {
    this.novoNome = '';
    this.novoTelefone = '';
    this.novoCpf = '';
    this.novoEmail = '';
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
}