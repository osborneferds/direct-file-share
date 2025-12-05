const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Ensure 'uploads' directory exists ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// --- Multer Configuration (Storage and File Filter) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|zip|doc|docx/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    // Reject the file and pass an error to be handled
    cb(new Error('File type not allowed. Please upload images, documents, or archives.'));
  }
}).single('userFile'); // Use .single() here to create middleware

// --- API Routes ---
app.post('/upload', (req, res) => {
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred (e.g., file too large).
            return res.status(400).json({ error: err.message });
        } else if (err) {
            // An unknown error occurred (e.g., our custom file filter error).
            return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const fileUrl = `${req.protocol}://${req.get('host')}/download/${req.file.filename}`;
        res.json({ downloadUrl: fileUrl });
    });
});

app.get('/download/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);

    // 1. Check if the file exists before attempting to send it.
    if (fs.existsSync(filePath)) {
        // 2. Force the browser to download by setting a generic Content-Type.
        // This prevents browsers (especially on mobile) from trying to open the file directly.
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        // 3. Stream the file to the response.
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res).on('error', (err) => {
            // Handle stream errors
            console.error('Error streaming the file:', err);
            if (err) {
                res.status(500).send('An error occurred while sending the file.');
            }
        });
    } else {
        res.status(404).send('File not found. It may have been deleted.');
    }
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`✅ QuickShare server running at http://localhost:${port}`);
});

// --- Scheduled Cleanup Job: Deletes files older than 24 hours ---
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
            const filePath = path.join(uploadsDir, file);

            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(`❌ Could not get stats for file: ${file}`, err);
                    return;
                }

                const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
                if (stats.mtime.getTime() < twentyFourHoursAgo) {
                    fs.unlink(filePath, (err) => {
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
