const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ========== CAMBIAR ESTO ==========
// Base de datos PERSISTENTE en Render
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Función para inicializar base de datos
function inicializarBD() {
  return new Promise((resolve, reject) => {
    // Tabla de deudores
    db.run(`CREATE TABLE IF NOT EXISTS deudores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cuit TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      domicilio TEXT,
      telefono TEXT,
      email TEXT,
      fecha_alta DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) reject(err);
      
      // Tabla de instrumentos
      db.run(`CREATE TABLE IF NOT EXISTS instrumentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_deudor INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        numero TEXT NOT NULL,
        monto REAL NOT NULL,
        fecha_emision DATE NOT NULL,
        fecha_vencimiento DATE NOT NULL,
        tasa_interes REAL DEFAULT 5.0,
        intereses REAL DEFAULT 0,
        estado TEXT DEFAULT 'PENDIENTE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(id_deudor) REFERENCES deudores(id) ON DELETE CASCADE
      )`, (err) => {
        if (err) reject(err);
        
        // Tabla de pagos
        db.run(`CREATE TABLE IF NOT EXISTS pagos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          id_instrumento INTEGER NOT NULL,
          fecha_pago DATE NOT NULL,
          monto REAL NOT NULL,
          forma_pago TEXT,
          comprobante TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(id_instrumento) REFERENCES instrumentos(id) ON DELETE CASCADE
        )`, (err) => {
          if (err) reject(err);
          
          // Tabla de procesos
          db.run(`CREATE TABLE IF NOT EXISTS procesos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_instrumento INTEGER NOT NULL,
            etapa TEXT NOT NULL,
            fecha DATE NOT NULL,
            observaciones TEXT,
            responsable TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(id_instrumento) REFERENCES instrumentos(id) ON DELETE CASCADE
          )`, (err) => {
            if (err) reject(err);
            
            // Datos de ejemplo (solo si las tablas están vacías)
            db.get('SELECT COUNT(*) as count FROM deudores', (err, row) => {
              if (err) reject(err);
              
              if (row.count === 0) {
                console.log('📊 Insertando datos de ejemplo...');
                
                // Insertar deudores de ejemplo
                db.run(`INSERT INTO deudores (cuit, nombre, domicilio, telefono, email) VALUES 
                  ('30-12345678-9', 'Empresa Ejemplo S.A.', 'Av. Siempre Viva 123', '011-4321-5678', 'contacto@empresaejemplo.com'),
                  ('20-98765432-1', 'Comercio López Hnos.', 'Calle Falsa 456', '011-8765-4321', 'info@lopezhnos.com'),
                  ('27-55556666-7', 'Distribuidora Mayorista SRL', 'Ruta 8 Km 45', '02345-478912', 'ventas@distribuidora.com')`);
                
                // Insertar instrumentos de ejemplo
                db.run(`INSERT INTO instrumentos (id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes) VALUES 
                  (1, 'CHEQUE', '0001-123456', 150000.00, '2024-01-15', '2024-03-15', 5.0),
                  (1, 'PAGARÉ', 'PN-001-2024', 75000.50, '2024-02-01', '2024-04-01', 4.5),
                  (2, 'FACTURA', 'FA-001-2024', 234500.00, '2024-01-20', '2024-02-20', 6.0),
                  (3, 'CHEQUE', '0002-654321', 50000.00, '2024-01-10', '2024-01-31', 5.0)`);
                
                console.log('✅ Datos de ejemplo insertados');
              }
              
              resolve();
            });
          });
        });
      });
    });
  });
}
// ========== FIN DE CAMBIOS ==========

// ========== ENDPOINTS ACTUALIZADOS ==========

// Raíz - con información de la BD
app.get('/', (req, res) => {
  db.get('SELECT COUNT(*) as deudores FROM deudores', (err, deudoresRow) => {
    db.get('SELECT COUNT(*) as instrumentos FROM instrumentos', (err, instRow) => {
      res.json({
        status: 'online',
        service: 'API Cobranzas Jurídicas',
        version: '2.1.0',
        database: 'SQLite persistente',
        estadisticas: {
          total_deudores: deudoresRow.deudores,
          total_instrumentos: instRow.instrumentos
        },
        endpoints: [
          'GET  /api/deudores',
          'POST /api/deudores',
          'PUT  /api/deudores/:id',
          'DELETE /api/deudores/:id',
          'GET  /api/instrumentos',
          'POST /api/instrumentos',
          'PUT  /api/instrumentos/:id',
          'DELETE /api/instrumentos/:id',
          'GET  /api/pagos',
          'POST /api/pagos',
          'GET  /api/procesos',
          'POST /api/procesos',
          'GET  /api/estadisticas',
          'GET  /api/exportar',
          'GET  /api/buscar'
        ]
      });
    });
  });
});

// DEUDORES - ENDPOINTS COMPLETOS
app.get('/api/deudores', (req, res) => {
  db.all('SELECT * FROM deudores ORDER BY nombre', [], (err, rows) => {
    res.json({ success: true, data: rows });
  });
});

app.get('/api/deudores/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM deudores WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(400).json({ success: false, error: err.message });
    } else if (!row) {
      res.status(404).json({ success: false, error: 'Deudor no encontrado' });
    } else {
      res.json({ success: true, data: row });
    }
  });
});

app.post('/api/deudores', (req, res) => {
  const { cuit, nombre, domicilio, telefono, email } = req.body;
  
  // Validación básica
  if (!cuit || !nombre) {
    return res.status(400).json({ 
      success: false, 
      error: 'CUIT y Nombre son requeridos' 
    });
  }
  
  db.run(
    `INSERT INTO deudores (cuit, nombre, domicilio, telefono, email) 
     VALUES (?, ?, ?, ?, ?)`,
    [cuit, nombre, domicilio || null, telefono || null, email || null],
    function(err) {
      if (err) {
        res.status(400).json({ 
          success: false, 
          error: err.message.includes('UNIQUE') 
            ? 'El CUIT ya existe en la base de datos' 
            : err.message 
        });
      } else {
        res.json({ 
          success: true, 
          id: this.lastID,
          message: 'Deudor creado exitosamente'
        });
      }
    }
  );
});

app.put('/api/deudores/:id', (req, res) => {
  const { id } = req.params;
  const { cuit, nombre, domicilio, telefono, email } = req.body;
  
  if (!cuit || !nombre) {
    return res.status(400).json({ 
      success: false, 
      error: 'CUIT y Nombre son requeridos' 
    });
  }
  
  db.run(
    `UPDATE deudores 
     SET cuit = ?, nombre = ?, domicilio = ?, telefono = ?, email = ?, 
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [cuit, nombre, domicilio || null, telefono || null, email || null, id],
    function(err) {
      if (err) {
        res.status(400).json({ 
          success: false, 
          error: err.message.includes('UNIQUE') 
            ? 'El CUIT ya existe en otro registro' 
            : err.message 
        });
      } else {
        res.json({ 
          success: true, 
          changes: this.changes,
          message: this.changes > 0 
            ? 'Deudor actualizado exitosamente' 
            : 'No se encontró el deudor'
        });
      }
    }
  );
});

app.delete('/api/deudores/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM deudores WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(400).json({ success: false, error: err.message });
    } else {
      res.json({ 
        success: true, 
        changes: this.changes,
        message: this.changes > 0 
          ? 'Deudor eliminado exitosamente' 
          : 'No se encontró el deudor'
      });
    }
  });
});

// INSTRUMENTOS - ENDPOINTS COMPLETOS
app.get('/api/instrumentos', (req, res) => {
  db.all(`
    SELECT i.*, d.nombre as deudor_nombre, d.cuit as deudor_cuit
    FROM instrumentos i
    LEFT JOIN deudores d ON i.id_deudor = d.id
    ORDER BY i.fecha_vencimiento
  `, [], (err, rows) => {
    res.json({ success: true, data: rows });
  });
});

app.get('/api/instrumentos/:id', (req, res) => {
  const { id } = req.params;
  
  db.get(
    `SELECT i.*, d.nombre as deudor_nombre, d.cuit as deudor_cuit
     FROM instrumentos i
     LEFT JOIN deudores d ON i.id_deudor = d.id
     WHERE i.id = ?`,
    [id],
    (err, row) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
      } else if (!row) {
        res.status(404).json({ success: false, error: 'Instrumento no encontrado' });
      } else {
        res.json({ success: true, data: row });
      }
    }
  );
});

app.post('/api/instrumentos', (req, res) => {
  const { id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes } = req.body;
  
  // Validación básica
  if (!id_deudor || !tipo || !numero || !monto) {
    return res.status(400).json({ 
      success: false, 
      error: 'Deudor, Tipo, Número y Monto son requeridos' 
    });
  }
  
  db.run(
    `INSERT INTO instrumentos 
     (id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id_deudor, tipo, numero, parseFloat(monto), fecha_emision, fecha_vencimiento, parseFloat(tasa_interes) || 5.0],
    function(err) {
      if (err) {
        res.status(400).json({ 
          success: false, 
          error: err.message.includes('FOREIGN KEY') 
            ? 'El deudor especificado no existe' 
            : err.message 
        });
      } else {
        res.json({ 
          success: true, 
          id: this.lastID,
          message: 'Instrumento creado exitosamente'
        });
      }
    }
  );
});

app.put('/api/instrumentos/:id', (req, res) => {
  const { id } = req.params;
  const { id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes, estado } = req.body;
  
  if (!id_deudor || !tipo || !numero || !monto) {
    return res.status(400).json({ 
      success: false, 
      error: 'Deudor, Tipo, Número y Monto son requeridos' 
    });
  }
  
  db.run(
    `UPDATE instrumentos 
     SET id_deudor = ?, tipo = ?, numero = ?, monto = ?, 
         fecha_emision = ?, fecha_vencimiento = ?, 
         tasa_interes = ?, estado = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [id_deudor, tipo, numero, parseFloat(monto), fecha_emision, 
     fecha_vencimiento, parseFloat(tasa_interes) || 5.0, estado || 'PENDIENTE', id],
    function(err) {
      if (err) {
        res.status(400).json({ 
          success: false, 
          error: err.message.includes('FOREIGN KEY') 
            ? 'El deudor especificado no existe' 
            : err.message 
        });
      } else {
        res.json({ 
          success: true, 
          changes: this.changes,
          message: this.changes > 0 
            ? 'Instrumento actualizado exitosamente' 
            : 'No se encontró el instrumento'
        });
      }
    }
  );
});

app.delete('/api/instrumentos/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM instrumentos WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(400).json({ success: false, error: err.message });
    } else {
      res.json({ 
        success: true, 
        changes: this.changes,
        message: this.changes > 0 
          ? 'Instrumento eliminado exitosamente' 
          : 'No se encontró el instrumento'
      });
    }
  });
});

// ========== ENDPOINTS DE BÚSQUEDA Y ESTADÍSTICAS ==========

app.get('/api/buscar', (req, res) => {
  const { q, tipo = 'deudores' } = req.query;
  
  if (!q) {
    return res.status(400).json({ 
      success: false, 
      error: 'Término de búsqueda requerido' 
    });
  }
  
  const searchTerm = `%${q}%`;
  
  switch(tipo) {
    case 'deudores':
      db.all(
        `SELECT * FROM deudores 
         WHERE nombre LIKE ? OR cuit LIKE ?
         ORDER BY nombre`,
        [searchTerm, searchTerm],
        (err, rows) => {
          if (err) {
            res.status(500).json({ success: false, error: err.message });
          } else {
            res.json({ success: true, data: rows });
          }
        }
      );
      break;
      
    case 'instrumentos':
      db.all(
        `SELECT i.*, d.nombre as deudor_nombre, d.cuit as deudor_cuit
         FROM instrumentos i
         LEFT JOIN deudores d ON i.id_deudor = d.id
         WHERE i.numero LIKE ? OR i.tipo LIKE ? OR d.nombre LIKE ?
         ORDER BY i.fecha_vencimiento`,
        [searchTerm, searchTerm, searchTerm],
        (err, rows) => {
          if (err) {
            res.status(500).json({ success: false, error: err.message });
          } else {
            res.json({ success: true, data: rows });
          }
        }
      );
      break;
      
    default:
      res.status(400).json({ 
        success: false, 
        error: 'Tipo de búsqueda no válido. Use "deudores" o "instrumentos"' 
      });
  }
});

app.get('/api/estadisticas', (req, res) => {
  const queries = [
    { key: 'total_deudores', sql: 'SELECT COUNT(*) as value FROM deudores' },
    { key: 'total_instrumentos', sql: 'SELECT COUNT(*) as value FROM instrumentos' },
    { key: 'deuda_pendiente', sql: "SELECT COALESCE(SUM(monto), 0) as value FROM instrumentos WHERE estado = 'PENDIENTE'" },
    { key: 'total_recuperado', sql: 'SELECT COALESCE(SUM(monto), 0) as value FROM pagos' },
    { key: 'procesos_activos', sql: "SELECT COUNT(*) as value FROM instrumentos WHERE estado = 'EN PROCESO'" }
  ];
  
  const results = {};
  let completed = 0;
  
  queries.forEach(query => {
    db.get(query.sql, [], (err, row) => {
      if (err) {
        console.error(`Error en estadística ${query.key}:`, err);
        results[query.key] = 0;
      } else {
        results[query.key] = row?.value || 0;
      }
      
      completed++;
      
      if (completed === queries.length) {
        const total = results.deuda_pendiente + results.total_recuperado;
        results.porcentaje_recupero = total > 0 
          ? ((results.total_recuperado / total) * 100).toFixed(2)
          : '0.00';
        
        // Obtener vencimientos próximos (7 días)
        db.all(
          `SELECT COUNT(*) as count FROM instrumentos 
           WHERE estado = 'PENDIENTE' 
           AND fecha_vencimiento BETWEEN date('now') AND date('now', '+7 days')`,
          [],
          (err, row) => {
            if (!err) {
              results.vencimientos_proximos = row[0]?.count || 0;
            }
            
            // Obtener deudas vencidas
            db.all(
              `SELECT COUNT(*) as count FROM instrumentos 
               WHERE estado = 'PENDIENTE' 
               AND fecha_vencimiento < date('now')`,
              [],
              (err, row) => {
                if (!err) {
                  results.deudas_vencidas = row[0]?.count || 0;
                }
                
                res.json({ 
                  success: true, 
                  data: results,
                  timestamp: new Date().toISOString()
                });
              }
            );
          }
        );
      }
    });
  });
});

// ========== ENDPOINTS ADICIONALES ÚTILES ==========

// Exportar todos los datos
app.get('/api/exportar', (req, res) => {
  const tablas = ['deudores', 'instrumentos', 'pagos', 'procesos'];
  const datos = {};
  let completadas = 0;
  
  tablas.forEach(tabla => {
    db.all(`SELECT * FROM ${tabla}`, [], (err, rows) => {
      if (err) {
        datos[tabla] = { error: err.message };
      } else {
        datos[tabla] = rows;
      }
      
      completadas++;
      
      if (completadas === tablas.length) {
        res.json({ 
          success: true, 
          data: datos,
          export_date: new Date().toISOString()
        });
      }
    });
  });
});

// Verificar estado de la base de datos
app.get('/api/status', (req, res) => {
  db.get('SELECT COUNT(*) as deudores FROM deudores', (err, deudores) => {
    db.get('SELECT COUNT(*) as instrumentos FROM instrumentos', (err, instrumentos) => {
      db.get('SELECT COUNT(*) as pagos FROM pagos', (err, pagos) => {
        res.json({
          success: true,
          database: 'SQLite',
          path: dbPath,
          exists: fs.existsSync(dbPath),
          size: fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0,
          stats: {
            deudores: deudores?.deudores || 0,
            instrumentos: instrumentos?.instrumentos || 0,
            pagos: pagos?.pagos || 0
          },
          uptime: process.uptime()
        });
      });
    });
  });
});

// ========== MIDDLEWARE DE ERRORES ==========

app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Ruta no encontrada',
    path: req.path 
  });
});

// ========== INICIAR SERVIDOR ==========

// Inicializar base de datos antes de iniciar
inicializarBD()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 API corriendo en http://localhost:${PORT}`);
      console.log(`📊 Base de datos en: ${dbPath}`);
      console.log(`📅 ${new Date().toLocaleString('es-AR')}`);
    });
  })
  .catch(err => {
    console.error('❌ Error inicializando base de datos:', err);
    process.exit(1);
  });
