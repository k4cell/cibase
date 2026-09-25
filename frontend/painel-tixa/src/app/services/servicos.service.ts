import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../api.config';
import { ToastService } from './toast.service';
import { RefrescoService } from './refresco.service';

@Injectable({ providedIn: 'root' })
export class ServicosService {
  servicos: any[] = [];

  constructor(private http: HttpClient, private toast: ToastService, private refresco: RefrescoService) {}

  carregarServicos() {
    this.http.get<any>(`${API_BASE_URL}/servicos`).subscribe({
      next: (dados) => { this.servicos = dados.servicos || []; this.refresco.notificar(); },
      error: () => this.toast.mostrar('Falha ao carregar o catálogo de serviços.', '#dc3545')
    });
  }

  importarServicos(arquivo: File, aoTerminar: (sucesso: boolean) => void) {
    const formData = new FormData();
    formData.append('arquivo', arquivo);

    this.http.post<any>(`${API_BASE_URL}/importar-servicos`, formData).subscribe({
      next: (resposta) => {
        if (resposta.erro) {
          aoTerminar(false);
          this.toast.mostrar(resposta.erro, '#dc3545');
          this.refresco.notificar();
          return;
        }

        const criados = resposta.servicos_criados || 0;
        const atualizados = resposta.servicos_atualizados || 0;
        const partes: string[] = [];
        if (criados > 0) partes.push(criados === 1 ? '1 serviço cadastrado' : `${criados} serviços cadastrados`);
        if (atualizados > 0) partes.push(atualizados === 1 ? '1 serviço com ciclo atualizado' : `${atualizados} serviços com ciclo atualizado`);

        this.toast.mostrar(
          partes.length > 0 ? partes.join('. ') + '.' : 'Nenhum serviço novo encontrado no arquivo.',
          partes.length > 0 ? '#28a745' : '#ffc107'
        );
        this.carregarServicos();
        aoTerminar(true);
        this.refresco.notificar();
      },
      error: () => {
        aoTerminar(false);
        this.toast.mostrar('Falha ao importar a planilha de serviços.', '#dc3545');
      }
    });
  }

  adicionarServico(nome: string, diasCiclo: number, unidadeCiclo: string, aoSalvar: () => void, aoFinalizar: () => void) {
    this.http.post<any>(`${API_BASE_URL}/servicos`, { nome, dias_ciclo: diasCiclo, unidade_ciclo: unidadeCiclo }).subscribe({
      next: (resposta) => {
        aoFinalizar();
        if (resposta.erro) {
          this.toast.mostrar(resposta.erro, '#ffc107');
        } else {
          this.toast.mostrar('Serviço cadastrado!', '#28a745');
          aoSalvar();
          this.carregarServicos();
        }
        this.refresco.notificar();
      },
      error: () => {
        aoFinalizar();
        this.toast.mostrar('Falha ao cadastrar o serviço.', '#dc3545');
      }
    });
  }

  salvarEdicaoServico(id: number, nome: string, diasCiclo: number, unidadeCiclo: string, aoSalvar: () => void, aoFinalizar: () => void) {
    this.http.put<any>(`${API_BASE_URL}/servicos/${id}`, { nome, dias_ciclo: diasCiclo, unidade_ciclo: unidadeCiclo }).subscribe({
      next: (resposta) => {
        aoFinalizar();
        if (resposta.erro) {
          this.toast.mostrar(resposta.erro, '#ffc107');
          this.refresco.notificar();
          return;
        }
        this.toast.mostrar('Serviço atualizado!', '#28a745');
        aoSalvar();
        this.carregarServicos();
        this.refresco.notificar();
      },
      error: () => {
        aoFinalizar();
        this.toast.mostrar('Falha ao atualizar o serviço.', '#dc3545');
      }
    });
  }

  excluirServico(id: number, aoTerminar: () => void) {
    this.http.delete<any>(`${API_BASE_URL}/servicos/${id}`).subscribe({
      next: (resposta) => {
        aoTerminar();
        if (resposta.erro) {
          this.toast.mostrar(resposta.erro, '#ffc107');
        } else {
          this.toast.mostrar('Serviço excluído.', '#28a745');
          this.carregarServicos();
        }
        this.refresco.notificar();
      },
      error: () => {
        aoTerminar();
        this.toast.mostrar('Falha ao excluir o serviço.', '#dc3545');
      }
    });
  }
}
