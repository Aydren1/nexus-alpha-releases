const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const release = path.join(root, 'release', 'NEXUS-win32-x64');
const resources = path.join(release, 'resources');
const stage = path.join(root, 'release', '.nexus-asar-stage');
const nextAsar = path.join(root, 'release', '.nexus-app.asar.next');
const appAsar = path.join(resources, 'app.asar');

if (!fs.existsSync(path.join(release, 'NEXUS.exe'))) throw new Error('The existing portable Electron shell was not found.');
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('The production renderer has not been built.');

const packagerRequire = createRequire(require.resolve('@electron/packager/package.json'));
const { createPackage } = packagerRequire('@electron/asar');

async function main() {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(nextAsar, { force: true });
  fs.mkdirSync(stage, { recursive: true });
  fs.cpSync(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
  fs.cpSync(path.join(root, 'electron'), path.join(stage, 'electron'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts', 'package-template.json'), path.join(stage, 'package.json'));
  await createPackage(stage, nextAsar);
  fs.copyFileSync(nextAsar, appAsar);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(nextAsar, { force: true });
  console.log(`Refreshed packaged app: ${appAsar}`);
}

main().catch((error) => {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(nextAsar, { force: true });
  console.error(error);
  process.exitCode = 1;
});
