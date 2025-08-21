const User = require('../models/User');

class UserRepository {
  /**
   * Find user by username
   * @param {string} username - The username to search for
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findByUsername(username) {
    return await User.findOne({ username });
  }

  /**
   * Find user by email
   * @param {string} email - The email to search for
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findByEmail(email) {
    return await User.findOne({ email });
  }

  /**
   * Find user by ID
   * @param {string} userId - The user ID to search for
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findById(userId) {
    return await User.findById(userId);
  }

  /**
   * Create a new user
   * @param {Object} userData - User data to create
   * @returns {Promise<Object>} Created user object
   */
  async create(userData) {
    const user = new User(userData);
    return await user.save();
  }

  /**
   * Update user by ID
   * @param {string} userId - The user ID to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated user object or null if not found
   */
  async updateById(userId, updateData) {
    return await User.findByIdAndUpdate(
      userId,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
  }

  /**
   * Delete user by ID
   * @param {string} userId - The user ID to delete
   * @returns {Promise<Object|null>} Deleted user object or null if not found
   */
  async deleteById(userId) {
    return await User.findByIdAndDelete(userId);
  }

  /**
   * Find users with filtering and pagination
   * @param {Object} filter - Filter criteria
   * @param {Object} sort - Sort criteria
   * @param {number} skip - Number of documents to skip
   * @param {number} limit - Number of documents to return
   * @returns {Promise<Array>} Array of users
   */
  async findWithPagination(filter, sort, skip, limit) {
    return await User.find(filter)
      .select('username fullName bio avatar location company followerCount followingCount repositoryCount createdAt')
      .sort(sort)
      .skip(skip)
      .limit(limit);
  }

  /**
   * Count documents with filter
   * @param {Object} filter - Filter criteria
   * @returns {Promise<number>} Total count
   */
  async countDocuments(filter) {
    return await User.countDocuments(filter);
  }

  /**
   * Find users by search query
   * @param {string} search - Search query
   * @param {Object} filter - Additional filter criteria
   * @param {Object} sort - Sort criteria
   * @param {number} skip - Number of documents to skip
   * @param {number} limit - Number of documents to return
   * @returns {Promise<Array>} Array of users
   */
  async searchUsers(search, filter, sort, skip, limit) {
    const searchFilter = {
      ...filter,
      $or: [
        { username: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { bio: { $regex: search, $options: 'i' } }
      ]
    };

    return await this.findWithPagination(searchFilter, sort, skip, limit);
  }

  /**
   * Add follower to user
   * @param {string} userId - The user to add follower to
   * @param {string} followerId - The follower ID to add
   * @returns {Promise<Object|null>} Updated user object or null if not found
   */
  async addFollower(userId, followerId) {
    return await User.findByIdAndUpdate(
      userId,
      { $addToSet: { followers: followerId } },
      { new: true }
    );
  }

  /**
   * Remove follower from user
   * @param {string} userId - The user to remove follower from
   * @param {string} followerId - The follower ID to remove
   * @returns {Promise<Object|null>} Updated user object or null if not found
   */
  async removeFollower(userId, followerId) {
    return await User.findByIdAndUpdate(
      userId,
      { $pull: { followers: followerId } },
      { new: true }
    );
  }

  /**
   * Add following to user
   * @param {string} userId - The user to add following to
   * @param {string} followingId - The following ID to add
   * @returns {Promise<Object|null>} Updated user object or null if not found
   */
  async addFollowing(userId, followingId) {
    return await User.findByIdAndUpdate(
      userId,
      { $addToSet: { following: followingId } },
      { new: true }
    );
  }

  /**
   * Remove following from user
   * @param {string} userId - The user to remove following from
   * @param {string} followingId - The following ID to remove
   * @returns {Promise<Object|null>} Updated user object or null if not found
   */
  async removeFollowing(userId, followingId) {
    return await User.findByIdAndUpdate(
      userId,
      { $pull: { following: followingId } },
      { new: true }
    );
  }

  /**
   * Get user profile with populated fields
   * @param {string} userId - The user ID to get profile for
   * @returns {Promise<Object|null>} User profile with populated fields or null if not found
   */
  async getProfileWithPopulatedFields(userId) {
    return await User.findById(userId)
      .populate('followers', 'username fullName avatar')
      .populate('following', 'username fullName avatar')
      .populate('repositories', 'name description isPrivate topics license')
      .populate('starredRepositories', 'name description isPrivate topics license');
  }

  /**
   * Update user's repository count
   * @param {string} userId - The user ID to update
   * @param {number} count - The new repository count
   * @returns {Promise<Object|null>} Updated user object or null if not found
   */
  async updateRepositoryCount(userId, count) {
    return await User.findByIdAndUpdate(
      userId,
      { repositoryCount: count },
      { new: true }
    );
  }
}

module.exports = UserRepository;
