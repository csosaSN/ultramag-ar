// Ultra-Mag pallet: WebAR world-tracking test (8th Wall engine binary + three.js)
import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'

window.THREE = THREE  // XR8.Threejs reads THREE from window

const MODEL_URL = 'pallet.glb'
const START_DISTANCE = 2.6   // metres in front of the camera for the first placement
const status = (t) => { const el = document.getElementById('status'); if (el) el.textContent = t }

// Soft contact shadow under the pallet (the model is unlit/baked, so it casts no real-time shadow)
const makeShadow = () => {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(128, 128, 30, 128, 128, 128)
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.65),
    new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false}))
  m.rotation.x = -Math.PI / 2; m.position.y = 0.003; m.renderOrder = -1
  return m
}

const palletModule = () => {
  let root = null, placed = false
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hit = new THREE.Vector3()

  const faceCamera = (camera) => {
    // Turn the pallet so a corner faces the viewer (3/4 view) like the landing page preview
    const dx = camera.position.x - root.position.x, dz = camera.position.z - root.position.z
    root.rotation.y = Math.atan2(dx, dz) - 0.7
  }
  const placeAt = (x, z, camera) => { root.position.set(x, 0, z); faceCamera(camera); root.visible = true; placed = true }

  return {
    name: 'ultramag-pallet',
    onStart: ({canvas}) => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()
      renderer.outputColorSpace = THREE.SRGBColorSpace
      scene.add(new THREE.AmbientLight(0xffffff, 1))

      // Absolute scale: world units are metres and y = 0 is the floor. Start the camera at eye height.
      camera.position.set(0, 1.5, 0)
      XR8.XrController.updateCameraProjectionMatrix({origin: camera.position, facing: camera.quaternion})

      root = new THREE.Group(); root.visible = false; scene.add(root)
      root.add(makeShadow())
      status('Loading pallet…')
      new GLTFLoader().load(MODEL_URL, (gltf) => {
        root.add(gltf.scene)
        status('Point at the floor. Tap to move · Twist with two fingers to rotate')
        // First placement: on the floor straight ahead of the camera
        const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1)
        dir.normalize().multiplyScalar(START_DISTANCE)
        placeAt(camera.position.x + dir.x, camera.position.z + dir.z, camera)
      }, (e) => { if (e.total) status(`Loading pallet… ${Math.round(100 * e.loaded / e.total)}%`) },
      () => status('Could not load the pallet model.'))

      // Gestures: one-finger tap = move to that spot on the floor; two-finger twist = rotate
      let tapStart = null, twist = null
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) tapStart = {x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now()}
        if (e.touches.length === 2 && root) {
          const [a, b] = e.touches
          twist = {angle: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX), start: root.rotation.y}
          tapStart = null
        }
      }, {passive: true})
      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault()
        if (twist && e.touches.length === 2) {
          const [a, b] = e.touches
          const ang = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX)
          root.rotation.y = twist.start - (ang - twist.angle)
        }
      }, {passive: false})
      canvas.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) twist = null
        if (!tapStart || !root || !root.children.length) return
        const t = e.changedTouches[0]
        const moved = Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y)
        if (moved < 12 && performance.now() - tapStart.t < 400) {
          ndc.set((t.clientX / window.innerWidth) * 2 - 1, -(t.clientY / window.innerHeight) * 2 + 1)
          ray.setFromCamera(ndc, camera)
          if (ray.ray.intersectPlane(ground, hit)) {
            const d = Math.hypot(hit.x - camera.position.x, hit.z - camera.position.z)
            if (d < 12) placeAt(hit.x, hit.z, camera)
          }
        }
        tapStart = null
      })
    },
  }
}

const onxrloaded = () => {
  XR8.XrController.configure({scale: 'absolute'})   // true-to-size tracking (metres)
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),      // camera feed
    XR8.Threejs.pipelineModule(),                // three.js AR scene
    XR8.XrController.pipelineModule(),           // SLAM world tracking
    LandingPage.pipelineModule(),                // desktop / unsupported-browser page
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),           // loading + camera/motion permission prompts
    XRExtras.RuntimeError.pipelineModule(),
    palletModule(),
  ])
  XR8.run({canvas: document.getElementById('camerafeed')})
}
window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
