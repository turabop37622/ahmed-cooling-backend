import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const publicDir = path.join(process.cwd(), 'public', 'services');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const brainDir = 'C:\\Users\\acer\\.gemini\\antigravity-ide\\brain\\33a25485-41ae-4466-bd05-1dd2ca5bee58';
    const localMappings = [
      { src: path.join(brainDir, 'ac_repair_asian_1788717178947.jpg'), dest: 'ac-repair.jpg' },
      { src: path.join(brainDir, 'ac_install_asian_1788717235652.jpg'), dest: 'ac-installation.jpg' },
      { src: path.join(brainDir, 'ac_cleaning_asian_1788717292566.jpg'), dest: 'ac-cleaning.jpg' },
    ];

    const results = [];
    for (const item of localMappings) {
      if (fs.existsSync(item.src)) {
        const targetPath = path.join(publicDir, item.dest);
        fs.copyFileSync(item.src, targetPath);
        results.push({ copied: item.dest, status: 'ok' });
      } else {
        results.push({ copied: item.dest, status: 'source_not_found', path: item.src });
      }
    }

    // Direct CDN URLs that bypass download redirects
    const remoteDownloads = [
      {
        url: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=1200&auto=format&fit=crop&q=80',
        filename: 'refrigerator-repair.jpg',
      },
      {
        url: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=1200&auto=format&fit=crop&q=80',
        filename: 'washing-machine-repair.jpg',
      },
      {
        url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=1200&auto=format&fit=crop&q=80',
        filename: 'stove-repair.jpg',
      },
      {
        url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&auto=format&fit=crop&q=80',
        filename: 'central-ac.jpg',
      },
    ];

    for (const item of remoteDownloads) {
      const targetPath = path.join(publicDir, item.filename);
      try {
        const res = await fetch(item.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          fs.writeFileSync(targetPath, Buffer.from(buffer));
          results.push({ downloaded: item.filename, size: buffer.byteLength, status: 'ok' });
        } else {
          results.push({ downloaded: item.filename, status: 'failed', code: res.status });
        }
      } catch (err) {
        results.push({ downloaded: item.filename, status: 'error', message: err.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
