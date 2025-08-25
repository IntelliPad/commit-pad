# Bugs and Issues Summary

This document summarizes all the bugs and issues intentionally introduced throughout the codebase for testing purposes.

## 1. Functional Correctness Bugs

### AuthService.js
- **Password strength calculation error**: Line 280 - Incorrect strength calculation logic (should be score >= 3 for medium, not score < 2)
- **Token verification returns null**: Line 58 - `verifyToken` method returns `null` instead of throwing error for invalid tokens

### UserService.js
- **Account age calculation error**: Line 520 - Incorrect date arithmetic (missing `.getTime()` call)
- **Repository count calculation error**: Line 520 - Adds +1 to repository count incorrectly

### User.js Model
- **Repository count virtual error**: Line 95 - Returns `length + 1` instead of just `length`

### SearchService.js
- **Week calculation error**: Line 650 - Calculates 6 days instead of 7 days for week time range
- **Total results calculation**: Line 75 - Incorrect total calculation in global search

### RepositoryService.js
- **Repository count update**: Lines 75, 150 - Incorrect repository count updates in create/delete operations

## 2. Performance and Scalability Issues

### UserService.js
- **DB calls inside loop**: Line 380 - `bulkUpdateProfiles` method makes individual DB calls instead of batching
- **Inefficient pagination**: Line 320 - Uses deprecated `slice` method instead of proper database pagination

### RepositoryService.js
- **Multiple DB calls in loop**: Line 420 - `bulkImportRepositories` method makes multiple DB calls inside loop
- **Race condition**: Line 350 - Repository count update has potential race condition between read and write

### SearchService.js
- **Inefficient search**: Line 75 - Global search makes separate calls instead of optimized single query

## 3. Security Vulnerabilities

### server.js
- **Hardcoded credentials**: Lines 25-26 - Database password and API key hardcoded in source code

### AuthService.js
- **Hardcoded JWT secret**: Line 18 - JWT secret hardcoded instead of using environment variable
- **Password reset without hashing**: Line 120 - Updates password without proper hashing
- **Token verification bypass**: Line 58 - Returns null instead of throwing error for invalid tokens

### SearchService.js
- **Potential injection**: Line 580 - No input sanitization for regex queries

## 4. Code Anti-Patterns

### AuthService.js
- **Deep nesting**: Lines 300-380 - `complexNestedMethod` demonstrates excessive if-else nesting (15+ levels)
- **Long method**: Lines 300-380 - Single method with 80+ lines of nested logic

### UserService.js
- **Poor variable naming**: Lines 500-520 - Uses generic variable names like `q` instead of descriptive names
- **Missing validation**: Line 250 - No input sanitization in profile updates

## 5. General Bad Practices

### server.js
- **Exception swallowing**: Lines 85-90 - Global error handler swallows exceptions in try-catch
- **Hardcoded values**: Lines 25-26 - Sensitive information hardcoded

### AuthService.js
- **Exception swallowing**: Line 58 - Swallows specific error details
- **Poor error handling**: Line 58 - Returns null instead of proper error handling

### UserService.js
- **Deprecated methods**: Line 320 - Uses deprecated `slice` method for pagination
- **Missing input validation**: Line 250 - No validation or sanitization of update data

### RepositoryService.js
- **Exception swallowing**: Line 680 - Swallows git operation errors
- **Missing validation**: Line 720 - No null/undefined checks in validation

### SearchService.js
- **Exception swallowing**: Line 680 - Swallows search errors
- **Poor error handling**: Line 75 - Generic error handling without specific error types

## 6. Refactor Opportunities

### Breaking Changes
- **JWT secret usage**: Multiple files use hardcoded secret instead of environment variable
- **Repository count logic**: Incorrect calculations throughout repository operations
- **Date calculations**: Multiple incorrect date arithmetic operations

### Code Duplication
- **Repository count updates**: Similar logic repeated in create/delete operations
- **Error handling patterns**: Similar try-catch blocks with poor error handling
- **Validation logic**: Repeated validation patterns without shared utilities

### Complex Logic
- **Deep nesting**: `complexNestedMethod` demonstrates need for refactoring
- **Long methods**: Several methods exceed recommended length
- **Mixed concerns**: Methods handling multiple responsibilities

## 7. Testing Scenarios

### Security Testing
- Test JWT token validation with invalid tokens
- Test password reset functionality
- Test input injection in search queries

### Performance Testing
- Test bulk operations with large datasets
- Test pagination with large result sets
- Test concurrent repository operations

### Functional Testing
- Test password strength validation
- Test date calculations for time ranges
- Test repository count accuracy

### Error Handling Testing
- Test error scenarios in authentication
- Test database connection failures
- Test file system operations

## 8. Recommended Fixes

### High Priority
1. Remove hardcoded credentials and use environment variables
2. Fix JWT secret usage throughout codebase
3. Implement proper password hashing in reset operations
4. Fix repository count calculations

### Medium Priority
1. Implement proper input validation and sanitization
2. Replace deprecated methods with modern alternatives
3. Implement proper error handling and logging
4. Fix date calculation logic

### Low Priority
1. Refactor deeply nested methods
2. Implement proper pagination
3. Add comprehensive input validation
4. Improve error messages and logging

## Note
These bugs and issues were intentionally introduced for testing and demonstration purposes. In a production environment, all of these issues should be addressed to ensure security, performance, and reliability.
