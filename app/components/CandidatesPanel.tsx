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
  const [form, setForm] = useState({ name: '', category: 'sightseeing', notes: '' });
  const [adding, setAdding] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ date: days[0] ?? '', time: '' });
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    supabase.from('candidate_places').select('*').eq('trip_id', tripId).order('created_at').then(({ data }) => {
      if (data) setCandidates(data);
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

  async function addCandidate() {
    if (!form.name.trim()) return;
    setAdding(true);
    await supabase.from('candidate_places').insert({ trip_id: tripId, ...form, name: form.name.trim() });
    setForm({ name: '', category: 'sightseeing', notes: '' });
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

  const getCatConfig = (key: string) => CANDIDATE_CATS.find((c) => c.key === key) ?? CANDIDATE_CATS[CANDIDATE_CATS.length - 1];
  const getCatColor = (key: string) => CATEGORY_CONFIG[key as keyof typeof CATEGORY_CONFIG]?.color ?? 'bg-gray-100 text-gray-700';

  return (
    <div className="flex flex-col h-full">
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
          + 추가
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex-shrink-0">
          <div className="space-y-2">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && addCandidate()}
              placeholder="장소 이름"
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

      {/* Candidates List - also a drop zone for activities */}
      <div
        className={`flex-1 overflow-y-auto px-3 py-2 space-y-2 transition-colors ${dragOver ? 'bg-purple-50' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.type === 'activity' && onReceiveActivity) onReceiveActivity(data);
          } catch { /* ignore */ }
        }}
      >
        {dragOver && (
          <div className="border-2 border-dashed border-purple-300 rounded-xl py-4 text-center text-purple-400 text-xs font-medium mb-2">
            여기에 놓으면 후보지로 이동
          </div>
        )}
        {candidates.length === 0 && !dragOver ? (
          <div className="text-center py-8 text-gray-300">
            <div className="text-3xl mb-2">🗺️</div>
            <p className="text-xs">가고 싶은 곳을 추가해보세요</p>
            <p className="text-xs mt-1">일정 항목을 여기로 드래그하세요</p>
          </div>
        ) : (
          candidates.map((c) => {
            const cat = getCatConfig(c.category);
            const isAssigning = assigningId === c.id;
            return (
              <div
                key={c.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden group cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify({ type: 'candidate', ...c }));
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <div className="flex items-start gap-2 p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5 ${getCatColor(c.category)}`}>
                    {cat.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{c.name}</p>
                    {c.notes && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{c.notes}</p>}
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
      </div>
    </div>
  );
}
