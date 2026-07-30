import {
  localizedMethodology,
  localizedNextSteps,
  localizedScenario,
  localizedValidationChecks,
  opportunityName,
  translator,
} from './i18n.js'

const page = {
  width: 210,
  height: 297,
  margin: 16,
  contentWidth: 178,
  bottom: 278,
}

const colors = {
  ink: [21, 23, 25],
  brand: [224, 23, 59],
  gray: [92, 97, 104],
  pale: [247, 247, 244],
  line: [220, 222, 218],
  green: [5, 150, 105],
  white: [255, 255, 255],
}

const text = (value, fallback = 'Not available') => {
  if (value === null || value === undefined || value === '') return fallback
  return String(value).replace(/[^\x20-\x7E\u00A0-\u024F]/g, ' ')
}

const money = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  maximumFractionDigits: 0,
})

function safeFileName(value) {
  return text(value, 'area')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .toLowerCase()
}

export async function createAnalysisPdf(analysis, locale = 'en') {
  const { jsPDF } = await import('jspdf')
  const t = translator(locale)
  const methodology = localizedMethodology(analysis, locale)
  const dateLocale = locale === 'ms' ? 'ms-MY' : 'en-MY'
  const scoreBand = (value) => locale === 'ms'
    ? ({
      'Strong candidate to validate': 'Calon kukuh untuk disahkan',
      'Promising, validate locally': 'Berpotensi, sahkan secara tempatan',
      'Conditional opportunity': 'Peluang bersyarat',
      'Weak current fit': 'Kesesuaian semasa lemah',
    }[value] || value)
    : value
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  let y = page.margin

  const setText = (size = 9, color = colors.ink, style = 'normal') => {
    pdf.setFont('helvetica', style)
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
  }

  const addPage = () => {
    pdf.addPage()
    y = page.margin
  }

  const ensure = (height) => {
    if (y + height > page.bottom) addPage()
  }

  const wrapped = (value, width = page.contentWidth) => pdf.splitTextToSize(text(value), width)

  const paragraph = (value, {
    size = 9,
    color = colors.gray,
    style = 'normal',
    width = page.contentWidth,
    gap = 3,
    lineHeight = 4.6,
  } = {}) => {
    const lines = wrapped(value, width)
    ensure(lines.length * lineHeight + gap)
    setText(size, color, style)
    pdf.text(lines, page.margin, y)
    y += lines.length * lineHeight + gap
  }

  const section = (title) => {
    ensure(16)
    y += 3
    pdf.setFillColor(...colors.brand)
    pdf.rect(page.margin, y, 4, 8, 'F')
    setText(15, colors.ink, 'bold')
    pdf.text(text(title), page.margin + 8, y + 6.5)
    y += 14
  }

  const keyValue = (label, value, x, top, width) => {
    pdf.setFillColor(...colors.pale)
    pdf.roundedRect(x, top, width, 22, 2.5, 2.5, 'F')
    setText(7.5, colors.gray, 'normal')
    pdf.text(text(label), x + 4, top + 7)
    setText(12, colors.ink, 'bold')
    pdf.text(text(value), x + 4, top + 15.5)
  }

  pdf.setFillColor(...colors.ink)
  pdf.rect(0, 0, page.width, 58, 'F')
  pdf.setFillColor(...colors.brand)
  pdf.rect(0, 0, 7, 58, 'F')
  setText(10, colors.brand, 'bold')
  pdf.text('LAUNCHBASE SEARCH', page.margin, 18)
  setText(25, colors.white, 'bold')
  pdf.text(locale === 'ms' ? 'Laporan peluang pasaran' : 'Market opportunity report', page.margin, 31)
  setText(12, colors.white, 'normal')
  pdf.text(wrapped(analysis.location?.name, 150), page.margin, 41)
  setText(8, [190, 193, 196], 'normal')
  pdf.text(`${text(analysis.radiusKm)} km ${locale === 'ms' ? 'radius kajian  |  Dijana' : 'study radius  |  Generated'} ${new Date(analysis.generatedAt || Date.now()).toLocaleString(dateLocale)}`, page.margin, 50)
  y = 68

  const metricWidth = (page.contentWidth - 6) / 2
  keyValue(t('population'), Number(analysis.area?.population || 0).toLocaleString('en-MY'), page.margin, y, metricWidth)
  keyValue(locale === 'ms' ? 'Pendapatan isi rumah median' : 'Median household income', money.format(analysis.area?.medianHouseholdIncomeRm || 0), page.margin + metricWidth + 6, y, metricWidth)
  y += 27
  keyValue(t('businessesScanned'), Number(analysis.dataQuality?.mappedBusinesses || 0).toLocaleString('en-MY'), page.margin, y, metricWidth)
  keyValue(t('marketEvidence'), `${analysis.dataQuality?.marketEvidence?.score || 0}/100`, page.margin + metricWidth + 6, y, metricWidth)
  y += 30

  section(locale === 'ms' ? 'Ringkasan eksekutif' : 'Executive summary')
  paragraph(
    locale === 'ms'
      ? `Laporan ini membandingkan anggaran permintaan tempatan, bekalan perniagaan dipetakan, keadaan isi rumah dan kualiti bukti untuk ${text(analysis.location?.name)}. Skor ialah isyarat perancangan, bukan jaminan kejayaan.`
      : `This report compares estimated local demand, mapped business supply, household conditions and evidence quality for ${text(analysis.location?.name)}. Scores are planning signals, not guarantees of success.`,
    { size: 10, color: colors.ink, lineHeight: 5.2 },
  )
  paragraph(`${locale === 'ms' ? 'Nota data' : 'Data note'}: ${locale === 'ms' ? t(analysis.dataQuality?.supplyAvailable ? 'mappedSupplyAvailable' : 'mapSupplyUnavailable') : text(analysis.dataQuality?.marketEvidence?.note)}`, { size: 8 })

  section(locale === 'ms' ? 'Kedudukan peluang' : 'Ranked opportunities')
  ;(analysis.opportunities || []).forEach((item, index) => {
    const reason = locale === 'ms'
      ? `${text(item.supportableStores)} kedai penanda aras disokong; ${text(item.competitorCount)} pesaing diperhatikan; skor bukti ${text(analysis.dataQuality?.marketEvidence?.score)}/100.`
      : (item.scoreExplanation || []).join(' | ')
    const risk = locale === 'ms'
      ? item.riskFlags?.[0] ? 'Sahkan persaingan, sewa dan aliran pelanggan di lokasi sebenar sebelum melabur.' : null
      : item.riskFlags?.[0]
    const recommendedFormat = locale === 'ms'
      ? `Format ${opportunityName(item, locale).toLowerCase()} berskala kejiranan yang perlu disahkan mengikut lokasi.`
      : item.recommendedFormat
    const cardLines = wrapped(`${text(recommendedFormat)} ${reason}`, 164)
    const height = 36 + cardLines.length * 4 + (risk ? 8 : 0)
    ensure(height + 5)

    pdf.setDrawColor(...(index === 0 ? colors.brand : colors.line))
    pdf.setLineWidth(index === 0 ? 1.1 : 0.35)
    pdf.roundedRect(page.margin, y, page.contentWidth, height, 3, 3, 'S')
    pdf.setFillColor(...(index === 0 ? colors.brand : colors.ink))
    pdf.circle(page.margin + 9, y + 10, 5, 'F')
    setText(8, index === 0 ? colors.ink : colors.white, 'bold')
    pdf.text(String(index + 1), page.margin + 9, y + 11.8, { align: 'center' })

    setText(12, colors.ink, 'bold')
    pdf.text(text(opportunityName(item, locale)), page.margin + 18, y + 10.8)
    const scoreX = page.width - page.margin - 6
    setText(18, index === 0 ? [151, 8, 38] : colors.ink, 'bold')
    pdf.text(String(item.successScore), scoreX, y + 11, { align: 'right' })
    setText(7, colors.gray, 'normal')
    pdf.text(text(scoreBand(item.scoreBand)), scoreX, y + 16, { align: 'right' })

    setText(8, colors.gray, 'normal')
    pdf.text(
      locale === 'ms'
        ? `Permintaan ${money.format(item.potentialDemandRm || 0)}  |  Boleh disokong ${text(item.supportableStores)}  |  Bekalan ${text(item.adjustedCompetitors)}  |  Bahagian saksama ${money.format(item.fairShareSalesRm || 0)}`
        : `Demand ${money.format(item.potentialDemandRm || 0)}  |  Supportable ${text(item.supportableStores)}  |  Supply ${text(item.adjustedCompetitors)}  |  Fair share ${money.format(item.fairShareSalesRm || 0)}`,
      page.margin + 5,
      y + 22,
    )
    pdf.text(cardLines, page.margin + 5, y + 29)
    if (risk) {
      setText(7.5, [176, 13, 47], 'bold')
      pdf.text(wrapped(`${locale === 'ms' ? 'Perhatian' : 'Caution'}: ${risk}`, 164), page.margin + 5, y + height - 5)
    }
    y += height + 5
  })

  if (analysis.sensitivity?.length) {
    section(locale === 'ms' ? 'Sensitiviti permintaan' : 'Demand sensitivity')
    analysis.sensitivity.forEach((scenario) => {
      ensure(12)
      setText(9, colors.ink, 'bold')
      pdf.text(text(localizedScenario(scenario.scenario, locale)), page.margin, y)
      setText(9, colors.gray, 'normal')
      pdf.text(`${scenario.demandChange >= 0 ? '+' : ''}${scenario.demandChange}% ${locale === 'ms' ? 'permintaan' : 'demand'}`, page.margin + 48, y)
      setText(9, colors.green, 'bold')
      pdf.text(money.format(scenario.topOpportunitySalesRm || 0), page.width - page.margin, y, { align: 'right' })
      y += 8
    })
  }

  if (analysis.competitorValidation?.length) {
    section(locale === 'ms' ? 'Pengesahan pesaing' : 'Competitor validation')
    analysis.competitorValidation.forEach((item) => {
      const checks = localizedValidationChecks(item.checks || [], locale).map((check) => `- ${check}`).join('\n')
      const lines = wrapped(checks, page.contentWidth - 8)
      ensure(15 + lines.length * 4)
      setText(10, colors.ink, 'bold')
      pdf.text(text(opportunityName(analysis.opportunities?.find((opportunity) => opportunity.name === item.category) || { name: item.category }, locale)), page.margin, y)
      setText(8, colors.gray, 'normal')
      pdf.text(`${text(item.mappedCount)} ${t('mapped')} | ${text(item.adjustedCount)} ${t('coverageAdjusted')}`, page.width - page.margin, y, { align: 'right' })
      y += 5
      pdf.text(lines, page.margin + 4, y)
      y += lines.length * 4 + 5
    })
  }

  if (analysis.nextSteps?.length) {
    section(locale === 'ms' ? 'Langkah seterusnya yang disyorkan' : 'Recommended next steps')
    localizedNextSteps(analysis.nextSteps, locale).forEach((step, index) => paragraph(`${index + 1}. ${step}`, { color: colors.ink, size: 9.5, lineHeight: 5 }))
  }

  section(locale === 'ms' ? 'Kaedah dan sumber' : 'Method and sources')
  paragraph(methodology?.demand)
  paragraph(methodology?.competitorEstimate)
  paragraph(methodology?.demographicFit)
  paragraph(methodology?.disclaimer, { color: [151, 8, 38], style: 'bold' })
  ;(analysis.sources || []).forEach((source) => paragraph(`${source.name}: ${source.url}`, { size: 7.5, gap: 1.5, lineHeight: 4 }))

  const totalPages = pdf.getNumberOfPages()
  for (let number = 1; number <= totalPages; number += 1) {
    pdf.setPage(number)
    pdf.setDrawColor(...colors.line)
    pdf.line(page.margin, 286, page.width - page.margin, 286)
    setText(7, colors.gray, 'normal')
    pdf.text(locale === 'ms' ? 'Dijana secara setempat dalam pelayar. LaunchBase Search tidak menyimpan PDF ini.' : 'Generated locally in your browser. LaunchBase Search does not store this PDF.', page.margin, 291)
    pdf.text(`${number} / ${totalPages}`, page.width - page.margin, 291, { align: 'right' })
  }

  return {
    pdf,
    fileName: `launchbase-${safeFileName(analysis.location?.name)}-${new Date().toISOString().slice(0, 10)}.pdf`,
  }
}

export async function downloadAnalysisPdf(analysis, locale = 'en') {
  const { pdf, fileName } = await createAnalysisPdf(analysis, locale)
  pdf.save(fileName)
}
