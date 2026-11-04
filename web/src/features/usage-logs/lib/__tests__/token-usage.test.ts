import { describe, expect, it } from 'vitest'

import { resolveTokenUsage } from '../token-usage'

const log = { prompt_tokens: 196_531, completion_tokens: 392 }

describe('resolveTokenUsage', () => {
  it('subtracts cache reads from OpenAI-style prompt totals so input shows only uncached tokens', () => {
    const usage = resolveTokenUsage(log, { cache_tokens: 195_712 })
    expect(usage.inputTokens).toBe(819)
    expect(usage.cacheReadTokens).toBe(195_712)
    expect(usage.cacheWriteTokens).toBe(0)
    expect(usage.outputTokens).toBe(392)
  })

  it('also subtracts OpenAI 12h cache writes, which are included in the prompt total', () => {
    const usage = resolveTokenUsage(
      { prompt_tokens: 1_000, completion_tokens: 10 },
      { cache_tokens: 500, cache_creation_tokens: 200, cache_creation_tokens_12h: 200 }
    )
    expect(usage.inputTokens).toBe(300)
    expect(usage.cacheWriteTokens).toBe(200)
  })

  it('keeps Anthropic input_tokens as-is because they already exclude cache', () => {
    const usage = resolveTokenUsage(
      { prompt_tokens: 718, completion_tokens: 197 },
      { usage_semantic: 'anthropic', cache_tokens: 678_272 }
    )
    expect(usage.inputTokens).toBe(718)
    expect(usage.cacheReadTokens).toBe(678_272)
  })

  it('treats rows with a 5m / 1h cache write split as already net and sums the split', () => {
    const usage = resolveTokenUsage(
      { prompt_tokens: 1_200, completion_tokens: 800 },
      { cache_tokens: 300, cache_creation_tokens_5m: 200, cache_creation_tokens_1h: 50 }
    )
    expect(usage.inputTokens).toBe(1_200)
    expect(usage.cacheWriteTokens).toBe(250)
  })

  it('treats legacy rows with only cache_creation_tokens as Claude-derived net input', () => {
    const usage = resolveTokenUsage(
      { prompt_tokens: 1_000, completion_tokens: 500 },
      { cache_tokens: 512, cache_creation_tokens: 200 }
    )
    expect(usage.inputTokens).toBe(1_000)
    expect(usage.cacheWriteTokens).toBe(200)
  })

  it('never shows a negative input when upstream cache counts exceed the prompt total', () => {
    const usage = resolveTokenUsage(
      { prompt_tokens: 100, completion_tokens: 1 },
      { cache_tokens: 150 }
    )
    expect(usage.inputTokens).toBe(0)
  })

  it('falls back to zero quantities when other is missing', () => {
    const usage = resolveTokenUsage({ prompt_tokens: 13, completion_tokens: 16 }, null)
    expect(usage).toEqual({
      inputTokens: 13,
      outputTokens: 16,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
  })
})
