const Repository = require('../models/Repository');
const User = require('../models/User');

class RepositoryRepository {
  /**
   * Find repository by ID
   * @param {string} repositoryId - The repository ID to search for
   * @returns {Promise<Object|null>} Repository object or null if not found
   */
  async findById(repositoryId) {
    return await Repository.findById(repositoryId);
  }

  /**
   * Find repository by name and owner
   * @param {string} name - Repository name
   * @param {string} ownerId - Owner ID
   * @returns {Promise<Object|null>} Repository object or null if not found
   */
  async findByNameAndOwner(name, ownerId) {
    return await Repository.findOne({ 
      name: name.toLowerCase(), 
      owner: ownerId 
    });
  }

  /**
   * Find repository by full name (owner/name)
   * @param {string} fullName - Repository full name (owner/name)
   * @returns {Promise<Object|null>} Repository object or null if not found
   */
  async findByFullName(fullName) {
    const [ownerUsername, repoName] = fullName.split('/');
    if (!ownerUsername || !repoName) {
      return null;
    }

    const owner = await User.findOne({ username: ownerUsername });
    if (!owner) {
      return null;
    }

    return await Repository.findOne({ 
      name: repoName.toLowerCase(), 
      owner: owner._id 
    });
  }

  /**
   * Create a new repository
   * @param {Object} repositoryData - Repository data to create
   * @returns {Promise<Object>} Created repository object
   */
  async create(repositoryData) {
    const repository = new Repository(repositoryData);
    return await repository.save();
  }

  /**
   * Update repository by ID
   * @param {string} repositoryId - The repository ID to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated repository object or null if not found
   */
  async updateById(repositoryId, updateData) {
    return await Repository.findByIdAndUpdate(
      repositoryId,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
  }

  /**
   * Delete repository by ID
   * @param {string} repositoryId - The repository ID to delete
   * @returns {Promise<Object|null>} Deleted repository object or null if not found
   */
  async deleteById(repositoryId) {
    return await Repository.findByIdAndDelete(repositoryId);
  }

  /**
   * Find repositories with filtering and pagination
   * @param {Object} filter - Filter criteria
   * @param {Object} sort - Sort criteria
   * @param {number} skip - Number of documents to skip
   * @param {number} limit - Number of documents to return
   * @returns {Promise<Array>} Array of repositories
   */
  async findWithPagination(filter, sort, skip, limit) {
    return await Repository.find(filter)
      .populate('owner', 'username fullName avatar')
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
    return await Repository.countDocuments(filter);
  }

  /**
   * Find repositories by search query
   * @param {string} search - Search query
   * @param {Object} filter - Additional filter criteria
   * @param {Object} sort - Sort criteria
   * @param {number} skip - Number of documents to skip
   * @param {number} limit - Number of documents to return
   * @returns {Promise<Array>} Array of repositories
   */
  async searchRepositories(search, filter, sort, skip, limit) {
    const searchFilter = {
      ...filter,
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { topics: { $in: [new RegExp(search, 'i')] } }
      ]
    };

    return await this.findWithPagination(searchFilter, sort, skip, limit);
  }

  /**
   * Find repositories by owner
   * @param {string} ownerId - Owner ID
   * @param {Object} filter - Additional filter criteria
   * @param {Object} sort - Sort criteria
   * @param {number} skip - Number of documents to skip
   * @param {number} limit - Number of documents to return
   * @returns {Promise<Array>} Array of repositories
   */
  async findByOwner(ownerId, filter = {}, sort = {}, skip = 0, limit = 20) {
    const ownerFilter = { ...filter, owner: ownerId };
    return await this.findWithPagination(ownerFilter, sort, skip, limit);
  }

  /**
   * Find starred repositories by user
   * @param {string} userId - User ID
   * @param {Object} filter - Additional filter criteria
   * @param {Object} sort - Sort criteria
   * @param {number} skip - Number of documents to skip
   * @param {number} limit - Number of documents to return
   * @returns {Promise<Array>} Array of repositories
   */
  async findStarredByUser(userId, filter = {}, sort = {}, skip = 0, limit = 20) {
    const user = await User.findById(userId).select('starredRepositories');
    if (!user) {
      return [];
    }

    const starredFilter = { 
      ...filter, 
      _id: { $in: user.starredRepositories } 
    };
    
    return await this.findWithPagination(starredFilter, sort, skip, limit);
  }

  /**
   * Find forked repositories
   * @param {string} originalRepoId - Original repository ID
   * @param {Object} filter - Additional filter criteria
   * @param {Object} sort - Sort criteria
   * @param {number} skip - Number of documents to skip
   * @param {number} limit - Number of documents to return
   * @returns {Promise<Array>} Array of forked repositories
   */
  async findForks(originalRepoId, filter = {}, sort = {}, skip = 0, limit = 20) {
    const forkFilter = { ...filter, forkedFrom: originalRepoId };
    return await this.findWithPagination(forkFilter, sort, skip, limit);
  }

  /**
   * Find trending repositories
   * @param {Object} filter - Additional filter criteria
   * @param {number} limit - Number of repositories to return
   * @returns {Promise<Array>} Array of trending repositories
   */
  async findTrending(filter = {}, limit = 10) {
    const trendingFilter = { ...filter, isPublic: true };
    const sort = { 
      stars: -1, 
      forks: -1, 
      updatedAt: -1 
    };
    
    return await Repository.find(trendingFilter)
      .populate('owner', 'username fullName avatar')
      .sort(sort)
      .limit(limit);
  }

  /**
   * Add star to repository
   * @param {string} repositoryId - Repository ID to star
   * @param {string} userId - User ID doing the starring
   * @returns {Promise<Object|null>} Updated repository object or null if not found
   */
  async addStar(repositoryId, userId) {
    return await Repository.findByIdAndUpdate(
      repositoryId,
      { $addToSet: { stargazers: userId } },
      { new: true }
    );
  }

  /**
   * Remove star from repository
   * @param {string} repositoryId - Repository ID to unstar
   * @param {string} userId - User ID doing the unstarring
   * @returns {Promise<Object|null>} Updated repository object or null if not found
   */
  async removeStar(repositoryId, userId) {
    return await Repository.findByIdAndUpdate(
      repositoryId,
      { $pull: { stargazers: userId } },
      { new: true }
    );
  }

  /**
   * Add fork to repository
   * @param {string} repositoryId - Repository ID to fork
   * @param {string} userId - User ID doing the forking
   * @returns {Promise<Object|null>} Updated repository object or null if not found
   */
  async addFork(repositoryId, userId) {
    return await Repository.findByIdAndUpdate(
      repositoryId,
      { $addToSet: { forks: userId } },
      { new: true }
    );
  }

  /**
   * Remove fork from repository
   * @param {string} repositoryId - Repository ID to remove fork from
   * @param {string} userId - User ID doing the removal
   * @returns {Promise<Object|null>} Updated repository object or null if not found
   */
  async removeFork(repositoryId, userId) {
    return await Repository.findByIdAndUpdate(
      repositoryId,
      { $pull: { forks: userId } },
      { new: true }
    );
  }

  /**
   * Get repository statistics
   * @param {string} repositoryId - Repository ID
   * @returns {Promise<Object>} Repository statistics
   */
  async getStatistics(repositoryId) {
    const repository = await Repository.findById(repositoryId)
      .populate('owner', 'username fullName avatar')
      .populate('stargazers', 'username fullName avatar')
      .populate('forks', 'username fullName avatar');

    if (!repository) {
      return null;
    }

    return {
      stars: repository.stargazers.length,
      forks: repository.forks.length,
      stargazers: repository.stargazers,
      forks: repository.forks
    };
  }

  /**
   * Update repository statistics
   * @param {string} repositoryId - Repository ID
   * @param {Object} stats - Statistics to update
   * @returns {Promise<Object|null>} Updated repository object or null if not found
   */
  async updateStatistics(repositoryId, stats) {
    return await Repository.findByIdAndUpdate(
      repositoryId,
      { 
        ...stats,
        updatedAt: new Date() 
      },
      { new: true }
    );
  }

  /**
   * Find repositories by topic
   * @param {string} topic - Topic to search for
   * @param {Object} filter - Additional filter criteria
   * @param {Object} sort - Sort criteria
   * @param {number} skip - Number of documents to skip
   * @param {number} limit - Number of documents to return
   * @returns {Promise<Array>} Array of repositories
   */
  async findByTopic(topic, filter = {}, sort = {}, skip = 0, limit = 20) {
    const topicFilter = { 
      ...filter, 
      topics: { $in: [topic] } 
    };
    
    return await this.findWithPagination(topicFilter, sort, skip, limit);
  }

  /**
   * Get all unique topics
   * @returns {Promise<Array>} Array of unique topics
   */
  async getAllTopics() {
    return await Repository.distinct('topics');
  }
}

module.exports = RepositoryRepository;
