'use strict';
// Servidor del CRM de ventas de Fletes Tauro.

require('dotenv').config();
const path = require('path');
const express = require('express');

require('./db'); // inicializa esquema, catalogos y usuario administrador

const { rutasAuth, rutasUsuarios } = require('./auth');
const { rutasEmpresas, rutasContactos, rutasActividades } = require('./empresas');
const { rutasTareas } = require('./tareas');
const { rutasRutas, rutasUnidades, rutasTarifas } = require('./catalogos');
const { rutasCotizaciones, rutasPublico } = require('./cotizaciones');
const { rutasServicios } = require('./servicios');
const { rutasReportes, rutasBuscar } = require('./reportes');
const { rutasConfig } = require('./config');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// PDF publico de cotizaciones (liga que se comparte por WhatsApp/correo)
app.use(rutasPublico);

// API interna
app.use('/api/auth', rutasAuth);
app.use('/api/usuarios', rutasUsuarios);
app.use('/api/empresas', rutasEmpresas);
app.use('/api/contactos', rutasContactos);
app.use('/api/actividades', rutasActividades);
app.use('/api/tareas', rutasTareas);
app.use('/api/rutas', rutasRutas);
app.use('/api/unidades', rutasUnidades);
app.use('/api/tarifas', rutasTarifas);
app.use('/api/cotizaciones', rutasCotizaciones);
app.use('/api/servicios', rutasServicios);
app.use('/api/reportes', rutasReportes);
app.use('/api/buscar', rutasBuscar);
app.use('/api/configuracion', rutasConfig);

app.get('/api/salud', (req, res) => res.json({ ok: true, sistema: 'tauro-crm' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`CRM Fletes Tauro escuchando en http://localhost:${PORT}`);
});
