'use client';

import { useState, useEffect, useCallback } from 'react';
import { accountsApi } from '../lib/api';
import { OverviewResponse, HistoryPoint } from '../types';
import { GrowthChart } from './GrowthChart';

interface OverviewPanelProps {
  open: boolean;
  onClose: () => void;
  onGoToPending: (accountId: string) => void;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-ES');
}

export function OverviewPanel({ open, onClose, onGoToPending }: OverviewPanelProps) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // null = consolidado (all accounts); otherwise the selected account id
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [metric, setMetric] = useState<'followers' | 'comments'>('followers');

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await accountsApi.getOverview();
      setData(res.data);
    } catch {
      setError('No se pudo cargar el panel. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (accountId: string) => {
    try {
      const res = await accountsApi.getHistory(accountId, 30);
      setHistory(res.data.series);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      fetchOverview();
    }
  }, [open, fetchOverview]);

  useEffect(() => {
    if (open) fetchHistory(selectedId || 'all');
  }, [open, selectedId, fetchHistory]);

  if (!open) return null;

  const selected = selectedId ? data?.accounts.find((a) => a.id === selectedId) : null;

  // The figures shown depend on whether a single account or the consolidated total is selected.
  const view = selected
    ? {
        followers: selected.followers ?? 0,
        totalComments: selected.totalComments,
        responded: selected.responded,
        pending: selected.pending,
      }
    : data?.totals ?? { followers: 0, totalComments: 0, responded: 0, pending: 0 };

  const responseRate =
    view.totalComments > 0 ? Math.round((view.responded / view.totalComments) * 100) : 0;

  const cards = [
    { id: 'followers', label: 'Seguidores', value: formatNumber(view.followers), color: 'text-blue-700', bg: 'bg-blue-50' },
    { id: 'comments', label: 'Comentarios', value: formatNumber(view.totalComments), color: 'text-gray-900', bg: 'bg-gray-50' },
    { id: 'responded', label: 'Respondidos', value: formatNumber(view.responded), color: 'text-green-700', bg: 'bg-green-50' },
    { id: 'pending', label: 'Pendientes', value: formatNumber(view.pending), color: 'text-yellow-700', bg: 'bg-yellow-50' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Panel de cuentas</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {selected ? selected.account_name : `Consolidado · ${data?.accounts.length || 0} cuentas`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          {/* Account selector */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedId(null)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                selectedId === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              Consolidado
            </button>
            {data?.accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedId === a.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                {a.account_name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card p-4 animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
                  <div className="h-6 bg-gray-200 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="card p-8 text-center">
              <p className="text-red-600 text-sm">{error}</p>
              <button onClick={fetchOverview} className="btn-secondary mt-3 text-sm px-3 py-1.5">Reintentar</button>
            </div>
          ) : (
            <>
              {/* Metric cards */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {cards.map((c) => {
                  // Pendientes card jumps straight to that account's pending comments.
                  const clickable = c.id === 'pending' && selected && view.pending > 0;
                  const inner = (
                    <>
                      <p className="text-xs sm:text-sm text-gray-500 font-medium flex items-center gap-1">
                        {c.label}
                        {clickable && (
                          <svg className="w-3.5 h-3.5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </p>
                      <p className={`text-xl sm:text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
                    </>
                  );
                  return clickable ? (
                    <button
                      key={c.id}
                      onClick={() => onGoToPending(selected!.id)}
                      className={`card p-3 sm:p-4 text-left ${c.bg} hover:ring-2 hover:ring-yellow-300 transition-all`}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div key={c.id} className={`card p-3 sm:p-4 ${c.bg}`}>{inner}</div>
                  );
                })}
              </div>

              {/* Response rate */}
              <div className="card p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Tasa de respuesta</p>
                  <p className="text-sm font-bold text-gray-900">{responseRate}%</p>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${responseRate}%` }} />
                </div>
              </div>

              {/* Growth chart */}
              <div className="card p-3 sm:p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">Crecimiento (30 días)</p>
                  <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                    {([
                      { key: 'followers', label: 'Seguidores' },
                      { key: 'comments', label: 'Comentarios' },
                    ] as { key: 'followers' | 'comments'; label: string }[]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setMetric(key)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          metric === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {metric === 'followers' ? (
                  <GrowthChart
                    points={history.map((h) => h.followers)}
                    labels={history.map((h) => h.date)}
                    type="line"
                    color="#2563eb"
                  />
                ) : (
                  <GrowthChart
                    points={history.map((h) => h.comments)}
                    labels={history.map((h) => h.date)}
                    type="bar"
                    color="#16a34a"
                  />
                )}
                {metric === 'followers' && history.every((h) => h.followers === null) && (
                  <p className="text-xs text-gray-400 text-center mt-1">
                    El historial de seguidores se acumula desde hoy. Vuelve mañana para ver el crecimiento.
                  </p>
                )}
              </div>

              {/* Per-account breakdown (only in consolidated view) */}
              {!selected && data && data.accounts.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Por cuenta · toca para ver pendientes</p>
                  </div>
                  <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {data.accounts.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => onGoToPending(a.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                      >
                        {a.avatar_url ? (
                          <img src={a.avatar_url} alt={a.account_name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {a.account_name[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{a.account_name}</p>
                          <p className="text-xs text-gray-400">
                            {a.followers !== null ? `${formatNumber(a.followers)} seguidores` : 'seguidores n/d'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-gray-900">{formatNumber(a.totalComments)}</p>
                          <p className="text-xs text-yellow-600 font-medium">{a.pending} pend.</p>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
