const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Issue = require('../models/Issue');
const Repository = require('../models/Repository');
const { 
  authenticateToken, 
  checkRepositoryAccess, 
  checkIssueAccess 
} = require('../middleware/auth');

const router = express.Router();

/**
 * @route POST /api/issues
 * @desc Create a new issue
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
  body('assignees')
    .optional()
    .isArray()
    .withMessage('Assignees must be an array'),
  body('labels')
    .optional()
    .isArray()
    .withMessage('Labels must be an array'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Priority must be one of: low, medium, high, critical'),
  body('type')
    .optional()
    .isIn(['bug', 'feature', 'enhancement', 'task', 'question'])
    .withMessage('Type must be one of: bug, feature, enhancement, task, question')
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
      assignees, 
      labels, 
      priority, 
      type 
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

    // Create issue
    const issue = new Issue({
      title,
      description,
      repository: repositoryId,
      author: authorId,
      assignees: assignees || [],
      labels: labels || [],
      priority: priority || 'medium',
      type: type || 'bug'
    });

    await issue.save();

    // Add issue to repository
    repository.issues.push(issue._id);
    repository.lastActivity = new Date();
    await repository.save();

    // Populate author and repository for response
    await issue.populate('author', 'username fullName avatar');
    await issue.populate('repository', 'name owner');

    res.status(201).json({
      message: 'Issue created successfully',
      issue
    });

  } catch (error) {
    console.error('Issue creation error:', error);
    res.status(500).json({
      error: 'Issue creation failed',
      message: 'An error occurred while creating the issue. Please try again.'
    });
  }
});

/**
 * @route GET /api/issues
 * @desc Get issues with filtering and pagination
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
    .isIn(['open', 'closed'])
    .withMessage('State must be either open or closed'),
  query('author')
    .optional()
    .isMongoId()
    .withMessage('Author ID must be a valid MongoDB ID'),
  query('assignee')
    .optional()
    .isMongoId()
    .withMessage('Assignee ID must be a valid MongoDB ID'),
  query('label')
    .optional()
    .isString()
    .withMessage('Label must be a string'),
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Priority must be one of: low, medium, high, critical'),
  query('type')
    .optional()
    .isIn(['bug', 'feature', 'enhancement', 'task', 'question'])
    .withMessage('Type must be one of: bug, feature, enhancement, task, question'),
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
      label,
      priority,
      type,
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

    if (label) {
      filter['labels.name'] = { $regex: label, $options: 'i' };
    }

    if (priority) {
      filter.priority = priority;
    }

    if (type) {
      filter.type = type;
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
    
    const issues = await Issue.find(filter)
      .populate('author', 'username fullName avatar')
      .populate('repository', 'name owner')
      .populate('assignees', 'username fullName avatar')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Issue.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.json({
      issues,
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
    console.error('Issue retrieval error:', error);
    res.status(500).json({
      error: 'Issue retrieval failed',
      message: 'An error occurred while retrieving issues. Please try again.'
    });
  }
});

/**
 * @route GET /api/issues/:issueId
 * @desc Get a specific issue by ID
 * @access Public (if public repository) or Private (if private repository and user has access)
 */
router.get('/:issueId', async (req, res) => {
  try {
    const { issueId } = req.params;
    
    const issue = await Issue.findById(issueId)
      .populate('author', 'username fullName avatar')
      .populate('repository', 'name owner isPrivate')
      .populate('assignees', 'username fullName avatar')
      .populate('closedBy', 'username fullName avatar');

    if (!issue) {
      return res.status(404).json({
        error: 'Issue not found',
        message: 'The specified issue does not exist'
      });
    }

    // Check repository access
    if (issue.repository.isPrivate && (!req.user || !issue.repository.hasAccess(req.user._id, 'read'))) {
      return res.status(404).json({
        error: 'Issue not found',
        message: 'The specified issue does not exist'
      });
    }

    res.json({
      issue
    });

  } catch (error) {
    console.error('Issue retrieval error:', error);
    res.status(500).json({
      error: 'Issue retrieval failed',
      message: 'An error occurred while retrieving the issue. Please try again.'
    });
  }
});

/**
 * @route PUT /api/issues/:issueId
 * @desc Update an issue
 * @access Private (issue author or repository admin)
 */
router.put('/:issueId', [
  authenticateToken,
  checkIssueAccess,
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
  body('labels')
    .optional()
    .isArray()
    .withMessage('Labels must be an array'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Priority must be one of: low, medium, high, critical'),
  body('type')
    .optional()
    .isIn(['bug', 'feature', 'enhancement', 'task', 'question'])
    .withMessage('Type must be one of: bug, feature, enhancement, task, question')
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

    const { issueId } = req.params;
    const { title, description, assignees, labels, priority, type } = req.body;
    const issue = req.issue;

    // Check if user can edit (author or repository admin)
    const canEdit = issue.author.toString() === req.user._id.toString() || 
                   issue.repository.hasAccess(req.user._id, 'admin');

    if (!canEdit) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit issues you created or if you have admin access to the repository'
      });
    }

    // Update issue fields
    if (title !== undefined) issue.title = title;
    if (description !== undefined) issue.description = description;
    if (assignees !== undefined) issue.assignees = assignees;
    if (labels !== undefined) issue.labels = labels;
    if (priority !== undefined) issue.priority = priority;
    if (type !== undefined) issue.type = type;

    issue.updatedAt = new Date();
    await issue.save();

    // Update repository last activity
    await Repository.findByIdAndUpdate(issue.repository, {
      lastActivity: new Date()
    });

    res.json({
      message: 'Issue updated successfully',
      issue
    });

  } catch (error) {
    console.error('Issue update error:', error);
    res.status(500).json({
      error: 'Issue update failed',
      message: 'An error occurred while updating the issue. Please try again.'
    });
  }
});

/**
 * @route DELETE /api/issues/:issueId
 * @desc Delete an issue
 * @access Private (issue author or repository admin)
 */
router.delete('/:issueId', [
  authenticateToken,
  checkIssueAccess
], async (req, res) => {
  try {
    const { issueId } = req.params;
    const issue = req.issue;

    // Check if user can delete (author or repository admin)
    const canDelete = issue.author.toString() === req.user._id.toString() || 
                     issue.repository.hasAccess(req.user._id, 'admin');

    if (!canDelete) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete issues you created or if you have admin access to the repository'
      });
    }

    // Remove issue from repository
    await Repository.findByIdAndUpdate(issue.repository, {
      $pull: { issues: issueId },
      lastActivity: new Date()
    });

    // Delete issue
    await Issue.findByIdAndDelete(issueId);

    res.json({
      message: 'Issue deleted successfully'
    });

  } catch (error) {
    console.error('Issue deletion error:', error);
    res.status(500).json({
      error: 'Issue deletion failed',
      message: 'An error occurred while deleting the issue. Please try again.'
    });
  }
});

/**
 * @route POST /api/issues/:issueId/close
 * @desc Close an issue
 * @access Private (issue author or repository admin)
 */
router.post('/:issueId/close', [
  authenticateToken,
  checkIssueAccess
], async (req, res) => {
  try {
    const issue = req.issue;

    // Check if user can close (author or repository admin)
    const canClose = issue.author.toString() === req.user._id.toString() || 
                    issue.repository.hasAccess(req.user._id, 'admin');

    if (!canClose) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only close issues you created or if you have admin access to the repository'
      });
    }

    if (issue.state === 'closed') {
      return res.status(400).json({
        error: 'Issue already closed',
        message: 'This issue is already closed'
      });
    }

    await issue.closeIssue(req.user._id);

    // Update repository last activity
    await Repository.findByIdAndUpdate(issue.repository, {
      lastActivity: new Date()
    });

    res.json({
      message: 'Issue closed successfully',
      issue
    });

  } catch (error) {
    console.error('Issue close error:', error);
    res.status(500).json({
      error: 'Issue close failed',
      message: 'An error occurred while closing the issue. Please try again.'
    });
  }
});

/**
 * @route POST /api/issues/:issueId/reopen
 * @desc Reopen an issue
 * @access Private (issue author or repository admin)
 */
router.post('/:issueId/reopen', [
  authenticateToken,
  checkIssueAccess
], async (req, res) => {
  try {
    const issue = req.issue;

    // Check if user can reopen (author or repository admin)
    const canReopen = issue.author.toString() === req.user._id.toString() || 
                     issue.repository.hasAccess(req.user._id, 'admin');

    if (!canReopen) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only reopen issues you created or if you have admin access to the repository'
      });
    }

    if (issue.state === 'open') {
      return res.status(400).json({
        error: 'Issue already open',
        message: 'This issue is already open'
      });
    }

    await issue.reopenIssue();

    // Update repository last activity
    await Repository.findByIdAndUpdate(issue.repository, {
      lastActivity: new Date()
    });

    res.json({
      message: 'Issue reopened successfully',
      issue
    });

  } catch (error) {
    console.error('Issue reopen error:', error);
    res.status(500).json({
      error: 'Issue reopen failed',
      message: 'An error occurred while reopening the issue. Please try again.'
    });
  }
});

/**
 * @route POST /api/issues/:issueId/comment
 * @desc Add a comment to an issue
 * @access Private (repository access required)
 */
router.post('/:issueId/comment', [
  authenticateToken,
  checkIssueAccess,
  body('content')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Comment content must be 1-10000 characters')
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

    const { content } = req.body;
    const issue = req.issue;

    await issue.addComment(req.user._id, content);

    // Update repository last activity
    await Repository.findByIdAndUpdate(issue.repository, {
      lastActivity: new Date()
    });

    // Get the latest comment
    const latestComment = issue.comments[issue.comments.length - 1];
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
 * @route POST /api/issues/:issueId/reaction
 * @desc Add/remove a reaction to an issue
 * @access Private (repository access required)
 */
router.post('/:issueId/reaction', [
  authenticateToken,
  checkIssueAccess,
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
    const issue = req.issue;

    if (action === 'add') {
      await issue.addReaction(req.user._id, type);
    } else {
      await issue.removeReaction(req.user._id, type);
    }

    res.json({
      message: `Reaction ${action}ed successfully`,
      issue: {
        id: issue._id,
        reactionCount: issue.reactionCount,
        reactions: issue.reactions
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
