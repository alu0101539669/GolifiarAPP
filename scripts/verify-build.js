const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = path.resolve(__dirname, '..', 'www');
const indexPath = path.join(outputDirectory, 'index.html');

if (!fs.existsSync(indexPath)) {
  throw new Error(`Build output is missing: ${indexPath}`);
}

const indexContents = fs.readFileSync(indexPath, 'utf8');
if (!/<html[\s>]/i.test(indexContents)) {
  throw new Error(`Build output is not a valid HTML document: ${indexPath}`);
}

console.log(`Build output verified: ${path.relative(process.cwd(), indexPath)}`);
