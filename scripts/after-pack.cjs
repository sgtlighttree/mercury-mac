// electron-builder afterPack hook: harden the packaged app.
// Runs before code signing, so every change below is covered by the signature.
const path = require("path");
const { execFileSync } = require("child_process");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

module.exports = async function afterPack(context) {
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  // Fuses live in the Electron Framework binary (pathToFuseFile resolves it from
  // the app executable). Disable the Node attack surface: ELECTRON_RUN_AS_NODE,
  // NODE_OPTIONS, and --inspect node-cli flags all become inert in the app.
  await flipFuses(path.join(appPath, "Contents", "MacOS", context.packager.appInfo.productFilename), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
  });

  // electron-builder hardcodes NSAllowsArbitraryLoads=true in Info.plist and
  // extendInfo cannot override it; force it back to false. Inert for Chromium's
  // network stack, but keeps NSURLSession-based APIs on ATS defaults.
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  execFileSync("plutil", ["-replace", "NSAppTransportSecurity.NSAllowsArbitraryLoads", "-bool", "NO", plistPath]);
};
