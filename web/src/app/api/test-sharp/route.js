import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const sharp = require('sharp');
    return NextResponse.json({ sharpAvailable: true, version: sharp.version });
  } catch (err) {
    return NextResponse.json({ sharpAvailable: false, error: err.message });
  }
}
