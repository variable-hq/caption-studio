// Local synthetic UI checks. No provider calls or external requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const tooling = process.env.CAPTION_QA_TOOLS_DIR;
assert.ok(tooling, 'Set CAPTION_QA_TOOLS_DIR to the isolated browser QA installation.');
const { chromium } = await import(pathToFileURL(path.join(tooling, 'node_modules/playwright/index.mjs')));
const { default: AxeBuilder } = await import(pathToFileURL(path.join(tooling, 'node_modules/@axe-core/playwright/dist/index.mjs')));
const output=path.resolve('test-results/ui-optimisation');
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
  let status='idle';let startedAt=null;let expiresAt=null;let transcriptionRequests=0;
  let style={fontSize:48,textColor:'#ffffff',backgroundColor:'#101827',backgroundTransparency:0,horizontalMarginPercent:4,verticalMarginPercent:6,horizontalAlign:'center',verticalAlign:'bottom',fontFamily:'sans-serif'};
  const health={status:'ready',hosting:'cloudflare',access:{ready:true,provider:'Cloudflare Access'},transcription:{ready:true,model:'whisper-large-v3-turbo'},translation:{ready:true,model:'openai/gpt-oss-20b'}};
  const emptyUsage={promptTokens:0,completionTokens:0,totalTokens:0,translationRequests:0,providerRateLimit:null};
  const controls=[];
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='http://127.0.0.1:3100') return route.abort();
   if(!url.pathname.startsWith('/api/')) return route.continue();
   const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
   let body={};try{body=request.postDataJSON()??{}}catch{}
   let payload={};
   if(path==='/api/ai/health'||path==='/api/ai/readiness')payload=health;
   else if(path==='/api/live/channel')payload={channelId:'main',configured:true,status,overlayUrl:'http://127.0.0.1:3100/overlay#main.'+'o'.repeat(43),style,startedAt,expiresAt,transcriptionRequests,llmUsage:emptyUsage,translationRevision:0};
   else if(path==='/api/live/channel/style'){style=body.style;payload={ok:true}}
   else if(path==='/api/live/channel/service'&&method==='POST'){
    status='live';startedAt=new Date().toISOString();expiresAt=new Date(Date.now()+90*60000).toISOString();
    payload={channelId:'main',controllerToken:'c'.repeat(43),viewerUrl:'http://127.0.0.1:3100/view#main.'+'v'.repeat(43),startedAt,expiresAt,translationRevision:0};
   } else if(path==='/api/live/channel/service'&&method==='DELETE'){status='idle';startedAt=null;expiresAt=null;payload={ok:true}}
   else if(path==='/api/live/channel/control'){
    controls.push(body.action);if(body.action==='pause')status='paused';if(body.action==='resume')status='live';
    payload={action:body.action,status,translationRevision:0,sequence:1};
   } else if(path==='/api/live/channel/lease')payload={valid:true,status:'live',expiresAt,transcriptionRequests:++transcriptionRequests,translationRevision:0};
   else if(path==='/api/ai/transcribe')payload={segments:[]};
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
  await check('audio');
  assert.equal(await page.locator('.serviceSnapshot').getAttribute('open'),null);
  await page.getByText('Starting configuration',{exact:true}).click();
  assert.match(await page.locator('.serviceSnapshot').innerText(),/English/);
  await page.getByText('Starting configuration',{exact:true}).click();
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});
  await page.screenshot({path:output+`/operator-setup-${width}.png`,fullPage:true});
  for(const section of ['Translation','Appearance','Live outputs','AI usage','AI instructions']){
   await page.getByRole('navigation',{name:'Service setup sections'}).getByRole('button',{name:new RegExp(section)}).click();
   await page.waitForFunction(()=>document.activeElement?.id==='workspace-panel-heading');
   await check(section);
   if(section==='Appearance'){
    const range=page.locator('input[type=range]').first();
    await range.fill('64');
    await range.dispatchEvent('input');
    assert.ok((await page.getByTestId('caption-preview').getAttribute('style')).includes('64px'));
    await page.screenshot({path:output+`/operator-appearance-${width}.png`,fullPage:true});
   }
   if(section==='Live outputs')assert.equal(await page.getByLabel('Reusable OBS browser-source URL').isVisible(),false);
  }
  await page.getByRole('button',{name:'Start captions',exact:true}).click();
  await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
  await page.getByRole('button',{name:'How to use',exact:true}).click();
  const picker=page.getByRole('combobox',{name:'Tutorial step',exact:true});
  if(await picker.isVisible()) await picker.selectOption('4');
  else await page.getByRole('button',{name:'Step 5: Audience',exact:true}).click();
  await page.getByRole('button',{name:'Open audience outputs',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='workspace-panel-heading');
  assert.equal(await page.locator(':focus').innerText(),'Mobile translation viewer');
  assert.ok(await page.locator('#workspace-panel-heading').evaluate(element=>{
   const rect=element.getBoundingClientRect();
   return document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===element;
  }), 'Live controls must not cover the destination heading');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
  assert.ok(controls.includes('pause'));
  await check('paused');
  await page.screenshot({path:output+`/operator-paused-${width}.png`,fullPage:true});
  await page.getByRole('navigation',{name:'Live caption sections'}).getByRole('button',{name:/Translation/}).click();
  await page.getByTestId('target-language').selectOption('ja');
  assert.match(await page.locator('.serviceSnapshot').innerText(),/Indonesian/);
  assert.match(await page.locator('.serviceSnapshot').innerText(),/not active/);
  await page.getByRole('button',{name:'Clear live caption',exact:true}).click();
  assert.ok(controls.includes('clear'));
  await page.getByRole('button',{name:'End service',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await check('end-dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').isVisible(),false);
  assert.equal(await page.locator(':focus').innerText(),'End service');
  await page.getByRole('button',{name:'End service',exact:true}).click();
  await page.getByRole('button',{name:'Confirm End',exact:true}).click();
  await page.getByRole('button',{name:'Start captions',exact:true}).waitFor();
  assert.equal(status,'idle');
  results.push({width,errors,violations,checks:'setup sections, immediate appearance preview, hidden OBS token, focus, start/pause/clear/end, draft isolation, responsive overflow'});
  await context.close();
 }
 await fs.writeFile(output+'/operator-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
 assert.ok(results.every(r=>r.errors.length===0&&r.violations.length===0));
} finally {await browser.close()}
