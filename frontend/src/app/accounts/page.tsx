'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/Navbar';
import { accountsApi, authApi } from '../../lib/api';
import { FacebookAccount, AccountSettings } from '../../types';

const MAX_ACCOUNTS = 40;
const TONES = ['professional', 'friendly', 'casual', 'formal', 'empathetic'];

function AccountsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<FacebookAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<FacebookAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [selectedSettings, setSelectedSettings] = useState<{ id: string; settings: AccountSettings } | null>(null);
  const [newRule, setNewRule] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await accountsApi.list();
      setAccounts(res.data.accounts);
      if (res.data.accounts.length > 0 && !activeAccount) {
        setActiveAccount(res.data.accounts[0]);
      }
    } catch {
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.replace('/login'); return; }
    fetchAccounts();
  }, [fetchAccounts, router]);

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const added = searchParams.get('added');

    if (success === 'connected') {
      setNotification({ type: 'success', msg: `${added || 0} account(s) connected successfully!` });
      fetchAccounts();
    } else if (error) {
      const msgs: Record<string, string> = {
        facebook_denied: 'Facebook connection was denied.',
        missing_params: 'Invalid callback parameters.',
        connection_failed: 'Failed to connect Facebook account.',
      };
      setNotification({ type: 'error', msg: msgs[error] || 'Connection error.' });
    }

    const timer = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [searchParams, fetchAccounts]);

  async function handleConnectFacebook() {
    if (accounts.length >= MAX_ACCOUNTS) {
      setNotification({ type: 'error', msg: 'Maximum 40 accounts reached.' });
      return;
    }

    setConnecting(true);
    try {
      const res = await authApi.getFacebookAuthUrl();
      window.location.href = res.data.url;
    } catch {
      setNotification({ type: 'error', msg: 'Failed to start Facebook OAuth.' });
      setConnecting(false);
    }
  }

  async function handleDisconnect(account: FacebookAccount) {
    if (accounts.length <= 1) {
      setNotification({ type: 'error', msg: 'Cannot disconnect the only account.' });
      return;
    }

    if (!confirm(`Disconnect "${account.account_name}"? This will remove all its data.`)) return;

    try {
      await accountsApi.disconnect(account.id);
      setNotification({ type: 'success', msg: `"${account.account_name}" disconnected.` });
      fetchAccounts();
    } catch {
      setNotification({ type: 'error', msg: 'Failed to disconnect account.' });
    }
  }

  async function handleOpenSettings(account: FacebookAccount) {
    try {
      const res = await accountsApi.getSettings(account.id);
      setSelectedSettings({ id: account.id, settings: res.data });
    } catch {
      setNotification({ type: 'error', msg: 'Failed to load settings.' });
    }
  }

  async function handleSaveSettings() {
    if (!selectedSettings) return;
    setSavingSettings(true);
    try {
      await accountsApi.updateSettings(selectedSettings.id, selectedSettings.settings);
      setNotification({ type: 'success', msg: 'Settings saved.' });
      setSelectedSettings(null);
    } catch {
      setNotification({ type: 'error', msg: 'Failed to save settings.' });
    } finally {
      setSavingSettings(false);
    }
  }

  function addRule() {
    if (!newRule.trim() || !selectedSettings) return;
    setSelectedSettings({
      ...selectedSettings,
      settings: {
        ...selectedSettings.settings,
        rules: [...selectedSettings.settings.rules, newRule.trim()],
      },
    });
    setNewRule('');
  }

  function removeRule(index: number) {
    if (!selectedSettings) return;
    const rules = [...selectedSettings.settings.rules];
    rules.splice(index, 1);
    setSelectedSettings({ ...selectedSettings, settings: { ...selectedSettings.settings, rules } });
  }

  return (
    <>
      <Navbar
        accounts={accounts}
        activeAccount={activeAccount}
        onAccountChange={setActiveAccount}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {notification && (
          <div
            className={`mb-6 p-4 rounded-xl border text-sm font-medium flex items-center gap-2 ${
              notification.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {notification.type === 'success' ? (
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            {notification.msg}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Accounts</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {accounts.length} of {MAX_ACCOUNTS} accounts connected
            </p>
          </div>
          <button
            onClick={handleConnectFacebook}
            disabled={connecting || accounts.length >= MAX_ACCOUNTS}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {connecting ? 'Connecting...' : 'Add Account'}
          </button>
        </div>

        {accounts.length >= MAX_ACCOUNTS && (
          <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl text-orange-800 text-sm font-medium">
            Maximum limit of 40 accounts reached. Disconnect one to add another.
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="card p-5 animate-pulse flex gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Facebook accounts connected</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Connect your Facebook pages to start managing and replying to comments with AI assistance.
            </p>
            <button
              onClick={handleConnectFacebook}
              disabled={connecting}
              className="btn-primary"
            >
              {connecting ? 'Connecting...' : 'Connect Facebook Account'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {account.avatar_url ? (
                    <img
                      src={account.avatar_url}
                      alt={account.account_name}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-lg">
                      {account.account_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{account.account_name}</p>
                    <p className="text-sm text-gray-400">
                      Connected {new Date(account.connected_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">ID: {account.account_id}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href="/dashboard"
                    onClick={() => {
                      setActiveAccount(account);
                      localStorage.setItem('activeAccountId', account.id);
                    }}
                    className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Dashboard
                  </Link>
                  <button
                    onClick={() => handleOpenSettings(account)}
                    className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </button>
                  {accounts.length > 1 && (
                    <button
                      onClick={() => handleDisconnect(account)}
                      className="text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedSettings(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Account Settings</h2>
                <button onClick={() => setSelectedSettings(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reply Tone</label>
                  <select
                    value={selectedSettings.settings.tone}
                    onChange={(e) =>
                      setSelectedSettings({
                        ...selectedSettings,
                        settings: { ...selectedSettings.settings, tone: e.target.value },
                      })
                    }
                    className="input capitalize"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t} className="capitalize">{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Rules ({selectedSettings.settings.rules.length})
                  </label>
                  <div className="space-y-2 mb-3">
                    {selectedSettings.settings.rules.map((rule, i) => (
                      <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-700 flex-1">{rule}</span>
                        <button
                          onClick={() => removeRule(i)}
                          className="text-red-400 hover:text-red-600 flex-shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRule}
                      onChange={(e) => setNewRule(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRule()}
                      placeholder="e.g. Always mention our return policy"
                      className="input flex-1 text-sm"
                    />
                    <button onClick={addRule} className="btn-secondary text-sm px-3">Add</button>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="btn-primary flex-1"
                  >
                    {savingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                  <button onClick={() => setSelectedSettings(null)} className="btn-secondary px-4">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}>
      <AccountsContent />
    </Suspense>
  );
}
