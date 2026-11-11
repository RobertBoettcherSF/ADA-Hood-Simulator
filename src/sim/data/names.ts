/** Period-appropriate name pools for procedurally generated citizens and hoods. */

export const MALE_FIRST = [
  'Alphonse', 'Vito', 'Salvatore', 'Frank', 'Johnny', 'Tommy', 'Angelo', 'Rocco', 'Carmine',
  'Dominic', 'Enzo', 'Gino', 'Luigi', 'Marco', 'Nico', 'Paulie', 'Sal', 'Tony', 'Vinnie',
  'Bugsy', 'Dutch', 'Lefty', 'Moe', 'Jake', 'Abe', 'Sam', 'Meyer', 'Solly', 'Hymie',
  'Sean', 'Declan', 'Patrick', 'Liam', 'Eamon', 'Rory', 'Mickey', 'Fergus', 'Brendan',
  'Walter', 'Harold', 'Clarence', 'Chester', 'Herbert', 'Raymond', 'Ernest', 'Floyd',
  'Otto', 'Klaus', 'Heinrich', 'Wilhelm', 'Stefan', 'Anton', 'Ludwig',
  'Amos', 'Cyrus', 'Silas', 'Homer', 'Virgil', 'Emmett', 'Wilbur', 'Elmer', 'Orville',
];

export const FEMALE_FIRST = [
  'Rosa', 'Concetta', 'Maria', 'Angelina', 'Lucia', 'Carmela', 'Gina', 'Nina', 'Sofia',
  'Bridget', 'Maureen', 'Nora', 'Colleen', 'Kathleen', 'Siobhan', 'Aileen',
  'Ruth', 'Esther', 'Sadie', 'Belle', 'Pearl', 'Mabel', 'Hazel', 'Edna', 'Vera', 'Opal',
  'Dorothy', 'Gladys', 'Mildred', 'Beatrice', 'Constance', 'Harriet', 'Florence',
  'Greta', 'Ilse', 'Anneliese', 'Hilde', 'Marlene',
  'Lillian', 'Wilma', 'Norma', 'Thelma', 'Bessie', 'Myrtle', 'Ada',
];

export const SURNAMES = [
  'Capone', 'Moretti', 'Bellini', 'Ricci', 'Costa', 'Rinaldi', 'Marino', 'Gallo', 'Fontana',
  'Genovese', 'Lombardi', 'Barbieri', 'Vitale', 'Ferrante', 'Bruno', 'Greco', 'Rizzo',
  'OConnell', 'Doyle', 'Kelly', 'Sullivan', 'Murphy', 'Flanagan', 'Gallagher', 'Quinn',
  'Byrne', 'Donnelly', 'Fitzgerald', 'Rourke', 'Maguire', 'Brennan',
  'Rosenberg', 'Goldstein', 'Weiss', 'Kaplan', 'Lansky', 'Bernstein', 'Shapiro', 'Roth',
  'Schmidt', 'Braun', 'Wagner', 'Keller', 'Hoffman', 'Zimmer', 'Krause', 'Bauer',
  'Kowalski', 'Nowak', 'Wozniak', 'Zielinski', 'Jankowski',
  'Whitaker', 'Ashford', 'Carmichael', 'Blackwood', 'Hollis', 'Vance', 'Sterling', 'Marsh',
  'Doyle', 'Crane', 'Hargrove', 'Pemberton', 'Locke', 'Radcliffe', 'Winslow',
  'Petrov', 'Sokolov', 'Ivanov', 'Volkov',
  'Papadakis', 'Stavros', 'Kostas',
];

export const NICKNAMES = [
  'Scarface', 'The Enforcer', 'Bugs', 'Baby Face', 'Pretty Boy', 'Lucky', 'The Waiter',
  'Machine Gun', 'The Chin', 'Three Fingers', 'The Cigar', 'Ice Pick', 'Knuckles',
  'The Weasel', 'Fats', 'Slim', 'The Ghost', 'Nails', 'Trigger', 'Whitey', 'Doc',
  'The Butcher', 'Sleepy', 'Cricket', 'Half-Moon', 'Tick-Tock', 'Silk', 'Curly',
];

export const GANG_SURNAMES = [
  'Moretti', 'OConnell', 'Rosenberg', 'Vanetti', 'Delgado', 'Kowalski', 'Bellini', 'Doyle',
  'Marchetti', 'Sullivan', 'Weiss', 'Corvino',
];

export const STREET_NAMES_NS = [
  'Wabash', 'Clark', 'Dearborn', 'State', 'Halsted', 'Ashland', 'Racine', 'Morgan',
  'Sangamon', 'Peoria', 'Carpenter', 'Laflin', 'Wood', 'Paulina', 'Hermitage', 'Wolcott',
  'Damen', 'Leavitt', 'Oakley', 'Claremont',
];

export const STREET_NAMES_EW = [
  'Madison', 'Monroe', 'Adams', 'Jackson', 'Van Buren', 'Harrison', 'Polk', 'Taylor',
  'Roosevelt', 'Maxwell', 'Cermak', 'Archer', 'Pershing', 'Garfield', 'Lawrence',
  'Belmont', 'Fullerton', 'Diversey', 'Addison', 'Irving',
];

export const NEWSPAPER_NAMES = [
  'Saint Volstead Herald',
  'Saint Volstead Post',
  'Saint Volstead Tribune',
  'Saint Volstead Times',
];

export const DISTRICT_NAMES: Record<string, string[]> = {
  downtown: ['The Loop', 'Gold Coast', 'Bankers Row', 'Marble Hill'],
  commercial: ['Market Square', 'Little Sicily', 'Printers Row', 'Trade Quarter', 'Old Town'],
  industrial: ['The Yards', 'Ironside', 'Canal Flats', 'Smokestack', 'Dockside'],
  residential: ['Shantytown', 'Rowhouse Hill', 'Kilgannon', 'Bricktown', 'Sawyer Park'],
  civic: ['Civic Center', 'Justice Square', 'Union Green'],
};
