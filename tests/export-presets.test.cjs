const assert = require('node:assert/strict');
const test = require('node:test');
const { deflateSync } = require('node:zlib');
const { PRESETS, fitRect, compose, withDpi, crc32 } = require('../export-presets.js');

test('whole-image export presets have the promised pixel and print sizes', () => {
    assert.deepEqual([PRESETS.story.width, PRESETS.story.height], [1080, 1920]);
    assert.deepEqual([PRESETS.wallpaper.width, PRESETS.wallpaper.height], [1440, 2560]);
    assert.equal(PRESETS.strip2x6.width / PRESETS.strip2x6.dpi, 2);
    assert.equal(PRESETS.strip2x6.height / PRESETS.strip2x6.dpi, 6);
    assert.equal(PRESETS.print4x6.width / PRESETS.print4x6.dpi, 4);
    assert.equal(PRESETS.print4x6.height / PRESETS.print4x6.dpi, 6);
});

test('all layouts fit inside each preset without cropping or stretching', () => {
    for (const source of [[700, 4800], [1000, 1500], [1200, 900]]) {
        for (const preset of Object.values(PRESETS).filter(value => value.width)) {
            const rect = fitRect(...source, preset.width, preset.height, 30);
            assert.ok(rect.x >= 30 - 1e-8 && rect.y >= 30 - 1e-8);
            assert.ok(rect.x + rect.width <= preset.width - 30 + 1e-8);
            assert.ok(rect.y + rect.height <= preset.height - 30 + 1e-8);
            assert.ok(Math.abs(rect.width / rect.height - source[0] / source[1]) < 1e-8);
        }
    }
});

test('composition preserves the entire rendered strip before changing canvas size', () => {
    const calls = [];
    const context = { fillRect() {}, drawImage(...args) { calls.push(args); } };
    const canvas = { width: 1000, height: 1500, getContext: () => context };
    const source = { getContext: () => context };
    compose(canvas, 'story', '#fff', () => source);
    assert.equal(source.width, 1000);
    assert.equal(source.height, 1500);
    assert.deepEqual([canvas.width, canvas.height], [1080, 1920]);
    assert.deepEqual(calls[0], [canvas, 0, 0]);
    assert.equal(calls[1][0], source);
    assert.equal(calls[1].length, 5, 'the full source must be drawn without a crop rectangle');
});

function chunk(type, data) {
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length); result.write(type, 4);
    result.set(data, 8); result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
    return result;
}

function png() {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
    return new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
        chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))], { type: 'image/png' });
}

function pngChunks(buffer) {
    const chunks = [];
    for (let offset = 8; offset < buffer.length;) {
        const length = buffer.readUInt32BE(offset);
        chunks.push({ type: buffer.toString('ascii', offset + 4, offset + 8), data: buffer.subarray(offset + 8, offset + 8 + length),
            checksum: buffer.readUInt32BE(offset + length + 8), bytes: buffer.subarray(offset + 4, offset + 8 + length) });
        offset += length + 12;
    }
    return chunks;
}

test('PNG print exports contain one valid 300-DPI density chunk and unchanged image pixels', async () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
    const original = png();
    const encoded = await withDpi(await withDpi(original, 300), 300);
    const before = pngChunks(Buffer.from(await original.arrayBuffer()));
    const after = pngChunks(Buffer.from(await encoded.arrayBuffer()));
    const densities = after.filter(value => value.type === 'pHYs');
    assert.equal(densities.length, 1);
    assert.equal(densities[0].data.readUInt32BE(0), 11811);
    assert.equal(densities[0].data.readUInt32BE(4), 11811);
    assert.equal(densities[0].data[8], 1);
    assert.equal(densities[0].checksum, crc32(densities[0].bytes));
    assert.deepEqual(after.find(value => value.type === 'IDAT').data, before.find(value => value.type === 'IDAT').data);
});

test('JPEG print exports update JFIF density to 300 DPI without duplicating headers', async () => {
    const jpeg = new Blob([new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255, 217])], { type: 'image/jpeg' });
    const result = Buffer.from(await (await withDpi(await withDpi(jpeg, 300), 300)).arrayBuffer());
    assert.equal(result.length, jpeg.size);
    assert.equal(result[13], 1);
    assert.equal(result.readUInt16BE(14), 300);
    assert.equal(result.readUInt16BE(16), 300);
});

test('JPEG print exports add a density header if the browser omits JFIF', async () => {
    const jpeg = new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' });
    const result = Buffer.from(await (await withDpi(jpeg, 300)).arrayBuffer());
    assert.equal(result.toString('ascii', 6, 11), 'JFIF\0');
    assert.equal(result.readUInt16BE(14), 300);
    assert.deepEqual([...result.subarray(-2)], [255, 217]);
});

test('digital exports keep their original encoded bytes', async () => {
    const original = png();
    assert.equal(await withDpi(original, null), original);
    await assert.rejects(withDpi(original, 0.5), RangeError);
});
