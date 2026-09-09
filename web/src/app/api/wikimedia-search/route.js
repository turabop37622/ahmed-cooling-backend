import { NextResponse } from 'next/server';
import https from 'https';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'AhmedCoolingWorkshopBot/1.0 (https://ahmedcooling.com/; contact@ahmedcooling.com) Node/20',
        Accept: 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || 'hvac';
    const limit = searchParams.get('limit') || '5';

    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      q
    )}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url&format=json`;

    const res = await httpsGet(url);
    if (res.status !== 200) {
      return NextResponse.json({ error: `Wikimedia returned status ${res.status}`, res });
    }

    const pages = res.data?.query?.pages || {};
    const results = Object.values(pages).map((p) => ({
      title: p.title,
      url: p.imageinfo?.[0]?.url,
    }));

    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 200 });
  }
}
