'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CATEGORY_CONFIG } from '@/lib/types';
import { formatDateKorean, getDayNumber } from '@/lib/dateUtils';

interface Candidate {
  id: string;
  trip_id: string;
  name: string;
  category: string;
  notes: string;
  maps_url: string;
  created_at: string;
}

const CANDIDATE_CATS = [
  { key: 'sightseeing', label: '관광', icon: '🎡' },
  { key: 'food', label: '식사', icon: '🍽️' },
  { key: 'shopping', label: '쇼핑', icon: '🛍️' },
  { key: 'accommodation', label: '숙박', icon: '🏨' },
  { key: 'transport', label: '이동', icon: '🚌' },
  { key: 'other', label: '기타', icon: '📌' },
];

interface Props {
  tripId: string;
  days: string[];
  startDate: string;
  onAddToSchedule: (candidate: Candidate, date: string, time: string) => void;
  onReceiveActivity?: (activity: { id: string; name: string; category: string; notes: string }) => void;
}

export default function CandidatesPanel({ tripId, days, startDate, onAddToSchedule, onReceiveActivity }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'sightseeing', notes: '', maps_url: '' });
  const [adding, setAdding] = useState(false);
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [quickUrl, setQuickUrl] = useState('');
  const [quickResolving, setQuickResolving] = useState(false);
  const [quickSuccess, setQuickSuccess] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ date: days[0] ?? '', time: '' });
  const [dragOver, setDragOver] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 8;

  useEffect(() => {
    supabase.from('candidate_places').select('*').eq('trip_id', tripId).order('created_at').then(({ data }) => {
      if (!data) return;
      const saved = localStorage.getItem(`candidates_order_${tripId}`);
      if (saved) {
        const order: string[] = JSON.parse(saved);
        const sorted = [...data].sort((a, b) => {
          const ai = order.indexOf(a.id);
          const bi = order.indexOf(b.id);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        setCandidates(sorted);
      } else {
        setCandidates(data);
      }
    });

    const channel = supabase
      .channel(`candidates-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidate_places', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setCandidates((p) => [...p, payload.new as Candidate]);
          else if (payload.eventType === 'DELETE') setCandidates((p) => p.filter((c) => c.id !== payload.old.id));
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  useEffect(() => { setCurrentPage(1); }, [filterText]);

  async function resolveMapsUrl(url: string) {
    if (!url || (!url.includes('google') && !url.includes('goo.gl') && !url.includes('maps.app'))) return;
    setResolvingUrl(true);
    try {
      const res = await fetch(`/api/resolve-maps?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.name) {
        setForm((p) => ({
          ...p,
          name: p.name.trim() ? p.name : data.name,
          category: data.category ?? p.category,
          maps_url: url,
        }));
      }
    } catch { /* ignore */ }
    setResolvingUrl(false);
  }

  async function quickAddFromUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed || (!trimmed.includes('google') && !trimmed.includes('goo.gl') && !trimmed.includes('maps.app'))) return;
    setQuickResolving(true);
    try {
      const res = await fetch(`/api/resolve-maps?url=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.name) {
        await supabase.from('candidate_places').insert({
          trip_id: tripId,
          name: data.name,
          category: data.category ?? 'sightseeing',
          notes: '',
          maps_url: trimmed,
        });
        setQuickUrl('');
        setQuickSuccess(true);
        setTimeout(() => setQuickSuccess(false), 2000);
      }
    } catch { /* ignore */ }
    setQuickResolving(false);
  }

  async function addCandidate() {
    if (!form.name.trim()) return;
    setAdding(true);
    await supabase.from('candidate_places').insert({
      trip_id: tripId,
      name: form.name.trim(),
      category: form.category,
      notes: form.notes,
      maps_url: form.maps_url,
    });
    setForm({ name: '', category: 'sightseeing', notes: '', maps_url: '' });
    setShowForm(false);
    setAdding(false);
  }

  async function deleteCandidate(id: string) {
    await supabase.from('candidate_places').delete().eq('id', id);
    setCandidates((p) => p.filter((c) => c.id !== id));
  }

  function handleAssign(candidate: Candidate) {
    if (!assignForm.date) return;
    onAddToSchedule(candidate, assignForm.date, assignForm.time);
    setAssigningId(null);
    setAssignForm({ date: days[0] ?? '', time: '' });
  }

  function handleInternalDragStart(e: React.DragEvent, id: string, candidate: Candidate) {
    setDragItemId(id);
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'candidate', ...candidate }));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleInternalDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (dragItemId && dragItemId !== id) setDragOverId(id);
  }

  function handleInternalDrop(e: React.DragEvent, toId: string) {
    e.stopPropagation();
    if (!dragItemId || dragItemId === toId) { setDragItemId(null); setDragOverId(null); return; }
    setCandidates((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((x) => x.id === dragItemId);
      const toIdx = next.findIndex((x) => x.id === toId);
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      localStorage.setItem(`candidates_order_${tripId}`, JSON.stringify(next.map((x) => x.id)));
      return next;
    });
    setDragItemId(null);
    setDragOverId(null);
  }

  const displayed = filterText.trim()
    ? candidates.filter((c) => c.name.toLowerCase().includes(filterText.toLowerCase()))
    : candidates;

  const totalPages = Math.max(1, Math.ceil(displayed.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = displayed.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const getCatConfig = (key: string) => CANDIDATE_CATS.find((c) => c.key === key) ?? CANDIDATE_CATS[CANDIDATE_CATS.length - 1];
  const getCatColor = (key: string) => CATEGORY_CONFIG[key as keyof typeof CATEGORY_CONFIG]?.color ?? 'bg-gray-100 text-gray-700';

  return (
    <div
      className={`flex flex-col h-full relative transition-colors ${dragOver ? 'bg-purple-50' : ''}`}
      onDragEnter={(e) => { if (dragItemId) return; e.preventDefault(); setDragOver(true); }}
      onDragOver={(e) => { if (dragItemId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={(e) => {
        if (dragItemId) return;
        e.preventDefault();
        setDragOver(false);
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.type === 'activity' && onReceiveActivity) onReceiveActivity(data);
        } catch { /* ignore */ }
      }}
    >
      {dragOver && (
        <div className="absolute inset-0 border-2 border-dashed border-purple-300 pointer-events-none z-20 flex items-center justify-center rounded">
          <span className="bg-purple-100 text-purple-600 text-sm font-semibold px-4 py-2 rounded-xl shadow">후보지로 이동</span>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <span className="font-bold text-gray-800 text-sm">후보지 목록</span>
          {candidates.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-600 font-semibold px-1.5 py-0.5 rounded-full">{candidates.length}</span>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-blue-500 text-white font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-600 transition-colors"
        >
          + 직접 추가
        </button>
      </div>

      {/* Filter search */}
      {candidates.length > 3 && (
        <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="🔍 후보지 검색..."
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      )}

      {/* Quick URL add */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="relative">
          <input
            type="url"
            value={quickUrl}
            onChange={(e) => setQuickUrl(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              setTimeout(() => quickAddFromUrl(text), 50);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') quickAddFromUrl(quickUrl); }}
            placeholder="🗺️ 구글맵 링크 붙여넣기"
            className="w-full border border-green-200 rounded-lg px-3 py-2 text-xs bg-green-50 placeholder-green-300 focus:outline-none focus:ring-2 focus:ring-green-300"
          />
          {quickResolving && (
            <span className="absolute right-2 top-2 text-xs text-green-500 animate-pulse">분석 중...</span>
          )}
          {quickSuccess && (
            <span className="absolute right-2 top-2 text-xs text-green-600 font-semibold">✓ 추가됨</span>
          )}
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex-shrink-0">
          <div className="space-y-2">
            {/* Google Maps URL */}
            <div className="relative">
              <input
                type="url"
                value={form.maps_url}
                onChange={(e) => setForm((p) => ({ ...p, maps_url: e.target.value }))}
                onBlur={(e) => resolveMapsUrl(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  setTimeout(() => resolveMapsUrl(text), 50);
                }}
                placeholder="🗺️ Google Maps 링크 붙여넣기 (선택)"
                className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300"
              />
              {resolvingUrl && (
                <span className="absolute right-2 top-2 text-xs text-green-500 animate-pulse">분석중...</span>
              )}
            </div>

            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addCandidate()}
              placeholder="장소 이름 *"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {CANDIDATE_CATS.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="메모 (선택)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-xs text-gray-400 px-2 py-1.5 hover:text-gray-600">취소</button>
              <button
                onClick={addCandidate}
                disabled={adding || !form.name.trim()}
                className="text-xs bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Candidates List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {candidates.length === 0 ? (
          <div className="text-center py-8 text-gray-300">
            <div className="text-3xl mb-2">🗺️</div>
            <p className="text-xs">가고 싶은 곳을 추가해보세요</p>
            <p className="text-xs mt-1">일정 항목을 여기로 드래그하세요</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-8 text-gray-300">
            <p className="text-xs">&quot;{filterText}&quot; 검색 결과 없음</p>
          </div>
        ) : (
          paginated.map((c) => {
            const cat = getCatConfig(c.category);
            const isAssigning = assigningId === c.id;
            return (
              <div
                key={c.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden group cursor-grab active:cursor-grabbing transition-all ${
                  dragOverId === c.id ? 'border-blue-400 border-2 scale-[1.01]' : 'border-gray-100'
                } ${dragItemId === c.id ? 'opacity-40' : ''}`}
                draggable
                onDragStart={(e) => handleInternalDragStart(e, c.id, c)}
                onDragOver={(e) => handleInternalDragOver(e, c.id)}
                onDrop={(e) => handleInternalDrop(e, c.id)}
                onDragEnd={() => { setDragItemId(null); setDragOverId(null); }}
              >
                <div className="flex items-start gap-2 p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5 ${getCatColor(c.category)}`}>
                    {cat.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{c.name}</p>
                    {c.notes && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{c.notes}</p>}
                    {c.maps_url && (
                      <a
                        href={c.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1 mt-1 hover:underline"
                      >
                        🗺️ 지도 보기
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => deleteCandidate(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0 p-0.5"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Assign to schedule */}
                {isAssigning ? (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-50 pt-2">
                    <select
                      value={assignForm.date}
                      onChange={(e) => setAssignForm((p) => ({ ...p, date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      {days.map((d) => (
                        <option key={d} value={d}>
                          Day {getDayNumber(startDate, d)} · {formatDateKorean(d)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={assignForm.time}
                      onChange={(e) => setAssignForm((p) => ({ ...p, time: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => setAssigningId(null)} className="flex-1 text-xs text-gray-400 py-1.5 rounded-lg border border-gray-200 hover:text-gray-600">취소</button>
                      <button
                        onClick={() => handleAssign(c)}
                        className="flex-1 text-xs bg-blue-500 text-white font-semibold py-1.5 rounded-lg hover:bg-blue-600"
                      >
                        배치
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-3 pb-2.5">
                    <button
                      onClick={() => { setAssigningId(c.id); setAssignForm({ date: days[0] ?? '', time: '' }); }}
                      className="w-full text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-50 py-1.5 rounded-lg transition-colors font-medium border border-blue-100"
                    >
                      📅 일정에 배치
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-1 pb-2 px-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-2 py-1 rounded hover:bg-gray-100"
            >
              ← 이전
            </button>
            <span className="text-xs text-gray-400">
              {safePage} / {totalPages}페이지
              <span className="ml-1 text-gray-300">({displayed.length}개)</span>
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-2 py-1 rounded hover:bg-gray-100"
            >
              다음 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
