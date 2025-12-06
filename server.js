const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const qrcode = require('qrcode');

// --- Configuration ---
const EXPIRATION_TIME_MS = 60 * 60 * 1000; // 1 hour
const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Ensure 'uploads' directory exists ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// In-memory store for file metadata and deletion timers
const fileStore = new Map();

// --- Multer Configuration (Storage and File Filter) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueId = uuidv4();
        cb(null, uniqueId + path.extname(file.originalname));
    }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|zip|doc|docx|txt|mp4|mov/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype || extname) {
      return cb(null, true);
    }
    // If the file type is not in the list, reject it.
    cb(new Error('File type not allowed.'));
  },
}).single('userFile'); // Use .single() here to create middleware

// --- API Routes ---
app.post('/upload', (req, res) => {
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred (e.g., file too large)
            return res.status(400).json({ success: false, message: err.message });
        } else if (err) {
            // Our custom file filter error or another unknown error occurred
            return res.status(400).json({ success: false, message: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded.' });
        }

        const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
        const downloadUrl = `${req.protocol}://${req.get('host')}/download/${fileId}`;

        // Schedule file deletion by timeout
        const deletionTimeout = setTimeout(() => {
            if (fileStore.has(fileId)) {
                const { filePath } = fileStore.get(fileId);
                fs.unlink(filePath, (unlinkErr) => {
                    if (unlinkErr) console.error(`Error deleting expired file: ${filePath}`, unlinkErr);
                    else console.log(`🗑️ Deleted expired file: ${filePath}`);
                });
                fileStore.delete(fileId);
            }
        }, EXPIRATION_TIME_MS);

        // Store file metadata
        fileStore.set(fileId, {
            filePath: req.file.path,
            originalName: req.file.originalname,
            timeout: deletionTimeout
        });

        // Generate QR code
        qrcode.toDataURL(downloadUrl, (qrErr, qrCodeUrl) => {
            if (qrErr) return res.status(500).json({ success: false, message: 'Could not generate QR code.' });
            res.json({ success: true, downloadUrl, qrCodeUrl });
        });
    });
});

app.get('/download/:id', (req, res) => {
    const fileId = path.basename(req.params.id, path.extname(req.params.id));
    const fileData = fileStore.get(fileId);

    if (!fileData) {
        const checkPath = path.join(uploadsDir, req.params.id); // Check against a potential filename on disk
        // Check filesystem as a fallback in case server restarted, but don't allow download
        if (fs.existsSync(checkPath)) {
            return res.status(404).send('File has expired. Please upload again.');
        }
        return res.status(404).send('File not found or has expired.');
    }
    
    const { filePath, originalName, timeout } = fileData;

    // Clear the scheduled deletion timer since it's being downloaded
    clearTimeout(timeout);

    res.download(filePath, originalName, (err) => {
        // Delete the file after download is complete
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) console.error(`❌ Error deleting file after download: ${filePath}`, unlinkErr);
            else console.log(`✅ Downloaded and deleted file: ${filePath}`);
        });
        fileStore.delete(fileId);
    });
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`✅ QuickShare server running at http://localhost:${port}`);
});

// --- Scheduled Cleanup Job: Deletes files older than 1 hour (Safety Net) ---
// This job is scheduled to run at the beginning of every hour.
cron.schedule('0 * * * *', () => {
    console.log('-------------------------------------');
    console.log('🧹 Running scheduled cleanup job...');

    fs.readdir(uploadsDir, (err, files) => {
        if (err) { 
            console.error("❌ Could not list the directory for cleanup.", err);
            return;
        }

        if (files.length === 0) {
            console.log("📁 Uploads directory is empty. No cleanup needed.");
            return;
        }

        files.forEach((file, index) => {
            const currentFilePath = path.join(uploadsDir, file);
            fs.stat(currentFilePath, (err, stats) => {
                if (err) {
                    console.error(`❌ Could not get stats for file: ${file}`, err);
                    return;
                }

                const expirationTime = Date.now() - EXPIRATION_TIME_MS;
                if (stats.mtime.getTime() < expirationTime) {
                    fs.unlink(currentFilePath, (err) => {
                        if (err) return console.error(`❌ Error deleting file: ${file}`, err);
                        console.log(`🗑️ Successfully deleted old file: ${file}`);
                    });
                }
            });
        });
    });
}, {
    scheduled: true,
    timezone: "Etc/UTC" // Use a standard timezone like UTC
});
