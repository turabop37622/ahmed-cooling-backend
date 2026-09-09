import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || 'washing machine repair';

    const res = await fetch(`https://unsplash.com/napi/search/photos?query=${encodeURIComponent(q)}&per_page=10`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ status: res.status, statusText: res.statusText });
    }

    const data = await res.json();
    const photos = (data.results || []).map((p) => ({
      id: p.id,
      alt: p.alt_description || p.description,
      rawUrl: p.urls?.regular,
      smallUrl: p.urls?.small,
    }));

    return NextResponse.json({ success: true, count: photos.length, photos });
  } catch (err) {
    return NextResponse.json({ error: err.message });
  }
}
