# Database Migrations

This project uses **node-pg-migrate** to manage schema changes.

## Overview

- **Location**: `server/src/database/migrations/`
- **Config**: `server/.pgmigraterc.json`
- **Migrations Table**: `pgmigrations` (auto-created in public schema)

Migrations run automatically on server startup via `database.init()`.

## Creating New Migrations

### 1. Generate a migration file:

```bash
cd server
npm run migrate create <migration-name>
```

This creates a timestamped file in `src/database/migrations/`.

### 2. Edit the migration with up/down functions:

```javascript
exports.up = pgm => {
    pgm.createTable('new_table', {
        id: { type: 'integer', generatedAlwaysAsIdentity: true, primaryKey: true },
        name: { type: 'text', notNull: true },
    });
};

exports.down = pgm => {
    pgm.dropTable('new_table');
};
```

### 3. Restart the server to apply

Migrations run on `db.init()` during server startup.

## Common Operations

### Create Table
```javascript
pgm.createTable('table_name', {
    id: { type: 'integer', generatedAlwaysAsIdentity: true, primaryKey: true },
    email: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
});
```

### Add Column
```javascript
pgm.addColumn('table_name', {
    new_column: { type: 'text' },
});
```

### Create Index
```javascript
pgm.createIndex('table_name', 'column_name');
pgm.createIndex('table_name', ['col1', 'col2']);
```

### Raw SQL
```javascript
pgm.sql(`
    ALTER TABLE table_name ADD CONSTRAINT constraint_name
    CHECK (condition);
`);
```

## Rollback

To rollback the last migration:

```bash
cd server
npm run migrate down
```

To rollback all migrations:

```bash
npm run migrate down -- --test
```

## Documentation

- [node-pg-migrate Docs](https://salsita.github.io/node-pg-migrate/#/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
