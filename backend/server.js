const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Database Connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'attendance_tracker'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Initialize database and table
async function initializeDatabase() {
  try {
    console.log('🔌 Attempting to connect to MySQL database...');
    
    // Test database connection first
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });

    console.log('✅ MySQL Server connection successful!');
    
    // Create database if it doesn't exist
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    console.log(`📁 Database '${dbConfig.database}' ready`);
    
    await connection.end();

    // Create table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS Attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employeeName VARCHAR(255) NOT NULL,
        employeeID VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        status ENUM('Present', 'Absent') NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    await pool.execute(createTableQuery);
    console.log('📊 Attendance table created/verified successfully');
    console.log('🎉 Database initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error; // Re-throw to handle in the main function
  }
}

// Test database connection endpoint
app.get('/api/test', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT 1 as test');
    res.json({ 
      message: 'Database connection successful!', 
      test: rows[0].test,
      database: dbConfig.database,
      status: 'connected'
    });
  } catch (error) {
    console.error('Database connection test failed:', error);
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message 
    });
  }
});

// GET all attendance records
app.get('/api/attendance', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM Attendance ORDER BY date DESC, createdAt DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

// POST new attendance record
app.post('/api/attendance', async (req, res) => {
  try {
    const { employeeName, employeeID, date, status } = req.body;
    
    // Validation
    if (!employeeName || !employeeID || !date || !status) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['Present', 'Absent'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Present or Absent' });
    }

    // Check if attendance already exists for this employee on this date
    const [existing] = await pool.execute(
      'SELECT * FROM Attendance WHERE employeeID = ? AND date = ?',
      [employeeID, date]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Attendance already recorded for this employee on the selected date' });
    }

    const query = 'INSERT INTO Attendance (employeeName, employeeID, date, status) VALUES (?, ?, ?, ?)';
    const [result] = await pool.execute(query, [employeeName, employeeID, date, status]);
    
    res.status(201).json({ 
      message: 'Attendance recorded successfully', 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error recording attendance:', error);
    res.status(500).json({ error: 'Failed to record attendance' });
  }
});

// DELETE attendance record
app.delete('/api/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM Attendance WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// GET filtered attendance records
app.get('/api/attendance/filter', async (req, res) => {
  try {
    const { date, employeeName, employeeID } = req.query;
    let query = 'SELECT * FROM Attendance WHERE 1=1';
    const params = [];

    if (date) {
      query += ' AND date = ?';
      params.push(date);
    }

    if (employeeName) {
      query += ' AND employeeName LIKE ?';
      params.push(`%${employeeName}%`);
    }

    if (employeeID) {
      query += ' AND employeeID LIKE ?';
      params.push(`%${employeeID}%`);
    }

    query += ' ORDER BY date DESC, createdAt DESC';

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error filtering attendance:', error);
    res.status(500).json({ error: 'Failed to filter attendance records' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running', 
    timestamp: new Date().toISOString(),
    database: 'Connected',
    version: '1.0.0'
  });
});

// Database connection status endpoint
app.get('/api/db-status', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT 1 as connection_test');
    res.json({ 
      status: 'connected',
      message: 'Database connection is healthy',
      database: dbConfig.database,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'disconnected',
      message: 'Database connection failed',
      error: error.message 
    });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Starting Employee Attendance Tracker...');
    console.log('📍 Environment:', process.env.NODE_ENV || 'development');
    console.log('⚙️  Configuration:', {
      host: dbConfig.host,
      user: dbConfig.user,
      database: dbConfig.database
    });
    
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log('\n✨ ============================================');
      console.log('🎯 EMPLOYEE ATTENDANCE TRACKER STARTED SUCCESSFULLY!');
      console.log('✨ ============================================');
      console.log(`📡 Server URL: http://localhost:${PORT}`);
      console.log(`💾 Database: ${dbConfig.database} @ ${dbConfig.host}`);
      console.log(`👤 DB User: ${dbConfig.user}`);
      console.log('🔗 Available Endpoints:');
      console.log(`   📊 Health: http://localhost:${PORT}/api/health`);
      console.log(`   🧪 DB Test: http://localhost:${PORT}/api/test`);
      console.log(`   💾 DB Status: http://localhost:${PORT}/api/db-status`);
      console.log(`   👥 Attendance: http://localhost:${PORT}/api/attendance`);
      console.log('✨ ============================================\n');
    });
    
  } catch (error) {
    console.error('\n❌ ============================================');
    console.error('🚨 FAILED TO START APPLICATION');
    console.error('❌ ============================================');
    console.error('Error:', error.message);
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Check if MySQL server is running');
    console.error('   2. Verify database credentials in .env file');
    console.error('   3. Ensure database user has proper permissions');
    console.error('❌ ============================================\n');
    process.exit(1);
  }
}

// Start the application
startServer();