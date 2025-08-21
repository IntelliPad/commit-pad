const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware to authenticate JWT token
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        message: 'Please provide a valid authentication token'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'User not found or token is invalid'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'The provided token is invalid'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Your authentication token has expired. Please login again'
      });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

/**
 * Middleware to check if user has required permissions for a repository
 */
const checkRepositoryAccess = (requiredPermission = 'read') => {
  return async (req, res, next) => {
    try {
      const { repositoryId } = req.params;
      const userId = req.user._id;
      
      if (!repositoryId) {
        return res.status(400).json({ 
          error: 'Repository ID required',
          message: 'Repository ID is missing from request parameters'
        });
      }
      
      const Repository = require('../models/Repository');
      const repository = await Repository.findById(repositoryId)
        .populate('owner', 'username')
        .populate('collaborators.user', 'username');
      
      if (!repository) {
        return res.status(404).json({ 
          error: 'Repository not found',
          message: 'The specified repository does not exist'
        });
      }
      
      if (!repository.hasAccess(userId, requiredPermission)) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: `You don't have ${requiredPermission} permission for this repository`
        });
      }
      
      req.repository = repository;
      next();
    } catch (error) {
      console.error('Repository access check error:', error);
      return res.status(500).json({ 
        error: 'Access check error',
        message: 'An error occurred while checking repository access'
      });
    }
  };
};

/**
 * Middleware to check if user is repository owner
 */
const checkRepositoryOwnership = async (req, res, next) => {
  try {
    const { repositoryId } = req.params;
    const userId = req.user._id;
    
    if (!repositoryId) {
      return res.status(400).json({ 
        error: 'Repository ID required',
        message: 'Repository ID is missing from request parameters'
      });
    }
    
    const Repository = require('../models/Repository');
    const repository = await Repository.findById(repositoryId);
    
    if (!repository) {
      return res.status(404).json({ 
        error: 'Repository not found',
        message: 'The specified repository does not exist'
      });
    }
    
    if (repository.owner.toString() !== userId.toString()) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Only repository owners can perform this action'
      });
    }
    
    req.repository = repository;
    next();
  } catch (error) {
    console.error('Repository ownership check error:', error);
    return res.status(500).json({ 
      error: 'Ownership check error',
      message: 'An error occurred while checking repository ownership'
    });
  }
};

/**
 * Middleware to check if user is issue/PR author or has repository access
 */
const checkIssueAccess = async (req, res, next) => {
  try {
    const { issueId } = req.params;
    const userId = req.user._id;
    
    if (!issueId) {
      return res.status(400).json({ 
        error: 'Issue ID required',
        message: 'Issue ID is missing from request parameters'
      });
    }
    
    const Issue = require('../models/Issue');
    const issue = await Issue.findById(issueId)
      .populate('repository', 'owner collaborators isPrivate')
      .populate('author', 'username');
    
    if (!issue) {
      return res.status(404).json({ 
        error: 'Issue not found',
        message: 'The specified issue does not exist'
      });
    }
    
    // Check if user is the author
    if (issue.author._id.toString() === userId.toString()) {
      req.issue = issue;
      return next();
    }
    
    // Check repository access
    if (!issue.repository.hasAccess(userId, 'read')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You don\'t have access to this issue'
      });
    }
    
    req.issue = issue;
    next();
  } catch (error) {
    console.error('Issue access check error:', error);
    return res.status(500).json({ 
      error: 'Access check error',
      message: 'An error occurred while checking issue access'
    });
  }
};

/**
 * Middleware to check if user is pull request author or has repository access
 */
const checkPullRequestAccess = async (req, res, next) => {
  try {
    const { pullRequestId } = req.params;
    const userId = req.user._id;
    
    if (!pullRequestId) {
      return res.status(400).json({ 
        error: 'Pull Request ID required',
        message: 'Pull Request ID is missing from request parameters'
      });
    }
    
    const PullRequest = require('../models/PullRequest');
    const pullRequest = await PullRequest.findById(pullRequestId)
      .populate('repository', 'owner collaborators isPrivate')
      .populate('author', 'username');
    
    if (!pullRequest) {
      return res.status(404).json({ 
        error: 'Pull Request not found',
        message: 'The specified pull request does not exist'
      });
    }
    
    // Check if user is the author
    if (pullRequest.author._id.toString() === userId.toString()) {
      req.pullRequest = pullRequest;
      return next();
    }
    
    // Check repository access
    if (!pullRequest.repository.hasAccess(userId, 'read')) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You don\'t have access to this pull request'
      });
    }
    
    req.pullRequest = pullRequest;
    next();
  } catch (error) {
    console.error('Pull Request access check error:', error);
    return res.status(500).json({ 
      error: 'Access check error',
      message: 'An error occurred while checking pull request access'
    });
  }
};

/**
 * Middleware to check if user is the target user or admin
 */
const checkUserAccess = async (req, res, next) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user._id;
    
    if (!targetUserId) {
      return res.status(400).json({ 
        error: 'User ID required',
        message: 'User ID is missing from request parameters'
      });
    }
    
    // Users can only access their own profile unless they're accessing public data
    if (targetUserId !== currentUserId.toString()) {
      // Check if the target user exists and is public
      const User = require('../models/User');
      const targetUser = await User.findById(targetUserId);
      
      if (!targetUser) {
        return res.status(404).json({ 
          error: 'User not found',
          message: 'The specified user does not exist'
        });
      }
      
      if (!targetUser.isPublic) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'This user profile is private'
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('User access check error:', error);
    return res.status(500).json({ 
      error: 'Access check error',
      message: 'An error occurred while checking user access'
    });
  }
};

module.exports = {
  authenticateToken,
  checkRepositoryAccess,
  checkRepositoryOwnership,
  checkIssueAccess,
  checkPullRequestAccess,
  checkUserAccess
};
