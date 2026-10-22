"""
Vercel Serverless Python Entrypoint (api/index.py)
Routes /api/* requests on Vercel to JanardanBackendHandler in server.py.
"""
import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from server import JanardanBackendHandler, init_db

init_db()


class handler(JanardanBackendHandler):
    pass
