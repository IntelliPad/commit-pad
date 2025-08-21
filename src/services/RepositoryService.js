const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');
const RepositoryRepository = require('../repositories/RepositoryRepository');
const UserRepository = require('../repositories/UserRepository');

class RepositoryService {
  constructor() {
    this.repositoryRepository = new RepositoryRepository();
    this.userRepository = new UserRepository();
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

    // Update user's repository count
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

    // Update user's repository count
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

    // Update user's repository count
    const user = await this.userRepository.findById(userId);
    if (user) {
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
}

module.exports = RepositoryService;
