'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface PackingItem {
  id: string;
  trip_id: string;
  category: string;
  name: string;
  is_checked: boolean;
  is_custom: boolean;
}

const DEFAULT_ITEMS: Omit<PackingItem, 'id' | 'trip_id'>[] = [
  // 여행서류
  { category: '여행서류', name: '여권 (유효기간 6개월 이상 확인)', is_checked: false, is_custom: false },
  { category: '여행서류', name: '항공권 e-티켓', is_checked: false, is_custom: false },
  // 전자기기
  { category: '전자기기', name: '스마트폰 + 충전기', is_checked: false, is_custom: false },
  { category: '전자기기', name: '보조배터리', is_checked: false, is_custom: false },
  { category: '전자기기', name: '해외용 전원 어댑터', is_checked: false, is_custom: false },
  { category: '전자기기', name: '블루투스 스피커', is_checked: false, is_custom: false },
  // 세면/위생
  { category: '세면/위생', name: '칫솔 + 치약', is_checked: false, is_custom: false },
  { category: '세면/위생', name: '선크림 SPF50+', is_checked: false, is_custom: false },
  { category: '세면/위생', name: '개인 세면도구 (소분)', is_checked: false, is_custom: false },
  // 의약품
  { category: '의약품', name: '두통약 + 소화제', is_checked: false, is_custom: false },
  { category: '의약품', name: '반창고/밴드', is_checked: false, is_custom: false },
  { category: '의약품', name: '개인 처방약', is_checked: false, is_custom: false },
  // 금융/결제
  { category: '금융/결제', name: '해외 겸용 신용/체크카드', is_checked: false, is_custom: false },
  { category: '금융/결제', name: '현지 통화 현금', is_checked: false, is_custom: false },
  // 기타
  { category: '기타', name: '우산/우비', is_checked: false, is_custom: false },
];

const CATEGORY_ICONS: Record<string, string> = {
  '여행서류': '📋',
  '전자기기': '📱',
  '세면/위생': '🧴',
  '의약품': '💊',
  '금융/결제': '💳',
  '기타': '📦',
};

const CATEGORIES = ['여행서류', '전자기기', '세면/위생', '의약품', '금융/결제', '기타'];

interface Props { tripId: string }

export default function PackingList({ tripId }: Props) {
  const [items, setItems] = useState<PackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('기타');
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unchecked' | 'checked'>('all');
  const [inlineCategory, setInlineCategory] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState('');
  const insertingRef = useRef(false);

  useEffect(() => {
    loadItems();

    const channel = supabase
      .channel(`packing-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packing_items', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // insertDefaults 중 realtime 이벤트로 중복 추가되는 것 방지
            if (insertingRef.current) return;
            setItems((prev) => {
              if (prev.find((i) => i.id === (payload.new as PackingItem).id)) return prev;
              return [...prev, payload.new as PackingItem];
            });
          } else if (payload.eventType === 'UPDATE') {
            setItems((prev) => prev.map((i) => i.id === payload.new.id ? payload.new as PackingItem : i));
          } else if (payload.eventType === 'DELETE') {
            setItems((prev) => prev.filter((i) => i.id !== payload.old.id));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  async function loadItems() {
    const { data, error } = await supabase
      .from('packing_items').select('*').eq('trip_id', tripId).order('created_at');
    if (!error && data) {
      if (data.length === 0) {
        if (!insertingRef.current) {
          insertingRef.current = true;
          await insertDefaults();
          insertingRef.current = false;
        }
      } else {
        // DB에 중복이 있으면 자동 정리 (name+category 기준, 먼저 생성된 것 유지)
        const seen = new Map<string, string>();
        const toDelete: string[] = [];
        data.forEach((item) => {
          const key = `${item.category}:${item.name}`;
          if (seen.has(key)) {
            toDelete.push(item.id);
          } else {
            seen.set(key, item.id);
          }
        });
        if (toDelete.length > 0) {
          await supabase.from('packing_items').delete().in('id', toDelete);
        }
        setItems(data.filter((item) => !toDelete.includes(item.id)));
      }
    }
    setLoading(false);
  }

  async function insertDefaults() {
    const rows = DEFAULT_ITEMS.map((item) => ({ ...item, trip_id: tripId }));
    const { data } = await supabase.from('packing_items').insert(rows).select();
    if (data) setItems(data);
  }

  async function toggleCheck(item: PackingItem) {
    const { data } = await supabase
      .from('packing_items').update({ is_checked: !item.is_checked }).eq('id', item.id).select().single();
    if (data) setItems((prev) => prev.map((i) => i.id === data.id ? data : i));
  }

  async function deleteItem(id: string) {
    await supabase.from('packing_items').delete().eq('id', id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function addItem() {
    if (!newName.trim()) return;
    setAdding(true);
    const { data } = await supabase.from('packing_items').insert({
      trip_id: tripId, category: newCategory, name: newName.trim(),
      is_checked: false, is_custom: true,
    }).select().single();
    if (data) setItems((prev) => [...prev, data]);
    setNewName('');
    setShowAddForm(false);
    setAdding(false);
  }

  async function addInlineItem(category: string) {
    if (!inlineName.trim()) { setInlineCategory(null); setInlineName(''); return; }
    const { data } = await supabase.from('packing_items').insert({
      trip_id: tripId, category, name: inlineName.trim(),
      is_checked: false, is_custom: true,
    }).select().single();
    if (data) setItems((prev) => [...prev, data]);
    setInlineName('');
    setInlineCategory(null);
  }

  // Show all categories (even empty) when filter is 'all', so user can always add to any category
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const catItems = items.filter((i) => i.category === cat);
    const filtered = filter === 'all' ? catItems
      : filter === 'unchecked' ? catItems.filter((i) => !i.is_checked)
      : catItems.filter((i) => i.is_checked);
    if (filter === 'all' || filtered.length > 0) acc[cat] = filtered;
    return acc;
  }, {} as Record<string, PackingItem[]>);

  const checkedCount = items.filter((i) => i.is_checked).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0;

  if (loading) return (
    <div className="p-8 text-center text-gray-300">
      <div className="text-3xl mb-2 animate-bounce">🎒</div>
      <p className="text-sm">준비물 목록 불러오는 중...</p>
    </div>
  );

  return (
    <div>
      {/* Progress */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎒</span>
            <span className="font-bold text-gray-800">준비 완료</span>
          </div>
          <span className="text-2xl font-extrabold text-blue-500">{pct}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-teal-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 text-right">{checkedCount} / {total}개 완료</p>
      </div>

      {/* Filter + Add */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['all', 'unchecked', 'checked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === f ? 'bg-white shadow text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {f === 'all' ? '전체' : f === 'unchecked' ? '미완료' : '완료'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-600 transition-colors"
        >
          <span>+</span> 항목 추가
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">
          <div className="flex gap-2 mb-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
            </select>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              placeholder="준비물 이름 입력"
              autoFocus
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAddForm(false)} className="text-sm text-gray-400 px-3 py-1.5 rounded-lg hover:text-gray-600">취소</button>
            <button
              onClick={addItem}
              disabled={adding || !newName.trim()}
              className="text-sm bg-blue-500 text-white px-4 py-1.5 rounded-xl hover:bg-blue-600 font-semibold disabled:opacity-50"
            >
              {adding ? '추가중...' : '추가'}
            </button>
          </div>
        </div>
      )}

      {/* Category Groups */}
      <div className="space-y-3">
        {Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
              <span className="text-base">{CATEGORY_ICONS[cat]}</span>
              <span className="font-bold text-gray-700 text-sm">{cat}</span>
              <span className="text-xs text-gray-400 ml-auto">
                {catItems.filter((i) => i.is_checked).length}/{catItems.length}
              </span>
              <button
                onClick={() => { setInlineCategory(cat); setInlineName(''); }}
                className="ml-1 w-5 h-5 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-blue-500 flex items-center justify-center text-xs font-bold transition-colors"
                title={`${cat}에 항목 추가`}
              >+</button>
            </div>
            {inlineCategory === cat && (
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex gap-2">
                <input
                  type="text"
                  value={inlineName}
                  onChange={(e) => setInlineName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addInlineItem(cat); if (e.key === 'Escape') { setInlineCategory(null); setInlineName(''); } }}
                  onBlur={() => { if (!inlineName.trim()) { setInlineCategory(null); } }}
                  placeholder="항목 이름 입력 후 Enter"
                  autoFocus
                  className="flex-1 text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                />
                <button
                  onClick={() => addInlineItem(cat)}
                  className="text-xs bg-blue-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-600 font-semibold"
                >추가</button>
                <button
                  onClick={() => { setInlineCategory(null); setInlineName(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1"
                >✕</button>
              </div>
            )}
            <div className="divide-y divide-gray-50">
              {catItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 group">
                  <button
                    onClick={() => toggleCheck(item)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      item.is_checked
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {item.is_checked && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-sm transition-all ${item.is_checked ? 'line-through text-gray-300' : 'text-gray-700'}`}>
                    {item.name}
                    {item.is_custom && <span className="ml-1.5 text-xs text-blue-400">추가됨</span>}
                  </span>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-400 transition-all rounded-lg hover:bg-red-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-12 text-gray-300">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-sm">모든 항목 완료!</p>
          </div>
        )}
      </div>
    </div>
  );
}
