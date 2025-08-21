const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
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
  assignees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
  state: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  type: {
    type: String,
    enum: ['bug', 'feature', 'enhancement', 'task', 'question'],
    default: 'bug'
  },
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
      enum: ['duplicate', 'related', 'blocks', 'blocked_by'],
      required: true
    }
  }],
  linkedPullRequests: [{
    pullRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PullRequest'
    },
    relationship: {
      type: String,
      enum: ['closes', 'fixes', 'relates_to'],
      required: true
    }
  }],
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
issueSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Virtual for reaction count
issueSchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

// Virtual for assignee count
issueSchema.virtual('assigneeCount').get(function() {
  return this.assignees.length;
});

// Virtual for label count
issueSchema.virtual('labelCount').get(function() {
  return this.labels.length;
});

// Method to add comment
issueSchema.methods.addComment = function(authorId, content) {
  this.comments.push({
    author: authorId,
    content,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  this.updatedAt = new Date();
  return this.save();
};

// Method to add reaction
issueSchema.methods.addReaction = function(userId, reactionType) {
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

// Method to remove reaction
issueSchema.methods.removeReaction = function(userId, reactionType) {
  this.reactions = this.reactions.filter(
    r => !(r.user.toString() === userId.toString() && r.type === reactionType)
  );
  
  return this.save();
};

// Method to close issue
issueSchema.methods.closeIssue = function(closedById) {
  this.state = 'closed';
  this.closedAt = new Date();
  this.closedBy = closedById;
  this.updatedAt = new Date();
  
  return this.save();
};

// Method to reopen issue
issueSchema.methods.reopenIssue = function() {
  this.state = 'open';
  this.closedAt = undefined;
  this.closedBy = undefined;
  this.updatedAt = new Date();
  
  return this.save();
};

// Indexes for better query performance
issueSchema.index({ repository: 1, state: 1 });
issueSchema.index({ author: 1 });
issueSchema.index({ assignees: 1 });
issueSchema.index({ state: 1 });
issueSchema.index({ priority: 1 });
issueSchema.index({ type: 1 });
issueSchema.index({ 'labels.name': 1 });
issueSchema.index({ createdAt: 1 });
issueSchema.index({ updatedAt: 1 });

module.exports = mongoose.model('Issue', issueSchema);
