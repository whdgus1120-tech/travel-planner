'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  tripId: string;
  destination: string;
  onClose?: () => void;
}

export default function MapsPanel({ tripId, destination, onClose }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [mapSrc, setMapSrc] = useState(
    `https://maps.google.com/maps?q=${encodeURIComponent(destination)}&output=embed&hl=ko`
  );
  const [quickUrl, setQuickUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleSearch() {
    const q = searchInput.trim();
    if (!q) return;
    setMapSrc(`https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed&hl=ko`);
  }

  async function addFromUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed || (!trimmed.includes('google') && !trimmed.includes('goo.gl') && !trimmed.includes('maps.app'))) return;
    setResolving(true);
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
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      }
    } catch { /* ignore */ }
    setResolving(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🗺️</span>
          <span className="font-bold text-gray-800 text-sm">Google Maps</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-gray-500 text-lg leading-none px-1"
            title="지도 닫기"
          >
            ‹
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder={`🔍 장소 검색 (예: 오사카 라멘)`}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={handleSearch}
            className="text-xs bg-blue-500 text-white font-semibold px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors flex-shrink-0"
          >
            검색
          </button>
        </div>
      </div>

      {/* URL paste → add to candidates */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="relative">
          <input
            type="url"
            value={quickUrl}
            onChange={(e) => setQuickUrl(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              setTimeout(() => addFromUrl(text), 50);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') addFromUrl(quickUrl); }}
            placeholder="📋 장소 링크 붙여넣기 → 후보지에 추가"
            className="w-full border border-green-200 rounded-lg px-3 py-2 text-xs bg-green-50 placeholder-green-400 focus:outline-none focus:ring-2 focus:ring-green-300"
          />
          {resolving && <span className="absolute right-2 top-2 text-xs text-green-500 animate-pulse">분석 중...</span>}
          {success && <span className="absolute right-2 top-2 text-xs text-green-600 font-semibold">✓ 후보지 추가됨</span>}
        </div>
        <p className="text-xs text-gray-300 mt-1 px-0.5">장소 클릭 → 공유 → 링크 복사 → 위에 붙여넣기</p>
      </div>

      {/* Google Maps iframe */}
      <div className="flex-1 overflow-hidden">
        <iframe
          key={mapSrc}
          src={mapSrc}
          className="w-full h-full border-0"
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Google Maps"
        />
      </div>
    </div>
  );
}
