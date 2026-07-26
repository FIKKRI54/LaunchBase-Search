import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyBusiness } from './marketClassifier.js'

test('classifies a Malaysian food niche from the real business name', () => {
  const result = classifyBusiness({
    name: 'Restoran Nasi Kandar Maju',
    tags: { amenity: 'restaurant' },
  })
  assert.equal(result.marketType, 'nasi_kandar')
  assert.equal(result.marketTypeLabel, 'Nasi kandar restaurant')
  assert.equal(result.classificationConfidence, 'high')
})

test('prefers cuisine evidence and keeps a transparent generic fallback', () => {
  assert.equal(classifyBusiness({
    name: 'Selera Kita',
    tags: { amenity: 'restaurant', cuisine: 'thai' },
  }).marketType, 'thai_restaurant')

  assert.equal(classifyBusiness({
    name: 'Selera Kita',
    tags: { amenity: 'restaurant' },
  }).marketType, 'restaurant_other')
})

test('creates a specific type from a cuisine tag outside the built-in Malaysian rules', () => {
  const result = classifyBusiness({
    name: 'Sakura',
    tags: { amenity: 'restaurant', cuisine: 'japanese' },
  })
  assert.equal(result.marketType, 'japanese_restaurant')
  assert.equal(result.marketTypeLabel, 'Japanese restaurant')
})

test('uses Malay and English aliases when structured tags are vague', () => {
  const laundry = classifyBusiness({
    name: 'Kedai Dobi Layan Diri Cahaya',
    tags: { shop: 'yes' },
  })
  assert.equal(laundry.marketType, 'laundry')
  assert.equal(laundry.marketTypeLabel, 'Laundry / kedai dobi')
  assert.match(laundry.classificationSignals.at(-1), /^local-name:/)

  assert.equal(classifyBusiness({
    name: 'Farmasi Keluarga',
    tags: { shop: 'yes' },
  }).marketType, 'pharmacy')
})

test('structured business tags override misleading words in a name', () => {
  assert.equal(classifyBusiness({
    name: 'Healthy Hair Salon',
    tags: { shop: 'hairdresser' },
  }).marketType, 'beauty')

  assert.equal(classifyBusiness({
    name: 'Thai Odyssey',
    tags: { shop: 'beauty' },
  }).marketType, 'beauty')
})

test('food cuisine words require evidence that the feature is a food business', () => {
  assert.equal(classifyBusiness({
    name: 'Sushi King',
    tags: { shop: 'clothes' },
  }).marketType, 'clothes_shop')

  assert.equal(classifyBusiness({
    name: 'Restoran Tomyam Warisan',
    tags: { amenity: 'restaurant' },
  }).marketType, 'thai_restaurant')
})

test('matches aliases as phrases instead of accidental word fragments', () => {
  assert.notEqual(classifyBusiness({
    name: 'Gymboree Play Centre',
    tags: { leisure: 'playground' },
  }).marketType, 'boutique_fitness')
})

test('classifies common Malaysian retail and professional businesses bilingually', () => {
  const phoneShop = classifyBusiness({
    name: 'Maju Mobile',
    tags: { shop: 'mobile_phone' },
  })
  assert.equal(phoneShop.marketType, 'mobile_phone_shop')
  assert.equal(phoneShop.marketTypeLabel, 'Mobile phone shop / kedai telefon bimbit')
  assert.equal(phoneShop.taxonomySource, 'structured-dictionary')

  const lawyer = classifyBusiness({
    name: 'Rakan & Co',
    tags: { office: 'lawyer' },
  })
  assert.equal(lawyer.marketType, 'legal_office')
  assert.match(lawyer.marketTypeLabel, /pejabat guaman/i)
})

test('derives a readable type for previously unseen structured tag values', () => {
  const result = classifyBusiness({
    name: 'Paws & Things',
    tags: { shop: 'pet_grooming_supplies' },
  })

  assert.equal(result.marketType, 'pet_grooming_supplies_shop')
  assert.equal(result.marketTypeLabel, 'Pet grooming supplies shop')
  assert.equal(result.taxonomySource, 'structured-derived')
  assert.equal(result.marketGroup, 'retail')
})

test('combines every cuisine value instead of discarding values after the first', () => {
  const result = classifyBusiness({
    name: 'Casa Pizza',
    tags: { amenity: 'restaurant', cuisine: 'italian;pizza' },
  })

  assert.equal(result.marketType, 'cuisine_italian_pizza_restaurant')
  assert.equal(result.marketTypeLabel, 'Italian + pizza restaurant')
  assert.deepEqual(result.marketFacets, ['cuisine_italian', 'pizza_shop'])
  assert.equal(result.specificity, 'specific')
})

test('dynamically combines unknown cuisines without requiring a code change', () => {
  const result = classifyBusiness({
    name: 'Silk Road Kitchen',
    tags: { amenity: 'restaurant', cuisine: 'uzbek;dumpling' },
  })

  assert.equal(result.marketType, 'cuisine_uzbek_dumpling_restaurant')
  assert.equal(result.marketTypeLabel, 'Uzbek + dumpling restaurant')
  assert.deepEqual(result.marketFacets, ['cuisine_uzbek', 'cuisine_dumpling'])
})

test('uses Malay name aliases when the structured tag is vague', () => {
  const result = classifyBusiness({
    name: 'Kedai Telefon Bimbit Azmi',
    tags: { shop: 'yes' },
  })

  assert.equal(result.marketType, 'mobile_phone_shop')
  assert.equal(result.marketTypeLabel, 'Mobile phone shop / kedai telefon bimbit')
  assert.equal(result.taxonomySource, 'local-name-dictionary')
})

test('does not turn an arbitrary non-commercial amenity into a business', () => {
  const result = classifyBusiness({
    name: 'Sekolah Kebangsaan Contoh',
    tags: { amenity: 'school' },
  })

  assert.equal(result.marketType, 'other_business')
  assert.equal(result.specificity, 'unresolved')
})

test('combines multiple structured retail values and retains each matching facet', () => {
  const result = classifyBusiness({
    name: 'Digital World',
    tags: { shop: 'mobile_phone;electronics' },
  })

  assert.equal(result.marketType, 'mobile_phone_electronics_shop')
  assert.equal(result.marketTypeLabel, 'Mobile phone + Electronics shop')
  assert.deepEqual(result.marketFacets, ['mobile_phone_shop', 'electronics_shop'])
})

test('combines Malaysian name evidence when a business has more than one format', () => {
  const result = classifyBusiness({
    name: 'Restoran & Katering Deli Thai',
    tags: { amenity: 'restaurant' },
  })

  assert.equal(result.taxonomySource, 'local-name-combination')
  assert.ok(result.marketFacets.includes('thai_restaurant'))
  assert.ok(result.marketFacets.includes('caterer'))
  assert.match(result.marketTypeLabel, /Thai.*Caterer/)
})

test('recognizes additional Malaysian dish names from live adversarial examples', () => {
  assert.equal(classifyBusiness({
    name: 'Foong Keow Bah Kut Teh',
    tags: { amenity: 'restaurant' },
  }).marketType, 'bak_kut_teh_restaurant')

  assert.equal(classifyBusiness({
    name: 'Denna Nasi Kukus',
    tags: { amenity: 'restaurant' },
  }).marketType, 'nasi_kukus_restaurant')

  assert.equal(classifyBusiness({
    name: 'Ayam Gepuk Tokmat',
    tags: { amenity: 'restaurant' },
  }).marketType, 'ayam_gepuk_restaurant')
})

test('keeps an uninformative restaurant name broad instead of fabricating cuisine', () => {
  const result = classifyBusiness({
    name: 'Molek',
    tags: { amenity: 'restaurant' },
  })

  assert.equal(result.marketType, 'restaurant_other')
  assert.equal(result.marketTypeLabel, 'Restaurant — cuisine not mapped')
  assert.equal(result.specificity, 'broad')
})
