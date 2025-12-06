const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // Using promises for cleaner async code
const crypto = require('crypto');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuration ---
const UPLOADS_DIR = 'uploads';
const MAX_FILE_AGE_HOURS = 24; // Files older than this will be deleted.
const MAX_FILE_AGE_MS = MAX_FILE_AGE_HOURS * 60 * 60 * 1000;

// --- Multer Configuration ---
// This configures how files are stored.
const storage = multer.diskStorage({
    // 1. Set the destination for uploaded files.
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    // 2. Generate a unique filename to avoid overwriting files.
    filename: (req, file, cb) => {
        // Use a random string + original extension for the new filename.
        const randomString = crypto.randomBytes(8).toString('hex');
        const extension = path.extname(file.originalname);
        cb(null, `${Date.now()}-${randomString}${extension}`);
    }
});

// Initialize multer with the storage configuration.
const upload = multer({ storage: storage });

// --- Middleware ---

// 1. Serve static files from the 'public' directory (HTML, CSS, client-side JS).
app.use(express.static('public'));

// 2. Serve uploaded files from the 'uploads' directory.
// This makes files accessible via URLs like http://localhost:3000/uploads/filename.jpg
app.use(`/${UPLOADS_DIR}`, express.static(UPLOADS_DIR));

// --- Scheduled Cleanup Job ---

/**
 * Scans the uploads directory and deletes files older than MAX_FILE_AGE_MS.
 */
const cleanupOldFiles = async () => {
    console.log('Running scheduled job: Deleting old files...');
    try {
        const files = await fs.readdir(UPLOADS_DIR);

        for (const file of files) {
            // Ignore hidden files like .gitkeep
            if (file.startsWith('.')) continue;

            const filePath = path.join(UPLOADS_DIR, file);
            try {
                const stats = await fs.stat(filePath);
                const fileAge = Date.now() - stats.birthtimeMs;

                if (fileAge > MAX_FILE_AGE_MS) {
                    await fs.unlink(filePath);
                    console.log(`Deleted old file: ${file}`);
                }
            } catch (err) {
                // This can happen if the file is deleted between readdir and stat
                console.error(`Could not process file ${file}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Error reading uploads directory for cleanup:', err);
    }
};

// Schedule the cleanup job to run once every hour.
// Cron format: 'minute hour day-of-month month day-of-week'
cron.schedule('0 * * * *', cleanupOldFiles);

// --- API Routes ---

// POST /upload - The endpoint for handling file uploads.
// 'userFile' must match the 'name' attribute of the <input type="file"> in your HTML form.
app.post('/upload', upload.single('userFile'), (req, res) => {
    // If multer fails or no file is provided, req.file will be undefined.
    if (!req.file) {
        return res.status(400).json({ error: 'No file was uploaded.' });
    }

    // The file was successfully uploaded.
    // req.file contains information about the uploaded file.
    console.log('File uploaded successfully:', req.file.filename);

    // Respond with the relative URL to the uploaded file.
    // The client-side script will combine this with the window origin to create a full URL.
    res.status(200).json({
        downloadUrl: `/${UPLOADS_DIR}/${req.file.filename}`
    });
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    // Optional: Run cleanup on server start
    cleanupOldFiles();
});