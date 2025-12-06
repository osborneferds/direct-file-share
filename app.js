// app.js
const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');
const resultCard = document.getElementById('resultCard');
const qrImg = document.getElementById('qrImg');
const fileNameEl = document.getElementById('fileName');
const fileSizeEl = document.getElementById('fileSize');
const expiresAtEl = document.getElementById('expiresAt');
const downloadLink = document.getElementById('downloadLink');
const copyBtn = document.getElementById('copyBtn');
const dropzone = document.getElementById('dropzone');
const progressBar = document.getElementById('progressBar'); // Assumes <progress id="progressBar" value="0" max="100"></progress> in your HTML

function humanFileSize(bytes) {
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) return bytes + ' B';
  const units = ['KB','MB','GB','TB','PB','EB','ZB','YB'];
  let u = -1;
  do {
    bytes /= thresh;
    ++u;
  } while(Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1)+' '+units[u];
}

// drag & drop helpers
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.transform = 'translateY(-3px)'; });
dropzone.addEventListener('dragleave', () => { dropzone.style.transform = ''; });
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.style.transform = '';
  const droppedFiles = e.dataTransfer.files;
  if (droppedFiles && droppedFiles.length > 0) {
    fileInput.files = droppedFiles;
    // Automatically trigger the upload when a file is dropped.
    uploadForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }
});

async function handleUpload(file) {
    if (!file) {
        statusEl.textContent = 'Please choose a file first.';
        return;
    }
    // Reset UI
    statusEl.textContent = `Uploading ${file.name}...`;
    resultCard.classList.add('hidden'); // Hide previous result
    progressBar.classList.remove('hidden');
    progressBar.value = 0;

    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            progressBar.value = percentComplete;
        }
    });

    xhr.addEventListener('load', () => {
        progressBar.classList.add('hidden');
        try {
            const result = JSON.parse(xhr.responseText);
            if (xhr.status >= 400) {
                statusEl.textContent = result.error || `Upload failed with status: ${xhr.status}`;
                return;
            }
            // Populate UI on success
            qrImg.src = result.qrDataUrl;
            fileNameEl.textContent = file.name;
            fileSizeEl.textContent = humanFileSize(file.size);
            downloadLink.href = result.downloadUrl;
            copyBtn.dataset.link = result.downloadUrl;
            resultCard.classList.remove('hidden');
            statusEl.textContent = 'Upload complete — scan the QR or copy the link.';
            startCountdown(result.expiresAt);
        } catch (err) {
            statusEl.textContent = 'Upload failed. Could not parse server response.';
        }
    });

    xhr.addEventListener('error', () => {
        progressBar.classList.add('hidden');
        statusEl.textContent = 'Upload failed. Check the server connection.';
    });

    xhr.open('POST', '/api/upload');
    xhr.send(form);
}

uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    handleUpload(file);
});

copyBtn.addEventListener('click', async () => {
  const link = copyBtn.dataset.link;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    copyBtn.textContent = 'Copied!';
    setTimeout(()=>copyBtn.textContent = 'Copy link', 1800);
  } catch (err) {
    console.warn('Clipboard failed', err);
    alert('Copy failed, try manually.');
  }
});

// simple countdown timer display updating expiresAt element
let countdownTimer = null;
function startCountdown(expiresAt) {
  if (countdownTimer) clearInterval(countdownTimer);
  const expiresString = new Date(expiresAt).toLocaleString();
  function update() {
    const now = Date.now();
    const diff = expiresAt - now;
    if (diff <= 0) {
      expiresAtEl.textContent = 'Expired';
      clearInterval(countdownTimer);
      return;
    }
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    expiresAtEl.textContent = `${expiresString} — ${mins}m ${secs}s left`;
  }
  update();
  countdownTimer = setInterval(update, 1000);
}

// optional: click QR to open link on same device
qrImg.addEventListener('click', () => {
  if (downloadLink.href) window.open(downloadLink.href, '_blank');
});
