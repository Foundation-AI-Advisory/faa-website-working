import { analyzePdf } from '../src/analyzer/index.js';

const file = process.argv[2];
const result = await analyzePdf({
  filePath: file,
  fileName: file.split('/').pop()!,
  renderDir: '/tmp/gll-probe-render',
  renderUrlPrefix: '/r',
  onStage: (s) => process.stderr.write(`  [${s.status}] ${s.label}\n`),
});
console.log(JSON.stringify(result, null, 2));
