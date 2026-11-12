import { ORIGINAL_ECONOMICS, type OriginalEconomicsRecord } from './originalEconomics';
import { ORIGINAL_TRADE_BY_NAME } from './originalTrades';

/**
 * Which of our building types plays each original economics kind. Placement
 * follows the original records exactly; gameplay (price, profit, stock, recruits)
 * still uses our catalogue until the economy tables are ported. Buildings keep
 * their original kind (`Building.originalKind`) so that later work can switch.
 */
const BY_NAME: Record<string, string> = {
  // Commercial, matched by name or close equivalent.
  'Accountants': 'accountancy', 'Auto Dealers': 'autoShop', 'Bakery': 'bakers', 'Barbers': 'barbers',
  'Book Store': 'bookStore', 'Breakfast Bar': 'breakfastBar', 'Butchers': 'butchers', 'Cafe': 'cafe',
  'Convenience Store': 'convenienceStore', 'Local Store': 'convenienceStore', 'Dance Studio': 'danceStudio',
  'Department Store': 'departmentStore', 'Drug Store': 'drugStore', 'Finance Company': 'financeCompany',
  'Fur Store': 'furrier', 'Gas Station/Mechanic': 'autoShop', 'Grocery Store': 'grocers', 'Fruit and Veg. Store': 'grocers',
  'Gym': 'gym', 'Hardware Store': 'hardwareStore', 'Health Center': 'healthCenter', 'Jewelers': 'jewellers',
  'Bank (Large)': 'bankLarge', 'Hotel (Large)': 'hotelLarge', 'Laundry': 'laundry', 'Lawyers': 'lawFirm',
  'Library': 'library', 'Massage Parlor': 'massageParlor', 'Milk Bar': 'milkBar', 'Pawnbrokers': 'pawnbroker',
  'Plumbers': 'plumbers', 'Pool hall': 'poolHall', 'Printers': 'printers', 'Restaurant': 'restaurant',
  'Shoe Store': 'shoeStore', 'Bank': 'bankSmall', 'Hotel': 'hotelSmall', 'Tailors': 'tailors',
  'Trade Union': 'tradeUnion', 'Soda Fountain': 'milkBar', 'Ice Cream Parlor': 'milkBar',
  // Industrial and special kinds.
  'Cannery': 'cannery', 'Docks': 'docks', 'Newspaper': 'newspaper', 'Radio Station': 'radioStation',
  'Steel Mill': 'foundry', 'Fabricators': 'foundry', 'Engineers': 'foundry', 'Sheet Workers': 'foundry',
  'Paper Mill': 'mill', 'Textiles': 'mill', 'Weavers': 'mill', 'Freight Forwarding': 'garageDepot',
  'Wheelwrights': 'garageDepot', 'Warehouse': 'warehouse',
  // Charity, municipal and residential.
  'Soup kitchen': 'soupKitchen', 'Church': 'church', 'Orphanage': 'orphanage', 'City Hall': 'cityHall',
  'Courthouse': 'courthouse', 'Employment Exchange': 'labourExchange', 'F.B.I. Headquarters': 'fbiHQ',
  'Fire Department': 'firehouse', 'Hospital': 'hospital', 'Museum': 'museum', 'Police Headquarters': 'policeHQ',
  'Power Plant': 'powerPlant', 'Public Baths': 'publicBaths', 'Railroad Terminal': 'railroad', 'School': 'school',
  'US Post': 'usPost', 'Water Plant': 'waterPlant', 'Tenement block': 'tenementPoor', 'Residential': 'residence',
  'Empty Land': 'emptyLand',
};

/** Fallback by the original "Produce" column (Economics.xtx header). Fallbacks
 * never carry a recruit or special role: only exact matches create hood,
 * accountant or lawyer recruitment sites. */
const BY_PRODUCE: Record<number, string> = {
  1: 'grocers', 2: 'plumbers', 3: 'healthCenter', 4: 'danceStudio', 5: 'bookStore', 6: 'jewellers',
  7: 'pawnbroker', 8: 'tailors', 9: 'hardwareStore', 10: 'convenienceStore', 11: 'convenienceStore',
  12: 'pawnbroker', 13: 'mill', 14: 'soupKitchen',
};

export function ourTypeForOriginalKind(record: OriginalEconomicsRecord): string {
  return ORIGINAL_TRADE_BY_NAME[record.name] ?? BY_NAME[record.name] ?? BY_PRODUCE[record.produce] ?? (record.group === 1 ? 'mill' : 'convenienceStore');
}

/** Each record's gameplay type, and whether it is an exact or fallback match. */
export const ORIGINAL_KIND_TYPES = ORIGINAL_ECONOMICS.map(r =>
  ({ index: r.index, name: r.name, typeId: ourTypeForOriginalKind(r), exact: r.name in ORIGINAL_TRADE_BY_NAME || r.name in BY_NAME }));
