'use client';

import { useState, useEffect } from 'react';
import { Activity, Member, CATEGORY_CONFIG } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { formatDateKorean } from '@/lib/dateUtils';

interface Props {
  tripId: string;
  date: string;
  members: Member[];
  activity: Activity | null;
  onClose: () => void;
  onSave: () => void;
}

const CATEGORIES = Object.entries(CATEGORY_CONFIG) as [
  keyof typeof CATEGORY_CONFIG,
  (typeof CATEGORY_CONFIG)[keyof typeof CATEGORY_CONFIG]
][];

export default function ActivityModal({ tripId, date, members, activity, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    time: '',
    title: '',
    category: 'other' as Activity['category'],
    location: '',
    notes: '',
    maps_url: '',
    assigned_to: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resolvingUrl, setResolvingUrl] = useState(false);

  useEffect(() => {
    if (activity) {
      setForm({
        time: activity.time,
        title: activity.title,
        category: activity.category,
        location: activity.location,
        notes: activity.notes,
        maps_url: activity.maps_url ?? '',
        assigned_to: activity.assigned_to,
      });
    } else {
      setForm({ time: '', title: '', category: 'other', location: '', notes: '', maps_url: '', assigned_to: [] });
    }
  }, [activity]);

  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const resolveMapsUrl = async (url: string) => {
    if (!url || (!url.includes('google') && !url.includes('goo.gl') && !url.includes('maps.app'))) return;
    setResolvingUrl(true);
    try {
      const res = await fetch(`/api/resolve-maps?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.name) {
        setForm((p) => ({
          ...p,
          title: p.title.trim() ? p.title : data.name,
          category: (data.category as Activity['category']) ?? p.category,
          maps_url: url,
        }));
      }
    } catch { /* ignore */ }
    setResolvingUrl(false);
  };

  const toggleAssigned = (name: string) => {
    setForm((p) => ({
      ...p,
      assigned_to: p.assigned_to.includes(name)
        ? p.assigned_to.filter((n) => n !== name)
        : [...p.assigned_to, name],
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('활동명을 입력해주세요');
      return;
    }
    setSaving(true);
    setError('');

    try {
      if (activity) {
        const { error: err } = await supabase
          .from('activities')
          .update({
            time: form.time,
            title: form.title.trim(),
            category: form.category,
            location: form.location.trim(),
            notes: form.notes.trim(),
            maps_url: form.maps_url.trim(),
            assigned_to: form.assigned_to,
          })
          .eq('id', activity.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('activities')
          .insert({
            trip_id: tripId,
            date,
            time: form.time,
            title: form.title.trim(),
            category: form.category,
            location: form.location.trim(),
            notes: form.notes.trim(),
            maps_url: form.maps_url.trim(),
            assigned_to: form.assigned_to,
          });
        if (err) throw err;
      }
      onSave();
      onClose();
    } catch (err) {
      console.error(err);
      setError('저장 중 오류가 발생했습니다.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            {activity ? '활동 수정' : '활동 추가'}
          </h2>
          <p className="text-sm text-gray-400 mb-5">{formatDateKorean(date)}</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Google Maps URL — 최상단: 붙여넣으면 이름·카테고리 자동 입력 */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <label className="block text-xs font-semibold text-green-700 mb-1.5">
                🗺️ 구글맵 링크 붙여넣기 → 이름·카테고리 자동 입력
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={form.maps_url}
                  onChange={(e) => set('maps_url', e.target.value)}
                  onBlur={(e) => resolveMapsUrl(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text');
                    setTimeout(() => resolveMapsUrl(text), 50);
                  }}
                  placeholder="구글맵 링크 붙여넣기..."
                  className="w-full border border-green-200 bg-white rounded-xl px-4 py-2.5 text-gray-900 placeholder-green-300 focus:outline-none focus:ring-2 focus:ring-green-300"
                />
                {resolvingUrl && (
                  <span className="absolute right-3 top-3 text-xs text-green-500 animate-pulse">분석중...</span>
                )}
              </div>
              {form.maps_url && (
                <a href={form.maps_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-green-600 hover:underline mt-1 inline-block">
                  🗺️ 지도 미리보기
                </a>
              )}
            </div>

            {/* Time */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">시간</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => set('time', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                활동명 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="예: 긴자 쇼핑"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
                autoFocus
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">카테고리</label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, category: key }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                      form.category === key
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">장소명</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="예: 긴자 6정목"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">메모</label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="추가 메모를 입력하세요"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
            </div>

            {/* Assigned members */}
            {members.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">담당자</label>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleAssigned(m.name)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                        form.assigned_to.includes(m.name)
                          ? 'border-transparent text-white'
                          : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                      }`}
                      style={
                        form.assigned_to.includes(m.name)
                          ? { backgroundColor: m.color }
                          : {}
                      }
                    >
                      <span className="font-bold">{m.name[0]}</span>
                      <span>{m.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
