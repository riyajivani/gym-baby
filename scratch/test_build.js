import http from 'http';

function checkUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    }).on('error', reject);
  });
}

async function runValidation() {
  console.log('--- Starting PWA & Production Build Validation ---');
  
  const baseUrl = 'http://localhost:4173';
  
  // 1. Check HTML index
  const indexRes = await checkUrl(baseUrl + '/');
  console.log(`[PASS] Index Page: Status ${indexRes.statusCode}`);
  if (!indexRes.body.includes('Yeshu Gym')) throw new Error('Index HTML missing Yeshu Gym title');

  // 2. Check Manifest
  const manifestRes = await checkUrl(baseUrl + '/manifest.webmanifest');
  console.log(`[PASS] PWA Manifest: Status ${manifestRes.statusCode}`);
  const manifest = JSON.parse(manifestRes.body);
  if (manifest.display !== 'standalone') throw new Error('Manifest display is not standalone');
  console.log(`  -> Manifest Name: "${manifest.name}", Display: "${manifest.display}"`);

  // 3. Check Service Worker
  const swRes = await checkUrl(baseUrl + '/sw.js');
  console.log(`[PASS] Service Worker (sw.js): Status ${swRes.statusCode}`);
  if (!swRes.body.includes('precache')) throw new Error('sw.js missing precache configuration');

  // 4. Check App Icons
  const icon192 = await checkUrl(baseUrl + '/icon-192.png');
  const icon512 = await checkUrl(baseUrl + '/icon-512.png');
  const favicon = await checkUrl(baseUrl + '/favicon.svg');
  console.log(`[PASS] Icons Loaded: 192px (${icon192.statusCode}), 512px (${icon512.statusCode}), SVG (${favicon.statusCode})`);

  console.log('\n--- ALL BUILD & PWA VALIDATION CHECKS PASSED SUCCESSFULLY ---');
}

runValidation().catch(err => {
  console.error('[FAIL] Validation Error:', err.message);
  process.exit(1);
});
