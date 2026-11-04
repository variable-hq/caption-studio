import { openScreen, openSettings } from './dashboard-helpers.mjs';
import assert from 'node:assert/strict';
import { runOperatorArea } from './operator-harness.mjs';

await runOperatorArea({
  name: 'presets',
  checks: "Presets: the chooser and its save body, the workspace name (invalid and saved), the setup share (errors, held model text, an oversized file, preview and import), custom presets created, edited and deleted with locked and full plan states, General, Sermon, Talkshow and Keynote applied with Sermon end to end (Transcripts, Live, top bar, running service), kept and differing settings with Use preset default as a draft, the session format on Live and Transcripts; overflow at every width, Axe on the Presets screen, its custom preset editor and the differences list",
  contrastScreens: [{ address: 'settings=presets', ready: (page) => page.getByRole('heading', { name: 'Presets', exact: true }) }],
  async body({ page, width, mock, check, formatLink, formatNote, topBarText, controls, presetWrites, sessionStarts, emptySetup }) {
  // Presets: Settings › Presets saves the format for everyone; the top bar, Transcripts, Live and Help follow it.
  // The account keeps English across the reload that loads its preferences again.
  mock.accountPreferencesUnavailable=false;
  await openSettings(page,'languages');
  await page.getByRole('combobox',{name:'Interface language',exact:true}).selectOption('en');
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  await page.evaluate(()=>localStorage.removeItem('caption-studio:ui-locale:v1'));
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  await formatLink('General').waitFor();
  const presetCheck=(screen,slug,scan=false)=>check(`${screen}-${slug}`,{general:slug==='general',scan});
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
   // The top bar's format name for every format is checked in vitest; the browser checks Sermon end to end.
   if(profileId==='builtin:sermon') assert.equal(await topBarText(),`BEST Church workspace · ${name} · Main channel`,`The top bar names ${name}`);
  };
  // General is the default: the top bar links to Presets, and the chooser offers the four formats.
  await formatLink('General').click();
  await page.getByRole('heading',{name:'Presets',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'#settings=presets','The format link opens Settings › Presets');
  const formatSelect=page.getByRole('combobox',{name:'Format',exact:true});
  assert.deepEqual(await formatSelect.locator('option').allTextContents(),['General','Sermon','Talkshow','Keynote'],'The chooser lists the four built-in formats');
  assert.equal(await formatSelect.inputValue(),'builtin:general','General is the default format');
  await page.getByText('The base wording, used when no format is chosen.',{exact:true}).waitFor();
  await presetCheck('presets','general',true);
  // Workspace name: text with a control character or over 60 characters is refused; a valid name is saved for everyone and reaches the top bar; an empty name restores the default.
  const workspaceName=page.getByRole('textbox',{name:'Workspace name',exact:true});
  const saveWorkspaceName=page.getByRole('button',{name:'Save for everyone',exact:true});
  await workspaceName.fill('x'.repeat(61));
  await page.getByText('Use up to 60 characters, without line breaks or other control characters.',{exact:true}).waitFor();
  assert.equal(await saveWorkspaceName.isDisabled(),true,'An over-long workspace name cannot be saved');
  await check('presets-workspace-name-invalid',{scan:false});
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
  await check('presets-setup-error',{scan:false});
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
  await check('presets-setup-held',{scan:false});
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.alloc(65537,97)});
  await page.getByRole('alert').filter({hasText:'larger than 64 KB'}).waitFor();
  await check('presets-setup-oversized',{scan:false});
  // Custom presets: create one from Sermon, edit it, delete it. The chooser and the Start bar list them; a plan with no room blocks a new one.
  await page.getByRole('button',{name:'New preset',exact:true}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Retreat');
  await page.getByRole('combobox',{name:'Start from',exact:true}).selectOption('builtin:sermon');
  await page.getByRole('button',{name:'Save preset',exact:true}).click();
  await page.getByRole('button',{name:'Edit: Retreat',exact:true}).waitFor();
  assert.equal(presetWrites.at(-1).action,'create','Saving a new preset sends a create command');
  assert.equal(presetWrites.at(-1).preset.id,undefined,'The server assigns the id of a new preset');
  await page.getByText('1 of 5 used',{exact:true}).waitFor();
  assert.deepEqual(await formatSelect.locator('option').allTextContents(),['General','Sermon','Talkshow','Keynote','Retreat'],'The chooser lists the custom preset after the built-ins');
  await check('presets-custom-created');
  await page.getByRole('button',{name:'Edit: Retreat',exact:true}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Retreat weekend');
  await page.getByRole('button',{name:'Save preset',exact:true}).click();
  await page.getByRole('button',{name:'Edit: Retreat weekend',exact:true}).waitFor();
  assert.equal(presetWrites.at(-1).action,'update','Saving an existing preset sends an update command');
  await page.getByRole('button',{name:'Edit: Retreat weekend',exact:true}).click();
  await page.getByRole('button',{name:'Delete preset',exact:true}).click();
  await page.getByRole('button',{name:'Confirm delete',exact:true}).click();
  await page.getByText('Preset deleted.',{exact:true}).waitFor();
  assert.equal(presetWrites.at(-1).action,'delete','Deleting a preset needs a second click and sends a delete command');
  await page.getByText('0 of 5 used',{exact:true}).waitFor();
  mock.presetMax=0;
  await page.reload();
  await openSettings(page,'presets');
  await page.getByText('Your workspace plan does not include custom presets.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'New preset',exact:true}).isDisabled(),true,'A plan with no custom presets disables New preset');
  await check('presets-custom-locked',{scan:false});
  mock.presetMax=1;
  await page.reload();
  await openSettings(page,'presets');
  await page.getByRole('button',{name:'New preset',exact:true}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Camp');
  await page.getByRole('button',{name:'Save preset',exact:true}).click();
  await page.getByRole('button',{name:'Edit: Camp',exact:true}).waitFor();
  await page.getByText('The 1 custom preset is in use. Delete it to add another.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'New preset',exact:true}).isDisabled(),true,'A full plan disables New preset');
  await check('presets-custom-full',{scan:false});
  mock.presetMax=5;
  await page.reload();
  await openSettings(page,'presets');
  await page.getByRole('button',{name:'Edit: Camp',exact:true}).waitFor();
  await openScreen(page,'Live');
  await page.getByRole('combobox',{name:'Session format',exact:true}).locator('option',{hasText:'Camp'}).waitFor({state:'attached'});
  await openScreen(page,'Settings');
  await openSettings(page,'presets');
  await page.getByRole('button',{name:'Edit: Camp',exact:true}).click();
  await page.getByRole('button',{name:'Delete preset',exact:true}).click();
  await page.getByRole('button',{name:'Confirm delete',exact:true}).click();
  await page.getByText('Preset deleted.',{exact:true}).waitFor();
  await openScreen(page,'Transcripts');
  await presetCheck('transcripts','general');
  await openScreen(page,'Live');
  await presetCheck('live','general');

  // Sermon is the non-General format end to end: its Transcripts and Live wording, and the top bar while a service runs.
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

  // Talkshow and Keynote: their wording is checked in vitest; the browser checks each screen's overflow.
  await chooseFormat('builtin:talkshow','Talkshow');
  await openScreen(page,'Episodes');
  await presetCheck('transcripts','talkshow');
  await openScreen(page,'Live');
  await presetCheck('live','talkshow');

  await chooseFormat('builtin:keynote','Keynote');
  await openScreen(page,'Talks');
  await presetCheck('transcripts','keynote');
  await openScreen(page,'Live');
  await presetCheck('live','keynote');

  // Back to General saves it again.
  await chooseFormat('builtin:general','General');

  // Saved settings show as kept, and Apply preset sends only the format.
  mock.sharedSetup={...emptySetup,...mock.sharedSetup,updatedAt:Date.now(),outputBufferCount:null,outputBufferDwellMs:null,translationDefaults:{sourceLanguage:'auto',targetLanguage:'en',keywordText:'',filterText:'',recordingWindowMs:6000,inferenceLevel:'low',sanitizeLevel:'off',filterInappropriateLanguage:true},summaryDefaults:{model:'openai/gpt-oss-20b',language:'en',length:'short',guidance:''}};
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
  await check('presets-kept',{general:false,scan:false});
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
  await check('live-session-format-idle',{scan:false});
  await sessionFormat.selectOption('builtin:talkshow');
  await page.getByRole('button',{name:'Start captions',exact:true}).click();
  const formatControls=page.getByRole('region',{name:'Live controls'});
  await formatControls.getByRole('button',{name:'End episode',exact:true}).waitFor();
  assert.equal(sessionStarts.at(-1).presetId,'builtin:talkshow','Start sends the chosen format');
  assert.equal(await sessionFormat.count(),0,'The Start bar choice is gone once the session runs');
  await page.locator('.sessionFormatRow').getByText('Talkshow',{exact:true}).waitFor();
  assert.equal(await topBarText(),'BEST Church workspace · Talkshow · Main channel','The top bar follows the running session');
  await formatNote('Talkshow').waitFor();
  await check('live-session-format-running',{general:false,scan:false});
  // Settings keeps the workspace wording while the session runs.
  await openSettings(page,'summary');
  await page.getByText(/^Only for sessions with transcript saving on\./u).waitFor();
  assert.equal(await topBarText(),'BEST Church workspace · Talkshow · Main channel','The top bar still names the session on Settings');
  await check('settings-session-format',{general:false,scan:false});
  // Transcripts follows the session.
  await openScreen(page,'Episodes');
  await page.getByRole('heading',{name:'Episodes',exact:true}).waitFor();
  await check('transcripts-session-format',{general:false,scan:false});
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
  mock.historySessions=[
   {id:'22222222-2222-2222-2222-222222222222',startedAt:Date.now()-3600000,metadata:{topic:'Synthetic topic one',speaker:'',description:'',sessionAt:null},presetId:'builtin:sermon'},
   {id:'33333333-3333-3333-3333-333333333333',startedAt:Date.now()-7200000,metadata:{topic:'Synthetic topic two',speaker:'',description:'',sessionAt:null}},
  ];
  await openScreen(page,'Transcripts');
  await page.getByRole('button',{name:/Synthetic topic one/u}).waitFor();
  assert.deepEqual(await page.locator('.transcriptListItem .formatTag').allTextContents(),['Sermon','General'],'Each saved transcript shows its format');
  await check('transcripts-format-tag',{scan:false});
  mock.historySessions=[];

  },
});
