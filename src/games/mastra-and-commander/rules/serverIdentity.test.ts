/**
 * Regression: a destroyed server must not break the calls that referenced it.
 *
 * Servers used to be addressed by their index in `G.servers`, but Entropy's
 * attackServer SPLICES that array. Any face-down call already sitting in the
 * Context then either pointed past the end (crashing the board when it tried to
 * name the target) or — worse, because it was silent — slid onto a DIFFERENT
 * server and scored its Contribution instead. Servers now carry a stable id.
 */
import { describe, expect, it } from 'vitest'
import { emptyGameState, placeCall } from '../testing/fixtures'
import { describeCallTarget } from './playMoves'
import { slotContributions } from './evalHelpers'
import { applyEntropyEffect } from './entropyHelpers'

/** Two installed servers, so index-shifting bugs have room to show. */
function withTwoServers() {
  const G = emptyGameState()
  G.servers = [
    {
      id: 'srv-1',
      substrateCardId: 'TEST-OP-SCRATCHPAD',
      traitCardId: 'TEST-OP-MCP-FILESYSTEM',
      disabled: false,
    },
    {
      id: 'srv-2',
      substrateCardId: 'TEST-OP-SCRATCHPAD',
      traitCardId: 'TEST-OP-TOOL-WEBSEARCH',
      disabled: false,
    },
  ]
  return G
}

describe('server identity survives destruction', () => {
  it('names a call by the server it actually invoked', () => {
    const G = withTwoServers()
    placeCall(G, 'TEST-OP-AGENT', { kind: 'server', serverId: 'srv-2' })
    expect(describeCallTarget(G, { kind: 'server', serverId: 'srv-2' }))
      .toBe('Web Search Tool')
  })

  it('does not crash when the called server has been destroyed', () => {
    const G = withTwoServers()
    placeCall(G, 'TEST-OP-AGENT', { kind: 'server', serverId: 'srv-1' })

    applyEntropyEffect(
      G,
      { kind: 'attackServer' },
      { kind: 'server', serverId: 'srv-1', label: 'Filesystem MCP' },
      () => 0,
    )

    expect(G.servers.map((s) => s.id)).toEqual(['srv-2'])
    // The board renders this string; it must not throw.
    expect(() => describeCallTarget(G, { kind: 'server', serverId: 'srv-1' })).not.toThrow()
    // And the dangling call scores nothing — the surface really was lost.
    expect(slotContributions(G, G.contexts[0]!.slots[0]!)).toEqual([])
  })

  it('does not slide a surviving call onto a different server', () => {
    const G = withTwoServers()
    // Call the SECOND server, then destroy the FIRST. Under index addressing
    // the survivor shifted to index 0 and this call silently re-pointed.
    placeCall(G, 'TEST-OP-AGENT', { kind: 'server', serverId: 'srv-2' })

    applyEntropyEffect(
      G,
      { kind: 'attackServer' },
      { kind: 'server', serverId: 'srv-1', label: 'Filesystem MCP' },
      () => 0,
    )

    expect(describeCallTarget(G, { kind: 'server', serverId: 'srv-2' }))
      .toBe('Web Search Tool')
    expect(slotContributions(G, G.contexts[0]!.slots[0]!))
      .toEqual([{ color: 'amber', shape: 'circle' }])
  })
})
