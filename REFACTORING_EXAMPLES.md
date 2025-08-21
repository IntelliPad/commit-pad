# Refactoring Examples - Continuing the Migration

This document shows examples of how to continue refactoring the remaining route files to use the new service and repository architecture.

## Example 1: Refactoring Repository Routes

### Before (Current state in `src/routes/repositories.js`)
```javascript
router.post('/', [
  authenticateToken,
  // ... validation
], async (req, res) => {
  try {
    // 50+ lines of business logic mixed with HTTP handling
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
      defaultBranch: 'main',
      path: repoPath
    });

    await repository.save();

    // Update user's repository count
    const user = await User.findById(ownerId);
    if (user) {
      user.repositoryCount = (user.repositoryCount || 0) + 1;
      await user.save();
    }

    res.status(201).json({
      message: 'Repository created successfully',
      repository
    });

  } catch (error) {
    console.error('Repository creation error:', error);
    res.status(500).json({
      error: 'Repository creation failed',
      message: 'An error occurred while creating the repository. Please try again.'
    });
  }
});
```

### After (Using RepositoryService)
```javascript
router.post('/', [
  authenticateToken,
  // ... validation
], async (req, res) => {
  try {
    const result = await repositoryService.createRepository(req.body, req.user._id);

    res.status(201).json({
      message: 'Repository created successfully',
      repository: result
    });

  } catch (error) {
    console.error('Repository creation error:', error);
    
    if (error.message === 'Repository name already exists') {
      return res.status(409).json({
        error: 'Repository name already exists',
        message: 'You already have a repository with this name. Please choose a different name.'
      });
    }

    res.status(500).json({
      error: 'Repository creation failed',
      message: 'An error occurred while creating the repository. Please try again.'
    });
  }
});
```

## Example 2: Refactoring Search Routes

### Before (Current state in `src/routes/search.js`)
```javascript
router.get('/', [
  query('q').notEmpty().withMessage('Search query is required'),
  query('type').optional().isIn(['all', 'users', 'repositories']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const { q: query, type = 'all', page = 1, limit = 20 } = req.query;
    
    // 30+ lines of search logic mixed with HTTP handling
    let results = {};
    
    if (type === 'all' || type === 'users') {
      const userFilter = { isPublic: true };
      if (query) {
        userFilter.$or = [
          { username: { $regex: query, $options: 'i' } },
          { fullName: { $regex: query, $options: 'i' } },
          { bio: { $regex: query, $options: 'i' } }
        ];
      }
      
      const users = await User.find(userFilter)
        .select('username fullName bio avatar location company')
        .limit(Math.ceil(limit / 2));
      
      results.users = users;
    }

    if (type === 'all' || type === 'repositories') {
      const repoFilter = { isPublic: true };
      if (query) {
        repoFilter.$or = [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { topics: { $in: [new RegExp(query, 'i')] } }
        ];
      }
      
      const repositories = await Repository.find(repoFilter)
        .populate('owner', 'username fullName avatar')
        .limit(Math.ceil(limit / 2));
      
      results.repositories = repositories;
    }

    res.json({
      query,
      type,
      results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'An error occurred while performing the search. Please try again.'
    });
  }
});
```

### After (Using SearchService)
```javascript
router.get('/', [
  query('q').notEmpty().withMessage('Search query is required'),
  query('type').optional().isIn(['all', 'users', 'repositories']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const { q: query, type = 'all', page = 1, limit = 20 } = req.query;
    
    const results = await searchService.globalSearch(query, {
      type,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      query,
      type,
      ...results
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'An error occurred while performing the search. Please try again.'
    });
  }
});
```

## Example 3: Refactoring User Profile Update

### Before (Current state in `src/routes/users.js`)
```javascript
router.put('/profile', [
  authenticateToken,
  body('fullName').optional().isLength({ min: 1, max: 100 }),
  body('bio').optional().isLength({ max: 500 }),
  body('location').optional().isLength({ max: 100 }),
  body('website').optional().isURL(),
  body('company').optional().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user._id;
    const updateData = req.body;

    // Remove fields that shouldn't be updated
    delete updateData.password;
    delete updateData.email;
    delete updateData.username;

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser.getPublicProfile()
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      error: 'Profile update failed',
      message: 'An error occurred while updating your profile. Please try again.'
    });
  }
});
```

### After (Using UserService)
```javascript
router.put('/profile', [
  authenticateToken,
  body('fullName').optional().isLength({ min: 1, max: 100 }),
  body('bio').optional().isLength({ max: 500 }),
  body('location').optional().isLength({ max: 100 }),
  body('website').optional().isURL(),
  body('company').optional().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const updatedUser = await userService.updateUserProfile(req.user._id, req.body);

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Profile update error:', error);
    
    if (error.message === 'User not found') {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist'
      });
    }

    res.status(500).json({
      error: 'Profile update failed',
      message: 'An error occurred while updating your profile. Please try again.'
    });
  }
});
```

## Key Patterns to Follow

### 1. **Route Structure**
```javascript
router.METHOD('/path', [
  // 1. Authentication middleware
  authenticateToken,
  
  // 2. Input validation
  body('field').validation(),
  
  // 3. Route handler
], async (req, res) => {
  try {
    // 4. Call service method
    const result = await service.method(req.body, req.user._id);
    
    // 5. Return success response
    res.json(result);
    
  } catch (error) {
    // 6. Handle specific errors
    if (error.message === 'Specific error') {
      return res.status(400).json({ error: error.message });
    }
    
    // 7. Handle generic errors
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### 2. **Service Method Structure**
```javascript
async methodName(data, userId) {
  // 1. Validate input
  if (!data.requiredField) {
    throw new Error('Required field missing');
  }

  // 2. Check permissions
  if (!hasPermission(userId, resourceId)) {
    throw new Error('Access denied');
  }

  // 3. Business logic
  const result = await this.repository.create(data);
  
  // 4. Return result
  return result;
}
```

### 3. **Repository Method Structure**
```javascript
async create(data) {
  const entity = new Model(data);
  return await entity.save();
}

async findById(id) {
  return await Model.findById(id);
}

async updateById(id, data) {
  return await Model.findByIdAndUpdate(id, data, { new: true });
}
```

## Next Steps for Complete Refactoring

1. **Complete User Routes** - Refactor remaining user endpoints
2. **Complete Repository Routes** - Refactor remaining repository endpoints
3. **Create Issue Service/Repository** - For issue management
4. **Create Pull Request Service/Repository** - For PR management
5. **Create File Service/Repository** - For file operations
6. **Add Tests** - Unit tests for services, integration tests for repositories
7. **Add Error Handling** - Centralized error handling middleware
8. **Add Logging** - Structured logging for better debugging

## Benefits of This Approach

- **Cleaner Routes**: Routes are now focused only on HTTP concerns
- **Testable Services**: Business logic can be easily unit tested
- **Reusable Logic**: Services can be used by multiple routes
- **Maintainable Code**: Changes to business rules only affect services
- **Better Error Handling**: Centralized error handling in services
- **Scalable Architecture**: Easy to add new features and services
