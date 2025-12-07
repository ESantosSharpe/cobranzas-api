const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configuración de base de datos
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'cobranzas.db');

// Asegurar que existe el directorio de datos
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Conectar a SQLite
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error conectando a SQLite:', err.message);
  } else {
    console.log('✅ Conectado a SQLite en:', DB_PATH);
    inicializarBD();
  }
});

// ========== INICIALIZACIÓN DE LA BD ==========
function inicializarBD() {
  const sql = `
    -- Tabla de deudores
    CREATE TABLE IF NOT EXISTS deudores (
      id_deudor INTEGER PRIMARY KEY AUTOINCREMENT,
      cuit TEXT UNIQUE NOT NULL,
      denominacion TEXT NOT NULL,
      domicilio TEXT,
      telefono TEXT,
      email TEXT,
      fecha_alta DATE DEFAULT CURRENT_DATE,
      activo INTEGER DEFAULT 1
    );

    -- Tabla de instrumentos
    CREATE TABLE IF NOT EXISTS instrumentos (
      id_instrumento INTEGER PRIMARY KEY AUTOINCREMENT,
      id_deudor INTEGER NOT NULL,
      tipo TEXT CHECK(tipo IN ('ECHEQ', 'FACTURA')) NOT NULL,
      numero TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha_emision DATE NOT NULL,
      fecha_vencimiento DATE NOT NULL,
      tasa_interes REAL DEFAULT 5.0,
      intereses REAL DEFAULT 0,
      estado TEXT DEFAULT 'PENDIENTE',
      FOREIGN KEY (id_deudor) REFERENCES deudores(id_deudor)
    );

    -- Tabla de pagos
    CREATE TABLE IF NOT EXISTS pagos (
      id_pago INTEGER PRIMARY KEY AUTOINCREMENT,
      id_instrumento INTEGER NOT NULL,
      fecha_pago DATE NOT NULL,
      monto REAL NOT NULL,
      forma_pago TEXT,
      comprobante TEXT,
      observaciones TEXT,
      FOREIGN KEY (id_instrumento) REFERENCES instrumentos(id_instrumento)
    );

    -- Tabla de procesos
    CREATE TABLE IF NOT EXISTS procesos (
      id_proceso INTEGER PRIMARY KEY AUTOINCREMENT,
      id_instrumento INTEGER NOT NULL,
      etapa TEXT NOT NULL,
      fecha_etapa DATE NOT NULL,
      observaciones TEXT,
      responsable TEXT,
      proxima_accion DATE,
      FOREIGN KEY (id_instrumento) REFERENCES instrumentos(id_instrumento)
    );
  `;

  db.exec(sql, (err) => {
    if (err) {
      console.error('Error inicializando BD:', err.message);
    } else {
      console.log('✅ Base de datos inicializada');
      
      // Insertar datos de ejemplo si está vacía
      verificarDatosEjemplo();
    }
  });
}

function verificarDatosEjemplo() {
  db.get("SELECT COUNT(*) as count FROM deudores", (err, row) => {
    if (!err && row.count === 0) {
      console.log('Insertando datos de ejemplo...');
      
      const insertEjemplo = `
        INSERT INTO deudores (cuit, denominacion, domicilio, telefono, email) VALUES
        ('30-12345678-9', 'Empresa Ejemplo S.A.', 'Av. Corrientes 1234', '11-1234-5678', 'contacto@empresa.com'),
        ('20-98765432-1', 'Comercio López', 'Rivadavia 567', '11-8765-4321', 'info@comercio.com');
        
        INSERT INTO instrumentos (id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento) VALUES
        (1, 'ECHEQ', '0001-123456', 150000, '2024-01-15', '2024-03-15'),
        (1, 'FACTURA', 'FA-001', 75000, '2024-02-01', '2024-04-01');
      `;
      
      db.exec(insertEjemplo, (err) => {
        if (err) {
          console.error('Error insertando ejemplo:', err.message);
        } else {
          console.log('✅ Datos de ejemplo insertados');
        }
      });
    }
  });
}

// ========== ENDPOINTS ==========

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'API Cobranzas Jurídicas',
    version: '1.0.0',
    endpoints: [
      '/api/deudores',
      '/api/instrumentos',
      '/api/pagos',
      '/api/procesos',
      '/api/estadisticas'
    ]
  });
});

// Obtener deudores
app.get('/api/deudores', (req, res) => {
  const sql = 'SELECT * FROM deudores WHERE activo = 1 ORDER BY denominacion';
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, data: rows });
  });
});

// Agregar deudor
app.post('/api/deudores', (req, res) => {
  const { cuit, denominacion, domicilio, telefono, email } = req.body;
  
  const sql = `
    INSERT INTO deudores (cuit, denominacion, domicilio, telefono, email)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  db.run(sql, [cuit, denominacion, domicilio, telefono, email], function(err) {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

// Obtener instrumentos
app.get('/api/instrumentos', (req, res) => {
  const sql = `
    SELECT i.*, d.denominacion, d.cuit
    FROM instrumentos i
    LEFT JOIN deudores d ON i.id_deudor = d.id_deudor
    ORDER BY i.fecha_vencimiento
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, data: rows });
  });
});

// Agregar instrumento
app.post('/api/instrumentos', (req, res) => {
  const { id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes } = req.body;
  
  const sql = `
    INSERT INTO instrumentos (id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(sql, [id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes || 5.0], function(err) {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

// Registrar pago
app.post('/api/pagos', (req, res) => {
  const { id_instrumento, fecha_pago, monto, forma_pago, comprobante } = req.body;
  
  const sql = `
    INSERT INTO pagos (id_instrumento, fecha_pago, monto, forma_pago, comprobante)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  db.run(sql, [id_instrumento, fecha_pago, monto, forma_pago, comprobante], function(err) {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

// Calcular intereses
app.post('/api/instrumentos/:id/intereses', (req, res) => {
  const id = req.params.id;
  
  const sql = `
    UPDATE instrumentos 
    SET intereses = monto * (tasa_interes/100.0) * 
        (julianday('now') - julianday(fecha_vencimiento)) / 365.0
    WHERE id_instrumento = ? AND fecha_vencimiento < date('now')
  `;
  
  db.run(sql, [id], function(err) {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
      return;
    }
    
    db.get('SELECT * FROM instrumentos WHERE id_instrumento = ?', [id], (err, row) => {
      res.json({ success: true, data: row });
    });
  });
});

// Obtener estadísticas
app.get('/api/estadisticas', (req, res) => {
  const queries = [
    'SELECT COUNT(*) as total_deudores FROM deudores WHERE activo = 1',
    'SELECT COUNT(*) as total_instrumentos FROM instrumentos',
    `SELECT SUM(monto + intereses) as deuda_pendiente 
     FROM instrumentos 
     WHERE estado = 'PENDIENTE'`,
    'SELECT SUM(monto) as total_recuperado FROM pagos'
  ];
  
  Promise.all(queries.map(query => 
    new Promise((resolve, reject) => {
      db.get(query, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })
  )).then(results => {
    const estadisticas = {
      total_deudores: results[0].total_deudores,
      total_instrumentos: results[1].total_instrumentos,
      deuda_pendiente: results[2].deuda_pendiente || 0,
      total_recuperado: results[3].total_recuperado || 0
    };
    
    const total = estadisticas.deuda_pendiente + estadisticas.total_recuperado;
    estadisticas.porcentaje_recupero = total > 0 
      ? (estadisticas.total_recuperado / total * 100).toFixed(2)
      : 0;
    
    res.json({ success: true, data: estadisticas });
  }).catch(err => {
    res.status(500).json({ success: false, error: err.message });
  });
});

// Exportar datos
app.get('/api/exportar', (req, res) => {
  const tablas = ['deudores', 'instrumentos', 'pagos', 'procesos'];
  const datos = {};
  
  Promise.all(tablas.map(tabla =>
    new Promise((resolve, reject) => {
      db.all(`SELECT * FROM ${tabla}`, [], (err, rows) => {
        if (err) reject(err);
        else {
          datos[tabla] = rows;
          resolve();
        }
      });
    })
  )).then(() => {
    res.json({ success: true, data: datos });
  }).catch(err => {
    res.status(500).json({ success: false, error: err.message });
  });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📊 Base de datos: ${DB_PATH}`);
});
