export type CardLanguage = 'JP' | 'AE' | 'EN' | 'OTHER'

export type DeckSection = 'MAIN' | 'EXTRA' | 'SIDE'

export type RarityCode =
  | 'C'
  | 'NR'
  | 'NPR'
  | 'R'
  | 'SR'
  | 'UR'
  | 'ScR'
  | 'UtR'
  | 'HR'
  | 'CR'
  | 'StR'
  | '20thSER'
  | 'PSER'
  | 'QCSR'
  | 'GR'
  | 'PGR'
  | 'UR-OR'
  | 'ScR-OR'
  | 'PSER-OR'

export interface RarityOption {
  code: RarityCode
  label: string
  enName: string
  jpName: string
  twName: string
}

export const RARITIES: RarityOption[] = [
  { code: 'C', label: 'C (Normal / Common)', enName: 'Common', jpName: 'ノーマル', twName: '普卡 / 平卡' },
  { code: 'NR', label: 'NR (Normal Rare)', enName: 'Normal Rare', jpName: 'ノーマルレア', twName: '隱普' },
  { code: 'NPR', label: 'NPR (Normal Parallel Rare)', enName: 'Normal Parallel Rare', jpName: 'ノーマルパラレルレア', twName: '普鑽' },
  { code: 'R', label: 'R (Rare)', enName: 'Rare', jpName: 'レア', twName: '銀字' },
  { code: 'SR', label: 'SR (Super Rare)', enName: 'Super Rare', jpName: 'スーパーレア', twName: '面閃 / 亮面' },
  { code: 'UR', label: 'UR (Ultra Rare)', enName: 'Ultra Rare', jpName: 'ウルトラレア', twName: '金閃 / 金字亮面' },
  { code: 'ScR', label: 'ScR (Secret Rare)', enName: 'Secret Rare', jpName: 'シークレットレア', twName: '半鑽 / 碎鑽' },
  { code: 'UtR', label: 'UtR (Ultimate Rare)', enName: 'Ultimate Rare', jpName: 'アルティメットレア', twName: '3D凸鑽 / 浮雕' },
  { code: 'HR', label: 'HR (Holographic / Ghost Rare)', enName: 'Holographic Rare', jpName: 'ホログラフィックレア', twName: '雷射 / 鬼閃' },
  { code: 'CR', label: 'CR (Collector\'s Rare)', enName: "Collector's Rare", jpName: 'コレクターズレア', twName: '雕鑽' },
  { code: 'StR', label: 'StR (Starlight Rare)', enName: 'Starlight Rare', jpName: 'スターライトレア', twName: '星光鑽' },
  { code: '20thSER', label: '20th SER (20th Secret Rare)', enName: '20th Secret Rare', jpName: '20thシークレットレア', twName: '紅碎' },
  { code: 'PSER', label: 'PSER (Prismatic Secret Rare)', enName: 'Prismatic Secret Rare', jpName: 'プリズマティック', twName: '白碎 / 稜鏡鑽' },
  { code: 'QCSR', label: 'QCSR (Quarter Century Secret Rare)', enName: 'Quarter Century Secret Rare', jpName: 'クォーターセンチュリー', twName: '25周年鑽 / QC碎' },
  { code: 'GR', label: 'GR (Gold Rare)', enName: 'Gold Rare', jpName: 'ゴールドレア', twName: '黃金閃 / 大便閃' },
  { code: 'PGR', label: 'PGR (Premium Gold Rare)', enName: 'Premium Gold Rare', jpName: 'プレミアムゴールド', twName: '尊爵黃金閃' },
  { code: 'UR-OR', label: 'UR-OR (Ultra Rare Over Frame)', enName: 'Ultra Rare Over Frame', jpName: 'ウルトラレア オーバーフレーム', twName: '金亮超框' },
  { code: 'ScR-OR', label: 'ScR-OR (Secret Rare Over Frame)', enName: 'Secret Rare Over Frame', jpName: 'シークレットレア オーバーフレーム', twName: '半鑽超框' },
  { code: 'PSER-OR', label: 'PSER-OR (Prismatic Secret Rare Over Frame)', enName: 'Prismatic Secret Rare Over Frame', jpName: 'プリズマティック オーバーフレーム', twName: '白鑽超框' },
]

export interface CardSet {
  setCode: string
  setName: string
  rarity: string
  rarityCode?: string | null
}

export interface CardPrices {
  tcgplayer_price?: number
  cardmarket_price?: number
  ebay_price?: number
  amazon_price?: number
  coolstuffinc_price?: number
}

export interface Card {
  passcode: string
  name: string
  type: string
  frameType: string
  imageUrl: string | null
  imageUrlSmall: string | null
  sets: CardSet[]
  prices?: CardPrices
}

export interface CollectionItem {
  id: string
  passcode: string
  name: string
  nameJa?: string
  setCode: string
  language: CardLanguage
  rarity: string
  quantity: number
  memo?: string
  imageUrl: string | null
  price?: number
  priceSource?: 'tcgplayer' | 'cardmarket' | 'ebay' | 'amazon' | 'coolstuffinc' | 'ruten' | 'manual'
  priceCurrency?: 'TWD' | 'USD'
  createdAt: number
  updatedAt: number
}

export interface AppSettings {
  currency: 'TWD' | 'USD'
  pricePriority: 'ruten' | 'ygo'
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'TWD',
  pricePriority: 'ruten',
}

export interface DeckCard {
  passcode: string
  name: string
  quantity: number
  section: DeckSection
  imageUrl: string | null
}

export interface Deck {
  id: string
  name: string
  description?: string
  cards: DeckCard[]
  createdAt: number
  updatedAt: number
}

export interface CardCacheEntry {
  passcode: string
  card: Card | null
  fetchedAt: number
}
