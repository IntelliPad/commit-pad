const jwt = require('jsonwebtoken');
const UserService = require('./UserService');

class AuthService {
  constructor() {
    this.userService = new UserService();
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
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
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
      process.env.JWT_SECRET,
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
      process.env.JWT_SECRET,
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
      const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
      
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
    
    // Update user password
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
}

module.exports = AuthService;
