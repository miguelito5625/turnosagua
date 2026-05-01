import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService, Turno, Sector } from '../services/supabase.service';

// Angular Material Imports
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatListModule,
    MatDialogModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatDividerModule
  ],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home implements OnInit, OnDestroy {
  currentTurn: Turno | null = null;
  queue: Sector[] = [];
  loading = true;
  private refreshIntervalId: any;
  isDarkMode = false;

  // Login
  showLoginModal = false;
  loginEmail = '';
  loginPassword = '';
  loginError = '';

  constructor(
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

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
    // Check if already logged in
    const user = await this.supabaseService.getCurrentUser();
    if (user) {
      this.router.navigate(['/admin']);
      return;
    }

    await this.loadData(true);

    this.refreshIntervalId = setInterval(() => {
      this.loadData(false);
    }, 3600000);
  }

  ngOnDestroy() {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
    }
  }

  async loadData(showLoading = true) {
    if (showLoading) this.loading = true;

    try {
      await this.supabaseService.checkAndRotateTurn();
      const [turn, upcoming, dias] = await Promise.all([
        this.supabaseService.getCurrentTurn(),
        this.supabaseService.getUpcomingQueue(),
        this.supabaseService.getConfigDias()
      ]);

      if (turn && upcoming.length > 0) {
        let currentStartDate = new Date(turn.fecha_fin + 'T00:00:00');
        currentStartDate.setDate(currentStartDate.getDate() + 1);

        upcoming.forEach(sector => {
          const inicio = new Date(currentStartDate);
          const fin = new Date(inicio);
          fin.setDate(fin.getDate() + dias - 1);
          sector.estimado_inicio = inicio;
          sector.estimado_fin = fin;
          currentStartDate = new Date(fin);
          currentStartDate.setDate(currentStartDate.getDate() + 1);
        });
      }

      this.currentTurn = turn;
      this.queue = upcoming;
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      if (showLoading) this.loading = false;
      this.cdr.detectChanges();
    }
  }

  openLoginModal() {
    this.loginEmail = '';
    this.loginPassword = '';
    this.loginError = '';
    this.showLoginModal = true;
  }

  closeLoginModal() {
    this.showLoginModal = false;
  }

  async login() {
    if (!this.loginEmail || !this.loginPassword) {
      this.loginError = 'Por favor, ingrese correo y contraseña.';
      return;
    }
    
    this.loading = true;
    this.loginError = '';
    const { data, error } = await this.supabaseService.login(this.loginEmail, this.loginPassword);
    
    if (error) {
      this.loginError = 'Credenciales inválidas. Intente nuevamente.';
      this.loading = false;
      this.cdr.detectChanges();
    } else {
      this.showLoginModal = false;
      this.loading = false;
      this.router.navigate(['/admin']);
    }
  }
}
