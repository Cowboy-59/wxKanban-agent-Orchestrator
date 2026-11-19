// Normalize extracted segments and split them into a translatable set and a
// pass-through set (emoji / digits / bare identifiers carry no words).
import fs from 'fs';

const DIR = 'E:/AI_Development/wxperts/wxKanban/docs/i18n/build';
const segs = JSON.parse(fs.readFileSync(`${DIR}/segments.json`, 'utf8'));

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const hasWords = (s) => /[A-Za-z]{2,}/.test(s.replace(/<[^>]+>/g, ' '));

const translatable = [];
const passthrough = [];
for (const s of segs) {
  const html = norm(s.html);
  (hasWords(html) ? translatable : passthrough).push({ ...s, html });
}

fs.writeFileSync(`${DIR}/segments.norm.json`, JSON.stringify([...translatable, ...passthrough], null, 1));
fs.writeFileSync(
  `${DIR}/source.tsv`,
  translatable.map((s) => `${s.id}\t${s.html}`).join('\n') + '\n',
  'utf8',
);
fs.writeFileSync(`${DIR}/passthrough.json`, JSON.stringify(Object.fromEntries(passthrough.map((s) => [s.id, s.html])), null, 1));

console.log('translatable:', translatable.length, 'passthrough:', passthrough.length);
console.log('tsv chars:', translatable.reduce((a, s) => a + s.html.length + s.id.length + 1, 0));
