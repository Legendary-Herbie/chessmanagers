export * from '../../shared/validation.js';



function validationErrors(source, error) {
    return error.errors.map(issue => ({
        field: source === 'body'
            ? issue.path.join('.')
            : [source, ...issue.path].filter(Boolean).join('.'),
        message: issue.message,
    }));
}

export function validateRequest(schemas) {
    return (req, res, next) => {
        for (const [source, schema] of Object.entries(schemas)) {
            const result = schema.safeParse(req[source]);

            if (!result.success) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    errors: validationErrors(source, result.error),
                });
            }

            if (source === 'body') {
                req.validated = result.data;
                req.body = result.data;
            } else if (source === 'params') {
                req.validatedParams = result.data;
                Object.assign(req.params, result.data);
            } else if (source === 'query') {
                req.validatedQuery = result.data;
            }
        }

        next();
    };
}

export function validate(schema) {
    return validateRequest({ body: schema });
}
