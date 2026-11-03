(function () {
    const PRESETS = Object.freeze({
        original: { label: 'Original design', dpi: null },
        story: { label: 'Instagram Story', width: 1080, height: 1920, dpi: null },
        wallpaper: { label: 'Phone Wallpaper', width: 1440, height: 2560, dpi: null },
        strip2x6: { label: '2×6-inch Strip', width: 600, height: 1800, dpi: 300 },
        print4x6: { label: '4×6-inch Print', width: 1200, height: 1800, dpi: 300 }
    });

    function fitRect(sourceWidth, sourceHeight, targetWidth, targetHeight, margin = 0) {
        if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(value => Number.isFinite(value) && value > 0) ||
            margin < 0 || margin * 2 >= Math.min(targetWidth, targetHeight)) throw new RangeError('Invalid export dimensions.');
        const scale = Math.min((targetWidth - margin * 2) / sourceWidth, (targetHeight - margin * 2) / sourceHeight);
        const width = sourceWidth * scale, height = sourceHeight * scale;
        return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
    }

    function compose(canvas, presetId, color, createCanvas = () => document.createElement('canvas')) {
        const preset = PRESETS[presetId] || PRESETS.original;
        if (!preset.width) return;
        const source = createCanvas();
        source.width = canvas.width; source.height = canvas.height;
        source.getContext('2d').drawImage(canvas, 0, 0);
        const margin = preset.dpi ? 30 : Math.round(preset.width * 0.04);
        const rect = fitRect(source.width, source.height, preset.width, preset.height, margin);
        canvas.width = preset.width; canvas.height = preset.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
    }

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function pngDensity(bytes, dpi) {
        if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) throw new Error('Invalid PNG export.');
        const physical = new Uint8Array(21);
        const view = new DataView(physical.buffer);
        view.setUint32(0, 9);
        physical.set([112, 72, 89, 115], 4); // pHYs
        const pixelsPerMeter = Math.round(dpi / 0.0254);
        view.setUint32(8, pixelsPerMeter); view.setUint32(12, pixelsPerMeter);
        physical[16] = 1;
        view.setUint32(17, crc32(physical.subarray(4, 17)));
        const parts = [bytes.subarray(0, 8)];
        const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let inserted = false;
        for (let offset = 8; offset < bytes.length;) {
            if (offset + 12 > bytes.length) throw new Error('Invalid PNG chunk.');
            const length = input.getUint32(offset);
            const end = offset + length + 12;
            if (end > bytes.length) throw new Error('Invalid PNG chunk.');
            const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
            if (type !== 'pHYs') parts.push(bytes.subarray(offset, end));
            if (type === 'IHDR') { parts.push(physical); inserted = true; }
            offset = end;
        }
        if (!inserted) throw new Error('PNG has no image header.');
        return new Blob(parts, { type: 'image/png' });
    }

    function jpegDensity(bytes, dpi) {
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG export.');
        const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let offset = 2; offset + 4 < bytes.length && bytes[offset] === 0xff;) {
            const marker = bytes[offset + 1];
            if (marker === 0xda || marker === 0xd9) break;
            const length = input.getUint16(offset + 2);
            if (length < 2 || offset + length + 2 > bytes.length) break;
            if (marker === 0xe0 && length >= 16 && String.fromCharCode(...bytes.subarray(offset + 4, offset + 9)) === 'JFIF\0') {
                bytes[offset + 11] = 1;
                input.setUint16(offset + 12, dpi); input.setUint16(offset + 14, dpi);
                return new Blob([bytes], { type: 'image/jpeg' });
            }
            offset += length + 2;
        }
        const jfif = new Uint8Array([0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0]);
        return new Blob([bytes.subarray(0, 2), jfif, bytes.subarray(2)], { type: 'image/jpeg' });
    }

    async function withDpi(blob, dpi) {
        if (!dpi) return blob;
        if (!Number.isInteger(dpi) || dpi < 1 || dpi > 65535) throw new RangeError('Invalid print density.');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (blob.type === 'image/png') return pngDensity(bytes, dpi);
        if (blob.type === 'image/jpeg') return jpegDensity(bytes, dpi);
        throw new Error('Unsupported export format.');
    }

    const api = { PRESETS, fitRect, compose, withDpi, crc32 };
    if (typeof window !== 'undefined') window.SnapBoothExportPresets = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
