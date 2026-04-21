// Curated IANA timezone list for the Voyage Report tz pickers.
//
// This is NOT exhaustive — it's a practical shortlist covering the
// Caribbean / Mediterranean / Baltic / Alaska / Asia / Pacific itineraries
// the Solstice-class actually runs. If a ship ends up somewhere exotic,
// any valid IANA zone can be typed in (the picker falls through to a
// free-text field; we never reject a well-formed `Area/Location` string).
//
// Ordering: grouped by region, then roughly by longitude within the
// region, so the crew can find a port's zone by hemispheric intuition
// rather than alphabetical scrolling.
//
// See also: Intl.supportedValuesOf('timeZone') in Chromium ~398 values.

export const TIME_ZONE_GROUPS = [
  {
    label: 'Americas — East',
    zones: [
      { id: 'America/St_Johns',       label: "St. John's (NL)" },
      { id: 'America/Halifax',        label: 'Halifax / Bermuda' },
      { id: 'America/New_York',       label: 'New York / Miami / Nassau' },
      { id: 'America/Toronto',        label: 'Toronto' },
      { id: 'America/Havana',         label: 'Havana' },
      { id: 'America/Puerto_Rico',    label: 'San Juan / St. Thomas' },
      { id: 'America/Barbados',       label: 'Bridgetown' },
      { id: 'America/Santo_Domingo',  label: 'Santo Domingo' },
      { id: 'America/Jamaica',        label: 'Kingston' },
    ],
  },
  {
    label: 'Americas — Central',
    zones: [
      { id: 'America/Chicago',        label: 'Chicago / New Orleans' },
      { id: 'America/Mexico_City',    label: 'Mexico City' },
      { id: 'America/Cancun',         label: 'Cancún / Cozumel' },
      { id: 'America/Belize',         label: 'Belize' },
      { id: 'America/Costa_Rica',     label: 'Costa Rica' },
      { id: 'America/Panama',         label: 'Panama' },
    ],
  },
  {
    label: 'Americas — Mountain / Pacific',
    zones: [
      { id: 'America/Denver',         label: 'Denver' },
      { id: 'America/Los_Angeles',    label: 'Los Angeles / Seattle' },
      { id: 'America/Vancouver',      label: 'Vancouver' },
      { id: 'America/Juneau',         label: 'Juneau (AK SE)' },
      { id: 'America/Anchorage',      label: 'Anchorage (AK)' },
    ],
  },
  {
    label: 'Americas — South',
    zones: [
      { id: 'America/Sao_Paulo',      label: 'São Paulo / Rio' },
      { id: 'America/Buenos_Aires',   label: 'Buenos Aires' },
      { id: 'America/Montevideo',     label: 'Montevideo' },
      { id: 'America/Santiago',       label: 'Santiago' },
      { id: 'America/Lima',           label: 'Lima' },
      { id: 'America/Bogota',         label: 'Bogotá' },
    ],
  },
  {
    label: 'Europe',
    zones: [
      { id: 'Europe/London',     label: 'London / Dublin' },
      { id: 'Europe/Lisbon',     label: 'Lisbon' },
      { id: 'Europe/Madrid',     label: 'Madrid / Barcelona' },
      { id: 'Europe/Paris',      label: 'Paris' },
      { id: 'Europe/Amsterdam',  label: 'Amsterdam' },
      { id: 'Europe/Berlin',     label: 'Berlin / Hamburg' },
      { id: 'Europe/Copenhagen', label: 'Copenhagen' },
      { id: 'Europe/Oslo',       label: 'Oslo' },
      { id: 'Europe/Stockholm',  label: 'Stockholm' },
      { id: 'Europe/Helsinki',   label: 'Helsinki' },
      { id: 'Europe/Rome',       label: 'Rome / Naples' },
      { id: 'Europe/Athens',     label: 'Athens / Piraeus' },
      { id: 'Europe/Istanbul',   label: 'Istanbul' },
      { id: 'Europe/Moscow',     label: 'Moscow / St. Petersburg' },
    ],
  },
  {
    label: 'Africa / Middle East',
    zones: [
      { id: 'Africa/Casablanca', label: 'Casablanca' },
      { id: 'Africa/Cairo',      label: 'Cairo / Alexandria' },
      { id: 'Africa/Cape_Town',  label: 'Cape Town' },
      { id: 'Asia/Jerusalem',    label: 'Jerusalem / Haifa' },
      { id: 'Asia/Dubai',        label: 'Dubai / Abu Dhabi' },
    ],
  },
  {
    label: 'Asia / Pacific',
    zones: [
      { id: 'Asia/Bangkok',      label: 'Bangkok' },
      { id: 'Asia/Singapore',    label: 'Singapore' },
      { id: 'Asia/Hong_Kong',    label: 'Hong Kong' },
      { id: 'Asia/Shanghai',     label: 'Shanghai' },
      { id: 'Asia/Tokyo',        label: 'Tokyo / Yokohama' },
      { id: 'Asia/Seoul',        label: 'Seoul / Busan' },
      { id: 'Australia/Perth',   label: 'Perth' },
      { id: 'Australia/Sydney',  label: 'Sydney / Melbourne' },
      { id: 'Pacific/Auckland',  label: 'Auckland' },
      { id: 'Pacific/Fiji',      label: 'Suva (Fiji)' },
      { id: 'Pacific/Honolulu',  label: 'Honolulu' },
    ],
  },
];

// Flat lookup — validate a zone id is in our curated set (not strictly
// enforced; the math works for any valid IANA zone the browser knows).
export const KNOWN_TZ_IDS = new Set(
  TIME_ZONE_GROUPS.flatMap((g) => g.zones.map((z) => z.id)),
);

// Compact label for display in the VR top row ("America/New_York" →
// "New York / Miami / Nassau"). Falls back to the raw id for unknown.
export function tzLabel(id) {
  if (!id) return '';
  for (const g of TIME_ZONE_GROUPS) {
    const match = g.zones.find((z) => z.id === id);
    if (match) return match.label;
  }
  return id;
}
