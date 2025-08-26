const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Asset = require('../models/Asset');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/assets/');
  },
  filename: function (req, file, cb) {
    cb(
      null,
      Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname)
    );
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// @route   POST /api/onboarding/register-with-space
// @desc    Register a new partner and their space (without transactions)
// @access  Public
router.post('/register-with-space', upload.array('images', 10), async (req, res) => {
  try {
    const {
      businessName,
      businessType,
      name,
      email,
      password,
      phone,
      address,
      city,
      state,
      pincode,
      title,
      description,
      type,
      capacity,
      hourlyPrice,
      dailyPrice,
      weeklyPrice,
      monthlyPrice
    } = req.body;

    // 1. Create the new User
    let user = new User({
      name,
      email,
      password,
      profile: {
        phone: phone || '',
        address: address || '',
        businessName,
        businessType
      },
      isApproved: false // Default to pending approval
    });

    await user.save();

    // Process uploaded images
    const images = req.files
      ? req.files.map(file => ({
          url: `/uploads/assets/${file.filename}`,
          caption: ''
        }))
      : [];

    // 2. Create the new Asset and link it to the User
    const asset = new Asset({
      partner: user._id,
      title,
      description,
      type,
      capacity: parseInt(capacity) || 1,
      location: {
        address,
        city,
        state,
        pincode
      },
      pricing: {
        hourly: hourlyPrice ? parseFloat(hourlyPrice) : undefined,
        daily: dailyPrice ? parseFloat(dailyPrice) : undefined,
        weekly: weeklyPrice ? parseFloat(weeklyPrice) : undefined,
        monthly: monthlyPrice ? parseFloat(monthlyPrice) : undefined,
        currency: 'INR'
      },
      images,
      status: 'pending',
      availability: {
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        hours: {
          start: '09:00',
          end: '18:00'
        }
      }
    });

    await asset.save();

    res.status(201).json({
      message: 'Registration successful! Awaiting admin approval.',
      userId: user._id,
      assetId: asset._id
    });
  } catch (error) {
    console.error('Registration error:', error.message);

    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists.' });
    }

    res.status(500).json({ message: 'Server error during registration.' });
  }
});

module.exports = router;
