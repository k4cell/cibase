import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../api.config';
import { ToastService } from './toast.service';
import { RefrescoService } from './refresco.service';

@Injectable({ providedIn: 'root' })
export class ConfiguracoesService {
  // Régua de relacionamento (Farol de Risco) -- configurável em "Configurações".
  // 30/90 são só o valor padrão até a configuração real chegar do backend após o login.
  diasAtencao: number = 30;
  diasRisco: number = 90;

  constructor(private http: HttpClient, private toast: ToastService, private refresco: RefrescoService) {}

  carregarConfiguracoes(aoCarregar?: () => void) {
    this.http.get<any>(`${API_BASE_URL}/configuracoes`).subscribe({
      next: (dados) => {
        if (!dados.erro) {
          this.diasAtencao = dados.dias_atencao;
          this.diasRisco = dados.dias_risco;
          if (aoCarregar) aoCarregar();
        }
        this.refresco.notificar();
      },
      error: () => this.toast.mostrar('Falha ao carregar as configurações.', '#dc3545')
    });
  }

  salvarConfiguracoes(diasAtencao: number, diasRisco: number, aoFinalizar: () => void) {
    if (diasAtencao <= 0 || diasRisco <= 0) {
      aoFinalizar();
      this.toast.mostrar('Os prazos precisam ser maiores que zero.', '#ffc107');
      return;
    }
    if (diasAtencao >= diasRisco) {
      aoFinalizar();
      this.toast.mostrar('O prazo de "Atenção" precisa ser menor que o de "Risco Alto".', '#ffc107');
      return;
    }

    this.http.put<any>(`${API_BASE_URL}/configuracoes`, { dias_atencao: diasAtencao, dias_risco: diasRisco }).subscribe({
      next: (resposta) => {
        aoFinalizar();
        if (resposta.erro) {
          this.toast.mostrar(resposta.erro, '#ffc107');
        } else {
          this.diasAtencao = diasAtencao;
          this.diasRisco = diasRisco;
          this.toast.mostrar('Configurações salvas! O farol de risco já está atualizado.', '#28a745');
        }
        this.refresco.notificar();
      },
      error: () => {
        aoFinalizar();
        this.toast.mostrar('Falha ao salvar as configurações.', '#dc3545');
      }
    });
  }
}
