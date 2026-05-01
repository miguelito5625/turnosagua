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
}

export interface Historico {
  id: number;
  turno_id: number;
  fecha_cambio: string;
  sector_nombre: string;
  descripcion: string;
  fecha_inicio: string;
  fecha_fin: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
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
  async checkAndRotateTurn(): Promise<void> {
    try {
      console.log('checkAndRotateTurn: Starting operation...');
      console.log('checkAndRotateTurn: Fetching config...');
      const { data: config, error: configError } = await this.supabase
        .from('configuracion')
        .select('dias')
        .single();

      if (configError || !config) {
        console.error('checkAndRotateTurn: Error or no config', configError);
        return;
      }
      console.log('checkAndRotateTurn: Config loaded:', config);

      const actualDias = config.dias;

      const { data: lastTurnArray, error: turnError } = await this.supabase
        .from('turnos')
        .select('*, sectores(nombre, posicion)')
        .order('fecha_inicio', { ascending: false })
        .limit(1);

      if (turnError) {
        console.error('checkAndRotateTurn: Error fetching last turn', turnError);
        return;
      }
      console.log('checkAndRotateTurn: Last turn fetched:', lastTurnArray);

      if (!lastTurnArray || lastTurnArray.length === 0) {
        await this.initializeFirstTurn(actualDias);
        return;
      }

      const lastTurn = lastTurnArray[0];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const fechaFin = new Date(lastTurn.fecha_fin);
      fechaFin.setHours(0, 0, 0, 0);

      if (today > fechaFin) {
        // Turn expired!
        await this.supabase
          .from('turnos')
          .update({ estado: 'inactivo' })
          .eq('id', lastTurn.id);

        const currentSectorPos = lastTurn.sectores?.posicion || 0;

        const { data: nextSector, error: sectorError } = await this.supabase
          .from('sectores')
          .select('id, nombre, posicion')
          .gt('posicion', currentSectorPos)
          .order('posicion', { ascending: true })
          .limit(1)
          .single();

        if (sectorError || !nextSector) {
          console.log('checkAndRotateTurn: No next sector found, looking for first sector...');
        	const { data: firstSector } = await this.supabase
              .from('sectores')
              .select('id, nombre, posicion')
              .order('posicion', { ascending: true })
              .limit(1)
              .single();

          if (firstSector) {
            console.log('checkAndRotateTurn: Found first sector:', firstSector);
            await this.createNextTurn(firstSector.id, actualDias);
          }
        } else {
          await this.createNextTurn(nextSector.id, actualDias);
        }
      }
    } catch (error) {
      console.error('Error in checkAndRotateTurn:', error);
    }
    console.log('checkAndRotateTurn: Operation finished.');
  }

  async initializeFirstTurn(dias: number): Promise<void> {
    console.log('initializeFirstTurn: Starting...');
    const { data: firstSector } = await this.supabase
      .from('sectores')
      .select('id, nombre, posicion')
      .order('posicion', { ascending: true })
      .limit(1)
      .single();

    if (firstSector) {
      console.log('initializeFirstTurn: First sector found:', firstSector);
      await this.createNextTurn(firstSector.id, dias);
    }
    console.log('initializeFirstTurn: Finished.');
  }

  async createNextTurn(sectorId: number, dias: number, justificacion: string = 'Cambio de turno automático'): Promise<void> {
    console.log(`createNextTurn: Starting for sector ${sectorId}...`);
    const fechaInicio = new Date();
    fechaInicio.setHours(0, 0, 0, 0);

    const fechaFin = new Date(fechaInicio);
    // Si dura 2 días, la fecha fin es el mismo día + 1 (ej: 30 y 01).
    fechaFin.setDate(fechaInicio.getDate() + dias - 1);

    const { data: newTurn, error: insertError } = await this.supabase
      .from('turnos')
      .insert({
        sector_id: sectorId,
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0],
        estado: 'activo'
      })
      .select('id')
      .single();

    if (insertError || !newTurn) {
      console.error('Error inserting turn:', insertError);
      return;
    }
    console.log('createNextTurn: New turn created:', newTurn);

    const { data: sector } = await this.supabase
      .from('sectores')
      .select('nombre')
      .eq('id', sectorId)
      .single();

    if (sector) {
      await this.supabase.from('historico_turnos').insert({
        turno_id: newTurn.id,
        sector_nombre: sector.nombre,
        descripcion: justificacion,
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0]
      });
      console.log('createNextTurn: Historical record added.');
    }
    console.log('createNextTurn: Operation finished.');
  }

  async rotateTurnManually(justificacion: string): Promise<boolean> {
    const lastTurn = await this.getCurrentTurn();
    if (!lastTurn) return false;

    // Inactivar turno actual
    await this.supabase.from('turnos').update({ estado: 'inactivo' }).eq('id', lastTurn.id);

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
      await this.createNextTurn(nextSector.id, actualDias, justificacion);
      return true;
    }
    return false;
  }

  async getHistorico(): Promise<Historico[]> {
    const { data, error } = await this.supabase
      .from('historico_turnos')
      .select('*')
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
      .from('turnos')
      .select('*, sectores(nombre, posicion)')
      .eq('estado', 'activo')
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
