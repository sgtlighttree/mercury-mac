// electron-builder afterPack hook: flip Electron fuses on the packaged main binary.
// Runs before code signing, so the modified binary is still covered by the signature.
const path = require("path");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

module.exports = async function afterPack(context) {
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "MacOS",
    context.packager.appInfo.productFilename,
  );
  await flipFuses(appPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspection]: false,
  });
};
