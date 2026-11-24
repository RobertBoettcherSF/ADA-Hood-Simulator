// The words for the core's numbered order lines and command replies, in the
// four page languages. The English lines are 1.2.91's, word for word (the
// Debug order check and tests/order-check.mjs compare them); building, place
// and street names stay in English as everywhere on the page.
import { Lang } from './i18n';
import { Line, LineKind, LINE_KINDS, OrderKind, ORDER_KINDS, Reply, ReplyKind } from './orders';

export interface TextContext {
  lang: Lang;
  place(building: number): string;      // placeName
  building(building: number): string;   // buildingName
  person(person: number): string;
  gang(gang: number): string;           // "The Moretti Gang"
  crew(slot: number): string;           // "Luigi's Crew"
  type(typeId: number): string;
  me: number;                           // the player's gang
}

const LOCALE: Record<Lang, string> = { 'en-GB': 'en-US', de: 'de-DE', es: 'es-ES', fr: 'fr-FR' };
export const money = (lang: Lang, n: number) => '$' + n.toLocaleString(LOCALE[lang]);
/** "39h 36m", "45m" (1.2.91 hm). */
export function hm(minutes: number): string {
  const total = Math.round(minutes), abs = Math.abs(total), h = Math.floor(abs / 60), m = abs % 60;
  const sign = total < 0 ? '−' : '';
  return h ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
}

type Dict = Record<string, string>;

const ORDER_NAMES: Record<Lang, Record<OrderKind, string>> = {
  'en-GB': { buy: 'Buy Premises', setUp: 'Set Up Business', run: 'Run Business', collect: 'Collect Protection',
    adjust: 'Adjust Protection', donate: 'Donate to Charity', cleanUp: 'Clean-up Drive', clearStreets: 'Clear the Streets',
    guard: 'Guard Business', patrol: 'Patrol', explore: 'Explore', recruit: 'Recruit', goTo: 'Go To' },
  de: { buy: 'Gebäude kaufen', setUp: 'Geschäft eröffnen', run: 'Geschäft führen', collect: 'Schutzgeld kassieren',
    adjust: 'Schutzgeld anpassen', donate: 'Spenden', cleanUp: 'Aufräumaktion', clearStreets: 'Straßen räumen',
    guard: 'Geschäft bewachen', patrol: 'Streife', explore: 'Erkunden', recruit: 'Anwerben', goTo: 'Gehe zu' },
  es: { buy: 'Comprar local', setUp: 'Abrir negocio', run: 'Llevar negocio', collect: 'Cobrar protección',
    adjust: 'Ajustar protección', donate: 'Donar', cleanUp: 'Campaña de limpieza', clearStreets: 'Despejar las calles',
    guard: 'Vigilar negocio', patrol: 'Patrulla', explore: 'Explorar', recruit: 'Reclutar', goTo: 'Ir a' },
  fr: { buy: 'Acheter des locaux', setUp: 'Ouvrir une affaire', run: 'Gérer une affaire', collect: 'Encaisser la protection',
    adjust: 'Ajuster la protection', donate: 'Faire un don', cleanUp: 'Opération nettoyage', clearStreets: 'Dégager les rues',
    guard: 'Garder une affaire', patrol: 'Patrouille', explore: 'Explorer', recruit: 'Recruter', goTo: 'Aller à' },
};
export const orderName = (lang: Lang, k: OrderKind) => ORDER_NAMES[lang][k];

const EN: Dict = {
  L_Bought: 'Bought {place} for {b$}.', L_Opened: 'Opened a {type}.', L_New_Management: 'New management installed at {place}.',
  L_Collected: 'Collected {b$} from {place}.', L_Refused_Pay: '{owner} refused to pay.', L_Already_Paid: '{place} has already paid this week.',
  L_Protection_Set: 'Protection at {place} set to {b$}.', L_Donated: 'Donated {b$} to {place}.', L_Cleaned_Up: 'Cleaned up round {place}.',
  L_Cleared: 'The streets round {place} were cleared.', L_Looked_Over: 'Looked over {place}: {standing}.',
  owned_by: 'owned by {who}', paying_to: 'paying {d$} a week to {who}', paying_nobody: 'paying nobody', you: 'you',
  L_Found_Hidden: 'Found a {hidden} behind {place}.', L_Nobody_Hiring: 'Nobody worth hiring at {place}.',
  L_Nobody_Hiring_Else: 'Nobody worth hiring at {place} — word is there are people looking for work at {else}.',
  L_Signed_On_1: '1 hood signed on, waiting in the pool.', L_Signed_On_n: '{b} hoods signed on, waiting in the pool.',
  L_Nobody_Willing: 'Nobody new was willing to work for you.', L_Stood_Guard: 'Stood guard at {place} for {bhm}.',
  L_Patrolled_1: 'Patrolled 1 block for {chm}.', L_Patrolled_n: 'Patrolled {b} blocks for {chm}.', L_Held: 'Held position for {bhm}.',
  L_Ran_Out: 'Ran out of week before finishing every target.',
  L_Continuing: '{order}: continuing with {b} of {c} people; the others are unavailable.',
  F_No_Site: 'No such site.', F_Owned_Already: 'Somebody else already owns it.', F_Not_For_Sale: 'Those premises are no longer available to buy.',
  F_Price: 'You could not cover the asking price.', F_Not_Yours: 'You do not own that land.', F_No_Type: 'No business type was chosen.',
  F_Illegal_Centre: 'Illegal businesses can only occupy the centre of a block.', F_Legal_Centre: 'Only illegal businesses belong in the centre of a block.',
  F_City_Only: 'Only the city builds those.', F_No_Front: 'That illegal business has no front on the block.',
  F_Front_Taken: 'That front already hides another operation.', F_Fit_Out: 'You could not afford the fit-out.',
  F_Not_Your_Site: 'That is not one of your sites.', F_No_Hood_Free: 'No hood was free to run {place}.', F_No_Charity: 'No charity there.',
  F_No_Donation: 'No donation was offered.', F_Spare_Money: 'You could not spare the money.', F_Clean_Up_Money: 'You could not pay for the clean-up.',
  F_Streets_Not_Bribed: 'Neither the mayor nor the police chief will do it for you any more.', F_Site_Gone: 'The site is gone.',
  F_Nobody_Left: 'Nobody was left to carry out the order.', F_Never_Started: 'The order never started. {inner}',
  F_Not_Enough_Time: 'There was not enough time in the week to perform the order.', F_Nothing_Came: 'Nothing came of it.',
  F_Needs_People: 'This order needs {a} people, but only {b} remain in the crew.',
  F_Needs_Free_1: 'This order needs {a} people; 1 is {free}.', F_Needs_Free_n: 'This order needs {a} people; {b} are {free}.',
  available: 'available', free: 'free', F_Target_Lost: 'The target could not be found.',
  F_Never_Started_Default: 'The order never started. No crew was available before the week ended.',
  M_Acquired: 'Acquired {place}.', M_Opened: 'Opened a {type}.', M_Refused_Protection: '{place} refused to pay protection.',
  M_Uncovered: 'Your hoods uncovered a hidden {hiddenB}.', M_Order_Failed: 'Order failed: {order} — {inner}',
  M_Order_Cut_Short: 'Order cut short: {order} — {inner}', M_Queued_Waiting: '{order} is queued: {inner}', the_owner: 'The owner',
  Y_Accepted: '{lt} accepted the order.', Y_Cancelled: 'Order cancelled.', Y_Back_On_Street: '{pa} is back on the street.',
  Y_Promoted: '{pa} now runs his own crew.', Y_Broken_Up: 'The crew has been broken up.', Y_Joined: '{pa} joined {crewB}.',
  Y_Already_In: '{pa} is already in {crewB}.', Y_Done: '', Y_No_Crew: 'No such crew.',
  Y_Lt_Unavailable: 'That lieutenant is not available. Promote somebody to take the crew.',
  Y_Positive_Whole: 'Choose a positive whole number of people.', Y_Only_People: '{lt} has only {b} people.',
  Y_At_Most_1: '{order} takes at most 1 person.', Y_At_Most_n: '{order} takes at most {b} people.',
  Y_Valid_Amount: 'Choose a valid amount.', Y_Donation_Zero: 'A donation must be greater than zero.',
  Y_Streets: 'Clearing the streets needs the mayor or the police chief on your side (bribed).',
  Y_Rate: 'Choose a protection rate between zero and double.', Y_No_Block: 'No such block.', Y_No_Site: 'No such site.',
  Y_Valid_Site: 'Choose a valid site for that order.', Y_Site_Not_Valid: 'That site is not valid for this order.',
  Y_Inside_City: 'Choose a place inside the city.', Y_Nothing_There: 'Nothing there for that order.',
  Y_Cannot_Afford: "You cannot afford it: it costs {a$} and {b$} is left after this week's orders.",
  Y_No_Time_Trim: '{lt} has not got the time for all {b} sites — he could manage {c} of them.',
  Y_No_Time: '{lt} has not got the time. Reduce the area, add manpower, or leave it until next week.',
  Y_Too_Many_Orders: 'That crew cannot take more orders this week.', Y_No_Order: 'No such order.', Y_No_Person: 'No such person.',
  Y_Choose_Hood: 'Choose one of your hoods.', Y_Not_In_Pool: 'That hood is not in the pool or a crew.',
  Y_Max_Lieutenants: 'You already have {a} lieutenants.', Y_Could_Not_Promote: 'Could not promote.',
  Y_Choose_Hood_Crew: 'Choose one of your hoods and one of your crews.', Y_Crew_Full: 'That crew is full.',
  Y_Choose_Crew_Hood: 'Choose one of your crew hoods.',
  Y_Bought: 'Bought a {vehicle}.', Y_Cannot_Afford_It: 'You cannot afford it.', V_0: 'Speedster', V_1: 'Coupe', V_2: 'Truck',
};

const DE: Dict = {
  L_Bought: '{place} für {b$} gekauft.', L_Opened: '{type} eröffnet.', L_New_Management: 'Neue Leitung in {place} eingesetzt.',
  L_Collected: '{b$} von {place} kassiert.', L_Refused_Pay: '{owner} hat sich geweigert zu zahlen.', L_Already_Paid: '{place} hat diese Woche schon gezahlt.',
  L_Protection_Set: 'Schutzgeld bei {place} auf {b$} gesetzt.', L_Donated: '{b$} an {place} gespendet.', L_Cleaned_Up: 'Rund um {place} aufgeräumt.',
  L_Cleared: 'Die Straßen um {place} wurden geräumt.', L_Looked_Over: '{place} angesehen: {standing}.',
  owned_by: 'gehört {who}', paying_to: 'zahlt {d$} pro Woche an {who}', paying_nobody: 'zahlt niemandem', you: 'dir',
  L_Found_Hidden: '{hidden} hinter {place} gefunden.', L_Nobody_Hiring: 'Niemand Brauchbares bei {place}.',
  L_Nobody_Hiring_Else: 'Niemand Brauchbares bei {place} — es heißt, bei {else} suchen Leute Arbeit.',
  L_Signed_On_1: '1 Mann angeheuert, wartet im Pool.', L_Signed_On_n: '{b} Männer angeheuert, warten im Pool.',
  L_Nobody_Willing: 'Niemand Neues wollte für dich arbeiten.', L_Stood_Guard: 'Wache bei {place} für {bhm}.',
  L_Patrolled_1: '1 Block für {chm} bestreift.', L_Patrolled_n: '{b} Blocks für {chm} bestreift.', L_Held: 'Position für {bhm} gehalten.',
  L_Ran_Out: 'Die Woche war vorbei, bevor jedes Ziel erledigt war.',
  L_Continuing: '{order}: weiter mit {b} von {c} Leuten; die anderen sind nicht verfügbar.',
  F_No_Site: 'Kein solcher Ort.', F_Owned_Already: 'Das gehört schon jemand anderem.', F_Not_For_Sale: 'Das Gebäude ist nicht mehr zu kaufen.',
  F_Price: 'Du konntest den Preis nicht aufbringen.', F_Not_Yours: 'Das Grundstück gehört dir nicht.', F_No_Type: 'Keine Geschäftsart gewählt.',
  F_Illegal_Centre: 'Illegale Geschäfte gehören nur in die Mitte eines Blocks.', F_Legal_Centre: 'In die Mitte eines Blocks gehören nur illegale Geschäfte.',
  F_City_Only: 'Das baut nur die Stadt.', F_No_Front: 'Dieses illegale Geschäft hat keine Tarnung im Block.',
  F_Front_Taken: 'Diese Tarnung versteckt schon ein anderes Geschäft.', F_Fit_Out: 'Du konntest die Einrichtung nicht bezahlen.',
  F_Not_Your_Site: 'Das ist keins deiner Gebäude.', F_No_Hood_Free: 'Kein Mann war frei, um {place} zu führen.', F_No_Charity: 'Dort ist keine Wohltätigkeit.',
  F_No_Donation: 'Es wurde keine Spende angeboten.', F_Spare_Money: 'Du konntest das Geld nicht entbehren.', F_Clean_Up_Money: 'Du konntest die Aufräumaktion nicht bezahlen.',
  F_Streets_Not_Bribed: 'Weder der Bürgermeister noch der Polizeichef tun das noch für dich.', F_Site_Gone: 'Das Gebäude ist weg.',
  F_Nobody_Left: 'Niemand war mehr da, um den Befehl auszuführen.', F_Never_Started: 'Der Befehl hat nie begonnen. {inner}',
  F_Not_Enough_Time: 'Die Woche hatte nicht genug Zeit für den Befehl.', F_Nothing_Came: 'Es ist nichts dabei herausgekommen.',
  F_Needs_People: 'Dieser Befehl braucht {a} Leute, aber nur {b} sind im Trupp.',
  F_Needs_Free_1: 'Dieser Befehl braucht {a} Leute; 1 ist {free}.', F_Needs_Free_n: 'Dieser Befehl braucht {a} Leute; {b} sind {free}.',
  available: 'verfügbar', free: 'frei', F_Target_Lost: 'Das Ziel war nicht zu finden.',
  F_Never_Started_Default: 'Der Befehl hat nie begonnen. Vor Wochenende war kein Trupp frei.',
  M_Acquired: '{place} erworben.', M_Opened: '{type} eröffnet.', M_Refused_Protection: '{place} hat sich geweigert, Schutzgeld zu zahlen.',
  M_Uncovered: 'Deine Männer haben ein verstecktes Geschäft entdeckt: {hiddenB}.', M_Order_Failed: 'Befehl gescheitert: {order} — {inner}',
  M_Order_Cut_Short: 'Befehl abgebrochen: {order} — {inner}', M_Queued_Waiting: '{order} wartet: {inner}', the_owner: 'Der Besitzer',
  Y_Accepted: '{lt} hat den Befehl angenommen.', Y_Cancelled: 'Befehl zurückgenommen.', Y_Back_On_Street: '{pa} ist wieder auf der Straße.',
  Y_Promoted: '{pa} führt jetzt einen eigenen Trupp.', Y_Broken_Up: 'Der Trupp wurde aufgelöst.', Y_Joined: '{pa} ist jetzt in {crewB}.',
  Y_Already_In: '{pa} ist schon in {crewB}.', Y_Done: '', Y_No_Crew: 'Kein solcher Trupp.',
  Y_Lt_Unavailable: 'Dieser Leutnant ist nicht verfügbar. Befördere jemanden, der den Trupp übernimmt.',
  Y_Positive_Whole: 'Wähle eine positive ganze Zahl von Leuten.', Y_Only_People: '{lt} hat nur {b} Leute.',
  Y_At_Most_1: '{order} braucht höchstens 1 Person.', Y_At_Most_n: '{order} braucht höchstens {b} Leute.',
  Y_Valid_Amount: 'Wähle einen gültigen Betrag.', Y_Donation_Zero: 'Eine Spende muss größer als null sein.',
  Y_Streets: 'Zum Räumen der Straßen brauchst du den Bürgermeister oder den Polizeichef auf deiner Seite (bestochen).',
  Y_Rate: 'Wähle einen Satz zwischen null und dem Doppelten.', Y_No_Block: 'Kein solcher Block.', Y_No_Site: 'Kein solcher Ort.',
  Y_Valid_Site: 'Wähle einen gültigen Ort für diesen Befehl.', Y_Site_Not_Valid: 'Dieser Ort passt nicht zu diesem Befehl.',
  Y_Inside_City: 'Wähle einen Ort in der Stadt.', Y_Nothing_There: 'Dort gibt es nichts für diesen Befehl.',
  Y_Cannot_Afford: 'Das kannst du dir nicht leisten: es kostet {a$}, und nach den Befehlen dieser Woche bleiben {b$}.',
  Y_No_Time_Trim: '{lt} hat nicht für alle {b} Orte Zeit — er schafft {c} davon.',
  Y_No_Time: '{lt} hat keine Zeit. Verkleinere das Gebiet, nimm mehr Leute oder warte bis nächste Woche.',
  Y_Too_Many_Orders: 'Dieser Trupp kann diese Woche keine Befehle mehr annehmen.', Y_No_Order: 'Kein solcher Befehl.', Y_No_Person: 'Keine solche Person.',
  Y_Choose_Hood: 'Wähle einen deiner Männer.', Y_Not_In_Pool: 'Dieser Mann ist weder im Pool noch in einem Trupp.',
  Y_Max_Lieutenants: 'Du hast schon {a} Leutnants.', Y_Could_Not_Promote: 'Beförderung nicht möglich.',
  Y_Choose_Hood_Crew: 'Wähle einen deiner Männer und einen deiner Trupps.', Y_Crew_Full: 'Dieser Trupp ist voll.',
  Y_Choose_Crew_Hood: 'Wähle einen Mann aus einem deiner Trupps.',
  Y_Bought: 'Gekauft: ein {vehicle}.', Y_Cannot_Afford_It: 'Das kannst du dir nicht leisten.', V_0: 'Speedster', V_1: 'Coupé', V_2: 'Lastwagen',
};

const ES: Dict = {
  L_Bought: 'Comprado {place} por {b$}.', L_Opened: 'Abierto: {type}.', L_New_Management: 'Nueva gerencia en {place}.',
  L_Collected: 'Cobrados {b$} de {place}.', L_Refused_Pay: '{owner} se negó a pagar.', L_Already_Paid: '{place} ya pagó esta semana.',
  L_Protection_Set: 'Protección en {place} fijada en {b$}.', L_Donated: 'Donados {b$} a {place}.', L_Cleaned_Up: 'Limpieza alrededor de {place}.',
  L_Cleared: 'Se despejaron las calles alrededor de {place}.', L_Looked_Over: 'Revisado {place}: {standing}.',
  owned_by: 'propiedad de {who}', paying_to: 'paga {d$} a la semana a {who}', paying_nobody: 'no paga a nadie', you: 'ti',
  L_Found_Hidden: 'Encontrado un {hidden} detrás de {place}.', L_Nobody_Hiring: 'Nadie que valga la pena en {place}.',
  L_Nobody_Hiring_Else: 'Nadie que valga la pena en {place} — dicen que hay gente buscando trabajo en {else}.',
  L_Signed_On_1: '1 matón contratado, espera en la reserva.', L_Signed_On_n: '{b} matones contratados, esperan en la reserva.',
  L_Nobody_Willing: 'Nadie nuevo quiso trabajar para ti.', L_Stood_Guard: 'Guardia en {place} durante {bhm}.',
  L_Patrolled_1: 'Patrullada 1 manzana durante {chm}.', L_Patrolled_n: 'Patrulladas {b} manzanas durante {chm}.', L_Held: 'Posición mantenida durante {bhm}.',
  L_Ran_Out: 'La semana acabó antes de terminar todos los objetivos.',
  L_Continuing: '{order}: sigue con {b} de {c} personas; las demás no están disponibles.',
  F_No_Site: 'No existe ese sitio.', F_Owned_Already: 'Ya es de otro.', F_Not_For_Sale: 'Ese local ya no está en venta.',
  F_Price: 'No pudiste cubrir el precio.', F_Not_Yours: 'Ese terreno no es tuyo.', F_No_Type: 'No se eligió tipo de negocio.',
  F_Illegal_Centre: 'Los negocios ilegales solo pueden ocupar el centro de una manzana.', F_Legal_Centre: 'En el centro de una manzana solo van negocios ilegales.',
  F_City_Only: 'Eso solo lo construye la ciudad.', F_No_Front: 'Ese negocio ilegal no tiene tapadera en la manzana.',
  F_Front_Taken: 'Esa tapadera ya oculta otra operación.', F_Fit_Out: 'No pudiste pagar el acondicionamiento.',
  F_Not_Your_Site: 'Ese no es uno de tus sitios.', F_No_Hood_Free: 'No había ningún matón libre para llevar {place}.', F_No_Charity: 'Ahí no hay beneficencia.',
  F_No_Donation: 'No se ofreció donación.', F_Spare_Money: 'No pudiste prescindir del dinero.', F_Clean_Up_Money: 'No pudiste pagar la limpieza.',
  F_Streets_Not_Bribed: 'Ni el alcalde ni el jefe de policía lo harán ya por ti.', F_Site_Gone: 'El sitio ya no existe.',
  F_Nobody_Left: 'No quedó nadie para cumplir la orden.', F_Never_Started: 'La orden no llegó a empezar. {inner}',
  F_Not_Enough_Time: 'No hubo tiempo suficiente en la semana para cumplir la orden.', F_Nothing_Came: 'No salió nada.',
  F_Needs_People: 'Esta orden necesita {a} personas, pero solo quedan {b} en la cuadrilla.',
  F_Needs_Free_1: 'Esta orden necesita {a} personas; 1 está {free}.', F_Needs_Free_n: 'Esta orden necesita {a} personas; {b} están {free}.',
  available: 'disponible', free: 'libre', F_Target_Lost: 'No se encontró el objetivo.',
  F_Never_Started_Default: 'La orden no llegó a empezar. No hubo cuadrilla disponible antes del fin de semana.',
  M_Acquired: 'Adquirido {place}.', M_Opened: 'Abierto: {type}.', M_Refused_Protection: '{place} se negó a pagar protección.',
  M_Uncovered: 'Tus matones descubrieron un negocio oculto: {hiddenB}.', M_Order_Failed: 'Orden fallida: {order} — {inner}',
  M_Order_Cut_Short: 'Orden interrumpida: {order} — {inner}', M_Queued_Waiting: '{order} en espera: {inner}', the_owner: 'El dueño',
  Y_Accepted: '{lt} aceptó la orden.', Y_Cancelled: 'Orden cancelada.', Y_Back_On_Street: '{pa} vuelve a la calle.',
  Y_Promoted: '{pa} dirige ahora su propia cuadrilla.', Y_Broken_Up: 'La cuadrilla se ha disuelto.', Y_Joined: '{pa} se unió a {crewB}.',
  Y_Already_In: '{pa} ya está en {crewB}.', Y_Done: '', Y_No_Crew: 'No existe esa cuadrilla.',
  Y_Lt_Unavailable: 'Ese lugarteniente no está disponible. Asciende a alguien para que lleve la cuadrilla.',
  Y_Positive_Whole: 'Elige un número entero positivo de personas.', Y_Only_People: '{lt} solo tiene {b} personas.',
  Y_At_Most_1: '{order} admite como mucho 1 persona.', Y_At_Most_n: '{order} admite como mucho {b} personas.',
  Y_Valid_Amount: 'Elige una cantidad válida.', Y_Donation_Zero: 'Una donación debe ser mayor que cero.',
  Y_Streets: 'Despejar las calles requiere al alcalde o al jefe de policía de tu lado (sobornado).',
  Y_Rate: 'Elige una tarifa entre cero y el doble.', Y_No_Block: 'No existe esa manzana.', Y_No_Site: 'No existe ese sitio.',
  Y_Valid_Site: 'Elige un sitio válido para esa orden.', Y_Site_Not_Valid: 'Ese sitio no vale para esta orden.',
  Y_Inside_City: 'Elige un lugar dentro de la ciudad.', Y_Nothing_There: 'Ahí no hay nada para esa orden.',
  Y_Cannot_Afford: 'No te lo puedes permitir: cuesta {a$} y quedan {b$} tras las órdenes de esta semana.',
  Y_No_Time_Trim: '{lt} no tiene tiempo para los {b} sitios — podría con {c}.',
  Y_No_Time: '{lt} no tiene tiempo. Reduce la zona, añade gente o déjalo para la semana que viene.',
  Y_Too_Many_Orders: 'Esa cuadrilla no puede aceptar más órdenes esta semana.', Y_No_Order: 'No existe esa orden.', Y_No_Person: 'No existe esa persona.',
  Y_Choose_Hood: 'Elige a uno de tus matones.', Y_Not_In_Pool: 'Ese matón no está en la reserva ni en una cuadrilla.',
  Y_Max_Lieutenants: 'Ya tienes {a} lugartenientes.', Y_Could_Not_Promote: 'No se pudo ascender.',
  Y_Choose_Hood_Crew: 'Elige a uno de tus matones y una de tus cuadrillas.', Y_Crew_Full: 'Esa cuadrilla está llena.',
  Y_Choose_Crew_Hood: 'Elige a un matón de tus cuadrillas.',
  Y_Bought: 'Compraste un {vehicle}.', Y_Cannot_Afford_It: 'No te lo puedes permitir.', V_0: 'deportivo', V_1: 'cupé', V_2: 'camión',
};

const FR: Dict = {
  L_Bought: 'Acheté {place} pour {b$}.', L_Opened: 'Ouvert : {type}.', L_New_Management: 'Nouvelle gérance installée à {place}.',
  L_Collected: 'Encaissé {b$} de {place}.', L_Refused_Pay: '{owner} a refusé de payer.', L_Already_Paid: '{place} a déjà payé cette semaine.',
  L_Protection_Set: 'Protection de {place} fixée à {b$}.', L_Donated: 'Don de {b$} à {place}.', L_Cleaned_Up: 'Nettoyé autour de {place}.',
  L_Cleared: 'Les rues autour de {place} ont été dégagées.', L_Looked_Over: 'Inspecté {place} : {standing}.',
  owned_by: 'appartient à {who}', paying_to: 'paie {d$} par semaine à {who}', paying_nobody: 'ne paie personne', you: 'vous',
  L_Found_Hidden: 'Trouvé un {hidden} derrière {place}.', L_Nobody_Hiring: 'Personne à embaucher à {place}.',
  L_Nobody_Hiring_Else: 'Personne à embaucher à {place} — on dit que des gens cherchent du travail à {else}.',
  L_Signed_On_1: '1 homme engagé, il attend dans la réserve.', L_Signed_On_n: '{b} hommes engagés, ils attendent dans la réserve.',
  L_Nobody_Willing: 'Personne de nouveau ne voulait travailler pour vous.', L_Stood_Guard: 'Garde à {place} pendant {bhm}.',
  L_Patrolled_1: '1 pâté patrouillé pendant {chm}.', L_Patrolled_n: '{b} pâtés patrouillés pendant {chm}.', L_Held: 'Position tenue pendant {bhm}.',
  L_Ran_Out: 'La semaine a pris fin avant que chaque cible soit traitée.',
  L_Continuing: '{order} : continue avec {b} sur {c} personnes ; les autres sont indisponibles.',
  F_No_Site: 'Ce lieu n’existe pas.', F_Owned_Already: 'Quelqu’un d’autre le possède déjà.', F_Not_For_Sale: 'Ces locaux ne sont plus à vendre.',
  F_Price: 'Vous n’avez pas pu payer le prix.', F_Not_Yours: 'Ce terrain ne vous appartient pas.', F_No_Type: 'Aucun type d’affaire choisi.',
  F_Illegal_Centre: 'Les affaires illégales ne vont qu’au centre d’un pâté.', F_Legal_Centre: 'Seules les affaires illégales vont au centre d’un pâté.',
  F_City_Only: 'Seule la ville construit cela.', F_No_Front: 'Cette affaire illégale n’a pas de couverture dans le pâté.',
  F_Front_Taken: 'Cette couverture cache déjà une autre opération.', F_Fit_Out: 'Vous n’avez pas pu payer l’aménagement.',
  F_Not_Your_Site: 'Ce n’est pas un de vos lieux.', F_No_Hood_Free: 'Aucun homme n’était libre pour gérer {place}.', F_No_Charity: 'Pas d’œuvre de charité ici.',
  F_No_Donation: 'Aucun don n’a été proposé.', F_Spare_Money: 'Vous n’avez pas pu dégager l’argent.', F_Clean_Up_Money: 'Vous n’avez pas pu payer le nettoyage.',
  F_Streets_Not_Bribed: 'Ni le maire ni le chef de la police ne le feront plus pour vous.', F_Site_Gone: 'Le lieu a disparu.',
  F_Nobody_Left: 'Il ne restait personne pour exécuter l’ordre.', F_Never_Started: 'L’ordre n’a jamais commencé. {inner}',
  F_Not_Enough_Time: 'La semaine n’a pas suffi pour exécuter l’ordre.', F_Nothing_Came: 'Rien n’en est sorti.',
  F_Needs_People: 'Cet ordre demande {a} personnes, mais il n’en reste que {b} dans l’équipe.',
  F_Needs_Free_1: 'Cet ordre demande {a} personnes ; 1 est {free}.', F_Needs_Free_n: 'Cet ordre demande {a} personnes ; {b} sont {free}.',
  available: 'disponible', free: 'libre', F_Target_Lost: 'La cible est introuvable.',
  F_Never_Started_Default: 'L’ordre n’a jamais commencé. Aucune équipe n’était libre avant la fin de la semaine.',
  M_Acquired: 'Acquis {place}.', M_Opened: 'Ouvert : {type}.', M_Refused_Protection: '{place} a refusé de payer la protection.',
  M_Uncovered: 'Vos hommes ont découvert une affaire cachée : {hiddenB}.', M_Order_Failed: 'Ordre échoué : {order} — {inner}',
  M_Order_Cut_Short: 'Ordre interrompu : {order} — {inner}', M_Queued_Waiting: '{order} en attente : {inner}', the_owner: 'Le propriétaire',
  Y_Accepted: '{lt} a accepté l’ordre.', Y_Cancelled: 'Ordre annulé.', Y_Back_On_Street: '{pa} est de retour à la rue.',
  Y_Promoted: '{pa} dirige désormais sa propre équipe.', Y_Broken_Up: 'L’équipe a été dissoute.', Y_Joined: '{pa} a rejoint {crewB}.',
  Y_Already_In: '{pa} est déjà dans {crewB}.', Y_Done: '', Y_No_Crew: 'Cette équipe n’existe pas.',
  Y_Lt_Unavailable: 'Ce lieutenant n’est pas disponible. Promouvez quelqu’un pour reprendre l’équipe.',
  Y_Positive_Whole: 'Choisissez un nombre entier positif de personnes.', Y_Only_People: '{lt} n’a que {b} personnes.',
  Y_At_Most_1: '{order} prend au plus 1 personne.', Y_At_Most_n: '{order} prend au plus {b} personnes.',
  Y_Valid_Amount: 'Choisissez un montant valide.', Y_Donation_Zero: 'Un don doit être supérieur à zéro.',
  Y_Streets: 'Dégager les rues demande le maire ou le chef de la police de votre côté (soudoyé).',
  Y_Rate: 'Choisissez un taux entre zéro et le double.', Y_No_Block: 'Ce pâté n’existe pas.', Y_No_Site: 'Ce lieu n’existe pas.',
  Y_Valid_Site: 'Choisissez un lieu valide pour cet ordre.', Y_Site_Not_Valid: 'Ce lieu ne convient pas à cet ordre.',
  Y_Inside_City: 'Choisissez un endroit dans la ville.', Y_Nothing_There: 'Rien à faire là pour cet ordre.',
  Y_Cannot_Afford: 'Vous n’en avez pas les moyens : cela coûte {a$} et il reste {b$} après les ordres de la semaine.',
  Y_No_Time_Trim: '{lt} n’a pas le temps pour les {b} lieux — il pourrait en faire {c}.',
  Y_No_Time: '{lt} n’a pas le temps. Réduisez la zone, ajoutez du monde ou attendez la semaine prochaine.',
  Y_Too_Many_Orders: 'Cette équipe ne peut plus prendre d’ordres cette semaine.', Y_No_Order: 'Cet ordre n’existe pas.', Y_No_Person: 'Cette personne n’existe pas.',
  Y_Choose_Hood: 'Choisissez un de vos hommes.', Y_Not_In_Pool: 'Cet homme n’est ni dans la réserve ni dans une équipe.',
  Y_Max_Lieutenants: 'Vous avez déjà {a} lieutenants.', Y_Could_Not_Promote: 'Promotion impossible.',
  Y_Choose_Hood_Crew: 'Choisissez un de vos hommes et une de vos équipes.', Y_Crew_Full: 'Cette équipe est complète.',
  Y_Choose_Crew_Hood: 'Choisissez un homme de vos équipes.',
  Y_Bought: 'Vous avez acheté une {vehicle}.', Y_Cannot_Afford_It: 'Vous n’en avez pas les moyens.', V_0: 'voiture de sport', V_1: 'coupé', V_2: 'camionnette',
};

const DICTS: Record<Lang, Dict> = { 'en-GB': EN, de: DE, es: ES, fr: FR };

function fill(lang: Lang, key: string, vars: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? EN[key] ?? key;
  return s.replace(/\{(\w+\$?)\}/g, (_, v: string) => String(vars[v] ?? ''));
}

/** One order line (a result, a fail reason or a message) in words. */
export function lineText(x: TextContext, l: Line): string {
  const { lang } = x;
  const kindAt = (n: number): LineKind => LINE_KINDS[n] ?? 'L_None';
  const v: Record<string, string | number> = {
    a: l.a, b: l.b, c: l.c, d: l.d, 'a$': money(lang, l.a), 'b$': money(lang, l.b), 'd$': money(lang, l.d),
    bhm: hm(l.b), chm: hm(l.c),
  };
  const place = () => x.place(l.a);
  switch (l.kind) {
    case 'L_None': return '';
    case 'L_Opened': case 'M_Opened': return fill(lang, l.kind, { type: x.type(l.a) });
    case 'L_Refused_Pay': return fill(lang, l.kind, { owner: l.b >= 0 ? x.person(l.b) : fill(lang, 'the_owner', {}) });
    case 'L_Looked_Over': {
      const who = (g: number) => g === x.me ? fill(lang, 'you', {}) : x.gang(g);
      const standing = l.b > 0 ? fill(lang, 'owned_by', { who: who(l.b) })
        : l.c > 0 ? fill(lang, 'paying_to', { ...v, who: who(l.c) }) : fill(lang, 'paying_nobody', {});
      return fill(lang, l.kind, { place: place(), standing });
    }
    case 'L_Found_Hidden': return fill(lang, l.kind, { place: place(), hidden: x.building(l.b) });
    case 'L_Nobody_Hiring':
      return l.b >= 0 ? fill(lang, 'L_Nobody_Hiring_Else', { place: place(), else: x.place(l.b) }) : fill(lang, l.kind, { place: place() });
    case 'L_Signed_On': return fill(lang, l.b === 1 ? 'L_Signed_On_1' : 'L_Signed_On_n', v);
    case 'L_Patrolled': return fill(lang, l.b === 1 ? 'L_Patrolled_1' : 'L_Patrolled_n', v);
    case 'L_Continuing': return fill(lang, l.kind, { ...v, order: orderName(lang, ORDER_KINDS[l.a]) });
    case 'F_Needs_Free':
      return fill(lang, l.b === 1 ? 'F_Needs_Free_1' : 'F_Needs_Free_n', { ...v, free: fill(lang, l.c === 1 ? 'available' : 'free', {}) });
    case 'F_Never_Started':
      return fill(lang, l.kind, { inner: lineText(x, { kind: kindAt(l.a), a: l.b, b: l.c, c: l.d, d: 0 }) });
    case 'M_Uncovered': return fill(lang, l.kind, { hiddenB: x.building(l.b) });
    case 'M_Order_Failed': case 'M_Order_Cut_Short': case 'M_Queued_Waiting':
      return fill(lang, l.kind, { order: orderName(lang, ORDER_KINDS[l.a]),
        inner: lineText(x, { kind: kindAt(l.b), a: l.c, b: l.d, c: 0, d: 0 }) });
    default: return fill(lang, l.kind, { ...v, place: l.a >= 0 ? place() : '' });
  }
}

/** A command's reply in words ('' for Y_Done). */
export function replyText(x: TextContext, r: Pick<Reply, 'kind' | 'a' | 'b' | 'c' | 'd'>): string {
  const { lang } = x;
  const v: Record<string, string | number> = { a: r.a, b: r.b, c: r.c, d: r.d, 'a$': money(lang, r.a), 'b$': money(lang, r.b) };
  const k: ReplyKind = r.kind;
  switch (k) {
    case 'Y_Accepted': case 'Y_Only_People': case 'Y_No_Time_Trim': case 'Y_No_Time':
      return fill(lang, k, { ...v, lt: x.person(r.a) });
    case 'Y_Back_On_Street': case 'Y_Promoted': return fill(lang, k, { pa: x.person(r.a) });
    case 'Y_Joined': case 'Y_Already_In': return fill(lang, k, { pa: x.person(r.a), crewB: x.crew(r.b) });
    case 'Y_At_Most': return fill(lang, r.b === 1 ? 'Y_At_Most_1' : 'Y_At_Most_n', { ...v, order: orderName(lang, ORDER_KINDS[r.a]) });
    case 'Y_Bought': return fill(lang, k, { vehicle: fill(lang, `V_${r.a}`, {}) });
    case 'Y_Staffing': return lineText(x, { kind: LINE_KINDS[r.a] ?? 'L_None', a: r.b, b: r.c, c: r.d, d: 0 });
    default: return fill(lang, k, v);
  }
}

/** A vehicle kind's name (0 speedster, 1 coupe, 2 truck). */
export function vehicleName(lang: Lang, kind: number): string { return fill(lang, `V_${kind}`, {}); }

/** Every key each language needs (for the i18n completeness check). */
export const TEXT_KEYS = Object.keys(EN);
export const textLangs = DICTS;
