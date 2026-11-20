import { test, expect, describe } from 'bun:test'
import {
  TONE_PRESETS,
  TONE_PRESET_LIST,
  parseTonePreset,
  type TonePreset,
} from '../tone-presets'

const EXPECTED_PRESETS: TonePreset[] = ['formal', 'casual', 'warm', 'apology']

describe('TONE_PRESETS', () => {
  test('defines all four required presets', () => {
    for (const id of EXPECTED_PRESETS) {
      expect(TONE_PRESETS[id]).toBeDefined()
    }
  })

  test('every preset has a non-empty systemPrompt', () => {
    for (const id of EXPECTED_PRESETS) {
      const preset = TONE_PRESETS[id]
      expect(typeof preset.systemPrompt).toBe('string')
      expect(preset.systemPrompt.trim().length).toBeGreaterThan(20)
    }
  })

  test('every preset has a non-empty example reply', () => {
    for (const id of EXPECTED_PRESETS) {
      const preset = TONE_PRESETS[id]
      expect(typeof preset.example).toBe('string')
      expect(preset.example.trim().length).toBeGreaterThan(20)
    }
  })

  test('presets are distinguishable (no two share the same example)', () => {
    const examples = EXPECTED_PRESETS.map((id) => TONE_PRESETS[id].example)
    const set = new Set(examples)
    expect(set.size).toBe(examples.length)
  })

  test('apology preset explicitly references an apology', () => {
    const text = TONE_PRESETS.apology.systemPrompt.toLowerCase()
    expect(text).toContain('apolog')
  })
})

describe('TONE_PRESET_LIST', () => {
  test('returns one entry per preset', () => {
    expect(TONE_PRESET_LIST).toHaveLength(EXPECTED_PRESETS.length)
  })
  test('each entry carries a label', () => {
    for (const entry of TONE_PRESET_LIST) {
      expect(typeof entry.label).toBe('string')
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })
})

describe('parseTonePreset', () => {
  test('returns the preset when valid', () => {
    expect(parseTonePreset('warm')).toBe('warm')
    expect(parseTonePreset('apology')).toBe('apology')
  })
  test('falls back to formal for unknown / bad input', () => {
    expect(parseTonePreset('shouty')).toBe('formal')
    expect(parseTonePreset(null)).toBe('formal')
    expect(parseTonePreset(undefined)).toBe('formal')
    expect(parseTonePreset(123)).toBe('formal')
  })
})
