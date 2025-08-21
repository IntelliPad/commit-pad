const express = require('express');
const router = express.Router();
const { authenticateToken: auth } = require('../middleware/auth');
const Repository = require('../models/Repository');
const Issue = require('../models/Issue');
const PullRequest = require('../models/PullRequest');
const User = require('../models/User');

/**
 * Global search across all entities
 * GET /api/search?q=query&type=all&limit=10&page=1
 */
router.get('/', auth, async (req, res) => {
  try {
    const { q, type = 'all', limit = 10, page = 1 } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchQuery = q.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    let results = {};

    if (type === 'all' || type === 'repositories') {
      const repositories = await Repository.find({
        $or: [
          { name: { $regex: searchQuery, $options: 'i' } },
          { description: { $regex: searchQuery, $options: 'i' } },
          { 'owner.username': { $regex: searchQuery, $options: 'i' } }
        ]
      })
      .populate('owner', 'username avatar')
      .limit(limitNum)
      .skip(skip)
      .sort({ stars: -1, updatedAt: -1 });

      results.repositories = repositories;
    }

    if (type === 'all' || type === 'issues') {
      const issues = await Issue.find({
        $or: [
          { title: { $regex: searchQuery, $options: 'i' } },
          { description: { $regex: searchQuery, $options: 'i' } },
          { 'author.username': { $regex: searchQuery, $options: 'i' } }
        ]
      })
      .populate('author', 'username avatar')
      .populate('repository', 'name owner')
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });

      results.issues = issues;
    }

    if (type === 'all' || type === 'pull-requests') {
      const pullRequests = await PullRequest.find({
        $or: [
          { title: { $regex: searchQuery, $options: 'i' } },
          { description: { $regex: searchQuery, $options: 'i' } },
          { 'author.username': { $regex: searchQuery, $options: 'i' } }
        ]
      })
      .populate('author', 'username avatar')
      .populate('repository', 'name owner')
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });

      results.pullRequests = pullRequests;
    }

    if (type === 'all' || type === 'users') {
      const users = await User.find({
        $or: [
          { username: { $regex: searchQuery, $options: 'i' } },
          { email: { $regex: searchQuery, $options: 'i' } },
          { bio: { $regex: searchQuery, $options: 'i' } }
        ]
      })
      .select('username avatar bio email')
      .limit(limitNum)
      .skip(skip)
      .sort({ followers: -1, createdAt: -1 });

      results.users = users;
    }

    res.json({
      query: searchQuery,
      type,
      page: parseInt(page),
      limit: limitNum,
      results
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Search repositories
 * GET /api/search/repositories?q=query&language=javascript&sort=stars&order=desc&limit=10&page=1
 */
router.get('/repositories', auth, async (req, res) => {
  try {
    const { 
      q, 
      language, 
      sort = 'updatedAt', 
      order = 'desc', 
      limit = 10, 
      page = 1 
    } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchQuery = q.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    let query = {
      $or: [
        { name: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } },
        { 'owner.username': { $regex: searchQuery, $options: 'i' } }
      ]
    };

    if (language) {
      query.language = { $regex: language, $options: 'i' };
    }

    const repositories = await Repository.find(query)
      .populate('owner', 'username avatar')
      .limit(limitNum)
      .skip(skip)
      .sort({ [sort]: sortOrder });

    const total = await Repository.countDocuments(query);

    res.json({
      query: searchQuery,
      language,
      sort,
      order,
      page: parseInt(page),
      limit: limitNum,
      total,
      repositories
    });

  } catch (error) {
    console.error('Repository search error:', error);
    res.status(500).json({ error: 'Repository search failed' });
  }
});

/**
 * Search issues
 * GET /api/search/issues?q=query&state=open&label=bug&limit=10&page=1
 */
router.get('/issues', auth, async (req, res) => {
  try {
    const { 
      q, 
      state, 
      label, 
      limit = 10, 
      page = 1 
    } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchQuery = q.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    let query = {
      $or: [
        { title: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } },
        { 'author.username': { $regex: searchQuery, $options: 'i' } }
      ]
    };

    if (state) {
      query.state = state;
    }

    if (label) {
      query.labels = { $in: [label] };
    }

    const issues = await Issue.find(query)
      .populate('author', 'username avatar')
      .populate('repository', 'name owner')
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Issue.countDocuments(query);

    res.json({
      query: searchQuery,
      state,
      label,
      page: parseInt(page),
      limit: limitNum,
      total,
      issues
    });

  } catch (error) {
    console.error('Issue search error:', error);
    res.status(500).json({ error: 'Issue search failed' });
  }
});

/**
 * Search pull requests
 * GET /api/search/pull-requests?q=query&state=open&limit=10&page=1
 */
router.get('/pull-requests', auth, async (req, res) => {
  try {
    const { 
      q, 
      state, 
      limit = 10, 
      page = 1 
    } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchQuery = q.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    let query = {
      $or: [
        { title: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } },
        { 'author.username': { $regex: searchQuery, $options: 'i' } }
      ]
    };

    if (state) {
      query.state = state;
    }

    const pullRequests = await PullRequest.find(query)
      .populate('author', 'username avatar')
      .populate('repository', 'name owner')
      .limit(limitNum)
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await PullRequest.countDocuments(query);

    res.json({
      query: searchQuery,
      state,
      page: parseInt(page),
      limit: limitNum,
      total,
      pullRequests
    });

  } catch (error) {
    console.error('Pull request search error:', error);
    res.status(500).json({ error: 'Pull request search failed' });
  }
});

/**
 * Search users
 * GET /api/search/users?q=query&limit=10&page=1
 */
router.get('/users', auth, async (req, res) => {
  try {
    const { q, limit = 10, page = 1 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchQuery = q.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const query = {
      $or: [
        { username: { $regex: searchQuery, $options: 'i' } },
        { email: { $regex: searchQuery, $options: 'i' } },
        { bio: { $regex: searchQuery, $options: 'i' } }
      ]
    };

    const users = await User.find(query)
      .select('username avatar bio email followers following')
      .limit(limitNum)
      .skip(skip)
      .sort({ followers: -1, createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      query: searchQuery,
      page: parseInt(page),
      limit: limitNum,
      total,
      users
    });

  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ error: 'User search failed' });
  }
});

module.exports = router;
