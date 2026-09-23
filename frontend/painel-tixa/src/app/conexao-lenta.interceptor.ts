import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { API_BASE_URL } from './api.config';
import { ConexaoService } from './services/conexao.service';

// Passados alguns segundos sem resposta, avisa que o servidor pode estar
// "acordando" -- em vez de deixar a tela parecendo travada (ver
// services/conexao.service.ts pro porquê disso existir).
const TEMPO_ATE_AVISAR_MS = 3000;

export const conexaoLentaInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE_URL)) {
    return next(req);
  }

  const conexao = inject(ConexaoService);
  let avisou = false;

  const timeoutId = setTimeout(() => {
    avisou = true;
    conexao.marcarLento();
  }, TEMPO_ATE_AVISAR_MS);

  return next(req).pipe(
    finalize(() => {
      clearTimeout(timeoutId);
      if (avisou) conexao.desmarcarLento();
    })
  );
};
