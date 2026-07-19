const OVERLAY_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Church Live Caption Overlay</title>
  <style>
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;font-family:"Avenir Next","Segoe UI",Arial,sans-serif}.stage{display:flex;align-items:flex-end;justify-content:center;width:100%;height:100%;padding:clamp(18px,4vw,64px)}.caption{width:min(1500px,100%);border-radius:12px;padding:10px 18px 14px;text-align:center;font-size:48px;font-weight:750;line-height:1.18;text-wrap:balance;text-shadow:0 2px 5px rgba(0,0,0,.68)}
  </style>
</head>
<body>
  <main class="stage"><div class="caption" aria-live="polite"></div></main>
  <script>
    (()=>{
      const caption=document.querySelector(".caption");
      const value=location.hash.slice(1);
      const separator=value.indexOf(".");
      if(separator<1){caption.textContent="This OBS caption link is invalid or expired.";return}
      const session=value.slice(0,separator);
      const token=value.slice(separator+1);
      let attempt=0;
      let stopped=false;
      let lastSequence=0;
      const applyStyle=style=>{
        if(!style)return;
        caption.style.fontSize=Math.max(24,Math.min(96,Number(style.fontSize)||48))+"px";
        caption.style.color=/^#[0-9a-f]{6}$/i.test(style.textColor||"")?style.textColor:"#ffffff";
        caption.style.backgroundColor=/^#[0-9a-f]{6}$/i.test(style.backgroundColor||"")?style.backgroundColor:"#101827";
      };
      const show=event=>{
        if(!event||event.sequence<=lastSequence)return;
        lastSequence=event.sequence;
        caption.textContent=event.publicText||"";
        applyStyle(event.style);
        caption.style.backgroundColor=event.publicText?caption.style.backgroundColor:"transparent";
      };
      const connect=()=>{
        if(stopped)return;
        const scheme=location.protocol==="https:"?"wss:":"ws:";
        const socket=new WebSocket(scheme+"//"+location.host+"/api/live/overlay?session="+encodeURIComponent(session),["church-caption-v1",token]);
        socket.onopen=()=>{attempt=0};
        socket.onmessage=message=>{
          const payload=JSON.parse(String(message.data));
          applyStyle(payload.style);
          show(payload.caption);
        };
        socket.onclose=event=>{
          if(event.code===1000||event.code===1008){stopped=true;caption.textContent=event.code===1008?"This OBS caption link is invalid or expired.":"";return}
          if(attempt>=5){stopped=true;caption.textContent="This OBS caption link is invalid, expired, or unavailable.";return}
          caption.textContent="Caption connection interrupted. Reconnecting…";
          caption.style.backgroundColor="transparent";
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
