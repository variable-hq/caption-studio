import { openScreen } from './dashboard-helpers.mjs';
import { runOperatorArea } from './operator-harness.mjs';

await runOperatorArea({
  name: 'transcripts',
  checks: "Transcripts and Help screens: overflow at every width and Axe at the widths in AXE_WIDTHS",
  contrastScreens: [{ address: 'transcripts', ready: (page) => page.getByRole('heading', { name: 'Transcripts', exact: true }) }, { address: 'help', ready: (page) => page.getByRole('heading', { name: 'How it works', exact: true }) }],
  async body({ page, check }) {
  await openScreen(page,'Transcripts'); await check('transcripts');
  await page.getByRole('link',{name:'Help',exact:true}).click();
  await page.getByRole('heading',{name:'How it works',exact:true}).waitFor(); await check('help');

  },
});
