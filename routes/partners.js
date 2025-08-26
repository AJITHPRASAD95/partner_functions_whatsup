// ==================== ROUTES/PARTNERS.JS ====================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// @route   GET /api/partners/me
// @desc    Get the profile of the logged-in partner
// @access  Private (Partner)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT /api/partners/profile
// @desc    Update partner profile information
// @access  Private (Partner)
router.put('/profile', auth, async (req, res) => {
  const { phone, address, businessName, businessType } = req.body;
  const profileFields = {
    profile: {
      phone,
      address,
      businessName,
      businessType
    }
  };

  try {
    let user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.profile = { ...user.profile, ...profileFields.profile };
    await user.save();
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;