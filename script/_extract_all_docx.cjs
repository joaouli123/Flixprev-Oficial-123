const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const agentsDir = path.join(__dirname, '..', 'agentes');

function extractDocx(filePath) {
  const AdmZip = require('adm-zip');
  try {
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return '[No word/document.xml found]';
    const xml = entry.getData().toString('utf8');
    // Extract text from XML tags
    const text = xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text;
  } catch (e) {
    return `[Error: ${e.message}]`;
  }
}

// Check if adm-zip is available
try {
  require('adm-zip');
} catch {
  console.log('Installing adm-zip...');
  execSync('npm install adm-zip --no-save', { stdio: 'inherit' });
}

const folders = fs.readdirSync(agentsDir);
for (const folder of folders) {
  const folderPath = path.join(agentsDir, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;
  
  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.docx'));
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📄 ${folder} / ${file}`);
    console.log(`${'='.repeat(80)}\n`);
    const text = extractDocx(filePath);
    console.log(text);
  }
}
