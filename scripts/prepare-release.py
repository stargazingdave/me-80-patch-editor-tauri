"""Prepare the validated Windows installer for the shared distribution publisher."""
import hashlib,json,os,shutil,struct,subprocess,tomllib
from datetime import datetime,timezone
from pathlib import Path
root=Path(__file__).resolve().parents[1]
version=tomllib.loads((root/'Cargo.toml').read_text())['package']['version']
config=json.loads((root/'tauri.conf.json').read_text())
if config['version']!=version:raise ValueError('Version mismatch')
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
if revision!=os.environ['GITHUB_SHA']:raise ValueError('Source revision mismatch')
if subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=root,text=True).strip():raise ValueError('Tracked source changed during validation')
filename=f'me-80-patch-editor_{version}_x64-setup.exe'
source=root/'target/release/bundle/nsis'/filename
# NSIS must be a real PE executable, not a missing or renamed artifact.
with source.open('rb') as f:
 if f.read(2)!=b'MZ':raise ValueError('Not a Windows executable')
 f.seek(0x3c);offset=struct.unpack('<I',f.read(4))[0];f.seek(offset)
 if f.read(4)!=b'PE\0\0':raise ValueError('Invalid PE executable')
out=root/'release-approved';out.mkdir(exist_ok=True)
shutil.copyfile(source,out/filename)
digest=hashlib.sha256((out/filename).read_bytes()).hexdigest()
notes=(root/'RELEASE-NOTES.md').read_text()
release_id='me-80-patch-editor-v'+version.replace('.','-')
bundle={'projectId':'me-80-patch-editor','repository':'stargazingdave/me-80-patch-editor-tauri','githubRelease':{'tag':'v'+version,'commit':revision,'name':'ME-80 Patch Editor '+version+' beta','notes':notes,'prerelease':True},'releases':[{'id':release_id,'productId':'me-80-patch-editor','productName':'ME-80 Patch Editor','version':version,'releasedAt':datetime.now(timezone.utc).isoformat(),'channel':'beta','notes':notes,'status':'active','downloads':[{'id':release_id+'-windows-x64','os':'windows','architecture':'x64','format':'nsis','filename':filename,'size':source.stat().st_size,'sha256':digest,'access':'public'}]}]}
(out/'bundle.json').write_text(json.dumps(bundle,indent=2))
(out/(filename+'.sha256')).write_text(digest+'  '+filename+'\n')
print('Prepared '+filename+' from '+revision)
