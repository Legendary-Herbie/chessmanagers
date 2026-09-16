export function parseInput(schema, values) {
    const result = schema.safeParse(values);
    if (result.success) return result.data;
    throw Object.assign(new Error(result.error.issues[0].message), {
        status: 400,
        type: 'validation',
        errors: result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })),
    });
}
