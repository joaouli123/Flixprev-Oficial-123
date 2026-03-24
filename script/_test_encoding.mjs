// Quick test: verify encoding detection works for planalto.gov.br
async function test() {
  const url = 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm';
  console.log(`Fetching ${url}...`);
  
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (FlixPrev Test/1.0)' },
    signal: AbortSignal.timeout(30000),
  });
  
  const contentType = String(response.headers.get('content-type') || '');
  console.log(`Content-Type: ${contentType}`);
  
  const rawBytes = Buffer.from(await response.arrayBuffer());
  console.log(`Bytes: ${rawBytes.length}`);
  
  // Detect charset - WITH heuristic
  const headerMatch = contentType.match(/charset\s*=\s*([\w-]+)/i);
  let charset = 'utf-8';
  if (headerMatch) {
    charset = headerMatch[1].toLowerCase();
  } else {
    const head = new TextDecoder('ascii', { fatal: false }).decode(rawBytes.slice(0, 4096));
    const metaMatch = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)
      || head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i);
    if (metaMatch) {
      charset = metaMatch[1].toLowerCase();
    } else {
      // Heuristic: if UTF-8 decode produces many U+FFFD, it's probably Latin-1
      const sample = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes.slice(0, 8192));
      const fffd = (sample.match(/\uFFFD/g) || []).length;
      console.log(`Heuristic: ${fffd} U+FFFD in first 8KB → ${fffd > 5 ? 'ISO-8859-1' : 'UTF-8'}`);
      if (fffd > 5) charset = 'iso-8859-1';
    }
  }
  console.log(`Detected charset: ${charset}`);
  
  // Decode with detected charset
  const label = charset.replace('iso-8859-1', 'latin1').replace('windows-1252', 'latin1');
  const correctText = new TextDecoder(label, { fatal: false }).decode(rawBytes);
  
  // Decode wrong way (as UTF-8, what the old code did)
  const wrongText = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
  
  // Check for replacement chars
  const correctReplacements = (correctText.match(/\uFFFD/g) || []).length;
  const wrongReplacements = (wrongText.match(/\uFFFD/g) || []).length;
  
  console.log(`\n--- CORRECT (${charset} → ${label}) ---`);
  console.log(`U+FFFD replacements: ${correctReplacements}`);
  // Find "Art. 5" area
  const idx = correctText.indexOf('Art. 5');
  if (idx > -1) console.log(`Sample: ...${correctText.slice(idx, idx + 200)}...`);
  
  console.log(`\n--- WRONG (forced UTF-8) ---`);
  console.log(`U+FFFD replacements: ${wrongReplacements}`);
  const idx2 = wrongText.indexOf('Art. 5');
  if (idx2 > -1) console.log(`Sample: ...${wrongText.slice(idx2, idx2 + 200)}...`);
  
  console.log(`\n✅ Fix works: ${correctReplacements} vs ${wrongReplacements} U+FFFD chars`);
}

test().catch(e => console.error(e));
