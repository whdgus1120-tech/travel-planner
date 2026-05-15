import { NextResponse } from 'next/server';

export const revalidate = 3600; // 1시간 캐시

const CURRENCIES = [
  { code: 'USD', name: '미국 달러', flag: '🇺🇸', unit: 1 },
  { code: 'JPY', name: '일본 엔', flag: '🇯🇵', unit: 100 },
  { code: 'EUR', name: '유로', flag: '🇪🇺', unit: 1 },
  { code: 'THB', name: '태국 바트', flag: '🇹🇭', unit: 1 },
  { code: 'VND', name: '베트남 동', flag: '🇻🇳', unit: 100 },
  { code: 'SGD', name: '싱가포르 달러', flag: '🇸🇬', unit: 1 },
];

export async function GET() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 3600 },
    });
    const json = await res.json();

    if (json.result !== 'success') throw new Error('API error');

    const krw = json.rates['KRW'] as number;

    const rates = CURRENCIES.map(({ code, name, flag, unit }) => {
      const foreignPerUsd = json.rates[code] as number;
      const krwPerUnit = (krw / foreignPerUsd) * unit;
      return {
        code,
        name,
        flag,
        unit,
        krw: Math.round(krwPerUnit),
      };
    });

    return NextResponse.json({ rates, updatedAt: json.time_last_update_utc });
  } catch {
    return NextResponse.json({ error: '환율 정보를 불러올 수 없습니다' }, { status: 500 });
  }
}
