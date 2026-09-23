import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfiguracoesService } from '../../services/configuracoes.service';
import { RefrescoService } from '../../services/refresco.service';

@Component({
  selector: 'app-configuracoes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracoes.html'
})
export class ConfiguracoesComponent implements OnInit, OnDestroy {
  salvandoConfiguracoes: boolean = false;

  private desregistrar!: () => void;

  constructor(
    public configuracoesService: ConfiguracoesService,
    private cdr: ChangeDetectorRef,
    private refresco: RefrescoService
  ) {}

  ngOnInit() {
    this.desregistrar = this.refresco.registrar(() => this.cdr.detectChanges());
  }

  ngOnDestroy() {
    this.desregistrar();
  }

  salvarConfiguracoes() {
    this.salvandoConfiguracoes = true;
    this.configuracoesService.salvarConfiguracoes(
      this.configuracoesService.diasAtencao,
      this.configuracoesService.diasRisco,
      () => { this.salvandoConfiguracoes = false; }
    );
  }
}
