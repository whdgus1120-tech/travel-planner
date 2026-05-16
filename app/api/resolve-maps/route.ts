import { NextResponse } from 'next/server';

function extractNameFromMapsUrl(url: string): string | null {
  try {
    const match = url.match(/google\.com\/maps\/place\/([^/@?&]+)/);
    if (match?.[1]) {
      const decoded = decodeURIComponent(match[1].replace(/\+/g, ' '));
      if (decoded.length > 1) return decoded;
    }
  } catch { /* ignore */ }
  return null;
}

function extractNameFromHtml(html: string): string | null {
  // Firebase Dynamic Link page embeds the destination Google Maps URL in HTML
  // The place name segment is double-encoded: %25EC%25B9... → %EC%B9... → 카...
  const mapsMatch = html.match(/https:\/\/www\.google\.com\/maps\/place\/([^/"'\s&\\]+)/);
  if (mapsMatch?.[1]) {
    try {
      const step1 = decodeURIComponent(mapsMatch[1]);
      const name = decodeURIComponent(step1.replace(/\+/g, ' '));
      if (name.length > 1) return name;
    } catch { /* ignore */ }
  }

  // Fallback: plain HTML <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    const cleanName = titleMatch[1].split(/\s*[-–—·]\s*(?:Google|구글)/)[0].trim();
    if (cleanName && cleanName.length > 1) return cleanName;
  }

  return null;
}

function detectCategory(name: string): string {
  if (/카페|cafe|coffee|커피|베이커리|bakery|빵/i.test(name)) return 'food';
  if (/식당|레스토랑|restaurant|맛집|이자카야|스시|라멘|야키|우동|초밥|居酒屋|ラーメン|カフェ|라멘관|麺/i.test(name)) return 'food';
  if (/호텔|hotel|숙박|게스트하우스|旅館|inn|hostel|펜션/i.test(name)) return 'accommodation';
  if (/백화점|쇼핑|마트|mall|시장|market|편의점|돈키호테/i.test(name)) return 'shopping';
  return 'sightseeing';
}

// No browser User-Agent: Google's Firebase Dynamic Links returns HTTP 302 to non-browser clients,
// but returns a JS-only redirect page to Chrome-like agents. We rely on the 302 redirect chain.
const FETCH_HEADERS = {
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 });

  // 1. Full Google Maps URL → extract directly from path
  const directName = extractNameFromMapsUrl(url);
  if (directName) {
    return NextResponse.json({ name: directName, category: detectCategory(directName), resolvedUrl: url });
  }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    const finalUrl = res.url;

    // 2. Followed to a full Google Maps URL
    const resolvedName = extractNameFromMapsUrl(finalUrl);
    if (resolvedName) {
      return NextResponse.json({ name: resolvedName, category: detectCategory(resolvedName), resolvedUrl: finalUrl });
    }

    // 3. Firebase Dynamic Link / JS-redirect page — parse embedded destination URL
    const html = await res.text();
    const htmlName = extractNameFromHtml(html);
    if (htmlName) {
      return NextResponse.json({ name: htmlName, category: detectCategory(htmlName), resolvedUrl: finalUrl });
    }
  } catch { /* timeout or network error */ }

  return NextResponse.json({ name: null, resolvedUrl: url });
}
