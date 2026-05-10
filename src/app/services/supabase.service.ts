import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface Sector {
  id: number;
  nombre: string;
  posicion: number;
  estimado_inicio?: Date;
  estimado_fin?: Date;
}

export interface Turno {
  id: number;
  sector_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  sectores?: { nombre: string; posicion: number };
  justificacion_pausa?: string;
}

export interface Historico {
  id: number;
  turno_id: number;
  fecha_cambio: string;
  sector_nombre: string;
  descripcion: string;
  fecha_inicio: string;
  fecha_fin: string;
  tipo: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // ==== AUTH ====
  async login(email: string, password: string) {
    return await this.supabase.auth.signInWithPassword({ email, password });
  }

  async logout() {
    return await this.supabase.auth.signOut();
  }

  async getCurrentUser() {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.user || null;
  }

  // ==== CONFIGURACIÓN ====
  async getConfigDias(): Promise<number> {
    const { data, error } = await this.supabase
      .from('configuracion')
      .select('dias')
      .single();
    if (error || !data) return 2;
    return data.dias;
  }

  async updateConfigDias(dias: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('configuracion')
      .update({ dias })
      .eq('id', 1);
    
    if (error) {
      console.error('Error updating config dias:', error);
      return false;
    }
    return true;
  }

  // ==== SECTORES CRUD ====
  async getSectores(): Promise<Sector[]> {
    const { data, error } = await this.supabase
      .from('sectores')
      .select('id, nombre, posicion')
      .order('posicion', { ascending: true });
    
    if (error) {
      console.error('Error fetching sectores:', error);
      return [];
    }
    return data as Sector[];
  }

  async addSector(nombre: string, posicion: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('sectores')
      .insert({ nombre, posicion });
    
    if (error) {
      console.error('Error adding sector:', error);
      return false;
    }
    return true;
  }

  async updateSector(id: number, nombre: string, posicion: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('sectores')
      .update({ nombre, posicion })
      .eq('id', id);
    
    if (error) {
      console.error('Error updating sector:', error);
      return false;
    }
    return true;
  }

  async deleteSector(id: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('sectores')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting sector:', error);
      return false;
    }
    return true;
  }

  // ==== TURNOS ====

  async createNextTurn(currentTurn: Turno | null, sectorId: number, dias: number, justificacion: string = 'Rotación automática', tipo: string = 'Automática', rotationDate: Date = new Date()): Promise<void> {
    console.log(`createNextTurn: Starting for sector ${sectorId}...`);
    rotationDate.setHours(0, 0, 0, 0);

    const fechaInicio = new Date(rotationDate);
    const fechaFin = new Date(fechaInicio);
    fechaFin.setDate(fechaInicio.getDate() + dias - 1);

    // Save exiting turn to history
    if (currentTurn && currentTurn.sectores) {
      await this.supabase.from('historico_turnos').insert({
        turno_id: currentTurn.id,
        sector_nombre: currentTurn.sectores.nombre,
        descripcion: justificacion,
        fecha_inicio: currentTurn.fecha_inicio,
        fecha_fin: rotationDate.toISOString().split('T')[0],
        tipo: tipo
      });
      console.log('createNextTurn: Historical record added for exiting turn.');
    }

    if (currentTurn) {
      // Update the existing single turn record
      const { error: updateError } = await this.supabase
        .from('turno')
        .update({
          sector_id: sectorId,
          fecha_inicio: fechaInicio.toISOString().split('T')[0],
          fecha_fin: fechaFin.toISOString().split('T')[0],
          estado: 'activo'
        })
        .eq('id', currentTurn.id);

      if (updateError) {
        console.error('Error updating turn:', updateError);
        return;
      }
      console.log('createNextTurn: Turn updated.');
    } else {
      // Create initial turn record
      const { error: insertError } = await this.supabase
        .from('turno')
        .insert({
          sector_id: sectorId,
          fecha_inicio: fechaInicio.toISOString().split('T')[0],
          fecha_fin: fechaFin.toISOString().split('T')[0],
          estado: 'activo'
        });

      if (insertError) {
        console.error('Error inserting initial turn:', insertError);
        return;
      }
      console.log('createNextTurn: Initial turn created.');
    }
  }

  async rotateTurnManually(justificacion: string): Promise<boolean> {
    const lastTurn = await this.getCurrentTurn();
    if (!lastTurn) return false;

    const actualDias = await this.getConfigDias();
    const currentSectorPos = lastTurn.sectores?.posicion || 0;

    let { data: nextSector } = await this.supabase
      .from('sectores')
      .select('id, nombre, posicion')
      .gt('posicion', currentSectorPos)
      .order('posicion', { ascending: true })
      .limit(1)
      .single();

    if (!nextSector) {
      const { data: firstSector } = await this.supabase
        .from('sectores')
        .select('id, nombre, posicion')
        .order('posicion', { ascending: true })
        .limit(1)
        .single();
      nextSector = firstSector;
    }

    if (nextSector) {
      const today = new Date();
      await this.createNextTurn(lastTurn, nextSector.id, actualDias, justificacion, 'Manual', today);
      return true;
    }
    return false;
  }

  async pausarTurno(justificacion: string): Promise<boolean> {
    const currentTurn = await this.getCurrentTurn();
    if (!currentTurn) return false;

    // Guardar en el histórico
    const { error: histError } = await this.supabase.from('historico_turnos').insert({
      turno_id: currentTurn.id,
      sector_nombre: currentTurn.sectores?.nombre || '',
      descripcion: justificacion,
      fecha_inicio: currentTurn.fecha_inicio,
      fecha_fin: currentTurn.fecha_fin,
      tipo: 'Pausa'
    });

    if (histError) {
      console.error('Error insertando histórico de pausa:', histError);
      return false;
    }

    // Actualizar estado a 'inactivo'
    const { error: updateError } = await this.supabase
      .from('turno')
      .update({ estado: 'inactivo' })
      .eq('id', currentTurn.id);

    if (updateError) {
      console.error('Error pausando turno:', updateError);
      return false;
    }

    return true;
  }

  async reanudarTurno(justificacion: string): Promise<boolean> {
    const currentTurn = await this.getCurrentTurn();
    if (!currentTurn) return false;

    const actualDias = await this.getConfigDias();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newFechaFin = new Date(today);
    newFechaFin.setDate(newFechaFin.getDate() + actualDias - 1);

    const newFechaFinStr = newFechaFin.toISOString().split('T')[0];

    // Guardar en el histórico
    const { error: histError } = await this.supabase.from('historico_turnos').insert({
      turno_id: currentTurn.id,
      sector_nombre: currentTurn.sectores?.nombre || '',
      descripcion: justificacion,
      fecha_inicio: currentTurn.fecha_inicio,
      fecha_fin: newFechaFinStr,
      tipo: 'Reanudación'
    });

    if (histError) {
      console.error('Error insertando histórico de reanudación:', histError);
      return false;
    }

    // Actualizar turno a 'activo' y nueva fecha fin
    const { error: updateError } = await this.supabase
      .from('turno')
      .update({ 
        estado: 'activo',
        fecha_fin: newFechaFinStr
      })
      .eq('id', currentTurn.id);

    if (updateError) {
      console.error('Error reanudando turno:', updateError);
      return false;
    }

    return true;
  }

  async getUltimaJustificacionPausa(turnoId: number): Promise<string> {
    const { data, error } = await this.supabase
      .from('historico_turnos')
      .select('descripcion')
      .eq('turno_id', turnoId)
      .eq('tipo', 'Pausa')
      .order('fecha_cambio', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return '';
    }
    return data.descripcion;
  }

  async getHistorico(startDate: Date, endDate: Date): Promise<Historico[]> {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const { data, error } = await this.supabase
      .from('historico_turnos')
      .select('*')
      .gte('fecha_cambio', startDate.toISOString())
      .lte('fecha_cambio', end.toISOString())
      .order('fecha_cambio', { ascending: false });
      
    if (error) {
      console.error('Error fetching historico:', error);
      return [];
    }
    return data as Historico[];
  }

  async getCurrentTurn(): Promise<Turno | null> {
    console.log('getCurrentTurn: Fetching...');
    const { data, error } = await this.supabase
      .from('turno')
      .select('*, sectores(nombre, posicion)')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching current turn:', error);
      return null;
    }
    console.log('getCurrentTurn: Result:', data);
    return data as Turno;
  }

  async getUpcomingQueue(): Promise<Sector[]> {
    console.log('getUpcomingQueue: Starting...');
    const currentTurn = await this.getCurrentTurn();
    
    // Obtener todos los sectores ordenados por posición
    const { data, error } = await this.supabase
      .from('sectores')
      .select('id, nombre, posicion')
      .order('posicion', { ascending: true });

    if (error || !data) {
      console.error('Error fetching upcoming queue:', error);
      return [];
    }

    const todosSectores = data as Sector[];

    if (!currentTurn || !currentTurn.sectores) {
      // Si no hay turno actual, la cola son todos los sectores
      console.log('getUpcomingQueue: Result:', todosSectores);
      return todosSectores;
    }

    const posicionActual = currentTurn.sectores.posicion;

    // Sectores que tienen una posición mayor a la actual (van primero en la cola)
    const siguientes = todosSectores.filter(s => s.posicion > posicionActual);
    
    // Sectores que tienen una posición menor a la actual (van al final de la cola)
    const anteriores = todosSectores.filter(s => s.posicion < posicionActual);

    // Concatenamos: primero los siguientes, luego los anteriores para hacer la cola circular
    // El sector actual se excluye de esta lista porque ya está en la sección de "Sector Actual"
    const colaCircular = [...siguientes, ...anteriores];

    console.log('getUpcomingQueue: Result:', colaCircular);
    return colaCircular;
  }
}
