import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import fs from 'fs';

// Muat variabel lingkungan dari file .env jika ada
dotenv.config();

// Definisi __dirname untuk ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ============================================================================
// KONFIGURASI DIREKTORI PENYIMPANAN PERMANEN (DISK & METADATA)
// ============================================================================
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads', 'videos');
const REGISTRY_FILE = path.join(__dirname, 'src', 'data', 'uploadedVideosRegistry.json');

// Pastikan direktori folder upload tersedia
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Helper untuk membaca registri video tersimpan
function getSavedVideoRegistry(): Record<string, Record<string, any>> {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Registry] Gagal membaca uploadedVideosRegistry.json:', err);
  }
  return {};
}

// Helper untuk menyimpan registri video
function saveVideoRegistry(registry: Record<string, Record<string, any>>) {
  try {
    const parentDir = path.dirname(REGISTRY_FILE);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Registry] Gagal menyimpan uploadedVideosRegistry.json:', err);
  }
}

// ============================================================================
// KONFIGURASI CORS (Cross-Origin Resource Sharing)
// Memastikan request dari iframe Google AI Studio, Laptop, dan HP diizinkan
// ============================================================================
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Parsing body JSON dan URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// STATIC & STREAMING VIDEO HOSTING (HTTP Range Requests untuk iOS & Android)
// ============================================================================
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('Accept-Ranges', 'bytes');
  },
}));

// Route streaming khusus untuk video uploads dengan dukungan 206 Partial Content
app.get('/uploads/videos/:filename', (req: Request, res: Response) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File video tidak ditemukan');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Deteksi MIME type ekstensi
  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'video/mp4';
  if (ext === '.mkv') contentType = 'video/x-matroska';
  if (ext === '.mov') contentType = 'video/quicktime';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const fileStream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ============================================================================
// 1. KONFIGURASI GOOGLE CLOUD STORAGE (GCS)
// ============================================================================
const gcsKeyPath = process.env.GCS_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const gcsBucketName = process.env.GCS_BUCKET_NAME || '';

let storage: Storage | null = null;
try {
  if (gcsKeyPath && fs.existsSync(gcsKeyPath)) {
    storage = new Storage({ keyFilename: gcsKeyPath });
    console.log(`[GCS] Menggunakan kredensial file: ${gcsKeyPath}`);
  } else {
    storage = new Storage();
    console.log('[GCS] Menggunakan Google Application Default Credentials');
  }
} catch (err) {
  console.warn('[GCS] Peringatan: Inisialisasi GCS belum terhubung ke service account aktif:', err);
}

// In-memory cache fallback
const localMemoryVideos = new Map<string, { buffer: Buffer; mimeType: string; originalName: string }>();

// ============================================================================
// 2. KONFIGURASI MULTER (MEMORY STORAGE & FILTER FILE)
// ============================================================================
const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250 Megabyte

const memoryStorage = multer.memoryStorage();

const videoFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.mp4', '.mkv', '.mov'];

  if (!allowedExtensions.includes(ext)) {
    return cb(
      new Error(`Format ekstensi file "${ext}" tidak diizinkan. Hanya file video .mp4, .mkv, dan .mov yang diperbolehkan!`)
    );
  }

  const allowedMimeTypes = [
    'video/mp4',
    'video/x-matroska',
    'video/mkv',
    'video/quicktime',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new Error(`Tipe MIME "${file.mimetype}" tidak valid. Hanya file video otentik yang diizinkan!`)
    );
  }

  cb(null, true);
};

const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: MAX_FILE_SIZE, // Batas 250 MB
    files: 1,
  },
  fileFilter: videoFileFilter,
});

// ============================================================================
// 3. ENDPOINTS API SINKRONISASI ANTAR PERANGKAT (LAPTOP & HP)
// ============================================================================

/**
 * GET /api/custom-videos
 * Mengambil daftar video yang pernah diunggah oleh guru (agar sinkron di HP dan Laptop)
 */
app.get('/api/custom-videos', (req: Request, res: Response) => {
  const countryParam = (req.query.country as string || '').toLowerCase().trim();
  const registry = getSavedVideoRegistry();

  if (countryParam) {
    const countryVideos = registry[countryParam] || {};
    return res.json({
      success: true,
      country: countryParam,
      videos: countryVideos,
    });
  }

  return res.json({
    success: true,
    allVideos: registry,
  });
});

/**
 * POST /api/upload-video
 * Menerima file multipart/form-data dengan field 'video'
 * Menyimpan file secara permanen ke disk server DAN registri metadata,
 * sehingga otomatis muncul di HP, laptop, dan perangkat siswa lainnya.
 */
app.post(
  '/api/upload-video',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('video')(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'Ukuran file melebihi batas maksimal 250 MB. Silakan kompres atau pilih file video yang lebih kecil.',
          });
        }
        return res.status(400).json({ success: false, message: `Kesalahan upload: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Tidak ada file video yang diunggah. Mohon pilih file video (.mp4, .mkv, atau .mov).',
        });
      }

      const file = req.file;
      const sceneNumber = req.body.sceneNumber || '1';
      const countryName = req.body.countryName || 'Global';
      const cleanCountry = countryName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const timestamp = Date.now();
      const ext = path.extname(file.originalname).toLowerCase();
      const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const diskFileName = `${cleanCountry}_scene_${sceneNumber}_${timestamp}_${safeOriginalName}`;

      // 1. Simpan file video secara permanen ke Disk Server
      const diskFilePath = path.join(UPLOADS_DIR, diskFileName);
      fs.writeFileSync(diskFilePath, file.buffer);
      console.log(`[Upload] File berhasil disimpan ke disk: ${diskFilePath} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);

      // URL permanen yang dapat diakses oleh HP, laptop, dan perangkat apa pun
      let finalVideoUrl = `/uploads/videos/${encodeURIComponent(diskFileName)}`;
      let storageType = 'server-persistent-disk';

      // 2. Jika Bucket GCS sudah dikonfigurasi, simpan juga ke Google Cloud Storage
      if (storage && gcsBucketName) {
        try {
          const destinationFileName = `documentary_scenes/${cleanCountry}_scene_${sceneNumber}_${timestamp}${ext}`;
          const bucket = storage.bucket(gcsBucketName);
          const gcsFile = bucket.file(destinationFileName);

          await gcsFile.save(file.buffer, {
            contentType: file.mimetype,
            resumable: false,
            metadata: {
              cacheControl: 'public, max-age=31536000',
              metadata: {
                country: countryName,
                sceneNumber: sceneNumber.toString(),
                uploadedAt: new Date().toISOString(),
                originalName: file.originalname,
              },
            },
          });

          finalVideoUrl = `https://storage.googleapis.com/${gcsBucketName}/${destinationFileName}`;
          storageType = 'google-cloud-storage';
          console.log(`[GCS] Berhasil sinkron ke Google Cloud Storage: ${finalVideoUrl}`);
        } catch (gcsErr) {
          console.warn('[GCS] Gagal upload ke GCS bucket, tetap menggunakan server disk:', gcsErr);
        }
      }

      // 3. Simpan entri metadata ke Registri Permanen (Sync Cross-Device)
      const registry = getSavedVideoRegistry();
      if (!registry[cleanCountry]) {
        registry[cleanCountry] = {};
      }

      const fileSizeText = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
      registry[cleanCountry][sceneNumber.toString()] = {
        country: countryName,
        sceneNumber: parseInt(sceneNumber, 10),
        videoUrl: finalVideoUrl,
        fileName: file.originalname,
        fileSize: fileSizeText,
        uploadedAt: new Date().toISOString(),
        storageType,
      };

      saveVideoRegistry(registry);

      return res.json({
        success: true,
        message: `Video untuk Scene ${sceneNumber} (${countryName}) berhasil disimpan secara permanen & tersinkronisasi ke seluruh perangkat (HP & Laptop)!`,
        videoUrl: finalVideoUrl,
        originalName: file.originalname,
        size: file.size,
        fileSize: fileSizeText,
        mimeType: file.mimetype,
        storageType,
      });
    } catch (error: any) {
      console.error('[API Upload Error]:', error);
      return res.status(500).json({
        success: false,
        message: `Gagal mengunggah video: ${error.message || 'Terjadi kesalahan pada server'}`,
      });
    }
  }
);

// Endpoint status kesehatan API
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uploadsDir: UPLOADS_DIR,
    gcsConfigured: !!(storage && gcsBucketName),
    bucket: gcsBucketName || 'belum_dikonfigurasi',
  });
});

// ============================================================================
// 4. INTEGRASI VITE DEV MIDDLEWARES ATAU STATIC DIST
// ============================================================================
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[EduZone Server] Berjalan aktif di http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[EduZone Server] Gagal memulai server:', err);
});
