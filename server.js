const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Load models
const User = require('./models/User');
const Asset = require('./models/Asset');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB Atlas connected successfully!');
  console.log('📊 Database: innerspace');
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.error('Please check your connection string and network access settings');
  process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected successfully!');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

// Admin Login Route
app.post('/api/auth/admin-login', async (req, res) => {
    const { email, password } = req.body;

    // Check for hardcoded admin credentials
    if (email === 'admin@innerspace.com' && password === 'admin') {
        try {
            // Find admin user by email
            let adminUser = await User.findOne({ email: 'admin@innerspace.com' });

            // If the user doesn't exist, create them
            if (!adminUser) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash('admin', salt);
                adminUser = new User({
                    name: 'Admin',
                    email: 'admin@innerspace.com',
                    password: hashedPassword,
                    role: 'admin',
                    isApproved: true
                });
                await adminUser.save();
                console.log('✅ Admin user created successfully');
            }

            const payload = {
                user: {
                    id: adminUser.id,
                    role: adminUser.role
                }
            };

            jwt.sign(
                payload,
                process.env.JWT_SECRET || 'fallback_secret',
                { expiresIn: '1h' },
                (err, token) => {
                    if (err) throw err;
                    res.json({
                        token,
                        user: {
                            id: adminUser.id,
                            name: adminUser.name,
                            email: adminUser.email,
                            role: adminUser.role
                        }
                    });
                }
            );

        } catch (error) {
            console.error(error.message);
            res.status(500).send('Server error');
        }
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

// Import and use routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/partners', require('./routes/partners'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/api/whatsapp', require('./routes/whatsapp')); // WhatsApp booking route

// Serve static files and HTML pages
app.get('/admin-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 Server started on port ${PORT}`);
    console.log(`📱 WhatsApp webhook: http://localhost:${PORT}/api/whatsapp/webhook`);
    console.log(`🏠 Frontend: http://localhost:${PORT}`);
    console.log(`👨‍💼 Admin Dashboard: http://localhost:${PORT}/admin-dashboard`);
    console.log(`\n💡 Tip: Use ngrok to expose webhook for WhatsApp testing`);
});