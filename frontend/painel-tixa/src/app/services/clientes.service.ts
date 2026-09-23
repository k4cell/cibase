import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../api.config';
import { ToastService } from './toast.service';
import { TemaService } from './tema.service';
import { VendasService } from './vendas.service';
import { EstatisticasService } from './estatisticas.service';
import { RefrescoService } from './refresco.service';

@Injectable({ providedIn: 'root' })
export class ClientesService {
  clientes: any[] = [];
  clientesArquivados: any[] = [];

  // ==============================================================================
  // ESTADO DOS MODAIS COMPARTILHADOS -- tanto o Painel de Recuperação quanto
  // Clientes em Geral abrem Cadastro/Edição, Ficha, Nova Venda e Arquivar; o
  // ShellComponent é quem RENDERIZA esses modais (pra não duplicar o HTML em
  // duas páginas), mas quem abre/fecha é sempre através deste serviço.
  // ==============================================================================
  mostrarModalCadastro: boolean = false;
  salvandoCliente: boolean = false;
  clienteEditandoId: number | null = null;
  novoNome: string = '';
  novoTelefone: string = '';
  novoCpf: string = '';
  novoEmail: string = '';
  novoDataNascimento: string = '';

  clienteDetalhe: any = null;
  vendasClienteDetalhe: any[] = [];
  carregandoVendasDetalhe: boolean = false;

  clienteVendaId: number | null = null;
  clienteVendaNome: string = '';
  novaVendaValor: number | null = null;
  novaVendaServicoId: string = '';

  clienteParaArquivar: any = null;
  arquivandoCliente: boolean = false;

  clienteParaExcluirPermanente: any = null;
  excluindoPermanente: boolean = false;

  constructor(
    private http: HttpClient,
    private toast: ToastService,
    private tema: TemaService,
    private vendasService: VendasService,
    private estatisticasService: EstatisticasService,
    private refresco: RefrescoService
  ) {}

  carregarClientes(aoTerminar?: () => void) {
    this.http.get<any>(`${API_BASE_URL}/clientes`).subscribe({
      next: (dados) => {
        this.clientes = dados.clientes;
        if (aoTerminar) aoTerminar();
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao conectar com o banco de clientes.', '#dc3545')
    });
  }

  carregarClientesArquivados() {
    this.http.get<any>(`${API_BASE_URL}/clientes/arquivados`).subscribe({
      next: (dados) => { this.clientesArquivados = dados.clientes; this.refresco.notificar(); },
      error: () => this.toast.mostrar('Falha ao conectar com o banco de arquivados.', '#dc3545')
    });
  }

  // aoTerminar SEMPRE é chamado (sucesso ou falha) -- quem chama usa isso pra
  // desligar o spinner; só fecha o modal quando `sucesso` vier true.
  salvarCliente(dados: any, clienteEditandoId: number | null, aoTerminar: (sucesso: boolean) => void) {
    if (clienteEditandoId) {
      this.http.put<any>(`${API_BASE_URL}/clientes/${clienteEditandoId}`, dados).subscribe({
        next: (resposta) => {
          if (resposta.erro) {
            aoTerminar(false);
            this.toast.mostrar('Atenção: ' + resposta.erro, '#ffc107');
          } else {
            this.toast.mostrar('Cliente atualizado com sucesso!', '#28a745');
            this.carregarClientes();
            aoTerminar(true);
          }
          this.refresco.notificar();
        },
        error: () => {
          aoTerminar(false);
          this.toast.mostrar('Falha ao atualizar o cliente.', '#dc3545');
        }
      });
    } else {
      this.http.post<any>(`${API_BASE_URL}/clientes`, dados).subscribe({
        next: (resposta) => {
          if (resposta.erro) {
            aoTerminar(false);
            this.toast.mostrar('Atenção: ' + resposta.erro, '#ffc107');
          } else {
            this.toast.mostrar('Cliente cadastrado com sucesso!', '#28a745');
            this.carregarClientes();
            aoTerminar(true);
          }
          this.refresco.notificar();
        },
        error: () => {
          aoTerminar(false);
          this.toast.mostrar('Falha ao salvar o cliente.', '#dc3545');
        }
      });
    }
  }

  arquivarCliente(id: number, aoTerminar: () => void) {
    this.http.delete<any>(`${API_BASE_URL}/clientes/${id}`).subscribe({
      next: (resposta) => {
        aoTerminar();
        if (resposta.erro) {
          this.toast.mostrar('Atenção: ' + resposta.erro, '#ffc107');
        } else {
          this.toast.mostrar('Cliente arquivado com sucesso!', '#28a745');
          this.carregarClientes();
          this.carregarClientesArquivados();
        }
        this.refresco.notificar();
      },
      error: () => {
        aoTerminar();
        this.toast.mostrar('Falha ao arquivar cliente.', '#dc3545');
      }
    });
  }

  reativarCliente(cliente: any) {
    this.http.put<any>(`${API_BASE_URL}/clientes/${cliente.id}/reativar`, {}).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          this.toast.mostrar('Atenção: ' + resposta.erro, '#ffc107');
        } else {
          this.toast.mostrar('Cliente reativado com sucesso!', '#28a745');
          this.carregarClientes();
          this.carregarClientesArquivados();
        }
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao reativar cliente.', '#dc3545')
    });
  }

  excluirPermanente(id: number, aoTerminar: () => void) {
    this.http.delete<any>(`${API_BASE_URL}/clientes/${id}/permanente`).subscribe({
      next: (resposta) => {
        aoTerminar();
        if (resposta.erro) {
          this.toast.mostrar('Atenção: ' + resposta.erro, '#ffc107');
        } else {
          this.toast.mostrar('Cliente excluído permanentemente.', '#28a745');
          this.carregarClientesArquivados();
        }
        this.refresco.notificar();
      },
      error: () => {
        aoTerminar();
        this.toast.mostrar('Falha ao excluir cliente permanentemente.', '#dc3545');
      }
    });
  }

  buscarVendasDoCliente(clienteId: number, aoReceber: (vendas: any[]) => void, aoFalhar: () => void) {
    this.http.get<any>(`${API_BASE_URL}/clientes/${clienteId}/vendas`).subscribe({
      next: (dados) => { aoReceber(dados.vendas || []); this.refresco.notificar(); },
      error: () => {
        aoFalhar();
        this.toast.mostrar('Falha ao carregar histórico de compras.', '#dc3545');
      }
    });
  }

  importarPlanilha(arquivo: File, aoTerminar: () => void) {
    const formData = new FormData();
    formData.append('arquivo', arquivo);

    this.http.post<any>(`${API_BASE_URL}/importar-clientes`, formData).subscribe({
      next: (resposta) => {
        aoTerminar();

        if (resposta.erro) {
          this.toast.mostrar(resposta.erro, '#dc3545');
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

        this.toast.mostrar(mensagem, cor);
        this.carregarClientes();
        this.estatisticasService.carregarEstatisticas();
        this.estatisticasService.carregarReceitaMensal();
        this.estatisticasService.carregarClientesPeriodo();
        this.refresco.notificar();
      },
      error: () => {
        aoTerminar();
        this.toast.mostrar('Falha ao importar a planilha.', '#dc3545');
      }
    });
  }

  // Identidade da classificação (usada em filtros e na escolha de mensagem) --
  // separada da cor, porque a cor muda de tema e a identidade não pode mudar junto.
  // Sistema antigo de "farol de risco" -- ainda usado nos filtros do Painel de
  // Recuperação e na mensagem padrão do WhatsApp; o motor de recomendação
  // (services/motor.service.ts) já tem seu próprio status por cliente+serviço.
  classificarRisco(dataUltimaCompra: string, diasAtencao: number, diasRisco: number): 'saudavel' | 'atencao' | 'risco' | '' {
    if (!dataUltimaCompra || dataUltimaCompra === 'Sem vendas') return '';

    const dataCompra = new Date(dataUltimaCompra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));

    if (diasInativos <= diasAtencao) return 'saudavel';
    if (diasInativos <= diasRisco) return 'atencao';
    return 'risco';
  }

  classificarOportunidade(cliente: any, diasAtencao: number, diasRisco: number): any {
    const cores = this.tema.coresOportunidade;

    if (!cliente.ultima_compra || cliente.ultima_compra === 'Sem vendas') {
      return { texto: '🎯 Novo Lead', corFundo: cores.novoLead.fundo, corTexto: cores.novoLead.texto };
    }

    const dataCompra = new Date(cliente.ultima_compra);
    const hoje = new Date();
    const diasInativos = Math.floor((hoje.getTime() - dataCompra.getTime()) / (1000 * 3600 * 24));
    const valor = cliente.valor_recuperado;

    if (diasInativos > diasRisco && valor >= 400) {
      return { texto: '💎 Valioso em Risco', corFundo: cores.valiosoEmRisco.fundo, corTexto: cores.valiosoEmRisco.texto };
    } else if (diasInativos > diasRisco) {
      return { texto: '💤 Adormecido', corFundo: cores.adormecido.fundo, corTexto: cores.adormecido.texto };
    } else if (diasInativos <= diasAtencao && valor >= 400) {
      return { texto: '⭐ Promotor', corFundo: cores.promotor.fundo, corTexto: cores.promotor.texto };
    } else if (diasInativos > diasAtencao && diasInativos <= diasRisco) {
      return { texto: '🔥 Recompra Provável', corFundo: cores.recompraProvavel.fundo, corTexto: cores.recompraProvavel.texto };
    } else {
      return { texto: '🔄 Recente', corFundo: cores.recente.fundo, corTexto: cores.recente.texto };
    }
  }

  mensagemSugerida(cliente: any, diasAtencao: number, diasRisco: number): string {
    const chave = this.classificarRisco(cliente.ultima_compra, diasAtencao, diasRisco);

    if (chave === 'risco') {
      return `Olá, ${cliente.nome}! Tudo bem? Já faz um tempo desde a sua última visita. Temos condições especiais para você voltar, podemos conversar?`;
    } else if (chave === 'atencao') {
      return `Oi, ${cliente.nome}! Tudo certo? Viemos saber se você está precisando de alguma manutenção ou novidade. Nossa equipe está à disposição!`;
    } else if (chave === 'saudavel') {
      return `Olá, ${cliente.nome}! Muito obrigado pela sua preferência recente. Como está sendo sua experiência com a nossa empresa?`;
    }
    return `Olá, ${cliente.nome}! Tudo bem? Vimos o seu cadastro aqui e queremos te apresentar nossos serviços. Posso te enviar nosso catálogo?`;
  }

  linkWhatsApp(telefone: string, mensagem: string): string {
    let telefoneLimpo = (telefone || '').replace(/\D/g, '');
    if (telefoneLimpo.length === 10 || telefoneLimpo.length === 11) {
      telefoneLimpo = '55' + telefoneLimpo;
    }
    return `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`;
  }

  abrirWhatsApp(cliente: any, diasAtencao: number, diasRisco: number) {
    window.open(this.linkWhatsApp(cliente.telefone, this.mensagemSugerida(cliente, diasAtencao, diasRisco)), '_blank');
  }

  // ==============================================================================
  // ORQUESTRAÇÃO DOS MODAIS COMPARTILHADOS
  // ==============================================================================
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

  private limparFormulario() {
    this.novoNome = '';
    this.novoTelefone = '';
    this.novoCpf = '';
    this.novoEmail = '';
    this.novoDataNascimento = '';
    this.clienteEditandoId = null;
  }

  confirmarCadastro() {
    const nomeLimpo = this.novoNome.trim();
    const cpfLimpo = this.novoCpf.replace(/\D/g, '');
    const telefoneLimpo = this.novoTelefone.replace(/\D/g, '');

    if (!nomeLimpo || !this.novoTelefone || !this.novoCpf || !this.novoEmail || !this.novoDataNascimento) {
      this.toast.mostrar('Por favor, preencha todos os campos.', '#dc3545');
      return;
    }
    if (nomeLimpo.length < 3) {
      this.toast.mostrar('O nome do cliente deve ter no mínimo 3 letras.', '#dc3545');
      return;
    }
    if (cpfLimpo.length !== 11) {
      this.toast.mostrar('CPF inválido! O CPF deve ter exatamente 11 números.', '#dc3545');
      return;
    }
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
      this.toast.mostrar('Telefone inválido!', '#ffc107');
      return;
    }

    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    if (!regexEmail.test(this.novoEmail)) {
      this.toast.mostrar('E-mail inválido.', '#dc3545');
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
      this.toast.mostrar(`E-mail inválido. Você quis dizer "${usuario}@${dominiosConhecidos[provedor]}"?`, '#dc3545');
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
    this.salvarCliente(dadosDoFormulario, this.clienteEditandoId, (sucesso) => {
      this.salvandoCliente = false;
      if (sucesso) this.fecharModalCadastro();
    });
  }

  abrirFichaCliente(cliente: any) {
    this.clienteDetalhe = cliente;
    this.vendasClienteDetalhe = [];
    this.carregandoVendasDetalhe = true;

    this.buscarVendasDoCliente(
      cliente.id,
      (vendas) => { this.carregandoVendasDetalhe = false; this.vendasClienteDetalhe = vendas; },
      () => { this.carregandoVendasDetalhe = false; }
    );
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

  confirmarVenda() {
    if (!this.novaVendaValor || this.novaVendaValor <= 0) {
      this.toast.mostrar('Por favor, insira um valor válido.', '#ffc107');
      return;
    }

    const dadosVenda = {
      cliente_id: this.clienteVendaId,
      valor: this.novaVendaValor,
      servico_id: this.novaVendaServicoId ? parseInt(this.novaVendaServicoId, 10) : null
    };

    this.fecharModalVenda();
    this.vendasService.salvarVenda(dadosVenda, () => this.carregarClientes());
  }

  abrirConfirmacaoArquivar(cliente: any) {
    this.clienteParaArquivar = cliente;
  }

  fecharConfirmacaoArquivar() {
    this.clienteParaArquivar = null;
  }

  confirmarArquivamento() {
    if (!this.clienteParaArquivar) return;
    this.arquivandoCliente = true;
    this.arquivarCliente(this.clienteParaArquivar.id, () => {
      this.arquivandoCliente = false;
      this.clienteParaArquivar = null;
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
    this.excluindoPermanente = true;
    this.excluirPermanente(this.clienteParaExcluirPermanente.id, () => {
      this.excluindoPermanente = false;
      this.clienteParaExcluirPermanente = null;
    });
  }
}
