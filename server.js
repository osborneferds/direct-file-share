// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const helmet = require('helmet');

const PORT = process.env.PORT || 3000;
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, 'storage');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || (100 * 1024 * 1024), 10); // default 100MB
const EXPIRATION_MS = parseInt(process.env.EXPIRATION_MS || (10 * 60 * 1000), 10); // default 10 minutes

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

// --- Orphaned file cleanup on startup ---
// Since metadata is in-memory, any files in storage on startup are orphans from a previous run.
console.log(`Cleaning storage directory: ${STORAGE_DIR}`);
fs.readdir(STORAGE_DIR, (err, files) => {
  if (err) return console.error('Failed to read storage directory for cleanup:', err);

  for (const file of files) {
    fs.unlink(path.join(STORAGE_DIR, file), err => {
      if (err) console.error(`Failed to delete orphaned file ${file}:`, err);
    });
  }
});

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend (public)
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup - store with unique filename in storage dir
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STORAGE_DIR),
  filename: (req, file, cb) => {
    // prefix with random id to avoid collisions
    const rand = crypto.randomBytes(8).toString('hex');
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${rand}-${Date.now()}-${safeName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE } // size limit
});

// In-memory metadata store
// map: id -> { filepath, originalName, expiresAt, timeout }
const files = new Map();

function scheduleDeletion(id, ttl) {
  const entry = files.get(id);
  if (!entry) return;
  if (entry.timeout) clearTimeout(entry.timeout);
  entry.timeout = setTimeout(() => {
    try {
      fs.unlink(entry.filepath, () => {});
    } catch (e) {}
    files.delete(id);
    // console.log(`Auto-deleted file ${id}`);
  }, ttl);
}

// Upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    // generate secure id token
    const id = crypto.randomBytes(18).toString('hex'); // ~36 chars
    const downloadUrl = `${req.protocol}://${req.get('host')}/d/${id}`;

    // store metadata
    const expiresAt = Date.now() + EXPIRATION_MS;
    const meta = {
      filepath: req.file.path,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      expiresAt
    };
    files.set(id, meta);

    // schedule deletion after expiration
    scheduleDeletion(id, EXPIRATION_MS);

    // generate QR code data URL for the download URL
    const qrDataUrl = await QRCode.toDataURL(downloadUrl, { margin: 1 });

    return res.json({
      id,
      downloadUrl,
      qrDataUrl,
      expiresAt
    });
  } catch (err) {
    console.error('Upload error', err);
    return res.status(500).json({ error: 'Server error during upload.' });
  }
});

// Download endpoint - single-use
app.get('/d/:id', (req, res) => {
  const id = req.params.id;
  const entry = files.get(id);
  if (!entry) return res.status(404).send('File not found or expired.');

  // check expiration just in case
  if (Date.now() > entry.expiresAt) {
    try { fs.unlink(entry.filepath, () => {}); } catch (e) {}
    files.delete(id);
    return res.status(410).send('File expired.');
  }

  // stream file as attachment, then delete
  const filename = entry.originalName || path.basename(entry.filepath);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');

  const stream = fs.createReadStream(entry.filepath);
  stream.on('error', (err) => {
    console.error('Stream error', err);
    res.status(500).end('Download error.');
  });

  stream.pipe(res);

  // The 'finish' event is more reliable, as it's emitted after the response has been sent to the client.
  // This ensures we only delete the file after a successful download.
  res.on('finish', () => {
    try { fs.unlink(entry.filepath, () => {}); } catch (e) {}
    if (entry.timeout) clearTimeout(entry.timeout);
    files.delete(id);
  });
});

// --- Multer Error Handling Middleware ---
// This must be defined AFTER the routes that use multer.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading.
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` });
    }
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }
  // For other errors, pass them on.
  next(err);
});

// Extra: endpoint to check status (optional, used by frontend to show expiration)
app.get('/api/status/:id', (req, res) => {
  const entry = files.get(req.params.id);
  if (!entry) return res.status(404).json({ exists: false });
  return res.json({
    exists: true,
    expiresAt: entry.expiresAt,
    size: entry.size,
    originalName: entry.originalName
  });
});

// Simple health
app.get('/health', (req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Storage directory: ${STORAGE_DIR}`);
});
