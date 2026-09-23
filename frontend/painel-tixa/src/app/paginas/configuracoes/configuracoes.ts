import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../auth.service';
import { TemaService } from '../../services/tema.service';
import { ToastService } from '../../services/toast.service';
import { RefrescoService } from '../../services/refresco.service';

// A Régua de Relacionamento (dias_atencao/dias_risco) NÃO mora mais aqui --
// virou uma engrenagem dentro do Painel de Recuperação, perto de onde o
// efeito dela realmente aparece. Esta página agora é "configurações" de
// verdade: perfil da conta, aparência e segurança.
@Component({
  selector: 'app-configuracoes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracoes.html'
})
export class ConfiguracoesComponent implements OnInit, OnDestroy {
  subAba: string = 'perfil';

  nomeExibicao: string = '';
  salvandoPerfil: boolean = false;

  senhaAtual: string = '';
  novaSenha: string = '';
  confirmarNovaSenha: string = '';
  alterandoSenha: boolean = false;

  private desregistrar!: () => void;

  constructor(
    public authService: AuthService,
    public tema: TemaService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private refresco: RefrescoService
  ) {}

  ngOnInit() {
    this.desregistrar = this.refresco.registrar(() => this.cdr.detectChanges());
    this.nomeExibicao = this.authService.usuarioAtual?.displayName || '';
  }

  ngOnDestroy() {
    this.desregistrar();
  }

  trocarSubAba(aba: string) {
    this.subAba = aba;
  }

  async salvarPerfil() {
    const nome = this.nomeExibicao.trim();
    if (!nome) {
      this.toast.mostrar('Digite um nome.', '#ffc107');
      return;
    }

    this.salvandoPerfil = true;
    try {
      await this.authService.atualizarNomeExibicao(nome);
      this.toast.mostrar('Nome atualizado!', '#28a745');
    } catch {
      this.toast.mostrar('Falha ao atualizar o nome.', '#dc3545');
    }
    this.salvandoPerfil = false;
    // await acima roda fora do que o Angular rastreia sozinho (zoneless) --
    // sem isso o botão ficaria preso em "Salvando...".
    this.cdr.detectChanges();
  }

  async alterarSenha() {
    if (!this.senhaAtual || !this.novaSenha || !this.confirmarNovaSenha) {
      this.toast.mostrar('Preencha todos os campos.', '#ffc107');
      return;
    }
    if (this.novaSenha.length < 6) {
      this.toast.mostrar('A nova senha precisa ter pelo menos 6 caracteres.', '#ffc107');
      return;
    }
    if (this.novaSenha !== this.confirmarNovaSenha) {
      this.toast.mostrar('As senhas não coincidem.', '#dc3545');
      return;
    }

    this.alterandoSenha = true;
    try {
      await this.authService.alterarSenha(this.senhaAtual, this.novaSenha);
      this.toast.mostrar('Senha alterada com sucesso!', '#28a745');
      this.senhaAtual = '';
      this.novaSenha = '';
      this.confirmarNovaSenha = '';
    } catch (erro: any) {
      this.toast.mostrar(this.mensagemErroSenha(erro?.code), '#dc3545');
    }
    this.alterandoSenha = false;
    this.cdr.detectChanges();
  }

  private mensagemErroSenha(codigo: string): string {
    switch (codigo) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Senha atual incorreta.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas erradas. Espere um pouco e tente de novo.';
      default:
        return 'Não foi possível alterar a senha. Verifique sua conexão.';
    }
  }
}
