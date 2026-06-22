'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '../../components/Navbar';
import { CommentCard } from '../../components/CommentCard';
import { ResponseModal } from '../../components/ResponseModal';
import { accountsApi, commentsApi } from '../../lib/api';
import { FacebookAccount, Comment, AccountStats, FilterType } from '../../types';

export default function DashboardPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<FacebookAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<FacebookAccount | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const LIMIT = 20;

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await accountsApi.list();
      const accts: FacebookAccount[] = res.data.accounts;
      setAccounts(accts);

      if (accts.length === 0) {
        router.replace('/accounts');
        return;
      }

      const stored = localStorage.getItem('activeAccountId');
      const found = stored ? accts.find((a) => a.id === stored) : null;
      setActiveAccount(found || accts[0]);
    } catch {
      router.replace('/login');
    }
  }, [router]);

  const fetchComments = useCallback(async () => {
    if (!activeAccount) return;
    setLoading(true);

    try {
      const res = await commentsApi.list({
        accountId: activeAccount.id,
        filter,
        search,
        page,
        limit: LIMIT,
      });
      setComments(res.data.comments);
      setTotal(res.data.total);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Fetch comments error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeAccount, filter, search, page]);

  const fetchStats = useCallback(async () => {
    if (!activeAccount) return;
    try {
      const res = await accountsApi.getStats(activeAccount.id);
      setStats(res.data);
    } catch (err) {
      console.error('Fetch stats error:', err);
    }
  }, [activeAccount]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.replace('/login'); return; }
    fetchAccounts();
  }, [fetchAccounts, router]);

  useEffect(() => {
    if (activeAccount) {
      setPage(1);
      fetchComments();
      fetchStats();
    }
  }, [activeAccount, filter, search]);

  useEffect(() => {
    if (activeAccount) fetchComments();
  }, [page]);

  // Silent auto-refresh every 30 seconds — picks up new comments without user action
  useEffect(() => {
    if (!activeAccount) return;
    const interval = setInterval(() => {
      fetchComments();
      fetchStats();
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, [activeAccount, fetchComments, fetchStats]);

  function handleAccountChange(account: FacebookAccount) {
    setActiveAccount(account);
    localStorage.setItem('activeAccountId', account.id);
    setPage(1);
    setFilter('all');
    setSearch('');
  }

  async function handleSync() {
    if (!activeAccount) return;
    setSyncing(true);
    try {
      const res = await commentsApi.sync(activeAccount.id);
      await fetchComments();
      await fetchStats();
      alert(`Sync complete! ${res.data.added} new comments added.`);
    } catch {
      alert('Sync failed. Check Facebook connection.');
    } finally {
      setSyncing(false);
    }
  }

  function handleReplyUpdated() {
    fetchComments();
    fetchStats();
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      <Navbar
        accounts={accounts}
        activeAccount={activeAccount}
        onAccountChange={handleAccountChange}
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {!activeAccount ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{activeAccount.account_name}</h1>
                <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
                  Facebook Comments Dashboard
                  {lastUpdated && (
                    <span className="ml-2 text-gray-400">
                      · actualizado {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="btn-secondary flex items-center gap-1.5 flex-shrink-0 text-sm px-3 py-1.5"
              >
                <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden xs:inline sm:inline">{syncing ? 'Syncing...' : 'Sync'}</span>
              </button>
            </div>

            {stats && (
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
                {[
                  { label: 'Total', labelFull: 'Total Comments', value: stats.totalComments, color: 'text-gray-900', bg: 'bg-gray-50' },
                  { label: 'Respondidos', labelFull: 'Responded', value: stats.responded, color: 'text-green-700', bg: 'bg-green-50' },
                  { label: 'Pendientes', labelFull: 'Pending', value: stats.pending, color: 'text-yellow-700', bg: 'bg-yellow-50' },
                ].map((stat) => (
                  <div key={stat.label} className={`card p-2.5 sm:p-4 ${stat.bg}`}>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium leading-tight">
                      <span className="sm:hidden">{stat.label}</span>
                      <span className="hidden sm:inline">{stat.labelFull}</span>
                    </p>
                    <p className={`text-xl sm:text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg self-start">
                {([
                  { key: 'all', label: 'Todos' },
                  { key: 'pending', label: 'Pendientes' },
                  { key: 'responded', label: 'Respondidos' },
                ] as { key: FilterType; label: string }[]).map(({ key: f, label }) => (
                  <button
                    key={f}
                    onClick={() => { setFilter(f); setPage(1); }}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                      filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 sm:max-w-md">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search comments..."
                  className="input pl-9"
                />
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card p-4 animate-pulse">
                    <div className="flex gap-3">
                      <div className="w-9 h-9 bg-gray-200 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-1/4" />
                        <div className="h-3 bg-gray-200 rounded w-3/4" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <div className="card p-12 text-center">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="text-gray-500 font-medium">No comments found</h3>
                <p className="text-gray-400 text-sm mt-1">
                  {filter !== 'all' ? 'Try changing the filter' : 'Sync to fetch latest comments from Facebook'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    onReply={setSelectedComment}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 sm:mt-6">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs sm:text-sm text-gray-600 text-center">
                  {page} / {totalPages} <span className="hidden sm:inline">({total} total)</span>
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <ResponseModal
        comment={selectedComment}
        onClose={() => setSelectedComment(null)}
        onUpdate={handleReplyUpdated}
      />
    </>
  );
}
