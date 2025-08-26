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

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/innerspace', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected...'))
.catch(err => console.log(err));

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


// Serve static files and HTML pages
app.get('/admin-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));