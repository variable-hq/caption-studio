const OVERLAY_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Church Live Caption Overlay</title>
  <style>
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;font-family:Arial,Helvetica,sans-serif}.stage{display:flex;align-items:flex-end;justify-content:center;width:100%;height:100%;padding:6vh 4vw}.caption{width:min(1500px,100%);padding:10px 18px 14px;text-align:center;font-size:48px;font-weight:750;line-height:1.18;text-wrap:balance;text-shadow:0 2px 5px rgba(0,0,0,.68)}.captionText{border-radius:.18em;padding:.12em .3em .16em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
  </style>
</head>
<body>
  <main class="stage"><div class="caption" aria-live="polite"><span class="captionText"></span></div></main>
  <script>
    (()=>{
      const stage=document.querySelector(".stage");
      const caption=document.querySelector(".caption");
      const captionText=document.querySelector(".captionText");
      const value=location.hash.slice(1);
      const separator=value.indexOf(".");
      if(separator<1){captionText.textContent="This OBS caption link is invalid or expired.";return}
      const session=value.slice(0,separator);
      const token=value.slice(separator+1);
      let attempt=0;
      let stopped=false;
      let lastSequence=0;
      const fontFamilies={"sans-serif":"Arial, Helvetica, sans-serif",serif:"Times New Roman, Times, serif",monospace:"Courier New, Courier, monospace"};
      const withTransparency=(hex,transparency)=>{
        const value=parseInt(hex.slice(1),16);
        const alpha=(100-transparency)/100;
        return "rgba("+(value>>16)+", "+((value>>8)&255)+", "+(value&255)+", "+alpha+")";
      };
      const bounded=(value,minimum,maximum,fallback)=>{
        const number=Number(value);
        return Number.isFinite(number)?Math.max(minimum,Math.min(maximum,Math.round(number))):fallback;
      };
      const clear=()=>{captionText.textContent="";captionText.style.backgroundColor="transparent"};
      const applyStyle=style=>{
        if(!style)return;
        caption.style.fontSize=Math.max(10,Math.min(72,Number(style.fontSize)||48))+"px";
        caption.style.color=/^#[0-9a-f]{6}$/i.test(style.textColor||"")?style.textColor:"#ffffff";
        const background=/^#[0-9a-f]{6}$/i.test(style.backgroundColor||"")?style.backgroundColor:"#101827";
        const transparency=Math.max(0,Math.min(100,Number(style.backgroundTransparency)||0));
        captionText.style.backgroundColor=withTransparency(background,transparency);
        caption.style.textAlign=["left","center","right"].includes(style.horizontalAlign)?style.horizontalAlign:"center";
        caption.style.fontFamily=fontFamilies[style.fontFamily]||fontFamilies["sans-serif"];
        stage.style.alignItems={top:"flex-start",middle:"center",bottom:"flex-end"}[style.verticalAlign]||"flex-end";
        stage.style.padding=bounded(style.verticalMarginPercent,0,20,6)+"vh "+bounded(style.horizontalMarginPercent,0,20,4)+"vw";
      };
      const show=event=>{
        if(!event||event.sequence<=lastSequence)return;
        lastSequence=event.sequence;
        captionText.textContent=event.publicText||"";
        applyStyle(event.style);
        if(!event.publicText)captionText.style.backgroundColor="transparent";
      };
      const connect=()=>{
        if(stopped)return;
        const scheme=location.protocol==="https:"?"wss:":"ws:";
        const socket=new WebSocket(scheme+"//"+location.host+"/api/live/overlay?session="+encodeURIComponent(session),["church-caption-v1",token]);
        socket.onopen=()=>{attempt=0};
        socket.onmessage=message=>{
          const payload=JSON.parse(String(message.data));
          if(payload.type==="clear"){clear();return}
          applyStyle(payload.style);
          if(payload.caption)show(payload.caption);else if(!captionText.textContent)captionText.style.backgroundColor="transparent";
        };
        socket.onclose=event=>{
          if(event.code===1000||event.code===1008){stopped=true;captionText.textContent=event.code===1008?"This OBS caption link is invalid or expired.":"";captionText.style.backgroundColor="transparent";return}
          if(attempt>=5){stopped=true;captionText.textContent="This OBS caption link is invalid, expired, or unavailable.";captionText.style.backgroundColor="transparent";return}
          captionText.textContent="Caption connection interrupted. Reconnecting…";
          captionText.style.backgroundColor="transparent";
          attempt+=1;
          setTimeout(connect,Math.min(10000,1000*2**attempt));
        };
        socket.onerror=()=>socket.close();
      };
      connect();
    })();
  </script>
</body>
</html>`;

export function overlayDocumentResponse() {
  return new Response(OVERLAY_DOCUMENT, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "content-security-policy": "default-src 'none'; connect-src 'self' ws: wss:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors *",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
