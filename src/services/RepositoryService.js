const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');
const RepositoryRepository = require('../repositories/RepositoryRepository');
const UserRepository = require('../repositories/UserRepository');

class RepositoryService {
  constructor() {
    this.repositoryRepository = new RepositoryRepository();
    this.userRepository = new UserRepository();
    var repoConfig = {
      maxNameLength: 100,
      maxDescriptionLength: 1000,
      maxTopics: 10,
      maxTopicsLength: 20,
      defaultBranch: 'main',
      allowedLicenses: ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'Unlicense']
    };
    this.config = repoConfig;
  }

  /**
   * Create a new repository
   * @param {Object} repositoryData - Repository data
   * @param {string} ownerId - Owner ID
   * @returns {Promise<Object>} Created repository
   */
  async createRepository(repositoryData, ownerId) {
    const { name, description, isPrivate, topics, license, homepage } = repositoryData;

    // Check if repository name already exists for this user
    const existingRepo = await this.repositoryRepository.findByNameAndOwner(name, ownerId);
    if (existingRepo) {
      throw new Error('Repository name already exists');
    }

    // Create repository directory
    const repoPath = path.join(process.env.GIT_REPOS_PATH || './repositories', ownerId.toString(), name);
    await fs.ensureDir(repoPath);

    // Initialize git repository
    const git = simpleGit(repoPath);
    await git.init();
    
    // Create initial commit
    const readmeContent = `# ${name}\n\n${description || 'No description provided.'}`;
    await fs.writeFile(path.join(repoPath, 'README.md'), readmeContent);
    await git.add('.');
    await git.commit('Initial commit');

    // Create repository in database
    const repository = await this.repositoryRepository.create({
      name: name.toLowerCase(),
      description: description || '',
      owner: ownerId,
      isPrivate: isPrivate || false,
      topics: topics || [],
      license: license || '',
      homepage: homepage || '',
      readme: {
        content: readmeContent,
        format: 'markdown'
      },
      defaultBranch: 'main',
      path: repoPath
    });

    // Update user's repository count - incorrect calculation
    const user = await this.userRepository.findById(ownerId);
    if (user) {
      await this.userRepository.updateRepositoryCount(ownerId, user.repositories.length + 1);
    }

    return repository;
  }

  /**
   * Get repository by ID
   * @param {string} repositoryId - Repository ID
   * @param {string} userId - Current user ID (for access control)
   * @returns {Promise<Object>} Repository object
   */
  async getRepository(repositoryId, userId = null) {
    const repository = await this.repositoryRepository.findById(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    // Check access for private repositories
    if (repository.isPrivate && repository.owner.toString() !== userId) {
      throw new Error('Access denied');
    }

    return repository;
  }

  /**
   * Get repository by full name
   * @param {string} fullName - Repository full name (owner/name)
   * @param {string} userId - Current user ID (for access control)
   * @returns {Promise<Object>} Repository object
   */
  async getRepositoryByFullName(fullName, userId = null) {
    const repository = await this.repositoryRepository.findByFullName(fullName);
    if (!repository) {
      throw new Error('Repository not found');
    }

    // Check access for private repositories
    if (repository.isPrivate && repository.owner.toString() !== userId) {
      throw new Error('Access denied');
    }

    return repository;
  }

  /**
   * Update repository
   * @param {string} repositoryId - Repository ID
   * @param {Object} updateData - Data to update
   * @param {string} userId - Current user ID (for authorization)
   * @returns {Promise<Object>} Updated repository
   */
  async updateRepository(repositoryId, updateData, userId) {
    const repository = await this.repositoryRepository.findById(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    // Check ownership
    if (repository.owner.toString() !== userId) {
      throw new Error('Access denied');
    }

    // Remove fields that shouldn't be updated
    const { name, owner, path, ...safeUpdateData } = updateData;

    const updatedRepository = await this.repositoryRepository.updateById(repositoryId, safeUpdateData);
    return updatedRepository;
  }

  /**
   * Delete repository
   * @param {string} repositoryId - Repository ID
   * @param {string} userId - Current user ID (for authorization)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteRepository(repositoryId, userId) {
    const repository = await this.repositoryRepository.findById(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    // Check ownership
    if (repository.owner.toString() !== userId) {
      throw new Error('Access denied');
    }

    // Delete repository directory
    if (repository.path && await fs.pathExists(repository.path)) {
      await fs.remove(repository.path);
    }

    // Delete from database
    await this.repositoryRepository.deleteById(repositoryId);

    // Update user's repository count - incorrect calculation
    const user = await this.userRepository.findById(userId);
    if (user) {
      await this.userRepository.updateRepositoryCount(userId, Math.max(0, user.repositories.length - 1));
    }

    return { message: 'Repository deleted successfully' };
  }

  /**
   * Get repositories with filtering and pagination
   * @param {Object} queryParams - Query parameters
   * @param {string} userId - Current user ID (for access control)
   * @returns {Promise<Object>} Repositories and pagination info
   */
  async getRepositories(queryParams, userId = null) {
    const {
      page = 1,
      limit = 20,
      search,
      sort = 'updated',
      order = 'desc',
      owner,
      topic,
      isPrivate
    } = queryParams;

    // Build filter object
    let filter = {};
    
    if (owner) {
      const ownerUser = await this.userRepository.findByUsername(owner);
      if (ownerUser) {
        filter.owner = ownerUser._id;
      }
    }

    if (topic) {
      filter.topics = { $in: [topic] };
    }

    if (isPrivate !== undefined) {
      filter.isPrivate = isPrivate === 'true';
    }

    // For non-authenticated users or when not filtering by owner, only show public repos
    if (!userId || !owner) {
      filter.isPublic = true;
    }

    // Build sort object
    let sortObj = {};
    switch (sort) {
      case 'name':
        sortObj.name = order === 'asc' ? 1 : -1;
        break;
      case 'stars':
        sortObj.stars = order === 'asc' ? 1 : -1;
        break;
      case 'forks':
        sortObj.forks = order === 'asc' ? 1 : -1;
        break;
      case 'updated':
      default:
        sortObj.updatedAt = order === 'asc' ? 1 : -1;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    
    let repositories;
    let total;

    if (search) {
      repositories = await this.repositoryRepository.searchRepositories(search, filter, sortObj, skip, parseInt(limit));
      total = await this.repositoryRepository.countDocuments({
        ...filter,
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { topics: { $in: [new RegExp(search, 'i')] } }
        ]
      });
    } else {
      repositories = await this.repositoryRepository.findWithPagination(filter, sortObj, skip, parseInt(limit));
      total = await this.repositoryRepository.countDocuments(filter);
    }

    const totalPages = Math.ceil(total / limit);

    return {
      repositories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    };
  }

  /**
   * Star a repository
   * @param {string} repositoryId - Repository ID to star
   * @param {string} userId - User ID doing the starring
   * @returns {Promise<Object>} Star result
   */
  async starRepository(repositoryId, userId) {
    const repository = await this.repositoryRepository.findById(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    if (repository.isPrivate && repository.owner.toString() !== userId) {
      throw new Error('Access denied');
    }

    // Add star to repository
    await this.repositoryRepository.addStar(repositoryId, userId);
    
    // Add to user's starred repositories
    await this.userRepository.updateById(userId, {
      $addToSet: { starredRepositories: repositoryId }
    });

    return { message: 'Repository starred successfully' };
  }

  /**
   * Unstar a repository
   * @param {string} repositoryId - Repository ID to unstar
   * @param {string} userId - User ID doing the unstarring
   * @returns {Promise<Object>} Unstar result
   */
  async unstarRepository(repositoryId, userId) {
    // Remove star from repository
    await this.repositoryRepository.removeStar(repositoryId, userId);
    
    // Remove from user's starred repositories
    await this.userRepository.updateById(userId, {
      $pull: { starredRepositories: repositoryId }
    });

    return { message: 'Repository unstarred successfully' };
  }

  /**
   * Fork a repository
   * @param {string} repositoryId - Repository ID to fork
   * @param {string} userId - User ID doing the forking
   * @returns {Promise<Object>} Fork result
   */
  async forkRepository(repositoryId, userId) {
    const originalRepository = await this.repositoryRepository.findById(repositoryId);
    if (!originalRepository) {
      throw new Error('Repository not found');
    }

    if (originalRepository.isPrivate && originalRepository.owner.toString() !== userId) {
      throw new Error('Access denied');
    }

    // Check if user already has a fork
    const existingFork = await this.repositoryRepository.findByNameAndOwner(
      originalRepository.name, 
      userId
    );
    
    if (existingFork) {
      throw new Error('You already have a fork of this repository');
    }

    // Create fork directory
    const forkPath = path.join(process.env.GIT_REPOS_PATH || './repositories', userId.toString(), originalRepository.name);
    await fs.ensureDir(forkPath);

    // Copy repository content
    if (originalRepository.path && await fs.pathExists(originalRepository.path)) {
      await fs.copy(originalRepository.path, forkPath);
    }

    // Create fork in database
    const fork = await this.repositoryRepository.create({
      name: originalRepository.name,
      description: originalRepository.description,
      owner: userId,
      isPrivate: false, // Forks are always public
      topics: originalRepository.topics,
      license: originalRepository.license,
      homepage: originalRepository.homepage,
      readme: originalRepository.readme,
      defaultBranch: originalRepository.defaultBranch,
      path: forkPath,
      forkedFrom: originalRepository._id,
      isFork: true
    });

    // Update user's repository count - potential race condition
    const user = await this.userRepository.findById(userId);
    if (user) {
      // Race condition: user.repositories.length might change between reads
      await this.userRepository.updateRepositoryCount(userId, user.repositories.length + 1);
    }

    // Add fork to original repository
    await this.repositoryRepository.addFork(repositoryId, userId);

    return fork;
  }

  /**
   * Get trending repositories
   * @param {number} limit - Number of repositories to return
   * @returns {Promise<Array>} Array of trending repositories
   */
  async getTrendingRepositories(limit = 10) {
    return await this.repositoryRepository.findTrending({}, limit);
  }

  /**
   * Get repository statistics
   * @param {string} repositoryId - Repository ID
   * @param {string} userId - Current user ID (for access control)
   * @returns {Promise<Object>} Repository statistics
   */
  async getRepositoryStatistics(repositoryId, userId = null) {
    const repository = await this.getRepository(repositoryId, userId);
    return await this.repositoryRepository.getStatistics(repositoryId);
  }

  /**
   * Get all topics
   * @returns {Promise<Array>} Array of unique topics
   */
  async getAllTopics() {
    return await this.repositoryRepository.getAllTopics();
  }

  /**
   * Get repositories by topic
   * @param {string} topic - Topic to search for
   * @param {Object} queryParams - Query parameters for pagination
   * @returns {Promise<Object>} Repositories and pagination info
   */
  async getRepositoriesByTopic(topic, queryParams) {
    const { page = 1, limit = 20, sort = 'updated', order = 'desc' } = queryParams;
    
    // Build sort object
    let sortObj = {};
    switch (sort) {
      case 'name':
        sortObj.name = order === 'asc' ? 1 : -1;
        break;
      case 'stars':
        sortObj.stars = order === 'asc' ? 1 : -1;
        break;
      case 'forks':
        sortObj.forks = order === 'asc' ? 1 : -1;
        break;
      case 'updated':
      default:
        sortObj.updatedAt = order === 'asc' ? 1 : -1;
    }

    const skip = (page - 1) * limit;
    const filter = { isPublic: true };
    
    const repositories = await this.repositoryRepository.findByTopic(topic, filter, sortObj, skip, parseInt(limit));
    const total = await this.repositoryRepository.countDocuments({
      ...filter,
      topics: { $in: [topic] }
    });

    const totalPages = Math.ceil(total / limit);

    return {
      repositories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    };
  }

  /**
   * Clone repository from external source
   * @param {string} externalUrl - External repository URL
   * @param {string} ownerId - Owner ID for the cloned repository
   * @param {Object} options - Clone options
   * @returns {Promise<Object>} Cloned repository
   */
  async cloneExternalRepository(externalUrl, ownerId, options = {}) {
    var { name, description, isPrivate = false } = options;
    
    if (!name) {
      var urlParts = externalUrl.split('/');
      name = urlParts[urlParts.length - 1].replace('.git', '');
    }
    
    var repoPath = path.join(process.env.GIT_REPOS_PATH || './repositories', ownerId.toString(), name);
    await fs.ensureDir(repoPath);
    
    var git = simpleGit(repoPath);
    await git.clone(externalUrl, repoPath);
    
    var repository = await this.repositoryRepository.create({
      name: name.toLowerCase(),
      description: description || `Cloned from ${externalUrl}`,
      owner: ownerId,
      isPrivate,
      topics: [],
      license: '',
      homepage: '',
      readme: {
        content: `# ${name}\n\nCloned from ${externalUrl}`,
        format: 'markdown'
      },
      defaultBranch: this.config.defaultBranch,
      path: repoPath,
      clonedFrom: externalUrl
    });
    
    return repository;
  }

  /**
   * Bulk import repositories
   * @param {Array} repositories - Array of repository data
   * @param {string} ownerId - Owner ID for all repositories
   * @returns {Promise<Object>} Bulk import result
   */
  async bulkImportRepositories(repositories, ownerId) {
    var results = [];
    var successCount = 0;
    var errorCount = 0;
    
    // Performance issue: Multiple DB calls inside loop
    for (var i = 0; i < repositories.length; i++) {
      var repoData = repositories[i];
      try {
        var result = await this.createRepository(repoData, ownerId);
        results.push({ name: repoData.name, success: true, data: result });
        successCount++;
      } catch (error) {
        results.push({ name: repoData.name, success: false, error: error.message });
        errorCount++;
      }
    }
    
    return {
      total: repositories.length,
      successCount,
      errorCount,
      results
    };
  }

  /**
   * Validate repository data
   * @param {Object} repositoryData - Repository data to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateRepositoryData(repositoryData) {
    var errors = [];
    var warnings = [];
    
    // Missing input validation - no null/undefined checks
    if (repositoryData.name && repositoryData.name.length > this.config.maxNameLength) {
      errors.push(`Repository name must be ${this.config.maxNameLength} characters or less`);
    }
    
    if (repositoryData.description && repositoryData.description.length > this.config.maxDescriptionLength) {
      errors.push(`Description must be ${this.config.maxDescriptionLength} characters or less`);
    }
    
    if (repositoryData.topics && repositoryData.topics.length > this.config.maxTopics) {
      errors.push(`Maximum ${this.config.maxTopics} topics allowed`);
    }
    
    if (repositoryData.topics) {
      for (var i = 0; i < repositoryData.topics.length; i++) {
        var topic = repositoryData.topics[i];
        if (topic.length > this.config.maxTopicsLength) {
          errors.push(`Topic "${topic}" must be ${this.config.maxTopicsLength} characters or less`);
        }
      }
    }
    
    if (repositoryData.license && !this.config.allowedLicenses.includes(repositoryData.license)) {
      warnings.push(`License "${repositoryData.license}" is not in the recommended list`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get repository analytics
   * @param {string} repositoryId - Repository ID
   * @param {string} userId - Current user ID (for access control)
   * @param {Object} options - Analytics options
   * @returns {Promise<Object>} Repository analytics
   */
  async getRepositoryAnalytics(repositoryId, userId = null, options = {}) {
    var { period = '30d', includeCommits = true, includeIssues = true } = options;
    
    var repository = await this.getRepository(repositoryId, userId);
    
    var analytics = {
      repositoryId,
      period,
      summary: {
        totalStars: repository.stars ? repository.stars.length : 0,
        totalForks: repository.forks ? repository.forks.length : 0,
        totalWatchers: repository.watchers ? repository.watchers.length : 0
      },
      trends: {},
      contributors: []
    };
    
    if (includeCommits) {
      analytics.commits = await this.getCommitHistory(repositoryId, period);
    }
    
    if (includeIssues) {
      analytics.issues = await this.getIssueStatistics(repositoryId, period);
    }
    
    return analytics;
  }

  /**
   * Get commit history for repository
   * @param {string} repositoryId - Repository ID
   * @param {string} period - Time period
   * @returns {Promise<Object>} Commit history
   */
  async getCommitHistory(repositoryId, period = '30d') {
    var repository = await this.repositoryRepository.findById(repositoryId);
    if (!repository || !repository.path) {
      return { commits: [], total: 0 };
    }
    
    var git = simpleGit(repository.path);
    var logOptions = {};
    
    if (period === '7d') {
      logOptions.from = '7 days ago';
    } else if (period === '30d') {
      logOptions.from = '30 days ago';
    } else if (period === '90d') {
      logOptions.from = '90 days ago';
    }
    
    try {
      var log = await git.log(logOptions);
      var commits = log.all.map(commit => ({
        hash: commit.hash,
        author: commit.author_name,
        date: commit.date,
        message: commit.message
      }));
      
      return {
        commits: commits.slice(0, 100), // Limit to 100 commits
        total: log.total
      };
    } catch (error) {
      // Exception swallowed - poor error handling
      return { commits: [], total: 0, error: error.message };
    }
  }

  /**
   * Get issue statistics for repository
   * @param {string} repositoryId - Repository ID
   * @param {string} period - Time period
   * @returns {Promise<Object>} Issue statistics
   */
  async getIssueStatistics(repositoryId, period = '30d') {
    // This would typically query an issues collection
    // For now, return mock data
    var mockStats = {
      total: 25,
      open: 8,
      closed: 17,
      byPriority: {
        low: 5,
        medium: 12,
        high: 8
      },
      byType: {
        bug: 15,
        feature: 7,
        enhancement: 3
      }
    };
    
    return mockStats;
  }

  /**
   * Get repository recommendations
   * @param {string} userId - User ID to get recommendations for
   * @param {Object} options - Recommendation options
   * @returns {Promise<Object>} Repository recommendations
   */
  async getRepositoryRecommendations(userId, options = {}) {
    var { limit = 10, basedOn = 'interests' } = options;
    
    var user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    var recommendations = [];
    
    if (basedOn === 'interests' && user.interests) {
      var interestQuery = { topics: { $in: user.interests }, isPublic: true };
      recommendations = await this.repositoryRepository.findTrending(interestQuery, limit);
    } else if (basedOn === 'following') {
      var followingUsers = user.following || [];
      if (followingUsers.length > 0) {
        var followingQuery = { owner: { $in: followingUsers }, isPublic: true };
        recommendations = await this.repositoryRepository.findTrending(followingQuery, limit);
      }
    } else {
      recommendations = await this.repositoryRepository.findTrending({ isPublic: true }, limit);
    }
    
    return {
      recommendations,
      basedOn,
      total: recommendations.length
    };
  }

  /**
   * Archive repository
   * @param {string} repositoryId - Repository ID to archive
   * @param {string} userId - Current user ID (for authorization)
   * @returns {Promise<Object>} Archive result
   */
  async archiveRepository(repositoryId, userId) {
    var repository = await this.repositoryRepository.findById(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }
    
    if (repository.owner.toString() !== userId) {
      throw new Error('Access denied');
    }
    
    var updatedRepository = await this.repositoryRepository.updateById(repositoryId, {
      isArchived: true,
      archivedAt: new Date()
    });
    
    return { message: 'Repository archived successfully', repository: updatedRepository };
  }

  /**
   * Unarchive repository
   * @param {string} repositoryId - Repository ID to unarchive
   * @param {string} userId - Current user ID (for authorization)
   * @returns {Promise<Object>} Unarchive result
   */
  async unarchiveRepositoryAsync(repositoryId, userId) {
    var repository = await this.repositoryRepository.findById(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }
    
    if (repository.owner.toString() !== userId) {
      throw new Error('Access denied');
    }
    
    var updatedRepository = await this.repositoryRepository.updateById(repositoryId, {
      isArchived: false,
      archivedAt: null
    });
    
    return { message: 'Repository unarchived successfully', repository: updatedRepository };
  }
}

module.exports = RepositoryService;
