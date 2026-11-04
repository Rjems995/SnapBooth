const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { main } = require('./browser-editor.cjs');
const { waitFor } = require('./browser-sharing.cjs');

main(async ({ page, artifactDir }) => {
    await page.evaluate('app.sessionDrafts.deleteDraft()');
    await page.send('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
    const home = await page.evaluate(`(async () => {
        const image = new Image(); image.src = './assets/demo-photos.webp'; await image.decode();
        const copy=document.querySelector('.home-copy').getBoundingClientRect(), gallery=document.querySelector('.home-gallery').getBoundingClientRect();
        return { headline:document.querySelector('.home-headline').textContent.replace(/\\s+/g,' ').trim(), examples:document.querySelectorAll('.sample-strip').length,
            beside:copy.right<=gallery.left, draftHidden:document.getElementById('draftResumeCard').hidden, imageWidth:image.naturalWidth };
    })()`);
    assert.equal(home.headline, 'Your moments, your photo strip.');
    assert.equal(home.examples, 3); assert.equal(home.beside, true); assert.equal(home.draftHidden, true); assert.ok(home.imageWidth>500);
    const desktop = await page.send('Page.captureScreenshot', { format:'png' });
    fs.writeFileSync(path.join(artifactDir, 'homepage-desktop.png'), Buffer.from(desktop.data,'base64'));
    await page.send('Emulation.setDeviceMetricsOverride', { width:375,height:812,deviceScaleFactor:1,mobile:true });
    assert.ok(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    const mobile = await page.send('Page.captureScreenshot', { format:'png', captureBeyondViewport:true });
    fs.writeFileSync(path.join(artifactDir,'homepage-mobile.png'),Buffer.from(mobile.data,'base64'));
    console.log('Homepage copy, sample strips, and responsive layout passed. Checking real draft storage.');

    const expected = await page.evaluate(`(async () => {
        app.selectShotOption(4);
        app.capturedPhotos=['#ef4444','#22c55e','#2563eb','#eab308'].map((color,i)=>{
            const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');
            x.fillStyle=color;x.fillRect(0,0,800,600);x.fillStyle='white';x.font='60px sans-serif';x.fillText('DRAFT '+i,100,300);
            return c.toDataURL('image/jpeg',.9);
        });
        app.photoEdits=[{zoom:2,x:.2,y:.8},{zoom:1,x:.5,y:.5},{zoom:1.5,x:.4,y:.6},{zoom:1,x:.5,y:.5}];
        app.placedStickers=[{id:10,emoji:'🤍',x:20,y:70,scale:1.2}];
        app.drawnPaths=[{color:'#111111',size:6,isEraser:false,points:[{x:.1,y:.2},{x:.2,y:.3}]}];
        app.frameColor='#dbeafe';app.photoCorners='rounded';app.activeFilter='warm';app.fontClass='font-hand';app.mainText='Friday with friends';app.exportPreset='story';
        app.navigateTo('customize');app.photoEditor.selected=2;app.setControlTab('text');
        document.getElementById('inputMainText').value=app.mainText;app.updateTextContent();app.renderPlacedStickers();
        await app.sessionDrafts.flush();
        return {photos:app.capturedPhotos,edits:app.photoEdits,stickers:app.placedStickers,paths:app.drawnPaths};
    })()`);
    const countPhotos = () => page.evaluate(`(async()=>{const db=await app.sessionDrafts.store.open();return new Promise((resolve,reject)=>{
        const r=db.transaction('photos').objectStore('photos').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });})()`);
    assert.equal(await countPhotos(),4);
    await page.evaluate(`document.getElementById('inputMainText').value='Friday with friends!';document.getElementById('inputMainText').dispatchEvent(new Event('input',{bubbles:true}));`);
    await waitFor(page,'app.sessionDrafts.pending?.mainText==="Friday with friends!"');
    assert.equal(await countPhotos(),4,'editing must not create duplicate stored photos');
    await page.evaluate('window.__beforeDraftReload=true');
    await page.send('Page.reload',{ignoreCache:true});
    await waitFor(page,'document.readyState==="complete" && typeof app==="object" && !!app.sessionDrafts && !window.__beforeDraftReload');
    await page.evaluate('app.sessionDrafts.ready');
    assert.equal(await page.evaluate('document.getElementById("draftResumeCard").hidden'),false);
    assert.equal(await page.evaluate('app.capturedPhotos.length'),0,'draft must wait for the Resume action');
    assert.equal(await page.evaluate('app.cameraStream'),null);
    await page.evaluate('document.getElementById("resumeDraftBtn").click()');
    await waitFor(page,'app.currentScreen==="customize"');
    const restored = await page.evaluate(`({photos:app.capturedPhotos,edits:app.photoEdits,stickers:app.placedStickers,paths:app.drawnPaths,
        title:app.mainText,font:app.fontClass,frame:app.frameColor,preset:app.exportPreset,tab:app.controlTab,selected:app.photoEditor.selected})`);
    for(const key of ['photos','edits','stickers','paths'])assert.deepEqual(restored[key],expected[key]);
    assert.equal(restored.title,'Friday with friends!');assert.equal(restored.font,'font-hand');assert.equal(restored.frame,'#dbeafe');
    assert.equal(restored.preset,'story');assert.equal(restored.tab,'text');assert.equal(restored.selected,2);
    console.log('Refresh and full draft restoration passed. Checking complete-image export sizes and print metadata.');

    await page.evaluate('app.navigateTo("export")');
    for(const [id,width,height] of [['original',1000,null],['story',1080,1920],['wallpaper',1440,2560],['strip2x6',600,1800],['print4x6',1200,1800]]){
        await page.evaluate(`app.setExportPreset('${id}')`);
        await waitFor(page,'app.exportIsReady && !!app.photoSharing.file');
        const exported=await page.evaluate(`(async()=>{
            const canvas=document.getElementById('exportCanvas');const file=app.photoSharing.file;
            const jpeg=await createImageBitmap(file), pngBlob=await app.createExportBlob('png'), png=await createImageBitmap(pngBlob);
            const bytes=new Uint8Array(await file.arrayBuffer());let density=null;
            for(let i=2;i+18<bytes.length;){
                if(bytes[i]!==255)break;const size=bytes[i+2]*256+bytes[i+3];
                if(bytes[i+1]===224&&String.fromCharCode(...bytes.slice(i+4,i+9))==='JFIF\\0'){
                    density={unit:bytes[i+11],x:bytes[i+12]*256+bytes[i+13],y:bytes[i+14]*256+bytes[i+15]};break;
                }if(size<2)break;i+=size+2;
            }
            const pb=new Uint8Array(await pngBlob.arrayBuffer()),pv=new DataView(pb.buffer);let pngDensity=null;
            for(let i=8;i+12<=pb.length;){const n=pv.getUint32(i);if(String.fromCharCode(...pb.slice(i+4,i+8))==='pHYs')pngDensity=[pv.getUint32(i+8),pv.getUint32(i+12),pb[i+16]];i+=n+12;}
            return {width:canvas.width,height:canvas.height,jpeg:[jpeg.width,jpeg.height],png:[png.width,png.height],density,pngDensity};
        })()`);
        assert.equal(exported.width,width);if(height)assert.equal(exported.height,height);
        assert.deepEqual(exported.jpeg,[exported.width,exported.height]);assert.deepEqual(exported.png,exported.jpeg);
        if(id==='strip2x6'||id==='print4x6'){
            assert.deepEqual(exported.density,{unit:1,x:300,y:300});assert.deepEqual(exported.pngDensity,[11811,11811,1]);
        }
    }
    await page.evaluate('app.sessionDrafts.flush()');
    await page.evaluate('app.navigateTo("home");document.getElementById("deleteDraftBtn").click()');
    await page.evaluate('app.sessionDrafts.queue');
    assert.equal(await countPhotos(),0);
    await page.send('Page.reload',{ignoreCache:true});
    await waitFor(page,'document.readyState==="complete" && typeof app==="object" && !!app.sessionDrafts');
    await page.evaluate('app.sessionDrafts.ready');
    assert.equal(await page.evaluate('document.getElementById("draftResumeCard").hidden'),true);
    console.log('Export presets, PNG/JPEG print density, and draft deletion passed. Checking partial-capture recovery.');

    await page.evaluate(`(async()=>{
        app.selectShotOption(2);const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);
        app.capturedPhotos=[c.toDataURL('image/jpeg')];app.photoEdits=[{zoom:2,x:.2,y:.8}];app.renderPhotoReviewGrid();app.navigateTo('review');
        await app.sessionDrafts.flush();window.__partialBeforeReload=true;
    })()`);
    await page.send('Page.reload',{ignoreCache:true});
    await waitFor(page,'document.readyState==="complete" && typeof app==="object" && !!app.sessionDrafts && !window.__partialBeforeReload');
    await page.evaluate('app.sessionDrafts.ready');await page.evaluate('app.sessionDrafts.resume()');
    assert.equal(await page.evaluate('document.getElementById("completeSessionBtn").hidden'),false);
    const original=await page.evaluate('app.capturedPhotos[0]');
    await page.evaluate('app.continuePhotoCaptureSequence()');
    assert.equal(await page.evaluate('app.capturedPhotos.length'),2);
    assert.equal(await page.evaluate('app.capturedPhotos[0]'),original);
    assert.deepEqual(await page.evaluate('({...app.photoEdits[0]})'),{zoom:2,x:.2,y:.8});
    assert.equal(await page.evaluate('app.currentScreen'),'review');
    await page.evaluate(`(async()=>{
        app.sessionDrafts.store.write=async()=>{throw new Error('Test quota error')};app.mainText='Unsaved change';app.sessionDrafts.schedule();await app.sessionDrafts.flush();
    })()`);
    assert.match(await page.evaluate('document.getElementById("draftSaveStatus").textContent'),/saving failed/);
    assert.equal(await page.evaluate('app.capturedPhotos.length'),2);
    await page.evaluate('app.sessionDrafts.deleteDraft()');
    console.log('PASS: homepage examples, IndexedDB refresh/resume/delete, crop/order/decorations recovery, partial capture continuation, all export dimensions, 300-DPI PNG/JPEG metadata, and storage failure recovery.');
}).catch(error=>{console.error(error.stack);process.exitCode=1;});
