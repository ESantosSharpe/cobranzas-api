const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Base de datos en memoria (para empezar)
const db = new sqlite3.Database(':memory:');

// Inicializar BD
db.serialize(() => {
  // Tabla de deudores
  db.run(`CREATE TABLE deudores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cuit TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    domicilio TEXT,
    telefono TEXT,
    email TEXT,
    fecha_alta DATE DEFAULT CURRENT_DATE
  )`);
  
  // Tabla de instrumentos
  db.run(`CREATE TABLE instrumentos (
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
    FOREIGN KEY(id_deudor) REFERENCES deudores(id)
  )`);
  
  // Tabla de pagos
  db.run(`CREATE TABLE pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_instrumento INTEGER NOT NULL,
    fecha_pago DATE NOT NULL,
    monto REAL NOT NULL,
    forma_pago TEXT,
    comprobante TEXT,
    FOREIGN KEY(id_instrumento) REFERENCES instrumentos(id)
  )`);
  
  // Tabla de procesos
  db.run(`CREATE TABLE procesos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_instrumento INTEGER NOT NULL,
    etapa TEXT NOT NULL,
    fecha DATE NOT NULL,
    observaciones TEXT,
    responsable TEXT,
    FOREIGN KEY(id_instrumento) REFERENCES instrumentos(id)
  )`);
  
  // Datos de ejemplo
  db.run(`INSERT OR IGNORE INTO deudores (cuit, nombre) VALUES 
    ('30-12345678-9', 'Empresa Ejemplo S.A.'),
    ('20-98765432-1', 'Comercio López Hnos.')`);
});

// ========== ENDPOINTS ==========

// Raíz
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'API Cobranzas Jurídicas',
    version: '2.0.0',
    endpoints: [
      'GET  /api/deudores',
      'POST /api/deudores',
      'GET  /api/instrumentos',
      'POST /api/instrumentos',
      'GET  /api/pagos',
      'POST /api/pagos',
      'GET  /api/procesos',
      'POST /api/procesos',
      'GET  /api/estadisticas',
      'GET  /api/exportar'
    ]
  });
});

// DEUDORES
app.get('/api/deudores', (req, res) => {
  db.all('SELECT * FROM deudores ORDER BY nombre', [], (err, rows) => {
    res.json({ success: true, data: rows });
  });
});

app.post('/api/deudores', (req, res) => {
  const { cuit, nombre, domicilio, telefono, email } = req.body;
  db.run(
    'INSERT INTO deudores (cuit, nombre, domicilio, telefono, email) VALUES (?, ?, ?, ?, ?)',
    [cuit, nombre, domicilio, telefono, email],
    function(err) {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
      } else {
        res.json({ success: true, id: this.lastID });
      }
    }
  );
});

// INSTRUMENTOS
app.get('/api/instrumentos', (req, res) => {
  db.all(`
    SELECT i.*, d.nombre as deudor_nombre 
    FROM instrumentos i
    LEFT JOIN deudores d ON i.id_deudor = d.id
    ORDER BY i.fecha_vencimiento
  `, [], (err, rows) => {
    res.json({ success: true, data: rows });
  });
});

app.post('/api/instrumentos', (req, res) => {
  const { id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes } = req.body;
  db.run(
    `INSERT INTO instrumentos 
     (id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id_deudor, tipo, numero, monto, fecha_emision, fecha_vencimiento, tasa_interes || 5.0],
    function(err) {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
      } else {
        res.json({ success: true, id: this.lastID });
      }
    }
  );
});

// PAGOS
app.get('/api/pagos', (req, res) => {
  db.all('SELECT * FROM pagos ORDER BY fecha_pago DESC', [], (err, rows) => {
    res.json({ success: true, data: rows });
  });
});

app.post('/api/pagos', (req, res) => {
  const { id_instrumento, fecha_pago, monto, forma_pago, comprobante } = req.body;
  db.run(
    'INSERT INTO pagos (id_instrumento, fecha_pago, monto, forma_pago, comprobante) VALUES (?, ?, ?, ?, ?)',
    [id_instrumento, fecha_pago, monto, forma_pago, comprobante],
    function(err) {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
      } else {
        res.json({ success: true, id: this.lastID });
      }
    }
  );
});

// ESTADÍSTICAS
app.get('/api/estadisticas', (req, res) => {
  const queries = [
    { key: 'total_deudores', sql: 'SELECT COUNT(*) as value FROM deudores' },
    { key: 'total_instrumentos', sql: 'SELECT COUNT(*) as value FROM instrumentos' },
    { key: 'deuda_pendiente', sql: "SELECT SUM(monto) as value FROM instrumentos WHERE estado = 'PENDIENTE'" },
    { key: 'total_recuperado', sql: 'SELECT SUM(monto) as value FROM pagos' }
  ];
  
  const results = {};
  let completed = 0;
  
  queries.forEach(query => {
    db.get(query.sql, [], (err, row) => {
      results[query.key] = row?.value || 0;
      completed++;
      
      if (completed === queries.length) {
        const total = results.deuda_pendiente + results.total_recuperado;
        results.porcentaje_recupero = total > 0 
          ? ((results.total_recuperado / total) * 100).toFixed(2)
          : 0;
        
        res.json({ success: true, data: results });
      }
    });
  });
});

// EXPORTAR
app.get('/api/exportar', (req, res) => {
  const tablas = ['deudores', 'instrumentos', 'pagos', 'procesos'];
  const datos = {};
  let completadas = 0;
  
  tablas.forEach(tabla => {
    db.all(`SELECT * FROM ${tabla}`, [], (err, rows) => {
      datos[tabla] = rows || [];
      completadas++;
      
      if (completadas === tablas.length) {
        res.json({ success: true, data: datos });
      }
    });
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 API corriendo en http://localhost:${PORT}`);
  console.log(`📊 Base de datos inicializada`);
});
