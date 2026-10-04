// Tvar odpovědí Ryanair farfnd/v4 (podle reálných odpovědí převzatých z knihovny ryanair-py).
const airport = (iataCode, name, countryName, city, cc) => ({
  countryName, iataCode, name, seoName: name.toLowerCase(), city: { name: city, code: city.toUpperCase(), countryCode: cc },
});
const price = (value, currencyCode = 'EUR') => ({
  value, valueMainUnit: String(Math.floor(value)), valueFractionalUnit: String(Math.round((value % 1) * 100)), currencyCode, currencySymbol: '€',
});

export const ONE_WAY = {
  arrivalAirportCategories: null,
  fares: [
    {
      outbound: {
        departureAirport: airport('VIE', 'Vienna', 'Austria', 'Vienna', 'at'),
        arrivalAirport: airport('BGY', 'Milan Bergamo', 'Italy', 'Milan', 'it'),
        departureDate: '2026-11-10T06:30:00',
        arrivalDate: '2026-11-10T07:55:00',
        price: price(14.99),
        flightKey: 'FR~ 1234~ ~~VIE~11/10/2026 06:30~BGY~11/10/2026 07:55~~',
        flightNumber: 'FR1234',
        previousPrice: price(24.99),
        priceUpdated: 1792686097000,
      },
      summary: { price: price(14.99), previousPrice: null, newRoute: false },
    },
    {
      outbound: {
        departureAirport: airport('VIE', 'Vienna', 'Austria', 'Vienna', 'at'),
        arrivalAirport: airport('RAK', 'Marrakesh', 'Morocco', 'Marrakesh', 'ma'),
        departureDate: '2026-11-12T10:15:00',
        arrivalDate: '2026-11-12T13:40:00',
        price: price(399, 'MAD'),
        flightKey: 'FR~ 7001~ ~~VIE~11/12/2026 10:15~RAK~11/12/2026 13:40~~',
        flightNumber: 'FR7001',
        previousPrice: null,
        priceUpdated: 1792693061000,
      },
      summary: { price: price(399, 'MAD'), previousPrice: null, newRoute: true },
    },
    {
      // Bez ceny (vyprodáno) – musí se zahodit.
      outbound: {
        departureAirport: airport('VIE', 'Vienna', 'Austria', 'Vienna', 'at'),
        arrivalAirport: airport('STN', 'London Stansted', 'United Kingdom', 'London', 'gb'),
        departureDate: '2026-11-11T09:00:00',
        arrivalDate: '2026-11-11T10:30:00',
        price: null,
        flightNumber: 'FR9999',
      },
      summary: { price: null },
    },
  ],
  nextPage: null,
  size: 3,
};

export const ROUND_TRIP = {
  arrivalAirportCategories: null,
  fares: [
    {
      outbound: {
        departureAirport: airport('VIE', 'Vienna', 'Austria', 'Vienna', 'at'),
        arrivalAirport: airport('BGY', 'Milan Bergamo', 'Italy', 'Milan', 'it'),
        departureDate: '2026-11-10T06:30:00',
        arrivalDate: '2026-11-10T07:55:00',
        price: price(14.99),
        flightNumber: 'FR1234',
        previousPrice: null,
        priceUpdated: 1792686097000,
      },
      inbound: {
        departureAirport: airport('BGY', 'Milan Bergamo', 'Italy', 'Milan', 'it'),
        arrivalAirport: airport('VIE', 'Vienna', 'Austria', 'Vienna', 'at'),
        departureDate: '2026-11-14T21:20:00',
        arrivalDate: '2026-11-14T22:45:00',
        price: price(19.99),
        flightNumber: 'FR1235',
        previousPrice: null,
        priceUpdated: 1792686981000,
      },
      summary: { price: price(34.98), previousPrice: null, newRoute: false, tripDurationDays: 4 },
    },
  ],
  nextPage: null,
  size: 1,
};

export const CHEAPEST_PER_DAY = {
  outbound: {
    fares: [
      { day: '2026-11-01', arrivalDate: '2026-11-01T09:00:00', departureDate: '2026-11-01T07:30:00', price: price(29.99), soldOut: false, unavailable: false },
      { day: '2026-11-02', arrivalDate: null, departureDate: null, price: null, soldOut: false, unavailable: true },
      { day: '2026-11-03', arrivalDate: '2026-11-03T09:00:00', departureDate: '2026-11-03T07:30:00', price: price(9.99), soldOut: false, unavailable: false },
      { day: '2026-11-04', arrivalDate: '2026-11-04T09:00:00', departureDate: '2026-11-04T07:30:00', price: price(19.99), soldOut: true, unavailable: false },
    ],
    minFare: null,
    maxFare: null,
  },
};
