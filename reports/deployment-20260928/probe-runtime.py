from pathlib import Path
import json
r=Path('/home/ubuntu/apps/quote-project/quote-app')
print(json.dumps({k:[str(p.relative_to(r/k)) for p in (r/k).iterdir()] if (r/k).is_dir() else [] for k in ['public','scripts','src','.cache','openclaw-env']},ensure_ascii=False))
