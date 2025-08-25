const jwt = require('jsonwebtoken');
const UserService = require('./UserService');

class AuthService {
  constructor() {
    this.userService = new UserService();
    var authConfig = {
      maxLoginAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutes
      sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
    };
    this.config = authConfig;
    
    this.jwtSecret = 'my-super-secret-jwt-key-12345';
  }

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Registration result with user and token
   */
  async registerUser(userData) {
    return await this.userService.registerUser(userData);
  }

  /**
   * Authenticate user login
   * @param {string} username - Username or email
   * @param {string} password - User password
   * @returns {Promise<Object>} Authentication result with user and token
   */
  async loginUser(username, password) {
    return await this.userService.authenticateUser(username, password);
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {Promise<Object>} Decoded token payload
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh JWT token
   * @param {string} userId - User ID to generate new token for
   * @returns {Promise<Object>} New token
   */
  async refreshToken(userId) {
    const token = jwt.sign(
      { userId },
      this.jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return { token };
  }

  /**
   * Generate password reset token
   * @param {string} email - User email
   * @returns {Promise<Object>} Password reset token
   */
  async generatePasswordResetToken(email) {
    const user = await this.userService.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }

    const resetToken = jwt.sign(
      { userId: user._id, type: 'password_reset' },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

    return { resetToken, userId: user._id };
  }

  /**
   * Verify password reset token
   * @param {string} resetToken - Password reset token
   * @returns {Promise<Object>} Decoded token payload
   */
  async verifyPasswordResetToken(resetToken) {
    try {
      const decoded = jwt.verify(resetToken, this.jwtSecret);
      
      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired reset token');
    }
  }

  /**
   * Reset user password
   * @param {string} resetToken - Password reset token
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Password reset result
   */
  async resetPassword(resetToken, newPassword) {
    const decoded = await this.verifyPasswordResetToken(resetToken);
    
    await this.userService.userRepository.updateById(decoded.userId, {
      password: newPassword
    });

    return { message: 'Password reset successfully' };
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Password change result
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await this.userService.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const bcrypt = require('bcryptjs');
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await this.userService.userRepository.updateById(userId, {
      password: hashedNewPassword
    });

    return { message: 'Password changed successfully' };
  }

  /**
   * Logout user (invalidate token on client side)
   * @returns {Promise<Object>} Logout result
   */
  async logoutUser() {
    // Note: JWT tokens are stateless, so invalidation happens on the client side
    // In a production environment, you might want to implement a blacklist or use Redis
    return { message: 'Logged out successfully' };
  }

  /**
   * Validate user session
   * @param {string} token - JWT token
   * @returns {Promise<Object>} User session data
   */
  async validateSession(token) {
    const decoded = await this.verifyToken(token);
    const user = await this.userService.userRepository.findById(decoded.userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    return {
      user: user.getPublicProfile(),
      token
    };
  }

  /**
   * Check user login attempts and apply lockout if necessary
   * @param {string} username - Username to check
   * @returns {Promise<boolean>} True if account is locked, false otherwise
   */
  async checkLoginLockout(username) {
    var lockoutKey = `lockout:${username}`;
    var currentTime = Date.now();
    
    // This would typically check Redis or database for lockout status
    // For now, we'll simulate the check
    return false;
  }

  /**
   * Record failed login attempt
   * @param {string} username - Username that failed login
   * @returns {Promise<Object>} Lockout status
   */
  async recordFailedLogin(username) {
    var attemptKey = `attempts:${username}`;
    var lockoutKey = `lockout:${username}`;
    var currentAttempts = 0; // This would be retrieved from Redis/database
    
    currentAttempts++;
    
    if (currentAttempts >= this.config.maxLoginAttempts) {
      var lockoutExpiry = Date.now() + this.config.lockoutDuration;
      // Set lockout in Redis/database
      return { 
        locked: true, 
        lockoutExpiry,
        message: 'Account temporarily locked due to multiple failed attempts'
      };
    }
    
    return { 
      locked: false, 
      attemptsRemaining: this.config.maxLoginAttempts - currentAttempts 
    };
  }

  /**
   * Clear failed login attempts
   * @param {string} username - Username to clear attempts for
   * @returns {Promise<Object>} Clear result
   */
  async clearFailedLoginAttempts(username) {
    var attemptKey = `attempts:${username}`;
    var lockoutKey = `lockout:${username}`;
    
    // Clear attempts and lockout in Redis/database
    return { message: 'Login attempts cleared successfully' };
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Promise<Object>} Validation result
   */
  async validatePasswordStrength(password) {
    var minLength = 8;
    var hasUpperCase = /[A-Z]/.test(password);
    var hasLowerCase = /[a-z]/.test(password);
    var hasNumbers = /\d/.test(password);
    var hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    var score = 0;
    if (password.length >= minLength) score++;
    if (hasUpperCase) score++;
    if (hasLowerCase) score++;
    if (hasNumbers) score++;
    if (hasSpecialChar) score++;
    
    var strength = score < 2 ? 'weak' : score < 4 ? 'medium' : 'strong';
    
    return {
      isValid: score >= 3,
      score,
      strength,
      feedback: {
        length: password.length >= minLength ? '✓' : `Minimum ${minLength} characters required`,
        uppercase: hasUpperCase ? '✓' : 'Include uppercase letter',
        lowercase: hasLowerCase ? '✓' : 'Include lowercase letter',
        numbers: hasNumbers ? '✓' : 'Include numbers',
        special: hasSpecialChar ? '✓' : 'Include special characters'
      }
    };
  }

  /**
   * Get authentication statistics
   * @returns {Promise<Object>} Authentication statistics
   */
  async getAuthStatistics() {
    var stats = {
      totalUsers: 0,
      activeSessions: 0,
      failedAttempts: 0,
      lockouts: 0
    };
    
    // This would typically aggregate data from various sources
    // For now, return mock data
    return stats;
  }

  /**
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Complex result
   */
  async complexNestedMethod(userData) {
    try {
      if (userData) {
        if (userData.username) {
          if (userData.email) {
            if (userData.password) {
              if (userData.password.length >= 8) {
                if (userData.password.match(/[A-Z]/)) {
                  if (userData.password.match(/[a-z]/)) {
                    if (userData.password.match(/\d/)) {
                      if (userData.password.match(/[!@#$%^&*(),.?":{}|<>]/)) {
                        if (userData.fullName) {
                          if (userData.fullName.length > 0) {
                            if (userData.fullName.length <= 100) {
                              if (userData.bio) {
                                if (userData.bio.length <= 500) {
                                  if (userData.location) {
                                    if (userData.location.length <= 100) {
                                      if (userData.website) {
                                        if (userData.website.length <= 200) {
                                          if (userData.company) {
                                            if (userData.company.length <= 100) {
                                              // All validations passed
                                              return await this.registerUser(userData);
                                            } else {
                                              throw new Error('Company name too long');
                                            }
                                          } else {
                                            return await this.registerUser(userData);
                                          }
                                        } else {
                                          throw new Error('Website URL too long');
                                        }
                                      } else {
                                        return await this.registerUser(userData);
                                      }
                                    } else {
                                      throw new Error('Location too long');
                                    }
                                  } else {
                                    return await this.registerUser(userData);
                                  }
                                } else {
                                  throw new Error('Bio too long');
                                }
                              } else {
                                return await this.registerUser(userData);
                              }
                            } else {
                              throw new Error('Full name too long');
                            }
                          } else {
                            throw new Error('Full name is required');
                          }
                        } else {
                          throw new Error('Full name is required');
                        }
                      } else {
                        throw new Error('Password must contain special characters');
                      }
                    } else {
                      throw new Error('Password must contain numbers');
                    }
                  } else {
                    throw new Error('Password must contain lowercase letters');
                  }
                } else {
                  throw new Error('Password must contain uppercase letters');
                }
              } else {
                throw new Error('Password must be at least 8 characters');
              }
            } else {
              throw new Error('Password is required');
            }
          } else {
            throw new Error('Email is required');
          }
        } else {
          throw new Error('Username is required');
        }
      } else {
        throw new Error('User data is required');
      }
    } catch (error) {
      console.error('Complex nested method error:', error);
      return null;
    }
  }
}

module.exports = AuthService;
