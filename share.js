'use strict';
(function(root){
  function mount({document, navigator, URL, prepare, report}) {
    const $=id=>document.getElementById(id), dialog=$('photoDialog');
    let file=null, objectURL=null, token=0;
    function clear(){token++;file=null;if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;$('photoPreview').removeAttribute('src');$('photoPreview').hidden=true;$('photoDownload').hidden=true;$('photoShare').disabled=true;}
    dialog.addEventListener('close',clear);
    $('photoClose').onclick=()=>dialog.close();
    $('photoPrepare').onclick=async()=>{
      clear();const current=token;
      $('photoShare').hidden=false;$('photoMessage').textContent='保存する画像を準備しています…';dialog.showModal();
      try {
        const ready=await prepare();
        if(current!==token||!dialog.open)return;
        if(!ready)throw new Error('No image');
        file=ready;objectURL=URL.createObjectURL(file);
        $('photoPreview').src=objectURL;$('photoPreview').hidden=false;
        $('photoDownload').href=objectURL;$('photoDownload').download=file.name;$('photoDownload').hidden=false;
        let supported=false;
        try{supported=typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});}catch{}
        $('photoShare').hidden=!supported;$('photoShare').disabled=!supported;
        $('photoMessage').textContent=supported
          ? '「共有画面を開く」を押し、「画像を保存」が表示されたら選んでください。表示されない場合は下の画像を長押しして保存メニューをご確認ください。'
          : 'この環境では画像の共有を利用できません。iPhoneのSafariでは下の画像を長押しして保存メニューをご確認ください。';
      }catch{
        if(current===token)$('photoMessage').textContent='画像の準備に失敗しました。画面を閉じ、メモリを空けてからもう一度お試しください。';
      }
    };
    $('photoShare').onclick=async()=>{
      if(!file||$('photoShare').disabled)return;
      const current=token;$('photoShare').disabled=true;
      try{
        // Invoke directly in the click handler: no encoding, timers or awaits
        // before navigator.share(), preserving transient user activation.
        await navigator.share({files:[file]});
        if(current===token){$('photoMessage').textContent='共有画面を閉じました。保存した場合は「写真」アプリでご確認ください。';report('共有画面を閉じました。保存結果は「写真」アプリでご確認ください。');}
      }catch(error){
        if(current===token)$('photoMessage').textContent=error.name==='AbortError'
          ? '共有をキャンセルしました。もう一度共有するか、下の画像を長押しして保存できます。'
          : '共有画面を開けませんでした。画像を長押しして保存するか、Safariでこのページを開き直してください。';
      }finally{if(current===token)$('photoShare').disabled=false;}
    };
  }
  if(typeof module==='object'&&module.exports)module.exports={mount};else root.PhotoExport={mount};
})(typeof globalThis!=='undefined'?globalThis:this);
