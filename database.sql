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
