import { CAPTION_WAIT_TIME_LABELS, QA_VIEWPORT_WIDTHS, SETTINGS_SECTIONS, openScreen, openSettings } from "./dashboard-helpers.mjs";
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
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const results=[];
try {
 for (const width of QA_VIEWPORT_WIDTHS) {
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
  const emptySetup={version:1,uiLocale:null,translationSystemPrompt:null,summaryDefaults:null,captionStyle:null,translationDefaults:null,outputBufferCount:null,outputBufferDwellMs:null,saveHistoryDefault:null,autoSummary:false,updatedAt:null};
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='http://127.0.0.1:3100') return route.abort();
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
   else if(path==='/api/live/channel')payload={channelId:'main',configured:true,status,overlayUrl:'http://127.0.0.1:3100/overlay#main.'+'o'.repeat(43),style,startedAt,expiresAt,transcriptionRequests,llmUsage:emptyUsage,translationRevision:0};
   else if(path==='/api/live/channel/style'){style=body.style;payload={ok:true}}
   else if(path==='/api/live/channel/session'&&method==='POST'){
    status='live';startedAt=new Date().toISOString();expiresAt=new Date(Date.now()+90*60000).toISOString();
    payload={channelId:'main',controllerToken:'c'.repeat(43),viewerUrl:'http://127.0.0.1:3100/view#main.'+'v'.repeat(43),startedAt,expiresAt,translationRevision:0};
   } else if(path==='/api/live/channel/session'&&method==='DELETE'){status='idle';startedAt=null;expiresAt=null;payload={ok:true}}
   else if(path==='/api/live/channel/control'){
    controls.push(body.action);if(body.action==='pause')status='paused';if(body.action==='resume')status='live';
    payload={action:body.action,status,translationRevision:0,sequence:1};
   } else if(path==='/api/live/channel/observer'&&method==='POST'){
    // A second tab of the same workspace watches the running service read-only.
    payload={channelId:'main',sessionId:'11111111-1111-1111-1111-111111111111',saveHistory:false,
     controllerLabel:'operator@example.test',status:status==='paused'?'paused':'live',
     observerToken:'w'.repeat(43),viewerUrl:'http://127.0.0.1:3100/view#main.'+'w'.repeat(43),
     startedAt,expiresAt,translationRevision:0};
   } else if(path==='/api/live/channel/lease')payload={valid:true,status:'live',expiresAt,transcriptionRequests:++transcriptionRequests,translationRevision:0};
   else if(path==='/api/ai/transcribe'){inferenceCalls++;payload={segments:[]};}
   else if(path==='/api/live/experience/usage')payload={records:[],next:null};
   else if(path==='/api/live/experience/history')payload={sessions:[],services:[]};
   else {errors.push('Unexpected mocked request: '+method+' '+path);return route.fulfill({status:400,json:{error:'Unexpected test request'}})}
   await route.fulfill({status:200,json:payload});
  });
  await page.goto('http://127.0.0.1:3100');
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
  const check=async screen=>{
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${screen} overflow`);
   if(/^(live|transcripts|help)/.test(screen)) await assertSessionWording(page,screen);
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
  await page.screenshot({path:output+`/live-idle-${colorScheme}-${width}.png`,fullPage:true});

  for(const section of SETTINGS_SECTIONS){
   await openSettings(page,section);
   await check(`settings-${section}`);
   if(section==='look'){
    const range=page.locator('input[type=range]').first();
    await range.fill('64');
    await range.dispatchEvent('input');
    assert.ok((await page.getByTestId('caption-preview').first().getAttribute('style')).includes('64px'));
    await page.screenshot({path:output+`/settings-look-${colorScheme}-${width}.png`,fullPage:true});
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
  await page.goto('http://127.0.0.1:3100/#workspace=history');
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
  await check('live-running');
  await barClear('live-running');
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
  await page.screenshot({path:output+`/live-running-${colorScheme}-${width}.png`,fullPage:true});
  // Moving to Settings and back never pauses or clears capture.
  const controlsBefore=controls.length;
  await openSettings(page,'usage');
  await openScreen(page,'Live');
  assert.equal(controls.length,controlsBefore);

  // A second tab watches the running session: it names the operator and offers Take over, not Start.
  const other=await context.newPage();
  await other.goto('http://127.0.0.1:3100/#live');
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
  if(width===1920) await page.screenshot({path:output+`/quick-override-${colorScheme}-${width}.png`,fullPage:true});
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
  results.push({width,colorScheme,errors,violations,checks:'idle Live, draft switch and empty state, no automatic default save, every Settings section, Transcripts, Help, per-screen addresses with Back/Forward/reload and legacy bookmarks, draft and consent persistence across screens, start/pause/resume/clear/end, Technical details cut rows, End dialog focus, pinned control bar clearance, second-tab take over, pending-change banner and Undo, live Quick override actions and Keep in Terms, Quick override capacity and no silent eviction, interface language selection/account persistence/account precedence/offline browser-copy fallback, no inference before Start or after End, responsive overflow and Axe'});
  await context.close();
 }
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
