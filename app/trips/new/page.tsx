'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { MEMBER_COLORS, COVER_EMOJIS } from '@/lib/types';
import { setMySession, addRecentTrip } from '@/lib/storage';

export default function NewTripPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    destination: '',
    startDate: '',
    endDate: '',
    description: '',
    memberName: '',
    coverEmoji: '✈️',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = '여행 제목을 입력해주세요';
    if (!form.destination.trim()) errs.destination = '여행지를 입력해주세요';
    if (!form.startDate) errs.startDate = '출발일을 선택해주세요';
    if (!form.endDate) errs.endDate = '귀국일을 선택해주세요';
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      errs.endDate = '귀국일은 출발일 이후여야 합니다';
    }
    if (!form.memberName.trim()) errs.memberName = '이름을 입력해주세요';
    return errs;
  };

  const set = (key: string, value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key]) setErrors((p) => { const n = { ...p }; delete n[key]; return n; });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);

    try {
      // Insert trip
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({
          title: form.title.trim(),
          destination: form.destination.trim(),
          start_date: form.startDate,
          end_date: form.endDate,
          description: form.description.trim(),
          cover_emoji: form.coverEmoji,
        })
        .select()
        .single();

      if (tripError) throw tripError;

      // Pick color
      const color = MEMBER_COLORS[0];

      // Insert creator as first member
      const { error: memberError } = await supabase
        .from('members')
        .insert({
          trip_id: trip.id,
          name: form.memberName.trim(),
          color,
        });

      if (memberError) throw memberError;

      // Save session to localStorage
      setMySession(form.memberName.trim(), color);
      addRecentTrip(trip.id);

      router.push(`/trips/${trip.id}`);
    } catch (err) {
      console.error(err);
      setErrors({ submit: 'Supabase 연결 오류입니다. .env.local 파일에 실제 Supabase 키를 입력해주세요.' });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="text-lg font-bold text-gray-900">새 여행 계획</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Cover emoji picker */}
        <div className="bg-gradient-to-br from-blue-500 to-teal-400 rounded-2xl p-6 mb-6 text-center">
          <div className="text-6xl mb-4">{form.coverEmoji}</div>
          <p className="text-white/80 text-sm mb-3">여행 테마를 선택하세요</p>
          <div className="flex flex-wrap justify-center gap-2">
            {COVER_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => set('coverEmoji', emoji)}
                className={`text-2xl w-12 h-12 rounded-xl transition-all ${
                  form.coverEmoji === emoji
                    ? 'bg-white shadow-lg scale-110'
                    : 'bg-white/20 hover:bg-white/40'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {errors.submit && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
            {errors.submit}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                여행 제목 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="예: 도쿄 봄 여행 🌸"
                className={`w-full border rounded-xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                  errors.title ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title}</p>}
            </div>

            {/* Destination */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                목적지 <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base leading-none">📍</span>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => set('destination', e.target.value)}
                  placeholder="예: 일본 도쿄"
                  className={`w-full border rounded-xl pl-10 pr-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                    errors.destination ? 'border-red-300' : 'border-gray-200'
                  }`}
                />
              </div>
              {errors.destination && <p className="text-red-400 text-xs mt-1">{errors.destination}</p>}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  출발일 <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                  className={`w-full border rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                    errors.startDate ? 'border-red-300' : 'border-gray-200'
                  }`}
                />
                {errors.startDate && <p className="text-red-400 text-xs mt-1">{errors.startDate}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  귀국일 <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(e) => set('endDate', e.target.value)}
                  className={`w-full border rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                    errors.endDate ? 'border-red-300' : 'border-gray-200'
                  }`}
                />
                {errors.endDate && <p className="text-red-400 text-xs mt-1">{errors.endDate}</p>}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">여행 설명</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="여행에 대한 간단한 설명을 입력하세요 (선택)"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              />
            </div>

            {/* My name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                내 이름 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.memberName}
                onChange={(e) => set('memberName', e.target.value)}
                placeholder="예: 김민준"
                className={`w-full border rounded-xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                  errors.memberName ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              {errors.memberName && <p className="text-red-400 text-xs mt-1">{errors.memberName}</p>}
              <p className="text-xs text-gray-400 mt-1">여행 개설자로 자동 등록됩니다</p>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-blue-500 to-teal-400 text-white font-bold py-4 rounded-2xl hover:from-blue-600 hover:to-teal-500 transition-all shadow-md text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '만드는 중...' : '✈️ 여행 만들기'}
          </button>
        </form>
      </main>
    </div>
  );
}
