import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ClientesService } from '../../services/clientes.service';
import { ServicosService } from '../../services/servicos.service';
import { EstatisticasService } from '../../services/estatisticas.service';
import { MotorService } from '../../services/motor.service';
import { RefrescoService } from '../../services/refresco.service';
import { formatarValor } from '../../utils/formatacao';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './inicio.html'
})
export class InicioComponent implements OnInit, OnDestroy {
  readonly formatarValor = formatarValor;

  private desregistrar!: () => void;

  constructor(
    public clientesService: ClientesService,
    public servicosService: ServicosService,
    public estatisticasService: EstatisticasService,
    public motorService: MotorService,
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
