import { NextResponse } from 'next/server';
import path from 'path';

export async function GET() {
  try {
    const sharp = require('sharp');
    const imgPath = 'C:\\Users\\acer\\.gemini\\antigravity-ide\\brain\\33a25485-41ae-4466-bd05-1dd2ca5bee58\\.tempmediaStorage\\media_1788720070147.png';
    const metadata = await sharp(imgPath).metadata();
    return NextResponse.json({ metadata });
  } catch (err) {
    return NextResponse.json({ error: err.message });
  }
}
