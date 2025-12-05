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
    const filePath = path.join(__dirname, 'uploads', filename);
    res.download(filePath, (err) => {
        if (err) {
            res.status(404).send('File not found or has been deleted.');
        }
    });
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`✅ QuickShare server running at http://localhost:${port}`);
});

// --- Scheduled Cleanup Job ---
// (Your cron job logic can remain here, it will run in the background)
// ... (The cron job code from your original file is correct and can be placed here)
