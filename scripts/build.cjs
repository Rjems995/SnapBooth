const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const postcss = require('postcss');
const tailwind = require('tailwindcss');

const root = path.join(__dirname, '..');
const output = path.join(root, 'dist');
async function build() {
    fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
    let html = fs.readFileSync(path.join(root, 'snapbooth_photobooth_app.html'), 'utf8');
    const configScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('tailwind.config ='));
    const configContext = vm.createContext({ tailwind: {} });
    vm.runInContext(configScript[1], configContext);
    const css = await postcss([tailwind({ ...configContext.tailwind.config,
        content: [{ raw: html, extension: 'html' }, { raw: fs.readFileSync(path.join(root, 'editor.js'), 'utf8'), extension: 'js' }]
    })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
    fs.writeFileSync(path.join(output, 'assets', 'studio.css'), css.css);
    html = html.replace('<script src="https://cdn.tailwindcss.com"></script>', '<link rel="stylesheet" href="./assets/studio.css">').replace(configScript[0], '');
    fs.writeFileSync(path.join(output, 'index.html'), html);
    for (const file of ['shared.html', 'sharing.js', 'shared.js', 'editor.js', 'editor.css', 'export-presets.js', 'session-drafts.js', 'studio-extras.css']) {
        fs.copyFileSync(path.join(root, file), path.join(output, file));
    }
    fs.copyFileSync(path.join(root, 'assets', 'demo-photos.webp'), path.join(output, 'assets', 'demo-photos.webp'));
    fs.rmSync(path.join(output, 'assets', 'demo-photos.png'), { force: true });
    fs.copyFileSync(require.resolve('qrcode-generator'), path.join(output, 'assets', 'qrcode.js'));
    console.log('Built SnapBooth and the shared-photo page in dist/.');
}

build().catch(error => { console.error(error); process.exitCode = 1; });
