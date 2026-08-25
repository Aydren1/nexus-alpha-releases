const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const releaseRoot = path.join(root, 'release');
const packagedPathMarker = path.join(releaseRoot, '.starladder-packaged-app-path');
const packagedApp = fs.existsSync(packagedPathMarker)
  ? fs.readFileSync(packagedPathMarker, 'utf8').trim()
  : path.join(releaseRoot, 'STARLADDER-Desktop-win32-x64');
if (!path.resolve(packagedApp).startsWith(`${path.resolve(releaseRoot)}${path.sep}`)) throw new Error('Packaged app path escaped the release directory.');
const asarPath = path.join(packagedApp, 'resources', 'app.asar');
const packagerRequire = createRequire(require.resolve('@electron/packager/package.json'));
const asar = packagerRequire('@electron/asar');

if (!fs.existsSync(asarPath)) throw new Error('Portable app.asar was not found.');
const files = asar.listPackage(asarPath).map((file) => file.replaceAll('\\', '/'));
const required = ['/package.json', '/electron/main.cjs', '/electron/preload.cjs', '/dist/index.html', '/dist/starladder.ico', '/dist/starladder-icon-512.png', '/dist/starladder-icon-512-cyan.png'];
for (const file of required) if (!files.includes(file)) throw new Error(`Packaged file is missing: ${file}`);
if (files.some((file) => /(^|\/)\.env(?:\.|$)/.test(file))) throw new Error('An environment file was included in the package.');

const packageJson = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));
const main = asar.extractFile(asarPath, 'electron/main.cjs').toString('utf8');
const preload = asar.extractFile(asarPath, 'electron/preload.cjs').toString('utf8');
if (packageJson.version !== '0.5.0-alpha.8.0') throw new Error(`Unexpected packaged version: ${packageJson.version}`);
if (!main.includes('starladder.ico')) throw new Error('Native Windows STARLADDER icon integration is missing.');
if (!main.includes('com.starladder.sccompetitive.desktop')) throw new Error('The Windows desktop AppUserModelID is missing.');
for (const marker of ['frame: false', 'window-toggle-maximize', 'window-minimize', 'window-close']) {
  if (!main.includes(marker) && !preload.includes(marker)) throw new Error(`Custom title bar marker is missing: ${marker}`);
}
for (const marker of ['globalShortcut', 'desktopCapturer', 'capture-evidence-now', 'list-local-captures']) {
  if (!main.includes(marker) && !preload.includes(marker)) throw new Error(`Capture integration marker is missing: ${marker}`);
}
for (const marker of ['requestSingleInstanceLock', "app.getPath('appData')", "app.setPath('userData', legacyUserDataPath)", "'StarLadder', 'capture-settings.json'", "'NEXUS', 'capture-settings.json'", 'registered: Boolean(captureShortcut)']) {
  if (!main.includes(marker)) throw new Error(`Desktop persistence marker is missing: ${marker}`);
}

console.log(JSON.stringify({
  version: packageJson.version,
  packagedFiles: files.length,
  captureBridge: true,
  singleInstance: true,
  durableCaptureSettings: true,
  windowsDesktopIdentity: true,
  environmentFilesIncluded: false,
}, null, 2));
