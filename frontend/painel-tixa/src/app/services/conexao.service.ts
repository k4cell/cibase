import { Injectable } from '@angular/core';
import { RefrescoService } from './refresco.service';

// O Render (plano grátis) hiberna o backend depois de um tempo sem uso -- o
// primeiro request depois disso pode levar mais de um minuto pra responder.
// Sem aviso nenhum, a tela parece travada/quebrada bem nesse momento (ver
// conexao-lenta.interceptor.ts, quem chama marcarLento/desmarcarLento).
//
// Contador em vez de booleano direto porque pode haver mais de um request
// lento em voo ao mesmo tempo (ex: Shell carrega vários de uma vez no
// ngOnInit) -- só esconde o aviso quando o ÚLTIMO deles terminar.
@Injectable({ providedIn: 'root' })
export class ConexaoService {
  mostrarAviso: boolean = false;
  private pendentesLentos = 0;

  constructor(private refresco: RefrescoService) {}

  marcarLento() {
    this.pendentesLentos++;
    if (!this.mostrarAviso) {
      this.mostrarAviso = true;
      this.refresco.notificar();
    }
  }

  desmarcarLento() {
    if (this.pendentesLentos === 0) return;
    this.pendentesLentos--;
    if (this.pendentesLentos === 0 && this.mostrarAviso) {
      this.mostrarAviso = false;
      this.refresco.notificar();
    }
  }
}
