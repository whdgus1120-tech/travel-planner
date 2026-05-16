'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Trip, Member, Activity, ResearchItem, CATEGORY_CONFIG } from '@/lib/types';
import { getDaysBetween, formatDateKorean, getDayNumber, getTripDurationDays, formatDateShort } from '@/lib/dateUtils';
import { getMySession, addRecentTrip } from '@/lib/storage';
import ActivityModal from '@/app/components/ActivityModal';
import ResearchModal from '@/app/components/ResearchModal';
import MapsPanel from '@/app/components/MapsPanel';
import PackingList from '@/app/components/PackingList';
import BudgetTracker from '@/app/components/BudgetTracker';
import CandidatesPanel from '@/app/components/CandidatesPanel';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type Tab = 'schedule' | 'research' | 'packing' | 'budget';

interface FlightInfo {
  id: string;
  type: 'departure' | 'return';
  airport_from: string;
  airport_to: string;
  flight_number: string;
  departure_time: string;
  arrival_time: string;
}

interface AccInfo {
  id: string;
  date: string;
  name: string;
  address: string;
}

const PRIORITY_CONFIG = {
  high: { label: '높음', color: 'bg-red-100 text-red-700' },
  medium: { label: '보통', color: 'bg-yellow-100 text-yellow-700' },
  low: { label: '낮음', color: 'bg-gray-100 text-gray-600' },
} as const;

const STATUS_CONFIG = {
  pending: { label: '미완료', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '조사중', color: 'bg-blue-100 text-blue-700' },
  done: { label: '완료', color: 'bg-green-100 text-green-700' },
} as const;

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  });
}

export default function TripDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [researchFilter, setResearchFilter] = useState<'all' | 'in_progress' | 'done'>('all');

  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [modalDate, setModalDate] = useState('');

  const [showResearchModal, setShowResearchModal] = useState(false);
  const [addingResearchCat, setAddingResearchCat] = useState<string | null>(null);
  const [researchForm, setResearchForm] = useState({ title: '', description: '', url: '' });
  const [codeCopied, setCodeCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [mobileChatOpen, setMobileChatOpen] = useState(true);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [candidatesWidth, setCandidatesWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(420);

  // Flights & Accommodations
  const [flights, setFlights] = useState<{ departure: FlightInfo | null; return: FlightInfo | null }>({ departure: null, return: null });
  const [accommodations, setAccommodations] = useState<Record<string, AccInfo>>({});
  const [editingFlight, setEditingFlight] = useState<'departure' | 'return' | null>(null);
  const [editingAccDate, setEditingAccDate] = useState<string | null>(null);
  const [flightForm, setFlightForm] = useState({ airport_from: '', airport_to: '', flight_number: '', departure_time: '', arrival_time: '' });
  const [accForm, setAccForm] = useState({ name: '', address: '' });

  const [mySession, setMySession] = useState<{ name: string; color: string } | null>(null);
  const [weather, setWeather] = useState<Record<string, { max: number; min: number; code: number }>>({});

  // Load session
  useEffect(() => {
    setMySession(getMySession());
  }, []);

  // Initial data fetch
  const fetchAll = useCallback(async () => {
    const { data: tripData, error: tripErr } = await supabase
      .from('trips')
      .select('*')
      .eq('id', id)
      .single();

    if (tripErr || !tripData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setTrip(tripData as Trip);
    addRecentTrip(id);

    const [membersRes, activitiesRes, researchRes, flightsRes, accRes] = await Promise.all([
      supabase.from('members').select('*').eq('trip_id', id).order('created_at', { ascending: true }),
      supabase.from('activities').select('*').eq('trip_id', id).order('time', { ascending: true }),
      supabase.from('research_items').select('*').eq('trip_id', id).order('created_at', { ascending: false }),
      supabase.from('trip_flights').select('*').eq('trip_id', id),
      supabase.from('trip_accommodations').select('*').eq('trip_id', id),
    ]);

    setMembers((membersRes.data as Member[]) ?? []);
    setActivities((activitiesRes.data as Activity[]) ?? []);
    setResearchItems((researchRes.data as ResearchItem[]) ?? []);

    const dep = (flightsRes.data ?? []).find((f) => f.type === 'departure') as FlightInfo | undefined;
    const ret = (flightsRes.data ?? []).find((f) => f.type === 'return') as FlightInfo | undefined;
    setFlights({ departure: dep ?? null, return: ret ?? null });

    const accMap: Record<string, AccInfo> = {};
    (accRes.data ?? []).forEach((a: AccInfo) => { accMap[a.date] = a; });
    setAccommodations(accMap);

    // Set default selected day to today or first day
    const today = new Date().toISOString().split('T')[0];
    const days = getDaysBetween(tripData.start_date, tripData.end_date);
    setSelectedDay(days.includes(today) ? today : days[0] ?? '');

    setLoading(false);

    // Fetch weather from Open-Meteo (free, no API key)
    fetchWeather(tripData.destination, tripData.start_date, tripData.end_date);
  }, [id]);

  async function fetchWeather(destination: string, startDate: string, endDate: string) {
    try {
      // 1. Geocode the destination
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=ko&format=json`
      );
      const geoData = await geoRes.json();
      const loc = geoData.results?.[0];
      if (!loc) return;

      // 2. Fetch daily forecast (supports past_days up to 92 + 16 days ahead)
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
        `&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&past_days=92&forecast_days=16`
      );
      const weatherData = await weatherRes.json();
      const { time, temperature_2m_max, temperature_2m_min, weathercode } = weatherData.daily ?? {};
      if (!time) return;

      const map: Record<string, { max: number; min: number; code: number }> = {};
      (time as string[]).forEach((d: string, i: number) => {
        map[d] = {
          max: Math.round(temperature_2m_max[i]),
          min: Math.round(temperature_2m_min[i]),
          code: weathercode[i],
        };
      });
      setWeather(map);
    } catch { /* weather is optional */ }
  }

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime subscriptions
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`trip-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activities', filter: `trip_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Activity>) => {
          if (payload.eventType === 'INSERT') {
            setActivities((prev) => [...prev, payload.new as Activity].sort((a, b) => a.time.localeCompare(b.time)));
          } else if (payload.eventType === 'UPDATE') {
            setActivities((prev) =>
              prev.map((a) => (a.id === (payload.new as Activity).id ? (payload.new as Activity) : a))
                .sort((a, b) => a.time.localeCompare(b.time))
            );
          } else if (payload.eventType === 'DELETE') {
            setActivities((prev) => prev.filter((a) => a.id !== (payload.old as Activity).id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `trip_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<Member>) => {
          if (payload.eventType === 'INSERT') {
            setMembers((prev) => [...prev, payload.new as Member]);
          } else if (payload.eventType === 'DELETE') {
            setMembers((prev) => prev.filter((m) => m.id !== (payload.old as Member).id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'research_items', filter: `trip_id=eq.${id}` },
        (payload: RealtimePostgresChangesPayload<ResearchItem>) => {
          if (payload.eventType === 'INSERT') {
            setResearchItems((prev) => [payload.new as ResearchItem, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setResearchItems((prev) =>
              prev.map((r) => (r.id === (payload.new as ResearchItem).id ? (payload.new as ResearchItem) : r))
            );
          } else if (payload.eventType === 'DELETE') {
            setResearchItems((prev) => prev.filter((r) => r.id !== (payload.old as ResearchItem).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleDeleteActivity = async (activityId: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== activityId));
    await supabase.from('activities').delete().eq('id', activityId);
  };

  const handleUpdateResearchStatus = async (
    itemId: string,
    status: ResearchItem['status']
  ) => {
    await supabase.from('research_items').update({ status }).eq('id', itemId);
  };

  const handleDeleteResearch = async (itemId: string) => {
    setResearchItems((prev) => prev.filter((r) => r.id !== itemId));
    await supabase.from('research_items').delete().eq('id', itemId);
  };

  const handleCopyCode = () => {
    if (!trip) return;
    copyToClipboard(trip.share_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const saveFlight = async (type: 'departure' | 'return') => {
    const existing = flights[type];
    const payload = { trip_id: id, type, ...flightForm };
    if (existing?.id) {
      const { data } = await supabase.from('trip_flights').update(flightForm).eq('id', existing.id).select().single();
      if (data) setFlights((p) => ({ ...p, [type]: data as FlightInfo }));
    } else {
      const { data } = await supabase.from('trip_flights').insert(payload).select().single();
      if (data) setFlights((p) => ({ ...p, [type]: data as FlightInfo }));
    }
    setEditingFlight(null);
  };

  const startResize = (panel: 'candidates' | 'chat', e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panel === 'candidates' ? candidatesWidth : chatWidth;
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.max(160, Math.min(520, startWidth - (ev.clientX - startX)));
      if (panel === 'candidates') setCandidatesWidth(newWidth);
      else setChatWidth(newWidth);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };


  const addToCandidate = async (name: string, category: string, notes: string) => {
    const catMap: Record<string, string> = { sightseeing: 'sightseeing', restaurant: 'food', shopping: 'shopping', memo: 'other', food: 'food', transport: 'transport', accommodation: 'accommodation', other: 'other' };
    await supabase.from('candidate_places').insert({ trip_id: id, name, category: catMap[category] ?? 'other', notes });
  };

  const handleMoveToCandidate = async (activity: Activity) => {
    await addToCandidate(activity.title, activity.category, activity.notes ?? '');
    setActivities((prev) => prev.filter((a) => a.id !== activity.id));
    await supabase.from('activities').delete().eq('id', activity.id);
  };

  const handleReceiveActivity = async (a: { id: string; name: string; category: string; notes: string }) => {
    await addToCandidate(a.name, a.category, a.notes);
    setActivities((prev) => prev.filter((act) => act.id !== a.id));
    await supabase.from('activities').delete().eq('id', a.id);
  };

  const handleAddToSchedule = async (candidate: { id: string; name: string; category: string; notes: string }, date: string, time: string) => {
    await supabase.from('activities').insert({
      trip_id: id,
      date,
      time: time || '09:00',
      title: candidate.name,
      category: candidate.category,
      notes: candidate.notes,
      location: '',
      assigned_to: [],
    });
    if (candidate.id) {
      await supabase.from('candidate_places').delete().eq('id', candidate.id);
    }
  };

  const saveAccommodation = async (date: string) => {
    const existing = accommodations[date];
    if (existing?.id) {
      const { data } = await supabase.from('trip_accommodations').update(accForm).eq('id', existing.id).select().single();
      if (data) setAccommodations((p) => ({ ...p, [date]: data as AccInfo }));
    } else {
      const { data } = await supabase.from('trip_accommodations').insert({ trip_id: id, date, ...accForm }).select().single();
      if (data) setAccommodations((p) => ({ ...p, [date]: data as AccInfo }));
    }
    setEditingAccDate(null);
  };

  function getWeatherEmoji(code: number): string {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 55) return '🌦️';
    if (code <= 65) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    if (code <= 99) return '⛈️';
    return '🌡️';
  }

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

  if (notFound || !trip) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">여행을 찾을 수 없습니다</h2>
          <p className="text-gray-500 mb-6">삭제되었거나 존재하지 않는 여행입니다.</p>
          <Link href="/">
            <button className="bg-blue-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-600 transition-colors">
              홈으로 돌아가기
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const days = getDaysBetween(trip.start_date, trip.end_date);
  const duration = getTripDurationDays(trip.start_date, trip.end_date);

  const filteredResearch =
    researchFilter === 'all'
      ? researchItems
      : researchItems.filter((r) => r.status === researchFilter);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Fixed top header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {/* Top row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <span className="text-xl">{trip.cover_emoji}</span>
              <div className="min-w-0">
                <h1 className="font-bold text-gray-900 truncate">{trip.title}</h1>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <span>📍</span>{trip.destination}
                  <span className="mx-1">·</span>
                  {formatDateShort(trip.start_date)} ~ {formatDateShort(trip.end_date)}
                  <span className="mx-1">·</span>
                  {duration}일
                </p>
              </div>
            </div>

            {/* Share code + members */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Members */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 font-semibold whitespace-nowrap">여행파트너:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {members.map((m) => (
                    <span
                      key={m.id}
                      className="text-xs text-white font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Share code */}
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl px-3 py-1.5 transition-colors"
              >
                <span className="text-xs text-gray-500">초대코드</span>
                <span className="font-mono font-bold text-blue-600 text-sm tracking-wider">{trip.share_code}</span>
                <span className="text-xs text-blue-400">{codeCopied ? '✓ 복사됨' : '복사'}</span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            <button
              onClick={() => setActiveTab('schedule')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'schedule'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              📅 일정
            </button>
            <button
              onClick={() => setActiveTab('research')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'research'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              🔍 조사 필요 항목
              {researchItems.filter((r) => r.status !== 'done').length > 0 && (
                <span className="ml-1.5 bg-red-400 text-white text-xs rounded-full px-1.5 py-0.5">
                  {researchItems.filter((r) => r.status !== 'done').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('packing')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'packing'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              🎒 준비물
            </button>
            <button
              onClick={() => setActiveTab('budget')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'budget'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              💰 예산안
            </button>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-6">

            {/* ===== SCHEDULE TAB ===== */}
            {activeTab === 'schedule' && (
              <div className="space-y-4">
                {days.map((date) => {
                  const dayActivities = activities
                    .filter((a) => a.date === date)
                    .sort((a, b) => a.time.localeCompare(b.time));
                  const isOpen = selectedDay === date;
                  const dayNum = getDayNumber(trip.start_date, date);
                  const isFirstDay = date === days[0];
                  const isLastDay = date === days[days.length - 1];
                  const acc = accommodations[date];

                  return (
                    <div
                      key={date}
                      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                        dragOverDate === date ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-100'
                      }`}
                      onDragEnter={(e) => { e.preventDefault(); setDragOverDate(date); }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverDate(null);
                        try {
                          const raw = e.dataTransfer.getData('text/plain');
                          const data = JSON.parse(raw);
                          if (data.type === 'candidate') handleAddToSchedule(data, date, '09:00');
                        } catch { /* ignore */ }
                      }}
                    >

                      {/* ✈️ 출국 배너 (첫날 상단) */}
                      {isFirstDay && (
                        <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3">
                          {editingFlight === 'departure' ? (
                            <div className="space-y-2">
                              <p className="text-white text-xs font-bold mb-1">✈️ 출국 항공편 정보</p>
                              <div className="grid grid-cols-2 gap-2">
                                <input value={flightForm.airport_from} onChange={(e) => setFlightForm((p) => ({ ...p, airport_from: e.target.value }))} placeholder="출발 공항 (예: 인천)" className="rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                                <input value={flightForm.airport_to} onChange={(e) => setFlightForm((p) => ({ ...p, airport_to: e.target.value }))} placeholder="도착 공항 (예: 나리타)" className="rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                                <input value={flightForm.flight_number} onChange={(e) => setFlightForm((p) => ({ ...p, flight_number: e.target.value }))} placeholder="편명 (예: KE701)" className="rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                                <div className="flex gap-1">
                                  <input type="time" value={flightForm.departure_time} onChange={(e) => setFlightForm((p) => ({ ...p, departure_time: e.target.value }))} className="flex-1 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                                  <span className="text-white self-center">→</span>
                                  <input type="time" value={flightForm.arrival_time} onChange={(e) => setFlightForm((p) => ({ ...p, arrival_time: e.target.value }))} className="flex-1 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditingFlight(null)} className="text-xs text-sky-200 hover:text-white px-3 py-1.5">취소</button>
                                <button onClick={() => saveFlight('departure')} className="text-xs bg-white text-sky-600 font-bold px-4 py-1.5 rounded-lg hover:bg-sky-50">저장</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 text-white">
                              <span className="text-lg">✈️</span>
                              <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">출국</span>
                              {flights.departure ? (
                                <>
                                  <span className="text-sm font-semibold">{flights.departure.airport_from}</span>
                                  <span className="text-sky-200">→</span>
                                  <span className="text-sm font-semibold">{flights.departure.airport_to}</span>
                                  {flights.departure.flight_number && <span className="text-xs text-sky-200 bg-white/10 px-2 py-0.5 rounded">{flights.departure.flight_number}</span>}
                                  {flights.departure.departure_time && <span className="text-sm font-mono">{flights.departure.departure_time} → {flights.departure.arrival_time}</span>}
                                </>
                              ) : (
                                <span className="text-sky-200 text-sm">출국 항공편을 입력하세요</span>
                              )}
                              <button onClick={() => { setEditingFlight('departure'); setFlightForm(flights.departure ? { airport_from: flights.departure.airport_from, airport_to: flights.departure.airport_to, flight_number: flights.departure.flight_number, departure_time: flights.departure.departure_time, arrival_time: flights.departure.arrival_time } : { airport_from: '', airport_to: '', flight_number: '', departure_time: '', arrival_time: '' }); }} className="ml-auto text-xs text-sky-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg transition-colors">
                                ✏️ 수정
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Day header */}
                      <div
                        onClick={() => setSelectedDay(isOpen ? '' : date)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                            Day {dayNum}
                          </span>
                          <span className="font-semibold text-gray-800">{formatDateKorean(date)}</span>
                          {(() => {
                            const w = weather[date];
                            if (w) {
                              return (
                                <span className="flex items-center gap-1 text-xs text-gray-500 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
                                  <span>{getWeatherEmoji(w.code)}</span>
                                  <span className="font-semibold text-orange-500">{w.max}°</span>
                                  <span className="text-gray-400">/</span>
                                  <span className="text-blue-400">{w.min}°</span>
                                </span>
                              );
                            }
                            const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
                            if (daysLeft > 0) {
                              return (
                                <span className="text-xs text-gray-300 italic">
                                  날씨는 여행 2주전 공개됩니다
                                </span>
                              );
                            }
                            return null;
                          })()}
                          {dayActivities.length > 0 && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              {dayActivities.length}개
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalDate(date);
                              setEditingActivity(null);
                              setShowActivityModal(true);
                            }}
                            className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                          >
                            + 추가
                          </button>
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* Activities list */}
                      {isOpen && (
                        <div className="border-t border-gray-100">
                          {dayActivities.length === 0 ? (
                            <div className="px-5 py-8 text-center text-gray-300">
                              <div className="text-3xl mb-2">📋</div>
                              <p className="text-sm">아직 계획이 없어요. 활동을 추가해보세요!</p>
                            </div>
                          ) : (
                            <div className="relative">
                              {/* Timeline line */}
                              <div className="absolute left-[3.25rem] top-0 bottom-0 w-px bg-gray-100" />
                              <div className="space-y-0">
                                {dayActivities.map((activity) => {
                                  const cat = CATEGORY_CONFIG[activity.category];
                                  const assignedMembers = members.filter((m) =>
                                    activity.assigned_to.includes(m.name)
                                  );
                                  return (
                                    <div
                                      key={activity.id}
                                      className="flex gap-4 px-5 py-3 hover:bg-gray-50 group cursor-grab active:cursor-grabbing"
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', JSON.stringify({
                                          type: 'activity',
                                          id: activity.id,
                                          name: activity.title,
                                          category: activity.category,
                                          notes: activity.notes ?? '',
                                        }));
                                        e.dataTransfer.effectAllowed = 'move';
                                      }}
                                    >
                                      {/* Time */}
                                      <div className="w-12 text-right flex-shrink-0">
                                        <span className="text-xs text-gray-400 font-mono">
                                          {activity.time || '--:--'}
                                        </span>
                                      </div>
                                      {/* Dot */}
                                      <div className="relative flex-shrink-0 flex items-start pt-0.5">
                                        <div className="w-3 h-3 rounded-full bg-blue-400 ring-2 ring-white z-10" />
                                      </div>
                                      {/* Content */}
                                      <div className="flex-1 min-w-0 pb-1">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.color}`}>
                                                {cat.icon} {cat.label}
                                              </span>
                                              <span className="font-semibold text-gray-900 text-sm">{activity.title}</span>
                                            </div>
                                            {activity.location && (
                                              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                <span>📍</span>{activity.location}
                                              </p>
                                            )}
                                            {activity.maps_url && (
                                              <a
                                                href={activity.maps_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1 mt-0.5 hover:underline"
                                              >
                                                🗺️ 지도 보기
                                              </a>
                                            )}
                                            {activity.notes && (
                                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{activity.notes}</p>
                                            )}
                                            {assignedMembers.length > 0 && (
                                              <div className="flex gap-1 mt-1">
                                                {assignedMembers.map((m) => (
                                                  <span
                                                    key={m.id}
                                                    className="text-xs text-white px-2 py-0.5 rounded-full"
                                                    style={{ backgroundColor: m.color }}
                                                  >
                                                    {m.name}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                          {/* Actions */}
                                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                            <button
                                              onClick={() => handleMoveToCandidate(activity)}
                                              className="p-1.5 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-lg transition-colors"
                                              title="후보지로 이동"
                                            >
                                              <span className="text-xs">📋</span>
                                            </button>
                                            <button
                                              onClick={() => {
                                                setEditingActivity(activity);
                                                setModalDate(date);
                                                setShowActivityModal(true);
                                              }}
                                              className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                              title="수정"
                                            >
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() => handleDeleteActivity(activity.id)}
                                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                              title="삭제"
                                            >
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 🏨 숙소 정보 (마지막날 제외) */}
                      {!isLastDay && <div className="border-t border-gray-100 px-5 py-3">
                        {editingAccDate === date ? (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-600 mb-1">🏨 숙소 정보</p>
                            <input
                              value={accForm.name}
                              onChange={(e) => setAccForm((p) => ({ ...p, name: e.target.value }))}
                              placeholder="숙소 이름 (예: 도쿄 신주쿠 호텔)"
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                            <input
                              value={accForm.address}
                              onChange={(e) => setAccForm((p) => ({ ...p, address: e.target.value }))}
                              placeholder="주소 (예: 160-0022 東京都新宿区...)"
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingAccDate(null)} className="text-xs text-gray-400 px-3 py-1.5 hover:text-gray-600">취소</button>
                              <button onClick={() => saveAccommodation(date)} className="text-xs bg-blue-500 text-white font-bold px-4 py-1.5 rounded-lg hover:bg-blue-600">저장</button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-2 cursor-pointer group"
                            onClick={() => { setEditingAccDate(date); setAccForm({ name: acc?.name ?? '', address: acc?.address ?? '' }); }}
                          >
                            <span className="text-base">🏨</span>
                            {acc?.name ? (
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-700">{acc.name}</p>
                                {acc.address && <p className="text-xs text-gray-400 truncate">📍 {acc.address}</p>}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-300 group-hover:text-gray-400 transition-colors">숙소 정보를 입력하세요</span>
                            )}
                            <span className="ml-auto text-xs text-gray-300 group-hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-all">✏️</span>
                          </div>
                        )}
                      </div>}

                      {/* ✈️ 귀국 배너 (마지막날 하단) */}
                      {isLastDay && (
                        <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-3">
                          {editingFlight === 'return' ? (
                            <div className="space-y-2">
                              <p className="text-white text-xs font-bold mb-1">✈️ 귀국 항공편 정보</p>
                              <div className="grid grid-cols-2 gap-2">
                                <input value={flightForm.airport_from} onChange={(e) => setFlightForm((p) => ({ ...p, airport_from: e.target.value }))} placeholder="출발 공항 (예: 나리타)" className="rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                                <input value={flightForm.airport_to} onChange={(e) => setFlightForm((p) => ({ ...p, airport_to: e.target.value }))} placeholder="도착 공항 (예: 인천)" className="rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                                <input value={flightForm.flight_number} onChange={(e) => setFlightForm((p) => ({ ...p, flight_number: e.target.value }))} placeholder="편명 (예: KE702)" className="rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                                <div className="flex gap-1">
                                  <input type="time" value={flightForm.departure_time} onChange={(e) => setFlightForm((p) => ({ ...p, departure_time: e.target.value }))} className="flex-1 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                                  <span className="text-white self-center">→</span>
                                  <input type="time" value={flightForm.arrival_time} onChange={(e) => setFlightForm((p) => ({ ...p, arrival_time: e.target.value }))} className="flex-1 rounded-lg px-2 py-1.5 text-sm focus:outline-none" />
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditingFlight(null)} className="text-xs text-violet-200 hover:text-white px-3 py-1.5">취소</button>
                                <button onClick={() => saveFlight('return')} className="text-xs bg-white text-violet-600 font-bold px-4 py-1.5 rounded-lg hover:bg-violet-50">저장</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 text-white">
                              <span className="text-lg" style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>✈️</span>
                              <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">귀국</span>
                              {flights.return ? (
                                <>
                                  <span className="text-sm font-semibold">{flights.return.airport_from}</span>
                                  <span className="text-violet-200">→</span>
                                  <span className="text-sm font-semibold">{flights.return.airport_to}</span>
                                  {flights.return.flight_number && <span className="text-xs text-violet-200 bg-white/10 px-2 py-0.5 rounded">{flights.return.flight_number}</span>}
                                  {flights.return.departure_time && <span className="text-sm font-mono">{flights.return.departure_time} → {flights.return.arrival_time}</span>}
                                </>
                              ) : (
                                <span className="text-violet-200 text-sm">귀국 항공편을 입력하세요</span>
                              )}
                              <button onClick={() => { setEditingFlight('return'); setFlightForm(flights.return ? { airport_from: flights.return.airport_from, airport_to: flights.return.airport_to, flight_number: flights.return.flight_number, departure_time: flights.return.departure_time, arrival_time: flights.return.arrival_time } : { airport_from: '', airport_to: '', flight_number: '', departure_time: '', arrival_time: '' }); }} className="ml-auto text-xs text-violet-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg transition-colors">
                                ✏️ 수정
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}

            {/* ===== RESEARCH TAB ===== */}
            {activeTab === 'research' && (() => {
              const PLACE_CATS = [
                { key: 'sightseeing', label: '관광지', icon: '🏛️', color: 'bg-blue-50 border-blue-100', btnColor: 'bg-blue-500 hover:bg-blue-600', badgeColor: 'bg-blue-100 text-blue-700' },
                { key: 'restaurant', label: '맛집 및 카페', icon: '🍜', color: 'bg-orange-50 border-orange-100', btnColor: 'bg-orange-500 hover:bg-orange-600', badgeColor: 'bg-orange-100 text-orange-700' },
                { key: 'shopping', label: '쇼핑', icon: '🛍️', color: 'bg-pink-50 border-pink-100', btnColor: 'bg-pink-500 hover:bg-pink-600', badgeColor: 'bg-pink-100 text-pink-700' },
                { key: 'memo', label: '기타 메모', icon: '📝', color: 'bg-gray-50 border-gray-200', btnColor: 'bg-gray-500 hover:bg-gray-600', badgeColor: 'bg-gray-100 text-gray-600' },
              ];

              async function addResearchItem(placeCat: string) {
                if (!researchForm.title.trim()) return;
                const { data } = await supabase.from('research_items').insert({
                  trip_id: id,
                  title: researchForm.title.trim(),
                  description: researchForm.description.trim(),
                  url: researchForm.url.trim(),
                  place_category: placeCat,
                  status: 'pending',
                  priority: 'medium',
                  assigned_to: '',
                }).select().single();
                if (data) { /* inserted */ }
                setResearchForm({ title: '', description: '', url: '' });
                setAddingResearchCat(null);
              }

              return (
                <div className="space-y-4">
                  {PLACE_CATS.map((cat) => {
                    const catItems = researchItems.filter((r) => (r.place_category ?? 'sightseeing') === cat.key);
                    const isAdding = addingResearchCat === cat.key;
                    return (
                      <div key={cat.key} className={`rounded-2xl border shadow-sm overflow-hidden ${cat.color}`}>
                        {/* Category Header */}
                        <div className="flex items-center justify-between px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{cat.icon}</span>
                            <span className="font-bold text-gray-800">{cat.label}</span>
                            {catItems.length > 0 && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cat.badgeColor}`}>
                                {catItems.length}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setAddingResearchCat(isAdding ? null : cat.key);
                              setResearchForm({ title: '', description: '', url: '' });
                            }}
                            className={`text-xs text-white font-semibold px-3 py-1.5 rounded-xl transition-colors ${cat.btnColor}`}
                          >
                            {isAdding ? '취소' : '+ 추가'}
                          </button>
                        </div>

                        {/* Inline Add Form */}
                        {isAdding && (
                          <div className="px-5 pb-4">
                            <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
                              <input
                                type="text"
                                value={researchForm.title}
                                onChange={(e) => setResearchForm((p) => ({ ...p, title: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && addResearchItem(cat.key)}
                                placeholder={`${cat.label} 이름 (필수)`}
                                autoFocus
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              />
                              <input
                                type="text"
                                value={researchForm.description}
                                onChange={(e) => setResearchForm((p) => ({ ...p, description: e.target.value }))}
                                placeholder="메모 (선택)"
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              />
                              <input
                                type="url"
                                value={researchForm.url}
                                onChange={(e) => setResearchForm((p) => ({ ...p, url: e.target.value }))}
                                placeholder="참고 링크 (선택)"
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setAddingResearchCat(null)} className="text-sm text-gray-400 px-3 py-2 rounded-xl hover:text-gray-600">취소</button>
                                <button
                                  onClick={() => addResearchItem(cat.key)}
                                  disabled={!researchForm.title.trim()}
                                  className={`text-sm text-white font-semibold px-5 py-2 rounded-xl disabled:opacity-40 ${cat.btnColor}`}
                                >
                                  추가
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Items */}
                        {catItems.length === 0 && !isAdding ? (
                          <div className="px-5 pb-5 text-center text-gray-300 text-sm">
                            <p>아직 없어요. + 추가로 등록하세요</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-white/60 px-2 pb-2">
                            {catItems.map((item) => (
                              <div key={item.id} className="flex items-start gap-3 bg-white rounded-xl px-4 py-3 mb-1.5 group shadow-sm">
                                {/* Done toggle */}
                                <button
                                  onClick={() => handleUpdateResearchStatus(item.id, item.status === 'done' ? 'pending' : 'done')}
                                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                                    item.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                                  }`}
                                >
                                  {item.status === 'done' && (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold ${item.status === 'done' ? 'line-through text-gray-300' : 'text-gray-800'}`}>
                                    {item.title}
                                  </p>
                                  {item.description && (
                                    <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                                  )}
                                  {item.url && (
                                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                                      className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-0.5">
                                      🔗 링크 보기
                                    </a>
                                  )}
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 flex gap-1 flex-shrink-0 transition-all">
                                  <button
                                    onClick={() => addToCandidate(item.title, item.place_category ?? 'sightseeing', item.description ?? '')}
                                    className="p-1 text-gray-300 hover:text-purple-500 hover:bg-purple-50 rounded-lg transition-colors"
                                    title="후보지에 추가"
                                  >
                                    <span className="text-xs">📋</span>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteResearch(item.id)}
                                    className="p-1 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ===== PACKING TAB ===== */}
            {activeTab === 'packing' && (
              <PackingList tripId={id} />
            )}

            {/* ===== BUDGET TAB ===== */}
            {activeTab === 'budget' && (
              <BudgetTracker tripId={id} members={members} />
            )}

          </div>
        </div>

        {/* ── Resize handle 1 (between schedule and candidates) ── */}
        {activeTab === 'schedule' && (
          <div
            className="hidden lg:flex w-1 flex-shrink-0 bg-gray-200 hover:bg-blue-400 active:bg-blue-500 cursor-col-resize transition-colors select-none"
            onMouseDown={(e) => startResize('candidates', e)}
            title="드래그해서 너비 조절"
          />
        )}

        {/* Candidates panel */}
        {activeTab === 'schedule' && (
          <div
            className="hidden lg:flex flex-shrink-0 flex-col border-l border-gray-100 h-[calc(100vh-theme(spacing.20))] sticky top-20"
            style={{ width: candidatesWidth }}
          >
            <CandidatesPanel
              tripId={id}
              days={days}
              startDate={trip.start_date}
              onAddToSchedule={handleAddToSchedule}
              onReceiveActivity={handleReceiveActivity}
            />
          </div>
        )}

        {/* ── Resize handle 2 (between candidates and maps) ── */}
        {chatOpen && (
          <div
            className="hidden lg:flex w-1 flex-shrink-0 bg-gray-200 hover:bg-blue-400 active:bg-blue-500 cursor-col-resize transition-colors select-none"
            onMouseDown={(e) => startResize('chat', e)}
            title="드래그해서 너비 조절"
          />
        )}

        {/* Right maps panel */}
        {chatOpen ? (
          <div
            className="hidden lg:flex flex-shrink-0 flex-col border-l border-gray-100 h-[calc(100vh-theme(spacing.20))] sticky top-20"
            style={{ width: chatWidth }}
          >
            <MapsPanel
              tripId={id}
              destination={trip.destination}
              onClose={() => setChatOpen(false)}
            />
          </div>
        ) : (
          <div
            className="hidden lg:flex flex-col items-center justify-start pt-4 gap-2 border-l border-gray-100 bg-white h-[calc(100vh-theme(spacing.20))] sticky top-20 cursor-pointer hover:bg-gray-50 transition-colors flex-shrink-0"
            style={{ width: '2.75rem' }}
            onClick={() => setChatOpen(true)}
            title="지도 열기"
          >
            <span className="text-lg">🗺️</span>
            <span className="text-gray-400 text-xs font-medium" style={{ writingMode: 'vertical-rl' }}>지도</span>
          </div>
        )}
      </div>

      {/* Modals */}
      {showActivityModal && (
        <ActivityModal
          tripId={id}
          date={modalDate}
          members={members}
          activity={editingActivity}
          onClose={() => { setShowActivityModal(false); setEditingActivity(null); }}
          onSave={() => { /* realtime handles state update */ }}
        />
      )}

      {showResearchModal && (
        <ResearchModal
          tripId={id}
          members={members}
          onClose={() => setShowResearchModal(false)}
          onSave={() => { /* realtime handles state update */ }}
        />
      )}
    </div>
  );
}
