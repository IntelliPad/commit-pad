const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const Repository = require('../models/Repository');
const { authenticateToken, checkUserAccess } = require('../middleware/auth');

const router = express.Router();

/**
 * @route GET /api/users
 * @desc Get users with filtering and pagination
 * @access Public
 */
router.get('/', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .isString()
    .withMessage('Search query must be a string'),
  query('sort')
    .optional()
    .isIn(['username', 'created', 'repositories', 'followers'])
    .withMessage('Sort must be one of: username, created, repositories, followers'),
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be either asc or desc')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      search,
      sort = 'username',
      order = 'asc'
    } = req.query;

    // Build filter object
    const filter = { isPublic: true };

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { bio: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    let sortObj = {};
    switch (sort) {
      case 'username':
        sortObj.username = order === 'asc' ? 1 : -1;
        break;
      case 'created':
        sortObj.createdAt = order === 'asc' ? 1 : -1;
        break;
      case 'repositories':
        sortObj.repositoryCount = order === 'asc' ? 1 : -1;
        break;
      case 'followers':
        sortObj.followerCount = order === 'asc' ? 1 : -1;
        break;
      default:
        sortObj.username = 1;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    
    const users = await User.find(filter)
      .select('username fullName bio avatar location company followerCount followingCount repositoryCount createdAt')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('User retrieval error:', error);
    res.status(500).json({
      error: 'User retrieval failed',
      message: 'An error occurred while retrieving users. Please try again.'
    });
  }
});

/**
 * @route GET /api/users/:username
 * @desc Get a specific user by username
 * @access Public (if public profile) or Private (if own profile)
 */
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const user = await User.findOne({ username })
      .populate('followers', 'username fullName avatar')
      .populate('following', 'username fullName avatar')
      .populate('repositories', 'name description isPrivate language starCount forkCount createdAt')
      .populate('starredRepositories', 'name description isPrivate language starCount forkCount createdAt');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Check if user is viewing their own profile
    const isOwnProfile = req.user && req.user._id.toString() === user._id.toString();

    // If profile is private and not own profile, return 404
    if (!user.isPublic && !isOwnProfile) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Return appropriate data based on access level
    if (isOwnProfile) {
      // Full profile for own user
      res.json({
        user: {
          ...user.getPublicProfile(),
          email: user.email,
          isPublic: user.isPublic
        },
        followers: user.followers,
        following: user.following,
        repositories: user.repositories,
        starredRepositories: user.starredRepositories
      });
    } else {
      // Public profile for other users
      res.json({
        user: user.getPublicProfile(),
        followers: user.followers,
        following: user.following,
        repositories: user.repositories.filter(repo => !repo.isPrivate),
        starredRepositories: user.starredRepositories.filter(repo => !repo.isPrivate)
      });
    }

  } catch (error) {
    console.error('User retrieval error:', error);
    res.status(500).json({
      error: 'User retrieval failed',
      message: 'An error occurred while retrieving the user. Please try again.'
    });
  }
});

/**
 * @route PUT /api/users/:userId
 * @desc Update user profile
 * @access Private (own profile only)
 */
router.put('/:userId', [
  authenticateToken,
  checkUserAccess,
  body('fullName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('Full name must be 1-100 characters'),
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio must be less than 500 characters'),
  body('location')
    .optional()
    .isLength({ max: 100 })
    .trim()
    .withMessage('Location must be less than 100 characters'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Website must be a valid URL'),
  body('company')
    .optional()
    .isLength({ max: 100 })
    .trim()
    .withMessage('Company must be less than 100 characters'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean value')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input data',
        details: errors.array()
      });
    }

    const { userId } = req.params;
    const { fullName, bio, location, website, company, isPublic } = req.body;

    // Ensure user can only update their own profile
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own profile'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Update user fields
    if (fullName !== undefined) user.fullName = fullName;
    if (bio !== undefined) user.bio = bio;
    if (location !== undefined) user.location = location;
    if (website !== undefined) user.website = website;
    if (company !== undefined) user.company = company;
    if (isPublic !== undefined) user.isPublic = isPublic;

    user.updatedAt = new Date();
    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      error: 'Profile update failed',
      message: 'An error occurred while updating your profile. Please try again.'
    });
  }
});

/**
 * @route POST /api/users/:userId/follow
 * @desc Follow/unfollow a user
 * @access Private
 */
router.post('/:userId/follow', [
  authenticateToken,
  checkUserAccess
], async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user._id;

    // Users cannot follow themselves
    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({
        error: 'Invalid operation',
        message: 'You cannot follow yourself'
      });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    const currentUser = await User.findById(currentUserId);
    const isFollowing = currentUser.following.some(id => id.toString() === targetUserId);

    if (isFollowing) {
      // Unfollow user
      currentUser.following = currentUser.following.filter(id => id.toString() !== targetUserId);
      targetUser.followers = targetUser.followers.filter(id => id.toString() !== currentUserId.toString());
    } else {
      // Follow user
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
    }

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.json({
      message: isFollowing ? 'User unfollowed successfully' : 'User followed successfully',
      isFollowing: !isFollowing,
      followerCount: targetUser.followers.length,
      followingCount: currentUser.following.length
    });

  } catch (error) {
    console.error('Follow operation error:', error);
    res.status(500).json({
      error: 'Follow operation failed',
      message: 'An error occurred while following/unfollowing the user. Please try again.'
    });
  }
});

/**
 * @route GET /api/users/:userId/followers
 * @desc Get user's followers
 * @access Public (if public profile) or Private (if own profile)
 */
router.get('/:userId/followers', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Check access
    const isOwnProfile = req.user && req.user._id.toString() === userId;
    if (!user.isPublic && !isOwnProfile) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    const skip = (page - 1) * limit;
    const followers = await User.find({ _id: { $in: user.followers } })
      .select('username fullName avatar bio location company')
      .skip(skip)
      .limit(parseInt(limit));

    const total = user.followers.length;
    const totalPages = Math.ceil(total / limit);

    res.json({
      followers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Followers retrieval error:', error);
    res.status(500).json({
      error: 'Followers retrieval failed',
      message: 'An error occurred while retrieving followers. Please try again.'
    });
  }
});

/**
 * @route GET /api/users/:userId/following
 * @desc Get users that the specified user is following
 * @access Public (if public profile) or Private (if own profile)
 */
router.get('/:userId/following', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Check access
    const isOwnProfile = req.user && req.user._id.toString() === userId;
    if (!user.isPublic && !isOwnProfile) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    const skip = (page - 1) * limit;
    const following = await User.find({ _id: { $in: user.following } })
      .select('username fullName avatar bio location company')
      .skip(skip)
      .limit(parseInt(limit));

    const total = user.following.length;
    const totalPages = Math.ceil(total / limit);

    res.json({
      following,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Following retrieval error:', error);
    res.status(500).json({
      error: 'Following retrieval failed',
      message: 'An error occurred while retrieving following users. Please try again.'
    });
  }
});

/**
 * @route GET /api/users/:userId/repositories
 * @desc Get user's repositories
 * @access Public (if public profile) or Private (if own profile)
 */
router.get('/:userId/repositories', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, type = 'all' } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    // Check access
    const isOwnProfile = req.user && req.user._id.toString() === userId;
    if (!user.isPublic && !isOwnProfile) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    let repositories;
    let total;

    if (type === 'starred') {
      // Get starred repositories
      const filter = isOwnProfile ? { _id: { $in: user.starredRepositories } } : { _id: { $in: user.starredRepositories }, isPrivate: false };
      repositories = await Repository.find(filter)
        .populate('owner', 'username fullName avatar')
        .select('name description isPrivate language starCount forkCount createdAt')
        .sort({ createdAt: -1 });
      total = repositories.length;
    } else {
      // Get owned repositories
      const filter = isOwnProfile ? { owner: userId } : { owner: userId, isPrivate: false };
      const skip = (page - 1) * limit;
      
      repositories = await Repository.find(filter)
        .populate('owner', 'username fullName avatar')
        .select('name description isPrivate language starCount forkCount createdAt')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      total = await Repository.countDocuments(filter);
    }

    const totalPages = Math.ceil(total / limit);

    res.json({
      repositories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('User repositories retrieval error:', error);
    res.status(500).json({
      error: 'Repositories retrieval failed',
      message: 'An error occurred while retrieving repositories. Please try again.'
    });
  }
});

module.exports = router;
