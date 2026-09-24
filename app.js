'use strict';
(() => {
  const VERSION = 'v1.0.2';
  const $ = id => document.getElementById(id);
  document.title = `画像モザイク工房 ${VERSION}`;
  $('version').textContent = VERSION;
  const canvas = $('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const overlay = $('overlay'), oc = overlay.getContext('2d');
  const original = document.createElement('canvas');
  let loaded = false, busy = false, fileName = '', commands = [], position = 0, active = null, pixels = null, pointerId = null;
  let raster = null, frame = 0, cursorPoint = null, previewBox = null;
  const status = message => { $('status').textContent = message; };
  function sync() {
    $('undo').disabled = !loaded || busy || position === 0;
    $('redo').disabled = !loaded || busy || position === commands.length;
    $('reset').disabled = !loaded || busy || !position;
    $('controls').disabled = !loaded || busy;
    $('zoom').disabled = !loaded || busy;
    $('open').disabled = busy;
    $('historyInfo').textContent = `${position} 操作`;
  }
  function layout() {
    if (!loaded) return;
    const viewport = $('viewport'), pad = innerWidth <= 800 ? 24 : 48;
    const scale = $('zoom').value === 'fit' ? Math.min(1, (viewport.clientWidth - pad) / canvas.width, (viewport.clientHeight - pad) / canvas.height) : +$('zoom').value;
    $('stage').style.width = `${Math.max(1, canvas.width * scale)}px`;
    $('stage').style.height = `${Math.max(1, canvas.height * scale)}px`;
  }
  function settings() {
    return { effect: $('effect').value, tool: $('tool').value, shape: $('shape').value, size: +$('size').value, pixel: +$('pixel').value, color: $('color').value, points: [] };
  }
  function makePixels(op) {
    if (op.effect !== 'mosaic') return null;
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.ceil(canvas.width / op.pixel));
    small.height = Math.max(1, Math.ceil(canvas.height / op.pixel));
    const sc = small.getContext('2d');
    sc.imageSmoothingEnabled = true;
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(canvas, 0, 0, small.width, small.height);
    return sc.getImageData(0, 0, small.width, small.height);
  }
  function paint(op, x, y, w, h, circle = false) {
    if (!raster) raster = MosaicRaster.createSession(ctx, canvas.width, canvas.height, op, pixels);
    raster.paint(x, y, w, h, circle);
  }

  function dab(op, p) {
    if (op.shape === 'circle') paint(op, p.x, p.y, op.size, op.size, true);
    else paint(op, p.x - op.size / 2, p.y - op.size / 2, op.size, op.size);
  }
  function segment(op, a, b) {
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, op.size / 4)));
    for (let i = 1; i <= count; i++) dab(op, {x:a.x + (b.x-a.x)*i/count, y:a.y+(b.y-a.y)*i/count});
  }
  function rectangle(op) {
    const a = op.points[0], b = op.points[op.points.length - 1];
    paint(op, Math.floor(Math.min(a.x,b.x)), Math.floor(Math.min(a.y,b.y)), Math.max(1,Math.ceil(Math.abs(a.x-b.x))), Math.max(1,Math.ceil(Math.abs(a.y-b.y))));
  }
  function redraw() {
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(original,0,0);
    for (let i=0;i<position;i++) {
      const op=commands[i]; pixels=makePixels(op);raster=null;
      if (op.tool==='rect') rectangle(op);
      else {dab(op,op.points[0]); for(let j=1;j<op.points.length;j++) segment(op,op.points[j-1],op.points[j]);}
      if(raster)raster.flush();raster=null;
    }
    pixels=null; sync();
  }
  async function read(file) {
    if (!file || busy) return;
    if (active) finish(false);
    if (!/\.(png|jpe?g|webp)$/i.test(file.name) || !['image/png','image/jpeg','image/webp',''].includes(file.type)) { status('PNG・JPEG・WebPの画像を選んでください。'); return; }
    if (file.size > 50*1024*1024) { status('50 MB以下の画像を選んでください。'); return; }
    if (position && !confirm('新しい画像を開くと現在の編集内容が消えます。必要な画像は保存しましたか？')) return;
    busy=true;sync();status('画像を読み込んでいます…');
    const url=URL.createObjectURL(file);
    try {
      const image=new Image(); image.src=url; await image.decode();
      const w=image.naturalWidth,h=image.naturalHeight;
      if (!w || !h || w*h>50000000 || Math.max(w,h)>16000) throw new Error('画像は5,000万画素以下・各辺16,000 px以下にしてください。');
      original.width=w; original.height=h; original.getContext('2d').drawImage(image,0,0);
      canvas.width=overlay.width=w;canvas.height=overlay.height=h;
      commands=[];position=0;loaded=true;fileName=file.name;
      $('empty').hidden=true; $('stage').hidden=false; $('zoom').value='fit';
      $('imageInfo').textContent=`${file.name} · ${w.toLocaleString()} × ${h.toLocaleString()} px`;
      redraw();layout();status('クリック・ドラッグで加工できます。画像は外部へ送信されません。');
    } catch(error) { status(error.message.startsWith('画像は') ? error.message : '画像を読み込めませんでした。対応形式やファイルの破損、メモリ不足を確認してください。'); }
    finally { URL.revokeObjectURL(url);busy=false;sync();$('file').value=''; }
  }
  function point(event) {
    const r=overlay.getBoundingClientRect();
    return {x:Math.max(0,Math.min(canvas.width,(event.clientX-r.left)*canvas.width/r.width)), y:Math.max(0,Math.min(canvas.height,(event.clientY-r.top)*canvas.height/r.height))};
  }
  function clearPreview() {
    if(previewBox)oc.clearRect(...previewBox);
    previewBox=null;
  }
  function preview(p) {
    clearPreview();
    const op=active||settings(); const scale=canvas.width/overlay.getBoundingClientRect().width;
    oc.lineWidth=scale;oc.strokeStyle='#ffffff';oc.setLineDash([5*scale,4*scale]);oc.beginPath();
    if (active && op.tool==='rect') {const a=op.points[0];oc.rect(a.x,a.y,p.x-a.x,p.y-a.y);}
    else if(op.tool==='brush') {if(op.shape==='circle')oc.arc(p.x,p.y,op.size/2,0,Math.PI*2);else oc.rect(p.x-op.size/2,p.y-op.size/2,op.size,op.size);}
    oc.stroke();oc.strokeStyle='#302138';oc.lineDashOffset=5*scale;oc.stroke();
    const margin=3*scale;
    if(active&&op.tool==='rect'){
      const a=op.points[0];previewBox=[Math.min(a.x,p.x)-margin,Math.min(a.y,p.y)-margin,Math.abs(p.x-a.x)+2*margin,Math.abs(p.y-a.y)+2*margin];
    }else previewBox=[p.x-op.size/2-margin,p.y-op.size/2-margin,op.size+2*margin,op.size+2*margin];
  }
  let drawnPoints=0;
  function flushFrame() {
    if(frame){cancelAnimationFrame(frame);frame=0;}
    if(active&&active.tool==='brush'){
      if(drawnPoints===0&&active.points.length){dab(active,active.points[0]);drawnPoints=1;}
      while(drawnPoints<active.points.length){segment(active,active.points[drawnPoints-1],active.points[drawnPoints]);drawnPoints++;}
    }
    if(raster)raster.flush();
    if(cursorPoint)preview(cursorPoint);
  }
  function schedule(p){cursorPoint=p;if(!frame)frame=requestAnimationFrame(flushFrame);}
  overlay.addEventListener('pointerdown',e=>{
    if(!loaded||busy||active||e.button!==0)return;
    if(position>=500){status('操作は500回までです。保存してから画像を開き直してください。');return;}
    e.preventDefault();pointerId=e.pointerId;overlay.setPointerCapture(pointerId);
    active=settings();active.points.push(point(e));pixels=makePixels(active);raster=null;drawnPoints=0;
    schedule(point(e));
  });
  overlay.addEventListener('pointermove',e=>{
    if(!loaded||busy)return;
    if(active && e.pointerId!==pointerId)return;
    const p=point(e);
    if(active){
      if(active.tool==='brush') {const last=active.points[active.points.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>=Math.max(1,active.size/8)){active.points.push(p);}}
      else active.points[1]=p;
    }
    schedule(p);
  });
  function finish(commit) {
    if(!active)return;
    if(commit){flushFrame();if(active.tool==='rect'){rectangle(active);if(raster)raster.flush();}commands=commands.slice(0,position);commands.push(active);position++;}
    if(frame){cancelAnimationFrame(frame);frame=0;}
    active=null;pixels=null;raster=null;cursorPoint=null;
    if(pointerId!==null&&overlay.hasPointerCapture(pointerId))overlay.releasePointerCapture(pointerId);
    pointerId=null;clearPreview();
    if(!commit)redraw();sync();
  }
  overlay.addEventListener('pointerup',e=>{if(active&&e.pointerId===pointerId){const p=point(e);if(active.tool==='brush'){active.points.push(p);}else active.points[1]=p;finish(true);}});
  overlay.addEventListener('pointercancel',()=>finish(false));
  overlay.addEventListener('lostpointercapture',()=>{if(active)finish(false);});
  overlay.addEventListener('pointerleave',()=>{if(!active){cursorPoint=null;clearPreview();}});
  function undo(){if(active)finish(false);if(position&&!busy){position--;redraw();status('ひとつ前の状態に戻しました。');}}
  function redo(){if(active)finish(false);if(position<commands.length&&!busy){position++;redraw();status('操作をやり直しました。');}}
  $('undo').onclick=undo;$('redo').onclick=redo;
  $('reset').onclick=()=>{if(confirm('加工をすべて取り消し、元画像に戻しますか？')){commands=[];position=0;redraw();status('元画像に戻しました。');}};
  $('open').onclick=()=>$('file').click();$('file').onchange=e=>{const file=e.target.files[0];e.target.value='';read(file);};
  ['dragenter','dragover'].forEach(type=>document.addEventListener(type,e=>{e.preventDefault();$('viewport').classList.add('dragover');}));
  document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('viewport').classList.remove('dragover');});
  document.addEventListener('drop',e=>{e.preventDefault();$('viewport').classList.remove('dragover');if(e.dataTransfer.files.length>1){status('画像は1枚ずつ読み込んでください。');return;}read(e.dataTransfer.files[0]);});
  $('effect').onchange=()=>{$('mosaicOptions').hidden=$('effect').value!=='mosaic';$('fillOptions').hidden=$('effect').value!=='fill';};
  $('tool').onchange=()=>{$('brushOptions').hidden=$('tool').value!=='brush';};
  for(const id of ['size','pixel'])$(id).oninput=()=>$(id+'Value').textContent=`${$(id).value} px`;
  $('zoom').onchange=layout;window.addEventListener('resize',layout);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){finish(false);return;}if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}});
  $('save').onclick=async()=>{
    if(!loaded||busy)return;finish(true);busy=true;sync();status('保存用の画像を作成しています…');
    try {
      const format=$('format').value;let source=canvas;
      if(format==='jpeg'){source=document.createElement('canvas');source.width=canvas.width;source.height=canvas.height;const sc=source.getContext('2d');sc.fillStyle='#fff';sc.fillRect(0,0,source.width,source.height);sc.drawImage(canvas,0,0);}
      const blob=await new Promise(resolve=>source.toBlob(resolve,`image/${format}`,0.95));
      if(!blob)throw new Error('encode');
      const stem=fileName.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80)||'image';
      const name=`${stem}_edited.${format==='jpeg'?'jpg':'png'}`;
      const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      status(`「${name}」のダウンロードを開始しました。保存先はブラウザのダウンロード設定をご確認ください。`);
    }catch{status('画像を保存できませんでした。メモリを空けてから再度お試しください。');}
    finally{busy=false;sync();}
  };
  window.addEventListener('beforeunload',e=>{if(position){e.preventDefault();e.returnValue='';}});
})();
