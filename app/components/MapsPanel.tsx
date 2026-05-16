'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  tripId: string;
  destination: string;
  onClose?: () => void;
}

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: { main_text: string; secondary_text: string };
  types: string[];
}

function mapCategory(types: string[]): string {
  if (types.some((t) => ['restaurant', 'food', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery'].includes(t))) return 'food';
  if (types.some((t) => ['lodging', 'hotel'].includes(t))) return 'accommodation';
  if (types.some((t) => ['shopping_mall', 'store', 'department_store', 'clothing_store', 'convenience_store', 'supermarket'].includes(t))) return 'shopping';
  if (types.some((t) => ['transit_station', 'airport', 'train_station', 'subway_station', 'bus_station'].includes(t))) return 'transport';
  return 'sightseeing';
}

export default function MapsPanel({ tripId, destination, onClose }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mapSrc, setMapSrc] = useState(
    `https://maps.google.com/maps?q=${encodeURIComponent(destination)}&output=embed&hl=ko`
  );
  const [quickUrl, setQuickUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<{ name: string; category: string; mapsUrl: string } | null>(null);
  const [addingPlace, setAddingPlace] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setPredictions([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(value)}`);
        const data = await res.json();
        if (data.predictions?.length) {
          setPredictions(data.predictions);
          setShowDropdown(true);
        } else {
          setPredictions([]);
          setShowDropdown(false);
        }
      } catch { /* ignore */ }
    }, 300);
  }

  function selectPlace(p: Prediction) {
    const name = p.structured_formatting?.main_text ?? p.description.split(',')[0];
    const category = mapCategory(p.types);
    const mapsUrl = `https://www.google.com/maps/place/?q=place_id:${p.place_id}`;

    setShowDropdown(false);
    setSearchInput(name);
    setMapSrc(`https://maps.google.com/maps?q=place_id:${p.place_id}&output=embed&hl=ko`);
    setSelectedPlace({ name, category, mapsUrl });
    setAdded(null);
  }

  async function addSelectedPlace() {
    if (!selectedPlace) return;
    setAddingPlace(true);
    await supabase.from('candidate_places').insert({
      trip_id: tripId,
      name: selectedPlace.name,
      category: selectedPlace.category,
      notes: '',
      maps_url: selectedPlace.mapsUrl,
    });
    setAdded(selectedPlace.name);
    setSelectedPlace(null);
    setAddingPlace(false);
    setTimeout(() => setAdded(null), 2500);
  }

  function handleSearch() {
    if (!searchInput.trim()) return;
    setShowDropdown(false);
    setMapSrc(`https://maps.google.com/maps?q=${encodeURIComponent(searchInput)}&output=embed&hl=ko`);
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
        setAdded(data.name);
        setTimeout(() => setAdded(null), 2500);
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
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg leading-none px-1" title="지도 닫기">‹</button>
        )}
      </div>

      {/* Search with autocomplete */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0" ref={wrapperRef}>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); if (e.key === 'Escape') setShowDropdown(false); }}
              onFocus={() => predictions.length > 0 && setShowDropdown(true)}
              placeholder={`🔍 장소 검색 (예: ${destination} 라멘)`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {/* Autocomplete dropdown */}
            {showDropdown && predictions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
                {predictions.map((p) => (
                  <button
                    key={p.place_id}
                    onMouseDown={(e) => { e.preventDefault(); selectPlace(p); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <p className="text-xs font-semibold text-gray-800 truncate">{p.structured_formatting?.main_text}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{p.structured_formatting?.secondary_text}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="text-xs bg-blue-500 text-white font-semibold px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors flex-shrink-0"
          >
            검색
          </button>
        </div>
        {/* Selected place → add to candidates */}
        {selectedPlace && (
          <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{selectedPlace.name}</p>
              <p className="text-xs text-gray-400">지도에서 확인 후 추가하세요</p>
            </div>
            <button
              onClick={addSelectedPlace}
              disabled={addingPlace}
              className="text-xs bg-blue-500 text-white font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
            >
              + 후보지 추가
            </button>
          </div>
        )}
        {added && (
          <p className="text-xs text-green-600 font-semibold mt-1.5 px-0.5">✓ "{added}" 후보지에 추가됐어요</p>
        )}
      </div>

      {/* URL paste → add to candidates */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="relative">
          <input
            type="url"
            value={quickUrl}
            onChange={(e) => setQuickUrl(e.target.value)}
            onPaste={(e) => { const text = e.clipboardData.getData('text'); setTimeout(() => addFromUrl(text), 50); }}
            onKeyDown={(e) => { if (e.key === 'Enter') addFromUrl(quickUrl); }}
            placeholder="📋 구글맵 링크 직접 붙여넣기"
            className="w-full border border-green-200 rounded-lg px-3 py-2 text-xs bg-green-50 placeholder-green-400 focus:outline-none focus:ring-2 focus:ring-green-300"
          />
          {resolving && <span className="absolute right-2 top-2 text-xs text-green-500 animate-pulse">분석 중...</span>}
        </div>
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
