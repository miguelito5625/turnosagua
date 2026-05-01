import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService, Turno, Sector, Historico } from '../services/supabase.service';

// Angular Material Imports
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatListModule,
    MatTableModule,
    MatDialogModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.css'
})
export class Admin implements OnInit, OnDestroy {
  currentTurn: Turno | null = null;
  queue: Sector[] = [];
  loading = true;
  private refreshIntervalId: any;

  // ==== NAVEGACIÓN Y MODAL ====
  currentView: 'dashboard' | 'sectores' | 'historico' = 'dashboard';
  showConfigModal = false;
  configDias = 2;

  // ==== MODAL ROTACIÓN MANUAL ====
  showRotateModal = false;
  rotacionJustificacion = '';

  // ==== HISTORIAL ====
  historicoList: Historico[] = [];
  historicoStartDate: Date = new Date();
  historicoEndDate: Date = new Date();

  // ==== CRUD SECTORES ====
  sectoresList: Sector[] = [];
  newSectorNombre = '';
  newSectorPosicion: number | null = null;
  editingSector: Sector | null = null;

  // ==== TEMA (CLARO/OSCURO) ====
  isDarkMode = false;

  constructor(
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.historicoStartDate.setMonth(this.historicoStartDate.getMonth() - 1);
  }

  async logout() {
    await this.supabaseService.logout();
    this.router.navigate(['/']);
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    if (isPlatformBrowser(this.platformId)) {
      if (this.isDarkMode) {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
    }
  }

  async ngOnInit() {
    // Carga inicial mostrando la animación
    await this.loadData(true);

    // Consultar la base de datos periódicamente (actualmente cada 1 minuto = 60000 ms)
    // -> NOTA: Para cambiarlo a una hora, debes cambiar el número 60000 por 3600000
    this.refreshIntervalId = setInterval(() => {
      this.loadData(false); // Carga silenciosa, sin mostrar la animación
    }, 3600000);
  }

  ngOnDestroy() {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
    }
  }

  async loadData(showLoading = true) {
    if (showLoading) {
      this.loading = true;
    }

    try {
      // Check and rotate turn first to ensure we have the most up-to-date data
      await this.supabaseService.checkAndRotateTurn();

      // Fetch current turn and queue
      const [turn, upcoming, dias] = await Promise.all([
        this.supabaseService.getCurrentTurn(),
        this.supabaseService.getUpcomingQueue(),
        this.supabaseService.getConfigDias()
      ]);

      // Calculate estimated dates for the upcoming queue
      if (turn && upcoming.length > 0) {
        // Parsear usando T00:00:00 para evitar errores de zona horaria que restan 1 día
        let currentStartDate = new Date(turn.fecha_fin + 'T00:00:00');
        // El siguiente turno inicia al día siguiente
        currentStartDate.setDate(currentStartDate.getDate() + 1);

        upcoming.forEach(sector => {
          const inicio = new Date(currentStartDate);
          const fin = new Date(inicio);
          fin.setDate(fin.getDate() + dias - 1);

          sector.estimado_inicio = inicio;
          sector.estimado_fin = fin;

          // El siguiente turno inicia al día siguiente de finalizar este
          currentStartDate = new Date(fin);
          currentStartDate.setDate(currentStartDate.getDate() + 1);
        });
      }

      this.currentTurn = turn;
      this.queue = upcoming;
      this.configDias = dias;
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      if (showLoading) {
        this.loading = false;
      }
      this.cdr.detectChanges();
    }
  }

  // ==== NAVEGACIÓN ====
  changeView(view: 'dashboard' | 'sectores' | 'historico') {
    this.currentView = view;
    if (view === 'sectores') {
      this.loadSectores();
    } else if (view === 'historico') {
      this.loadHistorico();
    }
  }

  // ==== HISTORIAL ====
  async loadHistorico() {
    this.loading = true;
    this.historicoList = await this.supabaseService.getHistorico(this.historicoStartDate, this.historicoEndDate);
    this.loading = false;
    this.cdr.detectChanges();
  }

  onDateChange() {
    if (this.historicoStartDate && this.historicoEndDate) {
      this.loadHistorico();
    }
  }

  exportToCSV() {
    if (this.historicoList.length === 0) return;

    const headers = ['Fecha/Hora', 'Sector', 'Fecha Inicio', 'Fecha Fin', 'Tipo', 'Justificación'];
    
    const csvRows = [];
    csvRows.push(headers.join(','));

    this.historicoList.forEach(item => {
      const fechaCambio = new Date(item.fecha_cambio).toLocaleString();
      const descripcion = item.descripcion ? `"${item.descripcion.replace(/"/g, '""')}"` : '';
      
      const row = [
        `"${fechaCambio}"`,
        `"${item.sector_nombre}"`,
        item.fecha_inicio,
        item.fecha_fin,
        item.tipo,
        descripcion
      ];
      csvRows.push(row.join(','));
    });

    // Añadir BOM para que Excel detecte correctamente el UTF-8
    const csvContent = "\uFEFF" + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `historico_turnos_${this.historicoStartDate.toISOString().split('T')[0]}_al_${this.historicoEndDate.toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ==== ROTACIÓN MANUAL ====
  openRotateModal() {
    this.rotacionJustificacion = '';
    this.showRotateModal = true;
  }

  closeRotateModal() {
    this.showRotateModal = false;
  }

  async confirmarRotacion() {
    if (!this.rotacionJustificacion) {
      alert('La justificación es requerida para realizar la rotación.');
      return;
    }
    this.loading = true;
    const success = await this.supabaseService.rotateTurnManually(this.rotacionJustificacion);
    if (success) {
      this.showRotateModal = false;
      await this.loadData(false); // Recargar
    } else {
      alert('Error al intentar rotar el turno. Intenta nuevamente.');
    }
    this.loading = false;
    this.cdr.detectChanges();
  }

  // ==== MODAL CONFIGURACIÓN ====
  openConfigModal() {
    this.showConfigModal = true;
  }

  closeConfigModal() {
    this.showConfigModal = false;
  }

  async saveConfig() {
    if (this.configDias > 0) {
      this.loading = true;
      const success = await this.supabaseService.updateConfigDias(this.configDias);
      if (success) {
        this.showConfigModal = false;
        await this.loadData(false); // Recalcular fechas
      } else {
        alert('Error al guardar la configuración');
      }
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ==== CRUD SECTORES ====
  async loadSectores() {
    this.loading = true;
    this.sectoresList = await this.supabaseService.getSectores();
    this.loading = false;
    this.cdr.detectChanges();
  }

  async addSector() {
    if (!this.newSectorNombre || !this.newSectorPosicion) return;
    this.loading = true;
    const success = await this.supabaseService.addSector(this.newSectorNombre, this.newSectorPosicion);
    if (success) {
      this.newSectorNombre = '';
      this.newSectorPosicion = null;
      await this.loadSectores();
      await this.loadData(false); // Refrescar el dashboard por detrás
    } else {
      alert('Error al agregar el sector. Verifica que la posición no esté repetida.');
    }
    this.loading = false;
    this.cdr.detectChanges();
  }

  editSector(sector: Sector) {
    this.editingSector = { ...sector }; // Copia para no mutar directamente hasta guardar
  }

  cancelEdit() {
    this.editingSector = null;
  }

  async saveEditSector() {
    if (!this.editingSector) return;
    this.loading = true;
    const success = await this.supabaseService.updateSector(
      this.editingSector.id,
      this.editingSector.nombre,
      this.editingSector.posicion
    );
    if (success) {
      this.editingSector = null;
      await this.loadSectores();
      await this.loadData(false);
    } else {
      alert('Error al actualizar el sector.');
    }
    this.loading = false;
    this.cdr.detectChanges();
  }

  async deleteSector(id: number) {
    if (confirm('¿Estás seguro de que quieres eliminar este sector? También se eliminará su historial.')) {
      this.loading = true;
      const success = await this.supabaseService.deleteSector(id);
      if (success) {
        await this.loadSectores();
        await this.loadData(false);
      } else {
        alert('Error al eliminar el sector.');
      }
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}
