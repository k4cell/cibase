import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../api.config';
import { ToastService } from './toast.service';
import { RefrescoService } from './refresco.service';

@Injectable({ providedIn: 'root' })
export class VendasService {
  constructor(private http: HttpClient, private toast: ToastService, private refresco: RefrescoService) {}

  salvarVenda(dadosVenda: { cliente_id: number | null; itens: { servico_id: number | null; valor: number }[] }, aoSalvar: () => void) {
    this.http.post<any>(`${API_BASE_URL}/vendas`, dadosVenda).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          this.toast.mostrar('Erro: ' + resposta.erro, '#dc3545');
        } else {
          const qtd = dadosVenda.itens.length;
          this.toast.mostrar(qtd > 1 ? `Venda registrada com ${qtd} serviços!` : 'Venda registrada!', '#28a745');
          aoSalvar();
        }
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao registrar venda.', '#dc3545')
    });
  }

  importarVendas(arquivo: File, aoTerminar: (sucesso: boolean) => void) {
    const formData = new FormData();
    formData.append('arquivo', arquivo);

    this.http.post<any>(`${API_BASE_URL}/importar-vendas`, formData).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          aoTerminar(false);
          this.toast.mostrar(resposta.erro, '#dc3545');
          this.refresco.notificar();
          return;
        }

        const inseridas = resposta.vendas_inseridas;
        const semCliente = resposta.vendas_ignoradas_sem_cliente_correspondente || 0;
        const invalidas = resposta.vendas_ignoradas_por_dados_invalidos || 0;
        const servicosCriados = resposta.servicos_criados || 0;
        const servicosAtualizados = resposta.servicos_atualizados || 0;

        const partes: string[] = [];
        if (resposta.aviso) partes.push(resposta.aviso);
        if (inseridas > 0) partes.push(inseridas === 1 ? '1 venda importada' : `${inseridas} vendas importadas`);
        if (servicosCriados > 0) partes.push(servicosCriados === 1 ? '1 serviço cadastrado' : `${servicosCriados} serviços cadastrados`);
        if (servicosAtualizados > 0) partes.push(servicosAtualizados === 1 ? '1 serviço com ciclo atualizado' : `${servicosAtualizados} serviços com ciclo atualizado`);
        if (semCliente > 0) partes.push(semCliente === 1 ? '1 venda ignorada (CPF não encontrado na base)' : `${semCliente} vendas ignoradas (CPF não encontrado na base)`);
        if (invalidas > 0) partes.push(invalidas === 1 ? '1 linha ignorada por dados inválidos' : `${invalidas} linhas ignoradas por dados inválidos`);

        const mensagem = partes.length > 0 ? partes.join('. ') + '.' : 'Nenhuma venda encontrada no arquivo.';
        this.toast.mostrar(mensagem, (inseridas > 0 || servicosCriados > 0 || servicosAtualizados > 0) ? '#28a745' : '#ffc107');
        aoTerminar(true);
        this.refresco.notificar();
      },
      error: () => {
        aoTerminar(false);
        this.toast.mostrar('Falha ao importar a planilha de vendas.', '#dc3545');
      }
    });
  }
}
