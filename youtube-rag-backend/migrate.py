# migrate_to_mongo.py
import sqlite3, os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()
client = MongoClient(os.getenv("MONGODB_URI"))
db = client.get_default_database()

con = sqlite3.connect("cognira.db")
con.row_factory = sqlite3.Row

for table in ["users", "history", "conversations", "media", "transcripts"]:
    rows = con.execute(f"SELECT * FROM {table}").fetchall()
    if rows:
        docs = [dict(r) for r in rows]
        db[table].insert_many(docs, ordered=False)
        print(f"Migrated {len(docs)} rows from {table}")

con.close()
print("Done.")