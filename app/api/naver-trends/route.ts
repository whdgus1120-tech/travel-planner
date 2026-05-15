import { NextResponse } from 'next/server';

export const revalidate = 3600;

const DESTINATIONS = [
  { name: '일본', keywords: ['일본여행', '일본 여행'] },
  { name: '태국', keywords: ['태국여행', '태국 여행'] },
  { name: '베트남', keywords: ['베트남여행', '베트남 여행'] },
  { name: '유럽', keywords: ['유럽여행', '유럽 여행'] },
  { name: '미국', keywords: ['미국여행', '미국 여행'] },
];

const DEALS_KEYWORDS = ['항공권 특가', '패키지 특가', '여행 특가'];

function getDateRange() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function fetchDataLab(clientId: string, clientSecret: string) {
  const { startDate, endDate } = getDateRange();
  const body = {
    startDate,
    endDate,
    timeUnit: 'month',
    keywordGroups: DESTINATIONS.map((d) => ({
      groupName: d.name,
      keywords: d.keywords,
    })),
  };

  const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error('DataLab API failed');
  const json = await res.json();

  const ranked = json.results
    .map((r: { title: string; data: { ratio: number }[] }) => ({
      name: r.title,
      ratio: r.data[0]?.ratio ?? 0,
    }))
    .sort((a: { ratio: number }, b: { ratio: number }) => b.ratio - a.ratio)
    .map((item: { name: string; ratio: number }, i: number) => ({
      rank: i + 1,
      name: item.name,
      ratio: Math.round(item.ratio),
    }));

  return ranked;
}

async function fetchNaverNews(clientId: string, clientSecret: string) {
  const query = encodeURIComponent(DEALS_KEYWORDS[Math.floor(Math.random() * DEALS_KEYWORDS.length)]);
  const res = await fetch(
    `https://openapi.naver.com/v1/search/news.json?query=${query}&display=3&sort=date`,
    {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      next: { revalidate: 3600 },
    }
  );
  if (!res.ok) throw new Error('News API failed');
  const json = await res.json();
  return json.items.map((item: { title: string; link: string; pubDate: string }) => ({
    title: item.title.replace(/<[^>]+>/g, ''),
    link: item.link,
    pubDate: item.pubDate,
  }));
}

// Fallback static data when no API keys
const FALLBACK_RANKINGS = [
  { rank: 1, name: '일본', ratio: 98 },
  { rank: 2, name: '태국', ratio: 72 },
  { rank: 3, name: '베트남', ratio: 65 },
  { rank: 4, name: '유럽', ratio: 54 },
  { rank: 5, name: '미국', ratio: 41 },
];

const FALLBACK_DEALS = [
  { title: '네이버 항공권에서 최신 특가 확인하기', link: 'https://flight.naver.com', pubDate: '' },
  { title: '네이버 여행 패키지 특가 보기', link: 'https://travel.naver.com', pubDate: '' },
];

export async function GET() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      rankings: FALLBACK_RANKINGS,
      deals: FALLBACK_DEALS,
      isLive: false,
    });
  }

  try {
    const [rankings, deals] = await Promise.all([
      fetchDataLab(clientId, clientSecret),
      fetchNaverNews(clientId, clientSecret),
    ]);
    return NextResponse.json({ rankings, deals, isLive: true });
  } catch {
    return NextResponse.json({
      rankings: FALLBACK_RANKINGS,
      deals: FALLBACK_DEALS,
      isLive: false,
    });
  }
}
