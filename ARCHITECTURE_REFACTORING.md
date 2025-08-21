# Architecture Refactoring Documentation

## Overview

This document describes the refactoring of the codebase from a monolithic route-based architecture to a clean layered architecture with proper separation of concerns.

## New Architecture

### 1. Repository Layer (`src/repositories/`)
**Purpose**: Handle all data access and database operations
**Responsibilities**:
- Database queries and operations
- Data persistence
- No business logic
- Pure data access methods

**Files**:
- `UserRepository.js` - User data operations
- `RepositoryRepository.js` - Repository data operations
- `IssueRepository.js` - Issue data operations (to be created)
- `PullRequestRepository.js` - Pull request data operations (to be created)

### 2. Service Layer (`src/services/`)
**Purpose**: Handle business logic, validation, and orchestrate repository calls
**Responsibilities**:
- Business rules and validation
- Data transformation
- Orchestrating multiple repository calls
- Error handling and business exceptions

**Files**:
- `UserService.js` - User business logic
- `AuthService.js` - Authentication business logic
- `RepositoryService.js` - Repository business logic
- `SearchService.js` - Search business logic
- `IssueService.js` - Issue business logic (to be created)
- `PullRequestService.js` - Pull request business logic (to be created)

### 3. Route Layer (`src/routes/`)
**Purpose**: Handle HTTP requests/responses and input validation
**Responsibilities**:
- HTTP request/response handling
- Input validation using express-validator
- Calling appropriate services
- Error response formatting
- No business logic

## Benefits of New Architecture

### 1. **Separation of Concerns**
- Routes only handle HTTP concerns
- Services contain all business logic
- Repositories handle data persistence

### 2. **Testability**
- Each layer can be tested independently
- Services can be unit tested without HTTP layer
- Repositories can be mocked for service testing

### 3. **Maintainability**
- Business logic is centralized in services
- Changes to business rules only affect services
- Database changes only affect repositories

### 4. **Reusability**
- Services can be used by multiple routes
- Repositories can be used by multiple services
- Business logic can be shared across different endpoints

### 5. **Scalability**
- Easy to add new services
- Easy to add new repositories
- Clear interfaces between layers

## Usage Examples

### Using Services in Routes

```javascript
// Before (monolithic route)
router.post('/register', async (req, res) => {
  // 50+ lines of business logic mixed with HTTP handling
  const user = new User(req.body);
  await user.save();
  const token = jwt.sign(...);
  // ... more business logic
});

// After (clean route)
router.post('/register', async (req, res) => {
  try {
    const result = await authService.registerUser(req.body);
    res.status(201).json({
      message: 'User registered successfully',
      ...result
    });
  } catch (error) {
    // Handle errors
  }
});
```

### Service Layer Example

```javascript
class UserService {
  constructor() {
    this.userRepository = new UserRepository();
  }

  async registerUser(userData) {
    // Business logic here
    const existingUser = await this.userRepository.findByUsername(userData.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }
    
    // More business logic...
    return await this.userRepository.create(userData);
  }
}
```

### Repository Layer Example

```javascript
class UserRepository {
  async findByUsername(username) {
    return await User.findOne({ username });
  }

  async create(userData) {
    const user = new User(userData);
    return await user.save();
  }
}
```

## Migration Guide

### 1. **Create Repository Classes**
- Extract all database operations from routes
- Create methods for each database operation
- Keep methods simple and focused

### 2. **Create Service Classes**
- Extract business logic from routes
- Use repositories for data access
- Handle business validation and rules
- Throw meaningful errors

### 3. **Refactor Routes**
- Remove business logic
- Keep only HTTP handling and validation
- Call appropriate services
- Handle service errors and format responses

### 4. **Update Imports**
- Remove direct model imports from routes
- Import services instead
- Update middleware if needed

## Error Handling

### Service Layer Errors
```javascript
// Services throw business errors
if (!user) {
  throw new Error('User not found');
}

if (user.isPrivate && !hasAccess) {
  throw new Error('Access denied');
}
```

### Route Layer Error Handling
```javascript
// Routes catch and format errors
try {
  const result = await userService.getUser(username);
  res.json(result);
} catch (error) {
  if (error.message === 'User not found') {
    return res.status(404).json({
      error: 'User not found',
      message: 'The specified user does not exist'
    });
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: 'An error occurred while processing your request'
  });
}
```

## Testing Strategy

### 1. **Unit Tests**
- Test services with mocked repositories
- Test repositories with test database
- Test routes with mocked services

### 2. **Integration Tests**
- Test service + repository integration
- Test complete request flows

### 3. **Mocking**
```javascript
// Mock repository in service tests
jest.mock('../repositories/UserRepository');
const UserRepository = require('../repositories/UserRepository');

// Mock service in route tests
jest.mock('../services/UserService');
const UserService = require('../services/UserService');
```

## Future Enhancements

### 1. **Add Missing Services**
- `IssueService.js` for issue management
- `PullRequestService.js` for PR management
- `FileService.js` for file operations

### 2. **Add Missing Repositories**
- `IssueRepository.js`
- `PullRequestRepository.js`
- `FileRepository.js`

### 3. **Add Caching Layer**
- Redis for session management
- In-memory caching for frequently accessed data

### 4. **Add Event System**
- Publish events for important actions
- Decouple services using events

## Conclusion

This refactoring creates a clean, maintainable, and testable architecture that follows industry best practices. The separation of concerns makes the codebase easier to understand, modify, and extend.

Each layer has a single responsibility:
- **Routes**: HTTP handling
- **Services**: Business logic
- **Repositories**: Data access

This architecture will scale better as the application grows and makes it easier to add new features and maintain existing ones.
