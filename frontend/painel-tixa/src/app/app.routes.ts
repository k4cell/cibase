import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login').then(m => m.LoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./shell/shell').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: 'inicio', loadComponent: () => import('./paginas/inicio/inicio').then(m => m.InicioComponent) },
      { path: 'hoje', loadComponent: () => import('./paginas/hoje/hoje').then(m => m.HojeComponent) },
      { path: 'recuperacao', loadComponent: () => import('./paginas/painel-recuperacao/painel-recuperacao').then(m => m.PainelRecuperacaoComponent) },
      { path: 'receita', loadComponent: () => import('./paginas/painel-receita/painel-receita').then(m => m.PainelReceitaComponent) },
      { path: 'clientes', loadComponent: () => import('./paginas/clientes/clientes').then(m => m.ClientesComponent) },
      { path: 'arquivados', loadComponent: () => import('./paginas/arquivados/arquivados').then(m => m.ArquivadosComponent) },
      { path: 'servicos', loadComponent: () => import('./paginas/servicos/servicos').then(m => m.ServicosComponent) },
      { path: 'configuracoes', loadComponent: () => import('./paginas/configuracoes/configuracoes').then(m => m.ConfiguracoesComponent) },
      { path: '', redirectTo: 'inicio', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '' }
];
