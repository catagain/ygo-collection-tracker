/**
 * Scans the OCG database via /api/yugiohcn proxy for a sample of set codes to
 * collect every distinct rarityKey value. 
 * Usage: node scripts/scan-ocg-rarity-keys.mjs
 */
const SET_CODES = [
  // AGOV (Age of Overlord)
  'AGOV-JP001', 'AGOV-JP002', 'AGOV-JP008', 'AGOV-JP009', 'AGOV-JP010', 'AGOV-JP011', 'AGOV-JP012', 'AGOV-JP020', 'AGOV-JP030', 'AGOV-JP040', 'AGOV-JP050', 'AGOV-JP060', 'AGOV-JP066', 'AGOV-JP067', 'AGOV-JP070', 'AGOV-JP080',
  // AC03 (Animation Chronicle 2023 - has NPR/P)
  'AC03-JP001', 'AC03-JP005', 'AC03-JP009', 'AC03-JP011', 'AC03-JP015', 'AC03-JP029', 'AC03-JP030', 'AC03-JP038',
  // PHHY (Photon Hypernova)
  'PHHY-JP001', 'PHHY-JP002', 'PHHY-JP003', 'PHHY-JP019', 'PHHY-JP059',
  // DT10/DT13 (Duel Terminal - has DT rarities)
  'DT10-JP001', 'DT10-JP005', 'DT10-JP011', 'DT13-JP011', 'DT05-JP002', 'DT05-JP009', 'DT05-JP011', 'DT07-JP038',
  // 20AP (20th Anniversary Pack - has parallel rarities)
  '20AP-JP001', '20AP-JP051', '20AP-JP055', '20AP-JP057', '20AP-JP058', '20AP-JP059', '20AP-JP061', '20AP-JP077', '20AP-JP101',
  // SD40 (Structure Deck - has ScPR)
  'SD40-JP001', 'SD40-JP002', 'SD40-JP003', 'SD40-JP026',
  // ETCO/EP19 (Extra Pack - has EScR/20ScR)
  'ETCO-JP001', 'ETCO-JP009', 'ETCO-JP026', 'EP19-JP001', 'EP19-JP069', 'EP19-JP070',
  // 20TH (20th anniversary)
  '20TH-JPB01', '20TH-JPB05', '20TH-JPC17', '20TH-JPBS1', '20TH-JPBS6',
  // MP01 (Millennium)
  'MP01-JP001', 'MP01-JP002', 'MP01-JP006', 'MP01-JP013', 'MP01-JP030',
  // Various others
  'SD47-JP001', 'SD47-JP013', 'SD48-JP014', 'QCAC-JP001', 'QCAC-JP002', 'LVP1-JP001', 'LVP1-JP002', 'MAMA-JP001', 'MAMA-JP002', 'GRCR-JP001', 'GRCR-JP002', 'YCPC-JP001', 'YCPC-JP002', 'NECH-JP001', 'NECH-JP002', 'SD38-JP001', 'SD38-JP002', 'DP28-JP001', 'DP28-JP017', 'DP28-JP030', 'DBLE-JPS01', 'DBLE-JPS04', 'VS15-JPD00', 'VS15-JPS00', 'SJMP-JP001', 'VJMP-JP001', 'JMPR-JP001', 'MB01-JPS01', 'GSE-EN001', 'BP03-EN001', 'SP18-EN001', 'AST-001', 'LOD-001', 'MFC-001', 'CT09-JP001', 'GS02-JP001', 'GP16-JP001', 'IGAS-JP000', '15AX-JPY01', 'TKN4-JP001', 'CCC2-JPS01', 'LPG2-JP001', '25LP-JP001', 'SLF1-JP001', '24PP-JP001', '21PP-JP001', 'RA04-EN001', 'RA05-EN001', 'CT11-EN001', 'CT12-EN001', 'MAMS-EN001', 'KICO-EN001', 'TDS2-JP001', 'SD09-JP001', 'SD14-JP001', 'SD26-JP001', 'SD2-JP001', 'AT02-JP001', '302-001', 'SPDS-JP001', 'ABPF-JP001', 'DT12-JP001', 'DDY1-JP001', 'WP11-EN001', '20DS-JP001', 'YMAB-JP001', '21CC-JP001', 'MSC1-JP001', 'SPHR-JP001', '2017-EN001', 'DS14-JPLS1', 'EP18-JP001', 'MP01-JP017', 'RA03-EN001',
]

const seen = new Map() // rarityKey -> example set codes

async function main() {
  const base = 'http://localhost:5173/api/yugiohcn?setcode='
  let i = 0
  for (const sc of SET_CODES) {
    i++
    try {
      const r = await fetch(base + encodeURIComponent(sc))
      if (!r.ok) continue
      const j = await r.json()
      const card = j.card
      if (!card) continue
      const key = card.rarityKey
      const keys = card.rarityKeys ?? []
      if (key) {
        if (!seen.has(key)) seen.set(key, [])
        seen.get(key).push(sc)
      }
      for (const k of keys) {
        if (!seen.has(k)) seen.set(k, [])
        if (!seen.get(k).includes(sc)) seen.get(k).push(sc)
      }
    } catch {
      // ignore per-card failures
    }
    if (i % 25 === 0) console.log(`  progress ${i}/${SET_CODES.length}`)
  }
  console.log('\n=== 收集到的 OCG rarityKey (rarityKey + rarityKeys 聯集) ===')
  const sorted = [...seen.keys()].sort()
  for (const k of sorted) {
    console.log('  [' + k + ']  e.g. ' + seen.get(k).slice(0, 4).join(', '))
  }
}

main()