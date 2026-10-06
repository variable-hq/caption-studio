import { openDashboardSection, openServicePanel, closeServicePanel, openTutorial } from "./dashboard-qa-helpers.mjs";
// Local synthetic UI checks. No provider calls or external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const tooling = process.env.CAPTION_QA_TOOLS_DIR;
assert.ok(tooling, 'Set CAPTION_QA_TOOLS_DIR to the isolated browser QA installation.');
const { chromium } = await import(pathToFileURL(path.join(tooling, 'node_modules/playwright/index.mjs')));
const { default: AxeBuilder } = await import(pathToFileURL(path.join(tooling, 'node_modules/@axe-core/playwright/dist/index.mjs')));
const output=path.resolve('test-results/service-panel');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const results=[];
try {
 for (const width of [1920,1200,390,320]) {
  const context=await browser.newContext({viewport:{width,height:width>500?1080:844},permissions:['microphone'],reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.addInitScript(() => localStorage.setItem("church-live-caption:operator-tutorial:v1", "dismissed"));
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
   else if(path==='/api/live/experience/preferences')payload=method==='GET'?{version:1,theme:'system',sidebarWidth:null,translationSystemPrompt:null,summaryDefaults:null,captionStyle:null,translationDefaults:null,tutorialDismissed:false,updatedAt:null}:{...body,version:1,updatedAt:Date.now()};
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
   else {errors.push('Unexpected mocked request: '+method+' '+path);return route.fulfill({status:400,json:{error:'Unexpected test request'}})}
   await route.fulfill({status:200,json:payload});
  });
  await page.goto('http://127.0.0.1:3100');
  await page.getByText('Cloud AI configured',{exact:true}).waitFor();
  const check=async section=>{
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${section} overflow`);
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   violations.push(...axe.violations.map(x=>({section,id:x.id,impact:x.impact,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
  };
  await check('overview');
  // Dashboard sections reorganized in PR #60: assert the rendered group runs, not only link presence.
  const navMenu=page.getByRole('button',{name:'Open navigation',exact:true});
  if(await navMenu.isVisible()) await navMenu.click();
  const sidebarGroups = (await page.getByRole('navigation', { name: 'Main navigation', exact: true })
   .locator('.rb-line-sidebar__group').evaluateAll(headers => headers.map(header => {
    const items=[];
    const first=header.closest('li');
    let item=first;
    while(item){
     if(item!==first && item.querySelector('.rb-line-sidebar__group')) break;
     const link=item.querySelector('a');
     if(link) items.push(link.textContent.trim());
     item=item.nextElementSibling;
    }
    return {name:header.textContent.trim(),items};
   }))).filter(group => group.name === 'Service' || group.name === 'Settings');
  assert.deepEqual(sidebarGroups, [
   {name:'Service',items:['Live outputs','Manual override','Sermon history','AI summary']},
   {name:'Settings',items:['AI Behavior','AI usage']},
  ]);
  if(await navMenu.count() && await navMenu.getAttribute('aria-expanded')==='true'){
   await page.keyboard.press('Escape');
   await page.getByRole('dialog',{name:'Workspace navigation'}).waitFor({state:'hidden'});
  }
  const barClear=async section=>{
   await page.evaluate(()=>{
    const controls=[...document.querySelectorAll('.dashboardContent button, .dashboardContent a, .dashboardContent select')].filter(el=>el.getClientRects().length&&!el.closest('details:not([open]) > :not(summary)'));
    const lowest=controls.reduce((a,b)=>b.getBoundingClientRect().bottom>a.getBoundingClientRect().bottom?b:a,controls[0]);
    lowest.scrollIntoView({block:'end'});
   });
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const geometry=await page.evaluate(()=>{
    const bar=document.querySelector('.dashboardStatusBar').getBoundingClientRect();
    const controls=[...document.querySelectorAll('.dashboardContent button, .dashboardContent a, .dashboardContent select')].filter(el=>el.getClientRects().length&&!el.closest('details:not([open]) > :not(summary)'));
    const lowestEl=controls.reduce((a,b)=>b.getBoundingClientRect().bottom>a.getBoundingClientRect().bottom?b:a,controls[0]);
    const lowest=lowestEl.getBoundingClientRect().bottom;
    return {lowest:Math.round(lowest),barTop:Math.round(bar.top),barHeight:Math.round(bar.height),what:lowestEl.textContent.trim().slice(0,40),within:lowestEl.closest('[id],[aria-label]')?.id||lowestEl.closest('[id],[aria-label]')?.getAttribute('aria-label'),scrollY:Math.round(scrollY),mainScroll:Math.round(document.querySelector('.dashboardMain')?.scrollTop??-1)};
   });
   assert.ok(geometry.lowest<=geometry.barTop,`${width}/${section}: docked bar (${geometry.barHeight}px) covers the lowest control (${geometry.lowest}px > ${geometry.barTop}px) ${JSON.stringify(geometry)}`);
   await page.evaluate(()=>window.scrollTo(0,0));
  };
  await barClear('overview');
  const serviceToggle=page.getByRole('button',{name:'Service controls',exact:true});
  assert.equal(await serviceToggle.getAttribute('aria-expanded'),'false');
  // Master Controls is reachable even collapsed; Start is enabled once setup is ready.
  assert.equal(await page.getByRole('button',{name:'Start captions',exact:true}).isEnabled(),true);
  assert.equal(await page.getByTestId('caption-preview').isVisible(),false);
  await openServicePanel(page);
  const servicePanel=page.getByRole('dialog',{name:'Service controls',exact:true});
  await check('service-panel');
  await page.screenshot({path:output+`/service-panel-${width}.png`});
  assert.equal(await page.getByRole('checkbox',{name:'Save transcript history for this service'}).isChecked(),false);
  assert.equal(inferenceCalls,0);
  if(width<1280){
   for(let i=0;i<16;i++){
    await page.keyboard.press(i<8?'Tab':'Shift+Tab');
    assert.ok(await page.evaluate(()=>Boolean(document.activeElement?.closest('#service-panel'))||!document.hasFocus()));
   }
  }
  await page.keyboard.press('Escape');
  await servicePanel.waitFor({state:'hidden'});
  assert.equal(await page.locator(':focus').getAttribute('aria-controls'),'service-panel');
  await openServicePanel(page);
  await page.setViewportSize({width:width<1280?1920:1200,height:844});
  await servicePanel.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.body.style.overflow!=='hidden');
  assert.equal(await serviceToggle.getAttribute('aria-expanded'),'false');
  await page.setViewportSize({width,height:width>500?1080:844});
  await openServicePanel(page);
  assert.equal(await page.locator('.serviceSnapshot').getAttribute('open'),null);
  await page.getByText('Starting configuration',{exact:true}).click();
  assert.match(await page.locator('.serviceSnapshot').innerText(),/English/);
  await page.getByText('Starting configuration',{exact:true}).click();
  await closeServicePanel(page);
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});
  await page.screenshot({path:output+`/operator-setup-${width}.png`,fullPage:true});
  for(const section of ['Audio input','Translation','Appearance','Live outputs','Manual override','Sermon history','AI summary','AI Behavior','AI usage']){
   await openDashboardSection(page, section);
   await page.waitForFunction(()=>document.activeElement?.id==='workspace-panel-heading');
   await check(section);
   assert.equal(await serviceToggle.getAttribute('aria-expanded'),'false');
   assert.equal(await page.getByRole('button',{name:'Start captions',exact:true}).isEnabled(),true);
   if(section==='Appearance'){
    const range=page.locator('input[type=range]').first();
    await range.fill('64');
    await range.dispatchEvent('input');
    assert.ok((await page.locator('.workspacePreview [data-testid="caption-preview"]').getAttribute('style')).includes('64px'));
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});
    await page.screenshot({path:output+`/operator-appearance-${width}.png`,fullPage:true});
   }
   if(section==='Live outputs')assert.equal(await page.getByLabel('Reusable OBS browser-source URL').isVisible(),false);
  }
  await openDashboardSection(page,'Manual override');
  assert.equal(await page.getByTestId('output-buffer-count').isVisible(),true);
  assert.equal(await page.getByTestId('output-buffer-count').isEnabled(),true);
  assert.equal(await page.locator('input[name="publicFilter"]').isVisible(),true);
  assert.equal(await page.locator('input[name="publicFilter"]').isEnabled(),true);
  assert.equal(await page.getByText('Start captions to use quick block, manual caption, or the output-buffer queue.',{exact:true}).isVisible(),true);
  assert.equal(await page.getByPlaceholder('Word to block now…').count(),0);
  await openDashboardSection(page,'AI usage');
  assert.equal(await page.getByText('Groq quota headroom',{exact:true}).isVisible(),true);
  assert.equal(await page.getByText('Current live service',{exact:true}).count(),0);
  await openDashboardSection(page,'AI Behavior');
  assert.equal(await page.getByTestId('inference-level').isVisible(),true);
  assert.equal(await page.locator('textarea[name="translationGuidance"]').isVisible(),true);
  // Drawer is modal, dismissible, and returns focus. Resizing unlocks the document.
  if(width < 981) {
   const menu=page.getByRole('button',{name:'Open navigation',exact:true});
   await menu.click();
   await page.getByRole('dialog',{name:'Workspace navigation'}).waitFor();
   await check('navigation-drawer');
   await page.screenshot({path:output+`/operator-navigation-${width}.png`});
   for(let i=0;i<12;i++){
    await page.keyboard.press(i<6?'Tab':'Shift+Tab');
    assert.ok(await page.evaluate(()=>Boolean(document.activeElement?.closest('#dashboard-navigation'))||!document.hasFocus()));
   }
   await page.keyboard.press('Escape');
   await page.waitForFunction(()=>document.body.style.overflow!=='hidden');
   assert.equal(await menu.getAttribute('aria-expanded'),'false');
   assert.equal(await page.locator(':focus').getAttribute('aria-label'),'Open navigation');
   await menu.click();
   await page.setViewportSize({width:1200,height:844});
   await page.getByRole('dialog',{name:'Workspace navigation'}).waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.body.style.overflow!=='hidden');
   assert.equal(await page.locator(':focus').getAttribute('aria-current'),'page');
   await page.setViewportSize({width,height:844});
  }
  await openDashboardSection(page, 'Overview');
  assert.equal(new URL(page.url()).hash,'#workspace=overview');
  await openDashboardSection(page, 'Translation');
  await page.getByTestId('target-language').selectOption('ja');
  await openDashboardSection(page, 'Appearance');
  await page.goBack();
  await page.getByTestId('target-language').waitFor();
  assert.equal(await page.getByTestId('target-language').inputValue(),'ja');
  await page.goForward();
  await page.getByRole('heading',{name:'Caption appearance',exact:true}).waitFor();
  await page.reload();
  await page.getByText('Cloud AI configured',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'Caption appearance',exact:true}).waitFor();
  assert.equal(inferenceCalls,0,'Dashboard navigation and reload must not invoke inference');
  await openDashboardSection(page, 'Overview');
  await openServicePanel(page);
  assert.equal(await page.getByRole('checkbox',{name:'Save transcript history for this service'}).isChecked(),false);
  await page.getByRole('checkbox',{name:'Save transcript history for this service'}).check();
  await openDashboardSection(page, 'Audio input');
  if(width>=1280) assert.equal(await serviceToggle.getAttribute('aria-expanded'),'true');
  await openServicePanel(page);
  assert.equal(await page.getByRole('checkbox',{name:'Save transcript history for this service'}).isChecked(),true);
  await page.getByRole('checkbox',{name:'Save transcript history for this service'}).uncheck();
  assert.equal(await page.getByTestId('caption-preview').count(),0,'The service panel no longer carries the preview');
  await openDashboardSection(page, 'Live outputs');
  assert.equal(await page.getByTestId('caption-preview').isVisible(),true);
  assert.match(await page.locator('.previewStage').getAttribute('style'),/scale\(/);
  assert.equal(inferenceCalls,0,'Opening the output monitor must not invoke inference');
  await openDashboardSection(page, 'Overview');
  await openServicePanel(page);
  await page.getByRole('button',{name:'Start captions',exact:true}).click();
  await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
  await closeServicePanel(page);
  assert.equal(await page.getByRole('button',{name:'Pause',exact:true}).isVisible(),true);
  const controlsBeforeToggle=controls.length;
  await openServicePanel(page);
  assert.equal(await page.getByRole('heading',{name:'Output',exact:true}).isVisible(),true);
  assert.equal(await serviceToggle.getAttribute('aria-expanded'),'true');
  await closeServicePanel(page);
  assert.equal(controls.length,controlsBeforeToggle,'Opening and closing service controls must not pause or clear capture');
  assert.equal(status,'live');
  await openTutorial(page);
  const picker=page.getByRole('combobox',{name:'Tutorial step',exact:true});
  if(await picker.isVisible()) await picker.selectOption('4');
  else await page.getByRole('button',{name:'Step 5: Audience',exact:true}).click();
  await page.getByRole('button',{name:'Open audience outputs',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='workspace-panel-heading');
  assert.equal(await page.locator(':focus').innerText(),'Live outputs');
  assert.ok(await page.locator('#workspace-panel-heading').evaluate(element=>{
   const rect=element.getBoundingClientRect();
   return document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===element;
  }), 'Live controls must not cover the destination heading');
  await openServicePanel(page);
  assert.equal(await page.getByTestId('caption-preview').count(),1,'Live outputs already shows the output monitor; the panel must not duplicate it');
  await closeServicePanel(page);
  if(width===1920){
   // A modified-click tab must not inherit the controller and pause the host.
   const controlsBefore=controls.length;
   const opened=context.waitForEvent('page');
   await page.getByRole('navigation',{name:'Main navigation',exact:true})
    .getByRole('link',{name:'AI usage',exact:true}).click({modifiers:[process.platform==='darwin'?'Meta':'Control']});
   const otherTab=await opened;
   await otherTab.getByText('Cloud AI configured',{exact:true}).waitFor();
   assert.equal(await otherTab.evaluate(()=>window.opener===null),true);
   await openServicePanel(otherTab);
   assert.equal(await otherTab.getByRole('button',{name:'Take over channel',exact:true}).count(),1);
   assert.equal(await otherTab.getByRole('button',{name:'Start captions',exact:true}).count(),0);
   // The watcher names the operator running the service and never reserves an attempt.
   await otherTab.getByText('operator@example.test is running this service',{exact:false}).first().waitFor();
   assert.equal(controls.length,controlsBefore);
   await otherTab.close();
  }
  await page.getByText('Advanced link security',{exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Rotate OBS link',exact:true}).isDisabled(),true);
  await page.getByText('Advanced link security',{exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Show test',exact:true}).count(),0);
  await page.locator('.outputDestination > summary').filter({hasText:'Reader and operator phone'}).click();
  assert.equal(await page.getByRole('button',{name:'Pair operator phone',exact:true}).isEnabled(),true);
  await barClear('live-outputs');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
  assert.ok(controls.includes('pause'));
  await check('paused');
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});
  await page.screenshot({path:output+`/operator-paused-${width}.png`,fullPage:true});
  await openDashboardSection(page, "Translation");
  await page.getByTestId('target-language').selectOption('ja');
  await openServicePanel(page);
  assert.match(await page.locator('.serviceSnapshot').innerText(),/Indonesian/);
  assert.match(await page.locator('.serviceSnapshot').innerText(),/not active/);
  await closeServicePanel(page);
  await openDashboardSection(page, 'Sermon history');
  assert.equal(await page.locator('.pendingSettingsBar').isVisible(),true);
  assert.equal(await page.locator('.translationRefreshNotice').count(),0);
  assert.equal(await page.getByTestId('caption-preview').isVisible(),false);
  await page.getByRole('button',{name:'Review changes',exact:true}).click();
  await page.getByTestId('target-language').waitFor();
  assert.equal(await page.getByTestId('target-language').inputValue(),'ja');
  await page.getByRole('button',{name:'Clear live caption',exact:true}).click();
  assert.ok(controls.includes('clear'));
  await openServicePanel(page);
  const endServiceButton=page.getByRole('button',{name:'End service',exact:true});
  await endServiceButton.click();
  await page.getByRole('dialog',{name:'End captions for everyone?',exact:true}).waitFor();
  await check('end-dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog',{name:'End captions for everyone?',exact:true}).isVisible(),false);
  assert.equal(await page.locator(':focus').innerText(),'End service');
  await endServiceButton.click();
  await page.getByRole('button',{name:'Confirm End',exact:true}).click();
  await page.getByRole('button',{name:'Start captions',exact:true}).waitFor();
  assert.equal(status,'idle');
  // Re-start only after the original service lifecycle regression checks have finished.
  await openDashboardSection(page,'Overview');
  await openServicePanel(page);
  await page.getByRole('button',{name:'Start captions',exact:true}).click();
  await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
  await closeServicePanel(page);
  await openDashboardSection(page,'AI Behavior');
  await page.getByTestId('inference-level').selectOption('high');
  assert.equal(await page.locator('.translationRefreshNotice').isVisible(),true,'Changing inference level during a service must mark AI Behavior pending');
  await openDashboardSection(page,'Manual override');
  await page.locator('input[name="publicFilter"]').fill('synthetic filter');
  assert.equal(await page.locator('.translationRefreshNotice').isVisible(),true,'Manual override must show its own translation pending review UI');
  await page.locator('input[name="quickBlockTerm"]').fill('synthetic-block-term');
  await page.getByRole('button',{name:'Block now',exact:true}).click();
  assert.equal(await page.getByText('synthetic-block-term',{exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'Remove',exact:true}).click();
  assert.equal(await page.getByText('synthetic-block-term',{exact:true}).count(),0);
  for(const section of ['Live outputs','Manual override','Sermon history','AI summary','AI Behavior','AI usage']){
   await openDashboardSection(page,section);
   await openServicePanel(page);
   assert.equal(await page.getByTestId('caption-preview').count(),1,`${section}: output monitor must appear exactly once`);
   assert.equal(await page.getByRole('heading',{name:'Output',exact:true}).isVisible(),true);
   const usage=page.getByRole('heading',{name:'Usage',exact:true});
   assert.equal(await usage.isVisible(),true);
   assert.equal(await usage.locator('xpath=ancestor::section[1]').evaluate(el=>el.parentElement.lastElementChild===el),true,'Usage must be the final service panel section');
   assert.equal(await page.locator('.usageSummaryGrid .usageMetricCard').count(),4);
   await closeServicePanel(page);
  }
  assert.equal(inferenceCalls,0,'Dashboard state checks must not invoke inference');
  results.push({width,errors,violations,checks:'collapsed service panel across pages, modal/docked focus and resizing, consent persistence, quick live controls, contextual preview and settings notices, dashboard reorg sidebar grouping, Manual override states, AI Behavior pending notice, output-monitor deduplication across sections, output disclosures, overview, linked destinations and Back/Forward/reload, navigation without inference, mobile drawer and focus/resize, history consent preservation, sharing/archive separation, setup sections, immediate appearance preview, hidden OBS token, focus, start/pause/clear/end, draft isolation, responsive overflow'});
  await context.close();
 }
 await fs.writeFile(output+'/operator-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
 assert.ok(results.every(r=>r.errors.length===0&&r.violations.length===0));
} catch(error) {
 console.error('operator-ui-qa failed:',error?.message??error);
 for(const context of browser.contexts()) for(const page of context.pages()) {
  await page.screenshot({path:output+'/failure.png',timeout:5000}).catch(()=>{});
  console.log(await page.evaluate(()=>({focus:document.activeElement?.outerHTML.slice(0,200),scrollY,bodyOverflow:document.body.style.overflow,panel:document.querySelector('#service-panel')?.getBoundingClientRect().toJSON(),checkbox:document.querySelector('[name=saveTranscript]')?.getBoundingClientRect().toJSON()})));
 }
 throw error;
} finally {await browser.close()}
