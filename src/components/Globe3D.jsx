import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { feature } from 'topojson-client'
import worldTopo from '../assets/geo/countries-110m.json'
import { aqiBand } from '../hooks/useLiveConditions'
import { LAYERS, VIEWS } from './globeLayers'
import './Globe3D.css'

/* ==========================================================================
   Globe3D — the Earth, parked on India, painted with live conditions
   --------------------------------------------------------------------------
   Plain three.js (same reasoning as ForecastTerrain3D: fiber pins react
   <19.3 and drags in Expo peers).

   What is real here
   -----------------
   Coastlines and borders come from Natural Earth via world-atlas, vendored
   into the repo so a demo works offline. Wind, temperature and air quality
   are LIVE from Open-Meteo, sampled on a coarse global lattice with a denser
   inset over India, and bilinearly interpolated. The overlay fades out toward
   the poles, where the lattice stops.

   None of it is HavaMana's ConvLSTM output. That model is Karnataka-only and
   forecasts no wind or AQI whatsoever.
   ========================================================================== */

const R = 2                       // globe radius in world units
const PARTICLES = 1800
const PARTICLE_LIFE = 7.0         // seconds

/* Streamlines, not sprites. Each particle keeps the last TRAIL positions it
   occupied and the whole path is drawn, so you can trace where the air is
   going — the Windy/nullschool read.

   Length is the whole point. TRAIL points sampled every TRAIL_EVERY frames
   covers (TRAIL-1)*TRAIL_EVERY/60 seconds of travel: 28 points every 3 frames
   is ~1.35s, which at these wind speeds draws a 23-70px line. The earlier
   6-point, every-frame version covered 0.02 degrees — about 5px — which is why
   it read as speckle rather than flow.

   Positions live in a per-particle ring buffer so advancing the trail is an
   index bump, not a 134k-element memmove every third frame. */
const TRAIL = 22
const TRAIL_EVERY = 3


const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const TEX_W = 512
const TEX_H = 256

/* WebGL support probe.
 *
 * Two things here are load-bearing:
 *
 *  1. The probe RELEASES its context. Browsers cap live WebGL contexts (~16),
 *     and a probe that leaks one on every mount will eventually make a later,
 *     genuine request return null — which looks identical to "this machine has
 *     no WebGL" while the machine is perfectly capable.
 *  2. The result is cached per page load, so repeated mounts cost nothing.
 *     `force` re-probes, which is what the retry button uses after contexts
 *     have been freed.
 */
let webglSupport = null

function webglAvailable(force = false) {
  if (!force && webglSupport !== null) return webglSupport
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (gl) {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      webglSupport = true
    } else {
      webglSupport = false
    }
  } catch {
    webglSupport = false
  }
  return webglSupport
}

/** Geographic coordinates to a point on the sphere. */
function latLonToVec3(lat, lon, radius, out = new THREE.Vector3()) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rampColor(ramp, t) {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = hexToRgb(ramp[i])
  const b = hexToRgb(ramp[Math.min(ramp.length - 1, i + 1)])
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}


/**
 * Blend weight for the dense India inset: 1 in the middle of the lattice,
 * easing to 0 at its edges. The globe samples the global field everywhere and
 * lerps toward the inset by this weight, so the extra detail over the
 * subcontinent appears with no visible seam or rectangle.
 */
function edgeFalloff(lat, lon, g) {
  if (!g) return 0
  const ty = (lat - g.lats[0]) / (g.lats[g.ny - 1] - g.lats[0])
  const tx = (lon - g.lons[0]) / (g.lons[g.nx - 1] - g.lons[0])
  if (ty < 0 || ty > 1 || tx < 0 || tx > 1) return 0
  // sin() gives a soft shoulder; the exponent keeps the middle near full
  // strength so only the outer margin actually fades.
  const fy = Math.pow(Math.sin(Math.PI * ty), 0.45)
  const fx = Math.pow(Math.sin(Math.PI * tx), 0.45)
  return fx * fy
}

/** Builds LineSegments for every country ring, projected onto the sphere. */
function buildBorders(radius, color, opacity) {
  const fc = feature(worldTopo, worldTopo.objects.countries)
  const pts = []
  const v = new THREE.Vector3()

  const addRing = (ring) => {
    for (let i = 0; i < ring.length - 1; i++) {
      latLonToVec3(ring[i][1], ring[i][0], radius, v)
      pts.push(v.x, v.y, v.z)
      latLonToVec3(ring[i + 1][1], ring[i + 1][0], radius, v)
      pts.push(v.x, v.y, v.z)
    }
  }

  fc.features.forEach((f) => {
    const g = f.geometry
    if (!g) return
    if (g.type === 'Polygon') g.coordinates.forEach(addRing)
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly) => poly.forEach(addRing))
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  return new THREE.LineSegments(geo, mat)
}

/** Lat/lon graticule every 15 degrees — reads as an instrument, not decoration. */
function buildGraticule(radius, color, opacity) {
  const pts = []
  const v = new THREE.Vector3()
  const push = (lat, lon) => {
    latLonToVec3(lat, lon, radius, v)
    pts.push(v.x, v.y, v.z)
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = -180; lon < 180; lon += 4) {
      push(lat, lon)
      push(lat, lon + 4)
    }
  }
  for (let lon = -180; lon < 180; lon += 15) {
    for (let lat = -88; lat < 88; lat += 4) {
      push(lat, lon)
      push(lat + 4, lon)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  )
}

const fmt = (v, d = 0, suffix = '') =>
  typeof v === 'number' && !Number.isNaN(v) ? `${v.toFixed(d)}${suffix}` : '—'

/** Live readings for the city under the pointer. Flips to the other side of
 *  the pointer near the right and bottom edges so it never clips. */
function CityTooltip({ hover }) {
  const { city, x, y, w, h } = hover
  const band = aqiBand(city.aqi)
  const flipX = x > w * 0.65
  const style = {
    left: x,
    top: y,
    transform: `translate(${flipX ? 'calc(-100% - 14px)' : '14px'}, ${y > h * 0.6 ? 'calc(-100% - 10px)' : '10px'})`,
  }
  return (
    <div className="globe-tooltip" style={style} role="status">
      <div className="globe-tooltip-head">
        <strong>{city.name}</strong>
        {city.state && <span>{city.state}</span>}
      </div>
      <dl>
        <dt>Temp</dt><dd>{fmt(city.temp, 1, '°C')}</dd>
        <dt>Humidity</dt><dd>{fmt(city.humidity, 0, '%')}</dd>
        <dt>Wind</dt><dd>{fmt(city.windSpeed, 1, ' km/h')}</dd>
        <dt>PM2.5</dt><dd>{fmt(city.pm25, 1, ' µg/m³')}</dd>
      </dl>
      <div className="globe-tooltip-aqi" style={{ '--band': band.color }}>
        <i /> AQI <strong>{city.aqi ?? '—'}</strong> · {band.label}
      </div>
    </div>
  )
}

export function Globe3D({
  grid,
  globalGrid,
  cities = [],
  layer = 'wind',
  observedAt,
  onDrillToModel,
}) {
  const mountRef = useRef(null)
  const stRef = useRef(null)
  const [supported, setSupported] = useState(webglAvailable)
  const [flowOn, setFlowOn] = useState(true)
  const [view, setView] = useState('world')
  const [flying, setFlying] = useState(false)
  // City under the pointer, with its position inside the globe box.
  const [hover, setHover] = useState(null)

  const propsRef = useRef({ grid, globalGrid, layer, flowOn })
  propsRef.current = { grid, globalGrid, layer, flowOn }

  /* -------------------------------------------------------------- setup -- */
  useEffect(() => {
    if (!supported || !mountRef.current) return
    const mount = mountRef.current

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x0a1117, 1)
    mount.appendChild(renderer.domElement)

    // Park the camera over central India rather than the prime meridian.
    const home = latLonToVec3(21, 80, R * 3.1)
    camera.position.copy(home)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.minDistance = R * 1.35
    controls.maxDistance = R * 6
    controls.enablePan = false
    controls.rotateSpeed = 0.45

    /* Idle spin. Honours prefers-reduced-motion, stops the moment the user
       grabs the globe, and resumes a couple of seconds after they let go so
       it never fights them mid-drag. */
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    controls.autoRotate = !reduceMotion
    controls.autoRotateSpeed = 0.5

    /* Camera flights between stops. Spherical coordinates are interpolated
       rather than world-space positions, so the camera arcs around the globe
       instead of cutting a chord through it. */
    const sphFrom = new THREE.Spherical()
    const sphTo = new THREE.Spherical()
    let flight = null

    const flyTo = (target, onArrive) => {
      const dest = latLonToVec3(target.lat, target.lon, R * target.dist, new THREE.Vector3())
      sphFrom.setFromVector3(camera.position)
      sphTo.setFromVector3(dest)
      // Take the short way round rather than unwinding the long way.
      let dTheta = sphTo.theta - sphFrom.theta
      while (dTheta > Math.PI) dTheta -= Math.PI * 2
      while (dTheta < -Math.PI) dTheta += Math.PI * 2
      flight = {
        start: performance.now(),
        dur: 1500,
        fromR: sphFrom.radius, toR: sphTo.radius,
        fromPhi: sphFrom.phi, toPhi: sphTo.phi,
        fromTheta: sphFrom.theta, dTheta,
        onArrive,
      }
      controls.autoRotate = false
      controls.enabled = false
    }

    let resumeTimer = 0
    const holdSpin = () => {
      controls.autoRotate = false
      clearTimeout(resumeTimer)
    }
    const releaseSpin = () => {
      clearTimeout(resumeTimer)
      if (reduceMotion) return
      // Only the world view resumes spinning; a focused region should stay put.
      resumeTimer = setTimeout(() => {
        if (st.spinAllowed) controls.autoRotate = true
      }, 2500)
    }
    controls.addEventListener('start', holdSpin)
    controls.addEventListener('end', releaseSpin)

    scene.add(new THREE.AmbientLight(0xffffff, 1.25))
    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(5, 3, 5)
    scene.add(sun)

    /* ---------------------------------------------------------- the globe */
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 44),
      new THREE.MeshStandardMaterial({ color: 0x1b2f42, roughness: 0.9, metalness: 0.02 })
    )
    scene.add(sphere)

    // Live data is painted on a second, very slightly larger shell so it never
    // z-fights with the base sphere.
    const dataCanvas = document.createElement('canvas')
    dataCanvas.width = TEX_W
    dataCanvas.height = TEX_H
    const dataCtx = dataCanvas.getContext('2d', { willReadFrequently: true })
    const dataTex = new THREE.CanvasTexture(dataCanvas)
    dataTex.colorSpace = THREE.SRGBColorSpace
    const dataShell = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.003, 64, 44),
      new THREE.MeshBasicMaterial({ map: dataTex, transparent: true, opacity: 0.72, depthWrite: false })
    )
    scene.add(dataShell)

    const borders = buildBorders(R * 1.008, 0xcfe4f2, 0.85)
    scene.add(borders)
    const graticule = buildGraticule(R * 1.001, 0x2f4356, 0.45)
    scene.add(graticule)

    // Atmosphere: back-face rim glow, the cheap trick that sells a globe.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.14, 48, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(0x38bdf8) } },
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vNormal;
          uniform vec3 uColor;
          void main() {
            float i = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
            gl_FragColor = vec4(uColor, 1.0) * clamp(i, 0.0, 1.0) * 0.9;
          }`,
      })
    )
    scene.add(atmosphere)

    /* -------------------------------------------------------- wind streams */
    const pLat = new Float32Array(PARTICLES)
    const pLon = new Float32Array(PARTICLES)
    const pAge = new Float32Array(PARTICLES)
    const trail = new Float32Array(PARTICLES * TRAIL * 3)   // ring buffer, xyz
    let head = 0                                            // newest slot index

    const SEGS = TRAIL - 1
    const segPos = new Float32Array(PARTICLES * SEGS * 2 * 3)
    const segAlpha = new Float32Array(PARTICLES * SEGS * 2)

    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(segPos, 3))
    pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(segAlpha, 1))

    const pMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0xe8faff) } },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vAlpha;
        uniform vec3 uColor;
        void main() { gl_FragColor = vec4(uColor, vAlpha); }`,
    })
    const points = new THREE.LineSegments(pGeo, pMat)
    // Geometry is rewritten every frame; the bounding sphere computed from its
    // initial (all-zero) contents must not be used for culling.
    points.frustumCulled = false
    scene.add(points)

    const cityGroup = new THREE.Group()
    scene.add(cityGroup)

    const st = {
      scene, camera, renderer, controls, sphere, dataShell, dataTex, dataCanvas, dataCtx,
      borders, graticule, atmosphere, points, pGeo, pMat, pLat, pLon, pAge, trail,
      cityGroup, raf: 0, clock: new THREE.Clock(), needsPaint: true, spinAllowed: true,
      active: PARTICLES,
    }
    stRef.current = st

    // Imperative handles used by the view-change effect.
    st.flyTo = flyTo
    st.setSpin = (on) => {
      st.spinAllowed = on
      controls.autoRotate = on && !reduceMotion
    }

    const tmpV = new THREE.Vector3()

    /* -------------------------------------------------------- city hover
       Each city carries an invisible, larger hit sphere so a 20px target is
       easy to land on. The globe itself is in the raycast too: a city on the
       far side is hidden behind the sphere, so it can never be hovered. */
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let hovered = null

    const setHovered = (mesh) => {
      if (hovered === mesh) return
      if (hovered) hovered.userData.dot?.scale.setScalar(1)
      hovered = mesh
      if (mesh) mesh.userData.dot?.scale.setScalar(1.7)
      // Hold the idle spin while a city is inspected, so it doesn't slide
      // out from under the pointer.
      controls.autoRotate = !mesh && st.spinAllowed && !reduceMotion
      renderer.domElement.style.cursor = mesh ? 'pointer' : ''
    }

    const onPointerMove = (e) => {
      if (flight) return
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const targets = [sphere, ...cityGroup.children.filter((o) => o.userData.city)]
      const hit = raycaster.intersectObjects(targets, false)[0]
      const mesh = hit?.object.userData.city ? hit.object : null
      setHovered(mesh)
      setHover(mesh ? { city: mesh.userData.city, x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height } : null)
    }
    const onPointerLeave = () => {
      setHovered(null)
      setHover(null)
    }
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)

    /* ------------------------------------------------------ grid sampling */
    /** Bilinear lookup in one lattice. `wrap` handles the antimeridian. */
    const sampleGrid = (g, lat, lon, field) => {
      if (!g) return null
      const { lats, lons, nx, ny } = g
      if (lat < lats[0] || lat > lats[ny - 1]) return null
      const fy = ((lat - lats[0]) / (lats[ny - 1] - lats[0])) * (ny - 1)
      const y0 = Math.min(ny - 2, Math.max(0, Math.floor(fy)))
      const ty = fy - y0

      let x0
      let x1
      let tx
      if (g.wrap) {
        const step = 360 / nx
        const fx = (((lon - lons[0]) % 360) + 360) % 360 / step
        x0 = Math.floor(fx) % nx
        x1 = (x0 + 1) % nx
        tx = fx - Math.floor(fx)
      } else {
        if (lon < lons[0] || lon > lons[nx - 1]) return null
        const fx = ((lon - lons[0]) / (lons[nx - 1] - lons[0])) * (nx - 1)
        x0 = Math.min(nx - 2, Math.max(0, Math.floor(fx)))
        x1 = x0 + 1
        tx = fx - x0
      }

      const arr = g[field]
      const l = (a, b, t) => a + (b - a) * t
      const top = l(arr[y0 * nx + x0], arr[y0 * nx + x1], tx)
      const bot = l(arr[(y0 + 1) * nx + x0], arr[(y0 + 1) * nx + x1], tx)
      return l(top, bot, ty)
    }

    /** Global field, with the dense India inset blended in where available. */
    const sample = (lat, lon, field) => {
      const { globalGrid, grid } = propsRef.current
      const base = sampleGrid(globalGrid, lat, lon, field)
      const fine = sampleGrid(grid, lat, lon, field)
      if (fine === null || Number.isNaN(fine)) return base
      if (base === null || Number.isNaN(base)) return fine
      const w = edgeFalloff(lat, lon, grid)
      return base + (fine - base) * w
    }

    st.sample = sample

    /** Fills a particle's whole ring with one point, so a freshly seeded
     *  streamline doesn't draw a line from wherever the old one died. */
    const seedTrail = (i, x, y, z) => {
      const base = i * TRAIL * 3
      for (let k = 0; k < TRAIL; k++) {
        trail[base + k * 3] = x
        trail[base + k * 3 + 1] = y
        trail[base + k * 3 + 2] = z
      }
    }

    const respawn = (i) => {
      const g = propsRef.current.globalGrid
      if (!g) { pAge[i] = PARTICLE_LIFE; return }
      // cos-weighted latitude keeps density even on the sphere instead of
      // bunching up at the poles.
      const u0 = Math.random() * 2 - 1
      pLat[i] = Math.max(g.lats[0], Math.min(g.lats[g.ny - 1], (Math.asin(u0) * 180) / Math.PI))
      pLon[i] = -180 + Math.random() * 360
      // Stagger ages so streamlines don't all appear and vanish together.
      pAge[i] = Math.random() * PARTICLE_LIFE * 0.9
      latLonToVec3(pLat[i], pLon[i], R * 1.012, tmpV)
      seedTrail(i, tmpV.x, tmpV.y, tmpV.z)
    }

    for (let i = 0; i < PARTICLES; i++) respawn(i)

    /* ------------------------------------------------------ paint overlay */
    const paint = () => {
      const g = propsRef.current.grid
      const cfg = LAYERS[propsRef.current.layer] ?? LAYERS.wind
      dataCtx.clearRect(0, 0, TEX_W, TEX_H)
      if (!g && !propsRef.current.globalGrid) { dataTex.needsUpdate = true; return }

      const [d0, d1] = cfg.domain
      const img = dataCtx.createImageData(TEX_W, TEX_H)
      for (let py = 0; py < TEX_H; py++) {
        const lat = 90 - (py / (TEX_H - 1)) * 180
        for (let px = 0; px < TEX_W; px++) {
          const lon = -180 + (px / (TEX_W - 1)) * 360
          const val = sample(lat, lon, cfg.field)
          const o = (py * TEX_W + px) * 4
          if (val === null || Number.isNaN(val)) { img.data[o + 3] = 0; continue }
          const [r, gg, b] = rampColor(cfg.ramp, (val - d0) / (d1 - d0))
          img.data[o] = r
          img.data[o + 1] = gg
          img.data[o + 2] = b
          // Fade toward the lattice's latitude limits so the poles dissolve
          // rather than ending on a visible rim.
          const gg2 = propsRef.current.globalGrid
          let a = 215
          if (gg2) {
            const top = gg2.lats[gg2.ny - 1]
            const bot = gg2.lats[0]
            const m = 14
            const fade = Math.min((top - lat) / m, (lat - bot) / m, 1)
            a *= Math.max(0, Math.min(1, fade))
          }
          img.data[o + 3] = a
        }
      }
      dataCtx.putImageData(img, 0, 0)
      dataTex.needsUpdate = true
    }
    st.paint = paint

    /* -------------------------------------------------------------- loop */
    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      // Resizing clears the drawing buffer, so repaint immediately rather
      // than waiting for a frame that may be throttled or paused.
      renderer.render(scene, camera)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(mount)
    resize()

    let visible = true
    const io = new IntersectionObserver(
      ([e]) => { visible = e.isIntersecting || e.intersectionRatio > 0 },
      { threshold: 0 }
    )
    io.observe(mount)

    const tmp = new THREE.Vector3()

    const animate = () => {
      st.raf = requestAnimationFrame(animate)
      if (!visible) return
      const dt = Math.min(st.clock.getDelta(), 0.05)

      if (st.needsPaint) { paint(); st.needsPaint = false }

      // Rolling frame-time check, sampled cheaply once per second.
      st.frameAcc = (st.frameAcc || 0) + dt
      st.frameN = (st.frameN || 0) + 1
      if (st.frameAcc >= 1) {
        const avg = st.frameAcc / st.frameN
        if (avg > 1 / 30 && st.active > 350) st.active = Math.max(350, Math.round(st.active * 0.6))
        else if (avg < 1 / 55 && st.active < PARTICLES) st.active = Math.min(PARTICLES, Math.round(st.active * 1.2))
        st.frameAcc = 0
        st.frameN = 0
      }

      if (propsRef.current.flowOn && propsRef.current.globalGrid) {
        st.tick = (st.tick || 0) + 1
        // Advance the ring only every TRAIL_EVERY frames; the head slot is
        // rewritten every frame so motion stays smooth between advances.
        if (st.tick % TRAIL_EVERY === 0) head = (head + 1) % TRAIL

        const hideStreak = (i) => {
          for (let k = 0; k < SEGS; k++) {
            segAlpha[(i * SEGS + k) * 2] = 0
            segAlpha[(i * SEGS + k) * 2 + 1] = 0
          }
        }

        for (let i = 0; i < st.active; i++) {
          pAge[i] += dt
          if (pAge[i] >= PARTICLE_LIFE) { respawn(i); hideStreak(i); continue }

          const u = sample(pLat[i], pLon[i], 'u')
          const v = sample(pLat[i], pLon[i], 'v')
          if (u === null || v === null) { pAge[i] = PARTICLE_LIFE; hideStreak(i); continue }

          // m/s -> degrees per second. Longitude degrees shrink with latitude,
          // so divide by cos(lat) or streaks crawl near the equator and race
          // near the poles.
          const cosLat = Math.max(0.2, Math.cos((pLat[i] * Math.PI) / 180))
          const scale = 1.3
          pLon[i] += (u / cosLat) * scale * dt
          pLat[i] += v * scale * dt

          let wrapped = false
          if (pLon[i] > 180) { pLon[i] -= 360; wrapped = true }
          else if (pLon[i] < -180) { pLon[i] += 360; wrapped = true }

          latLonToVec3(pLat[i], pLon[i], R * 1.012, tmp)
          const base = i * TRAIL * 3

          if (wrapped) {
            // Crossing the antimeridian would otherwise draw a line straight
            // across the planet.
            seedTrail(i, tmp.x, tmp.y, tmp.z)
          } else {
            trail[base + head * 3] = tmp.x
            trail[base + head * 3 + 1] = tmp.y
            trail[base + head * 3 + 2] = tmp.z
          }

          // Walk the ring newest -> oldest, emitting one segment per step.
          // Alpha fades along the tail so each line has a bright head that
          // dissolves behind it, and fades in/out over the particle's life.
          const life = Math.sin((Math.PI * pAge[i]) / PARTICLE_LIFE)
          for (let k = 0; k < SEGS; k++) {
            const a0 = ((head - k) % TRAIL + TRAIL) % TRAIL
            const a1 = ((head - k - 1) % TRAIL + TRAIL) % TRAIL
            const o = (i * SEGS + k) * 6
            const a = (i * SEGS + k) * 2
            segPos[o] = trail[base + a0 * 3]
            segPos[o + 1] = trail[base + a0 * 3 + 1]
            segPos[o + 2] = trail[base + a0 * 3 + 2]
            segPos[o + 3] = trail[base + a1 * 3]
            segPos[o + 4] = trail[base + a1 * 3 + 1]
            segPos[o + 5] = trail[base + a1 * 3 + 2]
            segAlpha[a] = life * (1 - k / SEGS)
            segAlpha[a + 1] = life * (1 - (k + 1) / SEGS)
          }
        }
        // Only upload and draw the streamlines we actually simulated.
        pGeo.setDrawRange(0, st.active * SEGS * 2)
        pGeo.attributes.position.needsUpdate = true
        pGeo.attributes.aAlpha.needsUpdate = true
        points.visible = true
      } else {
        points.visible = false
      }

      if (flight) {
        const t = Math.min(1, (performance.now() - flight.start) / flight.dur)
        const e = easeInOut(t)
        const sph = new THREE.Spherical(
          flight.fromR + (flight.toR - flight.fromR) * e,
          flight.fromPhi + (flight.toPhi - flight.fromPhi) * e,
          flight.fromTheta + flight.dTheta * e
        )
        camera.position.setFromSpherical(sph)
        camera.lookAt(0, 0, 0)
        if (t >= 1) {
          const done = flight.onArrive
          flight = null
          controls.enabled = true
          done?.()
        }
      }

      if (!flight) controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(st.raf)
      ro.disconnect()
      io.disconnect()
      clearTimeout(resumeTimer)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      controls.removeEventListener('start', holdSpin)
      controls.removeEventListener('end', releaseSpin)
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          if (o.material.map) o.material.map.dispose()
          o.material.dispose()
        }
      })
      renderer.dispose()
      // dispose() frees three's objects but not the GL context itself.
      renderer.forceContextLoss?.()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      stRef.current = null
    }
  }, [supported])

  /* Fly whenever the chosen view changes. Auto-rotate only makes sense at the
     world view; once you're focused on a region, spinning would drift off it. */
  useEffect(() => {
    const st = stRef.current
    if (!st?.flyTo) return
    setFlying(true)
    st.flyTo(VIEWS[view], () => {
      setFlying(false)
      st.setSpin(view === 'world')
    })
  }, [view])

  /* Repaint the overlay whenever the data or the chosen layer changes. */
  useEffect(() => {
    const st = stRef.current
    if (st) st.needsPaint = true
  }, [grid, globalGrid, layer])

  /* City markers, coloured by live AQI band. */
  useEffect(() => {
    const st = stRef.current
    if (!st) return
    st.cityGroup.clear()
    const dotGeo = new THREE.SphereGeometry(0.022, 10, 10)
    const haloGeo = new THREE.SphereGeometry(0.045, 10, 10)
    const hitGeo = new THREE.SphereGeometry(0.07, 8, 8)
    const hitMat = new THREE.MeshBasicMaterial({ visible: false })
    cities.forEach((c) => {
      const band = aqiBand(c.aqi)
      const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: band.color }))
      latLonToVec3(c.lat, c.lon, R * 1.02, m.position)
      st.cityGroup.add(m)

      const halo = new THREE.Mesh(
        haloGeo,
        new THREE.MeshBasicMaterial({ color: band.color, transparent: true, opacity: 0.22 })
      )
      halo.position.copy(m.position)
      st.cityGroup.add(halo)

      const hit = new THREE.Mesh(hitGeo, hitMat)
      hit.position.copy(m.position)
      hit.userData = { city: c, dot: m }
      st.cityGroup.add(hit)
    })
  }, [cities])

  if (!supported) {
    return (
      <div className="globe-fallback">
        <strong>3D globe unavailable</strong>
        <span>
          The browser would not give this page a WebGL context. That usually means
          hardware acceleration is off, or too many 3D views were opened in this tab
          and the context limit was hit — a reload clears those.
        </span>
        <button className="preset-btn" onClick={() => setSupported(webglAvailable(true))}>
          Try again
        </button>
        <span className="globe-fallback-hint">
          Still failing? Check <code>chrome://gpu</code>, or enable
          &ldquo;Use graphics acceleration when available&rdquo; in Chrome settings.
        </span>
        <span className="globe-fallback-hint">
          The live readings below do not need WebGL and are unaffected.
        </span>
      </div>
    )
  }

  return (
    <div className="globe-wrap">
      <div className="globe-canvas" ref={mountRef} />

      <div className="globe-controls">
        <button
          className={`flow-toggle ${flowOn ? 'is-on' : ''}`}
          onClick={() => setFlowOn((v) => !v)}
          aria-pressed={flowOn}
        >
          <span className="flow-dot" /> Wind streams
        </button>
      </div>

      {/* Zoom path: world -> India -> Karnataka, where Karnataka is the
          model's own domain and hands off to the forecast page. */}
      <div className="globe-nav" role="group" aria-label="Camera view" data-tour="globe-nav">
        {['world', 'india'].map((k) => (
          <button
            key={k}
            className={`globe-nav-btn ${view === k ? 'active' : ''}`}
            onClick={() => setView(k)}
            disabled={flying}
          >
            {VIEWS[k].label}
          </button>
        ))}
        <button
          className={`globe-nav-btn is-drill ${view === 'karnataka' ? 'active' : ''}`}
          onClick={() => {
            if (view === 'karnataka') { onDrillToModel?.(); return }
            setView('karnataka')
          }}
          disabled={flying}
          title="Zoom to the ConvLSTM model's domain"
        >
          Karnataka
          {view === 'karnataka' && <span className="drill-arrow">open model →</span>}
        </button>
      </div>

      {/* Provenance, on the face of the visualisation. The globe shows live
          third-party data, not this project's model. */}
      <div className="globe-source">
        <span>Live · Open-Meteo</span>
        {observedAt && <span className="globe-time">{observedAt.replace('T', ' ')} UTC</span>}
        <small>observed conditions — not ConvLSTM output</small>
      </div>

      {hover && <CityTooltip hover={hover} />}

      <div className="globe-hint">drag to rotate · scroll to zoom · hover a city</div>
    </div>
  )
}
