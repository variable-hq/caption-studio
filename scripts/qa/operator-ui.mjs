import { AXE_WIDTHS, CAPTION_WAIT_TIME_LABELS, QA_ORIGIN, QA_VIEWPORT_WIDTHS, SETTINGS_SECTIONS, captureScreenshot, openScreen, openSettings } from "./dashboard-helpers.mjs";
// Local synthetic UI checks. No provider calls or external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const tooling = process.env.CAPTION_QA_TOOLS_DIR;
assert.ok(tooling, 'Set CAPTION_QA_TOOLS_DIR to the isolated browser QA installation.');
const { chromium } = await import(pathToFileURL(path.join(tooling, 'node_modules/playwright/index.mjs')));
const { default: AxeBuilder } = await import(pathToFileURL(path.join(tooling, 'node_modules/@axe-core/playwright/dist/index.mjs')));
const colorScheme=process.env.CAPTION_QA_COLOR_SCHEME==='dark'?'dark':'light';
const output=path.resolve('test-results/operator');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,timeout:30000,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const results=[];
try {
 const runWidth=async width=>{
  const context=await browser.newContext({viewport:{width,height:width>500?1080:844},colorScheme,permissions:['microphone'],reducedMotion:'reduce'});
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
   await route.fulfill({status:200,json:payload});
  });
  await page.goto(QA_ORIGIN);
  await page.getByText('Ready to go',{exact:true}).waitFor();
  assert.equal(await page.getByRole('switch',{name:'Live drafts',exact:true}).count(),0,'Live drafts is no longer a user-visible setting');
  assert.equal(await page.locator('.heardText').count(),1,'The Heard pane remains the in-progress source view');
  assert.equal(await page.locator('.liveDraftLine').count(),0,'No separate draft line remains');
  assert.equal(await page.locator('.heardText[data-in-progress="true"]').count(),0,'An idle pane shows no in-progress draft');
  // Visible copy calls the live event a session and the viewers an audience. "service" may
  // remain only for the caption, AI and translation backend.
  const assertSessionWording=async (target,label)=>{
   const copy=(await target.locator('body').innerText()).replace(/\b(caption|AI|translation) services?\b/giu,'');
   const hit=copy.match(/.{0,40}(\bservices?\b|congregation).{0,40}/iu);
   assert.equal(hit,null,`${width}/${label} uses event wording: ${hit?.[0]}`);
  };
  // Event wording is checked only under General; the other presets use their own terms.
  const check=async (screen,{general=true}={})=>{
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${screen} overflow`);
   if(general&&/^(live|transcripts|help)/.test(screen)) await assertSessionWording(page,screen);
   const axe=AXE_WIDTHS.includes(width)?await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze():{violations:[]};
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
  // Idle: one Start, a ready checklist, no live controls, no inference.
  await check('live-idle');
  assert.equal(await page.getByRole('button',{name:'Start captions',exact:true}).isEnabled(),true);
  assert.equal(await formatLink('General').getAttribute('href'),'#settings=presets','With no session, the format links to Settings › Presets');
  assert.equal(await topBarText(),'BEST Church workspace · General · Main channel','The top bar names the General format');
  assert.equal(await page.getByRole('region',{name:'Live controls'}).count(),0);
  assert.equal(await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).isChecked(),false);
  // The Start bar spans both columns above the grid; the output buffer sits in Captions.
  assert.equal(await page.locator('.liveStartBar').count(),1,'The Start bar shows before a service');
  assert.equal(await page.locator('.liveStartBar').getByRole('button',{name:'Start captions',exact:true}).count(),1,'Start captions belongs to the Start bar');
  assert.equal(await page.evaluate(()=>{const bar=document.querySelector('.liveStartBar');const grid=document.querySelector('.liveGrid');return !!bar&&!!grid&&(bar.compareDocumentPosition(grid)&Node.DOCUMENT_POSITION_FOLLOWING)!==0;}),true,'The Start bar precedes the Live grid');
  assert.equal(await page.locator('.liveCaptions .monitorGrid ~ .outputBufferControls').count(),1,'The output buffer follows the panes in the Captions card');
  assert.equal(await page.locator('.liveActions .outputBufferPanel').count(),0,'The Start card no longer holds the output buffer');
  assert.equal(await page.getByTestId('output-buffer-wait').isVisible(),true,'The wait setting is visible without opening a disclosure');
  assert.deepEqual(await page.locator('.checkList li .checkText > span:first-child').allTextContents(),['Caption service','Microphone','OBS','Languages','Terms'],'OBS is third in Ready to go');
  // Live saves its per-service choices with one shared control; Save for everyone stays in Settings.
  assert.equal(await page.getByRole('button',{name:'Save for everyone',exact:true}).count(),0,'Live has no per-control Save for everyone');
  assert.equal(await page.getByRole('button',{name:'Save selected settings as default',exact:true}).count(),0,'With no saved default, the shared save hides while the built-in choices are unchanged');
  await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).check();
  await page.getByTestId('output-buffer-wait').selectOption('2000');
  const sharedSave=page.getByRole('button',{name:'Save selected settings as default',exact:true});
  assert.equal(await sharedSave.count(),1,'The shared save appears when a visible choice differs from its saved default');
  const savesBefore=controls.length;
  await sharedSave.click();
  await page.getByText('Saved for everyone. New sessions start with this choice.',{exact:true}).waitFor();
  assert.equal(controls.length,savesBefore+1,'The shared save writes once');
  const sharedWrite=controls.at(-1).preferenceWrite;
  assert.equal(sharedWrite.saveHistoryDefault,true,'The shared save includes the visible transcript choice');
  assert.equal(sharedWrite.outputBufferCount,1,'The shared save includes the visible buffer choice');
  assert.equal(sharedWrite.outputBufferDwellMs,2000,'The shared save includes the visible buffer wait');
  assert.equal(await sharedSave.count(),0,'The shared save hides once the choices match the saved default');
  await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).uncheck();
  assert.equal(inferenceCalls,0,'Idle Live must not invoke inference');
  await captureScreenshot(page,{path:output+`/live-idle-${colorScheme}-${width}.png`,fullPage:true});

  for(const section of SETTINGS_SECTIONS){
   await openSettings(page,section);
   await check(`settings-${section}`);
   if(section==='look'){
    const range=page.locator('input[type=range]').first();
    await range.fill('64');
    await range.dispatchEvent('input');
    assert.ok((await page.getByTestId('caption-preview').first().getAttribute('style')).includes('64px'));
    await captureScreenshot(page,{path:output+`/settings-look-${colorScheme}-${width}.png`,fullPage:true});
   }
   if(section==='obs') assert.equal(await page.getByRole('button',{name:'Copy OBS link',exact:true}).isVisible(),true);
   if(section==='computer'){
    assert.equal(await page.getByRole('heading',{name:'Microphone',exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('heading',{name:'Theme',exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('combobox',{name:'Interface language',exact:true}).count(),0,'Interface language belongs to Language');
    await page.getByRole('button',{name:'Test the microphone',exact:true}).click();
    await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();
    await page.getByText('Recording, up to 10 seconds',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Stop recording',exact:true}).click();
    await page.getByRole('button',{name:'Play recording',exact:true}).waitFor();
    await page.getByRole('button',{name:'Test again',exact:true}).click();
    await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();
    await page.getByRole('button',{name:'Stop recording',exact:true}).click();
    await page.getByRole('button',{name:'Play recording',exact:true}).waitFor();
   }
   if(section==='languages'){
    assert.equal(await page.getByRole('combobox',{name:'Interface language',exact:true}).isVisible(),true);
    assert.equal(await page.getByTestId('source-language').isVisible(),true);
    assert.equal(await page.getByTestId('target-language').isVisible(),true);
   }
   if(section==='translator'){
    assert.equal(await page.getByTestId('inference-level').isVisible(),true);
    assert.equal(await page.getByTestId('recording-window').isVisible(),true);
    assert.equal(await page.getByTestId('recording-window').inputValue(),'dynamic','Dynamic is the caption wait time default');
    assert.deepEqual(await page.getByTestId('recording-window').locator('option').allTextContents(),CAPTION_WAIT_TIME_LABELS);
    assert.equal(await page.locator('.saveBar').getByRole('button',{name:'Save for everyone',exact:true}).first().isVisible(),true);
   }
   if(section==='usage') assert.equal(await page.getByText('Translation service right now',{exact:true}).isVisible(),true);
   if(section==='words'){
    await page.getByText('Write the term in the speaker’s language',{exact:false}).waitFor();
    await page.locator('input[name="word"]').fill('synthetic-hidden');
    await page.locator('select[name="wordAction"]').selectOption('hide');
    await page.getByRole('button',{name:'Add term',exact:true}).click();
    await page.getByRole('cell',{name:'synthetic-hidden',exact:true}).waitFor();
    await page.getByRole('button',{name:'Remove synthetic-hidden',exact:true}).click();
    assert.equal(await page.getByRole('cell',{name:'synthetic-hidden',exact:true}).count(),0);
    // A Terms list imports from a file or pasted text through the stated format.
    await page.getByRole('heading',{name:'Import a list',exact:true}).waitFor();
    await page.getByText(/Each term is term,action or term,action,with/).waitFor();
    const importFile=page.getByTestId('terms-import-file');
    await importFile.setInputFiles({name:'synthetic-terms.csv',mimeType:'text/csv',buffer:Buffer.from('synthetic-imported,recognise\nsynthetic-hidden-import,hide\nsynthetic-replace,replace,replacement')});
    await page.getByText('Imported 3 terms.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('cell',{name:'synthetic-imported',exact:true}).count(),1);
    assert.equal(await page.getByRole('cell',{name:'synthetic-hidden-import',exact:true}).count(),1);
    assert.equal(await page.getByRole('cell',{name:'synthetic-replace',exact:true}).count(),1);
    // A bad row names its line and imports nothing.
    await importFile.setInputFiles({name:'synthetic-bad.csv',mimeType:'text/csv',buffer:Buffer.from('synthetic-throwaway,recognise\nbad-row,nope')});
    await page.getByText('Couldn’t import: line 2 has an unknown action “nope”.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('cell',{name:'synthetic-throwaway',exact:true}).count(),0);
    // A wrong file type is refused.
    await importFile.setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.ms-excel',buffer:Buffer.from('x')});
    await page.getByText('Choose a .csv or .txt file.',{exact:true}).waitFor();
    // The choose-file control is reachable by keyboard.
    await page.getByTestId('terms-import-choose').focus();
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Choose a file');
    // A file import keeps an unsent paste and uses the singular success text.
    const pasteBox=page.locator('textarea[name="termsImport"]');
    await pasteBox.fill('synthetic-unsent,recognise');
    await importFile.setInputFiles({name:'synthetic-one.csv',mimeType:'text/csv',buffer:Buffer.from('synthetic-file-row,hide')});
    await page.getByText('Imported 1 term.',{exact:true}).waitFor();
    assert.equal(await pasteBox.inputValue(),'synthetic-unsent,recognise');
    assert.equal(await page.getByRole('cell',{name:'synthetic-file-row',exact:true}).count(),1);
    // Pasted text uses the same parser and the semicolon separator.
    await pasteBox.fill('synthetic-single,recognise');
    await page.getByRole('button',{name:'Import list',exact:true}).click();
    await page.getByText('Imported 1 term.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('cell',{name:'synthetic-single',exact:true}).count(),1);
    await pasteBox.fill('synthetic-pasted,recognise; synthetic-pasted-hide,hide');
    await page.getByRole('button',{name:'Import list',exact:true}).click();
    await page.getByText('Imported 2 terms.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('cell',{name:'synthetic-pasted',exact:true}).count(),1);
   }
  }
  await openScreen(page,'Transcripts'); await check('transcripts');
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
  await page.getByRole('heading',{name:'Output',exact:true}).waitFor();
  // Old sidebar bookmarks land on the matching screen.
  await page.goto(QA_ORIGIN+'/#workspace=history');
  await page.getByRole('heading',{name:'Transcripts',exact:true}).waitFor();
  assert.equal(inferenceCalls,0,'Navigation and reload must not invoke inference');

  // Start, pause, clear, end.
  await openScreen(page,'Live');
  await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).check();
  await openSettings(page,'computer');
  await openScreen(page,'Live');
  assert.equal(await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).isChecked(),true,'Consent survives moving between screens');
  await page.getByRole('checkbox',{name:/Save the transcript for 7 days/}).uncheck();

  // A default-save status belongs to the screen state that produced it: save before Start,
  // then start and end without another save, and it must neither follow nor return.
  const preStartSave=page.getByRole('button',{name:'Save selected settings as default',exact:true});
  await preStartSave.click();
  await page.getByText('Saved for everyone. New sessions start with this choice.',{exact:true}).waitFor();
  await preStartSave.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Start captions',exact:true}).click();
  await page.getByRole('region',{name:'Live controls'}).getByRole('button',{name:'Pause',exact:true}).waitFor();
  assert.equal((await page.locator('.liveCaptions .outputBufferControls [role="status"]').textContent())?.trim(),'','A before-Start default-save status does not follow the service');
  await page.getByRole('region',{name:'Live controls'}).getByRole('button',{name:'End session',exact:true}).click();
  const statusEndDialog=page.getByRole('alertdialog',{name:'End this session?',exact:true});
  await statusEndDialog.waitFor();
  await statusEndDialog.getByRole('button',{name:'End session',exact:true}).click();
  await page.getByRole('button',{name:'Start captions',exact:true}).waitFor();
  assert.equal(await page.locator('.liveActions [role="status"]').textContent(),'','A default-save status does not return to the Start card after End');

  await page.getByRole('button',{name:'Start captions',exact:true}).click();
  const liveControls=page.getByRole('region',{name:'Live controls'});
  await liveControls.getByRole('button',{name:'Pause',exact:true}).waitFor();
  assert.equal(status,'live');
  // Technical details lists how windows end; every row fits at every width.
  await page.locator('summary',{hasText:'Technical details'}).click();
  for(const label of ['Cuts at a sentence end','Cuts at a pause','Cuts at the wait limit','Unfinished sentences held','Caption wait, typical · longest 10%']){
   const row=page.locator('.statRow',{hasText:label});
   assert.equal(await row.count(),1,`Technical details shows "${label}"`);
   assert.equal(await row.evaluate((node)=>node.scrollWidth<=node.clientWidth&&node.getBoundingClientRect().right<=innerWidth),true,`${width}: "${label}" row overflows`);
  }
  assert.equal((await page.locator('.statRow',{hasText:'Caption wait, typical'}).locator('span').last().textContent())?.trim(),'—','Caption wait is empty before the first window');
  await captureScreenshot(page.locator('details.advancedActions',{hasText:'Technical details'}),{path:output+`/live-technical-details-${colorScheme}-${width}.png`});
  await check('live-running');
  await barClear('live-running');
  assert.equal(await formatLink('General').count(),0,'A running session shows the format as plain text, not a link');
  assert.equal(await formatNote('General').count(),1,'A running session shows the format as a note');
  // The Start bar is gone; the buffer and its shared save stay in the Captions card.
  assert.equal(await page.locator('.liveStartBar').count(),0,'The Start bar is replaced once a service runs');
  assert.equal(await page.locator('.liveCaptions .monitorGrid ~ .outputBufferControls').count(),1,'The output buffer stays in the Captions card during a service');
  assert.equal(await page.locator('.liveActions .outputBufferPanel').count(),0,'Quick fixes no longer holds the output buffer');
  assert.equal(await page.locator('.liveCaptions .outputBufferQueue').count(),1,'The Next up queue follows the panes while the wait is on');
  await page.getByTestId('output-buffer-wait').selectOption('3000');
  const liveSharedSave=page.locator('.liveCaptions').getByRole('button',{name:'Save selected settings as default',exact:true});
  await liveSharedSave.waitFor();
  const liveSavesBefore=controls.length;
  await liveSharedSave.click();
  await liveSharedSave.waitFor({state:'hidden'});
  assert.equal(controls.length,liveSavesBefore+1,'A live save writes once');
  const liveWrite=controls.at(-1).preferenceWrite;
  assert.equal(liveWrite.outputBufferDwellMs,3000,'A live save includes the visible buffer wait');
  assert.equal(Object.hasOwn(liveWrite,'saveHistoryDefault'),false,'A live save never includes the hidden transcript choice');
  await captureScreenshot(page,{path:output+`/live-running-${colorScheme}-${width}.png`,fullPage:true});
  // Moving to Settings and back never pauses or clears capture.
  const controlsBefore=controls.length;
  await openSettings(page,'usage');
  await openScreen(page,'Live');
  assert.equal(controls.length,controlsBefore);

  // A second tab watches the running session: it names the operator and offers Take over, not Start.
  const other=await context.newPage();
  await other.goto(QA_ORIGIN+'/#live');
  await other.getByText('operator@example.test is running captions on another system.',{exact:true}).waitFor();
  assert.equal(await other.getByRole('button',{name:'Take over',exact:true}).count(),1);
  assert.equal(await other.getByRole('button',{name:'Start captions',exact:true}).isDisabled(),true);
  assert.equal(await other.getByText('Heard',{exact:true}).count(),1,'Observers still see the controller Heard pane');
  await assertSessionWording(other,'observer');
  assert.equal(controls.length,controlsBefore);
  await other.close();

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

  // Applying a format during a session holds its changes until Apply now or Undo changes; General then restores the format.
  await openSettings(page,'presets');
  await page.getByRole('combobox',{name:'Format',exact:true}).selectOption('builtin:sermon');
  await page.getByRole('button',{name:'Apply preset',exact:true}).click();
  await page.getByText('Sermon applied. Review the filled-in settings, then save each one for everyone.',{exact:true}).waitFor();
  await openScreen(page,'Live');
  await page.getByText('Your changes aren’t in use yet.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Undo changes',exact:true}).click();
  await page.getByText('Your changes aren’t in use yet.',{exact:true}).waitFor({state:'hidden'});
  // Use preset default during a service: Keynote's 14-second wait differs from the running Dynamic wait, so the Translation draft waits for Apply now, and Undo changes restores the running wait.
  sharedSetup={...sharedSetup,updatedAt:Date.now(),profile:'builtin:keynote',translationDefaults:{sourceLanguage:'auto',targetLanguage:'en',keywordText:'',filterText:'',recordingWindowMs:6000,inferenceLevel:'low',sanitizeLevel:'off',filterInappropriateLanguage:true}};
  await page.reload();
  await openSettings(page,'presets');
  await page.getByRole('heading',{name:'Differs from the format',exact:true}).waitFor();
  await page.getByRole('button',{name:'Use preset default for Caption wait time',exact:true}).click();
  await page.getByText('Set as a change to review: Caption wait time',{exact:true}).waitFor();
  await openScreen(page,'Live');
  await page.getByText('Your changes aren’t in use yet.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Undo changes',exact:true}).click();
  await page.getByText('Your changes aren’t in use yet.',{exact:true}).waitFor({state:'hidden'});
  await openSettings(page,'translator');
  assert.equal(await page.locator('[data-testid="recording-window"]').first().inputValue(),'dynamic','Undo changes restores the running caption wait');

  await openSettings(page,'presets');
  await page.getByRole('combobox',{name:'Format',exact:true}).selectOption('builtin:general');
  await page.getByRole('button',{name:'Apply preset',exact:true}).click();
  await page.getByText('General applied. Review the filled-in settings, then save each one for everyone.',{exact:true}).waitFor();
  await openScreen(page,'Live');

  // Quick override actions apply immediately; Keep in Terms follows the Apply now flow.
  await page.locator('input[name="liveWord"]').fill('synthetic-hide-term');
  await page.locator('select[name="liveWordAction"]').selectOption('hide');
  await page.getByRole('button',{name:'Add quick override',exact:true}).click();
  assert.equal(await page.getByText('synthetic-hide-term',{exact:true}).isVisible(),true);
  assert.equal(await page.getByText('Your changes aren’t in use yet.',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Remove synthetic-hide-term quick override',exact:true}).click();

  await page.locator('input[name="liveWord"]').fill('synthetic-fix-term');
  await page.locator('select[name="liveWordAction"]').selectOption('fix');
  await page.locator('input[name="liveWordWith"]').fill('synthetic-canonical-term');
  await page.getByRole('button',{name:'Add quick override',exact:true}).click();
  if(width===1920) await captureScreenshot(page,{path:output+`/quick-override-${colorScheme}-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Keep in Terms',exact:true}).click();
  await page.getByText('Kept for Apply now',{exact:true}).waitFor();
  await openSettings(page,'words');
  await page.locator('.wordsTable').getByText('synthetic-fix-term',{exact:true}).waitFor();
  await openScreen(page,'Live');
  await page.getByText('Your changes aren’t in use yet.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Undo changes',exact:true}).click();
  await page.getByText('Your changes aren’t in use yet.',{exact:true}).waitFor({state:'hidden'});

  // A full list preserves existing overrides and requires an explicit removal to add another.
  await page.getByRole('button',{name:'Remove synthetic-fix-term quick override'}).click();
  await page.locator('select[name="liveWordAction"]').selectOption('recognise');
  for(let index=0;index<20;index+=1){
   await page.locator('input[name="liveWord"]').fill(`synthetic-capacity-${index}`);
   await page.getByRole('button',{name:'Add quick override',exact:true}).click();
  }
  const addQuickOverride=page.getByRole('button',{name:'Add quick override',exact:true});
  assert.equal(await addQuickOverride.isDisabled(),true);
  await page.getByRole('status').getByText('20 quick overrides in use. Remove one before adding another.',{exact:true}).waitFor();
  assert.equal(await page.locator('.liveWordList > li').count(),20);
  assert.equal(await page.getByText('synthetic-capacity-0',{exact:true}).isVisible(),true);
  await page.locator('input[name="liveWord"]').fill('synthetic-capacity-overflow');
  await page.getByRole('button',{name:'Remove synthetic-capacity-0 quick override'}).click();
  assert.equal(await addQuickOverride.isEnabled(),true);
  await addQuickOverride.click();
  assert.equal(await page.locator('.liveWordList > li').count(),20);
  assert.equal(await page.getByText('synthetic-capacity-0',{exact:true}).count(),0);
  assert.equal(await page.getByText('synthetic-capacity-overflow',{exact:true}).isVisible(),true);
  await check('quick-override-capacity');

  await liveControls.getByRole('button',{name:'Clear screen',exact:true}).click();
  await page.waitForFunction(()=>true);
  assert.ok(controls.includes('clear'));
  const end=liveControls.getByRole('button',{name:'End session',exact:true});
  await end.click();
  const endDialog=page.getByRole('alertdialog',{name:'End this session?',exact:true});
  await endDialog.waitFor();
  await check('end-dialog');
  await page.keyboard.press('Escape');
  await endDialog.waitFor({state:'hidden'});
  assert.equal(await page.locator(':focus').innerText(),'End session');
  await end.click();
  await endDialog.getByRole('button',{name:'End session',exact:true}).click();
  await page.getByRole('button',{name:'Start captions',exact:true}).waitFor();
  assert.equal(status,'idle');
  // Live capture may or may not finish a window in this mocked run; only dashboard
  // actions outside capture are required to stay free of inference.
  inferenceCalls=0;
  await openSettings(page,'languages');
  await page.getByRole('combobox',{name:'Interface language',exact:true}).selectOption('id');
  await page.waitForFunction(()=>document.documentElement.lang==='id');
  assert.equal(await page.locator('.operatorTabs').getByRole('link',{name:'Pengaturan',exact:true}).count(),1);
  assert.equal(await page.locator('.operatorTabs').getByRole('link',{name:'Transkrip',exact:true}).count(),1);
  assert.equal(inferenceCalls,0,'Settings after End must not invoke inference');
  await check('settings-interface-language-id');
  await page.evaluate(()=>localStorage.setItem('caption-studio:ui-locale:v1','en'));
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.lang==='id');
  assert.equal(await page.locator('.operatorTabs').getByRole('link',{name:'Pengaturan',exact:true}).count(),1,'Account locale persists after reload');
  accountPreferencesUnavailable=true;
  await page.evaluate(()=>localStorage.setItem('caption-studio:ui-locale:v1','id'));
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.lang==='id');
  assert.equal(await page.locator('.operatorTabs').getByRole('link',{name:'Pengaturan',exact:true}).count(),1,'Browser copy applies when account preferences are unavailable');
  await page.getByRole('combobox',{name:'Bahasa antarmuka',exact:true}).selectOption('');
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  // Presets: Settings › Presets saves the format for everyone; the top bar, Transcripts, Live and Help follow it.
  // The account keeps English across the reload that loads its preferences again.
  accountPreferencesUnavailable=false;
  await openSettings(page,'languages');
  await page.getByRole('combobox',{name:'Interface language',exact:true}).selectOption('en');
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  await page.evaluate(()=>localStorage.removeItem('caption-studio:ui-locale:v1'));
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  await formatLink('General').waitFor();
  const presetCheck=(screen,slug)=>check(`${screen}-${slug}`,{general:slug==='general'});
  const openPresets=async()=>{
   await openScreen(page,'Settings');
   await page.getByRole('navigation',{name:'Settings sections',exact:true}).getByRole('link',{name:'Presets',exact:true}).click();
   await page.getByRole('heading',{name:'Presets',exact:true}).waitFor();
  };
  const chooseFormat=async (profileId,name)=>{
   await openPresets();
   await page.getByRole('combobox',{name:'Format',exact:true}).selectOption(profileId);
   await page.getByRole('heading',{name:'What this format sets',exact:true}).waitFor();
   if(profileId==='builtin:sermon'){
    await page.getByText('9 starter terms added',{exact:true}).waitFor();
    await page.getByText('Caption wait time',{exact:true}).first().waitFor();
   }
   const savesBefore=controls.length;
   await page.getByRole('button',{name:'Apply preset',exact:true}).click();
   await page.getByText(`${name} applied. Review the filled-in settings, then save each one for everyone.`,{exact:true}).waitFor();
   assert.equal(controls.length,savesBefore+1,`Applying ${name} writes once`);
   assert.equal(controls.at(-1).preferenceWrite.profile,profileId,`Saving ${name} sends ${profileId}`);
   await formatLink(name).waitFor();
   assert.equal(await topBarText(),`BEST Church workspace · ${name} · Main channel`,`The top bar names ${name}`);
  };
  // General is the default: the top bar links to Presets, and the chooser offers the four formats.
  await formatLink('General').click();
  await page.getByRole('heading',{name:'Presets',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'#settings=presets','The format link opens Settings › Presets');
  const formatSelect=page.getByRole('combobox',{name:'Format',exact:true});
  assert.deepEqual(await formatSelect.locator('option').allTextContents(),['General','Sermon','Talkshow','Keynote'],'The chooser lists the four built-in formats');
  assert.equal(await formatSelect.inputValue(),'builtin:general','General is the default format');
  await page.getByText('The base wording, used when no format is chosen.',{exact:true}).waitFor();
  await presetCheck('presets','general');
  // Workspace name: text with a control character or over 60 characters is refused; a valid name is saved for everyone and reaches the top bar; an empty name restores the default.
  const workspaceName=page.getByRole('textbox',{name:'Workspace name',exact:true});
  const saveWorkspaceName=page.getByRole('button',{name:'Save for everyone',exact:true});
  await workspaceName.fill('x'.repeat(61));
  await page.getByText('Use up to 60 characters, without line breaks or other control characters.',{exact:true}).waitFor();
  assert.equal(await saveWorkspaceName.isDisabled(),true,'An over-long workspace name cannot be saved');
  await check('presets-workspace-name-invalid');
  await workspaceName.fill('Gereja Sion');
  const nameSavesBefore=controls.length;
  await saveWorkspaceName.click();
  await page.waitForFunction(()=>document.querySelector('.operatorBrandName > span')?.textContent.includes('Gereja Sion'));
  assert.equal(controls.length,nameSavesBefore+1,'Saving the workspace name writes once');
  assert.equal(controls.at(-1).preferenceWrite.workspaceName,'Gereja Sion','Saving sends the workspace name in the shared setup');
  assert.equal(await topBarText(),'Gereja Sion · General · Main channel','The top bar shows the saved workspace name');
  await workspaceName.fill('');
  await saveWorkspaceName.click();
  await page.waitForFunction(()=>document.querySelector('.operatorBrandName > span')?.textContent.includes('BEST Church workspace'));
  assert.equal(await topBarText(),'BEST Church workspace · General · Main channel','An empty workspace name restores the default');
  // Share setup: pasted text and a chosen file are previewed before anything is saved; errors name the problem; an import fills only the unsaved setting.
  const setupText=page.locator('textarea[name="setupImport"]');
  const previewSetup=page.getByRole('button',{name:'Preview import',exact:true});
  const importSetup=page.getByRole('button',{name:'Import setup',exact:true});
  await setupText.fill('{not json');
  await previewSetup.click();
  await page.getByRole('alert').filter({hasText:'not valid JSON'}).waitFor();
  await check('presets-setup-error');
  await setupText.fill(JSON.stringify({kind:'caption-studio-setup',schemaVersion:1,apiKey:'synthetic'}));
  await previewSetup.click();
  await page.getByText('This setup file has a field this app does not know: apiKey.',{exact:true}).waitFor();
  const setupFile=JSON.stringify({kind:'caption-studio-setup',schemaVersion:1,workspaceName:'Gereja Impor'});
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({name:'setup.json',mimeType:'application/json',buffer:Buffer.from(setupFile)});
  await page.getByText('What the import sets',{exact:true}).waitFor();
  await page.getByText('Will be filled in',{exact:true}).waitFor();
  const setupSavesBefore=controls.length;
  await importSetup.click();
  await page.getByText('Setup imported for everyone.',{exact:true}).waitFor();
  assert.equal(controls.length,setupSavesBefore+1,'Import writes once');
  assert.deepEqual(Object.keys(controls.at(-1).preferenceWrite),['workspaceName'],'Import sends only the unsaved setting');
  await page.waitForFunction(()=>document.querySelector('.operatorBrandName > span')?.textContent.includes('Gereja Impor'));
  assert.equal(await topBarText(),'Gereja Impor · General · Main channel','The imported workspace name reaches the top bar');
  await page.getByRole('textbox',{name:'Workspace name',exact:true}).fill('');
  await page.getByRole('button',{name:'Save for everyone',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.operatorBrandName > span')?.textContent.includes('BEST Church workspace'));
  // Model-facing text in a file is held until allowed: it is shown, cannot be imported while held, and an oversized file is refused.
  await setupText.fill(JSON.stringify({kind:'caption-studio-setup',schemaVersion:1,translationSystemPrompt:'Synthetic instructions for the translator.'}));
  await previewSetup.click();
  await page.getByText('Held until you allow model instructions',{exact:true}).waitFor();
  await page.getByText('Synthetic instructions for the translator.',{exact:true}).waitFor();
  assert.equal(await importSetup.isDisabled(),true,'Held model instructions cannot be imported before they are allowed');
  await page.getByText('Allow this setup to add model instructions',{exact:true}).click();
  assert.equal(await importSetup.isDisabled(),false,'Allowing the instructions makes them importable');
  await page.getByText('Allow this setup to add model instructions',{exact:true}).click();
  await check('presets-setup-held');
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.alloc(65537,97)});
  await page.getByRole('alert').filter({hasText:'larger than 64 KB'}).waitFor();
  await check('presets-setup-oversized');
  await openScreen(page,'Transcripts');
  await page.getByRole('heading',{name:'Transcripts',exact:true}).waitFor();
  await presetCheck('transcripts','general');
  await openScreen(page,'Live');
  await page.getByText('For Transcripts and AI summary, shared with everyone at BEST Church workspace. Tell attendees when it’s on.',{exact:true}).waitFor();
  await presetCheck('live','general');

  // Sermon: the Transcripts tab and heading, the Live save hint, and the top bar while a service runs.
  await chooseFormat('builtin:sermon','Sermon');
  await openScreen(page,'Sermons');
  await page.getByRole('heading',{name:'Sermons',exact:true}).waitFor();
  await page.getByText('Saved sermons are kept for 7 days and shared with everyone at BEST Church workspace.',{exact:true}).waitFor();
  await presetCheck('transcripts','sermon');
  await openScreen(page,'Live');
  await page.getByText('For Sermons and AI summary, shared with everyone at BEST Church workspace. Tell the congregation when it’s on.',{exact:true}).waitFor();
  await presetCheck('live','sermon');
  await page.getByRole('button',{name:'Start captions',exact:true}).click();
  const sermonControls=page.getByRole('region',{name:'Live controls'});
  await sermonControls.getByRole('button',{name:'Pause',exact:true}).waitFor();
  assert.equal(await formatLink('Sermon').count(),0,'A running service shows the format as plain text, not a link');
  assert.equal(await formatNote('Sermon').count(),1,'A running service shows the format as a note');
  assert.equal(await topBarText(),'BEST Church workspace · Sermon · Main channel','The running top bar names Sermon');
  await sermonControls.getByRole('button',{name:/^End /}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:/^End /}).click();
  await page.getByRole('button',{name:'Start captions',exact:true}).waitFor();

  // Talkshow: the Transcripts tab and heading, the Live hint and the manual caption example.
  await chooseFormat('builtin:talkshow','Talkshow');
  await openScreen(page,'Episodes');
  await page.getByRole('heading',{name:'Episodes',exact:true}).waitFor();
  await presetCheck('transcripts','talkshow');
  await openScreen(page,'Live');
  await page.getByText('For Episodes and AI summary, shared with everyone at BEST Church workspace. Tell attendees when it’s on.',{exact:true}).waitFor();
  await presetCheck('live','talkshow');

  // Keynote: the Transcripts tab and heading, and the Live hint.
  await chooseFormat('builtin:keynote','Keynote');
  await openScreen(page,'Talks');
  await page.getByRole('heading',{name:'Talks',exact:true}).waitFor();
  await presetCheck('transcripts','keynote');
  await openScreen(page,'Live');
  await page.getByText('For Talks and AI summary, shared with everyone at BEST Church workspace. Tell attendees when it’s on.',{exact:true}).waitFor();
  await presetCheck('live','keynote');

  // Back to General saves it again.
  await chooseFormat('builtin:general','General');

  // Saved settings show as kept, and Apply preset sends only the format.
  sharedSetup={...emptySetup,...sharedSetup,updatedAt:Date.now(),outputBufferCount:null,outputBufferDwellMs:null,translationDefaults:{sourceLanguage:'auto',targetLanguage:'en',keywordText:'',filterText:'',recordingWindowMs:6000,inferenceLevel:'low',sanitizeLevel:'off',filterInappropriateLanguage:true},summaryDefaults:{model:'openai/gpt-oss-20b',language:'en',length:'short',guidance:''}};
  await page.reload();
  await openPresets();
  await page.getByRole('combobox',{name:'Format',exact:true}).selectOption('builtin:sermon');
  await page.getByRole('heading',{name:'What this format sets',exact:true}).waitFor();
  assert.equal(await page.getByText('Kept: saved for this workspace',{exact:true}).count(),5,'Caption wait, inference, sanitization, summary length and summary focus show as kept');
  await page.getByText('9 starter terms added',{exact:true}).waitFor();
  const keptSavesBefore=controls.length;
  await page.getByRole('button',{name:'Apply preset',exact:true}).click();
  await page.getByText('Sermon applied. Review the filled-in settings, then save each one for everyone.',{exact:true}).waitFor();
  assert.equal(controls.length,keptSavesBefore+1,'Apply preset writes once');
  assert.deepEqual(Object.keys(controls.at(-1).preferenceWrite),['profile'],'Apply preset sends only the format, so saved settings are not rewritten');
  await check('presets-kept',{general:false});
  // Differs from the format: saved settings that differ from Sermon are listed with the format's value; Use preset default fills a draft and saves nothing.
  await page.getByRole('heading',{name:'Differs from the format',exact:true}).waitFor();
  const useButtons=page.getByRole('button',{name:/^Use preset default for /});
  assert.equal(await useButtons.count(),5,'Caption wait, inference, sanitization, summary length and summary focus differ from Sermon; the unsaved output buffer is not listed');
  await page.getByText('Saved: 6 seconds: quickest, may break mid-sentence',{exact:true}).waitFor();
  await check('presets-differences',{general:false});
  const differencesSavesBefore=controls.length;
  await page.getByRole('button',{name:'Use preset default for Length',exact:true}).click();
  assert.equal(controls.length,differencesSavesBefore,'Use preset default saves nothing');
  assert.equal(await useButtons.count(),5,'The saved setting stays listed until it is saved');
  await openSettings(page,'summary');
  assert.equal(await page.locator('select[name="defaultSummaryLength"]').inputValue(),'detailed','Use preset default sets the summary length draft to the format value');
  // A Translation setting: the press names the change to review, and the Translator caption wait draft takes the format value; nothing is saved.
  await openPresets();
  await page.getByRole('button',{name:'Use preset default for Caption wait time',exact:true}).click();
  await page.getByText('Set as a change to review: Caption wait time',{exact:true}).waitFor();
  assert.equal(controls.length,differencesSavesBefore,'Use preset default for caption wait saves nothing');
  await openSettings(page,'translator');
  assert.equal(await page.locator('[data-testid="recording-window"]').first().inputValue(),'dynamic','Use preset default sets the caption wait draft to the format value');
  await page.reload();
  await openPresets();
  await chooseFormat('builtin:general','General');

  // Session format: the Start bar picks it, a running session fixes it, and Live, Transcripts and the top bar follow it while Settings keeps the workspace format.
  await openScreen(page,'Live');
  const sessionFormat=page.getByRole('combobox',{name:'Session format',exact:true});
  assert.deepEqual(await sessionFormat.locator('option').allTextContents(),['General','Sermon','Talkshow','Keynote'],'The Start bar offers the four formats');
  assert.equal(await sessionFormat.inputValue(),'builtin:general','The Start bar defaults to the workspace format');
  assert.equal(await sessionFormat.evaluate(node=>{const box=node.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth}),true,`${width}: the Start bar format select fits`);
  await check('live-session-format-idle');
  await sessionFormat.selectOption('builtin:talkshow');
  await page.getByRole('button',{name:'Start captions',exact:true}).click();
  const formatControls=page.getByRole('region',{name:'Live controls'});
  await formatControls.getByRole('button',{name:'End episode',exact:true}).waitFor();
  assert.equal(sessionStarts.at(-1).presetId,'builtin:talkshow','Start sends the chosen format');
  assert.equal(await sessionFormat.count(),0,'The Start bar choice is gone once the session runs');
  await page.locator('.sessionFormatRow').getByText('Talkshow',{exact:true}).waitFor();
  assert.equal(await topBarText(),'BEST Church workspace · Talkshow · Main channel','The top bar follows the running session');
  await formatNote('Talkshow').waitFor();
  await check('live-session-format-running',{general:false});
  // Settings keeps the workspace wording while the session runs.
  await openSettings(page,'summary');
  await page.getByText(/^Only for sessions with transcript saving on\./u).waitFor();
  assert.equal(await topBarText(),'BEST Church workspace · Talkshow · Main channel','The top bar still names the session on Settings');
  await check('settings-session-format',{general:false});
  // Transcripts follows the session.
  await openScreen(page,'Episodes');
  await page.getByRole('heading',{name:'Episodes',exact:true}).waitFor();
  await check('transcripts-session-format',{general:false});
  await openScreen(page,'Live');
  await formatControls.getByRole('button',{name:'End episode',exact:true}).click();
  const formatEnd=page.getByRole('alertdialog',{name:'End this episode?',exact:true});
  await formatEnd.waitFor();
  await formatEnd.getByRole('button',{name:'End episode',exact:true}).click();
  await page.getByRole('button',{name:'Start captions',exact:true}).waitFor();
  await formatLink('General').waitFor();
  assert.equal(await topBarText(),'BEST Church workspace · General · Main channel','The workspace format returns after End');
  assert.equal(await sessionFormat.inputValue(),'builtin:talkshow','The Start bar keeps the last choice until the page reloads');
  // Saved transcripts carry a format tag; one saved before formats reads General.
  historySessions=[
   {id:'22222222-2222-2222-2222-222222222222',startedAt:Date.now()-3600000,metadata:{topic:'Synthetic topic one',speaker:'',description:'',sessionAt:null},presetId:'builtin:sermon'},
   {id:'33333333-3333-3333-3333-333333333333',startedAt:Date.now()-7200000,metadata:{topic:'Synthetic topic two',speaker:'',description:'',sessionAt:null}},
  ];
  await openScreen(page,'Transcripts');
  await page.getByRole('button',{name:/Synthetic topic one/u}).waitFor();
  assert.deepEqual(await page.locator('.transcriptListItem .formatTag').allTextContents(),['Sermon','General'],'Each saved transcript shows its format');
  await check('transcripts-format-tag');
  historySessions=[];

  const result={width,colorScheme,errors,violations,checks:'idle Live, draft switch and empty state, no automatic default save, every Settings section, Transcripts, Help, per-screen addresses with Back/Forward/reload and legacy bookmarks, draft and consent persistence across screens, start/pause/resume/clear/end, Technical details cut rows, End dialog focus, pinned control bar clearance, second-tab take over, pending-change banner and Undo, live Quick override actions and Keep in Terms, Quick override capacity and no silent eviction, interface language selection/account persistence/account precedence/offline browser-copy fallback, presets (workspace name validation, save and reset, share setup errors, held model text, an oversized file, file preview and a confirmed import, chooser options and save body, differences list and Use preset default as a draft, top bar format link and note, Transcripts and Live wording for General, Sermon, Talkshow and Keynote), session format (Start bar select that fits at every width, read-only tag and top bar while running, wording that follows the running session on Live and Transcripts but not Settings, format tag on saved transcripts),no inference before Start or after End, responsive overflow and Axe'};
  await context.close();
 return result;
 };
const outcomes=await Promise.allSettled(QA_VIEWPORT_WIDTHS.map(runWidth));
const failures=outcomes.flatMap((outcome,index)=>outcome.status==='rejected'?[`${QA_VIEWPORT_WIDTHS[index]}px: ${outcome.reason?.message??outcome.reason}`]:[]);
results.push(...outcomes.flatMap(outcome=>outcome.status==='fulfilled'?[outcome.value]:[]));
if(failures.length) throw new Error(failures.join('\n'));
 await fs.writeFile(output+`/operator-results-${colorScheme}.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
 assert.ok(results.every(r=>r.errors.length===0&&r.violations.length===0));
} catch(error) {
 console.error('operator-ui failed:',error?.message??error);
 for(const context of browser.contexts()) for(const page of context.pages()) {
  await page.screenshot({path:output+'/failure.png',timeout:5000}).catch(()=>{});
 }
 throw error;
} finally {await browser.close()}
