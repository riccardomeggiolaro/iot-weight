"""
Genera un file CSV di esempio nel formato Sistema di Pesatura.
Il file viene salvato nella cartella WATCH_DIR (default /var/opt/in-out/csv).

Uso:
    python genera_csv_esempio.py
    python genera_csv_esempio.py --righe 5 --out /tmp/test.csv
"""

import os
import csv
import argparse
import random
from datetime import datetime, timedelta
from pathlib import Path

# --- Dati di esempio ---
# (id, ragione sociale, codice gestionale, descrizione)
CLIENTI = [
    (1, "Baronpesi Srl",       "C001", "Sede Vicenza"),
    (2, "Metalli Vicentini",   "C002", ""),
    (3, "Rottami Nord Est",    "",     "Cliente occasionale"),
]

FORNITORI = [
    (1, "Acciaierie Venete",   "F001", ""),
    (2, "Recuperi Metalli",    "F002", "Ritiro rottame"),
    None,                       # pesata senza fornitore
]

VETTORI = [
    (1, "DHL",          "V001", ""),
    (2, "BRT",          "V002", ""),
    (3, "Fercam",       "",     "Trasporti Bolzano"),
]

AUTISTI = [
    (1, "Marco Ruggero",   "A01", ""),
    (2, "Luca Bianchi",    "",    "Autista esterno"),
    (3, "Giorgio Ferrari", "A03", ""),
]

TESSERE = [
    (1, "00485", "3C00B4A1AC"),
    (2, "00511", "3C00B3E3EB"),
    (3, "00509", "01154A7BC5"),
]

VEICOLI = [
    (7,  "AB123CD", "Iveco Daily"),
    (12, "FG456HI", "Scania R450"),
    (3,  "ZX789WQ", "Mercedes Actros"),
]

MATERIALI = [
    (1, "Ferro",        "M01"),
    (2, "Rame",         "M02"),
    (3, "Alluminio",    "M03"),
    (4, "Acciaio inox", ""),
]

NOTE_LIST = [
    "Nota di prova",
    "Consegna urgente",
    "",
    "Materiale certificato",
    "Verifica peso richiesta",
]


PESE = ["P1", "P2"]


def genera_pid(n: int) -> str:
    """Genera un PID nel formato 00000-XXXXX."""
    return f"00000-{n:05d}"


def genera_riga(n: int) -> list:
    """Genera una riga CSV con dati realistici."""
    cli     = random.choice(CLIENTI)
    forn    = random.choice(FORNITORI) or ("", "", "", "")
    vett    = random.choice(VETTORI)
    aut     = random.choice(AUTISTI)
    tess    = random.choice(TESSERE)
    veic    = random.choice(VEICOLI)
    mat     = random.choice(MATERIALI)
    nota    = random.choice(NOTE_LIST)
    bolla   = f"DDT{datetime.now().strftime('%Y%m%d')}{n:03d}"

    # Prima pesata: ora casuale nelle ultime 8 ore
    now   = datetime.now()
    data1 = now - timedelta(hours=random.randint(1, 8), minutes=random.randint(0, 59))
    data2 = data1 + timedelta(minutes=random.randint(5, 30))

    peso1 = random.randint(8000, 25000)   # veicolo carico
    peso2 = random.randint(3000, 7000)    # veicolo vuoto

    pid1  = genera_pid(n * 2 - 1)
    pid2  = genera_pid(n * 2)

    fmt = "%d/%m/%Y %H:%M"

    return [
        str(cli[0]), cli[1], cli[2], cli[3],        #  0- 3 cliente: id, ragione sociale, codice, descrizione
        str(forn[0]), forn[1], forn[2], forn[3],    #  4- 7 fornitore
        str(vett[0]), vett[1], vett[2], vett[3],    #  8-11 vettore
        str(aut[0]), aut[1], aut[2], aut[3],        # 12-15 autista: id, nome e cognome, codice, descrizione
        str(tess[0]),               # 16 id_tessera
        tess[1],                    # 17 numero_tessera
        tess[2],                    # 18 codice_tessera
        str(veic[0]),               # 19 id_veicolo
        veic[1],                    # 20 targa_veicolo
        veic[2],                    # 21 descrizione_veicolo
        str(mat[0]),                # 22 id_materiale
        mat[1],                     # 23 descrizione_materiale
        mat[2],                     # 24 codice_materiale
        nota,                       # 25 note
        bolla,                      # 26 referenza_documento
        data1.strftime(fmt),        # 27 data1
        pid1,                       # 28 pid1
        str(peso1),                 # 29 peso1
        data2.strftime(fmt),        # 30 data2
        pid2,                       # 31 pid2
        str(peso2),                 # 32 peso2
        str(abs(peso1 - peso2)),    # 33 netto
    ]


def main():
    parser = argparse.ArgumentParser(description="Genera CSV di esempio per il sistema di pesatura.")
    parser.add_argument("--righe", type=int, default=3,  help="Numero di righe da generare (default: 3)")
    parser.add_argument("--out",   type=str, default="", help="Cartella di output (default: WATCH_DIR)")
    parser.add_argument("--pesa",  type=str, default="", help="Nome pesa (default: casuale tra P1/P2)")
    args = parser.parse_args()

    # Se --out è specificato, usa quella cartella; altrimenti WATCH_DIR
    if args.out:
        out_dir = Path(args.out)
    else:
        out_dir = Path(os.environ.get("WATCH_DIR", "/var/opt/in-out/csv"))

    out_dir.mkdir(parents=True, exist_ok=True)

    campi = [
        "id_cliente","ragione_sociale_cliente","codice_cliente","descrizione_cliente",
        "id_fornitore","ragione_sociale_fornitore","codice_fornitore","descrizione_fornitore",
        "id_vettore","ragione_sociale_vettore","codice_vettore","descrizione_vettore",
        "id_autista","nome_autista","codice_autista","descrizione_autista",
        "id_tessera","numero_tessera","codice_tessera",
        "id_veicolo","targa_veicolo","descrizione_veicolo",
        "id_materiale","descrizione_materiale","codice_materiale","note","referenza_documento",
        "data1","pid1","peso1","data2","pid2","peso2","netto",
    ]

    for i in range(1, args.righe + 1):
        riga = genera_riga(i)
        # Nome file come lo genera il sistema in uscita: <pesa>_<pid1>_<pid2>.csv
        pesa = args.pesa or random.choice(PESE)
        file_path = out_dir / f"{pesa}_{riga[28]}_{riga[31]}.csv"

        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, delimiter=";")
            writer.writerow(riga)

        print(f"✓ File {i}/{args.righe}: {file_path.name}")

        # Anteprima solo del primo file
        if i == 1:
            print("\n  Anteprima:")
            for nome, valore in zip(campi, riga):
                print(f"    {nome:<30} = {valore}")
            print()


if __name__ == "__main__":
    main()