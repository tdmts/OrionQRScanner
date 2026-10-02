const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'html5-qrcode', 'html5-qrcode.min.js');
const destDir = path.join(__dirname, '..', 'www', 'lib');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'html5-qrcode.min.js'));
console.log('Copied html5-qrcode to www/lib');
