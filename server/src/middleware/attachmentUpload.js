import multer from 'multer';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
});

export function uploadSingleAttachment(req, res, next) {
    upload.single('attachment')(req, res, error => {
        if (!error) return next();
        if (error instanceof multer.MulterError) {
            return res.status(400).json({
                error: error.code === 'LIMIT_FILE_SIZE'
                    ? 'Attachment must be 5 MB or smaller.'
                    : 'Invalid attachment upload.',
                code: error.code,
            });
        }
        return next(error);
    });
}
