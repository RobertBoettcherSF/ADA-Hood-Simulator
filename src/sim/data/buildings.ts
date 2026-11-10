import type { BuildingType } from '../types';

/**
 * Every building type in New Temperance. Legal sites provide income, launder
 * money and act as fronts; illegal sites earn far more but need a front and
 * attract the FBI. Only the city can create municipal buildings.
 */
export const BUILDING_TYPES: BuildingType[] = [
  // ------------------------------------------------------------------ commercial
  { id: 'bakers', name: 'Bakers', cls: 'commercial', cost: 5200, profit: 260, storeys: 2, weight: { commercial: 10, residential: 8, downtown: 4 }, stores: ['counterfeit'] },
  { id: 'butchers', name: 'Butchers', cls: 'commercial', cost: 5600, profit: 280, storeys: 2, weight: { commercial: 9, residential: 7 }, stores: ['counterfeit'] },
  { id: 'grocers', name: 'Grocers', cls: 'commercial', cost: 6000, profit: 300, storeys: 2, weight: { commercial: 10, residential: 9 }, stores: ['counterfeit'] },
  { id: 'convenienceStore', name: 'Convenience Store', cls: 'commercial', cost: 6400, profit: 320, storeys: 2, weight: { commercial: 9, residential: 8, downtown: 5 }, stores: ['counterfeit'] },
  { id: 'shoeStore', name: 'Shoe Store', cls: 'commercial', cost: 6800, profit: 330, storeys: 2, weight: { commercial: 8, downtown: 6 }, stores: ['stolen', 'counterfeit'] },
  { id: 'tailors', name: 'Tailors', cls: 'commercial', cost: 7200, profit: 360, storeys: 2, weight: { commercial: 7, downtown: 6 }, stores: ['stolen', 'counterfeit'] },
  { id: 'bookStore', name: 'Book Store', cls: 'commercial', cost: 6600, profit: 300, storeys: 2, weight: { commercial: 6, downtown: 5 }, stores: ['counterfeit'] },
  { id: 'printers', name: 'Printers', cls: 'commercial', cost: 8200, profit: 400, storeys: 2, weight: { commercial: 5, industrial: 6 }, stores: ['counterfeit'] },
  { id: 'pawnbroker', name: 'Pawnbrokers', cls: 'commercial', cost: 7000, profit: 380, storeys: 2, weight: { commercial: 6, residential: 5 }, stores: ['stolen', 'counterfeit'] },
  { id: 'jewellers', name: 'Jewellers', cls: 'commercial', cost: 12500, profit: 720, storeys: 2, weight: { downtown: 8, commercial: 5 }, stores: ['stolen', 'counterfeit'] },
  { id: 'furrier', name: 'Furrier', cls: 'commercial', cost: 12000, profit: 700, storeys: 2, weight: { downtown: 6, commercial: 4 }, stores: ['stolen', 'counterfeit'] },
  { id: 'drugStore', name: 'Drug Store', cls: 'commercial', cost: 7400, profit: 350, storeys: 2, weight: { commercial: 9, residential: 8 }, stores: ['counterfeit'] },
  { id: 'plumbers', name: 'Plumbers', cls: 'commercial', cost: 5800, profit: 260, storeys: 2, weight: { commercial: 6, industrial: 7, residential: 5 } },
  { id: 'cafe', name: 'Cafe', cls: 'commercial', cost: 6200, profit: 300, storeys: 2, weight: { commercial: 9, downtown: 7, residential: 6 }, stores: ['liquor', 'counterfeit'], recruit: 'hood' },
  { id: 'milkBar', name: 'Milk Bar', cls: 'commercial', cost: 5800, profit: 280, storeys: 2, weight: { commercial: 8, residential: 7 }, stores: ['liquor', 'counterfeit'] },
  { id: 'breakfastBar', name: 'Breakfast Bar', cls: 'commercial', cost: 5600, profit: 270, storeys: 2, weight: { commercial: 7, industrial: 6 }, stores: ['liquor', 'counterfeit'] },
  { id: 'restaurant', name: 'Restaurant', cls: 'commercial', cost: 9800, profit: 520, storeys: 3, weight: { downtown: 8, commercial: 7 }, stores: ['liquor', 'counterfeit'] },
  { id: 'poolHall', name: 'Pool Hall', cls: 'commercial', cost: 7600, profit: 340, storeys: 2, weight: { commercial: 7, residential: 6, industrial: 4 }, stores: ['liquor'], recruit: 'hood' },
  { id: 'gym', name: 'Gymnasium', cls: 'commercial', cost: 7800, profit: 330, storeys: 2, weight: { commercial: 6, residential: 6, industrial: 4 }, recruit: 'hood' },
  { id: 'healthCenter', name: 'Health Center', cls: 'commercial', cost: 9000, profit: 430, storeys: 3, weight: { downtown: 5, commercial: 5 } },
  { id: 'massageParlor', name: 'Massage Parlor', cls: 'commercial', cost: 8400, profit: 420, storeys: 2, weight: { commercial: 5, downtown: 4 } },
  { id: 'danceStudio', name: 'Dance Studio', cls: 'commercial', cost: 8000, profit: 400, storeys: 2, weight: { downtown: 5, commercial: 5 } },
  { id: 'barbers', name: 'Barbers', cls: 'commercial', cost: 4800, profit: 220, storeys: 2, weight: { commercial: 8, residential: 8 } },
  { id: 'laundry', name: 'Laundry', cls: 'commercial', cost: 5400, profit: 250, storeys: 2, weight: { commercial: 7, residential: 8, industrial: 5 }, stores: ['counterfeit'] },
  { id: 'hardwareStore', name: 'Hardware Store', cls: 'commercial', cost: 6600, profit: 310, storeys: 2, weight: { commercial: 7, industrial: 6 }, stores: ['stolen'] },
  { id: 'autoShop', name: 'Auto Shop', cls: 'commercial', cost: 9200, profit: 450, storeys: 2, weight: { commercial: 6, industrial: 8 }, stores: ['stolen'] },
  { id: 'financeCompany', name: 'Finance Company', cls: 'commercial', cost: 14000, profit: 780, storeys: 4, weight: { downtown: 9, commercial: 3 }, stores: ['counterfeit'], recruit: 'accountant' },
  { id: 'accountancy', name: 'Accountancy Firm', cls: 'commercial', cost: 11000, profit: 560, storeys: 3, weight: { downtown: 8, commercial: 3 }, recruit: 'accountant' },
  { id: 'lawFirm', name: 'Law Offices', cls: 'commercial', cost: 12000, profit: 620, storeys: 4, weight: { downtown: 8, civic: 6 }, recruit: 'lawyer' },
  { id: 'hotelSmall', name: 'Hotel', cls: 'commercial', cost: 13000, profit: 700, storeys: 4, weight: { downtown: 6, commercial: 5 }, stores: ['liquor', 'counterfeit'] },
  { id: 'hotelLarge', name: 'Hotel (Large)', cls: 'commercial', cost: 26000, profit: 1500, storeys: 7, weight: { downtown: 5 }, stores: ['liquor', 'counterfeit'] },
  { id: 'departmentStore', name: 'Department Store', cls: 'commercial', cost: 34000, profit: 2100, storeys: 6, weight: { downtown: 6 }, stores: ['stolen', 'counterfeit'] },
  { id: 'bankSmall', name: 'Bank', cls: 'commercial', cost: 22000, profit: 1250, storeys: 4, weight: { downtown: 5, commercial: 2 }, stores: ['counterfeit'], special: 'bank' },
  { id: 'bankLarge', name: 'Main Bank', cls: 'commercial', cost: 46000, profit: 2800, storeys: 8, weight: { downtown: 3 }, stores: ['counterfeit'], special: 'bank', recruit: 'accountant' },
  { id: 'newspaper', name: 'Newspaper Offices', cls: 'commercial', cost: 24000, profit: 900, storeys: 5, weight: {}, special: 'newspaper' },
  { id: 'radioStation', name: 'Radio Station', cls: 'commercial', cost: 24000, profit: 900, storeys: 3, weight: {}, special: 'radio' },

  // ------------------------------------------------------------------ industrial
  { id: 'warehouse', name: 'Warehouse', cls: 'industrial', cost: 9000, profit: 0, storeys: 2, weight: { industrial: 12 }, stores: ['liquor', 'stolen', 'counterfeit'] },
  { id: 'foundry', name: 'Foundry', cls: 'industrial', cost: 16000, profit: 780, storeys: 3, weight: { industrial: 10 } },
  { id: 'mill', name: 'Mill', cls: 'industrial', cost: 14000, profit: 680, storeys: 3, weight: { industrial: 9 } },
  { id: 'cannery', name: 'Cannery', cls: 'industrial', cost: 13000, profit: 640, storeys: 3, weight: { industrial: 9 }, stores: ['liquor'] },
  { id: 'garageDepot', name: 'Garage Depot', cls: 'industrial', cost: 11000, profit: 520, storeys: 2, weight: { industrial: 8 }, stores: ['stolen'] },
  { id: 'tradeUnion', name: 'Trade Union', cls: 'industrial', cost: 12000, profit: 380, storeys: 3, weight: { industrial: 6 }, special: 'union' },
  { id: 'docks', name: 'Docks', cls: 'industrial', cost: 30000, profit: 1200, storeys: 2, weight: {}, special: 'docks', stores: ['liquor', 'stolen'], recruit: 'hood' },
  { id: 'railroad', name: 'Railroad Terminal', cls: 'industrial', cost: 30000, profit: 1200, storeys: 3, weight: {}, special: 'railroad', stores: ['liquor', 'stolen'] },

  // ------------------------------------------------------------------ tenement
  { id: 'tenementPoor', name: 'Tenement Block', cls: 'tenement', cost: 4200, profit: 200, storeys: 4, weight: { residential: 14, industrial: 6 } },
  { id: 'tenementMid', name: 'Apartment Block', cls: 'tenement', cost: 7000, profit: 380, storeys: 5, weight: { residential: 10, commercial: 6 } },
  { id: 'tenementRich', name: 'Residences', cls: 'tenement', cost: 12000, profit: 640, storeys: 5, weight: { residential: 5, downtown: 5 } },

  // ------------------------------------------------------------------ municipal
  { id: 'cityHall', name: 'City Hall', cls: 'municipal', cost: 0, profit: 0, storeys: 6, weight: {}, special: 'cityHall' },
  { id: 'courthouse', name: 'Courthouse', cls: 'municipal', cost: 0, profit: 0, storeys: 5, weight: {}, special: 'courthouse', recruit: 'lawyer' },
  { id: 'policeHQ', name: 'Police Headquarters', cls: 'municipal', cost: 0, profit: 0, storeys: 4, weight: {}, special: 'policeHQ' },
  { id: 'hospital', name: 'Hospital', cls: 'municipal', cost: 0, profit: 0, storeys: 5, weight: { civic: 3 }, special: 'hospital' },
  { id: 'school', name: 'School', cls: 'municipal', cost: 0, profit: 0, storeys: 3, weight: { civic: 4, residential: 3 } },
  { id: 'library', name: 'Library', cls: 'municipal', cost: 0, profit: 0, storeys: 3, weight: { civic: 3 } },
  { id: 'labourExchange', name: 'Labour Exchange', cls: 'municipal', cost: 0, profit: 0, storeys: 2, weight: { civic: 3, industrial: 3 }, recruit: 'hood' },
  { id: 'firehouse', name: 'Fire House', cls: 'municipal', cost: 0, profit: 0, storeys: 2, weight: { civic: 2, residential: 2 } },
  // Civic estates of the original 40 × 32 city (economics records 156–169).
  { id: 'fbiHQ', name: 'F.B.I. Headquarters', cls: 'municipal', cost: 0, profit: 0, storeys: 5, weight: {} },
  { id: 'museum', name: 'Museum', cls: 'municipal', cost: 0, profit: 0, storeys: 3, weight: {} },
  { id: 'publicBaths', name: 'Public Baths', cls: 'municipal', cost: 0, profit: 0, storeys: 2, weight: {} },
  { id: 'usPost', name: 'US Post', cls: 'municipal', cost: 0, profit: 0, storeys: 3, weight: {} },
  { id: 'powerPlant', name: 'Power Plant', cls: 'municipal', cost: 0, profit: 0, storeys: 3, weight: {} },
  { id: 'waterPlant', name: 'Water Plant', cls: 'municipal', cost: 0, profit: 0, storeys: 2, weight: {} },

  // ------------------------------------------------------------------ residential
  // Plain houses in the original's row-house strips: part of the city, not a business.
  { id: 'residence', name: 'Residences', cls: 'residential', cost: 0, profit: 0, storeys: 2, weight: {} },

  // ------------------------------------------------------------------ charity
  { id: 'church', name: 'Church', cls: 'charity', cost: 0, profit: 0, storeys: 3, weight: { residential: 3, civic: 3 }, special: 'church' },
  { id: 'orphanage', name: 'Orphanage', cls: 'charity', cost: 0, profit: 0, storeys: 3, weight: { residential: 2 }, special: 'orphanage' },
  { id: 'soupKitchen', name: 'Soup Kitchen', cls: 'charity', cost: 3000, profit: -180, storeys: 1, weight: {} },

  // ------------------------------------------------------------------ illegal
  {
    id: 'office', name: 'Office', cls: 'illegal', cost: 6000, profit: 0, storeys: 2, weight: {},
    fronts: ['*'],
  },
  {
    id: 'speakeasy', name: 'Speakeasy', cls: 'illegal', cost: 8000, profit: 3000, storeys: 1, weight: {},
    fronts: ['restaurant', 'milkBar', 'cafe', 'breakfastBar', 'poolHall', 'hotelSmall', 'hotelLarge'],
    stores: ['liquor'],
  },
  {
    id: 'moonshineStill', name: 'Moonshine Still', cls: 'illegal', cost: 4500, profit: 0, storeys: 1, weight: {},
    fronts: ['drugStore', 'plumbers', 'laundry', 'cannery'],
    produces: { kind: 'liquor', amount: 90 }, stores: ['liquor'],
  },
  {
    id: 'casino', name: 'Casino', cls: 'illegal', cost: 18000, profit: 4200, storeys: 1, weight: {},
    fronts: ['bankLarge', 'bankSmall', 'hotelLarge', 'departmentStore', 'restaurant'],
  },
  {
    id: 'cardGames', name: 'Card Games', cls: 'illegal', cost: 4000, profit: 900, storeys: 1, weight: {},
    fronts: ['bookStore', 'cafe', 'barbers'],
  },
  {
    id: 'diceGame', name: 'Dice Game', cls: 'illegal', cost: 3600, profit: 820, storeys: 1, weight: {},
    fronts: ['poolHall', 'gym', 'barbers'],
  },
  {
    id: 'gamblingDen', name: 'Gambling Den', cls: 'illegal', cost: 6500, profit: 1600, storeys: 1, weight: {},
    fronts: ['poolHall', 'cafe', 'hotelSmall'],
  },
  {
    id: 'prizeFight', name: 'Prizefight Ring', cls: 'illegal', cost: 7000, profit: 1750, storeys: 1, weight: {},
    fronts: ['poolHall', 'gym', 'healthCenter'],
  },
  {
    id: 'grifters', name: 'Grifters', cls: 'illegal', cost: 4200, profit: 1050, storeys: 1, weight: {},
    fronts: ['pawnbroker', 'jewellers', 'furrier'], stores: ['stolen'],
  },
  {
    id: 'insiderTrading', name: 'Insider Trading', cls: 'illegal', cost: 12000, profit: 2500, storeys: 1, weight: {},
    fronts: ['financeCompany', 'accountancy', 'bankSmall', 'bankLarge'],
  },
  {
    id: 'loanShark', name: 'Loan Shark', cls: 'illegal', cost: 7500, profit: 1900, storeys: 1, weight: {},
    fronts: ['bankSmall', 'bankLarge', 'pawnbroker', 'financeCompany', 'hotelSmall'],
  },
  {
    id: 'counterfeitPress', name: 'Counterfeit Press', cls: 'illegal', cost: 9500, profit: 0, storeys: 1, weight: {},
    fronts: ['printers', 'bankSmall', 'bankLarge', 'bookStore'],
    produces: { kind: 'counterfeit', amount: 5 }, stores: ['counterfeit'],
  },
  {
    id: 'numbersRacket', name: 'Numbers Racket', cls: 'illegal', cost: 5000, profit: 1300, storeys: 1, weight: {},
    fronts: ['convenienceStore', 'grocers', 'barbers', 'bakers'],
  },
  {
    id: 'rentedRooms', name: 'Rented Rooms', cls: 'illegal', cost: 11000, profit: 0, storeys: 4, weight: {},
    fronts: ['massageParlor', 'danceStudio', 'hotelSmall', 'hotelLarge', 'healthCenter'],
  },
  {
    id: 'teamsters', name: 'Teamsters', cls: 'illegal', cost: 8500, profit: 1100, storeys: 1, weight: {},
    fronts: ['tradeUnion', 'garageDepot', 'foundry', 'mill', '*'],
  },
];

export const BUILDING_BY_ID: Record<string, BuildingType> = Object.fromEntries(
  BUILDING_TYPES.map((b) => [b.id, b]),
);

export const ILLEGAL_TYPES = BUILDING_TYPES.filter((b) => b.cls === 'illegal');
export const BUYABLE_LEGAL_TYPES = BUILDING_TYPES.filter(
  (b) => (b.cls === 'commercial' || b.cls === 'industrial' || b.cls === 'tenement') && !b.special,
);

/** Everything a gang may put up on land it owns, outside the centre lot. */
export const ESTABLISHABLE_TYPES = [
  ...BUYABLE_LEGAL_TYPES,
  // A soup kitchen costs money to run and buys a great deal of goodwill.
  BUILDING_BY_ID.soupKitchen,
];

/** How convincing `front` is as cover for `illegal`. 0.35 (poor) .. 0.95 (ideal). */
export function coverQuality(illegalId: string, frontTypeId: string): number {
  const t = BUILDING_BY_ID[illegalId];
  if (!t || !t.fronts) return 0.35;
  if (t.fronts.includes(frontTypeId)) return 0.95;
  if (t.fronts.includes('*')) return 0.6;
  const front = BUILDING_BY_ID[frontTypeId];
  if (!front) return 0.35;
  // Partial credit when the front at least stores the same goods.
  if (front.stores && t.stores && front.stores.some((s) => t.stores!.includes(s))) return 0.6;
  if (front.cls === 'commercial') return 0.45;
  return 0.35;
}
