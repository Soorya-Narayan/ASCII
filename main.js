import * as THREE from 'three';

const outputCanvas = document.getElementById('output-canvas');
const outCtx = outputCanvas.getContext('2d');
const hiddenVideo = document.getElementById('hidden-video');
const canvas = document.getElementById('processing-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const threeContainer = document.getElementById('three-container');

// Controls
const btnCamera = document.getElementById('btn-camera');
const btnPhoto = document.getElementById('btn-photo');
const toggleCamera = document.getElementById('toggle-camera');
const fileUpload = document.getElementById('file-upload');
const cameraControls = document.getElementById('camera-controls');
const photoControls = document.getElementById('photo-controls');
const resSlider = document.getElementById('resolution');
const resValueDisplay = document.getElementById('res-value');
const brightSlider = document.getElementById('brightness');
const contrastSlider = document.getElementById('contrast');
const btn3d = document.getElementById('mode-3d');
const btnRgb = document.getElementById('mode-source');

// State
let mode = 'camera'; 
let isCameraRunning = false;
let is3dMode = false;
let isRgbMode = false;
let stream = null;
let currentImage = null;
let animationId = null;

const charSets = {
  standard: '@%#*+=-:. '.split(''),
  detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. '.split(''),
  minimal: '#+- '.split(''),
  binary: '01 '.split('')
};

let currentCharSet = charSets.standard;
let colorTheme = 'green'; // 'green', 'white'

// Three.js setup
let scene, camera3d, renderer, mesh;
function init3d() {
  scene = new THREE.Scene();
  camera3d = new THREE.PerspectiveCamera(75, threeContainer.clientWidth / threeContainer.clientHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
  threeContainer.appendChild(renderer.domElement);

  const geometry = new THREE.PlaneGeometry(100, 100, 100, 100);
  const material = new THREE.PointsMaterial({ color: 0x00ff88, size: 0.5 });
  mesh = new THREE.Points(geometry, material);
  mesh.rotation.x = -Math.PI / 3;
  scene.add(mesh);
  camera3d.position.z = 80;
}

function update3d(pixels, width, height) {
  if (!mesh) return;
  const positions = mesh.geometry.attributes.position.array;
  for (let i = 0; i < positions.length / 3; i++) {
    const x = i % (width);
    const y = Math.floor(i / width);
    if (x < width && y < height) {
        const idx = (y * width + x) * 4;
        const brightness = (pixels[idx] + pixels[idx+1] + pixels[idx+2]) / 3;
        positions[i * 3 + 2] = (brightness / 255) * 20; // Set Z based on brightness
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  renderer.render(scene, camera3d);
}

// ASCII Engine (Canvas Based)
function renderASCII(source) {
  const targetWidth = parseInt(resSlider.value);
  const sourceWidth = source.videoWidth || source.width || 1;
  const sourceHeight = source.videoHeight || source.height || 1;
  
  const aspectRatio = sourceHeight / sourceWidth;
  const charAspect = 0.6; // Width/Height ratio of a character
  const targetHeight = Math.floor(targetWidth * aspectRatio * charAspect);

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // Draw source to processing canvas
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  
  // Apply Brightness/Contrast
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imageData.data;
  const b = parseFloat(brightSlider.value);
  const c = parseFloat(contrastSlider.value);

  for (let i = 0; i < pixels.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      let p = pixels[i + j];
      p = (p - 128) * c + 128; // Contrast
      p = p * b; // Brightness
      pixels[i + j] = Math.min(255, Math.max(0, p));
    }
  }
  ctx.putImageData(imageData, 0, 0);

  if (is3dMode) {
    update3d(pixels, targetWidth, targetHeight);
    return;
  }

  // Draw to Output Canvas
  outputCanvas.width = targetWidth * 10; // Scaling for sharpness
  outputCanvas.height = targetHeight * 10;
  outCtx.fillStyle = '#000';
  outCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outCtx.font = 'bold 12px "JetBrains Mono", monospace';
  outCtx.textAlign = 'center';
  outCtx.textBaseline = 'middle';

  const cellW = 10;
  const cellH = 10;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const index = (y * targetWidth + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];

      const brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b);
      const charIndex = Math.floor((brightness / 255) * (currentCharSet.length - 1));
      const char = currentCharSet[currentCharSet.length - 1 - charIndex];
      
      if (isRgbMode) {
        outCtx.fillStyle = `rgb(${r},${g},${b})`;
      } else {
        outCtx.fillStyle = colorTheme === 'green' ? '#00ff88' : '#ffffff';
      }
      
      outCtx.fillText(char, x * cellW + cellW/2, y * cellH + cellH/2);
    }
  }
}

// UI Event Listeners
btnCamera.addEventListener('click', () => { mode = 'camera'; updateUI(); stopCamera(); });
btnPhoto.addEventListener('click', () => { mode = 'photo'; updateUI(); stopCamera(); });

function updateUI() {
    btnCamera.classList.toggle('active', mode === 'camera');
    btnPhoto.classList.toggle('active', mode === 'photo');
    cameraControls.style.display = mode === 'camera' ? 'flex' : 'none';
    photoControls.style.display = mode === 'photo' ? 'flex' : 'none';
}

toggleCamera.addEventListener('click', async () => {
  if (isCameraRunning) stopCamera();
  else {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    hiddenVideo.srcObject = stream;
    isCameraRunning = true;
    toggleCamera.textContent = 'Stop Camera';
    toggleCamera.style.background = '#ff4444';
    loop();
  }
});

function stopCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  isCameraRunning = false;
  toggleCamera.textContent = 'Start Camera';
  toggleCamera.style.background = 'var(--accent-color)';
  if (animationId) cancelAnimationFrame(animationId);
}

function loop() {
  if (!isCameraRunning) return;
  renderASCII(hiddenVideo);
  animationId = requestAnimationFrame(loop);
}

fileUpload.addEventListener('change', (e) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => { currentImage = img; renderASCII(img); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(e.target.files[0]);
});

btn3d.addEventListener('click', () => {
  is3dMode = !is3dMode;
  btn3d.classList.toggle('active', is3dMode);
  threeContainer.style.display = is3dMode ? 'block' : 'none';
  outputCanvas.style.display = is3dMode ? 'none' : 'block';
  if (is3dMode && !scene) init3d();
  if (mode === 'photo' && currentImage) renderASCII(currentImage);
});

btnRgb.addEventListener('click', () => {
  isRgbMode = !isRgbMode;
  btnRgb.classList.toggle('active', isRgbMode);
  if (mode === 'photo' && currentImage) renderASCII(currentImage);
});

resSlider.addEventListener('input', (e) => {
    resValueDisplay.textContent = `${e.target.value}px width`;
    if (mode === 'photo' && currentImage) renderASCII(currentImage);
});

// Charset & Color Theme listeners (simplified)
document.querySelectorAll('[id^="charset-"]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[id^="charset-"]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCharSet = charSets[btn.id.split('-')[1]];
        if (mode === 'photo' && currentImage) renderASCII(currentImage);
    });
});

document.querySelectorAll('[id^="mode-"]').forEach(btn => {
    if (btn.id === 'mode-green' || btn.id === 'mode-bw') {
        btn.addEventListener('click', () => {
            document.getElementById('mode-green').classList.remove('active');
            document.getElementById('mode-bw').classList.remove('active');
            btn.classList.add('active');
            colorTheme = btn.id.split('-')[1];
            if (mode === 'photo' && currentImage) renderASCII(currentImage);
        });
    }
});

document.getElementById('download-btn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'ascii-art.png';
    link.href = outputCanvas.toDataURL();
    link.click();
});

init3d(); // Pre-init 3D
threeContainer.style.display = 'none';
