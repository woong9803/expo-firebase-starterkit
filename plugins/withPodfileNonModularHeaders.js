// Expo config plugin
// Podfile post_install 단계에 CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES 자동 주입
// Static frameworks 사용 시 RNFBApp 등이 <React/RCTBridgeModule.h> 같은
// 비-모듈 헤더를 import해 빌드 실패하는 문제를 막는다.
// prebuild --clean 후에도 자동 적용됨 → Podfile 수동 패치 불필요.

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# >>> CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES patch >>>';

const PATCH = `${MARKER}
    # RNFB* 타겟에만 적용 — React-Core 같은 다른 타겟에 적용하면 prefix header 처리가 깨짐
    installer.pods_project.targets.each do |target|
      if target.name.start_with?('RNFB')
        target.build_configurations.each do |config|
          config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        end
      end
    end
    # <<< CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES patch <<<`;

function applyPatch(podfile) {
  if (podfile.includes(MARKER)) return podfile;

  // post_install do |installer| ... end 블록 안에 패치 삽입
  const postInstallRegex = /(post_install\s+do\s+\|installer\|[\s\S]*?)(\n\s*end)/;
  const match = podfile.match(postInstallRegex);

  if (match) {
    return podfile.replace(postInstallRegex, `$1\n    ${PATCH}$2`);
  }

  // post_install 블록이 없으면 파일 끝에 추가
  return `${podfile.trimEnd()}\n\npost_install do |installer|\n    ${PATCH}\nend\n`;
}

const withPodfileNonModularHeaders = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const original = fs.readFileSync(podfilePath, 'utf-8');
      const patched = applyPatch(original);
      if (patched !== original) {
        fs.writeFileSync(podfilePath, patched);
      }
      return cfg;
    },
  ]);
};

module.exports = withPodfileNonModularHeaders;
