const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['partner', 'admin'],
    default: 'partner'
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  profile: {
    phone: String,
    address: String,
    businessName: String,
    businessType: {
      type: String,
      enum: ['coworking_space', 'home_owner', 'hotel', 'commercial_space', 'other']
    },
    documents: [{
      type: String,
      url: String
    }]
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);