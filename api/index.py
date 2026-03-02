import sys
import os
from pathlib import Path

# Add the project root and the backend directory to sys.path
# This file is in /api/index.py, so parents[1] is the project root
root_dir = Path(__file__).resolve().parents[1]
backend_dir = root_dir / "backend"
sys.path.append(str(backend_dir))

# Import the FastAPI app
try:
    from app.main import app
except ImportError as e:
    # Diagnostic for Vercel logs if it fails
    print(f"ImportError: {e}")
    print(f"sys.path: {sys.path}")
    print(f"Contents of {backend_dir}: {os.listdir(str(backend_dir)) if backend_dir.exists() else 'NotFound'}")
    raise
