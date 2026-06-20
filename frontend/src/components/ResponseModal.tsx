'use client';

import { useState, useEffect } from 'react';
import { Comment } from '../types';
import { responsesApi } from '../lib/api';

interface ResponseModalProps {
  comment: Comment | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function ResponseModal({ comment, onClose, onUpdate }: ResponseModalProps) {
  const [editedText, setEditedText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [responseId, setResponseId] = useState<string | null>(null);

  useEffect(() => {
    if (comment) {
      setEditedText(comment.actual_text || comment.suggested_text || '');
      setResponseId(comment.response_id);
      setError('');
    }
  }, [comment]);

  if (!comment) return null;

  async function handleGenerate() {
    if (!comment) return;
    setGenerating(true);
    setError('');
    try {
      const res = await responsesApi.generate(comment.id);
      setEditedText(res.data.suggestedText);
      setResponseId(res.data.responseId);
    } catch {
      setError('Failed to generate response. Check your Claude API key.');
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!comment) return;
    if (!responseId && !editedText) {
      setError('Generate or write a response first');
      return;
    }
    setPublishing(true);
    setError('');
    try {
      if (responseId) {
        await responsesApi.update(responseId, editedText);
        await responsesApi.publish(responseId);
      } else {
        const genRes = await responsesApi.generate(comment.id);
        const newId = genRes.data.responseId;
        await responsesApi.update(newId, editedText);
        await responsesApi.publish(newId);
      }
      onUpdate();
      onClose();
    } catch {
      setError('Failed to publish. Check Facebook permissions.');
    } finally {
      setPublishing(false);
    }
  }

  async function handleReject() {
    if (!responseId) { onClose(); return; }
    try {
      await responsesApi.reject(responseId);
      onUpdate();
      onClose();
    } catch {
      setError('Failed to reject response');
    }
  }

  const statusColor = {
    pending: 'badge-pending',
    approved: 'badge-published',
    rejected: 'badge-rejected',
    published: 'badge-published',
  }[comment.status || 'pending'];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* On mobile: sheet from bottom. On desktop: centered modal */}
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Reply to Comment</h2>
            {comment.status && (
              <span className={`mt-1 ${statusColor}`}>{comment.status}</span>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-4 space-y-4">
          {/* Original comment */}
          <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-semibold text-xs sm:text-sm">
                  {(comment.author_name || 'U')[0].toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{comment.author_name || 'Usuario'}</p>
                <p className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleString()}</p>
              </div>
            </div>
            <p className="text-gray-800 text-sm leading-relaxed break-words mt-2">{comment.text}</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Reply textarea */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="block text-sm font-medium text-gray-700">Tu respuesta</label>
              <button
                onClick={handleGenerate}
                disabled={generating || comment.status === 'published'}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-blue-600" />
                    Generando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Auto-generate with AI
                  </>
                )}
              </button>
            </div>
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              disabled={comment.status === 'published'}
              rows={4}
              className="input resize-none disabled:bg-gray-50 disabled:cursor-not-allowed text-sm"
              placeholder="Escribe tu respuesta o usa Auto-generate con IA..."
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{editedText.length} caracteres</p>
          </div>

          {/* Action buttons */}
          {comment.status !== 'published' && (
            <div className="flex flex-col sm:flex-row gap-2 pt-1 pb-2">
              <button
                onClick={handlePublish}
                disabled={publishing || !editedText.trim()}
                className="btn-primary w-full sm:flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-2"
              >
                {publishing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Publicando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Publish Reply
                  </>
                )}
              </button>
              <div className="flex gap-2 sm:flex-none">
                {responseId && (
                  <button onClick={handleReject} className="btn-danger flex-1 sm:flex-none px-4 py-2.5 sm:py-2">
                    Reject
                  </button>
                )}
                <button onClick={onClose} className="btn-secondary flex-1 sm:flex-none px-4 py-2.5 sm:py-2">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {comment.status === 'published' && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Esta respuesta fue publicada en Facebook
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
