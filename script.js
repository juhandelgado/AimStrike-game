// Importações do Three.js e recursos usados pelo jogo.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Variáveis principais da cena 3D, câmera, renderização e controles.
let scene, camera, renderer, controls, clock, raycaster;
let composer, bloom, dust = null, weaponShotActions = [], viewEnv = null;
let weaponAction = null, weaponSegment = null;
let activeWeapon = 'pistol', pistolHolder = null, m4Holder = null, m4Mixer = null, m4Actions = {};
let m4Segment = null;
// Trechos da animação da arma usados para tiro e recarga.
const WEAPON_SEGMENTS = {
  shoot: { start: 0.0, end: 0.35 },
  reload: { start: 0.8, end: 2.6 }
};
let state = 'menu', mode = 'grid', difficulty = 'medium';
let targets = [], effects = [], arenaObjects = [], weapon;
let score = 0, shots = 0, hits = 0, misses = 0, combo = 0, bestCombo = 0;
let remaining = 60, elapsed = 0, lastShot = 0, reactionTimes = [], currentTargetBorn = 0;
let targetSerial = 0, feedTimeout = 0, weaponKick = 0, weaponTime = 0, weaponMixer = null;
const targetGroup = new THREE.Group();
// Configurações dos alvos para cada nível de dificuldade.
const settings = {
 easy: {radius:.62,speed:1.05,range:12, count:5},
 medium:{radius:.43,speed:1.8,range:15,count:5},
 hard:{radius:.28,speed:2.8,range:18,count:5}
};
// Referências aos elementos HTML usados para atualizar a interface.
const ui = {
 overlay:document.querySelector('#overlay'), menu:document.querySelector('#menuCard'), result:document.querySelector('#resultCard'),
 hud:document.querySelector('#hud'), start:document.querySelector('#startBtn'), mode:document.querySelector('#mode'),
 difficulty:document.querySelector('#difficulty'), pauseNote:document.querySelector('#pauseNote'),
 score:document.querySelector('#score'), timer:document.querySelector('#timer'), accuracy:document.querySelector('#accuracy'),
 hitsShots:document.querySelector('#hitsShots'), combo:document.querySelector('#combo'), aim:document.querySelector('#centerAim'),
 feed:document.querySelector('#feed'), results:document.querySelector('#results'), resultTitle:document.querySelector('#resultTitle'),
 resultSubtitle:document.querySelector('#resultSubtitle')
};
try { init(); } catch (error) { showFatal(error); }

// Inicializa a cena, a câmera, a interface e os eventos do jogo.
function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1727);
  scene.fog = new THREE.Fog(0x0a1727, 25, 75);
  camera = new THREE.PerspectiveCamera(76, innerWidth/innerHeight, .1, 120);
  camera.position.set(0, 2.1, 8);
  renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.prepend(renderer.domElement);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.06, 0.2, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  controls = new PointerLockControls(camera, renderer.domElement);
  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  scene.add(targetGroup);
  setupLights(); setupEnvironment(); createDust(); createWeapon(); setupEvents();
  window.addEventListener('resize', onResize);
  document.querySelector('#againBtn').addEventListener('click', () => startTraining(true));
  document.querySelector('#menuBtn').addEventListener('click', returnToMenu);
  ui.start.addEventListener('click', () => {
    if(state === 'paused') { controls.lock(); return; }
    startTraining(false);
  });
  controls.addEventListener('unlock', () => {
    if(state === 'playing'){ state='paused'; showPauseMenu(); }
  });
  controls.addEventListener('lock', () => {
    if(state === 'paused'){ state='playing'; ui.overlay.classList.add('hidden'); ui.hud.style.display='block'; }
  });
  animate();
}
// Configura as luzes da arena.
function setupLights(){
  // Iluminação futurista: luz fria azulada e neons coloridos.
  scene.add(new THREE.HemisphereLight(0x7fb8ff, 0x05070b, 0.9));
  const key = new THREE.DirectionalLight(0xbfe9ff, 1.2);
  key.position.set(-5, 16, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26; key.shadow.camera.right = 26;
  key.shadow.camera.top = 22; key.shadow.camera.bottom = -22;
  scene.add(key);
  for (const [x, y, z] of [[-10, 7, -6], [10, 7, -6], [-10, 7, -18], [10, 7, -18]]) {
    const l = new THREE.PointLight(0x00e5ff, 35, 22, 2);
    l.position.set(x, y, z); scene.add(l);
  }
  for (const [x, y, z] of [[-16, 4, 2], [16, 4, 2]]) {
    const l = new THREE.PointLight(0xff2bd6, 22, 20, 2);
    l.position.set(x, y, z); scene.add(l);
  }
  const fill = new THREE.PointLight(0xdff6ff, 8, 14, 2);
  fill.position.set(0, 3, 7);
  scene.add(fill);
}

// Monta o ambiente futurista: piso, paredes, teto, neon e objetos decorativos.
function setupEnvironment(){
  scene.background = new THREE.Color(0x02050b);
  scene.fog = new THREE.Fog(0x03070e, 28, 80);

  const CYAN = 0x00e5ff, MAGENTA = 0xff2bd6;
  const neon = (hex, k = 1.1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
  const cyanN = neon(CYAN), magentaN = neon(MAGENTA);
  const panel = new THREE.MeshStandardMaterial({ color: 0x0b1420, metalness: 0.7, roughness: 0.35 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x111b28, metalness: 0.85, roughness: 0.3 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x060b14, metalness: 0.3, roughness: 0.7 });

  // Piso reflexivo com grade neon.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(90, 45, CYAN, 0x0b3a4c);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  // Faixas de luz no piso e anel de posição do jogador.
  for (const x of [-6, 6]) addBox(x, 0.02, 0, 0.08, 0.02, 44, cyanN);
  addBox(0, 0.02, 6, 40, 0.02, 0.12, magentaN);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.16, 72), magentaN);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.02, 8);
  scene.add(ring);

  // Parede do fundo com "janela" para uma cidade futurista.
  const back = new THREE.Mesh(new THREE.BoxGeometry(52, 20, 1), panel);
  back.position.set(0, 10, -26);
  scene.add(back);
  const skyline = new THREE.Mesh(new THREE.PlaneGeometry(40, 13), new THREE.MeshBasicMaterial({ map: makeSkylineTexture() }));
  skyline.position.set(0, 7.5, -25.45);
  scene.add(skyline);
  addBox(0, 14.1, -25.4, 40.4, 0.12, 0.1, cyanN);
  addBox(0, 0.95, -25.4, 40.4, 0.12, 0.1, cyanN);
  addBox(-20, 7.5, -25.4, 0.12, 13, 0.1, cyanN);
  addBox(20, 7.5, -25.4, 0.12, 13, 0.1, cyanN);

  // Anéis holográficos de referência no fundo e um portal circular.
  for (const x of [-18, -12, -6, 0, 6, 12, 18]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 40), magentaN);
    r.position.set(x, 4, -25.3);
    scene.add(r);
  }
  const holo = new THREE.Mesh(new THREE.TorusGeometry(4, 0.04, 10, 120), cyanN);
  holo.position.set(0, 8.5, -24);
  scene.add(holo);

  // Paredes laterais com faixas neon.
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 14, 54), panel);
    wall.position.set(s * 25, 7, -2);
    wall.receiveShadow = true;
    scene.add(wall);
    for (const y of [1.2, 4, 7, 10]) addBox(s * 24.4, y, -2, 0.06, 0.07, 50, s < 0 ? cyanN : magentaN);
  }

  // Teto escuro com painéis de luz.
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(52, 0.5, 56), darkMetal);
  ceiling.position.set(0, 14, -2);
  scene.add(ceiling);
  for (const x of [-12, 0, 12]) for (const z of [6, -3, -12, -21]) addBox(x, 13.7, z, 6, 0.05, 0.35, cyanN);

  // Pilares com faixas neon.
  for (const x of [-15, 15]) for (const z of [-4, -14, 4]) {
    addBox(x, 6, z, 1.2, 12, 1.2, darkMetal);
    addBox(x, 6, z + 0.61, 0.06, 11.6, 0.04, x < 0 ? cyanN : magentaN);
  }

  // Consoles laterais futuristas.
  for (const s of [-1, 1]) {
    addBox(s * 19, 0.6, 6, 2.6, 1.2, 4, darkMetal);
    addBox(s * 19, 1.22, 6, 2.6, 0.05, 4, s < 0 ? cyanN : magentaN);
  }
}

// Cria uma textura de cidade futurista usando um canvas.
function makeSkylineTexture(){
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 512;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#02030a');
  sky.addColorStop(0.6, '#0a1b33');
  sky.addColorStop(1, '#1a0f33');
  g.fillStyle = sky;
  g.fillRect(0, 0, 2048, 512);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = 'rgba(180,230,255,' + (Math.random() * 0.6).toFixed(2) + ')';
    g.fillRect(Math.random() * 2048, Math.random() * 250, 2, 2);
  }
  const layers = ['#0b1624', '#081020', '#050b15'];
  for (let layer = 0; layer < 3; layer++) {
    const base = 340 + layer * 60;
    let x = -20;
    while (x < 2048) {
      const w = 30 + Math.random() * 70;
      const h = 60 + Math.random() * (200 - layer * 40);
      g.fillStyle = layers[layer];
      g.fillRect(x, base - h, w, 512 - (base - h));
      for (let wy = base - h + 10; wy < base - 10; wy += 14) {
        for (let wx = x + 6; wx < x + w - 8; wx += 12) {
          if (Math.random() < 0.25) {
            const r = Math.random();
            const col = r < 0.7 ? '0,229,255' : (r < 0.85 ? '255,43,214' : '255,200,120');
            g.fillStyle = 'rgba(' + col + ',' + (0.5 + Math.random() * 0.5).toFixed(2) + ')';
            g.fillRect(wx, wy, 5, 7);
          }
        }
      }
      x += w + Math.random() * 8;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Cria partículas decorativas que flutuam pela arena.
function createDust(){
  // Partículas flutuando no ar para dar sensação de atmosfera.
  const count = 500;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 50;
    pos[i * 3 + 1] = Math.random() * 12;
    pos[i * 3 + 2] = -22 + Math.random() * 34;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x7ff3ff, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false
  }));
  scene.add(dust);
}
// Cria uma caixa 3D e adiciona à cena.
function addBox(x,y,z,w,h,d,material){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material); mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh); arenaObjects.push(mesh); return mesh;
}
// Cria a arma em primeira pessoa e carrega o modelo 3D externo.
function createWeapon(){
  // O grupo fica preso à câmera para a arma aparecer em primeira pessoa.
  weapon = new THREE.Group();
  weapon.position.set(0, 0, 0);
  camera.add(weapon);
  scene.add(camera);

  // Luz rápida no cano quando o jogador atira.
  const muzzle = new THREE.PointLight(0xffc27a, 0, 3);
  muzzle.position.set(.34, -.245, -1.0);
  weapon.add(muzzle);
  weapon.userData.muzzle = muzzle;

  // Arma provisória: aparece enquanto o modelo GLB carrega ou se houver erro.
  createFallbackWeapon();

  // Modelo FPS com mãos e pistola (fps_hands__sig_sauer_225.glb).
  // Ajustes de encaixe na tela:
  if (!viewEnv) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    viewEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  const VIEW_TARGET = new THREE.Vector3(0.28, -0.3, -0.6); // centro da arma na tela
  const PISTOL_LENGTH = 0.55;                              // comprimento da arma (unidades)
  const loader = new GLTFLoader();
  loadM4Weapon(loader);
  loader.load(
    new URL('./heavy_pistol_animated.glb', import.meta.url).href,
    (gltf) => {
      const model = gltf.scene;
      model.name = 'ViewModel';
      model.updateMatrixWorld(true);

      // A pistola é o grupo "Talon" (os braços são skinned, então ficam de fora da medida).
      let pistolRoot = null;
      model.traverse((o) => { if (o.name === 'Talon') pistolRoot = o; });
      const box = new THREE.Box3().setFromObject(pistolRoot || model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = PISTOL_LENGTH / Math.max(size.x, size.y, size.z);

      // O cano aponta para +Z; girando 180° em Y ele passa a apontar para -Z (frente da câmera).
      const holder = new THREE.Group();
      holder.add(model);
      holder.rotation.y = Math.PI;
      holder.scale.setScalar(scale);
      const rotatedCenter = center.clone().multiplyScalar(scale).applyEuler(new THREE.Euler(0, Math.PI, 0));
      holder.position.copy(VIEW_TARGET).sub(rotatedCenter);

      prepareViewmodel(model);

      const fallback = weapon.getObjectByName('FallbackWeapon');
      if (fallback) weapon.remove(fallback);
      weapon.add(holder);
      pistolHolder = holder;

      if (weapon.userData.muzzle) {
        weapon.userData.muzzle.position.set(VIEW_TARGET.x, VIEW_TARGET.y + 0.03, VIEW_TARGET.z - PISTOL_LENGTH / 2);
      }

      // Animação do arquivo: um único clipe com tiro e recarga em momentos diferentes.
      if (gltf.animations && gltf.animations.length) {
        weaponMixer = new THREE.AnimationMixer(model);
        weaponAction = weaponMixer.clipAction(gltf.animations[0]);
        weaponAction.setLoop(THREE.LoopOnce, 1);
        weaponAction.clampWhenFinished = true;
        weaponAction.play();
        weaponAction.paused = true; // começa na pose de repouso
      }
      document.querySelector('#weaponLabel').textContent = 'PISTOLA // 1: PISTOLA · 2: M4 · CLIQUE: TIRO · R: RECARGA';
      console.info('Modelo heavy_pistol_animated.glb carregado.');
    },
    (xhr) => {
      if (xhr.total) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        document.querySelector('#weaponLabel').textContent = 'CARREGANDO ARMA // ' + percent + '%';
      }
    },
    (error) => {
      console.error('Não foi possível carregar heavy_pistol_animated.glb:', error);
      document.querySelector('#weaponLabel').textContent = 'ARMA PROVISÓRIA // VERIFIQUE O ARQUIVO .glb';
    }
  );
}

// Carrega a M4 e prepara as animações que já vêm dentro do arquivo GLB.
function loadM4Weapon(loader){
  loader.load(
    new URL('./m4_fps.glb', import.meta.url).href,
    (gltf) => {
      const model = gltf.scene;
      model.name = 'M4_ViewModel';

      // Prepara os materiais e atualiza as matrizes antes de medir o modelo.
      prepareViewmodel(model);
      model.updateMatrixWorld(true);

      // Normaliza a escala automaticamente. O fator fixo 0.01 podia deixar
      // a M4 invisível ou fora de escala dependendo das unidades do arquivo GLB.
      const modelBox = new THREE.Box3().setFromObject(model);
      const modelSize = modelBox.getSize(new THREE.Vector3());
      const modelCenter = modelBox.getCenter(new THREE.Vector3());
      const maxDimension = Math.max(modelSize.x, modelSize.y, modelSize.z);
      const desiredSize = 1.75; // deixa a M4 maior na tela sem depender das unidades originais do GLB
      const normalizedScale = maxDimension > 0 ? desiredSize / maxDimension : 1;

      // O grupo permite alternar entre a pistola e a M4.
      m4Holder = new THREE.Group();
      m4Holder.name = 'M4Holder';
      // Centraliza o modelo no próprio grupo para reduzir deslocamentos inesperados.
      model.position.sub(modelCenter);
      m4Holder.add(model);
      m4Holder.scale.setScalar(normalizedScale);
      m4Holder.position.set(0.34, -0.36, -0.82);
      m4Holder.rotation.y = Math.PI;
      m4Holder.visible = activeWeapon === 'm4';
      weapon.add(m4Holder);

      // Guarda cada animação pelo nome que existe no arquivo: Fire, Reload etc.
      m4Mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) {
        const action = m4Mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        action.paused = true;
        m4Actions[clip.name.toLowerCase()] = action;
      }
      console.info('M4 carregada. Escala aplicada:', normalizedScale, 'Dimensões originais:', modelSize, 'Animações:', gltf.animations.map(a => a.name));
      if (activeWeapon === 'm4') selectWeapon('m4');
    },
    undefined,
    (error) => {
    console.error('Não foi possível carregar m4_fps.glb. Confira se o arquivo existe ao lado do script.js e se o servidor local está ativo.', error);
    const label = document.querySelector('#weaponLabel');
    if (label) label.textContent = 'ERRO AO CARREGAR M4 — CONFIRA O CONSOLE (F12)';
     }
  );
}

// Alterna entre a pistola e a M4 sem reiniciar a rodada.
function selectWeapon(name){
  if (name === 'm4' && !m4Holder) {
    document.querySelector('#weaponLabel').textContent = 'CARREGANDO M4...';
    return;
  }
  activeWeapon = name;
  if (pistolHolder) pistolHolder.visible = name === 'pistol';
  const fallback = weapon?.getObjectByName('FallbackWeapon');
  if (fallback) fallback.visible = name === 'pistol' && !pistolHolder;
  if (m4Holder) m4Holder.visible = name === 'm4';
  if (weapon?.userData?.muzzle) weapon.userData.muzzle.visible = name === 'pistol';
  document.querySelector('#weaponLabel').textContent = name === 'm4'
    ? 'M4 // 1: PISTOLA · 2: M4 · CLIQUE: TIRO · R: RECARGA'
    : 'PISTOLA // 1: PISTOLA · 2: M4 · CLIQUE: TIRO · R: RECARGA';
  weaponSegment = null;
  m4Segment = null;
}

// Intervalos do clipe (em segundos), definidos pela análise das curvas de animação.
// shoot: o slide recua e volta rapidamente. reload: o pente sai e entra e o slide é solto.

// Executa um trecho específico da animação da arma.
function playWeaponSegment(name){
  // A M4 usa os clipes nomeados que estão dentro do arquivo GLB.
  if (activeWeapon === 'm4') {
    const action = m4Actions[name === 'shoot' ? 'fire' : 'reload'];
    if (!action) return;
    if (m4Segment && m4Segment.name === 'reload' && name === 'shoot') return;
    action.reset();
    action.paused = false;
    action.play();
    m4Segment = { name, action, end: action.getClip().duration };
    return;
  }
  if (!weaponAction) return;
  // Não interrompe a recarga da pistola com um tiro.
  if (weaponSegment && weaponSegment.name === 'reload' && name === 'shoot') return;
  const seg = WEAPON_SEGMENTS[name];
  weaponAction.paused = false;
  weaponAction.reset();
  weaponAction.time = seg.start;
  weaponAction.play();
  weaponSegment = { name, end: seg.end };
}

// Para o trecho da animação quando ele chega ao tempo final.
function updateWeaponSegment(){
  if (m4Segment && m4Segment.action && m4Segment.action.time >= m4Segment.end) {
    m4Segment.action.time = m4Segment.end;
    m4Segment.action.paused = true;
    m4Segment = null;
  }
  if (weaponSegment && weaponAction && weaponAction.time >= weaponSegment.end) {
    weaponAction.time = weaponSegment.end;
    weaponAction.paused = true;
    weaponSegment = null;
  }
}

// Ajusta materiais e sombras do modelo da arma e das mãos.
function prepareViewmodel(root){
  root.traverse((o) => {
    if (!o.isMesh) return;

    o.castShadow = true;
    o.receiveShadow = false;

    // Preserve the materials and textures embedded in the GLB.
    // Do not inject an environment map or recolor the material here:
    // both can wash out the original weapon details.
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.needsUpdate = true;
    }
  });
}

// Cria uma arma simples de reserva caso o arquivo GLB não carregue.
function createFallbackWeapon(){
  const fallback = new THREE.Group();
  fallback.name = 'FallbackWeapon';
  const dark = new THREE.MeshStandardMaterial({color:0x17202a, metalness:.78, roughness:.27});
  const steel = new THREE.MeshStandardMaterial({color:0x667785, metalness:.86, roughness:.23});
  const gripMat = new THREE.MeshStandardMaterial({color:0x20262c, metalness:.25, roughness:.72});
  const slide = new THREE.Mesh(new THREE.BoxGeometry(.22,.15,.48), steel);
  slide.position.set(.34,-.27,-.65); fallback.add(slide);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,.36,12), dark);
  barrel.rotation.x = Math.PI/2; barrel.position.set(.34,-.245,-.98); fallback.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.13,.24,.16), gripMat);
  grip.position.set(.34,-.43,-.48); grip.rotation.x=-.18; fallback.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(.06,.025,.07), dark);
  sight.position.set(.34,-.18,-.63); fallback.add(sight);
  fallback.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  weapon.add(fallback);
}

// Registra os controles de teclado e mouse.
function setupEvents(){
  window.addEventListener('keydown', e=>{
    if(e.code==='Escape' && state==='playing'){ state='paused'; }
    if(e.code==='KeyR' && state==='playing'){ playWeaponSegment('reload'); }
    if(e.code==='Digit1' || e.code==='Numpad1'){ selectWeapon('pistol'); }
    if(e.code==='Digit2' || e.code==='Numpad2'){ selectWeapon('m4'); }
  });
  window.addEventListener('mousedown', e=>{
    if(e.button!==0 || state!=='playing' || !controls.isLocked) return;
    shoot();
  });
  window.addEventListener('click', e=>{
    if(state==='playing' && !controls.isLocked && e.target===renderer.domElement) controls.lock();
  });
}
// Reinicia as estatísticas e começa uma sessão de treinamento.
function startTraining(restart){
  if(!renderer) return;
  mode=ui.mode.value; difficulty=ui.difficulty.value;
  score=0; shots=0; hits=0; misses=0; combo=0; bestCombo=0;
  remaining=60; elapsed=0; reactionTimes=[]; targets.forEach(t=>targetGroup.remove(t)); targets=[];
  effects.forEach(e=>scene.remove(e.object)); effects=[];
  targetSerial=0; currentTargetBorn=performance.now();
  state='playing'; ui.pauseNote.classList.remove('show');
  ui.menu.style.display='block'; ui.result.style.display='none';
  ui.overlay.classList.add('hidden'); ui.hud.style.display='block';
  spawnTargets();
  controls.lock();
  updateHUD();
}
// Exibe a interface de pausa.
function showPauseMenu(){
  ui.overlay.classList.remove('hidden'); ui.menu.style.display='block'; ui.result.style.display='none';
  ui.hud.style.display='block'; ui.start.textContent='CONTINUAR';
  ui.pauseNote.classList.add('show');
}
// Retorna ao menu principal.
function returnToMenu(){
  state='menu'; controls.unlock(); ui.hud.style.display='none';
  ui.overlay.classList.remove('hidden'); ui.menu.style.display='block'; ui.result.style.display='none';
  ui.start.textContent='COMEÇAR TREINAMENTO'; ui.pauseNote.classList.remove('show');
}
// Cria a quantidade de alvos definida pelo modo de treino.
function spawnTargets(){
  const cfg=settings[difficulty]||settings.medium;
  const count=mode==='reflex'?1:cfg.count;
  for(let i=0;i<count;i++) addTarget();
}
// Cria um alvo com forma, cor e movimento próprios.
function addTarget(){
  const cfg=settings[difficulty]||settings.medium;
  const radius=cfg.radius;
  const group=new THREE.Group();
  const color=new THREE.Color().setHSL(.48+Math.random()*.12,.85,.56);
  const sphere=new THREE.Mesh(new THREE.IcosahedronGeometry(radius,1),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.45,metalness:.25,roughness:.28}));
  sphere.castShadow=true; group.add(sphere);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(radius*1.28,.035,8,28),new THREE.MeshBasicMaterial({color:0x8efff2}));
  ring.position.z=.02; group.add(ring);
  const glow=new THREE.PointLight(color,1.5,3); group.add(glow);
  group.position.set((Math.random()-.5)*cfg.range,1.5+Math.random()*4.3,-8-Math.random()*10);
  group.userData={radius,phase:Math.random()*Math.PI*2,baseY:group.position.y, born:performance.now(), speed:cfg.speed*(.7+Math.random()*.6)};
  targetGroup.add(group); targets.push(group); targetSerial++;
}
// Processa um disparo, verifica acertos e atualiza a pontuação.
function shoot(){
  const now=performance.now();
  shots++;
  // Recuo curto a cada disparo, mesmo se o GLB não tiver animação.
  weaponKick=.12;
  if (weapon) {
    weapon.userData.recoilRotation = .10;
  }
  // Dispara o segmento de tiro da animação do arquivo.
  playWeaponSegment('shoot');
  if(weapon && weapon.userData.muzzle){weapon.userData.muzzle.intensity=3;setTimeout(()=>{if(weapon?.userData?.muzzle)weapon.userData.muzzle.intensity=0;},45);}
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const objects=[];
  targets.forEach(t=>t.traverse(o=>{if(o.isMesh)objects.push(o);}));
  const found=raycaster.intersectObjects(objects,false);
  if(found.length){
    let target=found[0].object;
    while(target.parent && target.parent!==targetGroup) target=target.parent;
    if(target.parent===targetGroup){
      hits++; score+=100+Math.max(0,combo)*10; combo++; bestCombo=Math.max(bestCombo,combo);
      reactionTimes.push(now-(target.userData.born||now));
      showFeed('ACERTO!',true); makeHitEffect(found[0].point);
      targetGroup.remove(target); targets=targets.filter(t=>t!==target);
      if(mode==='reflex' && targets.length===0) addTarget(); else if(mode!=='reflex') addTarget();
    }
  } else {
    misses++; combo=0; showFeed('ERRO!',false);
  }
  updateHUD();
}
// Mostra uma mensagem rápida de acerto ou erro.
function showFeed(text,hit){
  ui.feed.textContent=text; ui.feed.style.color=hit?'#80ffd0':'#ff627c';ui.feed.style.opacity='1';
  clearTimeout(feedTimeout);feedTimeout=setTimeout(()=>ui.feed.style.opacity='0',300);
  ui.aim.classList.remove('hit','miss');ui.aim.classList.add(hit?'hit':'miss');
  setTimeout(()=>ui.aim.classList.remove('hit','miss'),140);
}
// Cria o efeito visual que aparece quando um alvo é atingido.
function makeHitEffect(point){
  const obj=new THREE.Mesh(new THREE.SphereGeometry(.13,10,10),new THREE.MeshBasicMaterial({color:0x8effd0,transparent:true,opacity:1}));
  obj.position.copy(point);scene.add(obj);effects.push({object:obj,life:.22,max:.22});
}
// Atualiza os números mostrados na interface durante a partida.
function updateHUD(){
  ui.score.textContent=score;
  ui.timer.textContent=Math.max(0,Math.ceil(remaining));
  ui.accuracy.textContent=(shots?Math.round(hits/shots*100):0)+'%';
  ui.hitsShots.textContent=hits+' / '+shots;
  ui.combo.textContent=bestCombo;
}
// Encerra a sessão e apresenta os resultados.
function finishTraining(){
  state='finished';controls.unlock();ui.hud.style.display='none';ui.overlay.classList.remove('hidden');
  ui.menu.style.display='none';ui.result.style.display='block';ui.start.textContent='COMEÇAR TREINAMENTO';
  const accuracy=shots?Math.round(hits/shots*100):0;
  const avg=reactionTimes.length?Math.round(reactionTimes.reduce((a,b)=>a+b,0)/reactionTimes.length):0;
  ui.resultTitle.textContent='TREINO FINALIZADO';
  ui.resultSubtitle.textContent='Bom trabalho! Veja os resultados desta sessão.';
  ui.results.innerHTML=`<div class="result"><span>Pontuação</span><b>${score}</b></div><div class="result"><span>Acertos</span><b>${hits}</b></div><div class="result"><span>Precisão</span><b>${accuracy}%</b></div><div class="result"><span>Tempo médio de reação</span><b>${avg?avg+' ms':'—'}</b></div><div class="result"><span>Erros</span><b>${misses}</b></div><div class="result"><span>Melhor combo</span><b>${bestCombo}</b></div>`;
}
// Loop principal: atualiza o jogo e renderiza cada quadro.
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  if(state==='playing'){
    elapsed+=dt;remaining-=dt;
    if(remaining<=0){remaining=0;updateHUD();finishTraining();}
    targets.forEach(t=>{
      const u=t.userData;
      if(mode==='tracking'){
        t.position.x=Math.sin(elapsed*u.speed+u.phase)*(settings[difficulty].range*.62);
        t.position.y=u.baseY+Math.sin(elapsed*2+u.phase)*.8;
      } else if(difficulty!=='easy'){
        t.position.y=u.baseY+Math.sin(elapsed*u.speed+u.phase)*.16;
      }
      t.rotation.y+=dt*.5;t.rotation.x+=dt*.25;
    });
    effects=effects.filter(e=>{e.life-=dt;e.object.scale.setScalar(1+(e.max-e.life)*7);e.object.material.opacity=Math.max(0,e.life/e.max);if(e.life<=0){scene.remove(e.object);e.object.geometry.dispose();e.object.material.dispose();return false;}return true;});
    if(weapon){
      weapon.position.z=-Math.max(0,weaponKick);
      weaponKick=Math.max(0,weaponKick-dt*.85);
      weaponTime+=dt;
    }
    updateHUD();
  }
  // As animações da arma precisam atualizar mesmo fora da rodada ativa.
  if(weaponMixer) weaponMixer.update(dt);
  if(m4Mixer) m4Mixer.update(dt);
  updateWeaponSegment();
  // Retorna suavemente a rotação da arma depois do recuo.
  if(weapon && weapon.userData.recoilRotation !== undefined) {
    weapon.userData.recoilRotation = Math.max(0, weapon.userData.recoilRotation - dt*.8);
    weapon.rotation.x = -weapon.userData.recoilRotation;
  }
  if(dust) dust.rotation.y+=dt*0.015;
  composer.render();
}
// Ajusta a câmera e a renderização quando a janela muda de tamanho.
function onResize(){
  if(!camera||!renderer)return;
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);
}
// Mostra uma mensagem caso ocorra um erro ao iniciar o jogo.
function showFatal(error){
  console.error(error);
  const overlay=document.querySelector('#overlay');
  if(overlay){overlay.classList.remove('hidden');overlay.innerHTML='<div class="panel card"><h1>Erro ao iniciar</h1><p>O jogo não conseguiu iniciar. Abra o Console do navegador (F12) para ver o erro. Confira também sua conexão com a internet, pois o Three.js é carregado por CDN.</p><p style="font-size:11px">'+String(error?.message||error)+'</p></div>';}
}
