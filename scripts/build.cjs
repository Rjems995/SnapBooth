const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'snapbooth_photobooth_app.html'), path.join(output, 'index.html'));
fs.copyFileSync(path.join(root, 'shared.html'), path.join(output, 'shared.html'));
fs.copyFileSync(path.join(root, 'sharing.js'), path.join(output, 'sharing.js'));
fs.copyFileSync(path.join(root, 'shared.js'), path.join(output, 'shared.js'));
fs.copyFileSync(require.resolve('qrcode-generator'), path.join(output, 'assets', 'qrcode.js'));
console.log('Built SnapBooth and the shared-photo page in dist/.');
