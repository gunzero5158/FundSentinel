import http from 'http';

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Origin': 'http://127.0.0.1:3000'
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) reject(new Error(json.error || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch (e) {
          reject(new Error(`Invalid JSON: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log('1. Adding position 000001...');
  let w = await post('positions', {
    code: '000001',
    holding: true,
    shares: 1000,
    cost: 1.0,
    peakMode: '60'
  });
  let pos = w.positions.find(p => p.code === '000001');
  if (!pos) throw new Error('Position not created');
  const originalHwm = pos.hwm;
  const originalId = pos.id;
  console.log(`   Created with id=${pos.id}, shares=${pos.shares}, cost=${pos.cost}, hwm=${pos.hwm}`);

  console.log('2. Updating position 000001 (shares: 1000->2500, cost: 1.0->1.15, peakMode: keep)...');
  w = await post('positions', {
    id: originalId,
    code: '000001',
    holding: true,
    shares: 2500,
    cost: 1.15,
    peakMode: 'keep'
  });
  pos = w.positions.find(p => p.id === originalId);
  if (!pos) throw new Error('Position disappeared');
  console.log(`   Updated: shares=${pos.shares}, cost=${pos.cost}, hwm=${pos.hwm}`);
  if (pos.shares !== 2500 || pos.cost !== 1.15) throw new Error('Shares or cost mismatch');
  if (pos.hwm !== originalHwm) throw new Error(`HWM changed unexpectedly from ${originalHwm} to ${pos.hwm}`);
  console.log('   HWM successfully preserved!');

  console.log('3. Cleaning up test position...');
  await post('remove-position', { id: originalId });
  console.log('   All verification steps passed successfully!');
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
