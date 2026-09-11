import { Injectable } from '@angular/core';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  usuarioAtual: User | null = null;

  constructor() {
    // Dispara sempre que o estado de login muda -- inclusive ao recarregar a
    // página, já que o Firebase guarda a sessão sozinho (não somos nós que
    // temos que lembrar "quem tava logado").
    onAuthStateChanged(auth, (usuario) => {
      this.usuarioAtual = usuario;
    });
  }

  login(email: string, senha: string): Promise<void> {
    // signInWithEmailAndPassword lança erro (rejeita a Promise) se a
    // credencial estiver errada -- quem chamar isso precisa de try/catch.
    return signInWithEmailAndPassword(auth, email, senha).then(() => {});
  }

  logout(): Promise<void> {
    return signOut(auth);
  }

  async obterToken(): Promise<string | null> {
    if (!this.usuarioAtual) return null;
    // Devolve o token JWT atual, renovando sozinho se estiver perto de
    // expirar -- é esse token que o backend vai conferir em cada chamada.
    return this.usuarioAtual.getIdToken();
  }
}
