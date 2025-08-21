const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Repository = require('../models/Repository');
const User = require('../models/User');
const { 
  authenticateToken, 
  checkRepositoryAccess, 
  checkRepositoryOwnership 
} = require('../middleware/auth');
const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');

const router = express.Router();

/**
 * @route POST /api/repositories
 * @desc Create a new repository
 * @access Private
 */
router.post('/', [
  authenticateToken,
  body('name')
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Repository name must be 1-100 characters and contain only letters, numbers, dots, underscores, and hyphens'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('isPrivate')
    .optional()
    .isBoolean()
    .withMessage('isPrivate must be a boolean value'),
  body('topics')
    .optional()
    .isArray()
    .withMessage('Topics must be an array'),
  body('license')
    .optional()
    .isString()
    .withMessage('License must be a string'),
  body('homepage')
    .optional()
    .isURL()
    .withMessage('Homepage must be a valid URL')
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

    const { name, description, isPrivate, topics, license, homepage } = req.body;
    const ownerId = req.user._id;

    // Check if repository name already exists for this user
    const existingRepo = await Repository.findOne({ 
      owner: ownerId, 
      name: name.toLowerCase() 
    });

    if (existingRepo) {
      return res.status(409).json({
        error: 'Repository name already exists',
        message: 'You already have a repository with this name. Please choose a different name.'
      });
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
    const repository = new Repository({
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
      branches: [{
        name: 'main',
        lastCommit: {
          hash: await git.revparse(['HEAD']),
          message: 'Initial commit',
          author: req.user.fullName,
          timestamp: new Date()
        }
      }],
      commits: [{
        hash: await git.revparse(['HEAD']),
        message: 'Initial commit',
        author: req.user.fullName,
        email: req.user.email,
        timestamp: new Date(),
        branch: 'main'
      }]
    });

    await repository.save();

    // Add repository to user's repositories
    await User.findByIdAndUpdate(ownerId, {
      $push: { repositories: repository._id }
    });

    res.status(201).json({
      message: 'Repository created successfully',
      repository: {
        id: repository._id,
        name: repository.name,
        fullName: repository.fullName,
        description: repository.description,
        isPrivate: repository.isPrivate,
        owner: {
          id: req.user._id,
          username: req.user.username
        },
        createdAt: repository.createdAt,
        defaultBranch: repository.defaultBranch,
        topics: repository.topics,
        license: repository.license,
        homepage: repository.homepage
      }
    });

  } catch (error) {
    console.error('Repository creation error:', error);
    res.status(500).json({
      error: 'Repository creation failed',
      message: 'An error occurred while creating the repository. Please try again.'
    });
  }
});

/**
 * @route GET /api/repositories
 * @desc Get repositories with filtering and pagination
 * @access Public (with optional authentication)
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
  query('sort')
    .optional()
    .isIn(['created', 'updated', 'name', 'stars', 'forks'])
    .withMessage('Sort must be one of: created, updated, name, stars, forks'),
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be either asc or desc'),
  query('language')
    .optional()
    .isString()
    .withMessage('Language must be a string'),
  query('topic')
    .optional()
    .isString()
    .withMessage('Topic must be a string'),
  query('isPrivate')
    .optional()
    .isBoolean()
    .withMessage('isPrivate must be a boolean value')
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
      sort = 'created',
      order = 'desc',
      language,
      topic,
      isPrivate
    } = req.query;

    // Build filter object
    const filter = {};
    
    // Only show public repositories to unauthenticated users
    if (!req.user) {
      filter.isPrivate = false;
    } else if (isPrivate !== undefined) {
      filter.isPrivate = isPrivate;
    }

    if (language) {
      filter.language = { $regex: language, $options: 'i' };
    }

    if (topic) {
      filter.topics = { $in: [topic] };
    }

    // Build sort object
    let sortObj = {};
    switch (sort) {
      case 'created':
        sortObj.createdAt = order === 'asc' ? 1 : -1;
        break;
      case 'updated':
        sortObj.updatedAt = order === 'asc' ? 1 : -1;
        break;
      case 'name':
        sortObj.name = order === 'asc' ? 1 : -1;
        break;
      case 'stars':
        sortObj.starCount = order === 'asc' ? 1 : -1;
        break;
      case 'forks':
        sortObj.forkCount = order === 'asc' ? 1 : -1;
        break;
      default:
        sortObj.createdAt = -1;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    
    const repositories = await Repository.find(filter)
      .populate('owner', 'username fullName avatar')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-collaborators -issues -pullRequests -commits');

    const total = await Repository.countDocuments(filter);
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
    console.error('Repository retrieval error:', error);
    res.status(500).json({
      error: 'Repository retrieval failed',
      message: 'An error occurred while retrieving repositories. Please try again.'
    });
  }
});

/**
 * @route GET /api/repositories/:repositoryId
 * @desc Get a specific repository by ID
 * @access Public (if public) or Private (if private and user has access)
 */
router.get('/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    
    const repository = await Repository.findById(repositoryId)
      .populate('owner', 'username fullName avatar bio location website company')
      .populate('collaborators.user', 'username fullName avatar')
      .populate('stars.user', 'username fullName avatar')
      .populate('watchers', 'username fullName avatar');

    if (!repository) {
      return res.status(404).json({
        error: 'Repository not found',
        message: 'The specified repository does not exist'
      });
    }

    // Check access for private repositories
    if (repository.isPrivate && (!req.user || !repository.hasAccess(req.user._id, 'read'))) {
      return res.status(404).json({
        error: 'Repository not found',
        message: 'The specified repository does not exist'
      });
    }

    // Add user-specific data if authenticated
    let userData = {};
    if (req.user) {
      const isStarred = repository.stars.some(star => star.user._id.toString() === req.user._id.toString());
      const isWatching = repository.watchers.some(watcher => watcher._id.toString() === req.user._id.toString());
      const canWrite = repository.hasAccess(req.user._id, 'write');
      const canAdmin = repository.hasAccess(req.user._id, 'admin');
      
      userData = {
        isStarred,
        isWatching,
        permissions: {
          read: true,
          write: canWrite,
          admin: canAdmin
        }
      };
    }

    res.json({
      repository,
      userData
    });

  } catch (error) {
    console.error('Repository retrieval error:', error);
    res.status(500).json({
      error: 'Repository retrieval failed',
      message: 'An error occurred while retrieving the repository. Please try again.'
    });
  }
});

/**
 * @route PUT /api/repositories/:repositoryId
 * @desc Update repository details
 * @access Private (repository owner or admin)
 */
router.put('/:repositoryId', [
  authenticateToken,
  checkRepositoryAccess('admin'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('isPrivate')
    .optional()
    .isBoolean()
    .withMessage('isPrivate must be a boolean value'),
  body('topics')
    .optional()
    .isArray()
    .withMessage('Topics must be an array'),
  body('license')
    .optional()
    .isString()
    .withMessage('License must be a string'),
  body('homepage')
    .optional()
    .isURL()
    .withMessage('Homepage must be a valid URL'),
  body('defaultBranch')
    .optional()
    .isString()
    .withMessage('Default branch must be a string')
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

    const { repositoryId } = req.params;
    const { description, isPrivate, topics, license, homepage, defaultBranch } = req.body;

    const repository = await Repository.findById(repositoryId);
    if (!repository) {
      return res.status(404).json({
        error: 'Repository not found',
        message: 'The specified repository does not exist'
      });
    }

    // Update repository fields
    if (description !== undefined) repository.description = description;
    if (isPrivate !== undefined) repository.isPrivate = isPrivate;
    if (topics !== undefined) repository.topics = topics;
    if (license !== undefined) repository.license = license;
    if (homepage !== undefined) repository.homepage = homepage;
    if (defaultBranch !== undefined) repository.defaultBranch = defaultBranch;

    repository.updatedAt = new Date();
    await repository.save();

    res.json({
      message: 'Repository updated successfully',
      repository
    });

  } catch (error) {
    console.error('Repository update error:', error);
    res.status(500).json({
      error: 'Repository update failed',
      message: 'An error occurred while updating the repository. Please try again.'
    });
  }
});

/**
 * @route DELETE /api/repositories/:repositoryId
 * @desc Delete a repository
 * @access Private (repository owner only)
 */
router.delete('/:repositoryId', [
  authenticateToken,
  checkRepositoryOwnership
], async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const repository = req.repository;

    // Remove repository from user's repositories
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { repositories: repositoryId }
    });

    // Remove repository from collaborators' repositories
    for (const collaborator of repository.collaborators) {
      await User.findByIdAndUpdate(collaborator.user, {
        $pull: { repositories: repositoryId }
      });
    }

    // Remove from starred repositories
    for (const star of repository.stars) {
      await User.findByIdAndUpdate(star.user, {
        $pull: { starredRepositories: repositoryId }
      });
    }

    // Remove from watchers
    for (const watcher of repository.watchers) {
      await User.findByIdAndUpdate(watcher, {
        $pull: { repositories: repositoryId }
      });
    }

    // Delete repository directory
    const repoPath = path.join(process.env.GIT_REPOS_PATH || './repositories', repository.owner.toString(), repository.name);
    if (await fs.pathExists(repoPath)) {
      await fs.remove(repoPath);
    }

    // Delete repository from database
    await Repository.findByIdAndDelete(repositoryId);

    res.json({
      message: 'Repository deleted successfully'
    });

  } catch (error) {
    console.error('Repository deletion error:', error);
    res.status(500).json({
      error: 'Repository deletion failed',
      message: 'An error occurred while deleting the repository. Please try again.'
    });
  }
});

/**
 * @route POST /api/repositories/:repositoryId/star
 * @desc Star/unstar a repository
 * @access Private
 */
router.post('/:repositoryId/star', [
  authenticateToken,
  checkRepositoryAccess('read')
], async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const userId = req.user._id;

    const repository = await Repository.findById(repositoryId);
    if (!repository) {
      return res.status(404).json({
        error: 'Repository not found',
        message: 'The specified repository does not exist'
      });
    }

    const isStarred = repository.stars.some(star => star.user.toString() === userId.toString());

    if (isStarred) {
      // Unstar repository
      repository.stars = repository.stars.filter(star => star.user.toString() !== userId.toString());
      await User.findByIdAndUpdate(userId, {
        $pull: { starredRepositories: repositoryId }
      });
    } else {
      // Star repository
      repository.stars.push({
        user: userId,
        starredAt: new Date()
      });
      await User.findByIdAndUpdate(userId, {
        $push: { starredRepositories: repositoryId }
      });
    }

    await repository.save();

    res.json({
      message: isStarred ? 'Repository unstarred successfully' : 'Repository starred successfully',
      isStarred: !isStarred,
      starCount: repository.stars.length
    });

  } catch (error) {
    console.error('Repository star error:', error);
    res.status(500).json({
      error: 'Star operation failed',
      message: 'An error occurred while starring/unstarring the repository. Please try again.'
    });
  }
});

/**
 * @route POST /api/repositories/:repositoryId/watch
 * @desc Watch/unwatch a repository
 * @access Private
 */
router.post('/:repositoryId/watch', [
  authenticateToken,
  checkRepositoryAccess('read')
], async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const userId = req.user._id;

    const repository = await Repository.findById(repositoryId);
    if (!repository) {
      return res.status(404).json({
        error: 'Repository not found',
        message: 'The specified repository does not exist'
      });
    }

    const isWatching = repository.watchers.some(watcher => watcher.toString() === userId.toString());

    if (isWatching) {
      // Unwatch repository
      repository.watchers = repository.watchers.filter(watcher => watcher.toString() !== userId.toString());
    } else {
      // Watch repository
      repository.watchers.push(userId);
    }

    await repository.save();

    res.json({
      message: isWatching ? 'Repository unwatched successfully' : 'Repository watched successfully',
      isWatching: !isWatching,
      watcherCount: repository.watchers.length
    });

  } catch (error) {
    console.error('Repository watch error:', error);
    res.status(500).json({
      error: 'Watch operation failed',
      message: 'An error occurred while watching/unwatching the repository. Please try again.'
    });
  }
});

/**
 * @route POST /api/repositories/:repositoryId/fork
 * @desc Fork a repository
 * @access Private
 */
router.post('/:repositoryId/fork', [
  authenticateToken,
  checkRepositoryAccess('read')
], async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const userId = req.user._id;

    const originalRepository = await Repository.findById(repositoryId);
    if (!originalRepository) {
      return res.status(404).json({
        error: 'Repository not found',
        message: 'The specified repository does not exist'
      });
    }

    // Check if user already forked this repository
    const existingFork = await Repository.findOne({
      owner: userId,
      parentRepository: repositoryId
    });

    if (existingFork) {
      return res.status(409).json({
        error: 'Repository already forked',
        message: 'You have already forked this repository'
      });
    }

    // Create fork directory
    const forkPath = path.join(process.env.GIT_REPOS_PATH || './repositories', userId.toString(), originalRepository.name);
    await fs.ensureDir(forkPath);

    // Copy repository content
    const originalPath = path.join(process.env.GIT_REPOS_PATH || './repositories', originalRepository.owner.toString(), originalRepository.name);
    await fs.copy(originalPath, forkPath);

    // Create forked repository in database
    const forkedRepository = new Repository({
      name: originalRepository.name,
      description: originalRepository.description,
      owner: userId,
      isPrivate: originalRepository.isPrivate,
      isFork: true,
      parentRepository: repositoryId,
      topics: originalRepository.topics,
      license: originalRepository.license,
      homepage: originalRepository.homepage,
      readme: originalRepository.readme,
      branches: originalRepository.branches,
      commits: originalRepository.commits,
      defaultBranch: originalRepository.defaultBranch
    });

    await forkedRepository.save();

    // Add to original repository's forks
    originalRepository.forks.push({
      repository: forkedRepository._id,
      forkedAt: new Date()
    });
    await originalRepository.save();

    // Add to user's repositories
    await User.findByIdAndUpdate(userId, {
      $push: { repositories: forkedRepository._id }
    });

    res.status(201).json({
      message: 'Repository forked successfully',
      repository: {
        id: forkedRepository._id,
        name: forkedRepository.name,
        fullName: forkedRepository.fullName,
        description: forkedRepository.description,
        isPrivate: forkedRepository.isPrivate,
        isFork: forkedRepository.isFork,
        parentRepository: forkedRepository.parentRepository,
        owner: {
          id: req.user._id,
          username: req.user.username
        },
        createdAt: forkedRepository.createdAt
      }
    });

  } catch (error) {
    console.error('Repository fork error:', error);
    res.status(500).json({
      error: 'Repository fork failed',
      message: 'An error occurred while forking the repository. Please try again.'
    });
  }
});

module.exports = router;
