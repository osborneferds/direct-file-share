const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const cron = require('node-cron');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());

// --- Network IP Address Helper ---
function getLocalIpAddress() {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const networkInterface = networkInterfaces[interfaceName];
        for (const anInterface of networkInterface) {
            // Skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
            if (anInterface.family === 'IPv4' && !anInterface.internal) {
                return anInterface.address;
            }
        }
    }
    return 'localhost'; // Fallback
}

const localIp = getLocalIpAddress();

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
    // Define allowed file types in one place for easier maintenance.
    const allowedTypes = {
      'image/jpeg': ['jpeg', 'jpg'],
      'image/png': ['png'],
      'image/gif': ['gif'],
      'application/pdf': ['pdf'],
      'application/zip': ['zip'],
      'application/msword': ['doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx']
    };

    const allowedMimetypes = Object.keys(allowedTypes);
    const allowedExtensions = new RegExp(Object.values(allowedTypes).flat().join('|'));

    const isMimeTypeAllowed = allowedMimetypes.includes(file.mimetype);
    const isExtensionAllowed = allowedExtensions.test(path.extname(file.originalname).toLowerCase());

    if (isMimeTypeAllowed && isExtensionAllowed) {
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

        // Use the server's local network IP to create a shareable URL
        // This ensures that devices on the same network can access the file.
        const host = req.get('host').includes('localhost') ? `${localIp}:${port}` : req.get('host');
        const fileUrl = `${req.protocol}://${host}/download/${req.file.filename}`;
        res.json({ downloadUrl: fileUrl });
    });
});

// Serve static files from the 'public' directory. This should come AFTER API routes.
app.use(express.static(path.join(__dirname, 'public')));

app.get('/download/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);

    // Security enhancement: Ensure the final path is still within the uploads directory.
    // This prevents directory traversal attacks like `../../etc/passwd`.
    if (!filePath.startsWith(uploadsDir)) {
        return res.status(400).send('Invalid filename.');
    }

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
            res.status(500).send('An error occurred while sending the file.');
        });
    } else {
        res.status(404).send('File not found. It may have been deleted.');
    }
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`✅ Server running!`);
    console.log(`   - Local:   http://localhost:${port}`);
    console.log(`   - Network: http://${localIp}:${port}`);
});

// --- Scheduled Cleanup Job: Deletes files older than 24 hours ---
// This job is scheduled to run at the beginning of every hour.
cron.schedule('0 * * * *', async () => {
    console.log('-------------------------------------');
    console.log('🧹 Running scheduled cleanup job...');

    try {
        const files = await fs.promises.readdir(uploadsDir);

        if (files.length === 0) {
            console.log("📁 Uploads directory is empty. No cleanup needed.");
            return;
        }

        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

        for (const file of files) {
            const filePath = path.join(uploadsDir, file);
            try {
                const stats = await fs.promises.stat(filePath);
                if (stats.mtime.getTime() < twentyFourHoursAgo) {
                    await fs.promises.unlink(filePath);
                    console.log(`🗑️ Successfully deleted old file: ${file}`);
                }
            } catch (statErr) {
                console.error(`❌ Could not process file: ${file}`, statErr);
            }
        }
    } catch (err) {
        console.error("❌ An error occurred during the cleanup job:", err);
    }
}, {
    scheduled: true,
    timezone: "Etc/UTC" // Use a standard timezone like UTC
});
