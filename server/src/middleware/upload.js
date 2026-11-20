import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { uploadsDir } from '../paths.js';
import { HttpError } from '../utils/httpError.js';

const MAX_BYTES = 2 * 1024 * 1024;
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT_BY_MIME[file.mimetype]),
});

const invalidType = () => new HttpError(400, 'INVALID_UPLOAD', 'Image must be a JPG, PNG or WEBP file');

const multerSingle = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => (EXT_BY_MIME[file.mimetype] ? cb(null, true) : cb(invalidType())),
}).single('image');

// The client-supplied mimetype can lie, so confirm the file's magic bytes too.
function looksLikeImage(filePath, mimetype) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  if (mimetype === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mimetype === 'image/png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === 'image/webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

// Optional single "image" field. On success req.file is set (or undefined if no file was sent).
export function uploadImage(req, res, next) {
  multerSingle(req, res, (err) => {
    if (err) return next(err);
    if (req.file && !looksLikeImage(req.file.path, req.file.mimetype)) {
      removeUploadedFile(req.file.path);
      return next(invalidType());
    }
    next();
  });
}

export const imageUrlFor = (file) => `/uploads/${file.filename}`;

export function removeUploadedFile(filePath) {
  fs.promises.unlink(filePath).catch(() => {});
}

// Deletes a previously stored image given its image_url ("/uploads/<name>").
export function removeStoredImage(imageUrl) {
  if (!imageUrl?.startsWith('/uploads/')) return;
  removeUploadedFile(path.join(uploadsDir, path.basename(imageUrl)));
}
