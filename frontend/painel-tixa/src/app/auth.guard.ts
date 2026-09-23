import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Espera o Firebase confirmar se existe sessão antes de decidir -- sem isso,
// um F5 numa aba protegida chutaria todo mundo pro /login mesmo com sessão
// válida, só porque o Firebase ainda não tinha respondido a tempo.
//
// A decisão em si usa `usuarioAtual` (o estado ATUAL, sempre atualizado) --
// não o valor resolvido da promise, que congela na primeira resposta do
// Firebase. Usar o valor da promise foi um bug real: depois de logar com
// sucesso, o guard continuava vendo o "sem sessão" de antes do login e
// mandava de volta pro /login mesmo com o login certo.
export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.aguardarEstadoInicial();
  if (authService.usuarioAtual) return true;

  return router.parseUrl('/login');
};
