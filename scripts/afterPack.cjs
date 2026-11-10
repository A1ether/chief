const { execFileSync } = require('node:child_process')
const path = require('node:path')

/**
 * electron-builder 在 identity: null 时会跳过签名；这里给整个 .app 补一个
 * ad-hoc 签名，保证从 Finder / LaunchServices 打开时通过 bundle 签名校验。
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
}