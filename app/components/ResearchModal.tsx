'use client';

import { useState } from 'react';
import { Member, ResearchItem } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface Props {
  tripId: string;
  members: Member[];
  onClose: () => void;
  onSave: () => void;
}

export default function ResearchModal({ tripId, members, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as ResearchItem['priority'],
    assigned_to: '',
    url: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('제목을 입력해주세요');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const { error: err } = await supabase
        .from('research_items')
        .insert({
          trip_id: tripId,
          title: form.title.trim(),
          description: form.description.trim(),
          priority: form.priority,
          assigned_to: form.assigned_to.trim(),
          url: form.url.trim(),
          status: 'pending',
        });

      if (err) throw err;

      onSave();
      onClose();
    } catch (err) {
      console.error(err);
      setError('저장 중 오류가 발생했습니다.');
      setSaving(false);
    }
  };

  const PRIORITY_OPTIONS: { value: ResearchItem['priority']; label: string; color: string }[] = [
    { value: 'high', label: '높음', color: 'border-red-400 bg-red-50 text-red-700' },
    { value: 'medium', label: '보통', color: 'border-yellow-400 bg-yellow-50 text-yellow-700' },
    { value: 'low', label: '낮음', color: 'border-gray-300 bg-gray-50 text-gray-600' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">조사 항목 추가</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                조사 제목 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="예: 도쿄 스카이트리 입장료"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">설명</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="조사할 내용에 대한 설명"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">우선순위</label>
              <div className="flex gap-2">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, priority: opt.value }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      form.priority === opt.value
                        ? opt.color
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned to */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">담당자</label>
              {members.length > 0 ? (
                <select
                  value={form.assigned_to}
                  onChange={(e) => set('assigned_to', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                >
                  <option value="">담당자 없음</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.assigned_to}
                  onChange={(e) => set('assigned_to', e.target.value)}
                  placeholder="담당자 이름"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              )}
            </div>

            {/* URL */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">참고 URL</label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
                placeholder="https://..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>

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
