const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'assets');
const destDir = path.join(__dirname, 'public', 'services');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const files = fs.readdirSync(srcDir);
files.forEach(file => {
  if (file.endsWith('.jpg') || file.endsWith('.png')) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    console.log('Copied', file);
  }
});
