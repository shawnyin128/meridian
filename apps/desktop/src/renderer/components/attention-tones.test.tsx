// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HarnessPaperWikiReview } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ProjectStatusTag } from './project/ProjectIdentity.js'
import { RECORD_TONE } from './project/ProjectSignals.js'
import { PaperWikiProposalReview } from './reader/PaperWikiProposalReview.js'

/** The tone class of each tag in `html`, in order. */
const tones = (html: string) => [...html.matchAll(/class="tag tag--label tag--(\w+)/g)].map(([, tone]) => tone)

describe('不需要注意的状态不带颜色', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('项目的进行中、搁置和已完成都是中性的标签', () => {
    expect((['进行中', '搁置', '已完成'] as const).map((status) => tones(renderToStaticMarkup(<ProjectStatusTag status={status} />))))
      .toEqual([['neutral'], ['neutral'], ['neutral']])
  })

  it('科研记录里重新打开是中性的,完成仍是完成的颜色', () => {
    expect([RECORD_TONE.reopen, RECORD_TONE.complete]).toEqual(['neutral', 'good'])
  })

  it('Wiki 提案每一组的出处都是中性的标签', () => {
    const review: HarnessPaperWikiReview = {
      schemaVersion: 'meridian.paper-wiki-review.v1',
      sections: [{
        id: 'mechanism', title: '机制', emptyLabel: '没有机制',
        groups: (['paper-source', 'wiki-synthesis', 'user-insight', 'open-question'] as const).map((provenance) => ({
          id: provenance, title: provenance, provenance, anchors: [], rows: [{ text: '一段' }],
        })),
      }],
    }
    expect(tones(renderToStaticMarkup(<MessagesProvider><PaperWikiProposalReview review={review} /></MessagesProvider>)))
      .toEqual(['neutral', 'neutral', 'neutral', 'neutral'])
  })
})
