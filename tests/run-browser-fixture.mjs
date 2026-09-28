import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(path.join(tmpdir(), 'seatalk-fixture-'));
const child = spawn(chrome, [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--password-store=basic',
  `--user-data-dir=${profile}`, '--dump-dom', '--virtual-time-budget=5000',
  new URL('./diagnostics-browser.html', import.meta.url).href,
], { stdio: ['ignore', 'pipe', 'ignore'] });
try {
  // Inspect the actual rendered result, without waiting on inherited updater
  // pipes on macOS. Never use this profile for the user's logged-in browser.
  const result = await new Promise((resolve, reject) => {
    let html = '';
    const timeout = setTimeout(() => reject(Error('Browser fixture timed out')), 30000);
    const finish = (error, value) => { clearTimeout(timeout); error ? reject(error) : resolve(value); };
    child.once('error', error => finish(error));
    child.stdout.on('data', chunk => {
      html += chunk;
      const match = html.match(/<pre id="result" data-test-result="(passed|failed)">([\s\S]*?)<\/pre>/);
      if (match) finish(match[1] === 'passed' ? null : Error(match[2]), match[2]);
    });
    child.stdout.once('end', () => finish(Error('Browser closed without a fixture result')));
  });
  console.log(result);
} finally {
  child.stdout.destroy();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  rmSync(profile, { recursive: true, force: true });
}
