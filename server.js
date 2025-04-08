// Importación de módulos requeridos
const express = require('express'); // Framework para crear el servidor
const mysql = require('mysql2'); // Cliente MySQL para interactuar con la base de datos
const bodyParser = require('body-parser'); // Middleware para parsear cuerpos de solicitudes
const cors = require('cors'); // Middleware para habilitar CORS

// Inicialización de la aplicación Express
const app = express();
const port = 3000; // Puerto donde correrá el servidor

// Configuración de middlewares
app.use(bodyParser.json()); // Para parsear solicitudes con cuerpo en formato JSON
app.use(cors()); // Habilita CORS para todas las rutas

/**
 * Configuración de la conexión a la base de datos MySQL
 * @type {mysql.Connection}
 */
const connection = mysql.createConnection({
  host: 'localhost', // Servidor de la base de datos
  user: 'root', // Usuario de la base de datos
  password: '1212', // Contraseña del usuario
  database: 'asistencia' // Nombre de la base de datos
});

// Establecimiento de la conexión a la base de datos
connection.connect((err) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
    return;
  }
  console.log('Conexión establecida con la base de datos');
});

// =============================================
// ENDPOINTS DE LA API
// =============================================

/**
 * Registro de un nuevo profesor
 * @route POST /registro
 * @param {string} nombre - Nombre completo del profesor
 * @param {string} email - Email del profesor
 * @param {string} password - Contraseña del profesor
 * @returns {Object} Mensaje de éxito y ID del profesor registrado
 */
app.post('/registro', (req, res) => {
  const { nombre, email, password } = req.body;

  // Validación de campos requeridos
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  // Query para insertar nuevo profesor
  const query = 'INSERT INTO Profesores (nombre, email, password) VALUES (?, ?, ?)';
  
  // Ejecución de la query
  connection.query(query, [nombre, email, password], (err, results) => {
    if (err) {
      console.error('Error registrando profesor:', err);
      return res.status(500).json({ error: 'Error al registrar el profesor' });
    }
    
    // Respuesta exitosa
    res.status(201).json({ 
      message: 'Profesor registrado con éxito',
      id_profesor: results.insertId // Retorna el ID generado
    });
  });
});

/**
 * Asignación de grados y alumnos iniciales a un profesor
 * @route POST /asignar-grados-iniciales
 * @param {number} id_profesor - ID del profesor al que se asignarán los grados
 * @returns {Object} Resultado de la operación con conteo de grados y alumnos creados
 */
app.post('/asignar-grados-iniciales', (req, res) => {
  const { id_profesor } = req.body;

  // Inicia una transacción para asegurar la integridad de los datos
  connection.beginTransaction(err => {
    if (err) return res.status(500).json({ error: 'Error iniciando transacción' });

    // Grados iniciales a crear
    const gradosIniciales = ['Primero', 'Segundo', 'Tercero'];
    const alumnosPorGrado = 3; // Cantidad de alumnos por cada grado

    // Insertar grados (operación asincrónica)
    const insertGrados = gradosIniciales.map(nombreGrado => {
      return new Promise((resolve, reject) => {
        const query = 'INSERT INTO Grados (nombre, id_profesor) VALUES (?, ?)';
        connection.query(query, [nombreGrado, id_profesor], (err, results) => {
          if (err) return reject(err);
          resolve(results.insertId); // Resuelve con el ID del grado insertado
        });
      });
    });

    // Procesamiento de todas las inserciones de grados
    Promise.all(insertGrados)
      .then(gradoIds => {
        // Insertar alumnos para cada grado creado
        const insertAlumnos = gradoIds.flatMap(id_grado => {
          const alumnos = [];
          for (let i = 1; i <= alumnosPorGrado; i++) {
            alumnos.push(
              new Promise((resolve, reject) => {
                const query = 'INSERT INTO Estudiantes (nombre, id_grado) VALUES (?, ?)';
                connection.query(query, [
                  `Alumno ${i} de Grado ${gradoIds.indexOf(id_grado)+1}`, 
                  id_grado
                ], (err, results) => {
                  if (err) return reject(err);
                  resolve(results);
                });
              })
            );
          }
          return alumnos;
        });

        // Procesamiento de todas las inserciones de alumnos
        Promise.all(insertAlumnos)
          .then(() => {
            // Confirmar la transacción si todo fue exitoso
            connection.commit(err => {
              if (err) {
                connection.rollback(); // Revierte en caso de error
                return res.status(500).json({ error: 'Error al confirmar transacción' });
              }
              // Respuesta exitosa
              res.json({ 
                success: true, 
                grados_creados: gradoIds.length, 
                alumnos_creados: gradoIds.length * alumnosPorGrado 
              });
            });
          })
          .catch(err => {
            connection.rollback(); // Revierte si hay error al insertar alumnos
            throw err;
          });
      })
      .catch(err => {
        connection.rollback(); // Revierte si hay error al insertar grados
        res.status(500).json({ error: 'Error al asignar grados iniciales' });
      });
  });
});

/**
 * Autenticación de profesores
 * @route POST /login
 * @param {string} email - Email del profesor
 * @param {string} password - Contraseña del profesor
 * @returns {Object} Datos del profesor sin información sensible
 */
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Validación de campos requeridos
  if (!email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  // Query para buscar profesor (no retorna la contraseña)
  const query = 'SELECT id_profesor, nombre, email FROM Profesores WHERE email = ? AND password = ?';
  
  connection.query(query, [email, password], (err, results) => {
    if (err) {
      console.error('Error en el login:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    // Si no se encontró el profesor
    if (results.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Respuesta exitosa
    res.status(200).json({ 
      message: 'Login exitoso',
      profesor: results[0] // Retorna los datos del profesor
    });
  });
});

/**
 * Obtener los grados asignados a un profesor
 * @route GET /grados/:id_profesor
 * @param {number} id_profesor - ID del profesor
 * @returns {Array} Lista de grados asignados al profesor
 */
app.get('/grados/:id_profesor', (req, res) => {
  const { id_profesor } = req.params;
  
  // Query para obtener grados
  const query = 'SELECT * FROM Grados WHERE id_profesor = ?';
  
  connection.query(query, [id_profesor], (err, results) => {
    if (err) {
      console.error('Error obteniendo grados:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }
    res.status(200).json(results); // Retorna los grados encontrados
  });
});

/**
 * Obtener estudiantes de un grado específico
 * @route GET /estudiantes/:id_grado
 * @param {number} id_grado - ID del grado
 * @returns {Array} Lista de estudiantes del grado
 */
app.get('/estudiantes/:id_grado', (req, res) => {
  const { id_grado } = req.params;
  
  // Query para obtener estudiantes
  const query = 'SELECT * FROM Estudiantes WHERE id_grado = ?';
  
  connection.query(query, [id_grado], (err, results) => {
    if (err) {
      console.error('Error obteniendo estudiantes:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }
    res.status(200).json(results); // Retorna los estudiantes encontrados
  });
});

/**
 * Registrar asistencia de un estudiante
 * @route POST /asistencia
 * @param {number} id_estudiante - ID del estudiante
 * @param {number} id_profesor - ID del profesor que registra
 * @param {number} id_grado - ID del grado
 * @param {boolean} presente - Estado de asistencia
 * @returns {Object} Confirmación del registro con fecha y estado
 */
app.post('/asistencia', (req, res) => {
  const { id_estudiante, id_profesor, id_grado, presente } = req.body;

  // Validación de campos requeridos
  if (!id_estudiante || !id_profesor || !id_grado || presente === undefined) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  // Genera la fecha actual en formato MySQL
  const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Query para insertar registro de asistencia
  const query = `
    INSERT INTO Asistencia (fecha, id_profesor, id_estudiante, id_grado, presente)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  // Ejecución de la query
  connection.query(query, [fecha, id_profesor, id_estudiante, id_grado, presente], (err, results) => {
    if (err) {
      console.error('Error guardando asistencia:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }
    
    // Respuesta exitosa
    res.status(201).json({ 
      message: 'Asistencia registrada correctamente',
      fecha: fecha,
      presente: presente
    });
  });
});

// Inicia el servidor en el puerto especificado
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});