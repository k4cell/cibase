import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../api.config';
import { ToastService } from './toast.service';
import { ClientesService } from './clientes.service';
import { ServicosService } from './servicos.service';
import { RefrescoService } from './refresco.service';
import { formatarData } from '../utils/formatacao';

// ==============================================================================
// MOTOR DE RECOMENDAÇÃO -- consome o motor do backend (classificação por
// cliente+serviço, travas e ordenação, conforme o documento
// "motor-de-recomendacao.pdf"). Alimenta a aba "Atividades" (Hoje) e o badge
// de status do Painel de Recuperação.
// ==============================================================================
@Injectable({ providedIn: 'root' })
export class MotorService {
  readonly LIMITE_FILA_HOJE = 10;

  filaHoje: any[] = [];
  clientesAdiados: any[] = [];
  contatados: any[] = [];
  contatadosCarregados: boolean = false;

  // Situação de cada cliente+serviço que já teve pelo menos uma compra,
  // calculada SÓ pela última compra (backend: /motor/classificacao) e
  // agrupada por cliente. Inclui os que estão em dia -- o status "Ativo" do
  // motor chega aqui já com o nome "Em dia". Cliente sem NENHUMA linha aqui
  // não tem histórico de compra (não é "Em dia": não dá pra saber).
  classificacaoPorCliente: { [clienteId: number]: any[] } = {};

  constructor(
    private http: HttpClient,
    private toast: ToastService,
    private clientesService: ClientesService,
    private servicosService: ServicosService,
    private refresco: RefrescoService
  ) {
    // Mudou a carteira (importou planilha, registrou venda, arquivou...): a
    // classificação, a fila e os contatados dependem disso e ficariam velhos.
    this.clientesService.aoMudarCarteira(() => {
      this.carregarClassificacaoMotor();
      this.montarFilaDeHoje();
      if (this.contatadosCarregados) this.carregarContatados();
    });
  }

  montarFilaDeHoje() {
    this.carregarFilaMotor();
    this.carregarAdiadosMotor();
  }

  private carregarFilaMotor() {
    this.http.get<any>(`${API_BASE_URL}/motor/fila?tamanho=${this.LIMITE_FILA_HOJE}`).subscribe({
      next: (dados) => {
        if (dados.erro) { this.toast.mostrar('Erro: ' + dados.erro, '#dc3545'); return; }
        this.filaHoje = (dados.fila || []).map((linha: any) => this.montarItemFila(linha));
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao montar a fila de hoje.', '#dc3545')
    });
  }

  carregarContatados() {
    this.http.get<any>(`${API_BASE_URL}/motor/contatados`).subscribe({
      next: (dados) => {
        if (dados.erro) { this.toast.mostrar('Erro: ' + dados.erro, '#dc3545'); return; }
        this.contatados = dados.contatados || [];
        this.contatadosCarregados = true;
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao carregar os contatados.', '#dc3545')
    });
  }

  // O motor devolve cliente_id/servico_id; o resto dos dados do cliente
  // (telefone, valor recuperado) já está carregado em ClientesService.
  private montarItemFila(linha: any) {
    const cliente = this.clientesService.clientes.find(c => c.id === linha.cliente_id)
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
      ...this.mensagemDaFila(cliente.nome, linha)
    };
  }

  // A mensagem do card: o modelo do serviço (se o dono salvou um) ou a padrão
  // do status. `mensagemInicial` guarda o texto gerado pra tela saber se o
  // dono editou (aí aparece "Salvar como modelo").
  private mensagemDaFila(nomeCliente: string, linha: any) {
    const modelo: string = (linha.mensagem_modelo || '').trim();
    const texto = modelo
      ? this.renderizarModelo(modelo, nomeCliente, linha.servico_nome)
      : this.mensagemSugeridaFila(nomeCliente, linha.status);
    return { mensagemDraft: texto, mensagemInicial: texto, temModelo: !!modelo };
  }

  private primeiroNome(nome: string): string {
    return (nome || '').trim().split(/\s+/)[0] || nome;
  }

  // {nome} = primeiro nome do cliente, {servico} = nome do serviço.
  private renderizarModelo(modelo: string, nomeCliente: string, servicoNome: string): string {
    return modelo
      .replace(/\{nome\}/gi, this.primeiroNome(nomeCliente))
      .replace(/\{servico\}/gi, servicoNome);
  }

  // Caminho inverso: o dono editou o texto do card com o nome do cliente e do
  // serviço "de verdade"; pra virar modelo, troca esses nomes de volta pelos
  // marcadores (senão o modelo mandaria o nome do 1º cliente pra todo mundo).
  private transformarEmModelo(texto: string, nomeCliente: string, servicoNome: string): string {
    const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let modelo = texto.trim();
    if (servicoNome) modelo = modelo.replace(new RegExp(escapar(servicoNome), 'giu'), '{servico}');
    const primeiro = this.primeiroNome(nomeCliente);
    if (primeiro) {
      modelo = modelo.replace(new RegExp('(?<![\\p{L}\\p{N}])' + escapar(primeiro) + '(?![\\p{L}\\p{N}])', 'giu'), '{nome}');
    }
    return modelo;
  }

  salvarModeloDoServico(item: any) {
    const modelo = this.transformarEmModelo(item.mensagemDraft, item.cliente.nome, item.servicoNome);
    if (!modelo) { this.toast.mostrar('Escreva a mensagem antes de salvar como modelo.', '#ffc107'); return; }

    this.http.put<any>(`${API_BASE_URL}/servicos/${item.servicoId}/mensagem`, { mensagem_modelo: modelo }).subscribe({
      next: (resposta) => {
        if (resposta.erro) { this.toast.mostrar('Erro: ' + resposta.erro, '#dc3545'); return; }
        const salvo: string = resposta.mensagem_modelo;

        const servico = this.servicosService.servicos.find(s => s.id === item.servicoId);
        if (servico) servico.mensagem_modelo = salvo;

        // Este card e os outros do mesmo serviço que o dono não editou passam a usar o modelo já.
        for (const outro of this.filaHoje) {
          if (outro.servicoId !== item.servicoId) continue;
          const semEdicao = outro === item || outro.mensagemDraft === outro.mensagemInicial;
          outro.temModelo = true;
          if (semEdicao) {
            outro.mensagemInicial = this.renderizarModelo(salvo, outro.cliente.nome, outro.servicoNome);
            outro.mensagemDraft = outro.mensagemInicial;
          }
        }

        this.toast.mostrar(`Mensagem salva como modelo de ${item.servicoNome}. As próximas já saem assim.`, '#28a745');
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao salvar o modelo de mensagem.', '#dc3545')
    });
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
      'Frio': 'tx-status--frio',
      'Em dia': 'tx-status--em-dia',
      'Sem histórico': 'tx-status--sem-historico'
    };
    return mapa[status] || '';
  }

  private motivoFila(linha: any): string {
    const base = `Está há ${linha.dias_sem_comprar} dias sem comprar (ciclo esperado: ${linha.ciclo_esperado} dias).`;
    return linha.baixa_confianca ? `${base} Estimativa com poucos dados ainda.` : base;
  }

  // Mensagem específica da fila do motor, baseada no status (Atrasado /
  // Adormecido / Recompra próxima / Frio) -- diferente da mensagemSugerida()
  // geral do ClientesService (usada na Ficha e nas tabelas), que continua
  // baseada no farol de risco configurável e não deve mudar.
  private mensagemSugeridaFila(nomeCompleto: string, status: string): string {
    const nome = this.primeiroNome(nomeCompleto);
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
        if (dados.erro) { this.toast.mostrar('Erro: ' + dados.erro, '#dc3545'); return; }
        this.clientesAdiados = (dados.adiados || []).map((item: any) => ({
          contatoId: item.contato_id,
          clienteId: item.cliente_id,
          clienteNome: item.cliente_nome,
          servicoId: item.servico_id,
          servicoNome: item.servico_nome,
          textoRetorno: this.textoRetorno(item.dias_restantes)
        }));
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao carregar os adiados.', '#dc3545')
    });
  }

  private textoRetorno(dias: number): string {
    if (dias <= 1) return 'Volta amanhã';
    return `Volta em ${dias} dias`;
  }

  // Contatar direto quem está adiado, sem precisar trazer de volta pra fila
  // antes -- assume silêncio igual ao Enviar da fila (mesma regra do
  // documento) e recalcula a data de reentrada a partir de agora.
  contatarAdiado(item: any) {
    const cliente = this.clientesService.clientes.find(c => c.id === item.clienteId);
    const modelo: string = (this.servicosService.servicos.find(s => s.id === item.servicoId)?.mensagem_modelo || '').trim();
    const mensagem = modelo
      ? this.renderizarModelo(modelo, item.clienteNome, item.servicoNome)
      : `Oi, ${this.primeiroNome(item.clienteNome)}! Tudo bem? Passando pra saber se podemos te ajudar com alguma coisa.`;
    window.open(this.clientesService.linkWhatsApp(cliente?.telefone || '', mensagem), '_blank');

    const corpo = { cliente_id: item.clienteId, servico_id: item.servicoId, resultado: 'silencio' };
    this.http.post<any>(`${API_BASE_URL}/motor/contatos`, corpo).subscribe({
      next: (resposta) => {
        if (resposta.erro) { this.toast.mostrar('Erro: ' + resposta.erro, '#dc3545'); return; }
        this.toast.mostrar(`Mensagem aberta pra ${item.clienteNome}.`, '#28a745');

        // Já foi contatado: sai dos Adiados na hora, entra em Contatados e não
        // pode sobrar um card dele na fila de hoje (que foi montada antes).
        this.clientesAdiados = this.clientesAdiados.filter(a => !(a.clienteId === item.clienteId && a.servicoId === item.servicoId));
        this.filaHoje = this.filaHoje.filter(f => f.cliente.id !== item.clienteId);
        this.refresco.notificar();

        this.montarFilaDeHoje();
        if (this.contatadosCarregados) this.carregarContatados();
      },
      error: () => this.toast.mostrar('Falha ao registrar o contato.', '#dc3545')
    });
  }

  // Desfecho depois do envio (documento: só 2 desfechos pedem clique):
  // "recusou" ou "me procure depois de <data>". Nenhum dos dois muda o status
  // do cliente -- só quando a linha volta a poder aparecer na fila.
  registrarDesfecho(contatado: any, resultado: 'recusou' | 'adiar_com_data', dataIso: string | null, aoTerminar: (sucesso: boolean) => void) {
    const corpo: any = { cliente_id: contatado.cliente_id, servico_id: contatado.servico_id, resultado };
    if (dataIso) corpo.data_reentrada_manual = dataIso;

    this.http.post<any>(`${API_BASE_URL}/motor/contatos`, corpo).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          this.toast.mostrar('Erro: ' + resposta.erro, '#dc3545');
          aoTerminar(false);
          return;
        }

        let texto: string;
        if (resultado === 'adiar_com_data') {
          texto = `Combinado: ${contatado.cliente_nome} volta à fila em ${formatarData(dataIso as string)}.`;
        } else if (resposta.vira_nao_contatar) {
          texto = `${contatado.cliente_nome} recusou 3 vezes seguidas e foi marcado como "não contatar".`;
        } else {
          texto = `Anotado: ${contatado.cliente_nome} recusou. Só volta à fila depois de ${formatarData(resposta.data_reentrada)}.`;
        }
        this.toast.mostrar(texto, '#28a745');
        aoTerminar(true);
        this.recarregarListasDeContato();
      },
      error: () => {
        this.toast.mostrar('Falha ao registrar o desfecho.', '#dc3545');
        aoTerminar(false);
      }
    });
  }

  // "Desfazer é obrigatório" (documento): apaga só o desfecho e o envio volta
  // a mostrar os botões.
  desfazerDesfecho(contatado: any) {
    this.http.delete<any>(`${API_BASE_URL}/motor/contatos/${contatado.desfecho_contato_id}`).subscribe({
      next: (resposta) => {
        if (resposta.erro) { this.toast.mostrar('Erro: ' + resposta.erro, '#dc3545'); return; }
        this.toast.mostrar('Desfeito.', '#28a745');
        this.recarregarListasDeContato();
      },
      error: () => this.toast.mostrar('Falha ao desfazer.', '#dc3545')
    });
  }

  private recarregarListasDeContato() {
    this.carregarContatados();
    this.montarFilaDeHoje();
  }

  // Cliente já comprou pelo menos um serviço (tem alguma linha de situação).
  temHistoricoDeCompra(clienteId: number): boolean {
    return (this.classificacaoPorCliente[clienteId] || []).length > 0;
  }

  // Perfil do cliente pro Painel de Recuperação: o serviço mais urgente dele
  // (se tiver algum fora do "Em dia") + quantos outros também estão em atraso.
  // null = nenhum serviço pendente: ou está tudo em dia, ou não tem histórico
  // (quem chama distingue os dois com temHistoricoDeCompra).
  perfilMotorCliente(clienteId: number): { servicoNome: string, status: string, extras: number } | null {
    const linhas = (this.classificacaoPorCliente[clienteId] || []).filter(l => l.status !== 'Em dia');
    if (linhas.length === 0) return null;

    const ordemGravidade = ['Frio', 'Adormecido', 'Atrasado', 'Recompra próxima'];
    const principal = [...linhas].sort(
      (a, b) => ordemGravidade.indexOf(a.status) - ordemGravidade.indexOf(b.status)
    )[0];

    return { servicoNome: principal.servico_nome, status: principal.status, extras: linhas.length - 1 };
  }

  carregarClassificacaoMotor() {
    this.http.get<any>(`${API_BASE_URL}/motor/classificacao`).subscribe({
      next: (dados) => {
        if (dados.erro) { this.toast.mostrar('Erro: ' + dados.erro, '#dc3545'); return; }
        const mapa: { [clienteId: number]: any[] } = {};
        for (const linha of (dados.linhas || [])) {
          if (!mapa[linha.cliente_id]) mapa[linha.cliente_id] = [];
          // "Ativo" é o nome interno do motor; na tela é "Em dia".
          mapa[linha.cliente_id].push({ ...linha, status: linha.status === 'Ativo' ? 'Em dia' : linha.status });
        }
        this.classificacaoPorCliente = mapa;
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao carregar a classificação do motor.', '#dc3545')
    });
  }

  // "Trazer de volta agora" = desfazer o último contato registrado pra essa
  // linha (documento: "desfazer é obrigatório") -- some a trava de reentrada.
  trazerDeVoltaAgora(item: any) {
    this.http.delete<any>(`${API_BASE_URL}/motor/contatos/${item.contatoId}`).subscribe({
      next: (resposta) => {
        if (resposta.erro) { this.toast.mostrar('Erro: ' + resposta.erro, '#dc3545'); return; }
        this.toast.mostrar(`${item.clienteNome} volta a aparecer na fila.`, '#28a745');
        this.montarFilaDeHoje();
      },
      error: () => this.toast.mostrar('Falha ao trazer o cliente de volta.', '#dc3545')
    });
  }

  // Mandar a mensagem assume silêncio por padrão -- o documento é explícito:
  // "o sistema não espera pra concluir que não houve resposta, assume isso
  // desde o clique". Se a pessoa clicar em Adiar depois, esse registro é
  // substituído por um mais específico.
  enviarMensagemFila(item: any) {
    window.open(this.clientesService.linkWhatsApp(item.cliente.telefone, item.mensagemDraft), '_blank');
    this.registrarContatoFila(item, 'silencio', `Mensagem enviada. Se ${item.cliente.nome} não responder, ele volta à fila automaticamente.`);
  }

  adiarContatoFila(item: any) {
    this.registrarContatoFila(item, 'adiar_sem_data', `${item.cliente.nome} volta à fila mais pra frente.`);
  }

  // "X" do card: só tira o cliente da fila de HOJE (local, sem registrar
  // contato nenhum no motor) -- diferente do Adiar, não afeta a reentrada.
  // Volta a aparecer normalmente na próxima vez que a fila for recalculada.
  excluirDaFilaLocal(item: any) {
    this.filaHoje = this.filaHoje.filter(f => !(f.cliente.id === item.cliente.id && f.servicoId === item.servicoId));
  }

  private registrarContatoFila(item: any, resultado: string, mensagemToast: string) {
    const corpo = { cliente_id: item.cliente.id, servico_id: item.servicoId, resultado };
    this.http.post<any>(`${API_BASE_URL}/motor/contatos`, corpo).subscribe({
      next: (resposta) => {
        if (resposta.erro) { this.toast.mostrar('Erro: ' + resposta.erro, '#dc3545'); return; }

        this.filaHoje = this.filaHoje.filter(f => !(f.cliente.id === item.cliente.id && f.servicoId === item.servicoId));
        const texto = resposta.vira_nao_contatar
          ? `${item.cliente.nome} recusou 3 vezes seguidas e foi marcado como "não contatar".`
          : mensagemToast;
        this.toast.mostrar(texto, '#28a745');
        this.refresco.notificar();
        this.carregarAdiadosMotor();
        if (this.contatadosCarregados) this.carregarContatados();
      },
      error: () => this.toast.mostrar('Falha ao registrar o contato.', '#dc3545')
    });
  }
}
