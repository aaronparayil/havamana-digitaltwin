import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { cellColor, normalizedFor, NO_DATA } from '../styles/dataColors'
import './ForecastTerrain3D.css'

/* ==========================================================================
   ForecastTerrain3D — the Karnataka forecast grid as animated 3D terrain
   --------------------------------------------------------------------------
   Built on plain three.js rather than react-three-fiber: fiber 9.7 pins
   react <19.3 and drags in Expo/React-Native peers, neither of which this
   app wants. One bespoke visualisation does not need the declarative wrapper.

   Two encodings of the same forecast, deliberately different:
     · COLOUR is binned into the six named classes from the legend, so a
       reader can name what they see.
     · HEIGHT is continuous, so relief reads as smooth terrain instead of
       six flat plateaus.

   ---------------------------------------------------------------------------
   About the moving particles
   ---------------------------------------------------------------------------
   This project has NO wind data — the pipeline carries rainfall, tmax and
   tmin only, and the model forecasts nothing else. The streamlines here are
   therefore NOT wind. They are advected along the gradient of the predicted
   Tmax field, flowing from cooler cells toward warmer ones, which is the
   direction thermally driven surface flow actually takes (the sea breeze off
   the Konkan coast and the Ghats slope circulation are both this effect).

   It is a real, derived quantity computed from real predicted values — and
   the UI labels it "thermal gradient flow", never "wind". If genuine wind is
   ever needed, it has to come from a wind dataset such as ERA5 u10/v10.
   ========================================================================== */

const GRID = 32
const CELL = 1              // world units per grid cell
const MAX_HEIGHT = 9        // world units at full scale (vertical exaggeration)
const PARTICLE_COUNT = 1700
const PARTICLE_LIFE = 2.6   // seconds

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

/** Central difference gradient of the Tmax field, in grid units. */
function buildGradientField(tmax, mask) {
  const gx = new Float32Array(GRID * GRID)
  const gy = new Float32Array(GRID * GRID)
  if (!tmax) return { gx, gy }

  const at = (y, x) => {
    const yy = Math.max(0, Math.min(GRID - 1, y))
    const xx = Math.max(0, Math.min(GRID - 1, x))
    const v = tmax?.[yy]?.[xx]
    return typeof v === 'number' ? v : 0
  }

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x
      if (!mask?.[y]?.[x]) continue
      // Flow runs toward warmer air, so the vector points up-gradient.
      gx[i] = (at(y, x + 1) - at(y, x - 1)) * 0.5
      gy[i] = (at(y + 1, x) - at(y - 1, x)) * 0.5
    }
  }
  return { gx, gy }
}

export function ForecastTerrain3D({
  grid,
  tmaxGrid,
  landMask,
  variable,
  mode,
  cities = [],
  dateLabel,
}) {
  const mountRef = useRef(null)
  const stateRef = useRef(null)
  const [supported, setSupported] = useState(webglAvailable)
  const [flowOn, setFlowOn] = useState(true)

  // Latest props for the animation loop, without re-creating the scene.
  const dataRef = useRef({ grid, tmaxGrid, landMask, variable, mode, flowOn })
  dataRef.current = { grid, tmaxGrid, landMask, variable, mode, flowOn }

  /* ------------------------------------------------------------- set up -- */
  useEffect(() => {
    if (!supported || !mountRef.current) return
    const mount = mountRef.current

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x0a1117, 42, 105)

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300)
    camera.position.set(17, 21, 25)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x0a1117, 1)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 14
    controls.maxDistance = 64
    controls.maxPolarAngle = Math.PI * 0.48   // never go under the terrain
    controls.target.set(0, 1.2, 0)
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.45

    // Lighting: one key light for form, cool fill so shadowed faces stay in
    // the app's palette rather than going muddy grey.
    scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a1117, 1.15))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(18, 28, 14)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.5)
    rim.position.set(-20, 10, -18)
    scene.add(rim)

    /* ---------------------------------------------------- terrain cells -- */
    const cellGeo = new THREE.BoxGeometry(CELL * 0.94, 1, CELL * 0.94)
    const cellMat = new THREE.MeshStandardMaterial({
      roughness: 0.62,
      metalness: 0.05,
      vertexColors: false,
    })
    const cells = new THREE.InstancedMesh(cellGeo, cellMat, GRID * GRID)
    cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    cells.count = 0
    scene.add(cells)

    /* -------------------------------------------------------- base slab -- */
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(GRID * CELL + 1, 0.35, GRID * CELL + 1),
      new THREE.MeshStandardMaterial({ color: 0x111c26, roughness: 0.95, metalness: 0 })
    )
    base.position.y = -0.2
    scene.add(base)

    const gridHelper = new THREE.GridHelper(GRID * CELL, GRID, 0x223140, 0x1a2733)
    gridHelper.position.y = -0.01
    scene.add(gridHelper)

    /* --------------------------------------------------------- particles -- */
    const pGeo = new THREE.BufferGeometry()
    const pPos = new Float32Array(PARTICLE_COUNT * 3)
    const pAlpha = new Float32Array(PARTICLE_COUNT)
    const pAge = new Float32Array(PARTICLE_COUNT)
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1))

    const pMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0x7dd3fc) }, uSize: { value: 3.2 } },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        uniform float uSize;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (34.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        uniform vec3 uColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float f = smoothstep(0.5, 0.0, length(d));
          gl_FragColor = vec4(uColor, vAlpha * f);
        }`,
    })
    const points = new THREE.Points(pGeo, pMat)
    scene.add(points)

    /* ------------------------------------------------------- city pins --- */
    const pinGroup = new THREE.Group()
    scene.add(pinGroup)

    const st = {
      scene, camera, renderer, controls, cells, points, pGeo, pPos, pAlpha, pAge,
      pinGroup, cellGeo, cellMat, base, gridHelper, pMat,
      heights: new Float32Array(GRID * GRID),      // current (animated)
      targetH: new Float32Array(GRID * GRID),      // desired
      colors: new Array(GRID * GRID).fill(null).map(() => new THREE.Color(0x111c26)),
      targetC: new Array(GRID * GRID).fill(null).map(() => new THREE.Color(0x111c26)),
      gradient: { gx: new Float32Array(GRID * GRID), gy: new Float32Array(GRID * GRID) },
      raf: 0,
      clock: new THREE.Clock(),
    }
    stateRef.current = st

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pAge[i] = Math.random() * PARTICLE_LIFE
      pPos[i * 3] = (Math.random() - 0.5) * GRID * CELL
      pPos[i * 3 + 1] = 1 + Math.random() * 3
      pPos[i * 3 + 2] = (Math.random() - 0.5) * GRID * CELL
    }

    /* ------------------------------------------------------------ resize -- */
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

    // Pause the loop when the card is off-screen — a spinning WebGL scene in
    // a scrolled-past card is pure battery burn.
    let visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.05 })
    io.observe(mount)

    /* -------------------------------------------------------------- loop -- */
    const dummy = new THREE.Object3D()
    const half = (GRID - 1) / 2

    const sampleGrad = (wx, wz) => {
      // world -> grid indices
      const gxf = wx / CELL + half
      const gyf = half - wz / CELL
      const x0 = Math.floor(gxf)
      const y0 = Math.floor(gyf)
      if (x0 < 0 || y0 < 0 || x0 >= GRID - 1 || y0 >= GRID - 1) return null
      // Outside Karnataka there is no field to follow — retire the particle
      // rather than letting it stream out over the Arabian Sea.
      if (!dataRef.current.landMask?.[Math.round(gyf)]?.[Math.round(gxf)]) return null
      const tx = gxf - x0
      const ty = gyf - y0
      const { gx, gy } = st.gradient
      const i00 = y0 * GRID + x0
      const i10 = y0 * GRID + x0 + 1
      const i01 = (y0 + 1) * GRID + x0
      const i11 = (y0 + 1) * GRID + x0 + 1
      const lerp = (a, b, t) => a + (b - a) * t
      const vx = lerp(lerp(gx[i00], gx[i10], tx), lerp(gx[i01], gx[i11], tx), ty)
      const vy = lerp(lerp(gy[i00], gy[i10], tx), lerp(gy[i01], gy[i11], tx), ty)
      return { vx, vy }
    }

    const respawn = (i) => {
      // Seed inside the region so particles trace Karnataka, not the whole box.
      const mask = dataRef.current.landMask
      for (let tries = 0; tries < 12; tries++) {
        const gxr = Math.floor(Math.random() * GRID)
        const gyr = Math.floor(Math.random() * GRID)
        if (mask?.[gyr]?.[gxr]) {
          pPos[i * 3] = (gxr - half) * CELL + (Math.random() - 0.5) * CELL
          pPos[i * 3 + 2] = (half - gyr) * CELL + (Math.random() - 0.5) * CELL
          pPos[i * 3 + 1] = st.heights[gyr * GRID + gxr] + 0.5 + Math.random() * 2.2
          pAge[i] = 0
          return
        }
      }
      pAge[i] = PARTICLE_LIFE   // no land yet; keep it hidden
    }

    const animate = () => {
      st.raf = requestAnimationFrame(animate)
      if (!visible) return
      const dt = Math.min(st.clock.getDelta(), 0.05)

      // Ease heights and colours toward their targets so a lead-day change
      // reads as the terrain morphing, not as a hard cut.
      const mask = dataRef.current.landMask
      let n = 0
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const i = y * GRID + x
          if (!mask?.[y]?.[x]) continue
          st.heights[i] += (st.targetH[i] - st.heights[i]) * Math.min(1, dt * 5)
          st.colors[i].lerp(st.targetC[i], Math.min(1, dt * 5))
          const h = Math.max(0.06, st.heights[i])
          dummy.position.set((x - half) * CELL, h / 2, (half - y) * CELL)
          dummy.scale.set(1, h, 1)
          dummy.updateMatrix()
          cells.setMatrixAt(n, dummy.matrix)
          cells.setColorAt(n, st.colors[i])
          n++
        }
      }
      cells.count = n
      cells.instanceMatrix.needsUpdate = true
      if (cells.instanceColor) cells.instanceColor.needsUpdate = true

      // Advect particles along the thermal gradient.
      if (dataRef.current.flowOn) {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          pAge[i] += dt
          if (pAge[i] >= PARTICLE_LIFE) { respawn(i); continue }
          const wx = pPos[i * 3]
          const wz = pPos[i * 3 + 2]
          const g = sampleGrad(wx, wz)
          if (!g) { pAge[i] = PARTICLE_LIFE; continue }
          const speed = 2.6
          pPos[i * 3] += g.vx * speed * dt
          pPos[i * 3 + 2] += -g.vy * speed * dt    // +grid-y is north, which is -Z
          pPos[i * 3 + 1] += Math.sin(pAge[i] * 2.0 + i) * 0.12 * dt
          // Fade in and out so streaks have soft ends.
          const t = pAge[i] / PARTICLE_LIFE
          pAlpha[i] = Math.sin(Math.PI * t) * 0.95
        }
        pGeo.attributes.position.needsUpdate = true
        pGeo.attributes.aAlpha.needsUpdate = true
        points.visible = true
      } else {
        points.visible = false
      }

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    /* ----------------------------------------------------------- cleanup -- */
    return () => {
      cancelAnimationFrame(st.raf)
      ro.disconnect()
      io.disconnect()
      controls.dispose()
      cellGeo.dispose()
      cellMat.dispose()
      pGeo.dispose()
      pMat.dispose()
      base.geometry.dispose()
      base.material.dispose()
      gridHelper.geometry.dispose()
      gridHelper.material.dispose()
      pinGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
      renderer.dispose()
      // dispose() frees three's objects but not the GL context itself.
      renderer.forceContextLoss?.()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      stateRef.current = null
    }
  }, [supported])

  /* --------------------------------------------- push data into the scene */
  useEffect(() => {
    const st = stateRef.current
    if (!st) return

    st.gradient = buildGradientField(tmaxGrid, landMask)

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x
        const inRegion = Boolean(landMask?.[y]?.[x])
        if (!inRegion) {
          st.targetH[i] = 0
          st.targetC[i].set(NO_DATA)
          continue
        }
        const v = grid?.[y]?.[x]
        st.targetH[i] = normalizedFor(v, variable, mode) * MAX_HEIGHT + 0.12
        st.targetC[i].set(cellColor(v, variable, mode, true))
      }
    }
  }, [grid, tmaxGrid, landMask, variable, mode])

  /* ------------------------------------------------------------ city pins */
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const { pinGroup } = st
    pinGroup.clear()
    const half = (GRID - 1) / 2
    const pinGeo = new THREE.SphereGeometry(0.28, 12, 12)
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xf0b429 })
    cities.forEach((c) => {
      if (!landMask?.[c.y]?.[c.x]) return
      const m = new THREE.Mesh(pinGeo, pinMat)
      const h = st.targetH[c.y * GRID + c.x] ?? 1
      m.position.set((c.x - half) * CELL, h + 0.55, (half - c.y) * CELL)
      pinGroup.add(m)
    })
  }, [cities, landMask, grid, variable, mode])

  if (!supported) {
    return (
      <div className="terrain3d-fallback">
        <strong>3D view unavailable</strong>
        <span>
          No WebGL context available. The 2D grid shows exactly the same forecast.
        </span>
        <button className="preset-btn" onClick={() => setSupported(webglAvailable(true))}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="terrain3d-wrap">
      <div className="terrain3d-canvas" ref={mountRef} />

      <div className="terrain3d-hint">drag to orbit · scroll to zoom</div>

      {dateLabel && <div className="terrain3d-date">{dateLabel}</div>}

      {/* The flow is a derived quantity, not an observation. The caption says
          so on the face of the visualisation, not in a tooltip nobody opens. */}
      <div className="terrain3d-flow-note">
        <button
          className={`flow-toggle ${flowOn ? 'is-on' : ''}`}
          onClick={() => setFlowOn((v) => !v)}
          aria-pressed={flowOn}
        >
          <span className="flow-dot" />
          Thermal gradient flow
        </button>
        <small>derived from predicted Tmax — not measured wind</small>
      </div>
    </div>
  )
}
