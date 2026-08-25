const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { extname, join, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const self = 'scripts/Verify-PublicSource.cjs';
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);
const textExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.md', '.ps1', '.py', '.sql',
  '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const textNames = new Set(['.env.example', '.gitignore', '_headers', '_redirects']);
const checks = [
  ['Windows user-profile path', /\b[A-Za-z]:[\\/]+Users[\\/]+[^\s"'`]+/i],
  ['macOS user-profile path', /(^|[\s"'`(])\/Users\/[^/\s]+/im],
  ['Linux user-profile path', /(^|[\s"'`(])\/home\/[^/\s]+/im],
  ['Codex runtime path', /(^|[\\/])\.codex([\\/]|$)/im],
  ['hard-coded home variable', /\$(?:env:)?(?:HOME|USERPROFILE)\b|%(?:HOME|USERPROFILE)%/i],
  ['owner-specific repository URL', /https?:\/\/github\.com\/[^/\s]+\/nexus-alpha-releases\b/i],
  ['live Supabase project URL', /https:\/\/(?!YOUR_PROJECT_REF\b)[a-z0-9]{16,}\.supabase\.co\b/i],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ['GitHub access token', /\b(?:ghp_|github_pat_)[A-Za-z0-9_]+\b/i],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]+\b/i],
];

const failures = [];
for (const relative of tracked) {
  if (relative === self) continue;
  const extension = extname(relative).toLowerCase();
  const name = relative.replaceAll('\\', '/').split('/').at(-1);
  if (!textExtensions.has(extension) && !textNames.has(name)) continue;
  const content = readFileSync(join(root, relative), 'utf8');
  for (const [label, pattern] of checks) {
    const match = content.match(pattern);
    if (!match) continue;
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    failures.push(`${relative}:${line}: ${label}`);
  }
}

if (failures.length) {
  console.error(`Public-source audit failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Public-source audit passed for ${tracked.length} tracked files.`);
