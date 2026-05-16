'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Trip, Member, MEMBER_COLORS } from '@/lib/types';
import { removeRecentTrip, addRecentTrip, getMySession } from '@/lib/storage';
import { formatDateKorean, getDaysBetween } from '@/lib/dateUtils';
import ThemeToggle from '@/app/components/ThemeToggle';

interface RankingItem { rank: number; name: string; ratio: number }
interface DealItem { title: string; link: string; pubDate: string }
interface RateItem { code: string; name: string; flag: string; unit: number; krw: number }

export default function HomePage() {
  const router = useRouter();

  // Session
  const [mySession, setMySession] = useState<{ name: string; color: string } | null>(null);

  // Trips
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripOrder, setTripOrder] = useState<string[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [membersByTrip, setMembersByTrip] = useState<Record<string, Member[]>>({});
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Edit trip
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [editForm, setEditForm] = useState({ title: '', destination: '', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);

  // Join
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

  // Sidebar
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [rates, setRates] = useState<RateItem[]>([]);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState('');
  const [loadingSidebar, setLoadingSidebar] = useState(true);

  // Onboarding popup
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    const session = getMySession();
    setMySession(session);
    fetchTrips(session);
    fetchSidebar();
    if (!localStorage.getItem('maps_tip_seen')) setShowPopup(true);
  }, []);

  async function fetchTrips(session: { name: string; color: string } | null) {
    if (!session) { setLoadingTrips(false); return; }

    // 내가 멤버인 여행만 가져오기
    const { data: memberships } = await supabase
      .from('members').select('trip_id').eq('name', session.name);

    const myTripIds = (memberships ?? []).map((m: { trip_id: string }) => m.trip_id);
    if (myTripIds.length === 0) { setLoadingTrips(false); return; }

    const [tripsRes, membersRes] = await Promise.all([
      supabase.from('trips').select('*').in('id', myTripIds).order('start_date', { ascending: false }),
      supabase.from('members').select('*').in('trip_id', myTripIds),
    ]);

    if (!tripsRes.error && tripsRes.data) {
      const fetched = tripsRes.data as Trip[];
      const today = new Date().toISOString().split('T')[0];
      const sorted = [...fetched].sort((a, b) => {
        const ongoing = (t: Trip) => t.start_date <= today && today <= t.end_date;
        const upcoming = (t: Trip) => t.start_date > today;
        if (ongoing(a) && !ongoing(b)) return -1;
        if (!ongoing(a) && ongoing(b)) return 1;
        if (upcoming(a) && !upcoming(b)) return -1;
        if (!upcoming(a) && upcoming(b)) return 1;
        return a.start_date < b.start_date ? -1 : 1;
      });
      const savedOrder = (() => { try { return JSON.parse(localStorage.getItem('trip_order') ?? '[]') as string[]; } catch { return []; } })();
      const reordered = savedOrder.length
        ? [...sorted].sort((a, b) => { const ai = savedOrder.indexOf(a.id); const bi = savedOrder.indexOf(b.id); return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi); })
        : sorted;
      setTrips(reordered);
      setTripOrder(reordered.map((t) => t.id));
      fetched.forEach((t) => addRecentTrip(t.id));
    }
    if (!membersRes.error && membersRes.data) {
      const map: Record<string, Member[]> = {};
      (membersRes.data as Member[]).forEach((m) => {
        if (!map[m.trip_id]) map[m.trip_id] = [];
        map[m.trip_id].push(m);
      });
      setMembersByTrip(map);
    }
    setLoadingTrips(false);
  }

  function getDDay(startDate: string, endDate: string): string {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(0, 0, 0, 0);
    if (today >= start && today <= end) return 'D-Day';
    const diff = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  }

  async function fetchSidebar() {
    setLoadingSidebar(true);
    try {
      const [trendsRes, ratesRes] = await Promise.all([
        fetch('/api/naver-trends'),
        fetch('/api/exchange-rates'),
      ]);
      const trendsData = await trendsRes.json();
      const ratesData = await ratesRes.json();
      if (trendsData.rankings) { setRankings(trendsData.rankings); setDeals(trendsData.deals); setIsLive(trendsData.isLive); }
      if (ratesData.rates) { setRates(ratesData.rates); setRatesUpdatedAt(ratesData.updatedAt || ''); }
    } catch { /* silent fail */ }
    setLoadingSidebar(false);
  }

  async function handleDeleteTrip(tripId: string) {
    setDeletingId(tripId);
    const { error } = await supabase.from('trips').delete().eq('id', tripId);
    if (!error) {
      removeRecentTrip(tripId);
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  }

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) { setJoinError('초대 코드를 입력해주세요'); return; }

    const { data: tripData } = await supabase.from('trips').select('id').eq('share_code', code).single();
    if (!tripData) { setJoinError('해당 코드의 여행을 찾을 수 없어요'); return; }

    if (mySession) {
      // 멤버인지 확인 후 없으면 추가
      const { data: existing } = await supabase
        .from('members').select('id').eq('trip_id', tripData.id).eq('name', mySession.name).single();
      if (!existing) {
        const { data: allMembers } = await supabase.from('members').select('color').eq('trip_id', tripData.id);
        const usedColors = (allMembers ?? []).map((m: { color: string }) => m.color);
        const color = mySession.color || MEMBER_COLORS.find((c) => !usedColors.includes(c)) || MEMBER_COLORS[0];
        await supabase.from('members').insert({ trip_id: tripData.id, name: mySession.name, color });
      }
      addRecentTrip(tripData.id);
      router.push(`/trips/${tripData.id}`);
    } else {
      router.push(`/trips/join/${code}`);
    }
  };

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return;
    const next = [...trips];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(toIdx, 0, moved);
    setTrips(next);
    const order = next.map((t) => t.id);
    setTripOrder(order);
    localStorage.setItem('trip_order', JSON.stringify(order));
    setDragIdx(null);
  };

  const handleEditTrip = async () => {
    if (!editingTrip || !editForm.title.trim() || !editForm.destination.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from('trips')
      .update({
        title: editForm.title.trim(),
        destination: editForm.destination.trim(),
        start_date: editForm.start_date,
        end_date: editForm.end_date,
      })
      .eq('id', editingTrip.id)
      .select()
      .single();
    if (data) setTrips((prev) => prev.map((t) => t.id === data.id ? data as Trip : t));
    setSaving(false);
    setEditingTrip(null);
  };

  const RANK_EMOJIS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Onboarding popup */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-10 px-4 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 max-w-sm w-full pointer-events-auto animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🗺️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800 leading-snug">
                  이제부터 맛집, 카페, 숙소, 관광지를 구글맵 주소로 편하게 등록하세요!
                </p>
                <button
                  onClick={() => { localStorage.setItem('maps_tip_seen', '1'); setShowPopup(false); }}
                  className="mt-3 text-xs bg-blue-500 text-white font-semibold px-4 py-2 rounded-xl hover:bg-blue-600 transition-colors"
                >
                  네 알겠습니다
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✈️</span>
            <span className="text-xl font-bold text-gray-900">트립플래너</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {mySession && (
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: mySession.color }}
                >
                  {mySession.name[0]}
                </div>
                <span className="text-sm font-semibold text-gray-700">{mySession.name}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ===== LEFT: Trip List ===== */}
          <div className="flex-1 min-w-0">
            {/* Action Buttons */}
            <div className="space-y-3 mb-6">
              <Link href="/trips/new" className="block">
                <button className="w-full bg-gradient-to-r from-blue-500 to-teal-400 text-white font-bold py-4 rounded-2xl text-lg hover:from-blue-600 hover:to-teal-500 transition-all shadow-md hover:shadow-lg">
                  + 새 여행 만들기
                </button>
              </Link>
              {!showJoinInput ? (
                <button
                  onClick={() => setShowJoinInput(true)}
                  className="w-full border-2 border-gray-200 text-gray-600 font-bold py-4 rounded-2xl text-lg hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                  🔗 초대 코드로 참가하기
                </button>
              ) : (
                <div className="bg-white border-2 border-blue-200 rounded-2xl p-5 shadow-sm">
                  <p className="text-sm font-semibold text-gray-700 mb-3">초대 코드 입력</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                      placeholder="예: ABC12345"
                      maxLength={8}
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-mono text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-300 uppercase"
                      autoFocus
                    />
                    <button onClick={handleJoin} className="bg-blue-500 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-600 transition-colors">
                      참가하기
                    </button>
                  </div>
                  {joinError && <p className="text-red-400 text-sm mt-2">{joinError}</p>}
                  <button onClick={() => { setShowJoinInput(false); setJoinCode(''); setJoinError(''); }} className="text-gray-400 text-sm mt-3 hover:text-gray-600">
                    취소
                  </button>
                </div>
              )}
            </div>

            {/* Trip List */}
            <div>
              <h2 className="text-base font-bold text-gray-700 mb-3">내 여행 계획</h2>
              {loadingTrips ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
                      <div className="flex gap-4">
                        <div className="w-14 h-14 bg-gray-100 rounded-xl" />
                        <div className="flex-1 space-y-2 pt-1">
                          <div className="h-4 bg-gray-100 rounded w-1/2" />
                          <div className="h-3 bg-gray-100 rounded w-1/3" />
                          <div className="h-3 bg-gray-100 rounded w-2/3" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !mySession ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                  <div className="text-5xl mb-4">👤</div>
                  <p className="font-semibold text-gray-400">아직 참가한 여행이 없어요</p>
                  <p className="text-sm text-gray-300 mt-1">새 여행을 만들거나 초대 코드로 참가하세요</p>
                </div>
              ) : trips.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                  <div className="text-5xl mb-4">🗺️</div>
                  <p className="font-semibold text-gray-400">{mySession.name}님의 여행이 없어요</p>
                  <p className="text-sm text-gray-300 mt-1">새 여행을 만들거나 초대 코드로 참가하세요</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trips.map((trip, idx) => {
                    const days = getDaysBetween(trip.start_date, trip.end_date);
                    const today = new Date().toISOString().split('T')[0];
                    const isOngoing = trip.start_date <= today && today <= trip.end_date;
                    const isUpcoming = trip.start_date > today;
                    const isPast = trip.end_date < today;
                    const isConfirmDelete = confirmDeleteId === trip.id;
                    const isDragging = dragIdx === idx;

                    return (
                      <div
                        key={trip.id}
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={() => setDragIdx(null)}
                        className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40 border-blue-300' : 'border-gray-100'}`}
                      >
                        {isConfirmDelete ? (
                          <div className="p-5 bg-red-50 flex items-center justify-between gap-4">
                            <p className="text-sm text-red-700 font-medium">
                              <span className="font-bold">"{trip.title}"</span> 여행을 삭제할까요?<br />
                              <span className="text-xs text-red-400">모든 일정과 데이터가 영구 삭제됩니다.</span>
                            </p>
                            <div className="flex gap-2 flex-shrink-0">
                              <button onClick={() => setConfirmDeleteId(null)} className="text-sm px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
                                취소
                              </button>
                              <button
                                onClick={() => handleDeleteTrip(trip.id)}
                                disabled={deletingId === trip.id}
                                className="text-sm px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 font-semibold disabled:opacity-50"
                              >
                                {deletingId === trip.id ? '삭제중...' : '삭제'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-0">
                            <Link href={`/trips/${trip.id}`} className="flex-1 flex gap-4 items-start p-5 min-w-0">
                              <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-teal-50 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">
                                {trip.cover_emoji}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                  <h3 className="font-bold text-gray-900 truncate">{trip.title}</h3>
                                  {isOngoing && <span className="flex-shrink-0 text-xs bg-green-100 text-green-600 font-semibold px-2 py-0.5 rounded-full">여행중 🟢</span>}
                                  {isUpcoming && <span className="flex-shrink-0 text-xs bg-blue-100 text-blue-600 font-semibold px-2 py-0.5 rounded-full">예정</span>}
                                  {isPast && <span className="flex-shrink-0 text-xs bg-gray-100 text-gray-400 font-semibold px-2 py-0.5 rounded-full">완료</span>}
                                  <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${isOngoing ? 'bg-green-500 text-white' : isPast ? 'bg-gray-200 text-gray-500' : 'bg-orange-100 text-orange-600'}`}>
                                    {getDDay(trip.start_date, trip.end_date)}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-400 mb-1.5">📍 {trip.destination}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap mb-1.5">
                                  <span>{formatDateKorean(trip.start_date)} ~ {formatDateKorean(trip.end_date)}</span>
                                  <span className="text-gray-200">|</span>
                                  <span>{days.length}일</span>
                                </div>
                                {(membersByTrip[trip.id] ?? []).length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {(membersByTrip[trip.id] ?? []).map((m) => (
                                      <span
                                        key={m.id}
                                        className="text-xs text-white font-semibold px-2 py-0.5 rounded-full"
                                        style={{ backgroundColor: m.color }}
                                      >
                                        {m.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </Link>
                            {/* Edit button */}
                            <button
                              onClick={(e) => { e.preventDefault(); setEditingTrip(trip); setEditForm({ title: trip.title, destination: trip.destination, start_date: trip.start_date, end_date: trip.end_date }); }}
                              className="p-3 mt-3 text-gray-300 hover:text-blue-400 hover:bg-blue-50 rounded-xl transition-colors flex-shrink-0"
                              title="여행 수정"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {/* Delete button */}
                            <button
                              onClick={(e) => { e.preventDefault(); setConfirmDeleteId(trip.id); }}
                              className="p-3 m-3 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0"
                              title="여행 삭제"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ===== RIGHT: Sidebar ===== */}
          <div className="lg:w-80 flex-shrink-0 space-y-4">

            {/* 여행지 인기 순위 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔥</span>
                  <h3 className="font-bold text-gray-900 text-sm">인기 여행지 순위</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  {isLive ? (
                    <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      네이버 실시간
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">네이버 기준</span>
                  )}
                </div>
              </div>

              {loadingSidebar ? (
                <div className="space-y-3">
                  {[1,2,3,4,5].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-6 h-4 bg-gray-100 rounded" />
                      <div className="flex-1 h-4 bg-gray-100 rounded" />
                      <div className="w-12 h-3 bg-gray-100 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {rankings.map((item) => (
                    <div key={item.rank} className="flex items-center gap-3">
                      <span className="text-base w-6 flex-shrink-0">{RANK_EMOJIS[item.rank - 1]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-gray-800">{item.name}</span>
                          <span className="text-xs text-gray-400">{item.ratio}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-400 to-teal-400 rounded-full"
                            style={{ width: `${item.ratio}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 특가 알림 */}
              {!loadingSidebar && deals.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <span className="text-sm">✈️</span>
                    <h4 className="text-xs font-bold text-gray-700">특가 알림</h4>
                  </div>
                  <div className="space-y-2">
                    {deals.map((deal, i) => (
                      <a
                        key={i}
                        href={deal.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-600 hover:text-blue-700 hover:underline line-clamp-2 leading-relaxed"
                      >
                        {deal.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-300 mt-3 text-right">네이버 제공</p>
            </div>

            {/* 환율 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💱</span>
                  <h3 className="font-bold text-gray-900 text-sm">오늘의 환율</h3>
                </div>
                <span className="text-xs text-gray-300">KRW 기준</span>
              </div>

              {loadingSidebar ? (
                <div className="space-y-3">
                  {[1,2,3,4,5,6].map((i) => (
                    <div key={i} className="flex items-center justify-between animate-pulse">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-4 bg-gray-100 rounded" />
                        <div className="w-20 h-3 bg-gray-100 rounded" />
                      </div>
                      <div className="w-16 h-4 bg-gray-100 rounded" />
                    </div>
                  ))}
                </div>
              ) : rates.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">환율 정보를 불러올 수 없습니다</p>
              ) : (
                <div className="space-y-2.5">
                  {rates.map((r) => (
                    <div key={r.code} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{r.flag}</span>
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-gray-700">{r.name}</span>
                          {r.unit > 1 && <span className="text-xs text-gray-400 ml-1">({r.unit}{r.code})</span>}
                        </div>
                      </div>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">
                        ₩{r.krw.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {ratesUpdatedAt && (
                <p className="text-xs text-gray-300 mt-3 text-right">
                  {new Date(ratesUpdatedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 기준
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Edit trip modal */}
      {editingTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingTrip(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">여행 정보 수정</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">여행 이름</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">여행 장소</label>
                <input
                  type="text"
                  value={editForm.destination}
                  onChange={(e) => setEditForm((p) => ({ ...p, destination: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">시작일</label>
                  <input
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) => setEditForm((p) => ({ ...p, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">종료일</label>
                  <input
                    type="date"
                    value={editForm.end_date}
                    onChange={(e) => setEditForm((p) => ({ ...p, end_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditingTrip(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleEditTrip}
                disabled={saving}
                className="flex-1 bg-blue-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
