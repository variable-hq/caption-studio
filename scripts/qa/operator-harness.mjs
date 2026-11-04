// Shared browser harness for the operator suites. Each area script passes its body and the
// screens its dark contrast pass reaches; every width gets a fresh mocked operator.
import { AXE_WIDTHS, QA_CONCURRENCY, QA_ORIGIN, qaPassTasks, settleWithLimit } from './dashboard-helpers.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tooling = process.env.CAPTION_QA_TOOLS_DIR;
assert.ok(tooling, 'Set CAPTION_QA_TOOLS_DIR to the isolated browser QA installation.');
const { chromium } = await import(pathToFileURL(path.join(tooling, 'node_modules/playwright/index.mjs')));
const { default: AxeBuilder } = await import(pathToFileURL(path.join(tooling, 'node_modules/@axe-core/playwright/dist/index.mjs')));
const colorScheme = process.env.CAPTION_QA_COLOR_SCHEME === 'dark' ? 'dark' : 'light';
const output = path.resolve('test-results/operator');
await fs.mkdir(output, { recursive: true });

export async function runOperatorArea({ name, checks, contrastScreens, body }) {
 const browser = await chromium.launch({headless:true,timeout:30000,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const results = [];
 const contextLabels = new Map();
 const runWidth = async (width, colorScheme, contrastOnly) => {
  const context=await browser.newContext({viewport:{width,height:width>500?1080:844},colorScheme,permissions:['microphone'],reducedMotion:'reduce'});
  contextLabels.set(context,`${colorScheme}${contrastOnly?'-contrast':''}-${width}`);
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
  let accountUiLocale=null;
  let accountPreferencesUnavailable=false;
  // Custom presets: the workspace's records, the plan's allowance (set to 0 or 1 for the locked and full states) and the commands the mock saw.
  let presetRecords=[];
  let presetMax=5;
  let presetCounter=0;
  const presetWrites=[];
  const presetCommand=(command)=>{
   if(command.action==='create'){
    if(presetRecords.length>=presetMax) return {status:409,code:'limit-reached',error:'The workspace plan has no room for another custom preset.'};
    if(presetRecords.some(entry=>entry.preset.name.en.toLowerCase()===command.preset.name.en.toLowerCase())) return {status:409,code:'name-taken',error:'A custom preset has this name.'};
    presetCounter+=1;
    const id='custom:'+String(presetCounter).padStart(8,'0')+'-0000-4000-8000-000000000000';
    presetRecords=[...presetRecords,{preset:{...command.preset,id,version:1},modelTextAllowed:true}];
    return {status:200};
   }
   if(command.action==='update'){
    const current=presetRecords.find(entry=>entry.preset.id===command.id);
    if(!current) return {status:404,code:'not-found',error:'Custom preset not found.'};
    presetRecords=presetRecords.map(entry=>entry.preset.id===command.id?{preset:{...command.preset,id:command.id,version:current.preset.version+1},modelTextAllowed:command.modelTextAllowed??entry.modelTextAllowed}:entry);
    return {status:200};
   }
   presetRecords=presetRecords.filter(entry=>entry.preset.id!==command.id);
   return {status:200};
  };
  let sharedSetup=null;
  // The format a running session fixed at start, the start bodies the mock saw, and the saved transcripts it lists.
  let sessionPresetId='builtin:general';
  const sessionStarts=[];
  let historySessions=[];
  const emptySetup={version:1,uiLocale:null,translationSystemPrompt:null,summaryDefaults:null,captionStyle:null,translationDefaults:null,outputBufferCount:null,outputBufferDwellMs:null,saveHistoryDefault:null,autoSummary:false,updatedAt:null};
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==QA_ORIGIN) return route.abort();
   if(!url.pathname.startsWith('/api/')) return route.continue();
   const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
   let body={};try{body=request.postDataJSON()??{}}catch{}
   let payload={};
   let replyStatus=200;
   if(path==='/api/live/experience/preferences'&&accountPreferencesUnavailable){
    await route.fulfill({status:503,json:{error:'Synthetic account preferences unavailable'}});
    return;
   }
   if(path==='/api/ai/health'||path==='/api/ai/readiness')payload=health;
  else if(path==='/api/live/experience/preferences'||path==='/api/live/experience/setup'){
    const isShared=path==='/api/live/experience/setup';
    if(method!=='GET')controls.push({preferenceWrite:body});
    if(!isShared&&method==='POST'&&Object.hasOwn(body,'uiLocale'))accountUiLocale=body.uiLocale;
    if(isShared&&method==='POST')sharedSetup={...emptySetup,...sharedSetup,...body,updatedAt:Date.now()};
    payload=method==='GET'
      ?(isShared?{...emptySetup,...sharedSetup}:{...emptySetup,uiLocale:accountUiLocale})
      :(isShared?{...emptySetup,...sharedSetup}:{...emptySetup,...body,uiLocale:accountUiLocale,updatedAt:Date.now()});
  }
   else if(path==='/api/live/experience/presets'){
    if(method==='POST'){
     presetWrites.push(body);
     const reply=presetCommand(body);
     if(reply.error){replyStatus=reply.status;payload={error:reply.error,code:reply.code};}
    }
    if(!payload.error) payload={presets:presetRecords,limits:{maxCustomPresets:presetMax,used:presetRecords.length}};
   }
   else if(path==='/api/live/channel')payload={channelId:'main',configured:true,presetId:sessionPresetId,status,overlayUrl:QA_ORIGIN+'/overlay#main.'+'o'.repeat(43),style,startedAt,expiresAt,transcriptionRequests,llmUsage:emptyUsage,translationRevision:0};
   else if(path==='/api/live/channel/style'){style=body.style;payload={ok:true}}
   else if(path==='/api/live/channel/session'&&method==='POST'){
    sessionStarts.push(body);sessionPresetId=typeof body.presetId==='string'?body.presetId:'builtin:general';
    status='live';startedAt=new Date().toISOString();expiresAt=new Date(Date.now()+90*60000).toISOString();
    payload={channelId:'main',presetId:sessionPresetId,controllerToken:'c'.repeat(43),viewerUrl:QA_ORIGIN+'/view#main.'+'v'.repeat(43),startedAt,expiresAt,translationRevision:0};
   } else if(path==='/api/live/channel/session'&&method==='DELETE'){status='idle';startedAt=null;expiresAt=null;payload={ok:true}}
   else if(path==='/api/live/channel/control'){
    controls.push(body.action);if(body.action==='pause')status='paused';if(body.action==='resume')status='live';
    payload={action:body.action,status,translationRevision:0,sequence:1};
   } else if(path==='/api/live/channel/observer'&&method==='POST'){
    // A second tab of the same workspace watches the running service read-only.
    payload={channelId:'main',sessionId:'11111111-1111-1111-1111-111111111111',saveHistory:false,presetId:sessionPresetId,
     controllerLabel:'operator@example.test',status:status==='paused'?'paused':'live',
     observerToken:'w'.repeat(43),viewerUrl:QA_ORIGIN+'/view#main.'+'w'.repeat(43),
     startedAt,expiresAt,translationRevision:0};
   } else if(path==='/api/live/channel/lease')payload={valid:true,status:'live',expiresAt,transcriptionRequests:++transcriptionRequests,translationRevision:0};
   else if(path==='/api/ai/transcribe'){inferenceCalls++;payload={segments:[]};}
   else if(path==='/api/live/experience/usage')payload={records:[],next:null};
   else if(path==='/api/live/experience/history')payload={sessions:historySessions,services:historySessions};
   else {errors.push('Unexpected mocked request: '+method+' '+path);return route.fulfill({status:400,json:{error:'Unexpected test request'}})}
   await route.fulfill({status:replyStatus,json:payload});
  });
  await page.goto(QA_ORIGIN);
  await page.getByText('Ready to go',{exact:true}).waitFor();

  // Mock state the test bodies read and set. The route handler above reads the same variables.
  const mock = {
   get status() { return status; },
   set status(value) { status = value; },
   get startedAt() { return startedAt; },
   set startedAt(value) { startedAt = value; },
   get expiresAt() { return expiresAt; },
   set expiresAt(value) { expiresAt = value; },
   get transcriptionRequests() { return transcriptionRequests; },
   set transcriptionRequests(value) { transcriptionRequests = value; },
   get inferenceCalls() { return inferenceCalls; },
   set inferenceCalls(value) { inferenceCalls = value; },
   get accountPreferencesUnavailable() { return accountPreferencesUnavailable; },
   set accountPreferencesUnavailable(value) { accountPreferencesUnavailable = value; },
   get accountUiLocale() { return accountUiLocale; },
   set accountUiLocale(value) { accountUiLocale = value; },
   get sharedSetup() { return sharedSetup; },
   set sharedSetup(value) { sharedSetup = value; },
   get historySessions() { return historySessions; },
   set historySessions(value) { historySessions = value; },
   get presetMax() { return presetMax; },
   set presetMax(value) { presetMax = value; },
   get presetRecords() { return presetRecords; },
   set presetRecords(value) { presetRecords = value; },
   get presetCounter() { return presetCounter; },
   set presetCounter(value) { presetCounter = value; },
   get sessionPresetId() { return sessionPresetId; },
   set sessionPresetId(value) { sessionPresetId = value; },
   get style() { return style; },
   set style(value) { style = value; },
  };
  // The dark pass checks colour contrast only, each screen at its plain address after its own heading loads.
  if (contrastOnly) {
   for (const screen of contrastScreens) {
    await page.goto(QA_ORIGIN + '/#' + screen.address);
    await screen.ready(page).waitFor();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    violations.push(...axe.violations.map((x) => ({ screen: screen.address, id: x.id, impact: x.impact, nodes: x.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })));
   }
   await context.close();
   return { width, colorScheme, contrastOnly, errors, violations, checks: 'dark colour-contrast scan of ' + contrastScreens.map((s) => s.address).join(', ') };
  }
  // Visible copy calls the live event a session and the viewers an audience. "service" may
  // remain only for the caption, AI and translation backend.
  const assertSessionWording=async (target,label)=>{
   const copy=(await target.locator('body').innerText()).replace(/\b(caption|AI|translation) services?\b/giu,'');
   const hit=copy.match(/.{0,40}(\bservices?\b|congregation).{0,40}/iu);
   assert.equal(hit,null,`${width}/${label} uses event wording: ${hit?.[0]}`);
  };
  // Event wording is checked only under General; the other presets use their own terms.
  const check=async (screen,{general=true,scan=true}={})=>{
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${screen} overflow`);
   if(general&&/^(live|transcripts|help)/.test(screen)) await assertSessionWording(page,screen);
   const axe=scan&&AXE_WIDTHS.includes(width)?await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze():{violations:[]};
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

  // The top bar's format is the Presets link while no session runs.
  const formatLink=name=>page.getByRole('link',{name:`Session format: ${name}`,exact:true});
  const formatNote=name=>page.getByRole('note',{name:`Session format: ${name}`,exact:true});
  const topBarText=async()=>(await page.locator('.operatorBrandName > span').textContent())?.replace(/\s+/gu,' ').trim();
  await body({ page, context, width, colorScheme, output, mock, check, barClear, formatLink, formatNote, topBarText, assertSessionWording, controls, presetWrites, sessionStarts, emptySetup, errors, violations });
  const result = { width, colorScheme, contrastOnly, errors, violations, checks };
  await context.close();
  return result;
 };
 try {
  const tasks = qaPassTasks(colorScheme);
  const outcomes = await settleWithLimit(tasks, QA_CONCURRENCY, (task) => runWidth(task.width, task.colorScheme, task.contrastOnly));
  const failures = outcomes.flatMap((outcome, index) => outcome.status === 'rejected' ? [`${tasks[index].colorScheme}${tasks[index].contrastOnly ? ' contrast' : ''} ${tasks[index].width}px: ${outcome.reason?.message ?? outcome.reason}`] : []);
  results.push(...outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : []));
  if (failures.length) throw new Error(failures.join('\n'));
  await fs.writeFile(output + `/operator-${name}-results-${colorScheme}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  assert.ok(results.every((r) => r.errors.length === 0 && r.violations.length === 0));
 } catch (error) {
  console.error(`operator-${name} failed:`, error?.message ?? error);
  for (const context of browser.contexts()) for (const page of context.pages()) {
   await page.screenshot({ path: output + `/failure-${name}-${contextLabels.get(context) ?? 'unknown'}.png`, timeout: 5000 }).catch(() => {});
  }
  throw error;
 } finally { await browser.close(); }
}
