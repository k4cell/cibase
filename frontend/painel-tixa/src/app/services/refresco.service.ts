import { Injectable } from '@angular/core';

// Este app não usa zone.js. Sem isso, uma mudança de estado feita por um
// SERVIÇO (fora de qualquer clique) nunca chega a re-renderizar a tela.
//
// Descoberta importante: detectChanges() chamado no componente RAIZ não
// cascateia pra dentro do componente que o Router colocou no <router-outlet>
// (testado e confirmado -- só funciona chamando detectChanges() direto no
// componente que está de fato exibindo o dado). Por isso este serviço aceita
// VÁRIOS ouvintes: o Shell registra o seu, e cada página (Hoje, Painel de
// Recuperação, etc.) registra o seu próprio ao montar e desregistra ao sair,
// assim qualquer notificar() atualiza tanto a casca quanto a página ativa.
@Injectable({ providedIn: 'root' })
export class RefrescoService {
  private ouvintes = new Set<() => void>();

  registrar(fn: () => void): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  notificar() {
    for (const fn of this.ouvintes) {
      try {
        fn();
      } catch {
        // Um ouvinte de uma página que acabou de ser destruída (troca de
        // rota no meio de uma resposta HTTP) pode falhar aqui -- ignora,
        // os outros ouvintes (e o desregistro no ngOnDestroy) resolvem.
      }
    }
  }
}
