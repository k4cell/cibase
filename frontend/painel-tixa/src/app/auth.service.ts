import { Injectable } from '@angular/core';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, User,
  updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth } from './firebase.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  usuarioAtual: User | null = null;

  // O Firebase reporta o estado de login de forma assíncrona (mesmo já tendo
  // sessão salva) -- o guard de rota precisa ESPERAR essa primeira resposta
  // antes de decidir se deixa entrar ou manda pro /login, senão barra sessões
  // válidas só porque o Firebase ainda não respondeu.
  //
  // IMPORTANTE: essa promise resolve só UMA vez (a primeira resposta do
  // Firebase, na largada do app) -- ela é só pra saber "o Firebase já falou
  // alguma coisa?", nunca pra saber "está logado AGORA?". Quem quiser essa
  // segunda pergunta tem que ler `usuarioAtual` depois de esperar, porque
  // esse campo sim é atualizado em TODA mudança (login, logout, etc.). Um bug
  // real aconteceu aqui: o guard usava o valor resolvido da promise (sempre o
  // da primeira resposta) pra decidir se deixava passar -- então depois de um
  // login bem-sucedido, ele continuava enxergando "sem sessão" e mandava de
  // volta pro /login.
  private resolverEstadoInicial!: () => void;
  private estadoInicial: Promise<void> = new Promise(resolve => {
    this.resolverEstadoInicial = resolve;
  });
  private primeiraResposta = true;

  constructor() {
    // Dispara sempre que o estado de login muda -- inclusive ao recarregar a
    // página, já que o Firebase guarda a sessão sozinho (não somos nós que
    // temos que lembrar "quem tava logado").
    onAuthStateChanged(auth, (usuario) => {
      this.usuarioAtual = usuario;
      if (this.primeiraResposta) {
        this.primeiraResposta = false;
        this.resolverEstadoInicial();
      }
    });
  }

  aguardarEstadoInicial(): Promise<void> {
    return this.estadoInicial;
  }

  login(email: string, senha: string): Promise<void> {
    // signInWithEmailAndPassword lança erro (rejeita a Promise) se a
    // credencial estiver errada -- quem chamar isso precisa de try/catch.
    return signInWithEmailAndPassword(auth, email, senha).then(() => {});
  }

  logout(): Promise<void> {
    return signOut(auth);
  }

  // Manda o e-mail de redefinição de senha do Firebase (o link leva pra uma
  // página do próprio Firebase onde a pessoa escolhe a senha nova).
  enviarRedefinicaoSenha(email: string): Promise<void> {
    auth.languageCode = 'pt-BR'; // idioma do e-mail e da página de redefinição
    return sendPasswordResetEmail(auth, email);
  }

  async obterToken(): Promise<string | null> {
    if (!this.usuarioAtual) return null;
    // Devolve o token JWT atual, renovando sozinho se estiver perto de
    // expirar -- é esse token que o backend vai conferir em cada chamada.
    return this.usuarioAtual.getIdToken();
  }

  async atualizarNomeExibicao(nome: string): Promise<void> {
    if (!this.usuarioAtual) throw new Error('Sem sessão.');
    await updateProfile(this.usuarioAtual, { displayName: nome });
    // updateProfile muda o objeto no SDK do Firebase, mas não dispara
    // onAuthStateChanged -- sem reatribuir, a UI (shell, aqui) não percebe
    // que o nome mudou.
    this.usuarioAtual = auth.currentUser;
  }

  // Trocar senha exige reautenticar primeiro -- o Firebase recusa
  // updatePassword direto se a sessão não for "recente o suficiente".
  async alterarSenha(senhaAtual: string, novaSenha: string): Promise<void> {
    if (!this.usuarioAtual || !this.usuarioAtual.email) throw new Error('Sem sessão.');
    const credencial = EmailAuthProvider.credential(this.usuarioAtual.email, senhaAtual);
    await reauthenticateWithCredential(this.usuarioAtual, credencial);
    await updatePassword(this.usuarioAtual, novaSenha);
  }
}
