import { QA_VIEWPORT_WIDTHS, SETTINGS_SECTIONS, openScreen, openSettings } from "./dashboard-helpers.mjs";
// Local synthetic UI checks. No provider calls or external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const tooling = process.env.CAPTION_QA_TOOLS_DIR;
assert.ok(tooling, 'Set CAPTION_QA_TOOLS_DIR to the isolated browser QA installation.');
const { chromium } = await import(pathToFileURL(path.join(tooling, 'node_modules/playwright/index.mjs')));
const { default: AxeBuilder } = await import(pathToFileURL(path.join(tooling, 'node_modules/@axe-core/playwright/dist/index.mjs')));
const output=path.resolve('test-results/operator');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const results=[];
try {
 for (const width of QA_VIEWPORT_WIDTHS) {
  const context=await browser.newContext({viewport:{width,height:width>500?1080:844},permissions:['microphone'],reducedMotion:'reduce'});
  const page=await context.newPage();
  if(process.env.CAPTION_QA_STUB_MIC){
   // Opt-in for machines where headless Chromium's fake capture device never resolves:
   // a synthetic tone stands in for the microphone. Off by default.
   await context.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{
     const audio=new AudioContext();const tone=audio.createOscillator();const sink=audio.createMediaStreamDestination();
     tone.connect(sink);tone.start();return sink.stream;
    };
   });
  }
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const violations=[];
  let status='idle';let startedAt=null;let expiresAt=null;let transcriptionRequests=0;let inferenceCalls=0;
  let style={fontSize:48,textColor:'#ffffff',backgroundColor:'#101827',backgroundTransparency:0,horizontalMarginPercent:4,verticalMarginPercent:6,horizontalAlign:'center',verticalAlign:'bottom',fontFamily:'sans-serif'};
  const health={status:'ready',hosting:'cloudflare',access:{ready:true,provider:'Cloudflare Access'},transcription:{ready:true,model:'whisper-large-v3-turbo'},translation:{ready:true,model:'openai/gpt-oss-20b'}};
  const emptyUsage={promptTokens:0,completionTokens:0,totalTokens:0,translationRequests:0,providerRateLimit:null};
  const controls=[];
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='http://127.0.0.1:3100') return route.abort();
   if(!url.pathname.startsWith('/api/')) return route.continue();
   const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
   let body={};try{body=request.postDataJSON()??{}}catch{}
   let payload={};
   if(path==='/api/ai/health'||path==='/api/ai/readiness')payload=health;
   else if(path==='/api/live/experience/preferences'||path==='/api/live/experience/setup')payload=method==='GET'?{version:1,theme:'system',translationSystemPrompt:null,summaryDefaults:null,captionStyle:null,translationDefaults:null,updatedAt:null}:{...body,version:1,updatedAt:Date.now()};
   else if(path==='/api/live/channel')payload={channelId:'main',configured:true,status,overlayUrl:'http://127.0.0.1:3100/overlay#main.'+'o'.repeat(43),style,startedAt,expiresAt,transcriptionRequests,llmUsage:emptyUsage,translationRevision:0};
   else if(path==='/api/live/channel/style'){style=body.style;payload={ok:true}}
   else if(path==='/api/live/channel/service'&&method==='POST'){
    status='live';startedAt=new Date().toISOString();expiresAt=new Date(Date.now()+90*60000).toISOString();
    payload={channelId:'main',controllerToken:'c'.repeat(43),viewerUrl:'http://127.0.0.1:3100/view#main.'+'v'.repeat(43),startedAt,expiresAt,translationRevision:0};
   } else if(path==='/api/live/channel/service'&&method==='DELETE'){status='idle';startedAt=null;expiresAt=null;payload={ok:true}}
   else if(path==='/api/live/channel/control'){
    controls.push(body.action);if(body.action==='pause')status='paused';if(body.action==='resume')status='live';
    payload={action:body.action,status,translationRevision:0,sequence:1};
   } else if(path==='/api/live/channel/observer'&&method==='POST'){
    // A second tab of the same workspace watches the running service read-only.
    payload={channelId:'main',serviceId:'11111111-1111-1111-1111-111111111111',saveHistory:false,
     controllerLabel:'operator@example.test',status:status==='paused'?'paused':'live',
     observerToken:'w'.repeat(43),viewerUrl:'http://127.0.0.1:3100/view#main.'+'w'.repeat(43),
     startedAt,expiresAt,translationRevision:0};
   } else if(path==='/api/live/channel/lease')payload={valid:true,status:'live',expiresAt,transcriptionRequests:++transcriptionRequests,translationRevision:0};
   else if(path==='/api/ai/transcribe'){inferenceCalls++;payload={segments:[]};}
   else if(path==='/api/live/experience/usage')payload={records:[],next:null};
   else if(path==='/api/live/experience/history')payload={services:[]};
   else {errors.push('Unexpected mocked request: '+method+' '+path);return route.fulfill({status:400,json:{error:'Unexpected test request'}})}
   await route.fulfill({status:200,json:payload});
  });
  await page.goto('http://127.0.0.1:3100');
  await page.getByText('Ready to go',{exact:true}).waitFor();
  const check=async screen=>{
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${screen} overflow`);
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   violations.push(...axe.violations.map(x=>({screen,id:x.id,impact:x.impact,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
  };
  // The pinned live control bar must never hide the lowest control on the page.
  const barClear=async screen=>{
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const geometry=await page.evaluate(()=>{
    const bar=document.querySelector('.liveControlBar')?.getBoundingClientRect();
    const controls=[...document.querySelectorAll('main button, main a, main select, main input')].filter(el=>el.getClientRects().length&&!el.closest('details:not([open]) > :not(summary)'));
    const lowest=controls.reduce((a,b)=>b.getBoundingClientRect().bottom>a.getBoundingClientRect().bottom?b:a,controls[0]);
    return {lowest:Math.round(lowest.getBoundingClientRect().bottom),barTop:bar?Math.round(bar.top):Infinity,what:lowest.textContent.trim().slice(0,40)};
   });
   assert.ok(geometry.lowest<=geometry.barTop,`${width}/${screen}: live control bar covers the lowest control ${JSON.stringify(geometry)}`);
   await page.evaluate(()=>window.scrollTo(0,0));
  };

  // Idle: one Start, a ready checklist, no live controls, no inference.
  await check('live-idle');
  assert.equal(await page.getByRole('button',{name:'Start captions',exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('region',{name:'Live controls'}).count(),0);
  assert.equal(await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).isChecked(),false);
  await page.screenshot({path:output+`/live-idle-${width}.png`,fullPage:true});

  for(const section of SETTINGS_SECTIONS){
   await openSettings(page,section);
   await check(`settings-${section}`);
   if(section==='look'){
    const range=page.locator('input[type=range]').first();
    await range.fill('64');
    await range.dispatchEvent('input');
    assert.ok((await page.getByTestId('caption-preview').first().getAttribute('style')).includes('64px'));
    await page.screenshot({path:output+`/settings-look-${width}.png`,fullPage:true});
   }
   if(section==='obs') assert.equal(await page.getByRole('button',{name:'Copy OBS link',exact:true}).isVisible(),true);
   if(section==='translator'){
    assert.equal(await page.getByTestId('inference-level').isVisible(),true);
   }
   if(section==='usage') assert.equal(await page.getByText('Translation service headroom',{exact:true}).isVisible(),true);
   if(section==='words'){
    await page.locator('input[name="word"]').fill('synthetic-hidden');
    await page.locator('select[name="wordAction"]').selectOption('hide');
    await page.getByRole('button',{name:'Add word',exact:true}).click();
    await page.getByRole('cell',{name:'synthetic-hidden',exact:true}).waitFor();
    await page.getByRole('button',{name:'Remove synthetic-hidden',exact:true}).click();
    assert.equal(await page.getByRole('cell',{name:'synthetic-hidden',exact:true}).count(),0);
   }
  }
  await openScreen(page,'Sermons'); await check('sermons');
  await page.getByRole('link',{name:'Help',exact:true}).click();
  await page.getByRole('heading',{name:'How it works',exact:true}).waitFor(); await check('help');

  // Each screen has its own address: Back, Forward and reload keep the operator in place,
  // and unsaved drafts survive moving between screens.
  await openSettings(page,'languages');
  await page.getByTestId('target-language').selectOption('ja');
  await openScreen(page,'Live');
  assert.equal(new URL(page.url()).hash,'#live');
  await page.goBack();
  await page.getByTestId('target-language').waitFor();
  assert.equal(await page.getByTestId('target-language').inputValue(),'ja');
  await page.goForward();
  await page.getByText('Ready to go',{exact:true}).waitFor();
  await openSettings(page,'look');
  await page.reload();
  await page.getByRole('heading',{name:'Caption look',exact:true}).waitFor();
  // Old sidebar bookmarks land on the matching screen.
  await page.goto('http://127.0.0.1:3100/#workspace=history');
  await page.getByRole('heading',{name:'Sermons',exact:true}).waitFor();
  assert.equal(inferenceCalls,0,'Navigation and reload must not invoke inference');

  // Start, pause, clear, end.
  await openScreen(page,'Live');
  await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).check();
  await openSettings(page,'computer');
  await openScreen(page,'Live');
  assert.equal(await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).isChecked(),true,'Consent survives moving between screens');
  await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).uncheck();
  await page.getByRole('button',{name:'Start captions',exact:true}).click();
  const liveControls=page.getByRole('region',{name:'Live controls'});
  await liveControls.getByRole('button',{name:'Pause',exact:true}).waitFor();
  assert.equal(status,'live');
  await check('live-running');
  await barClear('live-running');
  await page.screenshot({path:output+`/live-running-${width}.png`,fullPage:true});
  // Moving to Settings and back never pauses or clears capture.
  const controlsBefore=controls.length;
  await openSettings(page,'usage');
  await openScreen(page,'Live');
  assert.equal(controls.length,controlsBefore);

  if(width===1920){
   // A second tab watches the running service: it names the operator and offers Take over, not Start.
   const other=await context.newPage();
   await other.goto('http://127.0.0.1:3100/#live');
   await other.getByText('operator@example.test is running captions on another computer.',{exact:true}).waitFor();
   assert.equal(await other.getByRole('button',{name:'Take over',exact:true}).count(),1);
   assert.equal(await other.getByRole('button',{name:'Start captions',exact:true}).isDisabled(),true);
   assert.equal(controls.length,controlsBefore);
   await other.close();
  }

  await liveControls.getByRole('button',{name:'Pause',exact:true}).click();
  await liveControls.getByRole('button',{name:'Resume',exact:true}).waitFor();
  assert.ok(controls.includes('pause'));
  await check('live-paused');
  await liveControls.getByRole('button',{name:'Resume',exact:true}).click();
  await liveControls.getByRole('button',{name:'Pause',exact:true}).waitFor();

  // A language change during a service waits for Apply now; Undo restores the running setup.
  await openSettings(page,'languages');
  await page.getByTestId('target-language').selectOption('ja');
  await openScreen(page,'Live');
  await page.getByText('Your changes aren’t in use yet.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Undo changes',exact:true}).click();
  await page.getByText('Your changes aren’t in use yet.',{exact:true}).waitFor({state:'hidden'});

  // Quick fixes during the service.
  await page.locator('input[name="quickBlockTerm"]').fill('synthetic-block-term');
  await page.getByRole('button',{name:'Hide captions with it',exact:true}).click();
  assert.equal(await page.getByText('synthetic-block-term',{exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'Remove',exact:true}).click();
  assert.equal(await page.getByText('synthetic-block-term',{exact:true}).count(),0);

  await liveControls.getByRole('button',{name:'Clear screen',exact:true}).click();
  await page.waitForFunction(()=>true);
  assert.ok(controls.includes('clear'));
  const end=liveControls.getByRole('button',{name:'End service',exact:true});
  await end.click();
  const endDialog=page.getByRole('alertdialog',{name:'End this service?',exact:true});
  await endDialog.waitFor();
  await check('end-dialog');
  await page.keyboard.press('Escape');
  await endDialog.waitFor({state:'hidden'});
  assert.equal(await page.locator(':focus').innerText(),'End service');
  await end.click();
  await endDialog.getByRole('button',{name:'End service',exact:true}).click();
  await page.getByRole('button',{name:'Start captions',exact:true}).waitFor();
  assert.equal(status,'idle');
  assert.equal(inferenceCalls,0,'Dashboard checks must not invoke inference');
  results.push({width,errors,violations,checks:'idle Live, every Settings section, Sermons, Help, per-screen addresses with Back/Forward/reload and legacy bookmarks, draft and consent persistence across screens, start/pause/resume/clear/end, End dialog focus, pinned control bar clearance, second-tab take over, pending-change banner and Undo, quick block, no inference, responsive overflow and Axe'});
  await context.close();
 }
 await fs.writeFile(output+'/operator-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
 assert.ok(results.every(r=>r.errors.length===0&&r.violations.length===0));
} catch(error) {
 console.error('operator-ui failed:',error?.message??error);
 for(const context of browser.contexts()) for(const page of context.pages()) {
  await page.screenshot({path:output+'/failure.png',timeout:5000}).catch(()=>{});
 }
 throw error;
} finally {await browser.close()}
