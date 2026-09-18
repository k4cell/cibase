import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { API_BASE_URL } from './api.config';

// Roda antes de toda chamada HTTP feita pelo Angular. Se for pro nosso
// backend, busca o token atual do Firebase e anexa no cabeçalho Authorization
// -- é isso que o FastAPI vai conferir do outro lado.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE_URL)) {
    return next(req);
  }

  const authService = inject(AuthService);

  return from(authService.obterToken()).pipe(
    switchMap((token) => {
      if (!token) return next(req);

      // HttpRequest é imutável -- clone() cria uma cópia com o header a mais.
      const requisicaoComToken = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
      return next(requisicaoComToken);
    })
  );
};
