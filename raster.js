'use strict';
(function (root) {
  // Cache only touched tiles for one stroke. Canvas readback happens once per
  // tile; row spans use packed RGBA writes and are uploaded once per frame.
  function createSession(ctx, width, height, op, mosaic) {
    const tiles = new Map(), dirty = new Set(), tileSize = 256;
    const fillBytes = new Uint8ClampedArray(4);
    let source, xMap, yMap;
    if (op.effect === 'fill') {
      for (let c = 0; c < 3; c++) fillBytes[c] = parseInt(op.color.slice(1+c*2,3+c*2),16);
      fillBytes[3] = 255;
    } else {
      source = new Uint32Array(mosaic.data.buffer, mosaic.data.byteOffset, mosaic.data.length/4);
      xMap = new Uint32Array(width); yMap = new Uint32Array(height);
      for(let x=0;x<width;x++) xMap[x]=Math.min(mosaic.width-1,Math.floor((x+.5)*mosaic.width/width));
      for(let y=0;y<height;y++) yMap[y]=Math.min(mosaic.height-1,Math.floor((y+.5)*mosaic.height/height))*mosaic.width;
    }
    const fill = new Uint32Array(fillBytes.buffer)[0];
    function tileAt(x,y) {
      const tx=Math.floor(x/tileSize)*tileSize, ty=Math.floor(y/tileSize)*tileSize;
      const key=ty*width+tx;
      let tile=tiles.get(key);
      if(!tile){
        const image=ctx.getImageData(tx,ty,Math.min(tileSize,width-tx),Math.min(tileSize,height-ty));
        tile={x:tx,y:ty,image,values:new Uint32Array(image.data.buffer,image.data.byteOffset,image.data.length/4)};
        tiles.set(key,tile);
      }
      return tile;
    }
    function span(y,start,end) {
      start=Math.max(0,start);end=Math.min(width,end);
      for(let x=start;x<end;){
        const t=tileAt(x,y), right=Math.min(end,t.x+t.image.width);
        const offset=(y-t.y)*t.image.width+x-t.x;
        if(op.effect==='fill')t.values.fill(fill,offset,offset+right-x);
        else for(let gx=x,i=offset;gx<right;gx++,i++)t.values[i]=source[yMap[y]+xMap[gx]];
        dirty.add(t);x=right;
      }
    }
    function paint(x,y,w,h,circle=false) {
      const top=circle?y-h/2:y, bottom=top+h;
      const y0=Math.max(0,Math.ceil(top-.5)),y1=Math.min(height,circle?Math.floor(bottom-.5)+1:Math.ceil(bottom-.5));
      for(let gy=y0;gy<y1;gy++){
        if(circle){
          const square=(w/2)**2-(gy+.5-y)**2;
          if(square<0)continue;
          const half=Math.sqrt(square);
          let left=Math.max(0,Math.ceil(x-half-.5)), right=Math.min(width,Math.floor(x+half-.5)+1);
          // Keep the original inclusive circle predicate at floating-point edges.
          while(left<right&&(left+.5-x)**2+(gy+.5-y)**2>(w/2)**2)left++;
          while(right>left&&(right-.5-x)**2+(gy+.5-y)**2>(w/2)**2)right--;
          span(gy,left,right);
        }else span(gy,Math.ceil(x-.5),Math.ceil(x+w-.5));
      }
    }
    function flush(){for(const t of dirty)ctx.putImageData(t.image,t.x,t.y);dirty.clear();}
    return {paint,flush};
  }
  function paint(ctx,width,height,op,mosaic,x,y,w,h,circle=false){
    const session=createSession(ctx,width,height,op,mosaic);
    session.paint(x,y,w,h,circle);session.flush();
  }
  const api={paint,createSession};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MosaicRaster=api;
})(typeof globalThis!=='undefined'?globalThis:this);
