const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const cli=path.join(path.dirname(require.resolve('@dcloudio/vite-plugin-uni/package.json')),'bin','uni.js');
const result=spawnSync(process.execPath,[cli,'build','-p','mp-weixin'],{cwd:root,stdio:'inherit',env:{...process.env,UNI_INPUT_DIR:root,UNI_OUTPUT_DIR:path.join(root,'dist','build','mp-weixin')}});
process.exit(result.status??1);
