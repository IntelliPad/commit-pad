const mongoose = require('mongoose');

const repositorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  isFork: {
    type: Boolean,
    default: false
  },
  parentRepository: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repository'
  },
  defaultBranch: {
    type: String,
    default: 'main'
  },
  branches: [{
    name: String,
    lastCommit: {
      hash: String,
      message: String,
      author: String,
      timestamp: Date
    }
  }],
  topics: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  language: {
    type: String,
    default: ''
  },
  size: {
    type: Number,
    default: 0
  },
  stars: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    starredAt: {
      type: Date,
      default: Date.now
    }
  }],
  watchers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  forks: [{
    repository: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository'
    },
    forkedAt: {
      type: Date,
      default: Date.now
    }
  }],
  collaborators: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['read', 'write', 'admin'],
      default: 'read'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  issues: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Issue'
  }],
  pullRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PullRequest'
  }],
  commits: [{
    hash: String,
    message: String,
    author: String,
    email: String,
    timestamp: Date,
    branch: String
  }],
  readme: {
    content: String,
    format: {
      type: String,
      enum: ['markdown', 'text'],
      default: 'markdown'
    }
  },
  license: {
    type: String,
    default: ''
  },
  homepage: {
    type: String,
    default: ''
  },
  archived: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for star count
repositorySchema.virtual('starCount').get(function() {
  return this.stars.length;
});

// Virtual for watcher count
repositorySchema.virtual('watcherCount').get(function() {
  return this.watchers.length;
});

// Virtual for fork count
repositorySchema.virtual('forkCount').get(function() {
  return this.forks.length;
});

// Virtual for issue count
repositorySchema.virtual('issueCount').get(function() {
  return this.issues.length;
});

// Virtual for pull request count
repositorySchema.virtual('pullRequestCount').get(function() {
  return this.pullRequests.length;
});

// Virtual for commit count
repositorySchema.virtual('commitCount').get(function() {
  return this.commits.length;
});

// Virtual for full repository name (owner/repo)
repositorySchema.virtual('fullName').get(function() {
  return `${this.owner.username}/${this.name}`;
});

// Method to check if user has access
repositorySchema.methods.hasAccess = function(userId, requiredPermission = 'read') {
  if (this.owner.toString() === userId.toString()) {
    return true;
  }
  
  if (this.isPrivate) {
    const collaborator = this.collaborators.find(c => c.user.toString() === userId.toString());
    if (!collaborator) return false;
    
    if (requiredPermission === 'admin') {
      return collaborator.permission === 'admin';
    } else if (requiredPermission === 'write') {
      return ['write', 'admin'].includes(collaborator.permission);
    }
    return true;
  }
  
  return true;
};

// Method to add collaborator
repositorySchema.methods.addCollaborator = function(userId, permission = 'read') {
  const existingIndex = this.collaborators.findIndex(
    c => c.user.toString() === userId.toString()
  );
  
  if (existingIndex >= 0) {
    this.collaborators[existingIndex].permission = permission;
  } else {
    this.collaborators.push({
      user: userId,
      permission,
      addedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to remove collaborator
repositorySchema.methods.removeCollaborator = function(userId) {
  this.collaborators = this.collaborators.filter(
    c => c.user.toString() !== userId.toString()
  );
  
  return this.save();
};

// Indexes for better query performance
repositorySchema.index({ owner: 1, name: 1 }, { unique: true });
repositorySchema.index({ 'owner.username': 1 });
repositorySchema.index({ isPrivate: 1 });
repositorySchema.index({ language: 1 });
repositorySchema.index({ topics: 1 });
repositorySchema.index({ stars: 1 });
repositorySchema.index({ lastActivity: 1 });
repositorySchema.index({ 'collaborators.user': 1 });

module.exports = mongoose.model('Repository', repositorySchema);
