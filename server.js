const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Conexión a la base de datos
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1212',
  database: 'asistencia'
});

connection.connect((err) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
    return;
  }
  console.log('Conexión establecida con la base de datos');
});

// Registrar un profesor
app.post('/registro', (req, res) => {
  const { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  const query = 'INSERT INTO Profesores (nombre, email, password) VALUES (?, ?, ?)';
  connection.query(query, [nombre, email, password], (err, results) => {
    if (err) {
      console.error('Error registrando profesor:', err);
      return res.status(500).json({ error: 'Error al registrar el profesor' });
    }
    res.status(201).json({ 
      message: 'Profesor registrado con éxito',
      id_profesor: results.insertId
    });
  });
});

// Asignar grados y alumnos iniciales (MODIFICADO)
app.post('/asignar-grados-iniciales', (req, res) => {
  const { id_profesor } = req.body;

  connection.beginTransaction(err => {
    if (err) return res.status(500).json({ error: 'Error iniciando transacción' });

    const gradosIniciales = ['Primero', 'Segundo', 'Tercero'];
    const alumnosPorGrado = 3;

    // Insertar grados
    const insertGrados = gradosIniciales.map(nombreGrado => {
      return new Promise((resolve, reject) => {
        const query = 'INSERT INTO Grados (nombre, id_profesor) VALUES (?, ?)';
        connection.query(query, [nombreGrado, id_profesor], (err, results) => {
          if (err) return reject(err);
          resolve(results.insertId);
        });
      });
    });

    Promise.all(insertGrados)
      .then(gradoIds => {
        // Insertar alumnos para cada grado
        const insertAlumnos = gradoIds.flatMap(id_grado => {
          const alumnos = [];
          for (let i = 1; i <= alumnosPorGrado; i++) {
            alumnos.push(
              new Promise((resolve, reject) => {
                const query = 'INSERT INTO Estudiantes (nombre, id_grado) VALUES (?, ?)';
                connection.query(query, [`Alumno ${i} de Grado ${gradoIds.indexOf(id_grado)+1}`, id_grado], (err, results) => {
                  if (err) return reject(err);
                  resolve(results);
                });
              })
            );
          }
          return alumnos;
        });

        Promise.all(insertAlumnos)
          .then(() => {
            connection.commit(err => {
              if (err) {
                connection.rollback();
                return res.status(500).json({ error: 'Error al confirmar transacción' });
              }
              res.json({ success: true, grados_creados: gradoIds.length, alumnos_creados: gradoIds.length * alumnosPorGrado });
            });
          })
          .catch(err => {
            connection.rollback();
            throw err;
          });
      })
      .catch(err => {
        connection.rollback();
        res.status(500).json({ error: 'Error al asignar grados iniciales' });
      });
  });
});

// Iniciar sesión (CORREGIDO)
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  const query = 'SELECT id_profesor, nombre, email FROM Profesores WHERE email = ? AND password = ?';
  connection.query(query, [email, password], (err, results) => {
    if (err) {
      console.error('Error en el login:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    res.status(200).json({ 
      message: 'Login exitoso',
      profesor: results[0]
    });
  });
});

// Obtener grados por profesor
app.get('/grados/:id_profesor', (req, res) => {
  const { id_profesor } = req.params;
  const query = 'SELECT * FROM Grados WHERE id_profesor = ?';
  connection.query(query, [id_profesor], (err, results) => {
    if (err) {
      console.error('Error obteniendo grados:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }
    res.status(200).json(results);
  });
});

// Obtener estudiantes por grado
app.get('/estudiantes/:id_grado', (req, res) => {
  const { id_grado } = req.params;
  const query = 'SELECT * FROM Estudiantes WHERE id_grado = ?';
  connection.query(query, [id_grado], (err, results) => {
    if (err) {
      console.error('Error obteniendo estudiantes:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }
    res.status(200).json(results);
  });
});

// Registrar asistencia
app.post('/asistencia', (req, res) => {
  const { id_estudiante, id_profesor, id_grado, presente } = req.body;

  if (!id_estudiante || !id_profesor || !id_grado || presente === undefined) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const query = `
    INSERT INTO Asistencia (fecha, id_profesor, id_estudiante, id_grado, presente)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  connection.query(query, [fecha, id_profesor, id_estudiante, id_grado, presente], (err, results) => {
    if (err) {
      console.error('Error guardando asistencia:', err);
      return res.status(500).json({ error: 'Error en el servidor' });
    }
    res.status(201).json({ 
      message: 'Asistencia registrada correctamente',
      fecha: fecha,
      presente: presente
    });
  });
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});