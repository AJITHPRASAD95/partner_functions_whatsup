const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Load models
const User = require('./models/User');
const Asset = require('./models/Asset');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create 'uploads' directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/innerspace', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected...'))
.catch(err => console.log('MongoDB connection error:', err));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit per file
        files: 10 // Maximum 10 files
    }
});

// Admin Login Route
app.post('/api/auth/admin-login', async (req, res) => {
    const { email, password } = req.body;

    if (email === 'admin@innerspace.com' && password === 'admin') {
        try {
            let adminUser = await User.findOne({ email: 'admin@innerspace.com' });
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
                { expiresIn: '24h' },
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
            console.error('Error during admin login:', error);
            res.status(500).json({ message: 'Server error' });
        }
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

// New Partner Registration and Space Listing Route
app.post('/api/auth/register-with-space', upload.array('images', 10), async (req, res) => {
    try {
        const {
            email, password, hostName, dob, businessName, spaceType,
            title, description, privacyType,
            address, city, state, pincode,
            hourlyRate, dailyRate, weeklyRate, monthlyRate,
            workspaceTypes, // This will be a comma-separated string from frontend
            type // Single type for the asset
        } = req.body;

        console.log('Registration data received:', req.body);
        console.log('Files received:', req.files);

        // Validation with detailed error reporting
        const missingFields = [];
        if (!email) missingFields.push('email');
        if (!password) missingFields.push('password');
        if (!hostName) missingFields.push('hostName');
        if (!businessName) missingFields.push('businessName');
        if (!title) missingFields.push('title');
        if (!description) missingFields.push('description');

        if (missingFields.length > 0) {
            console.log('Missing required fields:', missingFields);
            return res.status(400).json({ 
                message: `Required fields are missing: ${missingFields.join(', ')}`,
                missingFields 
            });
        }

        // Check if user already exists
        let existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        // Create new user (partner)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = new User({
            name: hostName,
            email,
            password: hashedPassword,
            role: 'partner',
            isApproved: false,
            profile: {
                businessName,
                businessType: spaceType || 'coworking_space'
            }
        });

        // Add DOB if provided
        if (dob) {
            newUser.profile.dob = new Date(dob);
        }

        await newUser.save();
        console.log('User created successfully:', newUser.id);

        // Prepare image paths for the database
        const images = req.files ? req.files.map(file => ({
            url: `/uploads/${file.filename}`,
            caption: ''
        })) : [];

        // Determine workspace types - handle both comma-separated string and array
        let assetTypes = [];
        if (workspaceTypes) {
            if (typeof workspaceTypes === 'string') {
                assetTypes = workspaceTypes.split(',').map(t => t.trim()).filter(t => t);
            } else if (Array.isArray(workspaceTypes)) {
                assetTypes = workspaceTypes;
            }
        }

        // Use the first workspace type as the main type, fallback to 'desk_space'
        const mainType = type || assetTypes[0] || 'desk_space';

        // Create new asset (the space)
        const newAsset = new Asset({
            partner: newUser._id,
            title,
            description,
            type: mainType,
            capacity: 1, // Default capacity
            location: {
                address: address || '',
                city: city || '',
                state: state || '',
                pincode: pincode || ''
            },
            pricing: {
                hourly: hourlyRate ? parseFloat(hourlyRate) : undefined,
                daily: dailyRate ? parseFloat(dailyRate) : undefined,
                weekly: weeklyRate ? parseFloat(weeklyRate) : undefined,
                monthly: monthlyRate ? parseFloat(monthlyRate) : undefined,
                currency: 'INR'
            },
            images,
            status: 'pending',
            isActive: false, // Will be activated after admin approval
            amenities: [], // Can be extended later
            availability: {
                days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                hours: {
                    start: '09:00',
                    end: '18:00'
                }
            },
            policies: {
                cancellation: 'Standard cancellation policy applies',
                rules: ['No smoking', 'Maintain cleanliness', 'Respect other users']
            }
        });

        // Add privacy type as metadata if provided
        if (privacyType) {
            newAsset.amenities.push(`Privacy: ${privacyType}`);
        }

        await newAsset.save();
        console.log('Asset created successfully:', newAsset.id);

        res.status(201).json({
            message: 'Registration successful. Your listing is pending review.',
            userId: newUser.id,
            assetId: newAsset.id,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                isApproved: newUser.isApproved
            }
        });

    } catch (error) {
        console.error('Error during partner registration:', error);
        
        // Clean up uploaded files if registration fails
        if (req.files) {
            req.files.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.error('Error deleting file:', err);
                });
            });
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Validation error', 
                details: Object.values(error.errors).map(e => e.message)
            });
        }

        res.status(500).json({ message: 'Server error during registration' });
    }
});

// Partner Login Route
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check if user is a partner
        if (user.role !== 'partner') {
            return res.status(401).json({ message: 'Access denied. Partners only.' });
        }

        const payload = {
            user: {
                id: user.id,
                role: user.role
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '24h' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        isApproved: user.isApproved
                    }
                });
            }
        );
    } catch (error) {
        console.error('Error during partner login:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Authentication middleware
const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        req.user = decoded.user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

// Admin middleware
const adminAuth = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// Import and use other routes
app.use('/api/partners', require('./routes/partners'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/admin', require('./routes/admin'));

// Serve static files and HTML pages
app.get('/admin-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/partner-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'partner-dashboard.html'));
});

app.get('/partner-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'partner-login.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File size too large. Maximum 5MB per file.' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ message: 'Too many files. Maximum 10 files allowed.' });
        }
    }
    
    if (error.message === 'Only image files are allowed!') {
        return res.status(400).json({ message: 'Only image files are allowed.' });
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin-dashboard`);
    console.log(`Partner login: http://localhost:${PORT}/partner-login`);
});