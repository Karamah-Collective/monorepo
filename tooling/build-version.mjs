import { execFileSync } from 'node:child_process';

export function getBuildVersion() {
  const supplied = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA;
  if (supplied) return supplied.trim().slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  }
}
