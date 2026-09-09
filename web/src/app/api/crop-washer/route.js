import { NextResponse } from 'next/server';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sharp = require('sharp');
    const fs = require('fs');
    const inputPath = 'C:\\Users\\acer\\.gemini\\antigravity-ide\\brain\\33a25485-41ae-4466-bd05-1dd2ca5bee58\\.tempmediaStorage\\media_1788720070147.png';
    const outputPath = path.join(process.cwd(), 'public', 'services', 'washer-repair-clean.jpg');

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // In the 1920x945 image, the top left photo is roughly:
    // left: 342, top: 186, width: 417, height: 308
    await sharp(inputPath)
      .extract({ left: 355, top: 195, width: 405, height: 250 })
      .jpeg({ quality: 95 })
      .toFile(outputPath);

    return NextResponse.json({ success: true, savedTo: outputPath });
  } catch (err) {
    return NextResponse.json({ error: err.message });
  }
}
