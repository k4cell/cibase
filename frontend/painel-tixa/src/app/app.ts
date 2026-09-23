import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './services/toast.service';
import { TemaService } from './services/tema.service';
import { RefrescoService } from './services/refresco.service';
import { ConexaoService } from './services/conexao.service';

// Raiz da aplicação -- só o toast e o aviso de conexão lenta (visíveis em
// qualquer tela, inclusive o login, antes de existir sessão) e o
// <router-outlet>. Todo o resto do que já foi "Tixa Angular monolítico"
// virou rotas/componentes/serviços próprios.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html'
})
export class AppComponent implements OnInit {
  constructor(
    public toast: ToastService,
    public conexao: ConexaoService,
    private tema: TemaService,
    private cdr: ChangeDetectorRef,
    private refresco: RefrescoService
  ) {}

  ngOnInit() {
    this.tema.inicializar();
    // Raiz de tudo: registrar aqui cobre a árvore inteira (ver refresco.service.ts).
    this.refresco.registrar(() => this.cdr.detectChanges());
  }
}
