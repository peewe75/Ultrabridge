import sys
import os
from pathlib import Path

# Configura il path in modo che Vercel trovi la cartella "backend"
# e la tratti come un normale package Python
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"

sys.path.insert(0, str(backend_dir))

# Questa riga è quella che il parser statico di Vercel cerca
from app.main import app

# Export esplicito per Vercel
__all__ = ["app"]
