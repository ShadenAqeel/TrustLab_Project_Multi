// Compile our React JSX without downloading packages. TypeScript may be installed globally.
const fs=require('fs'),path=require('path'),cp=require('child_process');
let ts;
try { ts=require('typescript'); }
catch { const root=cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(); ts=require(path.join(root,'typescript')); }
const src=fs.readFileSync(path.join(__dirname,'../frontend/src/hooks_compat.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../frontend/src/app.jsx'),'utf8');
const out=ts.transpileModule(src,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None},reportDiagnostics:true});
const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
if(errors.length){console.error(errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,'\n')).join('\n'));process.exit(1)}
fs.writeFileSync(path.join(__dirname,'../web/app.js'),out.outputText);
console.log('Built React JSX:',src.length,'bytes source →',out.outputText.length,'bytes application');
