import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ClientesService } from '../../services/clientes.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor } from '../../utils/formatacao';

@Component({
  selector: 'app-arquivados',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './arquivados.html'
})
export class ArquivadosComponent implements OnInit, OnDestroy {
  readonly formatarValor = formatarValor;

  private desregistrar!: () => void;

  constructor(
    public clientesService: ClientesService,
    private cdr: ChangeDetectorRef,
    private refresco: RefrescoService
  ) {}

  ngOnInit() {
    this.desregistrar = this.refresco.registrar(() => this.cdr.detectChanges());
  }

  ngOnDestroy() {
    this.desregistrar();
  }
}
