const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'executions.html'), 'utf8');

function renderGpsShell() {
  const start = html.indexOf('function pgmShell()');
  const end = html.indexOf('function pgmStopReads()', start);
  assert.ok(start >= 0 && end > start, 'GPS shell function exists');
  // Render only the shell with inert test data. Never initialize Firebase or
  // run the page's authentication, GPS commands, or fuel-record handlers.
  return vm.runInNewContext(`${html.slice(start, end)}\npgmShell();`, {
    PGM_LIMIT: 60,
    PGM_DRIVERS: [],
    pgmCard: () => '',
    pgmFuelCard: () => '',
  });
}

test('GPS Admin uses the permanent production dashboard URL on every render', () => {
  for (let render = 0; render < 2; render++) {
    const shell = renderGpsShell();
    const links = [...shell.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
      .filter((match) => match[2].includes('Open Full GPS Admin Dashboard'));
    assert.equal(links.length, 1, 'Exactly one full GPS Admin link');
    const attrs = links[0][1];
    const href = attrs.match(/\bhref="([^"]+)"/)[1];
    assert.equal(href, 'https://az-packers-quotation.web.app/#dashboard');
    assert.match(attrs, /\btarget="_blank"/);
    assert.match(attrs, /\brel="noopener noreferrer"/);
  }
});

test('Execution cannot send users to an expiring GPS preview channel', () => {
  assert.doesNotMatch(html, /az-packers-quotation--[^\s"'<>]+\.web\.app/i);
});
