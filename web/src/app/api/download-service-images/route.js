import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');
    let url = searchParams.get('url');

    if (!filename || !url) {
      return NextResponse.json({ error: 'filename and url query parameters are required' }, { status: 400 });
    }

    // If it's a page URL (e.g. unsplash.com/photos/...), extract og:image
    if (!url.match(/\.(jpg|jpeg|png|webp|avif)($|\?)/i) || url.includes('unsplash.com/photos/')) {
      try {
        const pageRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          const match =
            html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
            html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
          if (match && match[1]) {
            url = match[1].replace(/&amp;/g, '&');
          }
        }
      } catch (pageErr) {
        console.warn('Could not extract og:image, falling back to direct URL:', pageErr);
      }
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${res.statusText}`, attemptedUrl: url, code: res.status }, { status: 200 });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const targetDir = path.join(process.cwd(), 'public', 'services');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, filename);
    fs.writeFileSync(targetPath, buffer);

    return NextResponse.json({ success: true, savedTo: targetPath, size: buffer.length, sourceUrl: url });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 200 });
  }
}

export async function POST(request) {
  try {
    const { filename, url } = await request.json();
    if (!filename || !url) {
      return NextResponse.json({ error: 'filename and url are required' }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${res.statusText}` }, { status: 500 });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const targetDir = path.join(process.cwd(), 'public', 'services');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, filename);
    fs.writeFileSync(targetPath, buffer);

    return NextResponse.json({ success: true, savedTo: targetPath, size: buffer.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
