import multer from 'multer';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
});

export function uploadSingleImage(req, res, next) {
    upload.single('image')(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError) {
            const message = error.code === 'LIMIT_FILE_SIZE'
                ? 'Image must be 5 MB or smaller.'
                : 'Invalid image upload.';
            return res.status(400).json({ error: message, code: error.code });
        }
        return next(error);
    });
}
