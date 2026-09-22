import tseslint from 'typescript-eslint'

/** Dependency direction defines the architecture; violations are build errors, not style advice. See .claude/skills/writing-meridian-code. */
const forbid = (patterns) => ['error', { patterns }]
const rendererBoundaries = [
  { group: ['**/core/*', '**/core/**'], message: 'renderer 不能直接碰 core,一切经 IPC' },
  { group: ['**/main/*', '**/main/**'], message: 'renderer 不能 import 主进程代码' },
  { group: ['electron', 'node:*'], message: 'renderer 无 Node 权限,只能用 preload 暴露的窄接口' },
  { group: ['**/fixtures/**', '**/*.json'], message: '组件不许 import fixture,数据只能经 window.meridian 取' },
  { group: ['**/shared/contract.js'], importNamePattern: '^.*Schema$', message: 'renderer 只用类型,校验在 core 侧做,zod 不进 renderer 包,数据经 window.meridian 取' },
]
const sharedFeatureBoundaries = [
  {
    group: ['@radix-ui/react-alert-dialog'],
    message: '确认交互统一使用 components/ConfirmDialog,页面不直接重建弹窗契约',
  },
]
const coreDomainBoundaries = [{
  group: [
    '**/recommendation/**', '!**/recommendation/index.js',
    '**/project-management/**', '!**/project-management/index.js',
    '**/paper-library/**', '!**/paper-library/index.js',
    '**/wiki/**', '!**/wiki/index.js',
    '**/harness/**', '!**/harness/index.js',
  ],
  message: 'Core 业务域只通过各自的 index.ts 暴露能力，不跨域引用内部实现',
}]
const pageSurfaceBoundaries = [
  {
    group: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
    ],
    message: '页面与应用外壳使用 components 下的共享模态、菜单或浮层组件，不直接重建 Radix 骨架',
  },
]
const sharedMarkupSyntax = [
  {
    selector: "JSXOpeningElement[name.name='input']",
    message: '原生 input 统一经 components/FormControls 的 FormInput，避免焦点与尺寸再次分叉',
  },
  {
    selector: "JSXOpeningElement[name.name='textarea']",
    message: '原生 textarea 统一经 components/FormControls 的 FormTextarea',
  },
  {
    selector: "JSXOpeningElement[name.name='select']",
    message: '原生 select 统一经 components/FormControls 的 FormSelect',
  },
]
const pageShellSyntax = [
  'desk', 'desk-head', 'desk-body', 'desk-foot', 'ipcerror', 'wk-sec', 'wksec', 'sechead',
].map((className) => ({
  selector: `JSXOpeningElement[name.name='div'] > JSXAttribute[name.name='className'][value.value='${className}']`,
  message: `页面 ${className} 区域统一经 components/PageShell 组合`,
}))

export default tseslint.config(
  { ignores: ['node_modules/**', '.worktrees/**', 'desktop/**', 'dist/**', '**/out/**', '**/*.d.ts', 'apps/desktop/src/core/fixtures/wiki-example-vault/**'] },
  ...tseslint.configs.recommended,

  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': forbid([...rendererBoundaries, ...sharedFeatureBoundaries]),
    },
  },
  {
    // Scans source files on disk at test time; it never ships in the renderer bundle, so the
    // Node-access restriction that protects the runtime sandbox does not apply here.
    files: ['apps/desktop/src/renderer/copy.test.ts'],
    rules: {
      'no-restricted-imports': forbid([
        ...rendererBoundaries.filter((rule) => !rule.group.includes('node:*')),
        ...sharedFeatureBoundaries,
      ]),
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    ignores: [
      'apps/desktop/src/renderer/components/FormControls.tsx',
      'apps/desktop/src/renderer/components/PageShell.tsx',
      'apps/desktop/src/renderer/**/*.test.tsx',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...sharedMarkupSyntax, ...pageShellSyntax],
    },
  },
  {
    files: ['apps/desktop/src/renderer/routes/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': forbid([
        ...rendererBoundaries,
        ...sharedFeatureBoundaries,
        ...pageSurfaceBoundaries,
        {
          group: ['**/hooks/useInlineDraft.js'],
          message: '页面的新建占位统一使用 components/InlineDraftInput 或更完整的共享功能组件',
        },
      ]),
    },
  },
  {
    files: ['apps/desktop/src/renderer/shell/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': forbid([
        ...rendererBoundaries,
        ...sharedFeatureBoundaries,
        ...pageSurfaceBoundaries,
      ]),
    },
  },
  {
    files: [
      'apps/desktop/src/renderer/components/**/*.{ts,tsx}',
      'apps/desktop/src/renderer/hooks/**/*.{ts,tsx}',
      'apps/desktop/src/renderer/lib/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': forbid([
        ...rendererBoundaries,
        ...sharedFeatureBoundaries,
        ...pageSurfaceBoundaries,
        {
          group: ['**/routes/*', '**/routes/**'],
          message: '公共组件、hook 与工具不能反向依赖页面；把共享契约下沉后由页面传参',
        },
      ]),
    },
  },
  {
    files: [
      'apps/desktop/src/renderer/components/ActionMenu.tsx',
      'apps/desktop/src/renderer/components/ActionPopover.tsx',
      'apps/desktop/src/renderer/components/PickerPopover.tsx',
      'apps/desktop/src/renderer/components/ModalDialog.tsx',
    ],
    rules: {
      'no-restricted-imports': forbid([
        ...rendererBoundaries,
        ...sharedFeatureBoundaries,
        {
          group: ['**/routes/*', '**/routes/**'],
          message: '公共交互骨架不能反向依赖页面；页面只通过 props 配置组件',
        },
      ]),
    },
  },
  {
    files: ['apps/desktop/src/renderer/components/ConfirmDialog.tsx'],
    rules: {
      'no-restricted-imports': forbid([
        ...rendererBoundaries,
        {
          group: ['**/routes/*', '**/routes/**'],
          message: '公共组件不能反向依赖页面；页面只通过 props 配置组件',
        },
      ]),
    },
  },
  {
    files: ['apps/desktop/src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': forbid([
        { group: ['**/renderer/*', '**/renderer/**'], message: 'core 不知道界面存在' },
        { group: ['**/main/*', '**/main/**'], message: 'core 不依赖宿主,由宿主装配它' },
        ...coreDomainBoundaries,
      ]),
    },
  },
  {
    files: ['apps/desktop/src/core/**/*.ts'],
    ignores: [
      'apps/desktop/src/core/index.ts',
      'apps/desktop/src/core/harness/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': forbid([
        { group: ['**/renderer/*', '**/renderer/**'], message: 'core 不知道界面存在' },
        { group: ['**/main/*', '**/main/**'], message: 'core 不依赖宿主,由宿主装配它' },
        ...coreDomainBoundaries,
        {
          group: ['**/harness/index.js'],
          message: '只有 Core 组合根可以启动 Harness；后台任务与业务域只能准备材料',
        },
      ]),
    },
  },
  {
    files: ['apps/desktop/src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': forbid(coreDomainBoundaries),
    },
  },
  {
    files: ['apps/desktop/src/main/**/*.ts'],
    rules: {
      'no-restricted-imports': forbid([
        { group: ['**/renderer/*', '**/renderer/**'], message: '主进程不 import 渲染进程代码' },
        ...coreDomainBoundaries,
      ]),
    },
  },
)
