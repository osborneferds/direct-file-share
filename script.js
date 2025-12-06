document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const dropZone = document.getElementById('dropZone');
    const userFile = document.getElementById('userFile');
    const dropZonePrompt = document.querySelector('.drop-zone-prompt');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const errorMessage = document.getElementById('errorMessage');
    const linkContainer = document.getElementById('linkContainer');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const downloadLink = document.getElementById('downloadLink');
    const copyButton = document.getElementById('copyButton');
    const cancelButton = document.getElementById('cancelButton');
    const submitButton = uploadForm.querySelector('button');

    let currentXhr = null;

    // --- Drag and Drop Logic ---
    dropZone.addEventListener('click', () => userFile.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    ['dragleave', 'dragend'].forEach(type => {
        dropZone.addEventListener(type, () => dropZone.classList.remove('drag-over'));
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            userFile.files = e.dataTransfer.files;
            userFile.dispatchEvent(new Event('change'));
        }
    });

    // --- File Input Change (for preview) ---
    userFile.addEventListener('change', () => {
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '#';
        if (userFile.files && userFile.files[0]) {
            const file = userFile.files[0];
            dropZonePrompt.textContent = file.name;
            dropZone.classList.add('has-file');
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreviewContainer.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        } else {
            dropZonePrompt.textContent = 'Drag & Drop a file here, or click to select';
            dropZone.classList.remove('has-file');
        }
    });

    // --- Form Submission Logic ---
    const handleUpload = (event) => {
        event.preventDefault();

        // Clear previous results and errors
        qrCodeContainer.innerHTML = '';
        progressContainer.style.display = 'none';
        linkContainer.style.display = 'none';
        errorMessage.textContent = '';

        // Check if a file is selected
        if (!userFile.files || userFile.files.length === 0) {
            errorMessage.textContent = 'Please select a file to upload.';
            return;
        }

        // Check file size (example: limit to 5MB)
        const file = userFile.files[0];
        if (file.size > 5 * 1024 * 1024) {
            errorMessage.textContent = 'File is too large. Max size is 5MB.';
            return;
        }

        // Create a FormData object
        const formData = new FormData();
        formData.append('userFile', file);

        // Provide user feedback during upload
        submitButton.disabled = true;
        submitButton.textContent = 'Uploading...';

        // Create XMLHttpRequest to handle the upload and track progress
        const xhr = new XMLHttpRequest();
        currentXhr = xhr;

        // Listen for progress events
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                progressContainer.style.display = 'block';
                progressBar.style.width = percentComplete + '%';
                progressBar.textContent = percentComplete + '%';
            }
        });

        // Listen for successful upload completion
        xhr.addEventListener('load', () => {
            submitButton.disabled = false;
            currentXhr = null;
            submitButton.textContent = 'Generate QR Code';

            try {
                const result = JSON.parse(xhr.responseText);
                if (xhr.status < 200 || xhr.status >= 300) {
                    throw new Error(result.error || 'An unknown error occurred.');
                }

                const fullDownloadUrl = `${window.location.origin}${result.downloadUrl}`;
                imagePreviewContainer.style.display = 'none';

                // Generate and display the QR code
                const qr = qrcode(0, 'L');
                qr.addData(fullDownloadUrl);
                qr.make();

                const qrCodeElement = qr.createSvgTag({ cellSize: 6, margin: 4 });
                if (qrCodeElement) {
                    qrCodeContainer.appendChild(qrCodeElement);
                } else {
                    errorMessage.textContent = 'QR code generation failed.';
                }

                // Display the link and copy button
                downloadLink.href = fullDownloadUrl;
                downloadLink.textContent = fullDownloadUrl;
                linkContainer.style.display = 'flex';

                copyButton.textContent = 'Copy';
                copyButton.onclick = () => {
                    navigator.clipboard.writeText(fullDownloadUrl).then(() => {
                        copyButton.textContent = 'Copied!';
                        setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy link:', err);
                        errorMessage.textContent = 'Failed to copy the link.';
                    });
                };
            } catch (error) {
                console.error('Upload failed:', error);
                errorMessage.textContent = `Upload failed: ${error.message}`;
            }
        });

        // Listen for upload errors
        xhr.addEventListener('error', () => {
            submitButton.disabled = false;
            submitButton.textContent = 'Retry Upload';
            currentXhr = null;
            errorMessage.textContent = 'Upload failed. A network error occurred.';
        });

        // Listen for upload cancellation
        xhr.addEventListener('abort', () => {
            submitButton.disabled = false;
            submitButton.textContent = 'Generate QR Code';
            currentXhr = null;
            progressContainer.style.display = 'none';
            errorMessage.textContent = 'Upload cancelled.';
        });

        // Configure and send the request
        xhr.open('POST', '/upload', true);
        xhr.send(formData);
    };

    // Bind form submission
    uploadForm.addEventListener('submit', handleUpload);

    // Cancel button event to abort the upload
    cancelButton.addEventListener('click', () => {
        if (currentXhr) {
            currentXhr.abort();
        }
        submitButton.disabled = false;
        submitButton.textContent = 'Generate QR Code';
        progressContainer.style.display = 'none';
        errorMessage.textContent = 'Upload cancelled.';
    });
});
