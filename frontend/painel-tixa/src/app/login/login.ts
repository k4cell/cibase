import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { ToastService } from '../services/toast.service';
import { TemaService } from '../services/tema.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html'
})
export class LoginComponent {
  loginEmail: string = '';
  loginSenha: string = '';
  carregandoLogin: boolean = false;
  mostrarSenhaLogin: boolean = false;
  mostrarSeletorCor: boolean = false;
  enviandoRedefinicao: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private toast: ToastService,
    public tema: TemaService,
    private cdr: ChangeDetectorRef
  ) {}

  async fazerLogin() {
    if (!this.loginEmail || !this.loginSenha) {
      this.toast.mostrar('Preencha o e-mail e a senha para entrar.', '#ffc107');
      return;
    }

    this.carregandoLogin = true;

    try {
      // O Firebase confere e-mail/senha nos servidores dele -- se der certo,
      // authService.usuarioAtual passa a existir e já dá pra pedir um token.
      await this.authService.login(this.loginEmail, this.loginSenha);

      this.carregandoLogin = false;
      this.toast.mostrar('Bem-vindo ao Painel CiBase!', '#28a745');
      this.router.navigateByUrl('/inicio');
    } catch (erro: any) {
      this.carregandoLogin = false;
      this.toast.mostrar(this.mensagemErroLogin(erro?.code), '#dc3545');
    }
    // O await acima roda fora do que o Angular rastreia sozinho (sem
    // zone.js) -- sem isso, o spinner ficaria preso mesmo com a variável já
    // correta.
    this.cdr.detectChanges();
  }

  private mensagemErroLogin(codigo: string): string {
    // O Firebase manda um "código" (ex: auth/invalid-credential) em vez de
    // uma frase pronta -- traduzimos os mais comuns pra português.
    switch (codigo) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha incorretos.';
      case 'auth/invalid-email':
        return 'E-mail inválido.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas erradas. Espere um pouco e tente de novo.';
      default:
        return 'Não foi possível entrar. Verifique sua conexão.';
    }
  }

  async esqueciSenha() {
    const email = this.loginEmail.trim();
    if (!email) {
      this.toast.mostrar('Digite seu e-mail no campo acima e clique em "Esqueceu a senha?" de novo.', '#ffc107');
      return;
    }

    const avisoEnviado = 'Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha. Confira também a caixa de spam.';

    this.enviandoRedefinicao = true;
    try {
      await this.authService.enviarRedefinicaoSenha(email);
      this.toast.mostrar(avisoEnviado, '#28a745');
    } catch (erro: any) {
      switch (erro?.code) {
        case 'auth/user-not-found':
          // Mesmo aviso do sucesso de propósito: dizer "esse e-mail não existe"
          // deixaria qualquer pessoa descobrir quem tem conta no sistema.
          this.toast.mostrar(avisoEnviado, '#28a745');
          break;
        case 'auth/invalid-email':
          this.toast.mostrar('E-mail inválido.', '#dc3545');
          break;
        case 'auth/too-many-requests':
          this.toast.mostrar('Muitas tentativas. Espere um pouco e tente de novo.', '#dc3545');
          break;
        default:
          this.toast.mostrar('Não foi possível enviar o e-mail agora. Verifique sua conexão.', '#dc3545');
      }
    }
    this.enviandoRedefinicao = false;
    // Mesma razão do fazerLogin: o await roda fora do que o Angular rastreia.
    this.cdr.detectChanges();
  }
}
