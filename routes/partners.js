// ==================== ROUTES/PARTNERS.JS ====================
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Booking = require('../models/Booking');

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

// @route   GET /api/partners/bookings
// @desc    Get all bookings for the logged-in partner's assets
// @access  Private (Partner)
router.get('/bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ partner: req.user.id })
      .populate('asset', 'title type location')
      .sort({ createdAt: -1 });
    
    res.json(bookings);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/partners/bookings/stats
// @desc    Get booking statistics for the partner
// @access  Private (Partner)
router.get('/bookings/stats', auth, async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments({ partner: req.user.id });
    const confirmedBookings = await Booking.countDocuments({ 
      partner: req.user.id, 
      status: 'confirmed' 
    });
    const pendingBookings = await Booking.countDocuments({ 
      partner: req.user.id, 
      status: 'pending' 
    });
    
    // Get upcoming bookings (assuming date is stored as string in DD/MM/YYYY format)
    const today = new Date();
    const allBookings = await Booking.find({ partner: req.user.id });
    const upcomingBookings = allBookings.filter(booking => {
      try {
        const [day, month, year] = booking.bookingDetails.date.split('/');
        const bookingDate = new Date(`${year}-${month}-${day}`);
        return bookingDate >= today && (booking.status === 'confirmed' || booking.status === 'pending');
      } catch (error) {
        return false;
      }
    }).length;
    
    res.json({
      total: totalBookings,
      confirmed: confirmedBookings,
      pending: pendingBookings,
      upcoming: upcomingBookings
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/partners/bookings/:id
// @desc    Get a specific booking by ID
// @access  Private (Partner)
router.get('/bookings/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('asset', 'title type location pricing')
      .populate('partner', 'name email profile.businessName');
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if the booking belongs to the partner
    if (booking.partner._id.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    res.json(booking);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT /api/partners/bookings/:id/status
// @desc    Update booking status (cancel, complete, etc.)
// @access  Private (Partner)
router.put('/bookings/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if the booking belongs to the partner
    if (booking.partner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    booking.status = status;
    booking.updatedAt = Date.now();
    await booking.save();

    const updatedBooking = await Booking.findById(req.params.id)
      .populate('asset', 'title type location');

    res.json(updatedBooking);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
