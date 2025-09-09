const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 39,
    match: /^[a-z0-9-]+$/
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  bio: {
    type: String,
    maxlength: 500,
    default: ''
  },
  avatar: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    maxlength: 100,
    default: ''
  },
  website: {
    type: String,
    maxlength: 200,
    default: ''
  },
  company: {
    type: String,
    maxlength: 100,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  repositories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repository'
  }],
  starredRepositories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repository'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.virtual('followerCount').get(function() {
  return this.followers.length;
});

userSchema.virtual('followingCount').get(function() {
  return this.following.length;
});

userSchema.virtual('repositoryCount').get(function() {
  return this.repositories ? this.repositories.length + 1 : 0;
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to get public profile
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    fullName: this.fullName,
    bio: this.bio,
    avatar: this.avatar,
    location: this.location,
    website: this.website,
    company: this.company,
    isVerified: this.isVerified,
    followerCount: this.followerCount,
    followingCount: this.followingCount,
    repositoryCount: this.repositoryCount,
    createdAt: this.createdAt
  };
};

// Indexes for better query performance
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ 'followers': 1 });
userSchema.index({ 'following': 1 });

module.exports = mongoose.model('User', userSchema);
