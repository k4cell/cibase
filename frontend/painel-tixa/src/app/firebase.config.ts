import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Config pública do projeto "tixa" no Firebase (não é segredo -- só identifica
// o projeto). A segurança de verdade vem das regras do Firebase e da checagem
// do token no backend, não de esconder isso.
const firebaseConfig = {
  apiKey: 'AIzaSyAm4pNM6Chk7cl4fgRHPEOypHCbEUVQ7x8',
  authDomain: 'projeto-tixa.firebaseapp.com',
  projectId: 'projeto-tixa',
  storageBucket: 'projeto-tixa.firebasestorage.app',
  messagingSenderId: '128138038270',
  appId: '1:128138038270:web:e18589dc062b649ecb0eaf',
};

const firebaseApp = initializeApp(firebaseConfig);

// "auth" é o objeto que sabe fazer login/logout e guardar quem está logado.
// Vamos importar isso no AuthService, nunca direto nos componentes.
export const auth = getAuth(firebaseApp);
