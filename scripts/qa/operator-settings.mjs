import { CAPTION_WAIT_TIME_LABELS, QA_ORIGIN, SETTINGS_LABELS, SETTINGS_SECTIONS, captureScreenshot, openScreen, openSettings } from './dashboard-helpers.mjs';
import assert from 'node:assert/strict';
import { runOperatorArea } from './operator-harness.mjs';

// Every Settings section but Presets gets an Axe scan; Presets is scanned in the presets area.
const AXE_SETTINGS = ['computer', 'languages', 'look', 'obs', 'translator', 'summary', 'providers', 'words', 'usage'];

await runOperatorArea({
  name: 'settings',
  checks: "every Settings section except Presets (its fields, Save for everyone, Interface language placement, Usage, Terms import and paste, file choice and unsent paste), per-screen addresses with Back, Forward and reload, legacy bookmarks, draft and consent persistence across screens, interface language selection, account persistence, account precedence and offline browser-copy fallback, overflow at every width, Axe on the System, Language, Output, OBS, Translation, Summary, AI providers, Terms and Usage sections",
  contrastScreens: SETTINGS_SECTIONS.filter((section) => section !== 'presets').map((section) => ({ address: `settings=${section}`, ready: (page) => page.getByRole('heading', { name: SETTINGS_LABELS[section], exact: true }) })),
  async body({ page, width, colorScheme, output, mock, check }) {
  for(const section of SETTINGS_SECTIONS){
   await openSettings(page,section);
   await check(`settings-${section}`,{scan:AXE_SETTINGS.includes(section)});
   if(section!=='look') await captureScreenshot(page,{path:output+`/settings-${section}-${colorScheme}-${width}.png`,fullPage:true});
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
  assert.equal(mock.inferenceCalls,0,'Navigation and reload must not invoke inference');
  // Live capture may or may not finish a window in this mocked run; only dashboard
  // actions outside capture are required to stay free of inference.
  mock.inferenceCalls=0;
  await openSettings(page,'languages');
  await page.getByRole('combobox',{name:'Interface language',exact:true}).selectOption('id');
  await page.waitForFunction(()=>document.documentElement.lang==='id');
  assert.equal(await page.locator('.operatorTabs').getByRole('link',{name:'Pengaturan',exact:true}).count(),1);
  assert.equal(await page.locator('.operatorTabs').getByRole('link',{name:'Transkrip',exact:true}).count(),1);
  assert.equal(mock.inferenceCalls,0,'Settings after End must not invoke inference');
  await check('settings-interface-language-id',{scan:false});
  await page.evaluate(()=>localStorage.setItem('caption-studio:ui-locale:v1','en'));
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.lang==='id');
  assert.equal(await page.locator('.operatorTabs').getByRole('link',{name:'Pengaturan',exact:true}).count(),1,'Account locale persists after reload');
  mock.accountPreferencesUnavailable=true;
  await page.evaluate(()=>localStorage.setItem('caption-studio:ui-locale:v1','id'));
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.lang==='id');
  assert.equal(await page.locator('.operatorTabs').getByRole('link',{name:'Pengaturan',exact:true}).count(),1,'Browser copy applies when account preferences are unavailable');
  await page.getByRole('combobox',{name:'Bahasa antarmuka',exact:true}).selectOption('');
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  },
});
