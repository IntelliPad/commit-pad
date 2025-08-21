const mongoose = require('mongoose');

const pullRequestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 10000
  },
  repository: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repository',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sourceBranch: {
    type: String,
    required: true,
    trim: true
  },
  targetBranch: {
    type: String,
    required: true,
    trim: true,
    default: 'main'
  },
  sourceRepository: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repository'
  },
  state: {
    type: String,
    enum: ['open', 'closed', 'merged'],
    default: 'open'
  },
  isDraft: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  assignees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  reviewers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'changes_requested', 'dismissed'],
      default: 'pending'
    },
    submittedAt: Date,
    comment: String
  }],
  labels: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    color: {
      type: String,
      default: '#0366d6'
    },
    description: {
      type: String,
      maxlength: 200
    }
  }],
  milestone: {
    title: {
      type: String,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      maxlength: 500
    },
    dueDate: Date,
    state: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open'
    }
  },
  commits: [{
    hash: String,
    message: String,
    author: String,
    email: String,
    timestamp: Date
  }],
  changedFiles: [{
    filename: String,
    additions: Number,
    deletions: Number,
    changes: Number,
    status: {
      type: String,
      enum: ['added', 'modified', 'deleted', 'renamed'],
      default: 'modified'
    }
  }],
  comments: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: 10000
    },
    line: Number,
    path: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    reactions: [{
      type: {
        type: String,
        enum: ['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀'],
        required: true
      },
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  }],
  reviews: [{
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    state: {
      type: String,
      enum: ['approved', 'changes_requested', 'commented'],
      required: true
    },
    body: {
      type: String,
      maxlength: 10000
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    commitId: String
  }],
  reactions: [{
    type: {
      type: String,
      enum: ['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀'],
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  linkedIssues: [{
    issue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Issue'
    },
    relationship: {
      type: String,
      enum: ['closes', 'fixes', 'relates_to'],
      required: true
    }
  }],
  mergeable: {
    type: Boolean,
    default: true
  },
  mergeableState: {
    type: String,
    enum: ['clean', 'unstable', 'dirty', 'blocked'],
    default: 'clean'
  },
  mergeCommitSha: String,
  mergedAt: Date,
  mergedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  closedAt: Date,
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for comment count
pullRequestSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Virtual for review count
pullRequestSchema.virtual('reviewCount').get(function() {
  return this.reviews.length;
});

// Virtual for reaction count
pullRequestSchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

// Virtual for assignee count
pullRequestSchema.virtual('assigneeCount').get(function() {
  return this.assignees.length;
});

// Virtual for label count
pullRequestSchema.virtual('labelCount').get(function() {
  return this.labels.length;
});

// Virtual for commit count
pullRequestSchema.virtual('commitCount').get(function() {
  return this.commits.length;
});

// Virtual for changed file count
pullRequestSchema.virtual('changedFileCount').get(function() {
  return this.changedFiles.length;
});

// Virtual for total additions
pullRequestSchema.virtual('totalAdditions').get(function() {
  return this.changedFiles.reduce((sum, file) => sum + (file.additions || 0), 0);
});

// Virtual for total deletions
pullRequestSchema.virtual('totalDeletions').get(function() {
  return this.changedFiles.reduce((sum, file) => sum + (file.deletions || 0), 0);
});

// Method to add comment
pullRequestSchema.methods.addComment = function(authorId, content, line, path) {
  this.comments.push({
    author: authorId,
    content,
    line,
    path,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  this.updatedAt = new Date();
  return this.save();
};

// Method to add review
pullRequestSchema.methods.addReview = function(reviewerId, state, body, commitId) {
  this.reviews.push({
    reviewer: reviewerId,
    state,
    body,
    commitId,
    submittedAt: new Date()
  });
  
  this.updatedAt = new Date();
  return this.save();
};

// Method to add reaction
pullRequestSchema.methods.addReaction = function(userId, reactionType) {
  const existingReaction = this.reactions.find(
    r => r.user.toString() === userId.toString() && r.type === reactionType
  );
  
  if (!existingReaction) {
    this.reactions.push({
      type: reactionType,
      user: userId
    });
  }
  
  return this.save();
};

// Method to merge pull request
pullRequestSchema.methods.merge = function(mergedById, mergeCommitSha) {
  this.state = 'merged';
  this.mergedAt = new Date();
  this.mergedBy = mergedById;
  this.mergeCommitSha = mergeCommitSha;
  this.updatedAt = new Date();
  
  return this.save();
};

// Method to close pull request
pullRequestSchema.methods.close = function(closedById) {
  this.state = 'closed';
  this.closedAt = new Date();
  this.closedBy = closedById;
  this.updatedAt = new Date();
  
  return this.save();
};

// Method to reopen pull request
pullRequestSchema.methods.reopen = function() {
  this.state = 'open';
  this.closedAt = undefined;
  this.closedBy = undefined;
  this.updatedAt = new Date();
  
  return this.save();
};

// Indexes for better query performance
pullRequestSchema.index({ repository: 1, state: 1 });
pullRequestSchema.index({ author: 1 });
pullRequestSchema.index({ assignees: 1 });
pullRequestSchema.index({ state: 1 });
pullRequestSchema.index({ 'labels.name': 1 });
pullRequestSchema.index({ createdAt: 1 });
pullRequestSchema.index({ updatedAt: 1 });
pullRequestSchema.index({ 'reviews.reviewer': 1 });
pullRequestSchema.index({ sourceBranch: 1, targetBranch: 1 });

module.exports = mongoose.model('PullRequest', pullRequestSchema);
