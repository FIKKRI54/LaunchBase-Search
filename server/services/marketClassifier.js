import { localMarketRules } from './marketDictionary.js'
import {
  cuisineTaxonomy,
  ignoredStructuredValues,
  structuredKeyConfig,
  structuredTaxonomy,
} from './marketTaxonomy.js'

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[_-]+/g, ' ')
  .replace(/[^a-z0-9\s/]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const canonical = (value = '') => normalize(value).replace(/[\s/]+/g, '_')
const humanize = (value = '') => {
  const text = canonical(value).replace(/_/g, ' ')
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}
const splitValues = (value = '') => [...new Set(
  String(value)
    .split(/[;,]/)
    .map(canonical)
    .filter(Boolean),
)]
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const includesPhrase = (text, phrase) => new RegExp(
  `(?:^|\\s)${escapeRegExp(normalize(phrase)).replace(/\s+/g, '\\s+')}(?=$|\\s|/)`,
).test(text)

const resultType = ({
  slug,
  label,
  group,
  confidence,
  signals,
  facets = [slug],
  source,
  specificity,
}) => ({
  marketType: slug,
  marketTypeLabel: label,
  marketGroup: group,
  classificationConfidence: confidence,
  classificationSignals: signals,
  marketFacets: [...new Set(facets)],
  taxonomySource: source,
  specificity,
})

function combineResults(results, signals, source) {
  const unique = results.filter((item, index, items) =>
    items.findIndex((candidate) => candidate.marketType === item.marketType) === index,
  )
  if (unique.length === 1) return unique[0]
  const confidenceRank = { low: 0, medium: 1, high: 2 }
  const confidence = unique.reduce(
    (lowest, item) => confidenceRank[item.classificationConfidence] < confidenceRank[lowest]
      ? item.classificationConfidence
      : lowest,
    'high',
  )
  const groups = [...new Set(unique.map((item) => item.marketGroup))]
  return resultType({
    slug: `${unique.map((item) => item.marketType).join('_')}_combination`,
    label: unique.map((item) => item.marketTypeLabel.split(' / ')[0]).join(' + '),
    group: groups.length === 1 ? groups[0] : 'mixed',
    confidence,
    signals,
    facets: unique.flatMap((item) => item.marketFacets),
    source,
    specificity: unique.some((item) => item.specificity === 'broad') ? 'broad' : 'specific',
  })
}

function classifyStructuredKey(tags, key, signals) {
  const config = structuredKeyConfig[key]
  const values = splitValues(tags[key])
    .filter((value) => !ignoredStructuredValues[key]?.has(value))
  if (!config || !values.length || values.every((value) => ['yes', 'other', 'unknown'].includes(value))) {
    return null
  }

  const dictionary = structuredTaxonomy[key] || {}
  const recognized = values.map((value) => ({
    value,
    entry: dictionary[value],
  }))
  if (!config.allowDerived && recognized.some((item) => !item.entry)) return null

  if (recognized.length === 1) {
    const [{ value, entry }] = recognized
    if (entry) {
      const [slug, label, group] = entry
      return resultType({
        slug,
        label,
        group,
        confidence: 'high',
        signals,
        facets: [slug],
        source: 'structured-dictionary',
        specificity: 'specific',
      })
    }
    return resultType({
      slug: `${value}_${config.suffix}`,
      label: `${humanize(value)} ${config.labelSuffix}`,
      group: config.group,
      confidence: 'medium',
      signals,
      facets: [`${value}_${config.suffix}`],
      source: 'structured-derived',
      specificity: 'specific',
    })
  }

  const components = recognized.map(({ value, entry }) =>
    entry ? entry[1].split(' / ')[0].replace(/\b(shop|office|service|practice)$/i, '').trim() : humanize(value),
  )
  const facets = recognized.map(({ value, entry }) => entry?.[0] || `${value}_${config.suffix}`)
  return resultType({
    slug: `${values.join('_')}_${config.suffix}`,
    label: `${components.join(' + ')} ${config.labelSuffix}`,
    group: recognized.find((item) => item.entry)?.entry?.[2] || config.group,
    confidence: recognized.every((item) => item.entry) ? 'high' : 'medium',
    signals,
    facets,
    source: recognized.every((item) => item.entry) ? 'structured-dictionary' : 'structured-derived',
    specificity: 'specific',
  })
}

function classifyCuisine(tags, signals) {
  const values = splitValues(tags.cuisine)
  if (!values.length) return null
  const recognized = values.map((value) => ({
    value,
    label: cuisineTaxonomy[value]?.[0] || humanize(value).toLowerCase(),
    facet: cuisineTaxonomy[value]?.[1] || `cuisine_${value}`,
  }))
  const unique = recognized.filter((item, index, items) =>
    items.findIndex((candidate) => candidate.facet === item.facet && candidate.label === item.label) === index,
  )
  const base = tags.amenity === 'cafe'
    ? 'cafe'
    : tags.amenity === 'fast_food' ? 'takeaway' : tags.amenity === 'ice_cream' ? 'ice cream shop' : 'restaurant'
  const labelText = unique.map((item) => item.label).join(' + ')
  let label = `${labelText.charAt(0).toUpperCase()}${labelText.slice(1)} ${base}`
  if (unique.length === 1 && unique[0].facet === 'cafe' && base === 'cafe') {
    label = 'Coffee shop / kedai kopi'
  }
  if (unique.length === 1 && unique[0].facet === 'ice_cream') {
    label = 'Ice cream shop / kedai ais krim'
  }

  if (unique.length === 1 && cuisineTaxonomy[values[0]]) {
    return resultType({
      slug: unique[0].facet,
      label,
      group: 'food',
      confidence: 'high',
      signals,
      facets: [unique[0].facet],
      source: 'cuisine-tags',
      specificity: 'specific',
    })
  }

  return resultType({
    slug: `cuisine_${values.join('_')}_${canonical(base)}`,
    label,
    group: 'food',
    confidence: 'high',
    signals,
    facets: unique.map((item) => item.facet),
    source: 'cuisine-tags',
    specificity: 'specific',
  })
}

function dictionaryMatches(rules, combined) {
  return rules
    .map((rule) => ({
      rule,
      term: rule.terms.find((term) => includesPhrase(combined, term)),
    }))
    .filter((match) => match.term)
}

function classifyDictionaryMatches(matches, signals) {
  const results = matches.map(({ rule, term }) => resultType({
    slug: rule.slug,
    label: rule.label,
    group: rule.group,
    confidence: rule.specificity === 'broad' ? 'medium' : 'high',
    signals: [...signals, `local-name:${term}`],
    source: 'local-name-dictionary',
    specificity: rule.specificity || 'specific',
  }))
  return combineResults(
    results,
    [...signals, ...matches.map(({ term }) => `local-name:${term}`)],
    results.length > 1 ? 'local-name-combination' : 'local-name-dictionary',
  )
}

export function classifyBusiness(place) {
  const tags = place.tags || {}
  const name = normalize(place.name || tags.name || tags.brand)
  const cuisine = normalize(tags.cuisine)
  const combined = `${name} ${normalize(tags.description)} ${normalize(tags.brand)}`
  const signals = [
    tags.cuisine ? `cuisine=${tags.cuisine}` : null,
    tags.amenity ? `amenity=${tags.amenity}` : null,
    tags.shop ? `shop=${tags.shop}` : null,
    tags.craft ? `craft=${tags.craft}` : null,
    tags.leisure ? `leisure=${tags.leisure}` : null,
    tags.office ? `office=${tags.office}` : null,
    tags.healthcare ? `healthcare=${tags.healthcare}` : null,
    tags.tourism ? `tourism=${tags.tourism}` : null,
  ].filter(Boolean)

  const foodContext = ['restaurant', 'fast_food', 'food_court', 'cafe', 'ice_cream'].includes(tags.amenity)
    || ['bakery', 'ice_cream', 'deli', 'pastry'].includes(tags.shop)
    || Boolean(cuisine)

  // Specific structured business keys are stronger than words embedded in a brand name.
  const structuredResults = []
  if (tags.shop && !['yes', 'other', 'unknown'].includes(canonical(tags.shop))) {
    const structuredShop = classifyStructuredKey(tags, 'shop', signals)
    if (structuredShop) structuredResults.push(structuredShop)
  }
  for (const key of ['healthcare', 'office', 'craft', 'leisure', 'tourism']) {
    const structured = classifyStructuredKey(tags, key, signals)
    if (structured) structuredResults.push(structured)
  }
  if (!foodContext) {
    const structuredAmenity = classifyStructuredKey(tags, 'amenity', signals)
    if (structuredAmenity) structuredResults.push(structuredAmenity)
  }
  if (structuredResults.length) {
    return combineResults(
      structuredResults,
      signals,
      structuredResults.length > 1 ? 'structured-combination' : structuredResults[0].taxonomySource,
    )
  }

  const nonFoodMatches = dictionaryMatches(
    localMarketRules.filter((rule) => rule.group !== 'food'),
    combined,
  )
  if (nonFoodMatches.length) return classifyDictionaryMatches(nonFoodMatches, signals)

  if (foodContext) {
    const cuisineValues = splitValues(tags.cuisine)
    if (cuisineValues.length > 1) return classifyCuisine(tags, signals)

    const foodMatches = dictionaryMatches(
      localMarketRules.filter((rule) => rule.group === 'food'),
      combined,
    )
    if (foodMatches.length) return classifyDictionaryMatches(foodMatches, signals)

    const cuisineResult = classifyCuisine(tags, signals)
    if (cuisineResult) return cuisineResult

    if (tags.shop === 'ice_cream' || tags.amenity === 'ice_cream') {
      return resultType({
        slug: 'ice_cream',
        label: 'Ice cream shop / kedai ais krim',
        group: 'food',
        confidence: 'high',
        signals,
        source: 'structured-dictionary',
        specificity: 'specific',
      })
    }
    if (tags.shop === 'bakery') {
      return resultType({
        slug: 'bakery',
        label: 'Bakery / kedai roti',
        group: 'food',
        confidence: 'high',
        signals,
        source: 'structured-dictionary',
        specificity: 'specific',
      })
    }
    if (tags.amenity === 'cafe') {
      return resultType({
        slug: 'cafe',
        label: 'Cafe / kedai kopi — menu not mapped',
        group: 'food',
        confidence: 'medium',
        signals,
        source: 'generic-structured',
        specificity: 'broad',
      })
    }
    if (tags.amenity === 'restaurant') {
      return resultType({
        slug: 'restaurant_other',
        label: 'Restaurant — cuisine not mapped',
        group: 'food',
        confidence: 'low',
        signals,
        source: 'generic-structured',
        specificity: 'broad',
      })
    }
    if (tags.amenity === 'fast_food') {
      return resultType({
        slug: 'fast_food_other',
        label: 'Fast-food outlet — cuisine not mapped',
        group: 'food',
        confidence: 'low',
        signals,
        source: 'generic-structured',
        specificity: 'broad',
      })
    }
    if (tags.amenity === 'food_court') {
      return resultType({
        slug: 'food_court',
        label: 'Food court / medan selera',
        group: 'food',
        confidence: 'high',
        signals,
        source: 'structured-dictionary',
        specificity: 'specific',
      })
    }
  }

  if (tags.shop && ['yes', 'other', 'unknown'].includes(canonical(tags.shop))) {
    return resultType({
      slug: 'shop_unspecified',
      label: 'Shop — type not mapped',
      group: 'retail',
      confidence: 'low',
      signals,
      source: 'generic-structured',
      specificity: 'broad',
    })
  }

  return resultType({
    slug: 'other_business',
    label: 'Unresolved map feature',
    group: 'other',
    confidence: 'low',
    signals,
    facets: [],
    source: 'unresolved',
    specificity: 'unresolved',
  })
}
