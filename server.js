const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const cron = require('node-cron');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CONFIG ----
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---- MULTER CONFIG ----
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const random = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${random}${ext}`);
    }
});

const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt'];

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error('Invalid file type.'));
        }
        cb(null, true);
    }
});

// ---- MIDDLEWARE ----
app.use(cors());
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_DIR));

// ---- CLEANUP JOB ----
const cleanupOldFiles = async () => {
    console.log('Running cleanup job...');
    try {
        const files = await fs.readdir(UPLOADS_DIR);

        for (const file of files) {
            if (file.startsWith('.')) continue;

            const filePath = path.join(UPLOADS_DIR, file);

            try {
                const stats = await fs.stat(filePath);

                // SAFER than birthtimeMs
                const age = Date.now() - stats.mtimeMs;

                if (age > MAX_FILE_AGE_MS) {
                    await fs.unlink(filePath);
                    console.log(`Deleted old file: ${file}`);
                }
            } catch (err) {
                console.error(`Error processing ${file}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Cleanup error:', err.message);
    }
};

// Run cleanup every hour
cron.schedule('0 * * * *', cleanupOldFiles);

// ---- UPLOAD ROUTE ----
app.post('/upload', (req, res) => {
    upload.single('userFile')(req, res, (err) => {

        if (err) {
            return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        res.status(200).json({
            downloadUrl: `/uploads/${req.file.filename}`
        });
    });
});

// ---- START SERVER ----
(async () => {
    try {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        console.log('Uploads directory ready.');

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            cleanupOldFiles(); // initial cleanup
        });
    } catch (err) {
        console.error('Failed to start server:', err.message);
        process.exit(1);
    }
})();
