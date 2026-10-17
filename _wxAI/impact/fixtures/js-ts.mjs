// Proof fixture for the native JS/TS reader (SCOPE-137 FR-014, SC-1).
//
// A small project with one seeded link of each of the eight types. prove.mjs
// writes it to a temporary folder, runs the engine for each case, and requires
// every expected link — with its confidence label — to be found. Kept as data so
// its sample fences never sit in a real source tree where auditfences reads them.

// [SCOPE 137 / T015] BEGIN — Native JS/TS proof fixture: seeded links of all eight types (FR-014)
export const fixture = {
  name: 'js-ts',
  profile: 'native',
  files: {
    'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n',
    'src/db/schema.ts': [
      'export const items = pgTable("items", { id: uuid("id") });',
      'export const orders = pgTable("orders", { id: uuid("id"), itemid: uuid("itemid").references(() => items.id) });',
      '',
    ].join('\n'),
    'src/db/migrations/0001_items.sql': 'ALTER TABLE items ADD COLUMN sku text;\n',
    'src/lib/util.ts': 'export function fmt(x: string) {\n  return x.trim();\n}\n\nexport function slug(x: string) {\n  return x.toLowerCase();\n}\n',
    'src/server/service.ts': [
      '// [SCOPE 001 / T001] BEGIN — item service',
      "import { fmt } from '@/lib/util';",
      "import { items } from '../db/schema';",
      'export async function saveItem(db, name: string) {',
      '  await db.insert(items).values({ name: fmt(name) });',
      "  bus.emit('item:saved', name);",
      '}',
      '// [SCOPE 001 / T001] END',
      '',
    ].join('\n'),
    'src/server/report.ts': [
      '// [SCOPE 002 / T001] BEGIN — item report',
      "import { items } from '../db/schema';",
      'export async function listItems(db) {',
      '  return db.select().from(items);',
      '}',
      '// [SCOPE 002 / T001] END',
      '',
    ].join('\n'),
    'src/server/listener.ts': "bus.on('item:saved', () => {});\n",
    'src/server/routes/items.ts': "import { saveItem } from '../service';\nconst router = Router();\nrouter.get('/:id', h);\nexport default router;\n",
    'src/server/app.ts': "import itemsRoutes from './routes/items.js';\napp.use('/api/items', itemsRoutes);\n",
    'src/client/Items.tsx': 'export const Items = () => fetch(`/api/items/${id}`);\n',
    'src/client/Slugs.tsx': "import { slug } from '@/lib/util';\nexport const S = () => slug('X');\n",
  },
  cases: [
    {
      name: 'imports, both directions, through an alias',
      changed: ['src/lib/util.ts'],
      expect: [
        { type: 'import', direction: 'dependent', to: 'src/server/service.ts', confidence: 'Confirmed' },
        { type: 'import', direction: 'dependent', to: 'src/client/Slugs.tsx', confidence: 'Confirmed' },
      ],
    },
    {
      name: 'function level: only importers of the changed export',
      changed: ['src/lib/util.ts'],
      precise: 'src/lib/util.ts:1-3',
      expect: [{ type: 'export-usage', direction: 'dependent', to: 'src/server/service.ts', confidence: 'Confirmed' }],
      expectAbsent: [{ type: 'export-usage', to: 'src/client/Slugs.tsx' }],
    },
    {
      name: 'a service change reaches the screen calling the route that imports it',
      changed: ['src/server/service.ts'],
      expect: [
        { type: 'url-route', direction: 'dependent', to: 'src/client/Items.tsx', confidence: 'Likely' },
        { type: 'table', direction: 'dependent', to: 'src/server/report.ts', confidence: 'Confirmed' },
        { type: 'named-string', direction: 'dependent', to: 'src/server/listener.ts', confidence: 'Likely' },
        { type: 'scope', direction: 'dependent', to: 'scope:002', confidence: 'Confirmed' },
      ],
    },
    {
      name: 'a schema change reaches tables referencing it',
      changed: ['src/db/schema.ts'],
      expect: [{ type: 'foreign-key', direction: 'dependent', to: 'table:orders', confidence: 'Confirmed' }],
    },
    {
      name: 'a migration reaches the tables it alters',
      changed: ['src/db/migrations/0001_items.sql'],
      expect: [{ type: 'migration', direction: 'dependent', to: 'table:items', confidence: 'Confirmed' }],
    },
  ],
};
// [SCOPE 137 / T015] END
