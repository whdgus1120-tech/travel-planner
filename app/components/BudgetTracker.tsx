'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface BudgetItem {
  id: string;
  trip_id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  member_name: string;
  created_at: string;
}

const CATEGORIES = [
  { key: 'food', label: '식비', icon: '🍽️', color: 'bg-orange-100 text-orange-700', bar: 'bg-orange-400' },
  { key: 'transport', label: '교통', icon: '🚌', color: 'bg-green-100 text-green-700', bar: 'bg-green-400' },
  { key: 'accommodation', label: '숙박', icon: '🏨', color: 'bg-purple-100 text-purple-700', bar: 'bg-purple-400' },
  { key: 'shopping', label: '쇼핑', icon: '🛍️', color: 'bg-pink-100 text-pink-700', bar: 'bg-pink-400' },
  { key: 'activity', label: '관광/액티비티', icon: '🎡', color: 'bg-blue-100 text-blue-700', bar: 'bg-blue-400' },
  { key: 'medical', label: '의료/약', icon: '💊', color: 'bg-red-100 text-red-700', bar: 'bg-red-400' },
  { key: 'other', label: '기타', icon: '💰', color: 'bg-gray-100 text-gray-700', bar: 'bg-gray-400' },
];

const CURRENCIES = ['KRW', 'USD', 'JPY', 'EUR', 'THB', 'VND', 'SGD'];

const CURRENCY_SYMBOLS: Record<string, string> = {
  KRW: '₩', USD: '$', JPY: '¥', EUR: '€', THB: '฿', VND: '₫', SGD: 'S$',
};

interface Props { tripId: string; members: { name: string; color: string }[] }

export default function BudgetTracker({ tripId, members }: Props) {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalBudget, setTotalBudget] = useState<number>(0);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    category: 'food',
    description: '',
    amount: '',
    currency: 'KRW',
    date: new Date().toISOString().split('T')[0],
    member_name: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Load budget target from localStorage
    const saved = localStorage.getItem(`budget_target_${tripId}`);
    if (saved) { setTotalBudget(Number(saved)); setBudgetInput(saved); }

    loadItems();

    const channel = supabase
      .channel(`budget-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_items', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setItems((p) => [payload.new as BudgetItem, ...p]);
          else if (payload.eventType === 'DELETE') setItems((p) => p.filter((i) => i.id !== payload.old.id));
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  async function loadItems() {
    const { data } = await supabase
      .from('budget_items').select('*').eq('trip_id', tripId).order('date', { ascending: false }).order('created_at', { ascending: false });
    if (data) setItems(data);
    setLoading(false);
  }

  function saveBudget() {
    const val = Number(budgetInput.replace(/,/g, ''));
    if (!isNaN(val) && val >= 0) {
      setTotalBudget(val);
      localStorage.setItem(`budget_target_${tripId}`, String(val));
    }
    setEditingBudget(false);
  }

  async function addItem() {
    if (!form.description.trim() || !form.amount) return;
    setSubmitting(true);
    const { data } = await supabase.from('budget_items').insert({
      trip_id: tripId,
      category: form.category,
      description: form.description.trim(),
      amount: Number(form.amount),
      currency: form.currency,
      date: form.date,
      member_name: form.member_name,
    }).select().single();
    if (data) setItems((p) => [data, ...p]);
    setForm({ category: 'food', description: '', amount: '', currency: 'KRW', date: new Date().toISOString().split('T')[0], member_name: '' });
    setShowForm(false);
    setSubmitting(false);
  }

  async function deleteItem(id: string) {
    await supabase.from('budget_items').delete().eq('id', id);
    setItems((p) => p.filter((i) => i.id !== id));
  }

  // KRW-only total (simple: same currency items)
  const krwItems = items.filter((i) => i.currency === 'KRW');
  const totalSpent = krwItems.reduce((s, i) => s + i.amount, 0);
  const remaining = totalBudget - totalSpent;
  const pct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;

  const catTotals = CATEGORIES.map((cat) => ({
    ...cat,
    total: items.filter((i) => i.category === cat.key && i.currency === 'KRW').reduce((s, i) => s + i.amount, 0),
  })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);

  if (loading) return (
    <div className="p-8 text-center text-gray-300">
      <div className="text-3xl mb-2">💰</div>
      <p className="text-sm">예산 정보 불러오는 중...</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Budget Overview */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <span className="font-bold text-gray-800">예산 현황</span>
          </div>
          {!editingBudget ? (
            <button
              onClick={() => { setEditingBudget(true); setBudgetInput(totalBudget ? totalBudget.toLocaleString() : ''); }}
              className="text-xs text-blue-500 hover:text-blue-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50"
            >
              {totalBudget ? '예산 수정' : '예산 설정'}
            </button>
          ) : (
            <div className="flex gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₩</span>
                <input
                  type="text"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveBudget()}
                  placeholder="총 예산"
                  autoFocus
                  className="border border-blue-200 rounded-xl pl-7 pr-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <button onClick={saveBudget} className="text-sm bg-blue-500 text-white px-3 py-1.5 rounded-xl font-semibold hover:bg-blue-600">저장</button>
              <button onClick={() => setEditingBudget(false)} className="text-sm text-gray-400 px-2 py-1.5 rounded-xl hover:text-gray-600">취소</button>
            </div>
          )}
        </div>

        {totalBudget > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xs text-blue-400 mb-1">총 예산</p>
                <p className="font-bold text-blue-700 text-sm">₩{totalBudget.toLocaleString()}</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <p className="text-xs text-orange-400 mb-1">지출 합계</p>
                <p className="font-bold text-orange-700 text-sm">₩{totalSpent.toLocaleString()}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${remaining >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className={`text-xs mb-1 ${remaining >= 0 ? 'text-green-400' : 'text-red-400'}`}>잔여</p>
                <p className={`font-bold text-sm ${remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {remaining >= 0 ? '' : '-'}₩{Math.abs(remaining).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mb-1">
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-orange-400' : 'bg-gradient-to-r from-blue-400 to-teal-400'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 text-right">{pct}% 사용</p>
          </>
        ) : (
          <div className="text-center py-6 text-gray-300">
            <p className="text-sm">총 예산을 설정하면 진행률을 확인할 수 있어요</p>
          </div>
        )}
      </div>

      {/* Category Breakdown */}
      {catTotals.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
            <span>📊</span> 카테고리별 지출
          </h3>
          <div className="space-y-3">
            {catTotals.map((cat) => (
              <div key={cat.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{cat.icon} {cat.label}</span>
                  <span className="text-sm font-semibold text-gray-800">₩{cat.total.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cat.bar}`}
                    style={{ width: totalSpent > 0 ? `${(cat.total / totalSpent) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Expense + List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
            <span>📝</span> 지출 내역 ({items.length}건)
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-600 transition-colors"
          >
            <span>+</span> 지출 추가
          </button>
        </div>

        {/* Add Form */}
        {showForm && (
          <div className="p-5 bg-blue-50 border-b border-blue-100">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">카테고리</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">날짜</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">금액</label>
                <div className="flex gap-1">
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 w-20"
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">결제자</label>
                <select
                  value={form.member_name}
                  onChange={(e) => setForm((p) => ({ ...p, member_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">선택 안함</option>
                  {members.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs text-gray-500 font-medium mb-1 block">내용</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                placeholder="예: 라멘 2인분, 신칸센 왕복..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-400 px-3 py-2 rounded-xl hover:text-gray-600">취소</button>
              <button
                onClick={addItem}
                disabled={submitting || !form.description.trim() || !form.amount}
                className="text-sm bg-blue-500 text-white px-5 py-2 rounded-xl font-semibold hover:bg-blue-600 disabled:opacity-50"
              >
                {submitting ? '추가중...' : '추가'}
              </button>
            </div>
          </div>
        )}

        {/* Expense List */}
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-300">
            <div className="text-3xl mb-2">🧾</div>
            <p className="text-sm">지출 내역이 없어요</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map((item) => {
              const cat = CATEGORIES.find((c) => c.key === item.category) ?? CATEGORIES[CATEGORIES.length - 1];
              return (
                <div key={item.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 group">
                  <span className={`text-sm px-2.5 py-1 rounded-xl font-medium flex-shrink-0 ${cat.color}`}>
                    {cat.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.description}</p>
                      {item.member_name && (
                        <span className="text-xs text-gray-400 flex-shrink-0">{item.member_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {cat.label} · {item.date}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-800">
                      {CURRENCY_SYMBOLS[item.currency] ?? item.currency}{item.amount.toLocaleString()}
                    </p>
                    {item.currency !== 'KRW' && (
                      <p className="text-xs text-gray-400">{item.currency}</p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
