#!/usr/bin/env node
'use strict';
/*
  Native wiring for the CyberNet AI iPhone project (BUILD-PLAN §3, §6, §7.3). Idempotent.

    node mobile/scripts/add-share-extension.cjs           apply (writes only what differs)
    node mobile/scripts/add-share-extension.cjs --check   verify only; exit code 1 on any problem
    node mobile/scripts/add-share-extension.cjs --icons   also render mobile/native/brand/*.svg into the
                                                          asset catalog (app icon 1024, launch image)

  What it does (mobile/ios is generated once by `npx cap add ios`, then this script):
    1. Copies mobile/native/** into mobile/ios/App/ (Swift sources, plists, entitlements,
       privacy manifests, the extension's engine page).
    2. App Info.plist: camera + tracking purpose strings, no export-compliance prompt, arm64,
       portrait only.
    3. Main.storyboard and SceneDelegate use MainViewController (native tab bar).
    4. project.pbxproj (parsed and written with the `xcode` package; every path is POSIX):
       app sources/plugins/entitlements/privacy manifest, the ShareExtension target
       (app.cybernetai.share), "Embed Foundation Extensions", the target dependency, iOS 16.0,
       iPhone only, matching MARKETING_VERSION / CURRENT_PROJECT_VERSION (avoids ITMS-90473).
    5. A shared App scheme, so xcodebuild and Codemagic always find "App".
    6. Makes sure the extension has engine/cybernet-engine.js (public/cybernet-engine.js,
       unchanged; build-web.mjs normally copies it, this is the fallback).

  --check also validates every plist / entitlements / privacy manifest / storyboard / scheme as
  XML, checks the privacy manifests (app: tracking with the Google Analytics domains;
  extension: no tracking), checks that every object id in the pbxproj resolves, and runs the
  extension's engine bridge (engine.html) against the real engine in Node.

  Re-running `npx cap add ios` resets the project: run this script again afterwards.
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');
const NATIVE = path.join(MOBILE, 'native');
const IOS_APP = path.join(MOBILE, 'ios', 'App');
const PBX_PATH = path.join(IOS_APP, 'App.xcodeproj', 'project.pbxproj');
const SCHEME_PATH = path.join(IOS_APP, 'App.xcodeproj', 'xcshareddata', 'xcschemes', 'App.xcscheme');
const APP_PLIST = path.join(IOS_APP, 'App', 'Info.plist');
const STORYBOARD = path.join(IOS_APP, 'App', 'Base.lproj', 'Main.storyboard');
const ENGINE_SOURCE = path.join(REPO, 'public', 'cybernet-engine.js');
const ENGINE_COPY = path.join(IOS_APP, 'ShareExtension', 'Resources', 'engine', 'cybernet-engine.js');

const xcode = require('xcode');
const cliDir = path.dirname(require.resolve('@capacitor/cli/package.json'));
const plist = require(require.resolve('plist', { paths: [cliDir] }));
const xml2js = require(require.resolve('xml2js', { paths: [cliDir] }));

const CHECK = process.argv.includes('--check');
const ICONS = process.argv.includes('--icons');
const BRAND = path.join(NATIVE, 'brand'); // icon sources; rendered with --icons, never copied
const ICON_PNG = path.join(IOS_APP, 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');
const SPLASH_DIR = path.join(IOS_APP, 'App', 'Assets.xcassets', 'Splash.imageset');
const SPLASH_FILES = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'];
const VERSION = JSON.parse(fs.readFileSync(path.join(MOBILE, 'package.json'), 'utf8')).version;

const IDS = {
  app: 'app.cybernetai',
  share: 'app.cybernetai.share',
  group: 'group.app.cybernetai',
};
const DEPLOYMENT_TARGET = '16.0';
const EXT = 'ShareExtension';

// Purpose strings (Info.plist). Camera: BUILD-PLAN §6.3 (corrected 20 Oct 2026).
// Tracking: owner answer 11 (29 Oct 2026); Google Analytics only after "Allow".
const CAMERA_TEXT =
  'CyberNet AI uses the camera to scan QR codes, which are read on your iPhone, and to take a photo of a ' +
  'suspicious message if you choose. A photo is sent for an AI explanation only if you allow AI analysis.';
const TRACKING_TEXT =
  'If you allow this, CyberNet AI uses Google Analytics to count how the app is used, such as which screens ' +
  'are opened. Google may combine this with data from other companies\' apps and websites. The messages, ' +
  'links and pictures you check are not sent to Google Analytics. Every feature works if you choose not to allow it.';

const APP_PLIST_KEYS = {
  CFBundleDisplayName: 'CyberNet AI',
  ITSAppUsesNonExemptEncryption: false,
  NSCameraUsageDescription: CAMERA_TEXT,
  NSUserTrackingUsageDescription: TRACKING_TEXT,
  UIRequiredDeviceCapabilities: ['arm64'],
  UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
};
const APP_PLIST_REMOVED = ['UISupportedInterfaceOrientations~ipad'];
const ALLOWED_USAGE_KEYS = ['NSCameraUsageDescription', 'NSUserTrackingUsageDescription'];
// Every host gtag.js may use (GA4): the script host, the collection hosts and the Google-signals hosts.
// Declared hosts are blocked by iOS until the person allows tracking; ios/cn-analytics.js also waits for that.
const TRACKING_DOMAINS = ['www.google-analytics.com', 'region1.google-analytics.com', 'analytics.google.com', 'region1.analytics.google.com', 'www.googletagmanager.com'];

const problems = [];
const writes = []; // [absolutePath, content]

// Text files compare without regard to CRLF/LF, so a Windows checkout never reports false drift.
const TEXT_FILE = /\.(swift|plist|html|xcprivacy|entitlements|storyboard|xcscheme|pbxproj|svg)$/;
function sameContent(file, a, b) {
  if (!TEXT_FILE.test(file)) return Buffer.from(a).equals(Buffer.from(b));
  const text = (value) => Buffer.from(value).toString('utf8').replace(/\r\n/g, '\n');
  return text(a) === text(b);
}

// ---------------------------------------------------------------------------------------------
// 1. Files copied from mobile/native

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function nativeCopies() {
  // [source under mobile/native, destination under mobile/ios/App]
  return listFiles(NATIVE)
    .filter((file) => !path.basename(file).startsWith('.') && !file.startsWith(BRAND + path.sep))
    .map((file) => {
      const rel = path.relative(NATIVE, file).split(path.sep).join('/');
      return [file, rel];
    });
}

const deletes = []; // copied files whose source was removed from mobile/native

function planCopies() {
  for (const [source, rel] of nativeCopies()) {
    const dest = path.join(IOS_APP, ...rel.split('/'));
    const content = fs.readFileSync(source);
    if (!fs.existsSync(dest) || !sameContent(dest, fs.readFileSync(dest), content)) {
      writes.push([dest, content]);
    }
  }
  // Swift files only ever come from mobile/native: a copy without a source is stale.
  for (const dir of ['App/Plugins', 'Shared', EXT]) {
    const iosDir = path.join(IOS_APP, ...dir.split('/'));
    if (!fs.existsSync(iosDir)) continue;
    for (const name of fs.readdirSync(iosDir).filter((n) => n.endsWith('.swift'))) {
      if (!fs.existsSync(path.join(NATIVE, ...dir.split('/'), name))) deletes.push(path.join(iosDir, name));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 2. App Info.plist

function planAppPlist() {
  const original = fs.readFileSync(APP_PLIST, 'utf8');
  const data = plist.parse(original);
  for (const [key, value] of Object.entries(APP_PLIST_KEYS)) data[key] = value;
  for (const key of APP_PLIST_REMOVED) delete data[key];
  const sorted = {};
  for (const key of Object.keys(data).sort()) sorted[key] = data[key];
  const next = plist.build(sorted) + '\n';
  if (!sameContent(APP_PLIST, next, original)) writes.push([APP_PLIST, next]);
}

// ---------------------------------------------------------------------------------------------
// 3. Storyboard

function planStoryboard() {
  const original = fs.readFileSync(STORYBOARD, 'utf8');
  const next = original.replace(
    /customClass="CAPBridgeViewController" customModule="Capacitor"/,
    'customClass="MainViewController" customModule="App" customModuleProvider="target"');
  if (!sameContent(STORYBOARD, next, original)) writes.push([STORYBOARD, next]);
}

// ---------------------------------------------------------------------------------------------
// 4. project.pbxproj

const unq = (value) => (typeof value === 'string' ? value.replace(/^"([\s\S]*)"$/, '$1') : value);
const q = (value) => {
  const text = String(value);
  return /^[A-Za-z0-9_./]+$/.test(text) ? text : `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
};

function editProject() {
  const project = xcode.project(PBX_PATH);
  project.parseSync();
  const objects = project.hash.project.objects;
  const section = (isa) => objects[isa] || (objects[isa] = {});
  const idsOf = (isa) => Object.keys(section(isa)).filter((key) => !key.endsWith('_comment'));
  const add = (isa, body, comment) => {
    const id = project.generateUuid();
    section(isa)[id] = Object.assign({ isa }, body);
    section(isa)[`${id}_comment`] = comment;
    return id;
  };

  const rootId = project.hash.project.rootObject;
  const root = section('PBXProject')[rootId];
  // The parser turns "0920" into 920; keep the template's values byte-for-byte.
  root.attributes.LastSwiftUpdateCheck = '0920';
  root.attributes.LastUpgradeCheck = '0920';

  const groups = section('PBXGroup');
  const refs = section('PBXFileReference');
  const targets = section('PBXNativeTarget');
  const mainGroupId = root.mainGroup;
  const productsGroupId = root.productRefGroup;

  const appTargetId = idsOf('PBXNativeTarget').find((id) => unq(targets[id].name) === 'App');
  if (!appTargetId) throw new Error('No "App" target in project.pbxproj. Run `npx cap add ios` first.');
  const appTarget = targets[appTargetId];

  function childGroup(parentId, dir) {
    const parent = groups[parentId];
    for (const child of parent.children) {
      const group = groups[child.value];
      if (group && (unq(group.path) === dir || (!group.path && unq(group.name) === dir))) return child.value;
    }
    const id = add('PBXGroup', { children: [], path: q(dir), sourceTree: '"<group>"' }, dir);
    parent.children.push({ value: id, comment: dir });
    return id;
  }

  function fileRef(groupId, relPath, type) {
    const group = groups[groupId];
    for (const child of group.children) {
      const ref = refs[child.value];
      if (ref && unq(ref.path) === relPath) {
        ref.lastKnownFileType = q(type);
        return child.value;
      }
    }
    const name = path.posix.basename(relPath);
    const body = { lastKnownFileType: q(type) };
    if (name !== relPath) body.name = q(name);
    body.path = q(relPath);
    body.sourceTree = '"<group>"';
    const id = add('PBXFileReference', body, name);
    group.children.push({ value: id, comment: name });
    return id;
  }

  function phaseOf(target, isa, label, extra) {
    for (const entry of target.buildPhases) {
      const phase = section(isa)[entry.value];
      if (!phase) continue;
      if (extra && Object.entries(extra).some(([key, value]) => String(unq(phase[key])) !== String(unq(value)))) continue;
      return entry.value;
    }
    const body = Object.assign({ buildActionMask: 2147483647 }, extra || {}, { files: [], runOnlyForDeploymentPostprocessing: 0 });
    const id = add(isa, body, label);
    target.buildPhases.push({ value: id, comment: label });
    return id;
  }

  function buildFile(isa, phaseId, label, refId, name, settings) {
    const phase = section(isa)[phaseId];
    for (const entry of phase.files) {
      const file = section('PBXBuildFile')[entry.value];
      if (file && file.fileRef === refId) {
        if (settings) file.settings = settings;
        return entry.value;
      }
    }
    const body = { fileRef: refId, fileRef_comment: name };
    if (settings) body.settings = settings;
    const comment = `${name} in ${label}`;
    const id = add('PBXBuildFile', body, comment);
    phase.files.push({ value: id, comment });
    return id;
  }

  function configs(listId) {
    return section('XCConfigurationList')[listId].buildConfigurations.map((entry) => section('XCBuildConfiguration')[entry.value]);
  }

  // --- Extension target (created once) ---
  let extTargetId = idsOf('PBXNativeTarget').find((id) => unq(targets[id].name) === EXT);
  if (!extTargetId) {
    const productId = add('PBXFileReference', {
      explicitFileType: '"wrapper.app-extension"',
      includeInIndex: 0,
      path: `${EXT}.appex`,
      sourceTree: 'BUILT_PRODUCTS_DIR',
    }, `${EXT}.appex`);
    groups[productsGroupId].children.push({ value: productId, comment: `${EXT}.appex` });
    const debugId = add('XCBuildConfiguration', { buildSettings: {}, name: 'Debug' }, 'Debug');
    const releaseId = add('XCBuildConfiguration', { buildSettings: {}, name: 'Release' }, 'Release');
    const listComment = `Build configuration list for PBXNativeTarget "${EXT}"`;
    const listId = add('XCConfigurationList', {
      buildConfigurations: [{ value: debugId, comment: 'Debug' }, { value: releaseId, comment: 'Release' }],
      defaultConfigurationIsVisible: 0,
      defaultConfigurationName: 'Release',
    }, listComment);
    extTargetId = add('PBXNativeTarget', {
      buildConfigurationList: listId,
      buildConfigurationList_comment: listComment,
      buildPhases: [],
      buildRules: [],
      dependencies: [],
      name: EXT,
      productName: EXT,
      productReference: productId,
      productReference_comment: `${EXT}.appex`,
      productType: '"com.apple.product-type.app-extension"',
    }, EXT);
    root.targets.push({ value: extTargetId, comment: EXT });
  }
  const extTarget = targets[extTargetId];
  root.attributes.TargetAttributes = root.attributes.TargetAttributes || {};
  root.attributes.TargetAttributes[extTargetId] = root.attributes.TargetAttributes[extTargetId] || { CreatedOnToolsVersion: '26.0' };

  const appSources = phaseOf(appTarget, 'PBXSourcesBuildPhase', 'Sources');
  const appResources = phaseOf(appTarget, 'PBXResourcesBuildPhase', 'Resources');
  const extSources = phaseOf(extTarget, 'PBXSourcesBuildPhase', 'Sources');
  phaseOf(extTarget, 'PBXFrameworksBuildPhase', 'Frameworks');
  const extResources = phaseOf(extTarget, 'PBXResourcesBuildPhase', 'Resources');

  // --- App group: shell, plugins, entitlements, privacy manifest ---
  const appGroupId = childGroup(mainGroupId, 'App');
  const swift = 'sourcecode.swift';
  for (const name of ['MainViewController.swift', 'SceneDelegate.swift']) {
    buildFile('PBXSourcesBuildPhase', appSources, 'Sources', fileRef(appGroupId, name, swift), name);
  }
  const pluginsGroupId = childGroup(appGroupId, 'Plugins');
  const pluginFiles = fs.readdirSync(path.join(NATIVE, 'App', 'Plugins')).filter((name) => name.endsWith('.swift')).sort();
  for (const name of pluginFiles) {
    buildFile('PBXSourcesBuildPhase', appSources, 'Sources', fileRef(pluginsGroupId, name, swift), name);
  }
  // A plugin removed from mobile/native/App/Plugins: drop its file reference and build files.
  groups[pluginsGroupId].children = groups[pluginsGroupId].children.filter((child) => {
    const ref = refs[child.value];
    if (!ref || pluginFiles.includes(unq(ref.path))) return true;
    for (const isa of ['PBXSourcesBuildPhase', 'PBXResourcesBuildPhase', 'PBXFrameworksBuildPhase', 'PBXCopyFilesBuildPhase']) {
      for (const phaseId of idsOf(isa)) {
        section(isa)[phaseId].files = section(isa)[phaseId].files.filter((entry) => {
          const file = section('PBXBuildFile')[entry.value];
          if (!file || file.fileRef !== child.value) return true;
          delete section('PBXBuildFile')[entry.value];
          delete section('PBXBuildFile')[`${entry.value}_comment`];
          return false;
        });
      }
    }
    delete refs[child.value];
    delete refs[`${child.value}_comment`];
    return false;
  });
  fileRef(appGroupId, 'App.entitlements', 'text.plist.entitlements');
  buildFile('PBXResourcesBuildPhase', appResources, 'Resources',
    fileRef(appGroupId, 'PrivacyInfo.xcprivacy', 'text.xml'), 'PrivacyInfo.xcprivacy');

  // --- Shared group: compiled into both targets ---
  const sharedGroupId = childGroup(mainGroupId, 'Shared');
  const storeRef = fileRef(sharedGroupId, 'SharedInboxStore.swift', swift);
  buildFile('PBXSourcesBuildPhase', appSources, 'Sources', storeRef, 'SharedInboxStore.swift');
  buildFile('PBXSourcesBuildPhase', extSources, 'Sources', storeRef, 'SharedInboxStore.swift');

  // --- ShareExtension group ---
  const extGroupId = childGroup(mainGroupId, EXT);
  for (const name of ['ShareViewController.swift', 'VerdictView.swift', 'EngineRunner.swift']) {
    buildFile('PBXSourcesBuildPhase', extSources, 'Sources', fileRef(extGroupId, name, swift), name);
  }
  fileRef(extGroupId, 'Info.plist', 'text.plist.xml'); // INFOPLIST_FILE, never a resource
  fileRef(extGroupId, `${EXT}.entitlements`, 'text.plist.entitlements');
  buildFile('PBXResourcesBuildPhase', extResources, 'Resources',
    fileRef(extGroupId, 'PrivacyInfo.xcprivacy', 'text.xml'), 'PrivacyInfo.xcprivacy');
  buildFile('PBXResourcesBuildPhase', extResources, 'Resources',
    fileRef(extGroupId, 'engine.html', 'text.html'), 'engine.html');
  // Folder reference: whatever build-web.mjs puts in Resources/engine/ ships as engine/ in the .appex.
  buildFile('PBXResourcesBuildPhase', extResources, 'Resources',
    fileRef(extGroupId, 'Resources/engine', 'folder'), 'engine');

  // Keep the Share Extension group next to App in the navigator.
  const mainChildren = groups[mainGroupId].children;
  for (const id of [sharedGroupId, extGroupId]) {
    const index = mainChildren.findIndex((child) => child.value === id);
    const [entry] = mainChildren.splice(index, 1);
    const productsIndex = mainChildren.findIndex((child) => child.value === productsGroupId);
    mainChildren.splice(productsIndex < 0 ? mainChildren.length : productsIndex, 0, entry);
  }

  // --- Embed the extension in the app ---
  const embedId = phaseOf(appTarget, 'PBXCopyFilesBuildPhase', 'Embed Foundation Extensions', {
    dstPath: '""',
    dstSubfolderSpec: 13,
    name: '"Embed Foundation Extensions"',
  });
  buildFile('PBXCopyFilesBuildPhase', embedId, 'Embed Foundation Extensions', extTarget.productReference,
    `${EXT}.appex`, { ATTRIBUTES: ['RemoveHeadersOnCopy'] });

  // --- App depends on the extension ---
  const dependencies = section('PBXTargetDependency');
  const hasDependency = appTarget.dependencies.some((entry) => dependencies[entry.value] && dependencies[entry.value].target === extTargetId);
  if (!hasDependency) {
    const proxyId = add('PBXContainerItemProxy', {
      containerPortal: rootId,
      containerPortal_comment: 'Project object',
      proxyType: 1,
      remoteGlobalIDString: extTargetId,
      remoteInfo: EXT,
    }, 'PBXContainerItemProxy');
    const dependencyId = add('PBXTargetDependency', {
      target: extTargetId,
      target_comment: EXT,
      targetProxy: proxyId,
      targetProxy_comment: 'PBXContainerItemProxy',
    }, 'PBXTargetDependency');
    appTarget.dependencies.push({ value: dependencyId, comment: 'PBXTargetDependency' });
  }

  // --- Build settings ---
  for (const config of configs(root.buildConfigurationList)) {
    config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
  }
  const appConfigs = configs(appTarget.buildConfigurationList);
  const buildNumber = String(unq(appConfigs[0].buildSettings.CURRENT_PROJECT_VERSION) || '1');
  for (const config of appConfigs) {
    Object.assign(config.buildSettings, {
      CODE_SIGN_ENTITLEMENTS: 'App/App.entitlements',
      CURRENT_PROJECT_VERSION: q(buildNumber),
      IPHONEOS_DEPLOYMENT_TARGET: DEPLOYMENT_TARGET,
      MARKETING_VERSION: q(VERSION),
      PRODUCT_BUNDLE_IDENTIFIER: IDS.app,
      TARGETED_DEVICE_FAMILY: '1',
      VERSIONING_SYSTEM: '"apple-generic"',
    });
  }
  for (const config of configs(extTarget.buildConfigurationList)) {
    const debug = unq(config.name) === 'Debug';
    config.buildSettings = Object.assign(config.buildSettings || {}, {
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      CODE_SIGN_ENTITLEMENTS: `${EXT}/${EXT}.entitlements`,
      CODE_SIGN_STYLE: 'Manual',
      CURRENT_PROJECT_VERSION: q(buildNumber),
      GENERATE_INFOPLIST_FILE: 'NO',
      INFOPLIST_FILE: `${EXT}/Info.plist`,
      IPHONEOS_DEPLOYMENT_TARGET: DEPLOYMENT_TARGET,
      LD_RUNPATH_SEARCH_PATHS: ['"$(inherited)"', '"@executable_path/Frameworks"', '"@executable_path/../../Frameworks"'],
      MARKETING_VERSION: q(VERSION),
      PRODUCT_BUNDLE_IDENTIFIER: IDS.share,
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      SKIP_INSTALL: 'YES',
      SWIFT_ACTIVE_COMPILATION_CONDITIONS: debug ? 'DEBUG' : '""',
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '1',
      VERSIONING_SYSTEM: '"apple-generic"',
    });
    const sorted = {};
    for (const key of Object.keys(config.buildSettings).sort()) sorted[key] = config.buildSettings[key];
    config.buildSettings = sorted;
  }

  // Sections in Xcode's order (alphabetical), so diffs stay readable.
  const ordered = {};
  for (const key of Object.keys(objects).sort()) ordered[key] = objects[key];
  project.hash.project.objects = ordered;

  const next = project.writeSync();
  const original = fs.readFileSync(PBX_PATH, 'utf8');
  if (!sameContent(PBX_PATH, next, original)) writes.push([PBX_PATH, next]);
  return { appTargetId, extTargetId };
}

// ---------------------------------------------------------------------------------------------
// 5. Shared scheme

function schemeXml(appTargetId) {
  const ref = (indent) => [
    `${indent}<BuildableReference`,
    `${indent}   BuildableIdentifier = "primary"`,
    `${indent}   BlueprintIdentifier = "${appTargetId}"`,
    `${indent}   BuildableName = "App.app"`,
    `${indent}   BlueprintName = "App"`,
    `${indent}   ReferencedContainer = "container:App.xcodeproj">`,
    `${indent}</BuildableReference>`,
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "2600"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
${ref('            ')}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
${ref('         ')}
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
${ref('         ')}
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
}

function planScheme(appTargetId) {
  const next = schemeXml(appTargetId);
  const original = fs.existsSync(SCHEME_PATH) ? fs.readFileSync(SCHEME_PATH, 'utf8') : null;
  if (original === null || !sameContent(SCHEME_PATH, next, original)) writes.push([SCHEME_PATH, next]);
}

// ---------------------------------------------------------------------------------------------
// 6. Engine for the extension

function planEngine() {
  if (fs.existsSync(ENGINE_COPY)) {
    if (!fs.readFileSync(ENGINE_COPY).equals(fs.readFileSync(ENGINE_SOURCE))) {
      problems.push(`${rel(ENGINE_COPY)} differs from public/cybernet-engine.js (the extension must run the unchanged engine; run npm run build:web)`);
    }
    return;
  }
  if (CHECK) {
    problems.push(`${rel(ENGINE_COPY)} is missing (npm run build:web copies it)`);
  } else {
    writes.push([ENGINE_COPY, fs.readFileSync(ENGINE_SOURCE)]);
  }
}

// ---------------------------------------------------------------------------------------------
// 7. App icon and launch image (--icons). sharp comes with @capacitor/assets (BUILD-PLAN §6.1).

async function renderIcons() {
  const sharp = require('sharp');
  const render = (svg, size) => sharp(fs.readFileSync(path.join(BRAND, svg)), { density: 72 * (size / 1024) })
    .resize(size, size)
    .flatten({ background: '#060a14' })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  const icon = await render('app-icon.svg', 1024);
  fs.writeFileSync(ICON_PNG, icon);
  console.log(`wrote ${rel(ICON_PNG)}`);
  const splash = await render('splash.svg', 2732);
  for (const name of SPLASH_FILES) {
    fs.writeFileSync(path.join(SPLASH_DIR, name), splash);
    console.log(`wrote ${rel(path.join(SPLASH_DIR, name))}`);
  }
}

function pngInfo(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 26 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

// ---------------------------------------------------------------------------------------------
// Validation (--check, and after every apply)

const rel = (file) => path.relative(REPO, file).split(path.sep).join('/');

function parseXmlStrict(file) {
  let error = null;
  xml2js.parseString(fs.readFileSync(file, 'utf8'), { strict: true, async: false }, (err) => { error = err; });
  if (error) problems.push(`${rel(file)} is not well-formed XML: ${String(error.message || error).split('\n')[0]}`);
}

function readPlist(file) {
  try {
    return plist.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`${rel(file)} is not a valid property list: ${error.message}`);
    return {};
  }
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateFiles() {
  const xmlFiles = [
    APP_PLIST,
    STORYBOARD,
    SCHEME_PATH,
    path.join(IOS_APP, 'App', 'App.entitlements'),
    path.join(IOS_APP, 'App', 'PrivacyInfo.xcprivacy'),
    path.join(IOS_APP, EXT, 'Info.plist'),
    path.join(IOS_APP, EXT, `${EXT}.entitlements`),
    path.join(IOS_APP, EXT, 'PrivacyInfo.xcprivacy'),
  ];
  for (const file of xmlFiles) {
    if (!fs.existsSync(file)) {
      problems.push(`${rel(file)} is missing`);
      continue;
    }
    parseXmlStrict(file);
  }

  // App Info.plist
  const info = readPlist(APP_PLIST);
  for (const [key, value] of Object.entries(APP_PLIST_KEYS)) {
    if (!sameJson(info[key], value)) problems.push(`App Info.plist ${key} is not the expected value`);
  }
  for (const key of APP_PLIST_REMOVED) if (key in info) problems.push(`App Info.plist still has ${key}`);
  for (const key of Object.keys(info)) {
    if (/^NS.*UsageDescription$/.test(key) && !ALLOWED_USAGE_KEYS.includes(key)) {
      problems.push(`App Info.plist has an unexpected permission prompt: ${key}`);
    }
  }
  if ('UIBackgroundModes' in info) problems.push('App Info.plist must not have UIBackgroundModes (1.0 uses none)');

  // Extension Info.plist
  const extInfo = readPlist(path.join(IOS_APP, EXT, 'Info.plist'));
  const extension = extInfo.NSExtension || {};
  if (extension.NSExtensionPointIdentifier !== 'com.apple.share-services') problems.push('Extension is not a share extension');
  if (extension.NSExtensionPrincipalClass !== '$(PRODUCT_MODULE_NAME).ShareViewController') problems.push('Extension principal class is wrong');
  const rule = (extension.NSExtensionAttributes || {}).NSExtensionActivationRule;
  if (!rule || typeof rule !== 'object') problems.push('Extension activation rule must be an explicit dictionary (no TRUEPREDICATE)');
  if (extInfo.CFBundleShortVersionString !== '$(MARKETING_VERSION)' || extInfo.CFBundleVersion !== '$(CURRENT_PROJECT_VERSION)') {
    problems.push('Extension version keys must come from MARKETING_VERSION / CURRENT_PROJECT_VERSION');
  }
  for (const key of Object.keys(extInfo)) {
    if (/UsageDescription$/.test(key)) problems.push(`Extension Info.plist must not ask for permissions (${key})`);
  }

  // Entitlements
  const appEnt = readPlist(path.join(IOS_APP, 'App', 'App.entitlements'));
  if (!sameJson(appEnt['com.apple.developer.applesignin'], ['Default'])) problems.push('App entitlements: Sign in with Apple missing');
  if (!sameJson(appEnt['com.apple.security.application-groups'], [IDS.group])) problems.push('App entitlements: App Group missing');
  if (Object.keys(appEnt).some((key) => /aps-environment|associated-domains/.test(key))) problems.push('App entitlements: push / associated domains are not in 1.0');
  const extEnt = readPlist(path.join(IOS_APP, EXT, `${EXT}.entitlements`));
  if (!sameJson(extEnt, { 'com.apple.security.application-groups': [IDS.group] })) problems.push('Extension entitlements must be the App Group only');

  // Privacy manifests
  const appPrivacy = readPlist(path.join(IOS_APP, 'App', 'PrivacyInfo.xcprivacy'));
  if (appPrivacy.NSPrivacyTracking !== true) problems.push('App privacy manifest: NSPrivacyTracking must be true (Google Analytics, owner answer 11)');
  if (!sameJson(appPrivacy.NSPrivacyTrackingDomains, TRACKING_DOMAINS)) problems.push('App privacy manifest: tracking domains must be the Google Analytics hosts in TRACKING_DOMAINS');
  const collected = appPrivacy.NSPrivacyCollectedDataTypes || [];
  const tracked = collected.filter((entry) => entry.NSPrivacyCollectedDataTypeTracking === true).map((entry) => entry.NSPrivacyCollectedDataType);
  for (const type of ['NSPrivacyCollectedDataTypeDeviceID', 'NSPrivacyCollectedDataTypeProductInteraction', 'NSPrivacyCollectedDataTypeCoarseLocation']) {
    if (!tracked.includes(type)) problems.push(`App privacy manifest: ${type} must be marked as tracking`);
  }
  for (const entry of collected) {
    for (const key of ['NSPrivacyCollectedDataType', 'NSPrivacyCollectedDataTypeLinked', 'NSPrivacyCollectedDataTypeTracking', 'NSPrivacyCollectedDataTypePurposes']) {
      if (!(key in entry)) problems.push(`App privacy manifest: an entry is missing ${key}`);
    }
  }
  const extPrivacy = readPlist(path.join(IOS_APP, EXT, 'PrivacyInfo.xcprivacy'));
  if (extPrivacy.NSPrivacyTracking !== false || (extPrivacy.NSPrivacyTrackingDomains || []).length || (extPrivacy.NSPrivacyCollectedDataTypes || []).length) {
    problems.push('Extension privacy manifest must declare no tracking, no tracking domains and no collected data');
  }

  // Storyboard and scene delegate
  const storyboard = fs.readFileSync(STORYBOARD, 'utf8');
  if (!storyboard.includes('customClass="MainViewController"')) problems.push('Main.storyboard does not use MainViewController');
  const sceneDelegate = fs.readFileSync(path.join(IOS_APP, 'App', 'SceneDelegate.swift'), 'utf8');
  if (!sceneDelegate.includes('MainViewController()')) problems.push('SceneDelegate does not create MainViewController');

  // App icon: 1024 x 1024 and no alpha channel (App Store Connect rejects icons with alpha).
  const icon = fs.existsSync(ICON_PNG) ? pngInfo(ICON_PNG) : null;
  if (!icon || icon.width !== 1024 || icon.height !== 1024) problems.push('App icon must be a 1024 x 1024 PNG (run with --icons)');
  else if (icon.colorType === 4 || icon.colorType === 6) problems.push('App icon has an alpha channel (run with --icons)');
  for (const name of SPLASH_FILES) {
    const splash = fs.existsSync(path.join(SPLASH_DIR, name)) ? pngInfo(path.join(SPLASH_DIR, name)) : null;
    if (!splash || splash.width !== 2732 || splash.height !== 2732) problems.push(`Launch image ${name} must be 2732 x 2732`);
  }

  // No Google SDKs, no tracking code in the extension.
  for (const file of listFiles(path.join(IOS_APP, EXT)).filter((f) => /\.(swift|html|plist)$/.test(f))) {
    if (/google|gtag|analytics|ATTrackingManager/i.test(fs.readFileSync(file, 'utf8'))) problems.push(`${rel(file)} mentions analytics or tracking`);
  }
}

function validateProject(ids) {
  const project = xcode.project(PBX_PATH);
  project.parseSync();
  const objects = project.hash.project.objects;
  const all = new Set();
  for (const isa of Object.keys(objects)) {
    for (const key of Object.keys(objects[isa])) if (!key.endsWith('_comment')) all.add(key);
  }
  const uuid = /^[0-9A-F]{24}$/;
  const check = (value, where) => {
    if (typeof value === 'string' && uuid.test(value) && !all.has(value)) problems.push(`pbxproj: ${where} points to missing object ${value}`);
  };
  const walk = (value, where) => {
    if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${where}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        if (key === 'TargetAttributes') continue;
        if (key === 'value' || key === 'fileRef' || key === 'target' || key === 'targetProxy' || key === 'containerPortal' ||
            key === 'remoteGlobalIDString' || key === 'productReference' || key === 'buildConfigurationList' ||
            key === 'mainGroup' || key === 'productRefGroup' || key === 'productRef' || key === 'package' ||
            key === 'baseConfigurationReference') {
          check(inner, `${where}.${key}`);
        }
        walk(inner, `${where}.${key}`);
      }
    }
  };
  for (const isa of Object.keys(objects)) {
    for (const [key, value] of Object.entries(objects[isa])) if (!key.endsWith('_comment')) walk(value, `${isa}.${key}`);
  }
  const text = fs.readFileSync(PBX_PATH, 'utf8');
  if (/\\(?!")[A-Za-z]/.test(text.replace(/\\\\/g, '').replace(/\\"/g, ''))) problems.push('pbxproj contains a Windows backslash path');

  const targets = objects.PBXNativeTarget;
  const settingsOf = (targetId) => objects.XCConfigurationList[targets[targetId].buildConfigurationList].buildConfigurations
    .map((entry) => objects.XCBuildConfiguration[entry.value].buildSettings);
  const appSettings = settingsOf(ids.appTargetId);
  const extSettings = settingsOf(ids.extTargetId);
  for (const [i, settings] of extSettings.entries()) {
    const app = appSettings[i];
    for (const key of ['MARKETING_VERSION', 'CURRENT_PROJECT_VERSION', 'IPHONEOS_DEPLOYMENT_TARGET', 'TARGETED_DEVICE_FAMILY']) {
      if (String(unq(settings[key])) !== String(unq(app[key]))) problems.push(`pbxproj: ShareExtension ${key} (${unq(settings[key])}) differs from App (${unq(app[key])})`);
    }
    if (unq(settings.PRODUCT_BUNDLE_IDENTIFIER) !== IDS.share) problems.push('pbxproj: ShareExtension bundle id is wrong');
    if (unq(app.PRODUCT_BUNDLE_IDENTIFIER) !== IDS.app) problems.push('pbxproj: App bundle id is wrong');
  }
  if (String(unq(appSettings[0].MARKETING_VERSION)) !== VERSION) problems.push(`pbxproj: MARKETING_VERSION is not mobile/package.json version ${VERSION}`);
  const appPhases = targets[ids.appTargetId].buildPhases.map((entry) => entry.value);
  const embed = appPhases.map((id) => (objects.PBXCopyFilesBuildPhase || {})[id]).find((phase) => phase && String(phase.dstSubfolderSpec) === '13');
  if (!embed || embed.files.length !== 1) problems.push('pbxproj: App does not embed exactly one app extension');
}

function validateEngineBridge() {
  const html = fs.readFileSync(path.join(NATIVE, EXT, 'engine.html'), 'utf8');
  if (!/<script src="engine\/cybernet-engine\.js"><\/script>/.test(html)) problems.push('engine.html must load engine/cybernet-engine.js');
  if (/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, ''))) problems.push('engine.html must not reference any web address');
  const bridge = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
  if (!bridge) {
    problems.push('engine.html has no inline bridge script');
    return;
  }
  const sandbox = { URL, URLSearchParams, TextEncoder, TextDecoder, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(fs.readFileSync(ENGINE_SOURCE, 'utf8'), sandbox, { filename: 'cybernet-engine.js' });
    vm.runInContext(bridge, sandbox, { filename: 'engine.html' });
  } catch (error) {
    problems.push(`engine.html bridge failed to load: ${error.message}`);
    return;
  }
  const bands = ['scam', 'unverified', 'safe', 'none'];
  const cases = [
    ['url', { url: 'https://www.apple.com/' }, null],
    ['url', { url: 'http://paypa1-account-verify.top/login' }, 'scam'],
    ['text', { text: 'URGENT: your parcel is on hold. Pay the 2.99 customs fee within 24 hours or it will be returned: http://parcel-fee-pay.top/track' }, 'scam'],
    ['image', { qr: 'https://www.apple.com/', text: '' }, null],
    ['image', {}, 'none'],
    ['text', { text: '' }, 'none'],
  ];
  for (const [kind, payload, expected] of cases) {
    let result;
    try {
      result = JSON.parse(sandbox.cnRun(kind, payload));
    } catch (error) {
      problems.push(`engine bridge ${kind} ${JSON.stringify(payload)} threw: ${error.message}`);
      continue;
    }
    const shapeOk = bands.includes(result.band) && typeof result.headline === 'string' && result.headline &&
      typeof result.lead === 'string' && Array.isArray(result.points) && result.points.length <= 3 &&
      typeof result.action === 'string' && typeof result.score === 'number' && typeof result.subject === 'string';
    if (!shapeOk) problems.push(`engine bridge ${kind} returned an unexpected shape: ${JSON.stringify(result)}`);
    if (expected && result.band !== expected) problems.push(`engine bridge ${kind} ${JSON.stringify(payload)}: expected ${expected}, got ${result.band} (${result.headline})`);
  }
}

// ---------------------------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(PBX_PATH)) {
    console.error('mobile/ios is missing. From mobile/: npx cap add ios, then run this script.');
    process.exit(1);
  }
  if (ICONS && !CHECK) await renderIcons();
  planCopies();
  planAppPlist();
  planStoryboard();
  planEngine();

  if (CHECK) {
    const ids = editProject();
    planScheme(ids.appTargetId);
    for (const [file] of writes) problems.push(`${rel(file)} is out of date (run: node mobile/scripts/add-share-extension.cjs)`);
    for (const file of deletes) problems.push(`${rel(file)} has no source in mobile/native any more (run the script to remove it)`);
    validateFiles();
    validateProject(ids);
    validateEngineBridge();
  } else {
    for (const [file, content] of writes.splice(0)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      console.log(`wrote ${rel(file)}`);
    }
    for (const file of deletes) {
      fs.unlinkSync(file);
      console.log(`removed ${rel(file)}`);
    }
    const ids = editProject();
    planScheme(ids.appTargetId);
    for (const [file, content] of writes.splice(0)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      console.log(`wrote ${rel(file)}`);
    }
    validateFiles();
    validateProject(ids);
    validateEngineBridge();
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(CHECK ? 'iOS native project: all checks passed.' : 'iOS native project wired and checked.');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
