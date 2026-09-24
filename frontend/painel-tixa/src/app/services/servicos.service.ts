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
