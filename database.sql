-- Create sectors table
CREATE TABLE IF NOT EXISTS sectores (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    posicion INTEGER NOT NULL UNIQUE
);

-- Create turns table
CREATE TABLE IF NOT EXISTS turno (
    id SERIAL PRIMARY KEY,
    sector_id INTEGER REFERENCES sectores(id) ON DELETE CASCADE,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('activo', 'inactivo'))
);

-- Create history table to track changes
CREATE TABLE IF NOT EXISTS historico_turnos (
    id SERIAL PRIMARY KEY,
    turno_id INTEGER REFERENCES turno(id) ON DELETE CASCADE,
    fecha_cambio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sector_nombre TEXT NOT NULL,
    descripcion TEXT,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    tipo TEXT DEFAULT 'Automática'
);

-- Create configuration table
CREATE TABLE IF NOT EXISTS configuracion (
    id SERIAL PRIMARY KEY,
    dias INTEGER NOT NULL
);

-- Seed data for sectores
INSERT INTO sectores (nombre, posicion) VALUES 
('Sector Norte', 1),
('Sector Sur', 2),
('Sector Este', 3),
('Sector Oeste', 4)
ON CONFLICT (posicion) DO NOTHING;

INSERT INTO sectores (nombre, posicion) VALUES
('Motorizada', 1),
('Toltec Centro', 2),
('Príncipe de Paz', 3),
('Trinchantes', 4),
('La Estación', 5),
('El Zunzo', 6),
('Km 204', 7),
('Las Joyas', 8),
('Quiriguá Ábajo', 9)
ON CONFLICT (posicion) DO NOTHING;


-- Seed data for configuracion
INSERT INTO configuracion (id, dias) VALUES (1, 2)
ON CONFLICT (id) DO UPDATE SET dias = EXCLUDED.dias;

-- ==============================================================
-- QUERIES PARA BORRAR LA BASE DE DATOS Y VOLVERLA A CREAR DE CERO
-- (Ejecuta estos DROP antes de los CREATE si quieres reiniciar todo)
-- ==============================================================
/*
DROP TABLE IF EXISTS historico_turnos CASCADE;
DROP TABLE IF EXISTS turno CASCADE;
DROP TABLE IF EXISTS sectores CASCADE;
DROP TABLE IF EXISTS configuracion CASCADE;
*/

-- ==============================================================
-- ROTACIÓN AUTOMÁTICA DE TURNOS (SUPABASE CRON)
-- ==============================================================

-- 1. Habilitar la extensión pg_cron (si no está habilitada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Crear la función que hace la rotación
CREATE OR REPLACE FUNCTION rotar_turnos_automaticamente()
RETURNS void AS $$
DECLARE
    v_dias INTEGER;
    v_turno RECORD;
    v_next_sector RECORD;
    v_fecha_inicio DATE;
    v_fecha_fin DATE;
    v_hoy DATE;
BEGIN
    -- Configurar la fecha de hoy según la zona horaria local (América Central / Guatemala - UTC-6)
    v_hoy := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::DATE;

    -- Obtener la duración de los turnos en días desde configuración
    SELECT dias INTO v_dias FROM configuracion LIMIT 1;
    IF v_dias IS NULL THEN v_dias := 2; END IF;

    -- Obtener el turno activo actual
    SELECT t.id, t.sector_id, t.fecha_inicio, t.fecha_fin, t.estado, s.nombre, s.posicion
    INTO v_turno
    FROM turno t
    JOIN sectores s ON t.sector_id = s.id
    LIMIT 1;

    -- Si el turno está pausado, no hacemos rotación automática
    IF v_turno.estado = 'inactivo' THEN
        RETURN;
    END IF;

    -- Si no hay ningún turno, inicializamos con el primer sector
    IF NOT FOUND THEN 
        SELECT id, nombre, posicion INTO v_next_sector
        FROM sectores
        ORDER BY posicion ASC
        LIMIT 1;
        
        IF FOUND THEN
            v_fecha_inicio := v_hoy;
            v_fecha_fin := v_fecha_inicio + (v_dias - 1) * INTERVAL '1 day';
            
            INSERT INTO turno (sector_id, fecha_inicio, fecha_fin, estado)
            VALUES (v_next_sector.id, v_fecha_inicio, v_fecha_fin, 'activo');
        END IF;
        
        RETURN;
    END IF;

    -- Verificar si el turno ha expirado (ya que se ejecuta cada día a las 00:01)
    IF v_hoy > v_turno.fecha_fin THEN
        
        -- Buscar el siguiente sector (por posición)
        SELECT id, nombre, posicion INTO v_next_sector
        FROM sectores
        WHERE posicion > v_turno.posicion
        ORDER BY posicion ASC
        LIMIT 1;

        -- Si no hay siguiente, es el último, volvemos al primero (rotación circular)
        IF NOT FOUND THEN
            SELECT id, nombre, posicion INTO v_next_sector
            FROM sectores
            ORDER BY posicion ASC
            LIMIT 1;
        END IF;

        -- Calcular las fechas exactas del nuevo turno
        v_fecha_inicio := (v_turno.fecha_fin + INTERVAL '1 day')::DATE;
        v_fecha_fin := (v_fecha_inicio + (v_dias - 1) * INTERVAL '1 day')::DATE;

        -- Guardar el turno que acaba de expirar en el histórico
        INSERT INTO historico_turnos (turno_id, sector_nombre, descripcion, fecha_inicio, fecha_fin, tipo)
        VALUES (v_turno.id, v_turno.nombre, 'Rotación automática', v_turno.fecha_inicio, v_turno.fecha_fin, 'Automática');

        -- Actualizar el turno actual con los datos del nuevo sector
        UPDATE turno 
        SET sector_id = v_next_sector.id,
            fecha_inicio = v_fecha_inicio,
            fecha_fin = v_fecha_fin,
            estado = 'activo'
        WHERE id = v_turno.id;

    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Programar el Cron Job para ejecutarse todos los días de forma automática a las 00:01
SELECT cron.schedule(
  'rotacion_diaria_turnos',  
  '1 0 * * *',               
  $$SELECT rotar_turnos_automaticamente();$$
);

SELECT rotar_turnos_automaticamente();

-- ==============================================================
-- QUERIES PARA ELIMINAR LA ROTACIÓN AUTOMÁTICA
-- (Ejecuta esto si necesitas detener el cron o borrar la función)
-- ==============================================================
/*
-- Para detener el cron job:
SELECT cron.unschedule('rotacion_diaria_turnos');

-- Para eliminar la función de la base de datos:
DROP FUNCTION IF EXISTS rotar_turnos_automaticamente();
*/
