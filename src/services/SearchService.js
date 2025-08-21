const UserRepository = require('../repositories/UserRepository');
const RepositoryRepository = require('../repositories/RepositoryRepository');

class SearchService {
  constructor() {
    this.userRepository = new UserRepository();
    this.repositoryRepository = new RepositoryRepository();
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
}

module.exports = SearchService;
