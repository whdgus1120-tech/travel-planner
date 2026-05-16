'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  tripId: string;
  destination: string;
  onClose?: () => void;
  onSelectAccommodation?: (name: string, address: string) => void;
  externalFocus?: { name: string; placeId?: string } | null;
}

interface PlaceCard {
  name: string;
  rating?: number;
  address?: string;
  types: string[];
  placeId: string;
  mapsUrl: string;
}

function mapCategory(types: string[]): string {
  if (types.some((t) => ['restaurant', 'food', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery'].includes(t))) return 'food';
  if (types.some((t) => ['lodging', 'hotel'].includes(t))) return 'accommodation';
  if (types.some((t) => ['shopping_mall', 'store', 'department_store', 'clothing_store', 'convenience_store', 'supermarket'].includes(t))) return 'shopping';
  if (types.some((t) => ['transit_station', 'airport', 'train_station', 'subway_station', 'bus_station'].includes(t))) return 'transport';
  return 'sightseeing';
}

const CAT_COLOR: Record<string, string> = {
  food: '#EF4444',
  accommodation: '#8B5CF6',
  shopping: '#F59E0B',
  transport: '#6B7280',
  sightseeing: '#3B82F6',
};

declare global {
  interface Window {
    __gmCb?: () => void;
    google: typeof google;
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    // Already loaded
    if (window.google?.maps?.places) { resolve(); return; }

    // Already loading — attach to existing callback
    if (document.querySelector('script[data-gm-loader]')) {
      const prev = window.__gmCb;
      window.__gmCb = () => { prev?.(); resolve(); };
      return;
    }

    window.__gmCb = () => resolve();
    const s = document.createElement('script');
    s.dataset.gmLoader = '1';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=ko&callback=__gmCb`;
    s.async = true;
    document.head.appendChild(s);
  });
}

export default function MapsPanel({ tripId, destination, onClose, onSelectAccommodation, externalFocus }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const serviceRef = useRef<google.maps.places.PlacesService | null>(null);
  const acServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [searchInput, setSearchInput] = useState('');
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [card, setCard] = useState<PlaceCard | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openCard = useCallback((place: google.maps.places.PlaceResult, placeId: string) => {
    setCard({
      name: place.name ?? '',
      rating: place.rating,
      address: place.formatted_address ?? (place as google.maps.places.PlaceResult & { vicinity?: string }).vicinity,
      types: place.types ?? [],
      placeId,
      mapsUrl: place.url ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    });
  }, []);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !mapDivRef.current) return;

    let cancelled = false;

    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapDivRef.current) return;

      const map = new google.maps.Map(mapDivRef.current, {
        zoom: 14,
        center: { lat: 34.6937, lng: 135.5023 },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: 'greedy',
      });
      mapRef.current = map;

      const service = new google.maps.places.PlacesService(map);
      serviceRef.current = service;
      acServiceRef.current = new google.maps.places.AutocompleteService();

      // Center on destination
      new google.maps.Geocoder().geocode({ address: destination }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          map.setCenter(results[0].geometry.location);
        }
      });

      // Click on any POI on the map
      map.addListener('click', (event: google.maps.MapMouseEvent & { placeId?: string }) => {
        if (!event.placeId) { setCard(null); return; }
        event.stop?.();
        service.getDetails(
          {
            placeId: event.placeId,
            fields: ['name', 'rating', 'formatted_address', 'types', 'url'],
          },
          (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place) {
              openCard(place, event.placeId!);
            }
          }
        );
      });

      setMapReady(true);
    });

    return () => { cancelled = true; };
  }, [destination, openCard]);

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setPredictions([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(() => {
      if (!acServiceRef.current) return;
      acServiceRef.current.getPlacePredictions(
        { input: value, language: 'ko' },
        (preds, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && preds?.length) {
            setPredictions(preds);
            setShowDropdown(true);
          } else {
            setPredictions([]);
            setShowDropdown(false);
          }
        }
      );
    }, 250);
  }

  function selectPrediction(pred: google.maps.places.AutocompletePrediction) {
    setSearchInput(pred.description);
    setShowDropdown(false);
    setPredictions([]);
    // Run text search with the selected suggestion to show multiple pins
    setTimeout(() => runSearch(pred.description), 0);
  }

  function clearMarkers() {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
  }

  function handleSearch() {
    if (searchInput.trim()) runSearch(searchInput);
  }

  const runSearch = useCallback((query: string) => {
    if (!query.trim() || !mapRef.current || !serviceRef.current) return;
    setCard(null);
    clearMarkers();
    setShowDropdown(false);

    serviceRef.current.textSearch({ query }, (results, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) return;

      const bounds = new google.maps.LatLngBounds();

      results.slice(0, 20).forEach((place, i) => {
        if (!place.geometry?.location) return;

        const color = CAT_COLOR[mapCategory(place.types ?? [])] ?? '#3B82F6';

        const marker = new google.maps.Marker({
          position: place.geometry.location,
          map: mapRef.current!,
          title: place.name,
          label: { text: String(i + 1), color: '#fff', fontSize: '11px', fontWeight: 'bold' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
          zIndex: 100 - i,
        });

        marker.addListener('click', () => {
          openCard(
            {
              name: place.name,
              rating: place.rating,
              formatted_address: (place as google.maps.places.PlaceResult & { vicinity?: string }).vicinity ?? place.formatted_address,
              types: place.types,
              url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            } as google.maps.places.PlaceResult,
            place.place_id!
          );
        });

        markersRef.current.push(marker);
        bounds.extend(place.geometry.location);
      });

      if (markersRef.current.length > 0) {
        mapRef.current!.fitBounds(bounds);
      }
    });
  }, [openCard]);

  // Focus a specific place from outside (e.g. clicking "지도 보기" in schedule)
  useEffect(() => {
    if (!externalFocus || !mapReady || !serviceRef.current) return;
    if (externalFocus.placeId) {
      serviceRef.current.getDetails(
        { placeId: externalFocus.placeId, fields: ['name', 'rating', 'formatted_address', 'types', 'url', 'geometry'] },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place) {
            openCard(place, externalFocus.placeId!);
            if (place.geometry?.location) {
              clearMarkers();
              const color = CAT_COLOR[mapCategory(place.types ?? [])] ?? '#3B82F6';
              const marker = new google.maps.Marker({
                position: place.geometry.location,
                map: mapRef.current!,
                title: place.name,
                label: { text: '★', color: '#fff', fontSize: '11px', fontWeight: 'bold' },
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 16, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
                zIndex: 200,
              });
              markersRef.current.push(marker);
              mapRef.current?.panTo(place.geometry.location);
              mapRef.current?.setZoom(17);
            }
          }
        }
      );
    } else {
      runSearch(externalFocus.name);
    }
  }, [externalFocus, mapReady, openCard, runSearch]);

  async function addToCandidate() {
    if (!card) return;
    setAdding(true);
    await supabase.from('candidate_places').insert({
      trip_id: tripId,
      name: card.name,
      category: mapCategory(card.types),
      notes: '',
      maps_url: card.mapsUrl,
    });
    setAdded(card.name);
    setCard(null);
    setAdding(false);
    setTimeout(() => setAdded(null), 2500);
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

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0" ref={wrapperRef}>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); if (e.key === 'Escape') setShowDropdown(false); }}
              onFocus={() => predictions.length > 0 && setShowDropdown(true)}
              placeholder={`${destination} 맛집, 카페, 관광지...`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {showDropdown && predictions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
                {predictions.map((p) => (
                  <button
                    key={p.place_id}
                    onMouseDown={(e) => { e.preventDefault(); selectPrediction(p); }}
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
        {added && (
          <p className="text-xs text-green-600 font-semibold mt-1.5 px-0.5">✓ &quot;{added}&quot; 후보지에 추가됐어요</p>
        )}
      </div>

      {/* Place card — appears when a pin or POI is clicked */}
      {card && (
        <div className="px-3 py-3 bg-blue-50 border-b border-blue-100 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 leading-tight">{card.name}</p>
              {card.rating !== undefined && (
                <p className="text-xs text-amber-500 font-semibold mt-0.5">
                  ★ {card.rating.toFixed(1)}
                </p>
              )}
              {card.address && (
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{card.address}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                onClick={addToCandidate}
                disabled={adding}
                className="text-xs bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
              >
                {adding ? '추가 중...' : '+ 후보지 추가'}
              </button>
              {onSelectAccommodation && (
                <button
                  onClick={() => {
                    onSelectAccommodation(card.name, card.address ?? '');
                    setCard(null);
                  }}
                  className="text-xs bg-purple-500 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-purple-600 whitespace-nowrap"
                >
                  🏨 숙소로 지정
                </button>
              )}
              <button onClick={() => setCard(null)} className="text-xs text-gray-400 hover:text-gray-600 text-center">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 overflow-hidden relative">
        <div ref={mapDivRef} className="w-full h-full" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="text-2xl mb-2">🗺️</div>
              <p className="text-xs text-gray-400">지도 불러오는 중...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
