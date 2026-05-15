'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Trip, Member, MEMBER_COLORS } from '@/lib/types';
import { setMySession, addRecentTrip } from '@/lib/storage';
import { getTripDurationDays, formatDateShort } from '@/lib/dateUtils';

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchTrip() {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('share_code', code)
        .single();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setTrip(data as Trip);

      const { data: memberData } = await supabase
        .from('members')
        .select('*')
        .eq('trip_id', data.id)
        .order('created_at', { ascending: true });

      setMembers((memberData as Member[]) ?? []);
      setLoading(false);
    }
    fetchTrip();
  }, [code]);

  const handleJoin = async () => {
    if (!name.trim()) {
      setNameError('이름을 입력해주세요');
      return;
    }
    if (!trip) return;
    setSubmitting(true);

    try {
      // 같은 이름의 멤버가 이미 있으면 → 그 멤버로 입장 (모바일/PC 동일 아이디)
      const existing = members.find((m) => m.name.trim() === name.trim());
      if (existing) {
        setMySession(existing.name, existing.color);
        addRecentTrip(trip.id);
        router.push(`/trips/${trip.id}`);
        return;
      }

      // 새 멤버 생성
      const usedColors = members.map((m) => m.color);
      const availableColors = MEMBER_COLORS.filter((c) => !usedColors.includes(c));
      const color = availableColors.length > 0
        ? availableColors[0]
        : MEMBER_COLORS[members.length % MEMBER_COLORS.length];

      const { error } = await supabase
        .from('members')
        .insert({ trip_id: trip.id, name: name.trim(), color });

      if (error) throw error;

      setMySession(name.trim(), color);
      addRecentTrip(trip.id);
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      console.error(err);
      setNameError('참가 중 오류가 발생했습니다. 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="text-5xl mb-4 animate-pulse">✈️</div>
          <p>여행 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">여행을 찾을 수 없습니다</h2>
          <p className="text-gray-500 mb-6">초대 코드 <strong className="font-mono">{code}</strong>에 해당하는 여행이 없습니다.</p>
          <Link href="/">
            <button className="bg-blue-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-600 transition-colors">
              홈으로 돌아가기
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const duration = trip ? getTripDurationDays(trip.start_date, trip.end_date) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="text-lg font-bold text-gray-900">여행에 참가하기</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        {trip && (
          <>
            {/* Trip info card */}
            <div className="bg-gradient-to-br from-blue-500 to-teal-400 rounded-2xl p-6 text-white mb-6 text-center">
              <div className="text-5xl mb-3">{trip.cover_emoji}</div>
              <h1 className="text-2xl font-extrabold mb-1">{trip.title}</h1>
              <p className="text-blue-100 flex items-center justify-center gap-1 mb-3">
                <span>📍</span>{trip.destination}
              </p>
              <div className="flex flex-wrap justify-center gap-2 text-sm">
                <span className="bg-white/20 px-3 py-1 rounded-full">
                  📅 {formatDateShort(trip.start_date)} ~ {formatDateShort(trip.end_date)}
                </span>
                <span className="bg-white/20 px-3 py-1 rounded-full">
                  🗓️ {duration}일
                </span>
              </div>
              {trip.description && (
                <p className="text-blue-100 text-sm mt-3">{trip.description}</p>
              )}
            </div>

            {/* Existing members */}
            {members.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-600 mb-3">현재 멤버 ({members.length}명)</h2>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.name[0]}
                      </div>
                      <span className="text-sm text-gray-700">{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Join form */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <h2 className="font-bold text-gray-800 mb-1">내 이름 입력</h2>
              <p className="text-xs text-gray-400 mb-4">PC·모바일 어디서든 같은 이름으로 입장하면 같은 멤버로 인식돼요</p>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="예: 이지은"
                className={`w-full border rounded-xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-2 ${
                  nameError ? 'border-red-300' : 'border-gray-200'
                }`}
                autoFocus
              />
              {/* 기존 멤버 이름 일치 감지 */}
              {(() => {
                const match = members.find((m) => m.name.trim() === name.trim());
                if (!match || !name.trim()) return null;
                return (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-3">
                    <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: match.color }}>{match.name[0]}</div>
                    <p className="text-xs text-green-700"><strong>{match.name}</strong>으로 기존 멤버로 입장합니다 ✓</p>
                  </div>
                );
              })()}
              {nameError && <p className="text-red-400 text-xs mb-3">{nameError}</p>}
              <button
                onClick={handleJoin}
                disabled={submitting}
                className="w-full bg-gradient-to-r from-blue-500 to-teal-400 text-white font-bold py-3 rounded-xl hover:from-blue-600 hover:to-teal-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '참가 중...' : '🎉 여행에 참가하기'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
