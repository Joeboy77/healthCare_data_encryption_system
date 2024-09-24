const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const Mailjet = require('node-mailjet');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(cors());

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

const mailjetClient = new Mailjet({
  apiKey: 'c40fbc3de47d215f19fe3570950ec8c2',
  apiSecret: '5b9caa76a7e69fcd37d6d9e8fc6c9d9c',
});

const DEFAULT_RECIPIENT = 'acheampongjoseph470@gmail.com';

const encryptFile = async (filePath) => {
    const key = crypto.randomBytes(32);  // AES 256-bit key
    const iv = crypto.randomBytes(16);   // Initialization vector
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    const input = await fs.readFile(filePath);
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);

    const encryptedFilePath = path.join(__dirname, 'encrypted_files', `${Date.now()}_encrypted.enc`);
    await fs.mkdir(path.dirname(encryptedFilePath), { recursive: true });
    await fs.writeFile(encryptedFilePath, encrypted);

    const keyFilePath = path.join(__dirname, 'keys', `${Date.now()}_key.txt`);
    await fs.mkdir(path.dirname(keyFilePath), { recursive: true });
    await fs.writeFile(keyFilePath, `Key: ${key.toString('hex')}\nIV: ${iv.toString('hex')}`);

    // Now return key and iv along with file paths
    return { encryptedFilePath, key, iv, keyFilePath };
};



const sendEmail = async (filePath, key, iv) => {
    const fileContent = await fs.readFile(filePath);
    const keyContent = key.toString('hex');
    const ivContent = iv.toString('hex');

    try {
        const response = await mailjetClient.post('send', { version: 'v3.1' }).request({
            Messages: [
                {
                    From: {
                        Email: 'joseph.echtech@gmail.com',  
                        Name: 'Healthcare Encryption Tool'
                    },
                    To: [
                        {
                            Email: DEFAULT_RECIPIENT,
                            Name: 'Recipient'
                        }
                    ],
                    Subject: 'Encrypted Healthcare Data',
                    TextPart: 'Attached are the encrypted healthcare data and its key.',
                    Attachments: [
                        {
                            ContentType: 'application/octet-stream',
                            Filename: 'encrypted_file.enc',
                            Base64Content: fileContent.toString('base64')
                        },
                        {
                            ContentType: 'application/octet-stream',
                            Filename: 'encryption_key.bin',
                            Base64Content: keyContent
                        },
                        {
                            ContentType: 'application/octet-stream',
                            Filename: 'iv.bin',
                            Base64Content: ivContent
                        }
                    ]
                }
            ]
        });
        console.log('Email sent successfully');
        return response;
    } catch (error) {
        console.error('Error sending email:', error.message);
        throw error;
    }
};

const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

const cleanupFiles = async () => {
    const now = Date.now();
    const encryptedDir = path.join(__dirname, 'encrypted_files');
    const keysDir = path.join(__dirname, 'keys');

    for (const dir of [encryptedDir, keysDir]) {
        const files = await fs.readdir(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);
            if (now - stats.mtimeMs > CLEANUP_INTERVAL) {
                await fs.unlink(filePath);
                console.log(`Deleted old file: ${filePath}`);
            }
        }
    }
};

setInterval(cleanupFiles, CLEANUP_INTERVAL);


app.post('/encrypt', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { encryptedFilePath, key, iv, keyFilePath } = await encryptFile(req.file.path);

        // Send the email with the encrypted file and key
        await sendEmail(encryptedFilePath, key, iv);

        // Clean up the uploaded and encrypted files after processing
        await fs.unlink(req.file.path);
        // Don't delete the encrypted files so you can provide download links
        // await fs.unlink(encryptedFilePath);

        const encryptedFilename = path.basename(encryptedFilePath);
        const keyFilename = path.basename(keyFilePath);

        // Send a proper response with both download links
        res.status(200).json({
            message: 'File encrypted and sent to email',
            encryptedFile: `/download/${encryptedFilename}`,
            keyFile: `/download/${keyFilename}`
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: 'Failed to encrypt file or send email' });
    }
});




app.get('/download/:filename', (req, res) => {
    const encryptedFilePath = path.join(__dirname, 'encrypted_files', req.params.filename);
    const keyFilePath = path.join(__dirname, 'keys', req.params.filename);
    
    if (fs.existsSync(encryptedFilePath)) {
        res.download(encryptedFilePath, (err) => {
            if (err) {
                console.error('Error downloading encrypted file:', err);
                res.status(404).send('File not found');
            }
        });
    } else if (fs.existsSync(keyFilePath)) {
        res.download(keyFilePath, (err) => {
            if (err) {
                console.error('Error downloading key file:', err);
                res.status(404).send('File not found');
            }
        });
    } else {
        res.status(404).send('File not found');
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});