import os

import psycopg2
from dotenv import load_dotenv

load_dotenv()


def conectar_banco():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        database=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        port=os.environ["DB_PORT"]
    )
