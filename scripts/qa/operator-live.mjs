import { QA_ORIGIN, captureScreenshot, openScreen, openSettings } from './dashboard-helpers.mjs';
import assert from 'node:assert/strict';
import { runOperatorArea } from './operator-harness.mjs';

await runOperatorArea({
  name: 'live',
  checks: "idle Live (Live drafts, draft switch and empty state, Start bar, shared save with one write, no inference), running Live (Technical details cut rows, Start bar gone, live shared save, Clear screen, pause and resume, pinned control bar clearance, second-tab take over, Apply now and Undo for language, format and Use preset default, Keep in Terms and quick overrides with capacity, End dialog focus and end), overflow at every width, Axe on idle and running Live and the End dialog",
  contrastScreens: [{ address: 'live', ready: (page) => page.getByText('Ready to go', { exact: true }) }],
  async body({ page, context, width, colorScheme, output, mock, check, barClear, formatLink, formatNote, topBarText, assertSessionWording, controls }) {
  assert.equal(await page.getByRole('switch',{name:'Live drafts',exact:true}).count(),0,'Live drafts is no longer a user-visible setting');
  assert.equal(await page.locator('.heardText').count(),1,'The Heard pane remains the in-progress source view');
  assert.equal(await page.locator('.liveDraftLine').count(),0,'No separate draft line remains');
  assert.equal(await page.locator('.heardText[data-in-progress="true"]').count(),0,'An idle pane shows no in-progress draft');
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
  assert.equal(mock.inferenceCalls,0,'Idle Live must not invoke inference');
  await captureScreenshot(page,{path:output+`/live-idle-${colorScheme}-${width}.png`,fullPage:true});

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
  assert.equal(mock.status,'live');
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
  await check('live-paused',{scan:false});
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
  mock.sharedSetup={...mock.sharedSetup,updatedAt:Date.now(),profile:'builtin:keynote',translationDefaults:{sourceLanguage:'auto',targetLanguage:'en',keywordText:'',filterText:'',recordingWindowMs:6000,inferenceLevel:'low',sanitizeLevel:'off',filterInappropriateLanguage:true}};
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
  await check('quick-override-capacity',{scan:false});

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
  assert.equal(mock.status,'idle');
  },
});
