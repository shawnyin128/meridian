import { describe, expect, it } from 'vitest'
import { matchingWikiTerms } from './signals.js'

describe('Wiki terms a paper contains', () => {
  it('keeps only the terms the title or abstract holds, as a phrase or word by word, in order', () => {
    expect(matchingWikiTerms(
      { title: 'Token Teachability for Draft Models', abstract: 'We study the cache of keys and values (KV).' },
      ['KV cache', 'token teachability', 'molecular graph'],
    )).toEqual(['KV cache', 'token teachability'])
    expect(matchingWikiTerms({ title: 'General language model optimization', abstract: 'broad systems' }, ['KV cache']))
      .toEqual([])
  })
})
