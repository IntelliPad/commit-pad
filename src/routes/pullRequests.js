const express = require('express');
const { body, validationResult, query } = require('express-validator');
const PullRequest = require('../models/PullRequest');
const Repository = require('../models/Repository');
const { 
  authenticateToken, 
  checkRepositoryAccess, 
  checkPullRequestAccess 
} = require('../middleware/auth');

const router = express.Router();

/**
 * @route POST /api/pull-requests
 * @desc Create a new pull request
 * @access Private (repository access required)
 */
router.post('/', [
  authenticateToken,
  body('title')
    .isLength({ min: 1, max: 200 })
    .trim()
    .withMessage('Title must be 1-200 characters'),
  body('description')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Description must be 1-10000 characters'),
  body('repositoryId')
    .isMongoId()
    .withMessage('Valid repository ID is required'),
  body('sourceBranch')
    .isLength({ min: 1 })
    .trim()
    .withMessage('Source branch is required'),
  body('targetBranch')
    .isLength({ min: 1 })
    .trim()
    .withMessage('Target branch is required'),
  body('assignees')
    .optional()
    .isArray()
    .withMessage('Assignees must be an array'),
  body('reviewers')
    .optional()
    .isArray()
    .withMessage('Reviewers must be an array'),
  body('labels')
    .optional()
    .isArray()
    .withMessage('Labels must be an array'),
  body('isDraft')
    .optional()
    .isBoolean()
    .withMessage('isDraft must be a boolean value')
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

    const { 
      title, 
      description, 
      repositoryId, 
      sourceBranch, 
      targetBranch, 
      assignees, 
      reviewers, 
      labels, 
      isDraft 
    } = req.body;
    const authorId = req.user._id;

    // Check repository access
    const repository = await Repository.findById(repositoryId);
    if (!repository) {
      return res.status(404).json({
        error: 'Repository not found',
        message: 'The specified repository does not exist'
      });
    }

    if (!repository.hasAccess(authorId, 'read')) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You don\'t have access to this repository'
      });
    }

    // Create pull request
    const pullRequest = new PullRequest({
      title,
      description,
      repository: repositoryId,
      author: authorId,
      sourceBranch,
      targetBranch,
      assignees: assignees || [],
      reviewers: reviewers || [],
      labels: labels || [],
      isDraft: isDraft || false
    });

    await pullRequest.save();

    // Add pull request to repository
    repository.pullRequests.push(pullRequest._id);
    repository.lastActivity = new Date();
    await repository.save();

    // Populate author and repository for response
    await pullRequest.populate('author', 'username fullName avatar');
    await pullRequest.populate('repository', 'name owner');

    res.status(201).json({
      message: 'Pull request created successfully',
      pullRequest
    });

  } catch (error) {
    console.error('Pull request creation error:', error);
    res.status(500).json({
      error: 'Pull request creation failed',
      message: 'An error occurred while creating the pull request. Please try again.'
    });
  }
});

/**
 * @route GET /api/pull-requests
 * @desc Get pull requests with filtering and pagination
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
  query('repositoryId')
    .optional()
    .isMongoId()
    .withMessage('Repository ID must be a valid MongoDB ID'),
  query('state')
    .optional()
    .isIn(['open', 'closed', 'merged'])
    .withMessage('State must be one of: open, closed, merged'),
  query('author')
    .optional()
    .isMongoId()
    .withMessage('Author ID must be a valid MongoDB ID'),
  query('assignee')
    .optional()
    .isMongoId()
    .withMessage('Assignee ID must be a valid MongoDB ID'),
  query('reviewer')
    .optional()
    .isMongoId()
    .withMessage('Reviewer ID must be a valid MongoDB ID'),
  query('label')
    .optional()
    .isString()
    .withMessage('Label must be a string'),
  query('isDraft')
    .optional()
    .isBoolean()
    .withMessage('isDraft must be a boolean value'),
  query('sort')
    .optional()
    .isIn(['created', 'updated', 'comments', 'reactions'])
    .withMessage('Sort must be one of: created, updated, comments, reactions'),
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be either asc or desc')
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
      repositoryId,
      state,
      author,
      assignee,
      reviewer,
      label,
      isDraft,
      sort = 'created',
      order = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    if (repositoryId) {
      filter.repository = repositoryId;
    }

    if (state) {
      filter.state = state;
    }

    if (author) {
      filter.author = author;
    }

    if (assignee) {
      filter.assignees = assignee;
    }

    if (reviewer) {
      filter['reviews.reviewer'] = reviewer;
    }

    if (label) {
      filter['labels.name'] = { $regex: label, $options: 'i' };
    }

    if (isDraft !== undefined) {
      filter.isDraft = isDraft;
    }

    // If no repository specified and user is not authenticated, only show public repositories
    if (!repositoryId && !req.user) {
      const publicRepos = await Repository.find({ isPrivate: false }).select('_id');
      filter.repository = { $in: publicRepos.map(repo => repo._id) };
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
      case 'comments':
        sortObj.commentCount = order === 'asc' ? 1 : -1;
        break;
      case 'reactions':
        sortObj.reactionCount = order === 'asc' ? 1 : -1;
        break;
      default:
        sortObj.createdAt = -1;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    
    const pullRequests = await PullRequest.find(filter)
      .populate('author', 'username fullName avatar')
      .populate('repository', 'name owner')
      .populate('assignees', 'username fullName avatar')
      .populate('reviews.reviewer', 'username fullName avatar')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PullRequest.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.json({
      pullRequests,
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
    console.error('Pull request retrieval error:', error);
    res.status(500).json({
      error: 'Pull request retrieval failed',
      message: 'An error occurred while retrieving pull requests. Please try again.'
    });
  }
});

/**
 * @route GET /api/pull-requests/:pullRequestId
 * @desc Get a specific pull request by ID
 * @access Public (if public repository) or Private (if private repository and user has access)
 */
router.get('/:pullRequestId', async (req, res) => {
  try {
    const { pullRequestId } = req.params;
    
    const pullRequest = await PullRequest.findById(pullRequestId)
      .populate('author', 'username fullName avatar')
      .populate('repository', 'name owner isPrivate')
      .populate('assignees', 'username fullName avatar')
      .populate('reviews.reviewer', 'username fullName avatar')
      .populate('mergedBy', 'username fullName avatar')
      .populate('closedBy', 'username fullName avatar');

    if (!pullRequest) {
      return res.status(404).json({
        error: 'Pull request not found',
        message: 'The specified pull request does not exist'
      });
    }

    // Check repository access
    if (pullRequest.repository.isPrivate && (!req.user || !pullRequest.repository.hasAccess(req.user._id, 'read'))) {
      return res.status(404).json({
        error: 'Pull request not found',
        message: 'The specified pull request does not exist'
      });
    }

    res.json({
      pullRequest
    });

  } catch (error) {
    console.error('Pull request retrieval error:', error);
    res.status(500).json({
      error: 'Pull request retrieval failed',
      message: 'An error occurred while retrieving the pull request. Please try again.'
    });
  }
});

/**
 * @route PUT /api/pull-requests/:pullRequestId
 * @desc Update a pull request
 * @access Private (pull request author or repository admin)
 */
router.put('/:pullRequestId', [
  authenticateToken,
  checkPullRequestAccess,
  body('title')
    .optional()
    .isLength({ min: 1, max: 200 })
    .trim()
    .withMessage('Title must be 1-200 characters'),
  body('description')
    .optional()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Description must be 1-10000 characters'),
  body('assignees')
    .optional()
    .isArray()
    .withMessage('Assignees must be an array'),
  body('reviewers')
    .optional()
    .isArray()
    .withMessage('Reviewers must be an array'),
  body('labels')
    .optional()
    .isArray()
    .withMessage('Labels must be an array'),
  body('isDraft')
    .optional()
    .isBoolean()
    .withMessage('isDraft must be a boolean value')
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

    const { pullRequestId } = req.params;
    const { title, description, assignees, reviewers, labels, isDraft } = req.body;
    const pullRequest = req.pullRequest;

    // Check if user can edit (author or repository admin)
    const canEdit = pullRequest.author.toString() === req.user._id.toString() || 
                   pullRequest.repository.hasAccess(req.user._id, 'admin');

    if (!canEdit) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit pull requests you created or if you have admin access to the repository'
      });
    }

    // Update pull request fields
    if (title !== undefined) pullRequest.title = title;
    if (description !== undefined) pullRequest.description = description;
    if (assignees !== undefined) pullRequest.assignees = assignees;
    if (reviewers !== undefined) pullRequest.reviewers = reviewers;
    if (labels !== undefined) pullRequest.labels = labels;
    if (isDraft !== undefined) pullRequest.isDraft = isDraft;

    pullRequest.updatedAt = new Date();
    await pullRequest.save();

    // Update repository last activity
    await Repository.findByIdAndUpdate(pullRequest.repository, {
      lastActivity: new Date()
    });

    res.json({
      message: 'Pull request updated successfully',
      pullRequest
    });

  } catch (error) {
    console.error('Pull request update error:', error);
    res.status(500).json({
      error: 'Pull request update failed',
      message: 'An error occurred while updating the pull request. Please try again.'
    });
  }
});

/**
 * @route DELETE /api/pull-requests/:pullRequestId
 * @desc Delete a pull request
 * @access Private (pull request author or repository admin)
 */
router.delete('/:pullRequestId', [
  authenticateToken,
  checkPullRequestAccess
], async (req, res) => {
  try {
    const { pullRequestId } = req.params;
    const pullRequest = req.pullRequest;

    // Check if user can delete (author or repository admin)
    const canDelete = pullRequest.author.toString() === req.user._id.toString() || 
                     pullRequest.repository.hasAccess(req.user._id, 'admin');

    if (!canDelete) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete pull requests you created or if you have admin access to the repository'
      });
    }

    // Remove pull request from repository
    await Repository.findByIdAndUpdate(pullRequest.repository, {
      $pull: { pullRequests: pullRequestId },
      lastActivity: new Date()
    });

    // Delete pull request
    await PullRequest.findByIdAndDelete(pullRequestId);

    res.json({
      message: 'Pull request deleted successfully'
    });

  } catch (error) {
    console.error('Pull request deletion error:', error);
    res.status(500).json({
      error: 'Pull request deletion failed',
      message: 'An error occurred while deleting the pull request. Please try again.'
    });
  }
});

/**
 * @route POST /api/pull-requests/:pullRequestId/close
 * @desc Close a pull request
 * @access Private (pull request author or repository admin)
 */
router.post('/:pullRequestId/close', [
  authenticateToken,
  checkPullRequestAccess
], async (req, res) => {
  try {
    const pullRequest = req.pullRequest;

    // Check if user can close (author or repository admin)
    const canClose = pullRequest.author.toString() === req.user._id.toString() || 
                    pullRequest.repository.hasAccess(req.user._id, 'admin');

    if (!canClose) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only close pull requests you created or if you have admin access to the repository'
      });
    }

    if (pullRequest.state === 'closed') {
      return res.status(400).json({
        error: 'Pull request already closed',
        message: 'This pull request is already closed'
      });
    }

    await pullRequest.close(req.user._id);

    // Update repository last activity
    await Repository.findByIdAndUpdate(pullRequest.repository, {
      lastActivity: new Date()
    });

    res.json({
      message: 'Pull request closed successfully',
      pullRequest
    });

  } catch (error) {
    console.error('Pull request close error:', error);
    res.status(500).json({
      error: 'Pull request close failed',
      message: 'An error occurred while closing the pull request. Please try again.'
    });
  }
});

/**
 * @route POST /api/pull-requests/:pullRequestId/reopen
 * @desc Reopen a pull request
 * @access Private (pull request author or repository admin)
 */
router.post('/:pullRequestId/reopen', [
  authenticateToken,
  checkPullRequestAccess
], async (req, res) => {
  try {
    const pullRequest = req.pullRequest;

    // Check if user can reopen (author or repository admin)
    const canReopen = pullRequest.author.toString() === req.user._id.toString() || 
                     pullRequest.repository.hasAccess(req.user._id, 'admin');

    if (!canReopen) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only reopen pull requests you created or if you have admin access to the repository'
      });
    }

    if (pullRequest.state === 'open') {
      return res.status(400).json({
        error: 'Pull request already open',
        message: 'This pull request is already open'
      });
    }

    await pullRequest.reopen();

    // Update repository last activity
    await Repository.findByIdAndUpdate(pullRequest.repository, {
      lastActivity: new Date()
    });

    res.json({
      message: 'Pull request reopened successfully',
      pullRequest
    });

  } catch (error) {
    console.error('Pull request reopen error:', error);
    res.status(500).json({
      error: 'Pull request reopen failed',
      message: 'An error occurred while reopening the pull request. Please try again.'
    });
  }
});

/**
 * @route POST /api/pull-requests/:pullRequestId/merge
 * @desc Merge a pull request
 * @access Private (repository admin or authorized reviewer)
 */
router.post('/:pullRequestId/merge', [
  authenticateToken,
  checkPullRequestAccess,
  body('mergeCommitSha')
    .optional()
    .isString()
    .withMessage('Merge commit SHA must be a string')
], async (req, res) => {
  try {
    const { mergeCommitSha } = req.body;
    const pullRequest = req.pullRequest;

    // Check if user can merge (repository admin or authorized reviewer)
    const canMerge = pullRequest.repository.hasAccess(req.user._id, 'admin') ||
                    pullRequest.reviewers.some(review => 
                      review.user.toString() === req.user._id.toString() && 
                      review.status === 'approved'
                    );

    if (!canMerge) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You don\'t have permission to merge this pull request'
      });
    }

    if (pullRequest.state !== 'open') {
      return res.status(400).json({
        error: 'Pull request not mergeable',
        message: 'This pull request is not in an open state and cannot be merged'
      });
    }

    if (pullRequest.isDraft) {
      return res.status(400).json({
        error: 'Draft pull request',
        message: 'Draft pull requests cannot be merged'
      });
    }

    // TODO: Implement actual git merge logic
    // For now, just update the pull request state
    await pullRequest.merge(req.user._id, mergeCommitSha || 'mock-merge-commit-sha');

    // Update repository last activity
    await Repository.findByIdAndUpdate(pullRequest.repository, {
      lastActivity: new Date()
    });

    res.json({
      message: 'Pull request merged successfully',
      pullRequest
    });

  } catch (error) {
    console.error('Pull request merge error:', error);
    res.status(500).json({
      error: 'Pull request merge failed',
      message: 'An error occurred while merging the pull request. Please try again.'
    });
  }
});

/**
 * @route POST /api/pull-requests/:pullRequestId/comment
 * @desc Add a comment to a pull request
 * @access Private (repository access required)
 */
router.post('/:pullRequestId/comment', [
  authenticateToken,
  checkPullRequestAccess,
  body('content')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Comment content must be 1-10000 characters'),
  body('line')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Line number must be a positive integer'),
  body('path')
    .optional()
    .isString()
    .withMessage('File path must be a string')
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

    const { content, line, path } = req.body;
    const pullRequest = req.pullRequest;

    await pullRequest.addComment(req.user._id, content, line, path);

    // Update repository last activity
    await Repository.findByIdAndUpdate(pullRequest.repository, {
      lastActivity: new Date()
    });

    // Get the latest comment
    const latestComment = pullRequest.comments[pullRequest.comments.length - 1];
    await latestComment.populate('author', 'username fullName avatar');

    res.json({
      message: 'Comment added successfully',
      comment: latestComment
    });

  } catch (error) {
    console.error('Comment addition error:', error);
    res.status(500).json({
      error: 'Comment addition failed',
      message: 'An error occurred while adding the comment. Please try again.'
    });
  }
});

/**
 * @route POST /api/pull-requests/:pullRequestId/review
 * @desc Add a review to a pull request
 * @access Private (repository access required)
 */
router.post('/:pullRequestId/review', [
  authenticateToken,
  checkPullRequestAccess,
  body('state')
    .isIn(['approved', 'changes_requested', 'commented'])
    .withMessage('Review state must be one of: approved, changes_requested, commented'),
  body('body')
    .optional()
    .isLength({ max: 10000 })
    .withMessage('Review body must be less than 10000 characters'),
  body('commitId')
    .optional()
    .isString()
    .withMessage('Commit ID must be a string')
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

    const { state, body, commitId } = req.body;
    const pullRequest = req.pullRequest;

    await pullRequest.addReview(req.user._id, state, body, commitId);

    // Update repository last activity
    await Repository.findByIdAndUpdate(pullRequest.repository, {
      lastActivity: new Date()
    });

    res.json({
      message: 'Review added successfully',
      pullRequest: {
        id: pullRequest._id,
        reviewCount: pullRequest.reviewCount,
        reviews: pullRequest.reviews
      }
    });

  } catch (error) {
    console.error('Review addition error:', error);
    res.status(500).json({
      error: 'Review addition failed',
      message: 'An error occurred while adding the review. Please try again.'
    });
  }
});

/**
 * @route POST /api/pull-requests/:pullRequestId/reaction
 * @desc Add/remove a reaction to a pull request
 * @access Private (repository access required)
 */
router.post('/:pullRequestId/reaction', [
  authenticateToken,
  checkPullRequestAccess,
  body('type')
    .isIn(['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀'])
    .withMessage('Invalid reaction type'),
  body('action')
    .isIn(['add', 'remove'])
    .withMessage('Action must be either add or remove')
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

    const { type, action } = req.body;
    const pullRequest = req.pullRequest;

    if (action === 'add') {
      await pullRequest.addReaction(req.user._id, type);
    } else {
      await pullRequest.removeReaction(req.user._id, type);
    }

    res.json({
      message: `Reaction ${action}ed successfully`,
      pullRequest: {
        id: pullRequest._id,
        reactionCount: pullRequest.reactionCount,
        reactions: pullRequest.reactions
      }
    });

  } catch (error) {
    console.error('Reaction operation error:', error);
    res.status(500).json({
      error: 'Reaction operation failed',
      message: 'An error occurred while processing the reaction. Please try again.'
    });
  }
});

module.exports = router;
