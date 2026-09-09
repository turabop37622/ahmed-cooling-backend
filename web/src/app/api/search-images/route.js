import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || 'hvac';
    const limit = searchParams.get('limit') || '5';

    const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      q
    )}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url&format=json`;

    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': 'AhmedCoolingWorkshop/1.0 (info@ahmedcooling.com)',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Wikimedia search failed' }, { status: 500 });
    }

    const data = await res.json();
    const pages = data.query?.pages || {};
    const results = Object.values(pages).map((p) => {
      const info = p.imageinfo?.[0] || {};
      return {
        id: p.pageid,
        title: p.title,
        url: info.url,
        thumbUrl: info.thumburl,
        description: info.extmetadata?.ObjectName?.value || info.extmetadata?.ImageDescription?.value || '',
      };
    });

    return NextResponse.json({ count: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 200 });
  }
}
