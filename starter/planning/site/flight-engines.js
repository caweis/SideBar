// flight-engines.js — canonical URL templates for award + cash flight
// search engines, plus a single buildFlightUrl(engine, params) helper.
//
// EARNED IN PRODUCTION: these URL shapes were reverse-engineered from real
// post-search dumps in production use across an extended-family planning
// portal. Some engines (PointsYeah, seats.aero) accept rich pre-fill;
// others (ITA Matrix, Hopper, Going) only support landing-page deep links
// because their SPAs hold search state in React, not the URL bar.
//
// Status disclosure (Honest Reporting · docs/METHOD.md):
//   This is one-substrate work. The URL shapes are facts, not patterns —
//   each one was extracted from a real search submission and round-tripped
//   in production. They WILL break when an engine ships a routing change.
//   Test the link manually when something looks off.
//
// USAGE (vanilla module · no build step):
//   import { buildFlightUrl, ENGINES } from './flight-engines.js';
//   const href = buildFlightUrl('seats', {
//     from: 'EWR', to: 'MUC', via: '',
//     depart: '2027-07-24', ret: '2027-08-02',
//     pax: 2, cabin: 'business',
//   });
//
// PARAMS shape (every engine accepts the same input · the helper maps):
//   { from, to, via, depart, ret, pax, cabin }
//   from / to / via : IATA codes ('EWR', 'MUC', '' for no via)
//   depart / ret    : ISO dates ('2027-07-24')
//   pax             : integer
//   cabin           : 'economy' | 'premium' | 'business' | 'first'

// === ENGINE CATALOG ===
// Each entry: { id, label, group, deepLinks, notes }
//   group     : 'award' | 'cash'
//   deepLinks : true if pre-fill is supported, false for landing-only
//   notes     : caveats worth surfacing in UI tooltips
export const ENGINES = [
  // ── AWARD ENGINES ────────────────────────────────────────────────
  {
    id: 'seats',
    label: 'seats.aero',
    group: 'award',
    deepLinks: true,
    notes: 'Star Alliance + OneWorld + SkyTeam award inventory. Pro tier ($9.99/mo) has API access (non-commercial only).',
  },
  {
    id: 'pointme',
    label: 'point.me',
    group: 'award',
    deepLinks: true,
    notes: 'Bilt-integrated. Subscription required for full results.',
  },
  {
    id: 'awardfares',
    label: 'AwardFares',
    group: 'award',
    deepLinks: true,
    notes: 'Multi-program scanner. Free tier with daily limits.',
  },
  {
    id: 'pointsyeah',
    label: 'PointsYeah',
    group: 'award',
    deepLinks: true,
    notes: 'Free; Cognito + Google sign-in required. URL params survive auth redirect.',
  },

  // ── CASH ENGINES ─────────────────────────────────────────────────
  {
    id: 'google',
    label: 'Google Flights',
    group: 'cash',
    deepLinks: true, // via text-query
    notes: 'Deep-links via natural-language query string · tolerant of formatting.',
  },
  {
    id: 'ita',
    label: 'ITA Matrix',
    group: 'cash',
    deepLinks: false,
    notes: 'SPA holds search state in React; URL params not honored. Lands on form.',
  },
  {
    id: 'skyscanner',
    label: 'Skyscanner',
    group: 'cash',
    deepLinks: true,
    notes: 'Path-based deep-link · multi-city falls back to query-string form.',
  },
  {
    id: 'kayak',
    label: 'Kayak',
    group: 'cash',
    deepLinks: true,
    notes: 'Path-based · multi-city via comma-separated leg paths.',
  },
  {
    id: 'going',
    label: 'Going',
    group: 'cash',
    deepLinks: false,
    notes: 'Destination-page only · no per-search URL.',
  },
  {
    id: 'hopper',
    label: 'Hopper',
    group: 'cash',
    deepLinks: false,
    notes: 'Web product is a landing page · no per-search URL pre-fill.',
  },
];

// === buildFlightUrl ===
// Single source of truth for engine → URL mapping. Adding a new engine
// means adding ONE case here + an entry to ENGINES above; nothing else
// in the app changes.
export function buildFlightUrl(engine, p) {
  const { from, via, to, depart, ret, pax, cabin } = p;
  const ymd = (d) => d.replace(/-/g, '').slice(2);             // 2027-07-24 → 270724
  const cabinSky = cabin === 'premium' ? 'premiumeconomy' : cabin;
  const cabinSeats = cabin === 'business' ? 'business' : cabin === 'first' ? 'first' : 'economy';
  const hasVia = !!via;

  switch (engine) {
    // ── AWARD ─────────────────────────────────────────────────────
    case 'seats':
      // seats.aero accepts comma-separated origins/destinations for via.
      if (hasVia) {
        return `https://seats.aero/search?origins=${from},${via}&destinations=${via},${to}&fareClass=${cabinSeats}&startDate=${depart}&endDate=${ret}`;
      }
      return `https://seats.aero/search?origins=${from}&destinations=${to}&fareClass=${cabinSeats}&startDate=${depart}&endDate=${ret}`;

    case 'pointme':
      if (hasVia) {
        return `https://point.me/search?from=${from}&via=${via}&to=${to}&date=${depart}&pax=${pax}&cabin=${cabin}`;
      }
      return `https://point.me/search?from=${from}&to=${to}&date=${depart}&pax=${pax}&cabin=${cabin}`;

    case 'awardfares':
      if (hasVia) {
        return `https://awardfares.com/search?from=${from}&via=${via}&to=${to}&depart=${depart}&pax=${pax}&cabin=${cabin}`;
      }
      return `https://awardfares.com/search?from=${from}&to=${to}&depart=${depart}&pax=${pax}&cabin=${cabin}`;

    case 'pointsyeah': {
      // PointsYeah: capitalized cabin, primary + secondary date for ±N range,
      // tripType=2 for round-trip, tripType=3 for multi-city.
      const pyCabin =
        cabin === 'premium' ? 'PremiumEconomy' :
        cabin === 'business' ? 'Business' :
        cabin === 'first' ? 'First' :
        'Economy';
      const params = new URLSearchParams({
        tripType: hasVia ? '3' : '2',
        departure: from,
        arrival: to,
        departDate: depart,
        returnDate: ret || depart,
        departDateSec: depart,
        returnDateSec: ret || depart,
        adults: String(pax),
        children: '0',
        cabin: pyCabin,
        cabins: pyCabin,
        multiday: 'false',
      });
      return `https://www.pointsyeah.com/search?${params.toString()}`;
    }

    // ── CASH ──────────────────────────────────────────────────────
    case 'google': {
      const query = hasVia
        ? `Flights from ${from} to ${via} on ${depart} then ${via} to ${to} returning ${ret} ${cabin}`
        : `Flights from ${from} to ${to} departing ${depart} returning ${ret} ${cabin}`;
      return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
    }

    case 'ita':
      // ITA Matrix doesn't honor query params on its modern SPA. Best we
      // can do is link to the search page with a multi-city hint.
      return hasVia ? 'https://matrix.itasoftware.com/search?multi=1' : 'https://matrix.itasoftware.com/search';

    case 'skyscanner':
      if (hasVia) {
        return `https://www.skyscanner.com/g/multi-city?adults=${pax}&cabinclass=${cabinSky}&from=${from}&to1=${via}&date1=${depart}&from2=${via}&to2=${to}&date2=${depart}`;
      }
      return `https://www.skyscanner.com/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${ymd(depart)}/${ymd(ret)}/?adults=${pax}&cabinclass=${cabinSky}`;

    case 'kayak':
      if (hasVia) {
        return `https://www.kayak.com/flights/${from}-${via},${via}-${to}/${depart}/${cabin}/${pax}adults`;
      }
      return `https://www.kayak.com/flights/${from}-${to}/${depart}/${ret}/${cabin}/${pax}adults`;

    case 'going':
      // Going.com (formerly Scott's Cheap Flights) deep-links by destination
      // slug. Add IATA→slug mappings here for your common destinations.
      // Falls back to the destinations index for anything unmapped.
      return ({
        MUC: 'https://www.going.com/cheap-flights-to-munich-muc',
        VIE: 'https://www.going.com/cheap-flights-to-vienna-vie',
        INN: 'https://www.going.com/cheap-flights-to-innsbruck-inn',
        FRA: 'https://www.going.com/cheap-flights-to-frankfurt-fra',
        LHR: 'https://www.going.com/cheap-flights-to-london-lhr',
        CDG: 'https://www.going.com/cheap-flights-to-paris-cdg',
        FCO: 'https://www.going.com/cheap-flights-to-rome-fco',
        BCN: 'https://www.going.com/cheap-flights-to-barcelona-bcn',
        AMS: 'https://www.going.com/cheap-flights-to-amsterdam-ams',
        ZRH: 'https://www.going.com/cheap-flights-to-zurich-zrh',
      }[to]) || 'https://www.going.com/destinations';

    case 'hopper':
      // Hopper's web product has no per-search URL pre-fill.
      return 'https://www.hopper.com/flights';

    default:
      return '#';
  }
}

// === Helper: refresh every <a data-engine="..."> on the page ===
// Drop this anchor pattern into your markup:
//   <a data-engine="seats" target="_blank" rel="noopener">seats.aero ↗</a>
// Then call refreshFlightSearchHrefs(getParams) whenever the form changes.
// One querySelectorAll loop = O(N anchors) per refresh, fine for ≤50 buttons.
export function refreshFlightSearchHrefs(params) {
  document.querySelectorAll('a[data-engine]').forEach((btn) => {
    btn.href = buildFlightUrl(btn.dataset.engine, params);
  });
}
