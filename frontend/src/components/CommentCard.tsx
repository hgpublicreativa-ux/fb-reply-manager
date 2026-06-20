'use client';

import { Comment } from '../types';

interface CommentCardProps {
  comment: Comment;
  onReply: (comment: Comment) => void;
}

export function CommentCard({ comment, onReply }: CommentCardProps) {
  const statusConfig = {
    pending: { label: 'Pending', cls: 'badge-pending' },
    approved: { label: 'Approved', cls: 'badge-published' },
    rejected: { label: 'Rejected', cls: 'badge-rejected' },
    published: { label: 'Published', cls: 'badge-published' },
  };

  const status = comment.status || 'pending';
  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
            {(comment.author_name || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900 text-sm">
                {comment.author_name || 'Unknown User'}
              </span>
              <span className={cfg.cls}>{cfg.label}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(comment.created_at).toLocaleString()}
            </p>
            <p className="text-gray-800 text-sm mt-2 leading-relaxed break-words">{comment.text}</p>

            {comment.status === 'published' && (comment.actual_text || comment.suggested_text) && (
              <div className="mt-3 pl-3 border-l-2 border-green-400">
                <p className="text-xs text-gray-400 mb-1 font-medium">Published reply:</p>
                <p className="text-sm text-gray-600 italic">
                  {comment.actual_text || comment.suggested_text}
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => onReply(comment)}
          className={`flex-shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
            comment.status === 'published'
              ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-50 border border-gray-200'
              : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          {comment.status === 'published' ? 'View' : 'Reply'}
        </button>
      </div>
    </div>
  );
}
