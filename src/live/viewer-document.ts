const VIEWER_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#f4f4f0">
  <title>Live Translation</title>
  <style>
    :root{color-scheme:light;--ink:#171714;--muted:#686862;--line:#d8d8d0;--surface:#fff;--page:#f4f4f0;--live:#17653a;--paused:#805700;--error:#9d2525}*{box-sizing:border-box}html,body{min-width:320px;min-height:100%;margin:0;background:var(--page);color:var(--ink);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{min-height:100svh}.shell{display:grid;grid-template-rows:auto 1fr auto;min-height:100svh;padding:max(20px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left))}.topbar,.footer{width:min(760px,100%);margin-inline:auto}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--line)}.eyebrow{margin:0 0 5px;color:var(--muted);font-size:.75rem;font-weight:750;letter-spacing:.09em;text-transform:uppercase}.topbar h1{margin:0;font-size:clamp(1.25rem,5vw,1.6rem);line-height:1.15}.status{display:inline-flex;align-items:center;gap:7px;min-height:32px;margin:0;padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--muted);font-size:.78rem;font-weight:750;white-space:nowrap}.status::before{width:8px;height:8px;border-radius:50%;background:currentColor;content:""}.status.live{color:var(--live)}.status.paused{color:var(--paused)}.status.error,.status.ended{color:var(--error)}.captionStage{display:flex;align-items:center;justify-content:center;width:min(760px,100%);margin-inline:auto;padding:clamp(34px,10vh,96px) 0}.captionCard{width:100%;padding:clamp(24px,7vw,52px);border:1px solid var(--line);border-radius:24px;background:var(--surface);box-shadow:0 18px 60px rgba(23,23,20,.07)}.language{min-height:1.2em;margin:0 0 18px;color:var(--muted);font-size:.8rem;font-weight:750;letter-spacing:.07em;text-transform:uppercase}.caption{min-height:4.2em;margin:0;font-size:clamp(1.7rem,8vw,3.25rem);font-weight:720;letter-spacing:-.025em;line-height:1.3;overflow-wrap:anywhere;text-wrap:pretty}.placeholder{color:#85857e;font-weight:560}.footer{padding-top:17px;border-top:1px solid var(--line);color:var(--muted);font-size:.84rem;line-height:1.45}.footer p{margin:0}@media (max-width:480px){.topbar{align-items:stretch;flex-direction:column}.status{align-self:flex-start}.captionCard{border-radius:18px}}
  </style>
  <style>
    .placeholder{color:var(--muted)}
    .readingControls{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;color:var(--ink)}
    .readingControls label{font-weight:700}
    select,button{min-height:44px;max-width:100%;padding:8px 12px;border:1px solid #85857e;border-radius:8px;background:var(--surface);color:var(--ink);font:inherit}
    select:focus-visible,button:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
    button{cursor:pointer}button[hidden]{display:none}
    .caption[data-size="large"]{font-size:clamp(2.1rem,10vw,4rem)}
    .caption[data-size="extra-large"]{font-size:clamp(2.5rem,12vw,4.75rem)}
    .footer p+p{margin-top:6px}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div><p class="eyebrow">Church Live Caption</p><h1>Live translation</h1></div>
      <p class="status" role="status" aria-live="polite">Connecting</p>
    </header>
    <section class="captionStage" aria-label="Current translated caption">
      <div class="captionCard">
        <p class="language" aria-live="polite"></p>
        <p class="caption placeholder" aria-live="polite" aria-atomic="true">Waiting for the live translation…</p>
      </div>
    </section>
    <footer class="footer">
      <div class="readingControls">
        <label for="caption-size">Text size</label>
        <select id="caption-size"><option value="standard">Standard</option><option value="large">Large</option><option value="extra-large">Extra large</option></select>
        <button type="button" id="reconnect" hidden>Reconnect</button>
      </div>
      <p>Automatic translation may contain errors.</p>
      <p>Only the latest public translation appears here. No transcript is stored.</p>
    </footer>
  </main>
  <script>
    (()=>{
      const status=document.querySelector(".status");
      const caption=document.querySelector(".caption");
      const language=document.querySelector(".language");
      const textSize=document.querySelector("#caption-size");
      const reconnect=document.querySelector("#reconnect");
      textSize.onchange=()=>{caption.dataset.size=textSize.value};
      reconnect.onclick=()=>location.reload();
      const labels={en:"English",id:"Indonesian",ja:"Japanese","ko-KR":"Korean","tl-PH":"Tagalog","zh-Hans":"Chinese (Simplified)","zh-Hant":"Chinese (Traditional)",vi:"Vietnamese"};
      const value=location.hash.slice(1);
      const separator=value.indexOf(".");
      const channel=separator>0?value.slice(0,separator):"";
      const token=separator>0?value.slice(separator+1):"";
      let attempt=0;
      let stopped=false;
      let lastSequence=0;
      const setStatus=(text,state)=>{status.textContent=text;status.className="status"+(state?" "+state:"")};
      const clear=(text="Waiting for the live translation…")=>{caption.textContent=text;caption.classList.add("placeholder");caption.removeAttribute("lang");language.textContent=""};
      const show=event=>{
        if(!event||!Number.isSafeInteger(event.sequence)||event.sequence<=lastSequence)return;
        lastSequence=event.sequence;
        caption.textContent=typeof event.publicText==="string"?event.publicText:"";
        caption.classList.toggle("placeholder",!caption.textContent);
        language.textContent=labels[event.targetLanguage]||"Live translation";
        if(typeof event.targetLanguage==="string")caption.lang=event.targetLanguage;
      };
      const state=payload=>{
        if(payload.status==="live"){setStatus("Live","live");return}
        if(payload.status==="paused"){setStatus("Paused","paused");return}
        if(payload.status==="idle"){stopped=true;setStatus("Service ended","ended");clear("This live translation has ended.")}
      };
      if(channel!=="main"||!/^[A-Za-z0-9_-]{43}$/.test(token)){
        stopped=true;setStatus("Invalid link","error");clear("Ask the operator for the current mobile viewer link.");return;
      }
      const connect=()=>{
        if(stopped)return;
        setStatus(attempt?"Reconnecting":"Connecting",attempt?"paused":"");
        const scheme=location.protocol==="https:"?"wss:":"ws:";
        const socket=new WebSocket(scheme+"//"+location.host+"/api/live/viewer?channel="+encodeURIComponent(channel),["church-caption-viewer-v1",token]);
        socket.onmessage=message=>{
          let payload;
          try{payload=JSON.parse(String(message.data))}catch{return}
          if(payload.type==="clear"){clear();return}
          if(payload.type==="state"){state(payload);return}
          if(payload.type==="caption"){show(payload.caption);return}
          if(payload.type==="ready"){
            attempt=0;
            state(payload);
            if(payload.caption)show(payload.caption);else clear();
          }
        };
        socket.onclose=event=>{
          if(event.code===4002){stopped=true;setStatus("Service ended","ended");clear("This live translation has ended.");return}
          if(event.code===4003){stopped=true;setStatus("Link replaced","error");clear("Ask the operator for the new mobile viewer link.");return}
          if(event.code===1000||event.code===1008){stopped=true;setStatus("Unavailable","error");clear("This viewer link is unavailable.");return}
          if(attempt>=8){stopped=true;setStatus("Connection failed","error");clear("Check your connection, then reconnect or ask the operator for the current link.");reconnect.hidden=false;return}
          attempt+=1;
          setStatus("Connection lost · retrying","paused");
          setTimeout(connect,Math.min(30000,1000*2**attempt));
        };
        socket.onerror=()=>socket.close();
      };
      connect();
    })();
  </script>
</body>
</html>`;

export function viewerDocumentResponse() {
  return new Response(VIEWER_DOCUMENT, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; connect-src 'self' ws: wss:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-resource-policy": "same-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
