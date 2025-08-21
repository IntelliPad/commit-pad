const express = require('express');
const { body, validationResult } = require('express-validator');
const AuthService = require('../services/AuthService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const authService = new AuthService();

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', [
  body('username')
    .isLength({ min: 3, max: 39 })
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Username must be 3-39 characters long and contain only lowercase letters, numbers, and hyphens'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('fullName')
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('Full name is required and must be less than 100 characters')
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

    const result = await authService.registerUser(req.body);

    res.status(201).json({
      message: 'User registered successfully',
      ...result
    });

  } catch (error) {
    console.error('User registration error:', error);
    
    if (error.message === 'Username already exists') {
      return res.status(409).json({
        error: 'Username already exists',
        message: 'This username is already taken. Please choose a different one.'
      });
    }

    if (error.message === 'Email already exists') {
      return res.status(409).json({
        error: 'Email already exists',
        message: 'This email is already registered. Please use a different email or login.'
      });
    }
    
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during user registration. Please try again.'
    });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and return JWT token
 * @access Public
 */
router.post('/login', [
  body('username')
    .notEmpty()
    .withMessage('Username or email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please provide both username/email and password',
        details: errors.array()
      });
    }

    const { username, password } = req.body;

    const result = await authService.loginUser(username, password);

    res.json({
      message: 'Login successful',
      ...result
    });

  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login. Please try again.'
    });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc Refresh JWT token
 * @access Private
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    const result = await authService.refreshToken(user._id);

    res.json({
      message: 'Token refreshed successfully',
      user: user.getPublicProfile(),
      ...result
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: 'An error occurred while refreshing the token. Please try again.'
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (client-side token removal)
 * @access Private
 */
router.post('/logout', authenticateToken, (req, res) => {
  // In JWT-based auth, logout is handled client-side by removing the token
  // This endpoint can be used for logging purposes or future enhancements
  res.json({
    message: 'Logout successful',
    note: 'Please remove the token from your client storage'
  });
});

/**
 * @route GET /api/auth/me
 * @desc Get current authenticated user profile
 * @access Private
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Populate additional data if needed
    const populatedUser = await User.findById(user._id)
      .populate('followers', 'username fullName avatar')
      .populate('following', 'username fullName avatar')
      .populate('repositories', 'name description isPrivate language starCount forkCount')
      .populate('starredRepositories', 'name description isPrivate language starCount forkCount');

    res.json({
      user: populatedUser.getPublicProfile(),
      followers: populatedUser.followers,
      following: populatedUser.following,
      repositories: populatedUser.repositories,
      starredRepositories: populatedUser.starredRepositories
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      error: 'Profile retrieval failed',
      message: 'An error occurred while retrieving your profile. Please try again.'
    });
  }
});

/**
 * @route POST /api/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password', [
  authenticateToken,
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
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

    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    const result = await authService.changePassword(user._id, currentPassword, newPassword);

    res.json({
      message: 'Password changed successfully',
      note: 'Please login again with your new password'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Password change failed',
      message: 'An error occurred while changing your password. Please try again.'
    });
  }
});

/**
 * @route POST /api/auth/forgot-password
 * @desc Send password reset email (placeholder for future implementation)
 * @access Public
 */
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please provide a valid email address',
        details: errors.array()
      });
    }

    const { email } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    // TODO: Implement email sending functionality
    // For now, just return a success message
    res.json({
      message: 'If an account with that email exists, a password reset link has been sent',
      note: 'Password reset functionality is not yet implemented'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: 'Password reset failed',
      message: 'An error occurred while processing your request. Please try again.'
    });
  }
});

module.exports = router;
