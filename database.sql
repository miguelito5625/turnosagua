-- Create sectors table
CREATE TABLE IF NOT EXISTS sectores (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    posicion INTEGER NOT NULL UNIQUE
);

-- Create turns table
CREATE TABLE IF NOT EXISTS turnos (
    id SERIAL PRIMARY KEY,
    sector_id INTEGER REFERENCES sectores(id) ON DELETE CASCADE,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('activo', 'inactivo'))
);

-- Create history table to track changes
CREATE TABLE IF NOT EXISTS historico_turnos (
    id SERIAL PRIMARY KEY,
    turno_id INTEGER REFERENCES turnos(id) ON DELETE CASCADE,
    fecha_cambio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sector_nombre TEXT NOT NULL,
    descripcion TEXT,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL
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

-- Seed data for configuracion
INSERT INTO configuracion (id, dias) VALUES (1, 2)
ON CONFLICT (id) DO UPDATE SET dias = EXCLUDED.dias;

-- ==============================================================
-- QUERIES PARA BORRAR LA BASE DE DATOS Y VOLVERLA A CREAR DE CERO
-- (Ejecuta estos DROP antes de los CREATE si quieres reiniciar todo)
-- ==============================================================
/*
DROP TABLE IF EXISTS historico_turnos CASCADE;
DROP TABLE IF EXISTS turnos CASCADE;
DROP TABLE IF EXISTS sectores CASCADE;
DROP TABLE IF EXISTS configuracion CASCADE;
*/
