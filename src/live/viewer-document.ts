import { localeFromAcceptLanguage, translate, type MessageKey, type UiLocale } from "@/i18n";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character,
  );
}

function viewerDocument(locale: UiLocale) {
  const t = (key: MessageKey) => translate(locale, key);
  const copy = {
    waiting: t("viewer.waiting"),
    live: t("viewer.statusLive"),
    paused: t("viewer.statusPaused"),
    ended: t("viewer.statusEnded"),
    endedText: t("viewer.ended"),
    invalidLink: t("viewer.invalidLink"),
    invalidLinkHelp: t("viewer.invalidLinkHelp"),
    connecting: t("viewer.connecting"),
    reconnecting: t("viewer.reconnecting"),
    linkReplaced: t("viewer.linkReplaced"),
    linkReplacedHelp: t("viewer.linkReplacedHelp"),
    unavailable: t("viewer.unavailable"),
    unavailableHelp: t("viewer.unavailableHelp"),
    connectionFailed: t("viewer.connectionFailed"),
    connectionFailedHelp: t("viewer.connectionFailedHelp"),
    retrying: t("viewer.retrying"),
    liveTranslation: t("viewer.title"),
  };
  const copyScript = JSON.stringify(copy).replace(/</gu, "\\u003c");
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f7f5">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121212">
  <title>${escapeHtml(t("viewer.title"))}</title>
  <style>
    :root{color-scheme:light;--ink:#111111;--muted:#5f5f5b;--line:#d7d7d1;--line-strong:#a9a9a2;--surface:#fff;--page:#f7f7f5;--focus:#111111;--live:#17653a;--paused:#805700;--error:#9b2020;--shadow:0 18px 60px rgba(23,23,20,.07)}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--ink:#f2f2ef;--muted:#a4a49c;--line:#333333;--line-strong:#4a4a4a;--surface:#1b1b1b;--page:#121212;--focus:#f2f2ef;--live:#8fd3ad;--paused:#e8c877;--error:#e07070;--shadow:0 18px 60px rgba(0,0,0,.5)}}:root[data-theme="dark"]{color-scheme:dark;--ink:#f2f2ef;--muted:#a4a49c;--line:#333333;--line-strong:#4a4a4a;--surface:#1b1b1b;--page:#121212;--focus:#f2f2ef;--live:#8fd3ad;--paused:#e8c877;--error:#e07070;--shadow:0 18px 60px rgba(0,0,0,.5)}*{box-sizing:border-box}html,body{min-width:320px;min-height:100%;margin:0;background:var(--page);color:var(--ink);font-family:Inter,"Helvetica Neue",Helvetica,Arial,sans-serif}body{min-height:100svh}.shell{display:grid;grid-template-rows:auto 1fr auto;min-height:100svh;padding:max(20px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left))}.topbar,.footer{width:min(760px,100%);margin-inline:auto}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--line)}.eyebrow{margin:0 0 5px;color:var(--muted);font-size:.75rem;font-weight:750;letter-spacing:.09em;text-transform:uppercase}.topbar h1{margin:0;font-size:clamp(1.25rem,5vw,1.6rem);line-height:1.15}.status{display:inline-flex;align-items:center;gap:7px;min-height:32px;margin:0;padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--muted);font-size:.78rem;font-weight:750;white-space:nowrap}.status::before{width:8px;height:8px;border-radius:50%;background:currentColor;content:""}.status.live{color:var(--live)}.status.paused{color:var(--paused)}.status.error,.status.ended{color:var(--error)}.captionStage{display:flex;align-items:center;justify-content:center;width:min(760px,100%);margin-inline:auto;padding:clamp(34px,10vh,96px) 0}.captionCard{width:100%;padding:clamp(24px,7vw,52px);border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:var(--shadow)}.language{min-height:1.2em;margin:0 0 18px;color:var(--muted);font-size:.8rem;font-weight:750;letter-spacing:.07em;text-transform:uppercase}.caption{min-height:4.2em;margin:0;font-size:clamp(1.7rem,8vw,3.25rem);font-weight:720;letter-spacing:-.025em;line-height:1.3;overflow-wrap:anywhere;text-wrap:pretty}.placeholder{color:var(--muted);font-weight:560}.footer{padding-top:17px;border-top:1px solid var(--line);color:var(--muted);font-size:.84rem;line-height:1.45}.footer p{margin:0}@media (max-width:480px){.topbar{align-items:stretch;flex-direction:column}.status{align-self:flex-start}.captionCard{border-radius:14px}}
  </style>
  <style>
    .placeholder{color:var(--muted)}
    .readingControls{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;color:var(--ink)}
    .readingControls label{font-weight:700}
    select,button{min-height:44px;max-width:100%;padding:8px 12px;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--ink);font:inherit}
    select:focus-visible,button:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
    button{cursor:pointer}button[hidden]{display:none}
    .caption[data-size="large"]{font-size:clamp(2.1rem,10vw,4rem)}
    .caption[data-size="extra-large"]{font-size:clamp(2.5rem,12vw,4.75rem)}
    .footer p+p{margin-top:6px}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div><p class="eyebrow">Caption Studio</p><h1>${escapeHtml(t("viewer.title"))}</h1></div>
      <p class="status" role="status" aria-live="polite">${escapeHtml(t("viewer.connecting"))}</p>
    </header>
    <section class="captionStage" aria-label="${escapeHtml(t("viewer.captionLabel"))}">
      <div class="captionCard">
        <p class="language" aria-live="polite"></p>
        <p class="caption placeholder" aria-live="polite" aria-atomic="true">${escapeHtml(t("viewer.waiting"))}</p>
      </div>
    </section>
    <footer class="footer">
      <div class="readingControls">
        <label for="caption-size">${escapeHtml(t("viewer.textSize"))}</label>
        <select id="caption-size"><option value="standard">${escapeHtml(t("viewer.sizeStandard"))}</option><option value="large">${escapeHtml(t("viewer.sizeLarge"))}</option><option value="extra-large">${escapeHtml(t("viewer.sizeExtraLarge"))}</option></select>
        <button type="button" id="reconnect" hidden>${escapeHtml(t("viewer.reconnect"))}</button>
      </div>
      <p>${escapeHtml(t("viewer.footerErrors"))}</p>
      <p>${escapeHtml(t("viewer.footerShrink"))}</p>
      <p>${escapeHtml(t("viewer.footerMirror"))}</p>
    </footer>
  </main>
  <script>
    (()=>{
      const copy=${copyScript};
      const status=document.querySelector(".status");
      const caption=document.querySelector(".caption");
      const language=document.querySelector(".language");
      const textSize=document.querySelector("#caption-size");
      const reconnect=document.querySelector("#reconnect");
      textSize.onchange=()=>{caption.dataset.size=textSize.value;fit()};
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
      const card=document.querySelector(".captionCard");
      let empty=true;
      // A long chunk must still fit one phone screen: shrink from the chosen size down to 18px.
      const fit=()=>{
        if(!caption.style)return;
        caption.style.fontSize="";
        if(empty||typeof getComputedStyle!=="function"||typeof innerHeight!=="number"||!card.getBoundingClientRect)return;
        const limit=innerHeight-card.getBoundingClientRect().top-16;
        let size=parseFloat(getComputedStyle(caption).fontSize)||0;
        for(let step=0;step<24&&size>18&&card.getBoundingClientRect().height>limit;step++){size=Math.max(18,size*.92);caption.style.fontSize=size+"px"}
      };
      if(typeof addEventListener==="function")addEventListener("resize",fit);
      const clear=(text=copy.waiting)=>{caption.textContent=text;caption.classList.add("placeholder");caption.removeAttribute("lang");language.textContent="";empty=true;fit()};
      const show=event=>{
        if(!event||!Number.isSafeInteger(event.sequence)||event.sequence<=lastSequence)return;
        lastSequence=event.sequence;
        caption.textContent=typeof event.publicText==="string"?event.publicText:"";
        empty=!caption.textContent;
        caption.classList.toggle("placeholder",empty);
        language.textContent=labels[event.targetLanguage]||copy.liveTranslation;
        if(typeof event.targetLanguage==="string")caption.lang=event.targetLanguage;
        fit();
      };
      const state=payload=>{
        if(payload.status==="live"){setStatus(copy.live,"live");return}
        if(payload.status==="paused"){setStatus(copy.paused,"paused");return}
        if(payload.status==="idle"){stopped=true;setStatus(copy.ended,"ended");clear(copy.endedText)}
      };
      if(channel!=="main"||!/^[A-Za-z0-9_-]{43}$/.test(token)){
        stopped=true;setStatus(copy.invalidLink,"error");clear(copy.invalidLinkHelp);return;
      }
      const connect=()=>{
        if(stopped)return;
        setStatus(attempt?copy.reconnecting:copy.connecting,attempt?"paused":"");
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
          if(event.code===4002){stopped=true;setStatus(copy.ended,"ended");clear(copy.endedText);return}
          if(event.code===4003){stopped=true;setStatus(copy.linkReplaced,"error");clear(copy.linkReplacedHelp);return}
          if(event.code===1000||event.code===1008){stopped=true;setStatus(copy.unavailable,"error");clear(copy.unavailableHelp);return}
          if(attempt>=8){stopped=true;setStatus(copy.connectionFailed,"error");clear(copy.connectionFailedHelp);reconnect.hidden=false;return}
          attempt+=1;
          setStatus(copy.retrying,"paused");
          setTimeout(connect,Math.min(30000,1000*2**attempt));
        };
        socket.onerror=()=>socket.close();
      };
      connect();
    })();
  </script>
</body>
</html>`;
}

export function viewerDocumentResponse(request?: Request) {
  const locale = localeFromAcceptLanguage(request?.headers.get("accept-language"));
  return new Response(viewerDocument(locale), {
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
