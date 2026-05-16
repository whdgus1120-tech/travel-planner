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

function detectCategory(name: string): string {
  if (/카페|cafe|coffee|커피|베이커리|bakery|빵/i.test(name)) return 'food';
  if (/식당|레스토랑|restaurant|맛집|이자카야|스시|라멘|야키|우동|초밥|居酒屋/i.test(name)) return 'food';
  if (/호텔|hotel|숙박|게스트하우스|旅館|inn|hostel|펜션/i.test(name)) return 'accommodation';
  if (/백화점|쇼핑|마트|mall|시장|market|편의점|돈키호테/i.test(name)) return 'shopping';
  return 'sightseeing';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 });

  // 1. 풀 URL에서 바로 이름 추출
  const directName = extractNameFromMapsUrl(url);
  if (directName) {
    return NextResponse.json({
      name: directName,
      category: detectCategory(directName),
      resolvedUrl: url,
    });
  }

  // 2. 단축 URL 등 → 리다이렉트 따라가서 최종 URL 파싱
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });

    const finalUrl = res.url;

    // 최종 URL에서 이름 추출
    const resolvedName = extractNameFromMapsUrl(finalUrl);
    if (resolvedName) {
      return NextResponse.json({
        name: resolvedName,
        category: detectCategory(resolvedName),
        resolvedUrl: finalUrl,
      });
    }

    // HTML <title> 파싱 (최후 수단)
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
      const raw = titleMatch[1];
      // "장소명 - Google 지도" 또는 "장소명 · Google Maps" 형태
      const cleanName = raw.split(/\s*[-–—·]\s*(?:Google|구글)/)[0].trim();
      if (cleanName && cleanName.length > 1) {
        return NextResponse.json({
          name: cleanName,
          category: detectCategory(cleanName),
          resolvedUrl: finalUrl,
        });
      }
    }
  } catch { /* timeout or network error */ }

  return NextResponse.json({ name: null, resolvedUrl: url });
}
