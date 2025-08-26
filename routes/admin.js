const express = require('express');
const User = require('../models/User');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// Get All Partners (Admin only)
router.get('/partners', [auth, adminAuth], async (req, res) => {
  try {
    const partners = await User.find({ role: 'partner' }).select('-password').sort({ createdAt: -1 });
    res.json(partners);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Approve/Reject Partner
router.put('/partners/:id/status', [auth, adminAuth], async (req, res) => {
  try {
    const { isApproved } = req.body;
    
    const partner = await User.findByIdAndUpdate(
      req.params.id,
      { isApproved },
      { new: true }
    ).select('-password');

    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' });
    }

    res.json(partner);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Get All Assets (Admin only)
router.get('/assets', [auth, adminAuth], async (req, res) => {
  try {
    const assets = await Asset.find().populate('partner', 'name email profile.businessName').sort({ createdAt: -1 });
    res.json(assets);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Approve/Reject Asset
router.put('/assets/:id/status', [auth, adminAuth], async (req, res) => {
  try {
    const { status } = req.body;
    
    const asset = await Asset.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('partner', 'name email profile.businessName');

    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    res.json(asset);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Dashboard Stats
router.get('/stats', [auth, adminAuth], async (req, res) => {
  try {
    const totalPartners = await User.countDocuments({ role: 'partner' });
    const approvedPartners = await User.countDocuments({ role: 'partner', isApproved: true });
    const pendingPartners = await User.countDocuments({ role: 'partner', isApproved: false });
    
    const totalAssets = await Asset.countDocuments();
    const approvedAssets = await Asset.countDocuments({ status: 'approved' });
    const pendingAssets = await Asset.countDocuments({ status: 'pending' });
    
    const assetsByType = await Asset.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    res.json({
      partners: {
        total: totalPartners,
        approved: approvedPartners,
        pending: pendingPartners
      },
      assets: {
        total: totalAssets,
        approved: approvedAssets,
        pending: pendingAssets
      },
      assetsByType
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;