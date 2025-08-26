const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, validationResult } = require('express-validator');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/assets/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
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

// Create Asset
router.post('/', [auth, upload.array('images', 10)], async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      capacity,
      address,
      city,
      state,
      pincode,
      amenities,
      hourlyPrice,
      dailyPrice,
      weeklyPrice,
      monthlyPrice,
      availableDays,
      startTime,
      endTime,
      cancellationPolicy,
      rules
    } = req.body;

    const images = req.files ? req.files.map(file => ({
      url: `/uploads/assets/${file.filename}`,
      caption: ''
    })) : [];

    const asset = new Asset({
      partner: req.user.id,
      title,
      description,
      type,
      capacity: parseInt(capacity),
      location: {
        address,
        city,
        state,
        pincode
      },
      amenities: JSON.parse(amenities || '[]'),
      pricing: {
        hourly: hourlyPrice ? parseFloat(hourlyPrice) : undefined,
        daily: dailyPrice ? parseFloat(dailyPrice) : undefined,
        weekly: weeklyPrice ? parseFloat(weeklyPrice) : undefined,
        monthly: monthlyPrice ? parseFloat(monthlyPrice) : undefined
      },
      availability: {
        days: JSON.parse(availableDays || '[]'),
        hours: {
          start: startTime,
          end: endTime
        }
      },
      images,
      policies: {
        cancellation: cancellationPolicy,
        rules: JSON.parse(rules || '[]')
      }
    });

    await asset.save();
    res.status(201).json(asset);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Get Partner's Assets
router.get('/my-assets', auth, async (req, res) => {
  try {
    const assets = await Asset.find({ partner: req.user.id }).sort({ createdAt: -1 });
    res.json(assets);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Get All Approved Assets (Public)
router.get('/public', async (req, res) => {
  try {
    const { type, city, minPrice, maxPrice, page = 1, limit = 12 } = req.query;
    
    let query = { status: 'approved', isActive: true };
    
    if (type) query.type = type;
    if (city) query['location.city'] = new RegExp(city, 'i');
    if (minPrice || maxPrice) {
      query.$or = [];
      ['hourly', 'daily', 'weekly', 'monthly'].forEach(period => {
        let priceQuery = {};
        if (minPrice) priceQuery[`pricing.${period}`] = { $gte: parseFloat(minPrice) };
        if (maxPrice) {
          if (priceQuery[`pricing.${period}`]) {
            priceQuery[`pricing.${period}`].$lte = parseFloat(maxPrice);
          } else {
            priceQuery[`pricing.${period}`] = { $lte: parseFloat(maxPrice) };
          }
        }
        query.$or.push(priceQuery);
      });
    }

    const assets = await Asset.find(query)
      .populate('partner', 'name profile.businessName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Asset.countDocuments(query);
    
    res.json({
      assets,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Update Asset
router.put('/:id', auth, async (req, res) => {
  try {
    let asset = await Asset.findById(req.params.id);
    
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    if (asset.partner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    asset = await Asset.findByIdAndUpdate(
      req.params.id,
      { $set: req.body, updatedAt: Date.now() },
      { new: true }
    );

    res.json(asset);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Delete Asset
router.delete('/:id', auth, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    if (asset.partner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await Asset.findByIdAndDelete(req.params.id);
    res.json({ message: 'Asset deleted' });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
