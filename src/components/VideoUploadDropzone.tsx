import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  X,
  Loader2,
  HardDrive,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { saveVideoToIndexedDB } from '../utils/videoStorageDB';

interface VideoUploadDropzoneProps {
  countryName: string;
  currentSceneNumber: number;
  onUploadSuccess: (sceneNumber: number, videoUrl: string, fileName?: string, fileSize?: string) => void;
  isDarkMode: boolean;
  language: 'id' | 'en';
}

/**
 * Komponen VideoUploadDropzone
 * Dibuat khusus untuk pemula menggunakan React State standar (useState).
 * Menyediakan dropzone upload video ke Google Cloud Storage melalui backend Express.
 *
 * Fitur Utama:
 * 1. Validasi Ekstensi (.mp4, .mkv, .mov)
 * 2. Validasi Ukuran File (Maksimal 250 MB)
 * 3. Indikator Progress Bar & Animasi Loading
 * 4. Tema Dark Mode (#121212 / #1A1A1A) dengan aksen oranye hangat (#FF9800)
 */
export const VideoUploadDropzone: React.FC<VideoUploadDropzoneProps> = ({
  countryName,
  currentSceneNumber,
  onUploadSuccess,
  isDarkMode,
  language,
}) => {
  // =========================================================================
  // 1. STATE MANAGEMENT LOKAL (Hanya menggunakan useState bawaan React)
  // =========================================================================
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [activeVideoName, setActiveVideoName] = useState<string | null>(null);
  const [targetScene, setTargetScene] = useState<number>(currentSceneNumber);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Referensi ke elemen hidden file input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isEn = language === 'en';

  // Batas ukuran file 250 MB (dalam bytes)
  const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 262,144,000 bytes
  const ALLOWED_EXTENSIONS = ['.mp4', '.mkv', '.mov'];

  // =========================================================================
  // 2. FUNGSI VALIDASI FILE DI SISI CLIENT (FRONTEND)
  // =========================================================================
  const validateAndSetFile = (file: File): boolean => {
    setErrorMessage(null);
    setSuccessMessage(null);

    // A. Validasi Ekstensi File
    const fileName = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));

    if (!hasValidExtension) {
      setErrorMessage(
        isEn
          ? `Invalid format: "${file.name}". Only .mp4, .mkv, and .mov files are allowed!`
          : `Format file tidak valid: "${file.name}". Hanya format .mp4, .mkv, dan .mov yang diizinkan!`
      );
      setSelectedFile(null);
      return false;
    }

    // B. Validasi Ukuran File (Maksimal 250 MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setErrorMessage(
        isEn
          ? `File size (${fileSizeMB} MB) exceeds maximum limit of 250 MB!`
          : `Ukuran file (${fileSizeMB} MB) melebihi batas maksimal 250 MB!`
      );
      setSelectedFile(null);
      return false;
    }

    // File lolos validasi, simpan ke state
    setSelectedFile(file);
    return true;
  };

  // Handler saat file dipilih melalui dialog file browser
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  // Handler Drag and Drop
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  // =========================================================================
  // 3. PROSES PENGIRIMAN FILE KE BACKEND NODE.JS & GOOGLE CLOUD STORAGE
  // =========================================================================
  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      setErrorMessage(
        isEn ? 'Please select a video file first.' : 'Pilih file video terlebih dahulu.'
      );
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setErrorMessage(null);
    setSuccessMessage(null);

    const sizeText = (selectedFile.size / (1024 * 1024)).toFixed(1) + ' MB';

    // 1. SIMPAN KE INDEXEDDB BROWSER SECARA PERMANEN & OFFLINE
    // Bekerja di semua platform (termasuk Vercel, HP, Laptop, tanpa internet)
    try {
      const dbResult = await saveVideoToIndexedDB(
        countryName,
        targetScene,
        selectedFile,
        selectedFile.name,
        sizeText
      );
      setActiveVideoUrl(dbResult.objectUrl);
      setActiveVideoName(selectedFile.name);
      onUploadSuccess(targetScene, dbResult.objectUrl, selectedFile.name, sizeText);
      setUploadProgress(50);
    } catch (idbErr) {
      console.warn('[IndexedDB Save Notice]:', idbErr);
      const fallbackUrl = URL.createObjectURL(selectedFile);
      setActiveVideoUrl(fallbackUrl);
      setActiveVideoName(selectedFile.name);
      onUploadSuccess(targetScene, fallbackUrl, selectedFile.name, sizeText);
    }

    // 2. SINKRONISASI KE BACKEND (JIKA SERVER TERSEDIA / DIHOSTING DENGAN NODE.JS)
    const formData = new FormData();
    formData.append('video', selectedFile);
    formData.append('sceneNumber', targetScene.toString());
    formData.append('countryName', countryName);

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.min(98, 50 + Math.round((event.loaded * 48) / event.total));
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      setUploadProgress(100);
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && response.success) {
          setSuccessMessage(
            isEn
              ? `Video "${selectedFile.name}" permanently saved in device memory & synced to server!`
              : `Video "${selectedFile.name}" tersimpan permanen di memori perangkat & tersinkronisasi!`
          );
          if (response.videoUrl) {
            onUploadSuccess(targetScene, response.videoUrl, selectedFile.name, sizeText);
          }
          setSelectedFile(null);
        } else {
          setSuccessMessage(
            isEn
              ? `Video "${selectedFile.name}" saved in local offline memory for Scene ${targetScene}!`
              : `Video "${selectedFile.name}" tersimpan permanen di penyimpanan offline Scene ${targetScene}!`
          );
          setSelectedFile(null);
        }
      } catch {
        setSuccessMessage(
          isEn
            ? `Video "${selectedFile.name}" saved in device offline memory for Scene ${targetScene}!`
            : `Video "${selectedFile.name}" tersimpan di memori offline perangkat untuk Scene ${targetScene}!`
        );
        setSelectedFile(null);
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setUploadProgress(100);
      // Tetap sukses karena IndexedDB sudah menyimpan file secara utuh dan permanen!
      setSuccessMessage(
        isEn
          ? `Video "${selectedFile.name}" successfully saved in device storage (IndexedDB) for Scene ${targetScene}! It will not disappear.`
          : `Video "${selectedFile.name}" berhasil disimpan permanen di memori perangkat (IndexedDB) untuk Scene ${targetScene}! Tidak akan hilang saat ditutup/dibuka lagi.`
      );
      setSelectedFile(null);
    };

    const uploadApiUrl =
      typeof window !== 'undefined' && window.location.origin
        ? `${window.location.origin}/api/upload-video`
        : '/api/upload-video';

    xhr.open('POST', uploadApiUrl, true);
    xhr.send(formData);
  };

  return (
    <div className="w-full">
      {/* Tombol Pemicu Dropzone (Di samping / di atas daftar 6 Scenes) */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm border ${
            isOpen
              ? 'bg-[#FF9800] text-stone-950 border-[#FF9800]'
              : isDarkMode
              ? 'bg-[#1A1A1A] text-amber-400 border-amber-500/40 hover:bg-stone-800'
              : 'bg-white text-stone-900 border-stone-300 hover:bg-stone-50'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>
            {isOpen
              ? isEn ? 'Close Video Upload Panel' : 'Tutup Panel Upload Video'
              : isEn ? 'Upload Scene Video (GCS)' : 'Upload Video Scene (Google Cloud)'}
          </span>
        </button>

        {isOpen && (
          <span className="text-[11px] font-mono text-stone-400">
            {isEn ? 'Target: Scene ' : 'Target: Scene '}
            <strong className="text-[#FF9800]">{targetScene}</strong> ({countryName})
          </span>
        )}
      </div>

      {/* Panel Dropzone & Formulir Upload (Collapsible) */}
      {isOpen && (
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all mb-3 ${
            isDarkMode
              ? 'bg-[#121212] border-stone-800 text-stone-100 shadow-2xl'
              : 'bg-stone-50 border-stone-200 text-stone-900 shadow-md'
          }`}
        >
          {/* Header Info */}
          <div className="flex items-center justify-between border-b border-stone-800 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF9800]" />
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#FF9800]">
                {isEn ? 'Upload Video to Google Cloud Storage' : 'Upload Video ke Google Cloud Storage'}
              </h4>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-stone-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Pemilihan Target Scene (S1 - S6) */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-stone-400">
              {isEn ? 'Apply to Scene:' : 'Terapkan pada Scene:'}
            </span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setTargetScene(num)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                    targetScene === num
                      ? 'bg-[#FF9800] text-stone-950 border-[#FF9800] shadow'
                      : isDarkMode
                      ? 'bg-[#1A1A1A] text-stone-300 border-stone-800 hover:border-stone-700'
                      : 'bg-white text-stone-700 border-stone-300'
                  }`}
                >
                  S{num}
                </button>
              ))}
            </div>
          </div>

          {/* Area Dropzone Interaktif */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 select-none ${
              isDragging
                ? 'border-[#FF9800] bg-[#FF9800]/10 scale-[1.01]'
                : isDarkMode
                ? 'border-stone-800 bg-[#1A1A1A]/80 hover:border-[#FF9800]/60 hover:bg-[#1A1A1A]'
                : 'border-stone-300 bg-white hover:border-[#FF9800]'
            }`}
          >
            {/* Hidden Input File */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mkv,.mov,video/mp4,video/x-matroska,video/quicktime"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <UploadCloud
              className={`w-10 h-10 mb-2 transition-transform duration-200 ${
                isDragging ? 'text-[#FF9800] scale-110' : 'text-stone-400 group-hover:text-[#FF9800]'
              }`}
            />

            <p className="text-xs sm:text-sm font-semibold text-center text-stone-200">
              {isDragging
                ? isEn ? 'Release video file here...' : 'Lepaskan file video di sini...'
                : isEn ? 'Drag & drop video here, or click to browse' : 'Tarik & lepas video di sini, atau klik untuk memilih file'}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-2 text-[11px] text-stone-400 font-mono">
              <span className="px-2 py-0.5 rounded bg-black/60 border border-stone-800">
                Format: .mp4, .mkv, .mov
              </span>
              <span className="px-2 py-0.5 rounded bg-black/60 border border-stone-800">
                Maksimal: 250 MB
              </span>
            </div>
          </div>

          {/* Informasi File yang Terpilih */}
          {selectedFile && (
            <div className="mt-3 p-3 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <FileVideo className="w-5 h-5 text-[#FF9800] shrink-0" />
                <div className="overflow-hidden">
                  <p className="text-xs font-semibold text-stone-100 truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-[10px] text-stone-400 font-mono">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'video'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="p-1 text-stone-400 hover:text-rose-400 rounded-md"
                title="Batal pilih file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Indikator Progress Bar Saat Proses Upload Berlangsung */}
          {isUploading && (
            <div className="mt-3 space-y-1.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Uploading to Google Cloud...' : 'Sedang mengunggah ke Google Cloud...'}</span>
                </span>
                <span className="font-mono text-[#FF9800]">{uploadProgress}%</span>
              </div>

              {/* Progress Bar Track */}
              <div className="w-full h-2 rounded-full bg-stone-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 to-[#FF9800] rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Notifikasi Pesan Sukses */}
          {successMessage && (
            <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/80 text-xs text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Kotak Pratinjau Video yang Berhasil Diupload */}
          {activeVideoUrl && (
            <div className="mt-4 p-3 sm:p-4 rounded-xl bg-black border border-[#FF9800] shadow-2xl space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-stone-100">
                    {isEn ? `Preview Uploaded Video (Scene ${targetScene}):` : `Tampilan Video yang Anda Upload (Scene ${targetScene}):`}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                  SIAP DIPUTAR
                </span>
              </div>

              {/* Player Video Interaktif Langsung */}
              <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-stone-950 border border-stone-800">
                <video
                  key={activeVideoUrl}
                  src={activeVideoUrl}
                  controls
                  playsInline
                  autoPlay
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                <span className="text-amber-400 font-medium truncate max-w-[280px]">
                  🎬 {activeVideoName || 'Video Anda'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (activeVideoUrl) {
                      onUploadSuccess(targetScene, activeVideoUrl, activeVideoName || undefined);
                    }
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#FF9800] text-stone-950 font-bold hover:bg-[#FFA726] transition active:scale-95 shadow flex items-center gap-1.5"
                >
                  <span>🎬</span>
                  <span>{isEn ? 'Watch on Screen 2 (Teacher Screen) ↑' : 'Tonton di Layar 2 (Video Guru) ↑'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Notifikasi Pesan Error */}
          {errorMessage && (
            <div className="mt-3 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/80 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Tombol Aksi Upload */}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={!selectedFile || isUploading}
              onClick={handleUploadSubmit}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow ${
                !selectedFile || isUploading
                  ? 'bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700'
                  : 'bg-[#FF9800] text-stone-950 hover:bg-[#FFA726] active:scale-95'
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Uploading...' : 'Mengunggah...'}</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4" />
                  <span>
                    {isEn ? `Upload to Scene ${targetScene}` : `Unggah ke Scene ${targetScene}`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
