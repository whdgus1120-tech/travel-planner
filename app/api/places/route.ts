import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  if (!q || q.trim().length < 2) return NextResponse.json({ predictions: [] });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
    `?input=${encodeURIComponent(q)}&key=${key}&language=ko&types=establishment`,
    { signal: AbortSignal.timeout(5000) }
  );
  const data = await res.json();
  return NextResponse.json(data);
}
