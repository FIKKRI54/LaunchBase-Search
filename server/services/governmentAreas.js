export const normalizeGovernmentLabel = (value = '') => String(value)
  .toLowerCase()
  .replace(/\b(district|daerah|jajahan|bahagian|division)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const stateAliases = new Map([
  ['federal territory of kuala lumpur', 'W.P. Kuala Lumpur'],
  ['wilayah persekutuan kuala lumpur', 'W.P. Kuala Lumpur'],
  ['kuala lumpur', 'W.P. Kuala Lumpur'],
  ['wp kuala lumpur', 'W.P. Kuala Lumpur'],
  ['w p kuala lumpur', 'W.P. Kuala Lumpur'],
  ['federal territory of putrajaya', 'W.P. Putrajaya'],
  ['wilayah persekutuan putrajaya', 'W.P. Putrajaya'],
  ['putrajaya', 'W.P. Putrajaya'],
  ['wp putrajaya', 'W.P. Putrajaya'],
  ['w p putrajaya', 'W.P. Putrajaya'],
  ['federal territory of labuan', 'W.P. Labuan'],
  ['wilayah persekutuan labuan', 'W.P. Labuan'],
  ['labuan', 'W.P. Labuan'],
  ['wp labuan', 'W.P. Labuan'],
  ['w p labuan', 'W.P. Labuan'],
  ['penang', 'Pulau Pinang'],
  ['pulau pinang', 'Pulau Pinang'],
])

const federalTerritories = new Set(['W.P. Kuala Lumpur', 'W.P. Putrajaya', 'W.P. Labuan'])

const penangOfficialDistricts = new Set([
  'Timur Laut',
  'Barat Daya',
  'Seberang Perai Utara',
  'Seberang Perai Tengah',
  'Seberang Perai Selatan',
])

const penangDistrictAliases = new Map([
  ['north east', 'Timur Laut'],
  ['northeast', 'Timur Laut'],
  ['north east penang island', 'Timur Laut'],
  ['northeast penang island', 'Timur Laut'],
  ['timur laut', 'Timur Laut'],
  ['george town', 'Timur Laut'],
  ['georgetown', 'Timur Laut'],
  ['ayer itam', 'Timur Laut'],
  ['air itam', 'Timur Laut'],
  ['jelutong', 'Timur Laut'],
  ['gelugor', 'Timur Laut'],
  ['tanjung bungah', 'Timur Laut'],
  ['tanjung tokong', 'Timur Laut'],
  ['batu ferringhi', 'Timur Laut'],
  ['south west', 'Barat Daya'],
  ['southwest', 'Barat Daya'],
  ['south west penang island', 'Barat Daya'],
  ['southwest penang island', 'Barat Daya'],
  ['barat daya', 'Barat Daya'],
  ['bayan lepas', 'Barat Daya'],
  ['balik pulau', 'Barat Daya'],
  ['teluk kumbar', 'Barat Daya'],
  ['north seberang perai', 'Seberang Perai Utara'],
  ['northern seberang perai', 'Seberang Perai Utara'],
  ['seberang perai north', 'Seberang Perai Utara'],
  ['seberang perai utara', 'Seberang Perai Utara'],
  ['butterworth', 'Seberang Perai Utara'],
  ['kepala batas', 'Seberang Perai Utara'],
  ['tasek gelugor', 'Seberang Perai Utara'],
  ['central seberang perai', 'Seberang Perai Tengah'],
  ['seberang perai central', 'Seberang Perai Tengah'],
  ['seberang perai tengah', 'Seberang Perai Tengah'],
  ['bukit mertajam', 'Seberang Perai Tengah'],
  ['perai', 'Seberang Perai Tengah'],
  ['seberang jaya', 'Seberang Perai Tengah'],
  ['south seberang perai', 'Seberang Perai Selatan'],
  ['southern seberang perai', 'Seberang Perai Selatan'],
  ['seberang perai south', 'Seberang Perai Selatan'],
  ['seberang perai selatan', 'Seberang Perai Selatan'],
  ['nibong tebal', 'Seberang Perai Selatan'],
  ['simpang ampat', 'Seberang Perai Selatan'],
  ['batu kawan', 'Seberang Perai Selatan'],
])

export function isKnownGovernmentDistrict(location) {
  const canonical = canonicalizeGovernmentArea(location)
  return federalTerritories.has(canonical.state)
    || (canonical.state === 'Pulau Pinang' && penangOfficialDistricts.has(canonical.district))
}

export function canonicalizeGovernmentArea(location) {
  const originalState = String(location?.state || '').trim()
  const originalDistrict = String(location?.district || '').trim()
  const state = stateAliases.get(normalizeGovernmentLabel(originalState)) || originalState

  if (federalTerritories.has(state)) {
    return { ...location, district: state, state }
  }

  const district = state === 'Pulau Pinang'
    ? penangDistrictAliases.get(normalizeGovernmentLabel(originalDistrict)) || originalDistrict
    : originalDistrict
  return { ...location, district, state }
}
