import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const localJava = resolve(root, '.tooling/java');
const localJavaCandidates = existsSync(localJava) ? readdirSync(localJava, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => join(localJava, entry.name)) : [];
const javaCandidates = [process.env.JAVA_HOME, ...localJavaCandidates, process.env.ProgramFiles && join(process.env.ProgramFiles, 'Android/Android Studio/jbr')].filter(Boolean);
const javaHome = javaCandidates.find(p => existsSync(join(p, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')));
const sdkCandidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, resolve(root, '.tooling/sdk'), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android/Sdk')].filter(Boolean);
const sdk = sdkCandidates.find(p => existsSync(join(p, 'platforms/android-36/android.jar')));
if (!javaHome || !sdk) {
  console.error(`APK build is not available yet.\nJava 21: ${javaHome ? 'found' : 'not installed'}\nAndroid SDK Platform 36: ${sdk ? 'found' : 'not installed'}\nInstall Android Studio and SDK Platform 36 after accepting the SDK license. See docs/android.md. No APK was generated.`);
  process.exit(1);
}
const windows = process.platform === 'win32';
const gradleCache = process.env.GRADLE_USER_HOME || (windows && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'eodigaji-build/gradle') : resolve(root, '.tooling/gradle'));
const result = spawnSync(windows ? 'cmd.exe' : './gradlew', windows ? ['/d', '/s', '/c', 'gradlew.bat --no-daemon assembleDebug'] : ['--no-daemon', 'assembleDebug'], {
  cwd: resolve(root, 'android'), stdio: 'inherit', env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, GRADLE_USER_HOME: gradleCache }, windowsHide: true,
});
if (result.error) { console.error(result.error.message); process.exit(1); }
if (result.status !== 0) process.exit(result.status || 1);
const apk = resolve(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
if (!existsSync(apk)) { console.error('Gradle completed without producing an APK.'); process.exit(1); }
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
const output = resolve(root, 'artifacts/eodigaji-beta-0.2.0-debug.apk'); copyFileSync(apk, output);
console.log(`APK ready: ${output}`);
