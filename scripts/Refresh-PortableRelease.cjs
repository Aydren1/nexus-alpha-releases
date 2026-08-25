const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const releaseRoot = path.join(root, 'release');
const packagedPathMarker = path.join(releaseRoot, '.starladder-packaged-app-path');
const release = fs.existsSync(packagedPathMarker)
  ? fs.readFileSync(packagedPathMarker, 'utf8').trim()
  : path.join(releaseRoot, 'STARLADDER-Desktop-win32-x64');
if (!path.resolve(release).startsWith(`${path.resolve(releaseRoot)}${path.sep}`)) throw new Error('Packaged app path escaped the release directory.');
const resources = path.join(release, 'resources');
const stage = path.join(root, 'release', '.starladder-asar-stage');
const nextAsar = path.join(root, 'release', '.starladder-app.asar.next');
const appAsar = path.join(resources, 'app.asar');

if (!fs.existsSync(path.join(release, 'STARLADDER.exe'))) throw new Error('The existing portable Electron shell was not found.');
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
