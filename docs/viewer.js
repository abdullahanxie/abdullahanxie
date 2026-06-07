import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const viewport = document.querySelector("#viewport");
const partsList = document.querySelector("#partsList");
const partCount = document.querySelector("#partCount");
const stats = document.querySelector("#stats");
const selectionName = document.querySelector("#selectionName");
const selectionStory = document.querySelector("#selectionStory");
const loading = document.querySelector("#loading");
const loadingBar = document.querySelector("#loadingBar");
const loadingValue = document.querySelector("#loadingValue");

const rotateButton = document.querySelector("#rotateButton");
const wireButton = document.querySelector("#wireButton");
const isolateButton = document.querySelector("#isolateButton");
const showButton = document.querySelector("#showButton");
const resetButton = document.querySelector("#resetButton");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070a09, 0.022);

const camera = new THREE.PerspectiveCamera(31, 1, 0.01, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.setClearColor(0x070a09, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.85;
controls.minDistance = 2;
controls.maxDistance = 18;

scene.add(new THREE.HemisphereLight(0xb9dcff, 0x10150e, 2.2));

const key = new THREE.DirectionalLight(0xeaffc1, 4.2);
key.position.set(4, 7, 7);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);

const cyan = new THREE.DirectionalLight(0x36bfff, 2.8);
cyan.position.set(-5, 1, 5);
scene.add(cyan);

const coral = new THREE.PointLight(0xff6048, 10, 12);
coral.position.set(3, -2, 4);
scene.add(coral);

const grid = new THREE.GridHelper(24, 24, 0x267a71, 0x18342e);
grid.material.opacity = 0.42;
grid.material.transparent = true;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const meshes = [];
let model = null;
let selected = null;
let selectionMaterials = [];
let wireframe = false;
let pointerStart = null;

const stories = [
  ["Ring Shank", "The jewelry foundation. It turns a visual idea into something designed to be held, worn, and made."],
  ["Aperture Blade", "Seven overlapping blades carry the filmmaking origin of the object: light is shaped before an image exists."],
  ["Camera Housing", "The camera body keeps the iris readable and gives the crown its mechanical structure."],
  ["Vision Lens", "The lens stands for machine vision: teaching software to look closely, then learning from where it fails."],
  ["Faceted Machine Vision Lens", "A gemstone and an optical sensor at once. It is the point where jewelry, 3D form, and computer vision meet."],
  ["Film", "Small viewfinder marks keep filmmaking present without turning the object into a literal camera."],
  ["Shoulder Rail", "The shoulders carry the crown into the ring. Their geometry is the quiet engineering that makes the idea believable."],
  ["Signal Brace", "A visible path between the ring and its optical crown, like a trace carrying an image into a system."],
  ["Setting Pin", "A precise joint between the jewelry setting and its optical assembly."],
  ["Engineering Fastener", "Tiny, named assembly details make the object understandable when it is picked apart."],
  ["Lens Prong", "The lens is held like a stone, but the setting is built with the logic of a machine."],
  ["Vision Pupil", "The final point of focus: where looking becomes interpretation."],
];

function readable(name) {
  return name.replaceAll("_", " ");
}

function storyFor(name) {
  const match = stories.find(([keyName]) => name.includes(keyName.replaceAll(" ", "_")));
  return match ? match[1] : "One part of a single object built from filmmaking, jewelry, machine vision, and engineering.";
}

function eachMaterial(material, callback) {
  (Array.isArray(material) ? material : [material]).forEach(callback);
}

function disposeSelectionMaterials() {
  selectionMaterials.forEach((material) => material.dispose());
  selectionMaterials = [];
}

function makeHighlight(material) {
  const clone = material.clone();
  if ("emissive" in clone) {
    clone.emissive = new THREE.Color(0xd7ff45);
    clone.emissiveIntensity = 0.7;
  }
  clone.wireframe = wireframe;
  selectionMaterials.push(clone);
  return clone;
}

function selectPart(mesh) {
  if (selected) {
    selected.material = selected.userData.sourceMaterial;
  }
  disposeSelectionMaterials();
  selected = mesh;

  if (selected) {
    const source = selected.userData.sourceMaterial;
    selected.material = Array.isArray(source)
      ? source.map(makeHighlight)
      : makeHighlight(source);
    selectionName.textContent = readable(selected.name);
    selectionStory.textContent = storyFor(selected.name);
  } else {
    selectionName.textContent = "Pick a part";
    selectionStory.textContent = "Every visible piece has a job. Select one in the model or from the list to see how the object connects film, vision, jewelry, and engineering.";
  }

  document.querySelectorAll(".part-button").forEach((button) => {
    button.classList.toggle("active", selected && button.dataset.name === selected.name);
  });
}

function addPartButton(mesh, index) {
  const vertices = mesh.geometry.attributes.position?.count || 0;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "part-button";
  button.dataset.name = mesh.name;
  button.innerHTML = `
    <span class="part-index">${String(index + 1).padStart(2, "0")}</span>
    <span class="part-name">${readable(mesh.name)}</span>
    <span class="part-meta">${vertices}V</span>
  `;
  button.addEventListener("click", () => selectPart(mesh));
  partsList.append(button);
}

function frameModel() {
  const box = new THREE.Box3().setFromObject(model);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
  const verticalDistance = sphere.radius / Math.sin(fov / 2);
  const horizontalDistance = sphere.radius / Math.sin(horizontalFov / 2);
  const distance = Math.max(verticalDistance, horizontalDistance) * 1.12;
  const direction = new THREE.Vector3(0.18, 0.08, 1).normalize();
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.near = Math.max(0.01, distance / 1000);
  camera.far = distance * 30;
  camera.updateProjectionMatrix();
  controls.target.copy(sphere.center);
  controls.minDistance = sphere.radius * 1.2;
  controls.maxDistance = sphere.radius * 8;
  controls.update();
  controls.saveState();
  grid.position.y = box.min.y - sphere.radius * 0.035;
}

function showAll() {
  meshes.forEach((mesh) => {
    mesh.visible = true;
  });
  isolateButton.classList.remove("active");
}

new GLTFLoader().load(
  "./aperture-ring.glb",
  (gltf) => {
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    scene.add(model);

    model.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.sourceMaterial = child.material;
      meshes.push(child);
    });

    meshes.sort((a, b) => a.name.localeCompare(b.name));
    meshes.forEach(addPartButton);

    const vertices = meshes.reduce((total, mesh) => total + (mesh.geometry.attributes.position?.count || 0), 0);
    const faces = meshes.reduce((total, mesh) => {
      const geometry = mesh.geometry;
      return total + (geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count || 0) / 3);
    }, 0);

    partCount.textContent = String(meshes.length).padStart(2, "0");
    stats.textContent = `${meshes.length} PARTS / ${vertices.toLocaleString()} VERTS / ${Math.round(faces).toLocaleString()} FACES`;
    frameModel();
    loading.classList.add("done");
  },
  (event) => {
    const percent = event.total ? Math.round(event.loaded / event.total * 100) : 50;
    loadingBar.style.width = `${percent}%`;
    loadingValue.textContent = `${percent}%`;
  },
  (error) => {
    console.error(error);
    loadingValue.textContent = "ERROR";
    selectionStory.textContent = "The 3D object could not be loaded. Refresh the page to try again.";
  }
);

rotateButton.addEventListener("click", () => {
  controls.autoRotate = !controls.autoRotate;
  rotateButton.classList.toggle("active", controls.autoRotate);
});

wireButton.addEventListener("click", () => {
  wireframe = !wireframe;
  meshes.forEach((mesh) => {
    eachMaterial(mesh.userData.sourceMaterial, (material) => {
      material.wireframe = wireframe;
      material.needsUpdate = true;
    });
    eachMaterial(mesh.material, (material) => {
      material.wireframe = wireframe;
      material.needsUpdate = true;
    });
  });
  wireButton.classList.toggle("active", wireframe);
});

isolateButton.addEventListener("click", () => {
  if (!selected) {
    selectionStory.textContent = "Pick a part first, then isolate it from the rest of the object.";
    return;
  }
  meshes.forEach((mesh) => {
    mesh.visible = mesh === selected;
  });
  isolateButton.classList.add("active");
});

showButton.addEventListener("click", showAll);

resetButton.addEventListener("click", () => {
  showAll();
  selectPart(null);
  controls.reset();
});

renderer.domElement.addEventListener("pointerdown", (event) => {
  pointerStart = { x: event.clientX, y: event.clientY };
});

renderer.domElement.addEventListener("click", (event) => {
  if (!model || !pointerStart) return;
  if (Math.abs(event.clientX - pointerStart.x) > 5 || Math.abs(event.clientY - pointerStart.y) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(meshes.filter((mesh) => mesh.visible), false)[0];
  selectPart(hit?.object || null);
});

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(viewport);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
