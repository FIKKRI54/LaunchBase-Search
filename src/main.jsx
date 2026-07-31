import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import launchbaseLogo from './assets/launchbase-logo-rocket.png'
import launchbaseHeaderVideo from './assets/launchbase-header-logo.webm'
import launchbaseHeaderHdLogo from './assets/launchbase-header-logo-hd-clean.png'
import {
  businessTypeLabel,
  localizedMethodology,
  localizedNextSteps,
  localizedScenario,
  localizedValidationChecks,
  opportunityName,
  translator,
} from './i18n.js'
import { downloadAnalysisPdf } from './reportPdf.js'
import './styles.css'

const Icon = ({ icon, width = 20, className = '' }) =>
  React.createElement('iconify-icon', { icon, width, class: className })

const HEADER_LOGO_SEEN_KEY = 'launchbase-header-logo-seen-session-v6'
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL?.trim() || 'hello@launchbase.my'

function AnimatedHeaderLogo() {
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const playbackStarted = useRef(false)
  const [fallback, setFallback] = useState(reducedMotion.current)
  const [videoReady, setVideoReady] = useState(false)
  const [videoEnded, setVideoEnded] = useState(false)
  const [hdLogoReady, setHdLogoReady] = useState(false)
  const [animate] = useState(() => {
    if (reducedMotion.current) return false
    try {
      const forceReplay = new URLSearchParams(window.location.search).get('logo') === 'replay'
      return forceReplay || sessionStorage.getItem(HEADER_LOGO_SEEN_KEY) !== '1'
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (!animate) return
    try {
      sessionStorage.setItem(HEADER_LOGO_SEEN_KEY, '1')
    } catch {
      // The animated logo still works when storage is unavailable.
    }
  }, [animate])

  const startFromFirstFrame = (video) => {
    if (playbackStarted.current) return
    playbackStarted.current = true
    video.pause()
    video.currentTime = 0
    setVideoReady(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        video.play().catch(() => setFallback(true))
      })
    })
  }

  if (!animate || fallback) {
    return (
      <span className="brand-logo-stage brand-logo-stage-finished">
        <img
          src={launchbaseHeaderHdLogo}
          alt=""
          className="brand-logo-image brand-logo-resting"
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      </span>
    )
  }

  return (
    <span className={`brand-logo-stage ${videoEnded && hdLogoReady ? 'brand-logo-stage-finished' : ''}`}>
      <img
        src={launchbaseHeaderHdLogo}
        alt=""
        className="brand-logo-image brand-logo-resting"
        loading="eager"
        decoding="async"
        fetchPriority="high"
        onLoad={() => setHdLogoReady(true)}
      />
      <video
        className={`brand-logo-video ${videoReady ? 'brand-logo-video-ready' : ''}`}
        src={launchbaseHeaderVideo}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        onEnded={() => setVideoEnded(true)}
        onError={() => setFallback(true)}
        onLoadedData={(event) => startFromFirstFrame(event.currentTarget)}
      />
    </span>
  )
}

function AnimatedDataField({ theme }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true })
    const pointer = { x: 0, y: 0 }
    let frame
    let width = 0
    let height = 0
    let isVisible = true
    let lastFrame = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    const frameInterval = coarsePointer ? 50 : 34

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width)
      canvas.height = Math.round(height)
      context.setTransform(1, 0, 0, 1, 0, 0)
    }

    const move = (event) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = (event.clientX - rect.left) / rect.width - 0.5
      pointer.y = (event.clientY - rect.top) / rect.height - 0.5
    }

    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height)
      const t = reducedMotion ? 0 : time * 0.0002
      const gap = width < 700 ? 17 : 14

      for (let y = 0; y < height; y += gap) {
        for (let x = 0; x < width; x += gap) {
          const nx = x + pointer.x * 20
          const waveOne = height * 0.49
            + Math.sin(nx * 0.008 + t * 3) * height * 0.15
            + Math.cos(nx * 0.003 - t) * height * 0.07
          const waveTwo = height * 0.62
            + Math.cos(nx * 0.006 - t * 2) * height * 0.13
          const d1 = Math.abs(y - waveOne - pointer.y * 14)
          const d2 = Math.abs(y - waveTwo)
          const ribbon = Math.exp(-(d1 * d1) / (2 * Math.pow(height * 0.11, 2)))
          const echo = Math.exp(-(d2 * d2) / (2 * Math.pow(height * 0.075, 2))) * 0.4
          const edgeFade = Math.sin(Math.PI * (x / Math.max(width, 1))) * 0.82 + 0.18
          const intensity = Math.min(1, (ribbon + echo) * edgeFade)
          const shimmer = 0.7 + Math.sin(x * 0.035 + y * 0.025 + t * 5) * 0.3
          const alpha = 0.018 + intensity * 0.22 * shimmer
          const particle = theme === 'light' ? '47, 55, 52' : '202, 211, 207'
          context.fillStyle = `rgba(${particle}, ${alpha})`
          const size = intensity > 0.58 ? 2 : 1
          context.fillRect(x, y, size, size)
        }
      }
    }

    const render = (time = 0) => {
      if (isVisible && !document.hidden && time - lastFrame >= frameInterval) {
        lastFrame = time
        draw(time)
      }
      if (!reducedMotion) frame = requestAnimationFrame(render)
    }

    resize()
    draw()
    if (!reducedMotion) frame = requestAnimationFrame(render)
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting
      if (isVisible && !document.hidden) draw(performance.now())
    }, { threshold: 0 })
    observer.observe(canvas)
    window.addEventListener('resize', resize)
    if (!coarsePointer) canvas.closest('section')?.addEventListener('pointermove', move, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      canvas.closest('section')?.removeEventListener('pointermove', move)
    }
  }, [theme])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-75" aria-hidden="true" />
}

function TrajectoryLines() {
  const paths = [
    'M40 430 Q 310 230 680 75',
    'M55 462 Q 300 258 690 130',
    'M88 485 Q 350 286 700 188',
    'M145 500 Q 390 320 710 250',
  ]
  return (
    <svg className="trajectory-lines" viewBox="0 0 720 540" aria-hidden="true">
      {paths.map((path, index) => <path key={path} d={path} style={{ animationDelay: `${index * -1.1}s` }} />)}
    </svg>
  )
}

function ThemeToggle({ theme, toggle, mobile = false, locale }) {
  const light = theme === 'light'
  const t = translator(locale)
  return (
    <button
      onClick={toggle}
      className={`${mobile ? 'flex w-full justify-between px-4' : 'grid w-10 place-items-center'} h-10 shrink-0 items-center rounded-xl border border-foreground/15 bg-surface text-foreground/75 shadow-sm transition hover:border-foreground/30 hover:text-accent`}
      aria-label={t('switchTheme')}
      title={t('switchTheme')}
    >
      {mobile && <span className="text-sm">{light ? t('lightMode') : t('darkMode')}</span>}
      <span className="grid h-5 w-5 place-items-center leading-none">
        <Icon icon={light ? 'solar:sun-linear' : 'solar:moon-linear'} width={20} />
      </span>
    </button>
  )
}

function Header({ openAuth, theme, toggleTheme, locale, toggleLocale }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(() => window.scrollY > 48)

  useEffect(() => {
    let frameId = 0
    const updateHeader = () => {
      if (frameId) return
      frameId = window.requestAnimationFrame(() => {
        setScrolled((wasScrolled) => (
          wasScrolled ? window.scrollY > 24 : window.scrollY > 72
        ))
        frameId = 0
      })
    }
    updateHeader()
    window.addEventListener('scroll', updateHeader, { passive: true })
    return () => {
      window.removeEventListener('scroll', updateHeader)
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [])
  const t = translator(locale)
  const links = [[t('navHow'), 'how'], [t('contact'), 'contact']]

  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : 'is-top'} ${menuOpen ? 'menu-open' : ''} sticky top-0 z-50 border-b border-foreground/10`}>
      <nav className="site-nav-shell mx-auto flex h-20 max-w-[1240px] items-center justify-between px-5 lg:px-8" aria-label={t('mainNavigation')}>
        <a href="#" className="site-brand group flex items-center gap-0" aria-label="LaunchBase Search home">
          <AnimatedHeaderLogo />

          <span className="text-[17px] font-semibold tracking-tight">LaunchBase<span className="text-accent"> Search</span></span>
        </a>
        <div className="site-nav-cluster hidden items-center gap-7 xl:flex">
          <div className="flex items-center gap-7 text-sm text-foreground/65">
            {links.map(([label, anchor]) => <a key={anchor} href={`#${anchor}`} className="transition hover:text-accent">{label}</a>)}
          </div>
          <div className="site-nav-actions flex items-center gap-3">
            <button type="button" onClick={toggleLocale} className="grid h-10 min-w-10 place-items-center rounded-xl border border-foreground/15 bg-surface px-3 text-xs font-bold text-foreground/75 transition hover:border-accent hover:text-accent" aria-label={t('languageLabel')}>{t('language')}</button>
            <ThemeToggle theme={theme} toggle={toggleTheme} locale={locale} />
            <button onClick={() => openAuth('login')} className="rounded-lg px-4 py-2.5 text-sm font-medium text-foreground/75 transition hover:text-accent">{t('login')}</button>
            <a href="#search" className="button-primary">{t('startScan')}</a>
          </div>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="site-menu-trigger grid h-10 w-10 place-items-center rounded-lg border border-foreground/15 xl:hidden" aria-label={t('openMenu')} aria-expanded={menuOpen}>
          <Icon icon={menuOpen ? 'solar:close-circle-linear' : 'solar:hamburger-menu-linear'} width={24} />
        </button>
      </nav>
      {menuOpen && (
        <div className="site-mobile-menu border-t border-foreground/10 bg-ink px-5 py-5 xl:hidden">
          <div className="flex flex-col gap-4 text-sm text-foreground/75">
            {links.map(([label, anchor]) => <a key={anchor} onClick={() => setMenuOpen(false)} href={`#${anchor}`}>{label}</a>)}
            <button type="button" onClick={toggleLocale} className="flex h-10 items-center justify-between rounded-xl border border-foreground/15 px-4"><span>{locale === 'ms' ? 'Bahasa Melayu' : 'English'}</span><strong>{t('language')}</strong></button>
            <div><ThemeToggle theme={theme} toggle={toggleTheme} mobile locale={locale} /></div>
            <button onClick={() => openAuth('login')} className="text-left">{t('login')}</button>
            <a onClick={() => setMenuOpen(false)} href="#search" className="mt-2 rounded-lg bg-signal px-5 py-3 text-center font-semibold text-contrast">{t('startScan')}</a>
          </div>
        </div>
      )}
    </header>
  )
}

function Hero({ onSearch, theme, locale }) {
  const [location, setLocation] = useState('Kuala Lumpur City Centre')
  const t = translator(locale)
  const submit = (event) => {
    event.preventDefault()
    if (location.trim()) onSearch(location.trim())
  }

  return (
    <section id="search" className="hero-shell relative isolate min-h-[calc(100svh-80px)] overflow-hidden border-b border-foreground/10">
      <AnimatedDataField theme={theme} />
      <div className="hero-vignette absolute inset-0" />
      <div className="hero-grain absolute inset-0 opacity-25" />
      <TrajectoryLines />
      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-80px)] max-w-[1240px] items-center px-5 py-20 lg:px-8">
        <div className="max-w-[750px]">
          <h1 className="max-w-[760px] text-[clamp(3.5rem,7.5vw,7rem)] font-medium leading-[.93] tracking-[-.067em]">
            {t('heroTitleA')}<br /><span className="text-accent">{t('heroTitleB')}</span>
          </h1>
          <p className="mt-7 max-w-[570px] text-base leading-7 text-foreground/60 md:text-lg">
            {t('heroCopy')}
          </p>
          <form onSubmit={submit} className="mt-9 flex max-w-[650px] flex-col gap-2 rounded-2xl border border-foreground/15 bg-ink/70 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl sm:flex-row">
            <label className="flex min-w-0 flex-1 items-center gap-3 px-3">
              <Icon icon="solar:magnifer-linear" width={22} className="text-foreground/60" />
              <input value={location} onChange={(event) => setLocation(event.target.value)} className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/60" placeholder={t('heroPlaceholder')} />
            </label>
            <button className="button-primary group h-12 px-6">
              {t('explore')} <Icon icon="solar:arrow-right-linear" width={18} className="transition group-hover:translate-x-1" />
            </button>
          </form>
        </div>
      </div>
      <div className="absolute bottom-8 right-8 z-10 hidden items-center gap-3 text-[11px] uppercase tracking-[.2em] text-foreground/60 md:flex">
        <span>{t('scroll')}</span><span className="scroll-line h-px w-16 bg-foreground/30" />
      </div>
    </section>
  )
}

const formatNumber = new Intl.NumberFormat('en-MY')
const formatRinggit = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  maximumFractionDigits: 0,
})
const browserAnalysisCache = new Map()
const browserAnalysisCacheMs = 2 * 60 * 1000

const browserAnalysisKey = (selection) => {
  if (typeof selection === 'string') return `query:${selection.trim().toLowerCase()}:r5`
  if (selection.query) return `query:${selection.query.trim().toLowerCase()}:r${selection.radiusKm || 5}`
  return `point:${Number(selection.lat).toFixed(4)}:${Number(selection.lng).toFixed(4)}:r${selection.radiusKm || 5}`
}

function readBrowserAnalysis(key) {
  const entry = browserAnalysisCache.get(key)
  if (!entry || entry.expiresAt <= Date.now()) {
    browserAnalysisCache.delete(key)
    return null
  }
  return entry.analysis
}

function storeBrowserAnalysis(key, analysis) {
  browserAnalysisCache.set(key, { analysis, expiresAt: Date.now() + browserAnalysisCacheMs })
  while (browserAnalysisCache.size > 12) {
    browserAnalysisCache.delete(browserAnalysisCache.keys().next().value)
  }
}

function AdSenseSlot({ slot, placement = 'content', locale }) {
  const requestedRef = useRef(false)
  const t = translator(locale)
  const client = import.meta.env.VITE_GOOGLE_ADSENSE_CLIENT
  const enabled = /^ca-pub-\d+$/.test(client || '') && /^\d+$/.test(slot || '')

  useEffect(() => {
    if (!enabled || requestedRef.current) return
    requestedRef.current = true

    const scriptId = 'launchbase-adsense'
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.async = true
      script.crossOrigin = 'anonymous'
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`
      document.head.appendChild(script)
    }

    try {
      window.adsbygoogle = window.adsbygoogle || []
      window.adsbygoogle.push({})
    } catch {
      requestedRef.current = false
    }
  }, [client, enabled, slot])

  if (!enabled) {
    if (!import.meta.env.DEV) return null
    return (
      <aside className="mx-auto flex min-h-28 max-w-[1240px] items-center justify-center rounded-2xl border border-dashed border-foreground/15 bg-foreground/[.025] px-5 text-center" aria-label={t('adPreview')}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-foreground/45">{t('adPreview')}</p>
          <p className="mt-2 text-xs text-foreground/55">{locale === 'ms' ? 'Ruang ini akan muncul selepas ID klien dan slot AdSense dikonfigurasi.' : 'This placement appears after the AdSense client and slot IDs are configured.'}</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="mx-auto min-h-28 max-w-[1240px] overflow-hidden text-center" aria-label={t('ad')}>
      <p className="mb-2 text-[9px] uppercase tracking-[.16em] text-foreground/40">{t('ad')}</p>
      <ins
        className="adsbygoogle block"
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  )
}

function ThemeSelect({ value, onChange, options, ariaLabel, compact = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selected = options.find((option) => String(option.value) === String(value)) || options[0]

  useEffect(() => {
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <div ref={rootRef} className={`theme-select ${compact ? 'theme-select-compact' : ''} ${open ? 'theme-select-open' : ''}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="theme-select-trigger"
      >
        <span className="truncate">{selected.label}</span>
        <Icon icon="solar:alt-arrow-down-linear" width={14} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" aria-label={ariaLabel} className="theme-select-menu">
          {options.map((option) => {
            const active = String(option.value) === String(value)
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`theme-select-option ${active ? 'theme-select-option-active' : ''}`}
              >
                <span className="truncate">{option.label}</span>
                {active && <Icon icon="solar:check-circle-bold" width={15} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LeafletMarketMap({ analysis, selectedCategory, draftPoint, previewRadiusKm, onPointChange }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const businessLayerRef = useRef(null)
  const areaLayerRef = useRef(null)
  const clickHandlerRef = useRef(onPointChange)
  clickHandlerRef.current = onPointChange

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    const map = L.map(containerRef.current, { zoomControl: false, preferCanvas: true })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    map.on('click', ({ latlng }) => {
      clickHandlerRef.current?.({
        lat: Number(latlng.lat.toFixed(6)),
        lng: Number(latlng.lng.toFixed(6)),
      })
    })
    mapRef.current = map
    window.setTimeout(() => map.invalidateSize(), 0)
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const center = draftPoint
      ? [draftPoint.lat, draftPoint.lng]
      : [analysis.location.lat, analysis.location.lng]
    if (draftPoint) {
      map.panTo(center, { animate: true })
    } else {
      const zoom = analysis.radiusKm <= 2 ? 14 : analysis.radiusKm <= 5 ? 13 : 12
      map.setView(center, zoom)
    }
  }, [
    analysis.generatedAt,
    analysis.location.lat,
    analysis.location.lng,
    analysis.radiusKm,
    draftPoint?.lat,
    draftPoint?.lng,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const center = draftPoint
      ? [draftPoint.lat, draftPoint.lng]
      : [analysis.location.lat, analysis.location.lng]
    const previewRadius = Number(previewRadiusKm || analysis.radiusKm)
    areaLayerRef.current?.remove()
    const radiusCircle = L.circle(center, {
      radius: previewRadius * 1000,
      color: '#9f102d',
      fillColor: '#e0173b',
      fillOpacity: 0.055,
      weight: 2,
      dashArray: '7 7',
      interactive: false,
    })
    areaLayerRef.current = L.layerGroup([
      radiusCircle,
      L.circleMarker(center, {
        radius: 8,
        color: '#ffffff',
        fillColor: draftPoint ? '#00a878' : '#121416',
        fillOpacity: 1,
        weight: 3,
      }).bindPopup(document.createTextNode(
        draftPoint ? `Selected scan centre · ${previewRadius} km` : `Current scan: ${analysis.location.name} · ${previewRadius} km`,
      )),
    ]).addTo(map)
  }, [
    analysis.generatedAt,
    analysis.location.lat,
    analysis.location.lng,
    analysis.location.name,
    analysis.radiusKm,
    draftPoint?.lat,
    draftPoint?.lng,
    previewRadiusKm,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    businessLayerRef.current?.remove()
    const selectedOpportunity = analysis.opportunities.find((item) => item.slug === selectedCategory)
    const marketTypes = selectedCategory === 'all' || !selectedOpportunity
      ? null
      : selectedOpportunity.marketTypes || []
    const visiblePlaces = (analysis.mapBusinesses || [])
      .filter((place) => !marketTypes || marketTypes.includes(place.type))
      .slice(0, selectedCategory === 'all' ? 350 : 500)
    const markers = visiblePlaces.map((place) => {
      const content = document.createElement('div')
      const name = document.createElement('strong')
      const detail = document.createElement('span')
      name.textContent = place.name
      detail.textContent = place.typeLabel
      content.className = 'market-popup'
      content.append(name, detail)
      return L.circleMarker([place.lat, place.lng], {
        radius: 5,
        color: '#151719',
        fillColor: place.confidence === 'high' ? '#e0173b' : '#9f102d',
        fillOpacity: 0.92,
        weight: 1.5,
      }).bindPopup(content)
    })
    businessLayerRef.current = L.layerGroup(markers).addTo(map)
  }, [analysis.mapBusinesses, analysis.opportunities, selectedCategory])

  return <div ref={containerRef} className="interactive-market-map min-h-[410px] flex-1" aria-label="Interactive market map. Click a location to select a new scan point." />
}

function GoogleEmbedView({ analysis, mode, locale }) {
  const t = translator(locale)
  const key = import.meta.env.VITE_GOOGLE_MAPS_EMBED_API_KEY
  const address = analysis.location.formattedAddress || `${analysis.location.name}, Malaysia`
  const coordinates = `${analysis.location.lat},${analysis.location.lng}`
  const params = new URLSearchParams({ key, region: 'MY', language: 'en' })
  let embedMode = 'place'
  if (mode === 'google') params.set('q', address)
  if (mode === 'satellite') {
    embedMode = 'view'
    params.set('center', coordinates)
    params.set('zoom', '14')
    params.set('maptype', 'satellite')
  }
  if (mode === 'streetview') {
    embedMode = 'streetview'
    params.set('location', coordinates)
    params.set('fov', '90')
    params.set('heading', '0')
    params.set('pitch', '0')
  }
  const embedUrl = `https://www.google.com/maps/embed/v1/${embedMode}?${params}`
  const externalMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

  if (!key) {
    return (
      <div className="map-fallback relative grid min-h-[410px] flex-1 place-items-center overflow-hidden p-6 text-center">
        <div className="map-fallback-grid absolute inset-0" />
        <div className="relative max-w-sm rounded-2xl border border-foreground/10 bg-surface/95 p-5 shadow-xl">
          <p className="text-sm font-semibold">{t('googleOptional')}</p>
          <p className="mt-2 text-xs leading-5 text-foreground/60">{t('googleOptionalCopy')}</p>
          <a href={externalMapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-accent">
            {t('openGoogle')} <Icon icon="solar:arrow-up-right-linear" width={15} />
          </a>
        </div>
      </div>
    )
  }
  return (
    <iframe
      key={embedUrl}
      title={`${mode} map for ${analysis.location.name}`}
      src={embedUrl}
      className="min-h-[410px] flex-1 border-0"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )
}

function InteractiveAnalysisMap({ analysis, onScan, loading, locale }) {
  const t = translator(locale)
  const [mode, setMode] = useState('market')
  const [searchQuery, setSearchQuery] = useState(analysis.location.formattedAddress || analysis.location.name)
  const [radiusKm, setRadiusKm] = useState(analysis.radiusKm)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [draftPoint, setDraftPoint] = useState(null)
  const modes = [
    ['market', t('liveMarket'), 'solar:map-point-search-linear'],
    ['google', t('googlePlace'), 'solar:map-linear'],
    ['satellite', t('satellite'), 'solar:global-linear'],
    ['streetview', t('streetView'), 'solar:streets-map-point-linear'],
  ]

  useEffect(() => {
    setSearchQuery(analysis.location.formattedAddress || analysis.location.name)
    setRadiusKm(analysis.radiusKm)
    setSelectedCategory('all')
    setDraftPoint(null)
  }, [analysis.generatedAt])

  const submitSearch = (event) => {
    event.preventDefault()
    if (draftPoint) {
      onScan({ ...draftPoint, radiusKm: Number(radiusKm) })
    } else if (searchQuery.trim()) {
      onScan({ query: searchQuery.trim(), radiusKm: Number(radiusKm) })
    }
  }

  return (
    <div className="relative flex min-h-[540px] flex-col bg-surface">
      <div className="flex flex-wrap gap-2 border-b border-foreground/10 p-3">
        {modes.map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              mode === value ? 'bg-signal text-contrast' : 'bg-foreground/5 text-foreground/65 hover:text-foreground'
            }`}
          >
            <Icon icon={icon} width={15} />{label}
          </button>
        ))}
      </div>
      <form onSubmit={submitSearch} className="relative z-30 grid gap-2 border-b border-foreground/10 bg-surface p-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="flex min-w-0 items-center gap-2 rounded-xl border border-foreground/10 bg-ink px-3 focus-within:border-accent">
          <Icon icon="solar:magnifer-linear" width={17} className="text-foreground/50" />
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setDraftPoint(null)
            }}
            className="h-10 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
            aria-label="Search another Malaysian location"
            placeholder={t('searchPlace')}
          />
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-ink px-3 text-xs text-foreground/60">
          <span>{t('scanRadius')}</span>
          <ThemeSelect
            value={radiusKm}
            onChange={(value) => setRadiusKm(Number(value))}
            options={[2, 3, 5, 8, 10].map((radius) => ({ value: radius, label: `${radius} km` }))}
            ariaLabel="Study radius"
            compact
          />
        </div>
        <button disabled={loading} className="rounded-xl bg-signal px-4 py-2 text-xs font-semibold text-contrast disabled:cursor-wait disabled:opacity-60">
          {loading ? t('scanning') : draftPoint ? t('scanPoint') : t('searchScan')}
        </button>
      </form>
      {mode === 'market' && (
        <>
          <div className="relative z-20 flex flex-col gap-2 border-b border-foreground/10 bg-surface px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
            <p className="text-foreground/55"><span className="font-medium text-foreground">{t('clickAnywhere')}</span> {t('chooseScanCentre')}</p>
            <div className="flex items-center gap-2 text-foreground/55">
              <span className="shrink-0">{t('showMarkers')}</span>
              <ThemeSelect
                value={selectedCategory}
                onChange={setSelectedCategory}
                options={[
                  { value: 'all', label: t('allBusinesses') },
                  ...analysis.opportunities.map((item) => ({ value: item.slug, label: opportunityName(item, locale) })),
                ]}
                ariaLabel="Business marker category"
              />
            </div>
          </div>
            <LeafletMarketMap
            analysis={analysis}
            selectedCategory={selectedCategory}
            draftPoint={draftPoint}
            previewRadiusKm={radiusKm}
            onPointChange={setDraftPoint}
          />
        </>
      )}
      {mode !== 'market' && <GoogleEmbedView analysis={analysis} mode={mode} locale={locale} />}
      {loading && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] h-1 overflow-hidden bg-foreground/10"><span className="block h-full w-1/2 animate-pulse bg-signal" /></div>}
    </div>
  )
}

function MarketComposition({ analysis, locale }) {
  const t = translator(locale)
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    setFilter('')
    setExpanded(false)
  }, [analysis.generatedAt])

  const normalizedFilter = filter.trim().toLowerCase()
  const matchingTypes = analysis.marketBreakdown.filter((segment) =>
    !normalizedFilter
    || segment.label.toLowerCase().includes(normalizedFilter)
    || segment.examples.some((name) => name.toLowerCase().includes(normalizedFilter)),
  )
  const visibleTypes = expanded || normalizedFilter ? matchingTypes : matchingTypes.slice(0, 12)

  return (
    <div className="mt-6 rounded-2xl border border-foreground/10 bg-surface p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold">{t('catalogue')}</p>
          <p className="mt-1 text-xs text-foreground/55">{t('catalogueCopy')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-xs text-foreground/50">{analysis.marketBreakdown.length} {t('distinctTypes')} · {Math.round(analysis.dataQuality.taxonomyCoverage * 100)}% {t('specific')}</span>
          <label className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-ink px-3">
            <Icon icon="solar:magnifer-linear" width={14} className="text-foreground/45" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('filterBusiness')}
              className="h-9 w-full bg-transparent text-xs text-foreground outline-none sm:w-48"
            />
          </label>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTypes.map((segment) => (
          <div key={segment.slug} className="rounded-xl border border-foreground/10 bg-foreground/[.025] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{businessTypeLabel(segment.label, locale)}</p>
              <span className="rounded-full bg-foreground/5 px-2 py-1 text-xs font-semibold">{segment.count}</span>
            </div>
            {segment.examples.length > 0 && <p className="mt-2 line-clamp-2 text-xs leading-5 text-foreground/50">{segment.examples.join(' · ')}</p>}
            <p className="mt-2 text-[10px] uppercase tracking-wide text-foreground/40">{segment.specificity === 'specific' ? t('specific') : t('broad')} · {Object.keys(segment.sourceCounts).join(' + ').replaceAll('-', ' ')}</p>
          </div>
        ))}
      </div>
      {!visibleTypes.length && <p className="mt-5 rounded-xl border border-dashed border-foreground/10 p-5 text-center text-xs text-foreground/50">{t('noBusinessMatch')}</p>}
      {!normalizedFilter && matchingTypes.length > 12 && (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="mt-5 rounded-lg border border-foreground/10 px-4 py-2 text-xs font-medium text-foreground/65 transition hover:border-accent hover:text-accent">
          {expanded ? t('showTopTypes') : locale === 'ms' ? `Tunjuk semua ${matchingTypes.length} jenis` : `Show all ${matchingTypes.length} types`}
        </button>
      )}
      {(analysis.dataQuality.broadBusinesses > 0 || analysis.dataQuality.unresolvedBusinesses > 0) && (
        <p className="mt-4 text-[11px] leading-5 text-foreground/45">
          {locale === 'ms'
            ? `${analysis.dataQuality.broadBusinesses} rekod hanya mempunyai jenis umum dan ${analysis.dataQuality.unresolvedBusinesses} belum dikenal pasti kerana tag atau nama petanya tiada petunjuk perniagaan yang boleh dipercayai. Rekod ini kekal dipaparkan tanpa mereka-reka kategori.`
            : `${analysis.dataQuality.broadBusinesses} records have only a broad type and ${analysis.dataQuality.unresolvedBusinesses} remain unresolved because their map tags or names contain no reliable business indicator. They are kept visible without inventing a category.`}
        </p>
      )}
    </div>
  )
}

function AnalysisWorkspace({ analysis, loading, error, onScan, locale }) {
  const t = translator(locale)
  const [showAllOpportunities, setShowAllOpportunities] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [pdfDownloaded, setPdfDownloaded] = useState(false)

  useEffect(() => {
    setShowAllOpportunities(false)
    setPdfError('')
    setPdfDownloaded(false)
  }, [analysis?.analysisId, analysis?.generatedAt])

  if (!analysis && !loading && !error) return null
  const visibleOpportunities = showAllOpportunities
    ? analysis?.opportunities || []
    : (analysis?.opportunities || []).slice(0, 3)
  const evidenceLabel = (level) => t(`${level}Evidence`)
  const confidenceLabel = (value) => locale === 'ms'
    ? ({ 'High evidence': 'Bukti tinggi', 'Medium evidence': 'Bukti sederhana', 'Low evidence': 'Bukti rendah' }[value] || value)
    : value
  const scoreBandLabel = (value) => locale === 'ms'
    ? ({
      'Strong candidate to validate': 'Calon kukuh untuk disahkan',
      'Promising, validate locally': 'Berpotensi, sahkan secara tempatan',
      'Conditional opportunity': 'Peluang bersyarat',
      'Weak current fit': 'Kesesuaian semasa lemah',
    }[value] || value)
    : value

  const downloadPdf = async () => {
    if (!analysis || pdfLoading || pdfDownloaded) return
    setPdfLoading(true)
    setPdfError('')
    try {
      await downloadAnalysisPdf(analysis, locale)
      setPdfDownloaded(true)
    } catch {
      setPdfError(t('pdfError'))
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <section id="analysis" className="border-b border-foreground/10 bg-deep py-20">
      <div className="mx-auto max-w-[1240px] px-5 lg:px-8">
        {loading && !analysis && (
          <div className="rounded-3xl border border-foreground/10 bg-surface p-8 md:p-12">
            <div className="flex items-center gap-3 text-sm text-foreground/65">
              <span className="h-3 w-3 animate-pulse rounded-full bg-signal" />
              {t('loadingAnalysis')}
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-foreground/5" />)}
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6">
            <p className="font-medium text-red-500">{t('analysisFailed')}</p>
            <p className="mt-2 text-sm text-foreground/65">{error}</p>
          </div>
        )}

        {analysis && (
          <>
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="eyebrow">{t('freeSnapshot')}</p>
                <h2 className="section-title">{analysis.location.name}</h2>
                <p className="mt-3 text-sm text-foreground/60">{analysis.location.formattedAddress} · {analysis.radiusKm} {t('analyzedRadius')}</p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium ${
                  analysis.dataQuality.marketEvidence.level === 'high'
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600'
                    : analysis.dataQuality.marketEvidence.level === 'medium'
                      ? 'border-signal/25 bg-signal/10 text-accent'
                      : 'border-orange-500/25 bg-orange-500/10 text-orange-600'
                }`}>
                  <Icon icon="solar:verified-check-bold" width={16} />
                  {evidenceLabel(analysis.dataQuality.marketEvidence.level)} · {analysis.dataQuality.marketEvidence.score}/100
                </span>
                <button type="button" disabled={pdfLoading || pdfDownloaded} onClick={downloadPdf} className="button-primary min-w-40 disabled:cursor-not-allowed disabled:opacity-60">
                  <Icon icon={pdfLoading ? 'solar:refresh-circle-linear' : pdfDownloaded ? 'solar:check-circle-bold' : 'solar:file-download-linear'} width={18} className={pdfLoading ? 'animate-spin' : ''} />
                  {pdfLoading ? t('buildingPdf') : pdfDownloaded ? t('pdfDownloaded') : t('downloadPdf')}
                </button>
              </div>
            </div>
            <p className="mt-3 text-right text-[10px] text-foreground/45">{t('pdfNote')}</p>
            {pdfError && <p className="mt-2 text-right text-xs text-red-500">{pdfError}</p>}

            <div className="mt-10 grid overflow-hidden rounded-3xl border border-foreground/10 bg-surface lg:grid-cols-[1.25fr_.75fr]">
              <InteractiveAnalysisMap analysis={analysis} onScan={onScan} loading={loading} locale={locale} />
              <div className="grid grid-cols-2 border-t border-foreground/10 lg:border-l lg:border-t-0">
                <AreaMetric label={t('population')} value={formatNumber.format(analysis.area.population)} note={`${formatNumber.format(analysis.area.populationLow)}–${formatNumber.format(analysis.area.populationHigh)} ${locale === 'ms' ? 'julat perancangan' : 'planning range'}`} />
                <AreaMetric label={t('medianIncome')} value={formatRinggit.format(analysis.area.medianHouseholdIncomeRm)} note={locale === 'ms' ? 'setiap isi rumah / bulan' : 'per household / month'} />
                <AreaMetric label={t('workingAge')} value={`${Math.round(analysis.area.workingAgeShare * 100)}%`} note={locale === 'ms' ? 'anggaran bahagian' : 'estimated share'} />
                <AreaMetric label={t('expenditure')} value={formatRinggit.format(analysis.area.meanHouseholdExpenditureRm)} note={locale === 'ms' ? 'setiap isi rumah / bulan' : 'per household / month'} />
                <AreaMetric label={t('children')} value={`${Math.round((analysis.area.ageShares?.children || 0) * 100)}%`} note={locale === 'ms' ? 'bahagian umur 0–14 daerah' : 'age 0–14 district share'} />
                <AreaMetric label={t('seniors')} value={`${Math.round((analysis.area.ageShares?.seniors || 0) * 100)}%`} note={locale === 'ms' ? 'bahagian umur 65+ daerah' : 'age 65+ district share'} />
                <AreaMetric
                  label={t('businessesScanned')}
                  value={!analysis.dataQuality.supplyAvailable
                    ? t('unavailable')
                    : analysis.dataQuality.mappedBusinesses > 0
                      ? formatNumber.format(analysis.dataQuality.mappedBusinesses)
                      : t('noMappedResults')}
                  note={!analysis.dataQuality.supplyAvailable
                    ? locale === 'ms' ? 'Penyedia peta langsung tidak mengembalikan imbasan yang boleh digunakan' : 'The live map provider did not return a usable scan'
                    : analysis.dataQuality.mappedBusinesses > 0
                      ? `${formatNumber.format(analysis.dataQuality.classifiedBusinesses)} ${t('specific')} · ${formatNumber.format(analysis.dataQuality.broadBusinesses)} ${t('broad')}`
                      : locale === 'ms' ? 'Imbasan selesai, tetapi peta tidak mengandungi ciri yang sepadan' : 'The provider completed the scan, but its map currently contains no matching features'}
                />
                <AreaMetric label={t('marketEvidence')} value={`${analysis.dataQuality.marketEvidence.score}/100`} note={locale === 'ms' ? 'Skor menunjukkan kelengkapan dan kualiti bukti pasaran yang dipetakan.' : analysis.dataQuality.marketEvidence.note} />
              </div>
            </div>

            {(!analysis.dataQuality.supplyAvailable || analysis.dataQuality.mappedBusinesses === 0) && (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <Icon icon="solar:danger-triangle-bold" width={20} className="mt-0.5 shrink-0 text-orange-500" />
                  <div>
                    <p className="font-semibold text-orange-600">{analysis.dataQuality.supplyAvailable ? t('noMappedTitle') : t('liveUnavailable')}</p>
                    <p className="mt-1 text-xs leading-5 text-foreground/60">{t('zeroWarning')}</p>
                  </div>
                </div>
                <button type="button" disabled={loading} onClick={() => onScan({ query: analysis.location.formattedAddress || analysis.location.name, radiusKm: analysis.radiusKm, refresh: true })} className="shrink-0 rounded-xl border border-orange-500/30 px-4 py-2 text-xs font-semibold text-orange-600 transition hover:bg-orange-500/10 disabled:opacity-60">
                  {t('retry')}
                </button>
              </div>
            )}

            {analysis.dataQuality.demographicProfile?.ethnicityAvailable && (
              <div className="mt-4 rounded-2xl border border-foreground/10 bg-surface p-5">
                <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
                  <div>
                    <p className="text-sm font-semibold">{t('districtProfile')}</p>
                    <p className="mt-1 text-xs text-foreground/55">{t('districtProfileCopy')}</p>
                  </div>
                  <p className="max-w-lg text-[11px] leading-5 text-foreground/45">{locale === 'ms' ? 'Etnik hanya digunakan sebagai isyarat kecil kecenderungan masakan dan tidak pernah dianggap sebagai pengganti agama.' : analysis.dataQuality.demographicProfile.note}</p>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    [locale === 'ms' ? 'Melayu' : 'Malay', analysis.area.ethnicityShares?.bumiMalay],
                    [locale === 'ms' ? 'Bumiputera lain' : 'Other Bumiputera', analysis.area.ethnicityShares?.bumiOther],
                    [locale === 'ms' ? 'Cina' : 'Chinese', analysis.area.ethnicityShares?.chinese],
                    [locale === 'ms' ? 'India' : 'Indian', analysis.area.ethnicityShares?.indian],
                    [locale === 'ms' ? 'Warganegara lain' : 'Other citizen', analysis.area.ethnicityShares?.otherCitizen],
                    [locale === 'ms' ? 'Bukan warganegara' : 'Non-citizen', analysis.area.citizenshipShares?.nonCitizen],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-foreground/[.04] px-3 py-3">
                      <p className="text-[10px] text-foreground/50">{label}</p>
                      <p className="mt-1 font-semibold">{Math.round(Number(value || 0) * 100)}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-12 flex items-end justify-between gap-5">
              <div><p className="eyebrow">{t('rankingEyebrow')}</p><h3 className="mt-3 text-3xl font-medium tracking-[-.03em]">{t('rankingTitle')}</h3></div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {visibleOpportunities.map((item, index) => (
                <article key={item.slug} className={`rounded-2xl border p-6 ${index === 0 ? 'border-signal/50 bg-signal text-contrast' : 'border-foreground/10 bg-surface'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${index === 0 ? 'text-contrast/60' : 'text-foreground/60'}`}>#{index + 1} · {confidenceLabel(item.confidenceLabel)}</span>
                    <span className="text-right">
                      <span className={`block text-3xl font-semibold ${index === 0 ? '' : 'text-accent'}`}>{item.successScore}</span>
                      <span className={`mt-1 block text-[10px] font-medium ${index === 0 ? 'text-contrast/55' : 'text-foreground/50'}`}>{scoreBandLabel(item.scoreBand)}</span>
                    </span>
                  </div>
                  <h4 className="mt-8 text-xl font-semibold">{opportunityName(item, locale)}</h4>
                  <p className={`mt-2 text-xs leading-5 ${index === 0 ? 'text-contrast/65' : 'text-foreground/60'}`}>{locale === 'ms' ? `Format ${opportunityName(item, locale).toLowerCase()} berskala kejiranan yang perlu disahkan mengikut lokasi.` : item.recommendedFormat}</p>
                  <dl className={`mt-5 space-y-3 border-t pt-5 text-sm ${index === 0 ? 'border-contrast/20' : 'border-foreground/10'}`}>
                    <ResultRow label={t('potentialDemand')} value={formatRinggit.format(item.potentialDemandRm)} dark={index === 0} />
                    <ResultRow label={t('supportableStores')} value={item.supportableStores} dark={index === 0} />
                    <ResultRow label={item.competitorSource === 'live-openstreetmap' ? t('mappedBusinesses') : t('modelledCompetitors')} value={item.competitorCount} dark={index === 0} />
                    <ResultRow label={t('adjustedSupply')} value={item.adjustedCompetitors} dark={index === 0} />
                    <ResultRow label={t('fairShare')} value={formatRinggit.format(item.fairShareSalesRm)} dark={index === 0} />
                  </dl>
                  {item.businessExamples?.length > 0 && (
                    <div className={`mt-5 border-t pt-4 text-xs leading-5 ${index === 0 ? 'border-contrast/20 text-contrast/60' : 'border-foreground/10 text-foreground/55'}`}>
                      <p className="font-medium">{t('examples')}</p>
                      <p className="mt-1">{item.businessExamples.slice(0, 3).map((business) => business.name).join(' · ')}</p>
                    </div>
                  )}
                  <div className={`mt-5 rounded-xl p-3 text-[11px] leading-5 ${index === 0 ? 'bg-contrast/10 text-contrast/70' : 'bg-foreground/[.035] text-foreground/55'}`}>
                    <p className="font-semibold">{t('whyScore')}</p>
                    <p className="mt-1">{locale === 'ms' ? `${item.supportableStores} kedai penanda aras disokong · ${item.competitorCount} pesaing dipetakan · skor bukti ${analysis.dataQuality.marketEvidence.score}/100` : item.scoreExplanation.join(' · ')}</p>
                    {item.demographicSignals?.[0] && <p className="mt-2"><span className="font-semibold">{t('localFit')}</span> {locale === 'ms' ? 'Pelarasan demografi agregat khusus kategori telah digunakan.' : item.demographicSignals[0]}</p>}
                    {item.riskFlags?.[0] && <p className="mt-2"><span className="font-semibold">{t('caution')}</span> {locale === 'ms' ? 'Sahkan persaingan, sewa dan aliran pelanggan di lokasi sebenar sebelum melabur.' : item.riskFlags[0]}</p>}
                  </div>
                </article>
              ))}
            </div>
            {analysis.opportunities.length > 3 && (
              <div className="mt-5 flex justify-center">
                <button type="button" onClick={() => setShowAllOpportunities((current) => !current)} className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 bg-surface px-5 py-3 text-xs font-semibold text-foreground/65 transition hover:border-accent hover:text-accent">
                  {showAllOpportunities ? t('showTopThree') : `${locale === 'ms' ? 'Tunjuk' : 'Show'} ${analysis.opportunities.length - 3} ${t('moreOpportunities')}`}
                  <Icon icon="solar:alt-arrow-down-linear" width={15} className={`transition ${showAllOpportunities ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}

            {analysis.marketBreakdown?.length > 0 && <MarketComposition analysis={analysis} locale={locale} />}

            <div className="mt-6">
              <AdSenseSlot slot={import.meta.env.VITE_GOOGLE_ADSENSE_SLOT_ANALYSIS} placement="analysis" locale={locale} />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
              <div className="rounded-2xl border border-foreground/10 bg-surface p-6">
                <p className="text-sm font-semibold">{t('estimateWorks')}</p>
                <p className="mt-3 text-sm leading-6 text-foreground/65">{localizedMethodology(analysis, locale).demand}. {localizedMethodology(analysis, locale).fairShare}.</p>
                <p className="mt-3 text-xs leading-5 text-foreground/55">{localizedMethodology(analysis, locale).competitorEstimate}.</p>
                <p className="mt-3 text-xs leading-5 text-foreground/55">{localizedMethodology(analysis, locale).demographicFit}</p>
                <p className="mt-4 text-xs leading-5 text-foreground/55">{localizedMethodology(analysis, locale).disclaimer}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {analysis.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="rounded-full border border-foreground/10 px-3 py-1.5 text-xs text-foreground/65 transition hover:border-accent hover:text-accent">{source.name}</a>)}
                </div>
              </div>
              <div className="rounded-2xl border border-signal/30 bg-signal/10 p-6">
                <div className="flex items-center gap-2 text-accent"><Icon icon="solar:verified-check-bold" /><span className="text-xs font-semibold uppercase tracking-[.16em]">{t('includedFree')}</span></div>
                <h4 className="mt-4 text-xl font-semibold">{t('completeOpen')}</h4>
                <p className="mt-3 text-sm leading-6 text-foreground/65">{t('completeOpenCopy')}</p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs text-foreground/65">
                  <span className="rounded-full border border-foreground/10 px-3 py-1.5">{analysis.opportunities.length} {t('categories')}</span>
                  <span className="rounded-full border border-foreground/10 px-3 py-1.5">{analysis.sensitivity?.length || 3} {t('scenarios')}</span>
                  <span className="rounded-full border border-foreground/10 px-3 py-1.5">{t('openAccess')}</span>
                </div>
              </div>
            </div>

            <DetailedAnalysis analysis={analysis} locale={locale} />
          </>
        )}
      </div>
    </section>
  )
}

function AreaMetric({ label, value, note }) {
  return (
    <div className="border-b border-r border-foreground/10 p-5 last:border-b-0 lg:p-6">
      <p className="text-xs text-foreground/60">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-foreground/50">{note}</p>
    </div>
  )
}

function ResultRow({ label, value, dark }) {
  return <div className="flex items-center justify-between gap-3"><dt className={dark ? 'text-contrast/60' : 'text-foreground/60'}>{label}</dt><dd className="font-medium">{value}</dd></div>
}

function DetailedAnalysis({ analysis, locale }) {
  const t = translator(locale)
  const scenarios = analysis.sensitivity || []
  const validations = analysis.competitorValidation || []
  const nextSteps = localizedNextSteps(analysis.nextSteps || [], locale)
  const [activePanel, setActivePanel] = useState('sensitivity')

  useEffect(() => {
    setActivePanel('sensitivity')
  }, [analysis.generatedAt])

  if (!scenarios.length && !validations.length && !nextSteps.length) return null

  return (
    <section className="mt-6 rounded-3xl border border-foreground/10 bg-surface p-6 md:p-8" aria-labelledby="detailed-analysis-title">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">{t('detailed')}</p>
          <h3 id="detailed-analysis-title" className="mt-3 text-2xl font-semibold tracking-[-.03em]">{t('stressTest')}</h3>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600">
          <Icon icon="solar:check-circle-bold" width={16} />{t('freeAccess')}
        </span>
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto border-b border-foreground/10 pb-3">
        {[
          ['sensitivity', t('demandScenarios'), scenarios.length],
          ['validation', t('competitorChecks'), validations.length],
          ['steps', t('nextSteps'), nextSteps.length],
        ].filter(([, , count]) => count > 0).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActivePanel(value)}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
              activePanel === value ? 'bg-signal text-contrast' : 'bg-foreground/5 text-foreground/60 hover:text-foreground'
            }`}
          >
            {label} <span className="ml-1 opacity-60">{count}</span>
          </button>
        ))}
      </div>

      {activePanel === 'sensitivity' && scenarios.length > 0 && (
        <div className="mt-5">
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {scenarios.map((scenario) => (
              <article key={scenario.scenario} className="rounded-2xl border border-foreground/10 bg-foreground/[.025] p-4">
                <p className="text-xs text-foreground/55">{localizedScenario(scenario.scenario, locale)} {t('scenario')}</p>
                <p className="mt-2 text-xl font-semibold">{formatRinggit.format(scenario.topOpportunitySalesRm)}</p>
                <p className="mt-1 text-[11px] text-foreground/50">{scenario.demandChange >= 0 ? '+' : ''}{scenario.demandChange}% {t('demandAssumption')}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      {activePanel === 'validation' && validations.length > 0 && (
        <div className="mt-5">
          <div className="max-h-[430px] overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-2">
            {validations.map((item) => (
              <article key={item.category} className="rounded-2xl border border-foreground/10 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{opportunityName(analysis.opportunities.find((opportunity) => opportunity.name === item.category) || { name: item.category }, locale)}</p>
                    <p className="mt-1 text-xs text-foreground/55">{item.mappedCount} {t('mapped')} · {item.adjustedCount} {t('coverageAdjusted')}</p>
                  </div>
                  <a href={item.googleMapsSearch} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-accent hover:underline">{t('crossCheck')}</a>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs leading-5 text-foreground/60">
                  {localizedValidationChecks(item.checks, locale).map((check) => <li key={check} className="flex gap-2"><Icon icon="solar:check-read-linear" width={15} className="mt-0.5 shrink-0 text-accent" />{check}</li>)}
                </ul>
              </article>
            ))}
            </div>
          </div>
        </div>
      )}

      {activePanel === 'steps' && nextSteps.length > 0 && (
        <div className="mt-5">
          <ol className="grid gap-3 md:grid-cols-3">
            {nextSteps.map((step, index) => (
              <li key={step} className="flex gap-3 rounded-2xl bg-foreground/[.035] p-4 text-sm leading-6 text-foreground/65">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-signal text-xs font-semibold text-contrast">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

function DataMarquee({ locale }) {
  const t = translator(locale)
  const sources = [
    ['solar:buildings-linear', t('officialAreaStatistics')],
    ['solar:map-linear', t('interactiveOpenMap')],
    ['solar:users-group-rounded-linear', t('populationDemographics')],
    ['solar:shop-linear', t('localBusinessSignals')],
    ['solar:chart-2-linear', t('marketOpportunityData')],
  ]
  return (
    <section id="data" className="overflow-hidden border-b border-foreground/10 bg-foreground/[.025] py-6">
      <div className="marquee-track flex items-center">
        {[0, 1].map((copy) => (
          <div key={copy} className="marquee-group flex items-center gap-14 px-7 text-sm font-medium text-foreground/60" aria-hidden={copy === 1}>
            {sources.map(([icon, label]) => <span key={label} className="flex items-center gap-2 whitespace-nowrap"><Icon icon={icon} width={22} />{label}</span>)}
          </div>
        ))}
      </div>
    </section>
  )
}

const getHowSteps = (t) => [
  { icon: 'solar:map-point-search-linear', title: t('howStep1Title'), copy: t('howStep1Copy') },
  { icon: 'solar:users-group-rounded-linear', title: t('howStep2Title'), copy: t('howStep2Copy') },
  { icon: 'solar:shop-linear', title: t('howStep3Title'), copy: t('howStep3Copy') },
  { icon: 'solar:lightbulb-bolt-linear', title: t('howStep4Title'), copy: t('howStep4Copy') },
]

function HowVisual({ active, locale, stepCount }) {
  const t = translator(locale)
  return (
    <div className="how-stage" aria-live="polite">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.18em] text-foreground/45">
        <span>{t('liveWalkthrough')}</span>
        <span>{t('step')} {active + 1} / {stepCount}</span>
      </div>
      <div key={active} className="how-scene">
        {active === 0 && (
          <div className="how-map">
            <span className="how-road how-road-a" />
            <span className="how-road how-road-b" />
            <span className="how-pin"><Icon icon="solar:map-point-bold" width={28} /></span>
            <span className="how-scan-ring how-scan-ring-a" />
            <span className="how-scan-ring how-scan-ring-b" />
            <div className="how-caption"><Icon icon="solar:magnifer-linear" /> Section 17, Shah Alam</div>
          </div>
        )}
        {active === 1 && (
          <div className="how-data-flow">
            {[
              ['solar:users-group-rounded-bold', t('population'), '411k'],
              ['solar:calendar-linear', t('workingAge'), '65%'],
              ['solar:wallet-money-linear', t('expenditure'), 'RM8.2k'],
              ['solar:pie-chart-2-linear', t('districtProfile'), 'DOSM'],
            ].map(([icon, label, value], index) => (
              <div key={label} className="how-data-card" style={{ '--delay': `${index * 90}ms` }}>
                <Icon icon={icon} width={20} /><span><small>{label}</small><strong>{value}</strong></span>
              </div>
            ))}
            <span className="how-data-line" />
          </div>
        )}
        {active === 2 && (
          <div className="how-balance">
            <div className="how-balance-card"><small>{t('likelyDemand')}</small><strong>{t('familyWorkers')}</strong><span className="how-meter"><i style={{ width: '78%' }} /></span></div>
            <span className="how-versus">VS</span>
            <div className="how-balance-card"><small>{t('nearbySupply')}</small><strong>12 {t('relevantBusinesses')}</strong><span className="how-meter"><i style={{ width: '46%' }} /></span></div>
            <div className="how-guard"><Icon icon="solar:shield-check-bold" width={18} /> {t('checksApplied')}</div>
          </div>
        )}
        {active === 3 && (
          <div className="how-result">
            <div className="flex items-start justify-between">
              <span className="rounded-full bg-signal/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">{t('candidateValidate')}</span>
              <strong className="text-3xl text-accent">82</strong>
            </div>
            <h3>{locale === 'ms' ? 'Kedai roti kejiranan' : 'Neighbourhood bakery'}</h3>
            <p>{locale === 'ms' ? 'Permintaan keluarga melebihi aras nasional dan bekalan yang dipetakan kelihatan sederhana.' : 'Family demand is above the national baseline and mapped supply appears moderate.'}</p>
            <div className="how-reason"><Icon icon="solar:check-circle-bold" /> {t('clearReason')}</div>
            <div className="how-reason how-reason-warn"><Icon icon="solar:danger-triangle-bold" /> {t('validationWarning')}</div>
          </div>
        )}
      </div>
      <div className="how-progress"><span style={{ width: `${((active + 1) / stepCount) * 100}%` }} /></div>
    </div>
  )
}

function HowItWorks({ theme, locale }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const t = translator(locale)
  const howSteps = getHowSteps(t)

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % howSteps.length)
    }, 3200)
    return () => window.clearInterval(timer)
  }, [paused])

  return (
    <section id="how" className="how-shell relative isolate overflow-hidden border-y border-foreground/10 py-24 lg:py-32">
      <AnimatedDataField theme={theme} />
      <div className="how-glow absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 mx-auto max-w-[1240px] px-5 lg:px-8">
        <div className="max-w-3xl">
          <p className="eyebrow">{t('howEyebrow')}</p>
          <h2 className="section-title">{t('howTitleA')}<br />{t('howTitleB')}</h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-foreground/65">{t('howCopy')}</p>
        </div>
        <div
          className="how-panel mt-14 grid overflow-hidden rounded-3xl border border-foreground/10 md:grid-cols-[.78fr_1.22fr]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
          }}
        >
          <div className="divide-y divide-foreground/10 bg-surface/85 backdrop-blur-xl">
            {howSteps.map((step, index) => (
              <button
                key={step.title}
                type="button"
                aria-pressed={active === index}
                onClick={() => setActive(index)}
                className={`how-step ${active === index ? 'how-step-active' : ''}`}
              >
                <span className="how-step-number">0{index + 1}</span>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/5 text-accent"><Icon icon={step.icon} width={22} /></span>
                <span className="text-left"><strong>{step.title}</strong><small>{step.copy}</small></span>
              </button>
            ))}
          </div>
          <HowVisual active={active} locale={locale} stepCount={howSteps.length} />
        </div>
      </div>
    </section>
  )
}

const opportunityIcons = {
  specialty_coffee: 'solar:cup-hot-bold',
  boutique_fitness: 'solar:dumbbell-large-linear',
  coworking: 'solar:laptop-minimalistic-linear',
  healthy_food: 'solar:chef-hat-linear',
  ice_cream: 'solar:ice-cream-bold',
  bakery: 'solar:chef-hat-linear',
  pharmacy: 'solar:medical-kit-bold',
  convenience: 'solar:shop-bold',
  laundry: 'solar:washing-machine-linear',
  beauty: 'solar:scissors-square-linear',
}

function MarketSignalBanner({ analysis, primary, locale }) {
  const t = translator(locale)
  const hasResult = Boolean(analysis && primary)
  const location = analysis?.location?.name || t('signalWaitingArea')
  const population = analysis?.area?.population
    ? formatNumber.format(analysis.area.population)
    : '—'
  const mappedBusinesses = analysis?.dataQuality?.supplyAvailable
    ? formatNumber.format(analysis.dataQuality.mappedBusinesses || 0)
    : '—'
  const recommendation = primary ? opportunityName(primary, locale) : t('signalAwaiting')

  return (
    <aside className="market-signal-banner mt-12" aria-label={t('signalBannerLabel')}>
      <div className="market-signal-copy">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {hasResult ? t('signalLive') : t('signalPreview')}
        </span>
        <h3 className="mt-5 max-w-lg text-3xl font-semibold leading-[1.08] tracking-[-.04em] md:text-4xl">{t('signalBannerTitle')}</h3>
        <p className="mt-4 max-w-lg text-sm leading-6 text-foreground/65 md:text-base md:leading-7">{t('signalBannerCopy')}</p>
        <a href={hasResult ? '#analysis' : '#search'} className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-accent">
          {hasResult ? t('signalBannerCtaLive') : t('signalBannerCtaEmpty')}
          <Icon icon="solar:arrow-right-linear" className="transition-transform duration-300 group-hover:translate-x-1" />
        </a>
      </div>

      <div className="market-signal-visual" aria-live="polite">
        <div className="market-signal-grid" aria-hidden="true" />
        <div className="market-signal-sweep" aria-hidden="true" />
        <div className="market-signal-flow">
          <div className="market-signal-progress" aria-hidden="true" />

          <article className="market-signal-card market-signal-card-one">
            <div className="market-signal-icon"><Icon icon="solar:map-point-linear" width={21} /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-foreground/45">{t('signalSelectedArea')}</p>
              <p className="mt-2 truncate text-sm font-semibold">{location}</p>
            </div>
            <span className="market-signal-ring" aria-hidden="true" />
          </article>

          <div className="market-signal-pair">
            <article className="market-signal-card market-signal-card-two">
              <div className="market-signal-icon"><Icon icon="solar:users-group-rounded-linear" width={21} /></div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-foreground/45">{t('signalDemand')}</p>
                <p className="mt-2 text-xl font-semibold tracking-tight">{population}</p>
                <p className="mt-1 text-[11px] text-foreground/45">{t('signalPopulation')}</p>
              </div>
            </article>
            <article className="market-signal-card market-signal-card-three">
              <div className="market-signal-icon"><Icon icon="solar:shop-linear" width={21} /></div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-foreground/45">{t('signalSupply')}</p>
                <p className="mt-2 text-xl font-semibold tracking-tight">{mappedBusinesses}</p>
                <p className="mt-1 text-[11px] text-foreground/45">{t('signalBusinesses')}</p>
              </div>
            </article>
          </div>

          <article className="market-signal-result">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/60">{t('signalRecommendation')}</p>
                <p className="mt-3 max-w-xs text-xl font-semibold leading-tight text-white">{recommendation}</p>
              </div>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/12 text-white">
                <Icon icon={primary?.icon || 'solar:lightbulb-bolt-linear'} width={25} />
              </div>
            </div>
            <div className="mt-5 flex items-end justify-between border-t border-white/15 pt-4">
              <span className="text-xs text-white/60">{t('opportunityIndex')}</span>
              <span className="text-3xl font-semibold text-white">{primary?.successScore ?? '—'}</span>
            </div>
          </article>
        </div>
      </div>
    </aside>
  )
}

function OpportunitySection({ analysis, locale }) {
  const t = translator(locale)
  const ideas = (analysis?.opportunities || []).slice(0, 3).map((idea) => ({
    ...idea,
    icon: opportunityIcons[idea.slug] || 'solar:shop-linear',
  }))
  const primary = ideas[0]
  const secondary = ideas.slice(1)

  return (
    <section id="opportunities" className="border-y border-foreground/10 bg-deep py-24 lg:py-32">
      <div className="mx-auto max-w-[1240px] px-5 lg:px-8">
        <div className="flex flex-col justify-between gap-7 md:flex-row md:items-end">
          <div><p className="eyebrow">{t('smartSuggestions')}</p><h2 className="section-title">{t('opportunityTitleA')}<br />{t('opportunityTitleB')}</h2></div>
          {analysis
            ? <a href="#analysis" className="group flex items-center gap-2 text-sm font-medium text-foreground/70 transition hover:text-accent">{t('reviewAnalysis')} <Icon icon="solar:arrow-up-linear" className="transition group-hover:-translate-y-1" /></a>
            : <span className="text-sm text-foreground/60">{t('searchToGenerate')}</span>}
        </div>
        <MarketSignalBanner analysis={analysis} primary={primary} locale={locale} />
        {!primary ? (
          <div className="mt-14 rounded-2xl border border-dashed border-foreground/15 bg-surface p-10 text-center">
            <Icon icon="solar:map-point-search-linear" width={34} className="text-accent" />
            <p className="mt-4 font-medium">{t('noPrefill')}</p>
            <p className="mt-2 text-sm text-foreground/60">{t('noPrefillCopy')}</p>
          </div>
        ) : <div className="mt-14 grid gap-4 lg:grid-cols-[1.5fr_.85fr_.85fr]">
          <article className="opportunity-main group relative min-h-[430px] overflow-hidden rounded-2xl bg-signal p-7 text-contrast lg:p-9">
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-start justify-between"><span className="rounded-full border border-contrast/20 px-3 py-1.5 text-xs font-medium">{t('bestMatch')}</span><Icon icon={primary.icon} width={36} /></div>
              <div className="mt-auto">
                <p className="text-sm text-contrast/60">{analysis.location.name} · {primary.competitorSource === 'live-openstreetmap' ? t('liveSupply') : t('fallbackEstimate')}</p>
                <h3 className="mt-3 max-w-lg text-4xl font-semibold tracking-[-.04em] md:text-5xl">{opportunityName(primary, locale)}</h3>
                <div className="mt-7 grid grid-cols-3 gap-4 border-t border-contrast/20 pt-5">
                  <Metric label={t('opportunityIndex')} value={primary.successScore} />
                  <Metric label={t('supportableStores')} value={primary.supportableStores} />
                  <Metric label={primary.competitorSource === 'live-openstreetmap' ? t('mappedBusinesses') : t('estimatedRivals')} value={primary.competitorCount} />
                </div>
              </div>
            </div>
            <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full border-[42px] border-contrast/10 transition duration-700 group-hover:scale-110" />
          </article>
          {secondary.map((idea, index) => (
            <article key={idea.slug} className="flex min-h-[300px] flex-col rounded-2xl border border-foreground/10 bg-surface p-7 transition duration-300 hover:-translate-y-1 hover:border-foreground/20 lg:min-h-[430px]">
              <div className="flex items-center justify-between"><span className="text-xs text-foreground/60">#{String(index + 2).padStart(2, '0')} {t('opportunity')}</span><Icon icon={idea.icon} width={27} className="text-accent" /></div>
              <div className="mt-auto"><p className="text-xs text-foreground/65">{idea.competitorCount} {idea.competitorSource === 'live-openstreetmap' ? t('mappedBusinessPlural') : t('estimatedRivals')}</p><h3 className="mt-3 text-2xl font-medium">{opportunityName(idea, locale)}</h3><div className="mt-6 flex items-end justify-between border-t border-foreground/10 pt-5"><span className="text-xs text-foreground/60">{t('opportunityIndex')}</span><span className="text-3xl font-semibold">{idea.successScore}</span></div></div>
            </article>
          ))}
        </div>}
      </div>
    </section>
  )
}

function Metric({ label, value }) {
  return <div><p className="text-xs text-contrast/55">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
}

function ContactSection({ locale, notify }) {
  const t = translator(locale)

  const openEmail = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const subject = form.get('subject')?.toString().trim()
    const body = [
      `${t('contactName')}: ${form.get('name')}`,
      `${t('email')}: ${form.get('email')}`,
      '',
      form.get('message'),
    ].join('\n')

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[LaunchBase Search] ${subject}`)}&body=${encodeURIComponent(body)}`
    notify?.(t('contactOpening'))
  }

  return (
    <section id="contact" className="mx-auto max-w-[1240px] scroll-mt-28 px-5 py-24 lg:px-8 lg:py-32">
      <div className="overflow-hidden rounded-[28px] border border-foreground/10 bg-surface shadow-[0_24px_80px_rgba(0,0,0,.08)]">
        <div className="grid lg:grid-cols-[.82fr_1.18fr]">
          <div className="relative overflow-hidden border-b border-foreground/10 p-8 md:p-12 lg:border-b-0 lg:border-r lg:p-14">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <p className="eyebrow">{t('contactEyebrow')}</p>
              <h2 className="mt-5 max-w-md text-4xl font-semibold leading-[1.06] tracking-[-.05em] md:text-5xl">{t('contactTitle')}</h2>
              <p className="mt-6 max-w-md text-base leading-7 text-foreground/65">{t('contactCopy')}</p>
              <a href={`mailto:${CONTACT_EMAIL}`} className="mt-9 inline-flex items-center gap-3 rounded-2xl border border-foreground/10 bg-bg px-4 py-3 text-sm font-medium transition hover:border-accent/50 hover:text-accent">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent"><Icon icon="solar:letter-linear" width={20} /></span>
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>

          <form onSubmit={openEmail} className="grid gap-5 p-8 md:grid-cols-2 md:p-12 lg:p-14">
            <label className="block text-sm font-medium">
              {t('contactName')}
              <input name="name" required maxLength={80} autoComplete="name" className="form-input mt-2" placeholder={t('contactNamePlaceholder')} />
            </label>
            <label className="block text-sm font-medium">
              {t('email')}
              <input name="email" required maxLength={200} type="email" autoComplete="email" className="form-input mt-2" placeholder="you@example.com" />
            </label>
            <label className="block text-sm font-medium md:col-span-2">
              {t('contactSubject')}
              <input name="subject" required maxLength={120} className="form-input mt-2" placeholder={t('contactSubjectPlaceholder')} />
            </label>
            <label className="block text-sm font-medium md:col-span-2">
              {t('contactMessage')}
              <textarea name="message" required maxLength={2000} rows={6} className="form-input mt-2 min-h-36 resize-y py-3 leading-6" placeholder={t('contactMessagePlaceholder')} />
            </label>
            <div className="flex flex-col gap-4 md:col-span-2 md:flex-row md:items-center md:justify-between">
              <p className="max-w-sm text-xs leading-5 text-foreground/50">{t('contactMailNote')}</p>
              <button type="submit" className="button-primary shrink-0">
                {t('contactSend')} <Icon icon="solar:plain-2-linear" width={18} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}

function Footer({ locale }) {
  const t = translator(locale)
  return (
    <footer className="border-t border-foreground/10">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-14 md:grid-cols-2 lg:px-8">
        <div><a href="#" className="flex items-center gap-2.5 font-semibold"><img src={launchbaseLogo} alt="" className="h-10 w-10 shrink-0 object-contain" />LaunchBase Search</a><p className="mt-5 max-w-sm text-sm leading-6 text-foreground/65">{t('footerCopy')}</p></div>
        <div className="grid grid-cols-2 gap-8 text-sm md:justify-self-end md:text-right">
          <div className="space-y-3 text-foreground/65"><p className="mb-4 text-foreground">{t('product')}</p><a className="block hover:text-accent" href="#how">{t('navHow')}</a><a className="block hover:text-accent" href="#contact">{t('contact')}</a></div>
          <div className="space-y-3 text-foreground/65"><p className="mb-4 text-foreground">{t('company')}</p><a className="block hover:text-accent" href="#">{t('privacy')}</a><a className="block hover:text-accent" href="#">{t('terms')}</a><a className="block hover:text-accent" href={`mailto:${CONTACT_EMAIL}`}>{t('contact')}</a></div>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2 border-t border-foreground/10 px-5 py-6 text-xs text-foreground/60 sm:flex-row sm:justify-between lg:px-8"><p>{t('footerCopyright')}</p><p>{t('builtFor')}</p></div>
    </footer>
  )
}

function AuthModal({ mode, close, notify, locale }) {
  const t = translator(locale)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    setFormError('')
    setSubmitting(false)
  }, [mode])
  if (!mode) return null
  const login = mode === 'login'
  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch(`/api/auth/${login ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || t('authFailed'))
      localStorage.setItem('launchbase-token', body.token)
      close()
      notify(login ? t('savedReady') : t('accountCreated'))
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div onMouseDown={(event) => event.target === event.currentTarget && close()} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-foreground/10 bg-surface p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between">
          <div><p className="eyebrow">LaunchBase Search</p><h2 className="mt-2 text-2xl font-semibold">{login ? t('welcome') : t('createAccount')}</h2></div>
          <button onClick={close} className="grid h-9 w-9 place-items-center rounded-lg border border-foreground/10 text-foreground/65 transition hover:text-foreground" aria-label={t('close')}><Icon icon="solar:close-circle-linear" width={22} /></button>
        </div>
        <p className="mt-3 text-sm leading-6 text-foreground/65">{login ? t('authLoginCopy') : t('authRegisterCopy')}</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-xs text-foreground/60">{t('email')}<input name="email" autoFocus required type="email" className="form-input" placeholder="you@example.com" /></label>
          <label className="block text-xs text-foreground/60">{t('password')}<input name="password" required minLength="8" type="password" className="form-input" placeholder={t('passwordHint')} /></label>
          {formError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{formError}</p>}
          <button disabled={submitting} className="h-12 w-full rounded-xl bg-signal text-sm font-semibold text-contrast transition hover:bg-[#ef3b59] disabled:cursor-wait disabled:opacity-60">{submitting ? t('pleaseWait') : t('continue')}</button>
        </form>
        <p className="mt-5 text-center text-xs text-foreground/60">{t('authAgreement')}</p>
      </div>
    </div>
  )
}

function App() {
  const [authMode, setAuthMode] = useState(null)
  const [toast, setToast] = useState('')
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [locale, setLocale] = useState(() => {
    try {
      return localStorage.getItem('launchbase-locale') === 'ms' ? 'ms' : 'en'
    } catch {
      return 'en'
    }
  })
  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const scanAbortRef = useRef(null)
  const scanSequenceRef = useRef(0)

  const notify = (message) => {
    setToast(message)
    window.clearTimeout(window.launchbaseToast)
    window.launchbaseToast = window.setTimeout(() => setToast(''), 3200)
  }

  const search = async (selection) => {
    const requestInput = typeof selection === 'string'
      ? { query: selection, radiusKm: 5 }
      : selection
    const requestKey = browserAnalysisKey(requestInput)
    const token = localStorage.getItem('launchbase-token')
    const cachedAnalysis = token || requestInput.refresh ? null : readBrowserAnalysis(requestKey)
    const requestSequence = scanSequenceRef.current + 1
    scanSequenceRef.current = requestSequence
    scanAbortRef.current?.abort()
    scanAbortRef.current = null
    setAnalysisLoading(true)
    setAnalysisError('')
    window.setTimeout(() => document.querySelector('#analysis')?.scrollIntoView({ behavior: 'smooth' }), 50)
    if (cachedAnalysis) {
      const replayedAnalysis = {
        ...cachedAnalysis,
        analysisId: globalThis.crypto?.randomUUID?.() || `${Date.now()}`,
        performance: { ...(cachedAnalysis.performance || {}), runtimeCache: 'browser-hit', serverMs: 0 },
      }
      setAnalysis(replayedAnalysis)
      setAnalysisLoading(false)
      notify(`${translator(locale)('analysisReady')} ${replayedAnalysis.location.name}`)
      return
    }

    const controller = new AbortController()
    scanAbortRef.current = controller
    try {
      const response = await fetch('/api/analysis/free', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestInput),
        signal: controller.signal,
      })
      const body = await response.json()
      if (!response.ok) {
        const requestError = new Error(body.error || 'Analysis request failed')
        requestError.code = body.code
        throw requestError
      }
      if (scanSequenceRef.current !== requestSequence) return
      if (body.dataQuality?.supplyAvailable) storeBrowserAnalysis(requestKey, body)
      setAnalysis(body)
      notify(`${translator(locale)('analysisReady')} ${body.location.name}`)
    } catch (error) {
      if (error.name === 'AbortError' || scanSequenceRef.current !== requestSequence) return
      setAnalysisError(
        error.code === 'MALAYSIA_ONLY'
          ? translator(locale)('malaysiaOnlyError')
          : `${error.message}. ${translator(locale)('runApi')}`,
      )
    } finally {
      if (scanSequenceRef.current === requestSequence) {
        setAnalysisLoading(false)
        scanAbortRef.current = null
      }
    }
  }

  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && setAuthMode(null)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      scanAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try {
      localStorage.setItem('launchbase-theme', theme)
    } catch {
      // Theme switching still works when storage is unavailable.
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f6f2' : '#141618')
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = locale === 'ms' ? 'ms' : 'en'
    try {
      localStorage.setItem('launchbase-locale', locale)
    } catch {
      // Language switching still works when storage is unavailable.
    }
  }, [locale])

  return (
    <>
      <Header
        openAuth={setAuthMode}
        theme={theme}
        toggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        locale={locale}
        toggleLocale={() => setLocale((current) => current === 'ms' ? 'en' : 'ms')}
      />
      <main>
        <Hero onSearch={search} theme={theme} locale={locale} />
        <AnalysisWorkspace analysis={analysis} loading={analysisLoading} error={analysisError} onScan={search} locale={locale} />
        <HowItWorks theme={theme} locale={locale} />
        <div className="px-5 py-8 lg:px-8">
          <AdSenseSlot slot={import.meta.env.VITE_GOOGLE_ADSENSE_SLOT_LANDING} locale={locale} />
        </div>
        <ContactSection locale={locale} notify={notify} />
      </main>
      <Footer locale={locale} />
      <AuthModal mode={authMode} close={() => setAuthMode(null)} notify={notify} locale={locale} />
      {toast && <div className="fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-foreground/10 bg-surface px-4 py-3 text-sm shadow-2xl"><Icon icon="solar:check-circle-bold" className="text-emerald-500" />{toast}</div>}
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
