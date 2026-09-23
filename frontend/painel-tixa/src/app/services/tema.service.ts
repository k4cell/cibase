import { Injectable } from '@angular/core';

export type Tema = 'escuro' | 'claro';

// Cor de destaque (botões, aba ativa, links) -- só a marca/ação, nunca o
// verde de receita nem o vermelho de risco, que têm significado próprio.
// Guardado no localStorage do navegador (preferência de tela, não do negócio).
//
// "soft"/"textSoft" são o fundo/texto suaves no tema escuro; "softClaro" é o
// equivalente bem claro pro tema claro (o "border" já serve de texto escuro
// nos dois casos, por isso não precisa de um par "textSoftClaro" à parte).
export const PALETAS_COR = [
  { nome: 'Azul',     primary: '#3b82f6', hover: '#60a5fa', soft: '#1e3a5f', softClaro: '#eff6ff', border: '#1d4ed8', textSoft: '#93c5fd', ring: 'rgba(59, 130, 246, 0.35)',  onPrimary: '#fff' },
  { nome: 'Violeta',  primary: '#8b5cf6', hover: '#a78bfa', soft: '#2e1f4d', softClaro: '#f5f3ff', border: '#6d28d9', textSoft: '#c4b5fd', ring: 'rgba(139, 92, 246, 0.35)',  onPrimary: '#fff' },
  { nome: 'Amarelo',  primary: '#eab308', hover: '#facc15', soft: '#3d2e06', softClaro: '#fefce8', border: '#a16207', textSoft: '#fde68a', ring: 'rgba(234, 179, 8, 0.35)',   onPrimary: '#1c1917' },
  { nome: 'Ciano',    primary: '#06b6d4', hover: '#22d3ee', soft: '#0e3a42', softClaro: '#ecfeff', border: '#0e7490', textSoft: '#67e8f9', ring: 'rgba(6, 182, 212, 0.35)',   onPrimary: '#fff' },
  { nome: 'Magenta',  primary: '#d946ef', hover: '#e879f9', soft: '#3d1a42', softClaro: '#fdf4ff', border: '#a21caf', textSoft: '#f0abfc', ring: 'rgba(217, 70, 239, 0.35)',  onPrimary: '#fff' },
  { nome: 'Laranja',  primary: '#f97316', hover: '#fb923c', soft: '#3d2410', softClaro: '#fff7ed', border: '#c2410c', textSoft: '#fdba74', ring: 'rgba(249, 115, 22, 0.35)',  onPrimary: '#fff' },
  { nome: 'Rosa',     primary: '#ec4899', hover: '#f472b6', soft: '#3d1830', softClaro: '#fdf2f8', border: '#be185d', textSoft: '#f9a8d4', ring: 'rgba(236, 72, 153, 0.35)',  onPrimary: '#fff' },
];

// Tema claro/escuro -- troca os tokens de superfície/texto em runtime, do
// mesmo jeito que a cor de destaque. As variáveis CSS agora são globais (ver
// styles.css, seletor :root), então aplicamos direto em document.documentElement
// -- não precisa mais de um ElementRef de componente pra isso funcionar.
const TEMAS: Record<Tema, any> = {
  escuro: {
    bg: '#0f172a', surface: '#1e293b', surfaceAlt: '#263449', border: '#334155', borderStrong: '#475569',
    title: '#f1f5f9', body: '#cbd5e1', label: '#94a3b8', faint: '#64748b',
    emeraldSoft: '#064e3b', amberSoft: '#451a03', orangeSoft: '#431407', redSoft: '#450a0a',
    navbarBg: 'rgba(15, 23, 42, 0.85)',
    shadowXs: '0 1px 2px 0 rgb(0 0 0 / 0.3)',
    shadowSm: '0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4)',
    shadowMd: '0 4px 12px -2px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.4)',
    shadowLg: '0 24px 48px -16px rgb(0 0 0 / 0.65), 0 8px 16px -8px rgb(0 0 0 / 0.5)',
    dangerInk: '#f87171', dangerInkForte: '#fca5a5',
    warningInk: '#fbbf24', warningInkForte: '#fcd34d',
    orangeInk: '#fdba74',
    successInk: '#34d399', successInkForte: '#6ee7b7',
    oportunidade: {
      novoLead:         { fundo: '#0c3a5f', texto: '#93c5fd' },
      valiosoEmRisco:   { fundo: '#450a0a', texto: '#fca5a5' },
      adormecido:       { fundo: '#334155', texto: '#cbd5e1' },
      promotor:         { fundo: '#064e3b', texto: '#6ee7b7' },
      recompraProvavel: { fundo: '#451a03', texto: '#fcd34d' },
      recente:          { fundo: '#134e4a', texto: '#5eead4' },
    }
  },
  claro: {
    // Referência: paleta do Gmail -- canvas cinza-azulado perceptível por
    // trás dos cards brancos (em vez de quase-branco sobre branco, que era
    // o problema: card e fundo praticamente se confundiam).
    bg: '#eef1f6', surface: '#ffffff', surfaceAlt: '#e7ebf1', border: '#d6dce4', borderStrong: '#b6c0cc',
    title: '#0f172a', body: '#31363c', label: '#5b6472', faint: '#828b98',
    emeraldSoft: '#d1fae5', amberSoft: '#fef3c7', orangeSoft: '#ffedd5', redSoft: '#fee2e2',
    navbarBg: 'rgba(255, 255, 255, 0.92)',
    shadowXs: '0 1px 2px 0 rgb(15 23 42 / 0.06)',
    shadowSm: '0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.08)',
    shadowMd: '0 4px 12px -2px rgb(15 23 42 / 0.1), 0 2px 4px -2px rgb(15 23 42 / 0.06)',
    shadowLg: '0 20px 40px -16px rgb(15 23 42 / 0.16), 0 8px 16px -8px rgb(15 23 42 / 0.08)',
    dangerInk: '#dc2626', dangerInkForte: '#b91c1c',
    warningInk: '#b45309', warningInkForte: '#92400e',
    orangeInk: '#c2410c',
    successInk: '#059669', successInkForte: '#047857',
    oportunidade: {
      novoLead:         { fundo: '#eff6ff', texto: '#1d4ed8' },
      valiosoEmRisco:   { fundo: '#fee2e2', texto: '#991b1b' },
      adormecido:       { fundo: '#f1f5f9', texto: '#475569' },
      promotor:         { fundo: '#d1fae5', texto: '#065f46' },
      recompraProvavel: { fundo: '#fef3c7', texto: '#92400e' },
      recente:          { fundo: '#f0fdfa', texto: '#0f766e' },
    }
  }
};

@Injectable({ providedIn: 'root' })
export class TemaService {
  readonly PALETAS_COR = PALETAS_COR;

  temaAtual: Tema = 'escuro';
  corSelecionada: string = 'Azul';

  private get raiz(): CSSStyleDeclaration {
    return document.documentElement.style;
  }

  // Cores do badge de "oportunidade" (Ficha/Painel de Recuperação) do tema atual.
  get coresOportunidade() {
    return TEMAS[this.temaAtual].oportunidade;
  }

  inicializar() {
    this.carregarTemaSalvo();
    this.carregarCorSalva();
  }

  private aplicarPaleta(paleta: any) {
    const estilo = this.raiz;
    estilo.setProperty('--tx-primary', paleta.primary);
    estilo.setProperty('--tx-primary-hover', paleta.hover);
    estilo.setProperty('--tx-primary-soft', this.temaAtual === 'claro' ? paleta.softClaro : paleta.soft);
    estilo.setProperty('--tx-primary-border', paleta.border);
    estilo.setProperty('--tx-primary-text-soft', this.temaAtual === 'claro' ? paleta.border : paleta.textSoft);
    estilo.setProperty('--tx-primary-ring', paleta.ring);
    estilo.setProperty('--tx-on-primary', paleta.onPrimary);
  }

  selecionarCorDestaque(paleta: any) {
    this.corSelecionada = paleta.nome;
    this.aplicarPaleta(paleta);
    try {
      localStorage.setItem('tx-cor-destaque', paleta.nome);
    } catch {
      // Preferência não persiste (ex: navegação privada) -- sem problema, só não sobrevive ao reload.
    }
  }

  private carregarCorSalva() {
    let nomeSalvo: string | null = null;
    try {
      nomeSalvo = localStorage.getItem('tx-cor-destaque');
    } catch {
      return;
    }

    const paleta = this.PALETAS_COR.find(p => p.nome === nomeSalvo);
    if (paleta) {
      this.corSelecionada = paleta.nome;
      this.aplicarPaleta(paleta);
    }
  }

  aplicarTema(tema: Tema) {
    this.temaAtual = tema;
    const t = TEMAS[tema];
    const estilo = this.raiz;
    estilo.setProperty('--tx-bg', t.bg);
    estilo.setProperty('--tx-surface', t.surface);
    estilo.setProperty('--tx-surface-alt', t.surfaceAlt);
    estilo.setProperty('--tx-border', t.border);
    estilo.setProperty('--tx-border-strong', t.borderStrong);
    estilo.setProperty('--tx-title', t.title);
    estilo.setProperty('--tx-body', t.body);
    estilo.setProperty('--tx-label', t.label);
    estilo.setProperty('--tx-faint', t.faint);
    estilo.setProperty('--tx-emerald-soft', t.emeraldSoft);
    estilo.setProperty('--tx-amber-soft', t.amberSoft);
    estilo.setProperty('--tx-orange-soft', t.orangeSoft);
    estilo.setProperty('--tx-red-soft', t.redSoft);
    estilo.setProperty('--tx-navbar-bg', t.navbarBg);
    estilo.setProperty('--tx-shadow-xs', t.shadowXs);
    estilo.setProperty('--tx-shadow-sm', t.shadowSm);
    estilo.setProperty('--tx-shadow-md', t.shadowMd);
    estilo.setProperty('--tx-shadow-lg', t.shadowLg);
    estilo.setProperty('--tx-danger-ink', t.dangerInk);
    estilo.setProperty('--tx-danger-ink-forte', t.dangerInkForte);
    estilo.setProperty('--tx-warning-ink', t.warningInk);
    estilo.setProperty('--tx-warning-ink-forte', t.warningInkForte);
    estilo.setProperty('--tx-orange-ink', t.orangeInk);
    estilo.setProperty('--tx-success-ink', t.successInk);
    estilo.setProperty('--tx-success-ink-forte', t.successInkForte);

    // soft/textSoft da cor de destaque dependem do tema -- reaplica.
    const paleta = this.PALETAS_COR.find(p => p.nome === this.corSelecionada);
    if (paleta) this.aplicarPaleta(paleta);
  }

  alternarTema() {
    const novo: Tema = this.temaAtual === 'escuro' ? 'claro' : 'escuro';
    this.aplicarTema(novo);
    try {
      localStorage.setItem('tx-tema', novo);
    } catch {
      // Preferência não persiste (ex: navegação privada) -- sem problema, só não sobrevive ao reload.
    }
  }

  private carregarTemaSalvo() {
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem('tx-tema');
    } catch {
      salvo = null;
    }
    this.aplicarTema(salvo === 'claro' ? 'claro' : 'escuro');
  }
}
