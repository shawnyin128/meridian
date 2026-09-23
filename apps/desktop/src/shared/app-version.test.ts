import { describe, expect, it } from 'vitest'
// @ts-expect-error The release scripts are plain JavaScript without type declarations.
import { displayOf, semverOf } from '../../../../scripts/app-version.mjs'
import { displayVersion } from './app-version.js'

describe('app version naming', () => {
  it('四段版本号存成三段 semver,显示时还原成四段,修复号为 0 也写出来', () => {
    expect(semverOf('0.0.14.1')).toBe('0.0.14001')
    expect(semverOf('0.0.14.15')).toBe('0.0.14015')
    expect(semverOf('0.0.15')).toBe('0.0.15000')
    expect(semverOf('1.2.3.4')).toBe('1.2.3004')
    expect(displayVersion('0.0.14001')).toBe('0.0.14.1')
    expect(displayVersion('0.0.14015')).toBe('0.0.14.15')
    expect(displayVersion('0.0.15000')).toBe('0.0.15.0')
    expect(displayVersion('0.1.0')).toBe('0.1.0.0')
    expect(displayVersion('1.2.3004')).toBe('1.2.3.4')
  })

  it('0.0.14 及以前的旧版本照原样显示', () => {
    expect(displayVersion('0.0.14')).toBe('0.0.14')
    expect(displayVersion('0.0.9')).toBe('0.0.9')
  })

  it('新版本在更新器眼里总比旧版本大', () => {
    const released: string[] = [
      '0.0.13', '0.0.14',
      ...['0.0.14.1', '0.0.14.2', '0.0.14.99', '0.0.15', '0.1.0'].map((display) => semverOf(display) as string),
    ]
    const rank = (value: string) => value.split('.').map(Number) as [number, number, number]
    for (let index = 1; index < released.length; index += 1) {
      const [a, b] = [rank(released[index - 1]!), rank(released[index]!)]
      expect(a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))).toBe(true)
    }
  })

  it('发版脚本与 App 对每个存储版本给出同一个显示版本', () => {
    for (const stored of ['0.0.9', '0.0.14', '0.0.14001', '0.0.15000', '0.3.12007', '2.0.5']) {
      expect(displayOf(stored)).toBe(displayVersion(stored))
    }
  })

  it('修复号最多两位,超过 99 时拒绝', () => {
    expect(() => semverOf('0.0.14.100')).toThrow('at most 99')
  })
})
