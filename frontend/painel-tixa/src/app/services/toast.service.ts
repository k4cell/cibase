import { Injectable } from '@angular/core';
import { RefrescoService } from './refresco.service';

// Toast flutuante compartilhado por qualquer tela (inclusive o login, que
// mostra erro de credencial antes de existir sessão nenhuma) -- por isso vive
// num serviço `root`, não dentro de um componente de página específico.
@Injectable({ providedIn: 'root' })
export class ToastService {
  mensagem: string = '';
  cor: string = '';
  visivel: boolean = false;
  private timeoutId: any = null;

  constructor(private refresco: RefrescoService) {}

  mostrar(mensagem: string, cor: string = '#28a745') {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.mensagem = mensagem;
    this.cor = cor;
    this.visivel = true;
    this.refresco.notificar();

    // Mensagens mais longas ficam visíveis por mais tempo (mín. 3,5s, máx. 12s).
    const duracao = Math.min(12000, Math.max(3500, mensagem.length * 80));

    this.timeoutId = setTimeout(() => {
      this.visivel = false;
      this.timeoutId = null;
      this.refresco.notificar();
    }, duracao);
  }

  fechar() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.visivel = false;
  }
}
