const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserRepository = require('../repositories/UserRepository');

class UserService {
  constructor() {
    this.userRepository = new UserRepository();
  }

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Registration result with user and token
   */
  async registerUser(userData) {
    const { username, email, password, fullName, bio, location, website, company } = userData;

    // Check if username already exists
    const existingUsername = await this.userRepository.findByUsername(username);
    if (existingUsername) {
      throw new Error('Username already exists');
    }

    // Check if email already exists
    const existingEmail = await this.userRepository.findByEmail(email);
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user data object
    const userToCreate = {
      username,
      email,
      password: hashedPassword,
      fullName,
      bio: bio || '',
      location: location || '',
      website: website || '',
      company: company || ''
    };

    // Create user
    const user = await this.userRepository.create(userToCreate);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return {
      user: user.getPublicProfile(),
      token
    };
  }

  /**
   * Authenticate user login
   * @param {string} username - Username or email
   * @param {string} password - User password
   * @returns {Promise<Object>} Authentication result with user and token
   */
  async authenticateUser(username, password) {
    // Find user by username or email
    let user = await this.userRepository.findByUsername(username);
    if (!user) {
      user = await this.userRepository.findByEmail(username);
    }

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return {
      user: user.getPublicProfile(),
      token
    };
  }

  /**
   * Get users with filtering and pagination
   * @param {Object} queryParams - Query parameters
   * @returns {Promise<Object>} Users and pagination info
   */
  async getUsers(queryParams) {
    const {
      page = 1,
      limit = 20,
      search,
      sort = 'username',
      order = 'asc'
    } = queryParams;

    // Build filter object
    const filter = { isPublic: true };

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
    
    let users;
    let total;

    if (search) {
      users = await this.userRepository.searchUsers(search, filter, sortObj, skip, parseInt(limit));
      total = await this.userRepository.countDocuments({
        ...filter,
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { fullName: { $regex: search, $options: 'i' } },
          { bio: { $regex: search, $options: 'i' } }
        ]
      });
    } else {
      users = await this.userRepository.findWithPagination(filter, sortObj, skip, parseInt(limit));
      total = await this.userRepository.countDocuments(filter);
    }

    const totalPages = Math.ceil(total / limit);

    return {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    };
  }

  /**
   * Get user profile by username
   * @param {string} username - Username to get profile for
   * @returns {Promise<Object>} User profile
   */
  async getUserProfile(username) {
    const user = await this.userRepository.findByUsername(username);
    if (!user || !user.isPublic) {
      throw new Error('User not found');
    }

    return user.getPublicProfile();
  }

  /**
   * Get user profile by ID with populated fields
   * @param {string} userId - User ID to get profile for
   * @returns {Promise<Object>} User profile with populated fields
   */
  async getUserProfileById(userId) {
    const user = await this.userRepository.getProfileWithPopulatedFields(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Update user profile
   * @param {string} userId - User ID to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user profile
   */
  async updateUserProfile(userId, updateData) {
    // Remove sensitive fields that shouldn't be updated
    const { password, email, username, ...safeUpdateData } = updateData;

    const updatedUser = await this.userRepository.updateById(userId, safeUpdateData);
    if (!updatedUser) {
      throw new Error('User not found');
    }

    return updatedUser.getPublicProfile();
  }

  /**
   * Delete user account
   * @param {string} userId - User ID to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteUserAccount(userId) {
    const deletedUser = await this.userRepository.deleteById(userId);
    if (!deletedUser) {
      throw new Error('User not found');
    }

    return { message: 'User account deleted successfully' };
  }

  /**
   * Follow a user
   * @param {string} followerId - ID of the user doing the following
   * @param {string} targetUserId - ID of the user to follow
   * @returns {Promise<Object>} Follow result
   */
  async followUser(followerId, targetUserId) {
    if (followerId === targetUserId) {
      throw new Error('Cannot follow yourself');
    }

    const targetUser = await this.userRepository.findById(targetUserId);
    if (!targetUser || !targetUser.isPublic) {
      throw new Error('User not found');
    }

    // Add to following list
    await this.userRepository.addFollowing(followerId, targetUserId);
    
    // Add to target user's followers list
    await this.userRepository.addFollower(targetUserId, followerId);

    return { message: 'User followed successfully' };
  }

  /**
   * Unfollow a user
   * @param {string} followerId - ID of the user doing the unfollowing
   * @param {string} targetUserId - ID of the user to unfollow
   * @returns {Promise<Object>} Unfollow result
   */
  async unfollowUser(followerId, targetUserId) {
    if (followerId === targetUserId) {
      throw new Error('Cannot unfollow yourself');
    }

    // Remove from following list
    await this.userRepository.removeFollowing(followerId, targetUserId);
    
    // Remove from target user's followers list
    await this.userRepository.removeFollower(targetUserId, followerId);

    return { message: 'User unfollowed successfully' };
  }

  /**
   * Get user's followers
   * @param {string} userId - User ID to get followers for
   * @param {Object} queryParams - Query parameters for pagination
   * @returns {Promise<Object>} Followers and pagination info
   */
  async getUserFollowers(userId, queryParams) {
    const { page = 1, limit = 20 } = queryParams;
    const skip = (page - 1) * limit;

    const user = await this.userRepository.findById(userId)
      .populate('followers', 'username fullName avatar bio location company')
      .select('followers');

    if (!user) {
      throw new Error('User not found');
    }

    const followers = user.followers.slice(skip, skip + parseInt(limit));
    const total = user.followers.length;
    const totalPages = Math.ceil(total / limit);

    return {
      followers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    };
  }

  /**
   * Get user's following
   * @param {string} userId - User ID to get following for
   * @param {Object} queryParams - Query parameters for pagination
   * @returns {Promise<Object>} Following and pagination info
   */
  async getUserFollowing(userId, queryParams) {
    const { page = 1, limit = 20 } = queryParams;
    const skip = (page - 1) * limit;

    const user = await this.userRepository.findById(userId)
      .populate('following', 'username fullName avatar bio location company')
      .select('following');

    if (!user) {
      throw new Error('User not found');
    }

    const following = user.following.slice(skip, skip + parseInt(limit));
    const total = user.following.length;
    const totalPages = Math.ceil(total / limit);

    return {
      following,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    };
  }

  /**
   * Check if user is following another user
   * @param {string} followerId - ID of the potential follower
   * @param {string} targetUserId - ID of the target user
   * @returns {Promise<boolean>} True if following, false otherwise
   */
  async isFollowing(followerId, targetUserId) {
    const user = await this.userRepository.findById(followerId);
    if (!user) {
      return false;
    }

    return user.following.includes(targetUserId);
  }
}

module.exports = UserService;
