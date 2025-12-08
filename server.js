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
// Función para inicializar base de datos (SIN DATOS DE EJEMPLO)
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
      if (err) {
        console.error('❌ Error creando tabla deudores:', err);
        reject(err);
        return;
      }
      console.log('✅ Tabla "deudores" creada/verificada');
      
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
        if (err) {
          console.error('❌ Error creando tabla instrumentos:', err);
          reject(err);
          return;
        }
        console.log('✅ Tabla "instrumentos" creada/verificada');
        
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
          if (err) {
            console.error('❌ Error creando tabla pagos:', err);
            reject(err);
            return;
          }
          console.log('✅ Tabla "pagos" creada/verificada');
          
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
            if (err) {
              console.error('❌ Error creando tabla procesos:', err);
              reject(err);
              return;
            }
            console.log('✅ Tabla "procesos" creada/verificada');
            
            // VERIFICAR SI LAS TABLAS ESTÁN VACÍAS Y MOSTRAR MENSAJE
            db.get('SELECT COUNT(*) as count FROM deudores', (err, row) => {
              if (err) {
                console.error('❌ Error verificando datos:', err);
                reject(err);
                return;
              }
              
              if (row.count === 0) {
                console.log('📭 Base de datos vacía - lista para usar');
                console.log('💡 Sugerencia: Crea tu primer deudor desde Google Sheets');
              } else {
                console.log(`📊 Base de datos con ${row.count} deudores existentes`);
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

// Raíz - Información de la API
app.get('/', (req, res) => {
  db.get('SELECT COUNT(*) as deudores FROM deudores', (err, deudoresRow) => {
    db.get('SELECT COUNT(*) as instrumentos FROM instrumentos', (err, instRow) => {
      const deudores = deudoresRow?.deudores || 0;
      const instrumentos = instRow?.instrumentos || 0;
      
      res.json({
        status: 'online',
        service: 'API Cobranzas Jurídicas - PRODUCCIÓN',
        version: '2.1.0',
        environment: process.env.NODE_ENV || 'production',
        database: {
          type: 'SQLite persistente',
          path: dbPath,
          records: {
            deudores: deudores,
            instrumentos: instrumentos,
            estado: deudores === 0 ? 'vacía' : 'con datos'
          }
        },
        endpoints: [
          'GET  /api/deudores',
          'POST /api/deudores',
          'GET  /api/deudores/:id',
          'PUT  /api/deudores/:id',
          'DELETE /api/deudores/:id',
          'GET  /api/instrumentos',
          'POST /api/instrumentos',
          'GET  /api/instrumentos/:id',
          'PUT  /api/instrumentos/:id',
          'DELETE /api/instrumentos/:id',
          'GET  /api/pagos',
          'POST /api/pagos',
          'GET  /api/estadisticas',
          'GET  /api/buscar?q=texto&tipo=deudores|instrumentos',
          'GET  /api/status',
          'GET  /api/exportar'
        ],
        documentation: 'Usa POST /api/deudores para crear el primer registro',
        message: deudores === 0 
          ? 'Base de datos vacía. Crea tu primer deudor usando POST /api/deudores'
          : `Sistema activo con ${deudores} deudores y ${instrumentos} instrumentos`
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
// ========== ENDPOINTS PARA PAGOS COMPLETOS ==========

// OBTENER PAGOS CON INFORMACIÓN DE INSTRUMENTOS
app.get('/api/pagos-completos', (req, res) => {
  db.all(`
    SELECT 
      p.*,
      i.numero as instrumento_numero,
      i.tipo as instrumento_tipo,
      i.monto as instrumento_monto,
      d.nombre as deudor_nombre,
      d.cuit as deudor_cuit
    FROM pagos p
    LEFT JOIN instrumentos i ON p.id_instrumento = i.id
    LEFT JOIN deudores d ON i.id_deudor = d.id
    ORDER BY p.fecha_pago DESC
  `, [], (err, rows) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({ success: true, data: rows });
    }
  });
});

// REGISTRAR PAGO Y ACTUALIZAR ESTADO DEL INSTRUMENTO
app.post('/api/pagos-completos', (req, res) => {
  const { id_instrumento, fecha_pago, monto, forma_pago, comprobante, actualizar_estado = true } = req.body;
  
  // Validaciones
  if (!id_instrumento || !fecha_pago || !monto) {
    return res.status(400).json({ 
      success: false, 
      error: 'id_instrumento, fecha_pago y monto son requeridos' 
    });
  }
  
  // Iniciar transacción
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    // 1. Insertar el pago
    db.run(
      `INSERT INTO pagos (id_instrumento, fecha_pago, monto, forma_pago, comprobante) 
       VALUES (?, ?, ?, ?, ?)`,
      [id_instrumento, fecha_pago, parseFloat(monto), forma_pago || null, comprobante || null],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          res.status(500).json({ success: false, error: err.message });
          return;
        }
        
        const pagoId = this.lastID;
        
        // 2. Si se solicita, actualizar estado del instrumento
        if (actualizar_estado) {
          // Verificar si el instrumento está totalmente pagado
          db.get(
            `SELECT 
              i.monto as monto_instrumento,
              COALESCE(SUM(p.monto), 0) as total_pagado
             FROM instrumentos i
             LEFT JOIN pagos p ON i.id = p.id_instrumento
             WHERE i.id = ?
             GROUP BY i.id`,
            [id_instrumento],
            (err, row) => {
              if (err) {
                db.run('ROLLBACK');
                res.status(500).json({ success: false, error: err.message });
                return;
              }
              
              const montoInstrumento = parseFloat(row.monto_instrumento) || 0;
              const totalPagado = parseFloat(row.total_pagado) || 0;
              
              let nuevoEstado = 'PENDIENTE';
              
              if (totalPagado >= montoInstrumento) {
                nuevoEstado = 'PAGADO';
              } else if (totalPagado > 0) {
                nuevoEstado = 'PAGO PARCIAL';
              }
              
              // Actualizar estado del instrumento
              db.run(
                `UPDATE instrumentos 
                 SET estado = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [nuevoEstado, id_instrumento],
                (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    res.status(500).json({ success: false, error: err.message });
                    return;
                  }
                  
                  db.run('COMMIT');
                  res.json({ 
                    success: true, 
                    id: pagoId,
                    estado_actualizado: nuevoEstado,
                    message: 'Pago registrado e instrumento actualizado'
                  });
                }
              );
            }
          );
        } else {
          db.run('COMMIT');
          res.json({ 
            success: true, 
            id: pagoId,
            message: 'Pago registrado (sin actualizar estado)' 
          });
        }
      }
    );
  });
});

// ========== ENDPOINTS PARA PROCESOS COMPLETOS ==========

// OBTENER PROCESOS CON INFORMACIÓN DE INSTRUMENTOS
app.get('/api/procesos-completos', (req, res) => {
  db.all(`
    SELECT 
      pr.*,
      i.numero as instrumento_numero,
      i.tipo as instrumento_tipo,
      i.monto as instrumento_monto,
      i.estado as instrumento_estado,
      d.nombre as deudor_nombre,
      d.cuit as deudor_cuit
    FROM procesos pr
    LEFT JOIN instrumentos i ON pr.id_instrumento = i.id
    LEFT JOIN deudores d ON i.id_deudor = d.id
    ORDER BY pr.fecha DESC, pr.etapa
  `, [], (err, rows) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({ success: true, data: rows });
    }
  });
});

// REGISTRAR PROCESO Y ACTUALIZAR ESTADO DEL INSTRUMENTO
app.post('/api/procesos-completos', (req, res) => {
  const { id_instrumento, etapa, fecha, observaciones, responsable, actualizar_estado = true } = req.body;
  
  // Validaciones
  if (!id_instrumento || !etapa || !fecha) {
    return res.status(400).json({ 
      success: false, 
      error: 'id_instrumento, etapa y fecha son requeridos' 
    });
  }
  
  // Validar etapas permitidas
  const etapasPermitidas = ['DEMANDA', 'NOTIFICACIÓN', 'EMBARGOS', 'REMATE', 'SENTENCIA', 'EJECUCIÓN', 'FINALIZADO'];
  if (!etapasPermitidas.includes(etapa.toUpperCase())) {
    return res.status(400).json({ 
      success: false, 
      error: `Etapa no válida. Use: ${etapasPermitidas.join(', ')}` 
    });
  }
  
  db.run(
    `INSERT INTO procesos (id_instrumento, etapa, fecha, observaciones, responsable) 
     VALUES (?, ?, ?, ?, ?)`,
    [id_instrumento, etapa, fecha, observaciones || null, responsable || null],
    function(err) {
      if (err) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }
      
      const procesoId = this.lastID;
      
      // Si se solicita, actualizar estado del instrumento
      if (actualizar_estado) {
        let nuevoEstado = 'EN PROCESO';
        
        // Si la etapa es "FINALIZADO", marcar como finalizado
        if (etapa.toUpperCase() === 'FINALIZADO') {
          nuevoEstado = 'FINALIZADO';
        }
        
        db.run(
          `UPDATE instrumentos 
           SET estado = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [nuevoEstado, id_instrumento],
          (err) => {
            if (err) {
              console.error('Error actualizando estado:', err);
              // No fallar si solo hay error en actualización de estado
            }
            
            res.json({ 
              success: true, 
              id: procesoId,
              estado_actualizado: nuevoEstado,
              message: 'Proceso registrado e instrumento actualizado'
            });
          }
        );
      } else {
        res.json({ 
          success: true, 
          id: procesoId,
          message: 'Proceso registrado (sin actualizar estado)' 
        });
      }
    }
  );
});

// ========== ENDPOINT PARA OBTENER INSTRUMENTOS PARA PAGOS ==========

// OBTENER INSTRUMENTOS PARA REGISTRAR PAGOS (pendientes o parciales)
app.get('/api/instrumentos-para-pagos', (req, res) => {
  db.all(`
    SELECT 
      i.*,
      d.nombre as deudor_nombre,
      d.cuit as deudor_cuit,
      COALESCE(SUM(p.monto), 0) as total_pagado,
      i.monto - COALESCE(SUM(p.monto), 0) as saldo_pendiente
    FROM instrumentos i
    LEFT JOIN deudores d ON i.id_deudor = d.id
    LEFT JOIN pagos p ON i.id = p.id_instrumento
    WHERE i.estado IN ('PENDIENTE', 'PAGO PARCIAL')
    GROUP BY i.id, i.monto, d.nombre, d.cuit
    HAVING saldo_pendiente > 0
    ORDER BY i.fecha_vencimiento
  `, [], (err, rows) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({ success: true, data: rows });
    }
  });
});

// ========== ENDPOINT PARA OBTENER INSTRUMENTOS PARA PROCESOS ==========

// OBTENER INSTRUMENTOS PARA INICIAR PROCESOS (vencidos y no pagados)
app.get('/api/instrumentos-para-procesos', (req, res) => {
  db.all(`
    SELECT 
      i.*,
      d.nombre as deudor_nombre,
      d.cuit as deudor_cuit,
      d.domicilio as deudor_domicilio,
      COALESCE(SUM(p.monto), 0) as total_pagado,
      i.monto - COALESCE(SUM(p.monto), 0) as saldo_pendiente,
      CASE 
        WHEN i.fecha_vencimiento < date('now') THEN 'VENCIDO'
        ELSE 'POR VENCER'
      END as situacion_vencimiento,
      julianday('now') - julianday(i.fecha_vencimiento) as dias_vencido
    FROM instrumentos i
    LEFT JOIN deudores d ON i.id_deudor = d.id
    LEFT JOIN pagos p ON i.id = p.id_instrumento
    WHERE i.estado IN ('PENDIENTE', 'VENCIDO', 'PAGO PARCIAL')
      AND (i.fecha_vencimiento < date('now') OR i.estado = 'VENCIDO')
    GROUP BY i.id, i.monto, d.nombre, d.cuit, d.domicilio, i.fecha_vencimiento
    HAVING saldo_pendiente > 0
    ORDER BY dias_vencido DESC, i.fecha_vencimiento
  `, [], (err, rows) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({ success: true, data: rows });
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
        // Calcular porcentaje de recupero (evitar división por 0)
        const totalDeuda = results.deuda_pendiente + results.total_recuperado;
        
        if (totalDeuda > 0) {
          results.porcentaje_recupero = ((results.total_recuperado / totalDeuda) * 100).toFixed(2);
        } else {
          results.porcentaje_recupero = '0.00';
        }
        
        // Calcular vencimientos solo si hay instrumentos
        if (results.total_instrumentos > 0) {
          db.all(
            `SELECT COUNT(*) as count FROM instrumentos 
             WHERE estado = 'PENDIENTE' 
             AND fecha_vencimiento BETWEEN date('now') AND date('now', '+7 days')`,
            [],
            (err, row) => {
              if (!err) {
                results.vencimientos_proximos = row[0]?.count || 0;
              }
              
              db.all(
                `SELECT COUNT(*) as count FROM instrumentos 
                 WHERE estado = 'PENDIENTE' 
                 AND fecha_vencimiento < date('now')`,
                [],
                (err, row) => {
                  if (!err) {
                    results.deudas_vencidas = row[0]?.count || 0;
                  }
                  
                  // Agregar flag de base de datos vacía
                  results.base_vacia = results.total_deudores === 0;
                  
                  res.json({ 
                    success: true, 
                    data: results,
                    timestamp: new Date().toISOString(),
                    message: results.total_deudores === 0 
                      ? 'Base de datos vacía - Crea tu primer deudor'
                      : 'Estadísticas calculadas correctamente'
                  });
                }
              );
            }
          );
        } else {
          // Si no hay instrumentos, devolver valores por defecto
          results.vencimientos_proximos = 0;
          results.deudas_vencidas = 0;
          results.base_vacia = results.total_deudores === 0;
          
          res.json({ 
            success: true, 
            data: results,
            timestamp: new Date().toISOString(),
            message: results.total_deudores === 0 
              ? 'Base de datos vacía - Crea tu primer deudor'
              : 'No hay instrumentos registrados'
          });
        }
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
