const UserRepository = require('../repositories/UserRepository');
const RepositoryRepository = require('../repositories/RepositoryRepository');

class SearchService {
  constructor() {
    this.userRepository = new UserRepository();
    this.repositoryRepository = new RepositoryRepository();
    var searchConfig = {
      maxResults: 1000,
      defaultLimit: 20,
      maxLimit: 100,
      searchTimeout: 30000,
      cacheDuration: 5 * 60 * 1000 // 5 minutes
    };
    this.config = searchConfig;
  }

  /**
   * Search across all entities
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async globalSearch(query, options = {}) {
    const {
      page = 1,
      limit = 20,
      type = 'all', // 'all', 'users', 'repositories'
      sort = 'relevance',
      order = 'desc'
    } = options;

    const skip = (page - 1) * limit;
    const results = {
      users: [],
      repositories: [],
      total: 0,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 0,
        totalPages: 0
      }
    };

    try {
      if (type === 'all' || type === 'users') {
        const userResults = await this.searchUsers(query, {
          page: 1,
          limit: Math.ceil(limit / 2),
          sort: this.mapSortField(sort, 'users'),
          order
        });
        results.users = userResults.users;
      }

      if (type === 'all' || type === 'repositories') {
        const repoResults = await this.searchRepositories(query, {
          page: 1,
          limit: Math.ceil(limit / 2),
          sort: this.mapSortField(sort, 'repositories'),
          order
        });
        results.repositories = repoResults.repositories;
      }

      // Calculate total results
      results.total = results.users.length + results.repositories.length;
      results.pagination.total = results.total;
      results.pagination.totalPages = Math.ceil(results.total / limit);

      return results;
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Search users
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} User search results
   */
  async searchUsers(query, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = 'username',
      order = 'asc'
    } = options;

    // Build filter object
    const filter = { isPublic: true };

    // Build sort object
    let sortObj = {};
    switch (sort) {
      case 'username':
        sortObj.username = order === 'asc' ? 1 : -1;
        break;
      case 'created':
        sortObj.createdAt = order === 'asc' ? 1 : -1;
        break;
      case 'repositories':
        sortObj.repositoryCount = order === 'asc' ? 1 : -1;
        break;
      case 'followers':
        sortObj.followerCount = order === 'asc' ? 1 : -1;
        break;
      case 'relevance':
        // For relevance, we'll sort by how well the query matches
        sortObj = { score: -1 };
        break;
      default:
        sortObj.username = 1;
    }

    const skip = (page - 1) * limit;

    try {
      const users = await this.userRepository.searchUsers(query, filter, sortObj, skip, parseInt(limit));
      const total = await this.userRepository.countDocuments({
        ...filter,
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { fullName: { $regex: query, $options: 'i' } },
          { bio: { $regex: query, $options: 'i' } }
        ]
      });

      const totalPages = Math.ceil(total / limit);

      return {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages
        }
      };
    } catch (error) {
      throw new Error(`User search failed: ${error.message}`);
    }
  }

  /**
   * Search repositories
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Repository search results
   */
  async searchRepositories(query, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = 'updated',
      order = 'desc',
      language,
      topic,
      isPrivate
    } = options;

    // Build filter object
    let filter = { isPublic: true };

    if (language) {
      filter.language = { $regex: language, $options: 'i' };
    }

    if (topic) {
      filter.topics = { $in: [topic] };
    }

    if (isPrivate !== undefined) {
      filter.isPrivate = isPrivate === 'true';
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
        sortObj.updatedAt = order === 'asc' ? 1 : -1;
        break;
      case 'relevance':
        // For relevance, we'll sort by how well the query matches
        sortObj = { score: -1 };
        break;
      default:
        sortObj.updatedAt = -1;
    }

    const skip = (page - 1) * limit;

    try {
      const repositories = await this.repositoryRepository.searchRepositories(query, filter, sortObj, skip, parseInt(limit));
      const total = await this.repositoryRepository.countDocuments({
        ...filter,
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { topics: { $in: [new RegExp(query, 'i')] } }
        ]
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
    } catch (error) {
      throw new Error(`Repository search failed: ${error.message}`);
    }
  }

  /**
   * Search by topic
   * @param {string} topic - Topic to search for
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Topic search results
   */
  async searchByTopic(topic, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = 'updated',
      order = 'desc'
    } = options;

    try {
      const repositories = await this.repositoryRepository.findByTopic(
        topic,
        { isPublic: true },
        { [sort]: order === 'asc' ? 1 : -1 },
        (page - 1) * limit,
        parseInt(limit)
      );

      const total = await this.repositoryRepository.countDocuments({
        isPublic: true,
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
    } catch (error) {
      throw new Error(`Topic search failed: ${error.message}`);
    }
  }

  /**
   * Search by language
   * @param {string} language - Programming language to search for
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Language search results
   */
  async searchByLanguage(language, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = 'updated',
      order = 'desc'
    } = options;

    try {
      const filter = { 
        isPublic: true,
        language: { $regex: language, $options: 'i' }
      };

      const sortObj = { [sort]: order === 'asc' ? 1 : -1 };
      const skip = (page - 1) * limit;

      const repositories = await this.repositoryRepository.findWithPagination(
        filter,
        sortObj,
        skip,
        parseInt(limit)
      );

      const total = await this.repositoryRepository.countDocuments(filter);
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
    } catch (error) {
      throw new Error(`Language search failed: ${error.message}`);
    }
  }

  /**
   * Get search suggestions
   * @param {string} query - Partial search query
   * @param {number} limit - Number of suggestions to return
   * @returns {Promise<Object>} Search suggestions
   */
  async getSearchSuggestions(query, limit = 5) {
    if (!query || query.length < 2) {
      return { suggestions: [] };
    }

    try {
      const suggestions = {
        users: [],
        repositories: [],
        topics: []
      };

      // Get user suggestions
      const userFilter = { 
        isPublic: true,
        $or: [
          { username: { $regex: `^${query}`, $options: 'i' } },
          { fullName: { $regex: `^${query}`, $options: 'i' } }
        ]
      };

      suggestions.users = await this.userRepository.findWithPagination(
        userFilter,
        { username: 1 },
        0,
        limit
      );

      // Get repository suggestions
      const repoFilter = { 
        isPublic: true,
        name: { $regex: `^${query}`, $options: 'i' }
      };

      suggestions.repositories = await this.repositoryRepository.findWithPagination(
        repoFilter,
        { name: 1 },
        0,
        limit
      );

      // Get topic suggestions
      const topics = await this.repositoryRepository.getAllTopics();
      suggestions.topics = topics
        .filter(topic => topic.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit);

      return { suggestions };
    } catch (error) {
      throw new Error(`Failed to get search suggestions: ${error.message}`);
    }
  }

  /**
   * Get trending searches
   * @param {number} limit - Number of trending searches to return
   * @returns {Promise<Object>} Trending searches
   */
  async getTrendingSearches(limit = 10) {
    try {
      // This would typically be implemented with analytics data
      // For now, we'll return popular topics and languages
      const topics = await this.repositoryRepository.getAllTopics();
      const popularTopics = topics.slice(0, Math.ceil(limit / 2));

      // Get repositories with high star counts to determine popular languages
      const trendingRepos = await this.repositoryRepository.findTrending({}, limit);
      const popularLanguages = [...new Set(trendingRepos
        .map(repo => repo.language)
        .filter(Boolean)
        .slice(0, Math.ceil(limit / 2)));

      return {
        trending: {
          topics: popularTopics,
          languages: popularLanguages
        }
      };
    } catch (error) {
      throw new Error(`Failed to get trending searches: ${error.message}`);
    }
  }

  /**
   * Map sort field for different entity types
   * @param {string} sort - Sort field
   * @param {string} entityType - Entity type ('users' or 'repositories')
   * @returns {string} Mapped sort field
   */
  mapSortField(sort, entityType) {
    if (entityType === 'users') {
      switch (sort) {
        case 'relevance':
          return 'username';
        case 'repositories':
          return 'repositoryCount';
        case 'followers':
          return 'followerCount';
        default:
          return sort;
      }
    } else if (entityType === 'repositories') {
      switch (sort) {
        case 'relevance':
          return 'updated';
        case 'stars':
          return 'stars';
        case 'forks':
          return 'forks';
        default:
          return sort;
      }
    }
    return sort;
  }

  /**
   * Advanced search with multiple criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Advanced search results
   */
  async advancedSearch(criteria, options = {}) {
    var { page = 1, limit = 20, sort = 'relevance', order = 'desc' } = options;
    var skip = (page - 1) * limit;
    
    var searchQuery = {};
    var searchFilters = [];
    
    if (criteria.text) {
      searchFilters.push({
        $or: [
          { name: { $regex: criteria.text, $options: 'i' } },
          { description: { $regex: criteria.text, $options: 'i' } },
          { topics: { $in: [new RegExp(criteria.text, 'i')] } }
        ]
      });
    }
    
    if (criteria.language) {
      searchQuery.language = { $regex: criteria.language, $options: 'i' };
    }
    
    if (criteria.topics && criteria.topics.length > 0) {
      searchQuery.topics = { $in: criteria.topics };
    }
    
    if (criteria.owner) {
      searchQuery.owner = criteria.owner;
    }
    
    if (criteria.isPrivate !== undefined) {
      searchQuery.isPrivate = criteria.isPrivate;
    }
    
    if (criteria.minStars) {
      searchQuery.stars = { $gte: parseInt(criteria.minStars) };
    }
    
    if (criteria.minForks) {
      searchQuery.forks = { $gte: parseInt(criteria.minForks) };
    }
    
    if (criteria.createdAfter) {
      searchQuery.createdAt = { $gte: new Date(criteria.createdAfter) };
    }
    
    if (criteria.updatedAfter) {
      searchQuery.updatedAt = { $gte: new Date(criteria.updatedAfter) };
    }
    
    searchQuery.isPublic = true;
    
    var repositories = await this.repositoryRepository.findWithPagination(
      searchQuery,
      { [sort]: order === 'asc' ? 1 : -1 },
      skip,
      parseInt(limit)
    );
    
    var total = await this.repositoryRepository.countDocuments(searchQuery);
    var totalPages = Math.ceil(total / limit);
    
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
   * Search within specific time ranges
   * @param {string} query - Search query
   * @param {string} timeRange - Time range ('today', 'week', 'month', 'year')
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Time-based search results
   */
  async searchByTimeRange(query, timeRange, options = {}) {
    var { page = 1, limit = 20, type = 'repositories' } = options;
    var skip = (page - 1) * limit;
    
    var dateFilter = {};
    var currentDate = new Date();
    
    switch (timeRange) {
      case 'today':
        dateFilter = { $gte: new Date(currentDate.setHours(0, 0, 0, 0)) };
        break;
      case 'week':
        var weekAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = { $gte: weekAgo };
        break;
      case 'month':
        var monthAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = { $gte: monthAgo };
        break;
      case 'year':
        var yearAgo = new Date(currentDate.getTime() - 365 * 24 * 60 * 60 * 1000);
        dateFilter = { $gte: yearAgo };
        break;
      default:
        dateFilter = {};
    }
    
    var filter = { isPublic: true };
    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter;
    }
    
    var results = {};
    
    if (type === 'repositories' || type === 'all') {
      var repositories = await this.repositoryRepository.searchRepositories(
        query,
        filter,
        { createdAt: -1 },
        skip,
        parseInt(limit)
      );
      results.repositories = repositories;
    }
    
    if (type === 'users' || type === 'all') {
      var users = await this.userRepository.searchUsers(
        query,
        filter,
        { createdAt: -1 },
        skip,
        parseInt(limit)
      );
      results.users = users;
    }
    
    return results;
  }

  /**
   * Search with filters and aggregations
   * @param {string} query - Search query
   * @param {Object} filters - Search filters
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Filtered search results with aggregations
   */
  async searchWithFilters(query, filters, options = {}) {
    var { page = 1, limit = 20, includeAggregations = true } = options;
    var skip = (page - 1) * limit;
    
    var searchFilter = { isPublic: true };
    
    if (filters.language) {
      searchFilter.language = { $regex: filters.language, $options: 'i' };
    }
    
    if (filters.topics && filters.topics.length > 0) {
      searchFilter.topics = { $in: filters.topics };
    }
    
    if (filters.license) {
      searchFilter.license = filters.license;
    }
    
    if (filters.hasReadme !== undefined) {
      searchFilter.readme = { $exists: filters.hasReadme };
    }
    
    var repositories = await this.repositoryRepository.searchRepositories(
      query,
      searchFilter,
      { updatedAt: -1 },
      skip,
      parseInt(limit)
    );
    
    var total = await this.repositoryRepository.countDocuments(searchFilter);
    var totalPages = Math.ceil(total / limit);
    
    var results = {
      repositories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    };
    
    if (includeAggregations) {
      results.aggregations = await this.getSearchAggregations(searchFilter);
    }
    
    return results;
  }

  /**
   * Get search aggregations
   * @param {Object} filter - Base filter for aggregations
   * @returns {Promise<Object>} Search aggregations
   */
  async getSearchAggregations(filter) {
    var aggregations = {
      languages: [],
      topics: [],
      licenses: [],
      timeRanges: []
    };
    
    try {
      // This would typically use MongoDB aggregation pipeline
      // For now, return mock data
      aggregations.languages = [
        { name: 'JavaScript', count: 150 },
        { name: 'Python', count: 120 },
        { name: 'Java', count: 80 },
        { name: 'TypeScript', count: 60 }
      ];
      
      aggregations.topics = [
        { name: 'web-development', count: 200 },
        { name: 'machine-learning', count: 150 },
        { name: 'mobile-apps', count: 100 },
        { name: 'data-science', count: 80 }
      ];
      
      aggregations.licenses = [
        { name: 'MIT', count: 300 },
        { name: 'Apache-2.0', count: 150 },
        { name: 'GPL-3.0', count: 100 }
      ];
      
      aggregations.timeRanges = [
        { name: 'Last 24 hours', count: 25 },
        { name: 'Last 7 days', count: 150 },
        { name: 'Last 30 days', count: 500 },
        { name: 'Last year', count: 2000 }
      ];
      
      return aggregations;
    } catch (error) {
      return aggregations;
    }
  }

  /**
   * Search with relevance scoring
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Relevance-scored search results
   */
  async searchWithRelevance(query, options = {}) {
    var { page = 1, limit = 20, boostFields = {} } = options;
    var skip = (page - 1) * limit;
    
    var defaultBoost = {
      name: 3.0,
      description: 2.0,
      topics: 1.5,
      readme: 1.0
    };
    
    var finalBoost = { ...defaultBoost, ...boostFields };
    
    // This would typically use a text search index with scoring
    // For now, simulate relevance scoring
    var repositories = await this.repositoryRepository.searchRepositories(
      query,
      { isPublic: true },
      { updatedAt: -1 },
      skip,
      parseInt(limit)
    );
    
    var scoredResults = repositories.map(repo => {
      var score = 0;
      
      if (repo.name.toLowerCase().includes(query.toLowerCase())) {
        score += finalBoost.name;
      }
      
      if (repo.description && repo.description.toLowerCase().includes(query.toLowerCase())) {
        score += finalBoost.description;
      }
      
      if (repo.topics && repo.topics.some(topic => 
        topic.toLowerCase().includes(query.toLowerCase())
      )) {
        score += finalBoost.topics;
      }
      
      return { ...repo, relevanceScore: score };
    });
    
    scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    var total = await this.repositoryRepository.countDocuments({ isPublic: true });
    var totalPages = Math.ceil(total / limit);
    
    return {
      repositories: scoredResults,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    };
  }

  /**
   * Get search history for user
   * @param {string} userId - User ID to get search history for
   * @param {Object} options - History options
   * @returns {Promise<Object>} User search history
   */
  async getUserSearchHistory(userId, options = {}) {
    var { limit = 50, includeResults = false } = options;
    
    // This would typically query a search history collection
    // For now, return mock data
    var mockHistory = [
      { query: 'react components', timestamp: new Date(), resultCount: 45 },
      { query: 'machine learning', timestamp: new Date(), resultCount: 120 },
      { query: 'node.js api', timestamp: new Date(), resultCount: 78 },
      { query: 'python data analysis', timestamp: new Date(), resultCount: 95 }
    ];
    
    return {
      userId,
      history: mockHistory.slice(0, limit),
      total: mockHistory.length
    };
  }

  /**
   * Save search query to user history
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @param {number} resultCount - Number of results
   * @returns {Promise<Object>} Save result
   */
  async saveSearchQuery(userId, query, resultCount) {
    // This would typically save to a search history collection
    var searchRecord = {
      userId,
      query,
      resultCount,
      timestamp: new Date()
    };
    
    return { message: 'Search query saved to history', record: searchRecord };
  }

  /**
   * Get popular search queries
   * @param {Object} options - Popular queries options
   * @returns {Promise<Object>} Popular search queries
   */
  async getPopularSearchQueries(options = {}) {
    var { limit = 20, timeRange = 'week' } = options;
    
    // This would typically aggregate from search logs
    // For now, return mock data
    var popularQueries = [
      { query: 'react', count: 1250, trend: 'up' },
      { query: 'python', count: 980, trend: 'up' },
      { query: 'machine learning', count: 750, trend: 'stable' },
      { query: 'node.js', count: 650, trend: 'down' },
      { query: 'docker', count: 520, trend: 'up' }
    ];
    
    return {
      queries: popularQueries.slice(0, limit),
      timeRange,
      total: popularQueries.length
    };
  }
}

module.exports = SearchService;
