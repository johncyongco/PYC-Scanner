const video = document.querySelector('#camera');
const cameraCaption = document.querySelector('#camera-caption');
const button = document.querySelector('#start');
const result = document.querySelector('#result');
const title = document.querySelector('#title');
const detail = document.querySelector('#detail');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
let stream;
let frame;
let lastRead = 0;

function show(state, message, copy) {
  result.dataset.state = state;
  title.textContent = message;
  detail.textContent = copy;
}
function stop() {
  cancelAnimationFrame(frame);
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.srcObject = null;
  cameraCaption.textContent = 'Camera off';
}
async function submit(code) {
  stop();
  show('ready', 'Checking ticket…', 'Waiting for Google Sheets.');
  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) throw Error('Check-in failed');
    const data = await response.json();
    if (data.status === 'present') return show('present', 'Present', data.name || code);
    if (data.status === 'already_present') {
      const stamp = data.checkedInAt ? new Date(data.checkedInAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '';
      return show('already_present', 'Already present', [data.name, stamp].filter(Boolean).join(' · ') || code);
    }
    return show('error', 'See registration desk', {
      not_found: 'Ticket code was not found.',
      unpaid: 'Payment is unverified.',
      duplicate_code: 'This code appears on more than one registration.',
    }[data.status] || 'Check-in could not be verified.');
  } catch {
    show('error', 'Check-in could not be verified', 'Check the connection and scan again.');
  } finally {
    button.textContent = 'Scan another ticket';
    button.disabled = false;
  }
}
function scan(time) {
  if (!stream) return;
  if (video.readyState >= 2 && time - lastRead > 160) {
    lastRead = time;
    canvas.width = Math.min(760, video.videoWidth);
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const qr = window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
    const code = qr?.data.trim().toUpperCase();
    if (/^UNF-[A-F0-9]{16}$/.test(code ?? '')) {
      void submit(code);
      return;
    }
    if (code) show('error', 'Show an UN/FOLD ticket', 'The camera is still scanning.');
  }
  frame = requestAnimationFrame(scan);
}
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    if (!window.jsQR) throw Error('QR reader unavailable');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = stream;
    await video.play();
    cameraCaption.textContent = 'Camera on';
    show('ready', 'Scanning', 'Hold the ticket QR inside the frame.');
    frame = requestAnimationFrame(scan);
  } catch {
    stop();
    show('error', 'Camera unavailable', 'Allow camera access in your browser and try again.');
    button.disabled = false;
  }
});
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', (event) => { if (event.persisted) button.disabled = false; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
