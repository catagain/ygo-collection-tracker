import { describe, expect, it } from 'vitest'
import { parseYdk } from './parseYdk.ts'

describe('parseYdk', () => {
  it('parses standard YDK format with sections', () => {
    const input = `#main
14558127
14558127
89631139

#extra
44508094

!side
23434538`

    const result = parseYdk(input)
    const mainCards = result.cards.filter((c) => c.section === 'MAIN')
    const extraCards = result.cards.filter((c) => c.section === 'EXTRA')
    const sideCards = result.cards.filter((c) => c.section === 'SIDE')

    expect(mainCards).toHaveLength(2)
    expect(mainCards.find((c) => c.passcode === '14558127')?.quantity).toBe(2)
    expect(mainCards.find((c) => c.passcode === '89631139')?.quantity).toBe(1)
    expect(extraCards).toHaveLength(1)
    expect(extraCards[0].passcode).toBe('44508094')
    expect(sideCards).toHaveLength(1)
    expect(sideCards[0].passcode).toBe('23434538')
  })

  it('parses quantity prefix format', () => {
    const input = `#main
3 14558127
1 89631139
`

    const result = parseYdk(input)
    const mainCards = result.cards.filter((c) => c.section === 'MAIN')

    expect(mainCards.find((c) => c.passcode === '14558127')?.quantity).toBe(3)
    expect(mainCards.find((c) => c.passcode === '89631139')?.quantity).toBe(1)
  })

  it('returns unknown lines for invalid input', () => {
    const input = `#main
not-a-passcode
3 invalid`

    const result = parseYdk(input)
    expect(result.cards).toHaveLength(0)
    expect(result.unknownLines).toContain('not-a-passcode')
    expect(result.unknownLines).toContain('3 invalid')
  })

  it('defaults unknown section markers to MAIN', () => {
    const input = `14558127`
    const result = parseYdk(input)
    expect(result.cards[0].section).toBe('MAIN')
  })
})
