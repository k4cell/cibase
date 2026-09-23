import { Directive, ElementRef, OnDestroy, OnInit } from '@angular/core';

// Arrastar com o MOUSE pra rolar na horizontal -- sem isso, numa tabela alta
// (todas as linhas renderizadas, sem paginação) a barra de rolagem só fica
// acessível lá embaixo, depois do último cliente; e em qualquer faixa de
// abas/pills que não caiba na largura da tela (navbar, sub-abas, filtros),
// não tinha jeito nenhum de ver o resto com o mouse. Toque no celular já
// rola sozinho nativamente; isto aqui é só pra completar a experiência com mouse.
@Directive({
  selector: '.tx-table-scroll, .tx-tabs, .tx-filter-group, .tx-subnav',
  standalone: true
})
export class ArrastarRolarDirective implements OnInit, OnDestroy {
  private arrastando = false;
  private inicioX = 0;
  private inicioScrollLeft = 0;
  private distanciaArrastada = 0;

  private aoMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;

    // Campos de formulário continuam intocados (selecionar texto, digitar) --
    // mas botões/abas/pills PODEM iniciar um arrasto: a maioria dessas faixas
    // (navbar, sub-abas, filtros) é só botão colado em botão, sem espaço
    // "vazio" nenhum pra segurar. O que decide se virou clique ou arrasto é
    // a distância percorrida (ver aoClicarCaptura), não onde o mouse desceu.
    const alvo = event.target as HTMLElement;
    if (alvo.closest('input, select, textarea')) return;

    this.arrastando = true;
    this.distanciaArrastada = 0;
    this.inicioX = event.pageX;
    this.inicioScrollLeft = this.el.nativeElement.scrollLeft;
  };

  private aoMouseMove = (event: MouseEvent) => {
    if (!this.arrastando) return;
    const delta = event.pageX - this.inicioX;
    this.distanciaArrastada = Math.max(this.distanciaArrastada, Math.abs(delta));
    if (this.distanciaArrastada > 3) {
      this.el.nativeElement.classList.add('tx-arrastando');
    }
    this.el.nativeElement.scrollLeft = this.inicioScrollLeft - delta;
  };

  private aoMouseUp = () => {
    this.arrastando = false;
    this.el.nativeElement.classList.remove('tx-arrastando');
  };

  // Depois de um arrasto de verdade, o "click" sintético que o navegador
  // dispara em seguida não pode abrir a Ficha da linha -- por isso intercepta
  // na fase de CAPTURA (antes do (click) da própria linha rodar).
  private aoClicarCaptura = (event: MouseEvent) => {
    if (this.distanciaArrastada > 3) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit() {
    const elemento = this.el.nativeElement;
    elemento.addEventListener('mousedown', this.aoMouseDown);
    document.addEventListener('mousemove', this.aoMouseMove);
    document.addEventListener('mouseup', this.aoMouseUp);
    elemento.addEventListener('click', this.aoClicarCaptura, true);
  }

  ngOnDestroy() {
    const elemento = this.el.nativeElement;
    elemento.removeEventListener('mousedown', this.aoMouseDown);
    document.removeEventListener('mousemove', this.aoMouseMove);
    document.removeEventListener('mouseup', this.aoMouseUp);
    elemento.removeEventListener('click', this.aoClicarCaptura, true);
  }
}
