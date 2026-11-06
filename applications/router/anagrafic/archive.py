# Archiviazione delle anagrafiche.
# Un'anagrafica mai usata in prenotazioni o pesate viene eliminata; se è già stata usata
# viene archiviata: sparisce dagli elenchi e dai suggerimenti ma resta nel database,
# così prenotazioni e pesate continuano a trovarla. Si può ripristinare in qualsiasi momento.

from fastapi import HTTPException
from modules.md_database.md_database import SessionLocal, Access, InOut, table_models
from modules.md_database.functions.update_data import update_data
from modules.md_database.functions.delete_data import delete_data

_USAGE = {
    "customer": (Access.idCustomer, InOut.idCustomer),
    "supplier": (Access.idSupplier, InOut.idSupplier),
    "vector": (Access.idVector, InOut.idVector),
    "driver": (Access.idDriver, InOut.idDriver),
    "vehicle": (Access.idVehicle,),
    "material": (Access.idMaterial, InOut.idMaterial),
    "card-registry": (Access.idCardRegistry, InOut.idCardRegistry),
}

# Campo che identifica l'anagrafica (unico): serve a ritrovare un record archiviato
NATURAL_KEY = {
    "customer": "social_reason",
    "supplier": "social_reason",
    "vector": "social_reason",
    "driver": "social_reason",
    "vehicle": "plate",
    "material": "description",
    "card-registry": "number",
}


def is_used(table_name: str, record_id: int) -> bool:
    with SessionLocal() as session:
        for column in _USAGE.get(table_name, ()):
            model = column.class_
            if session.query(model.id).filter(column == record_id).first():
                return True
    return False


def delete_or_archive(table_name: str, record_id: int):
    """Elimina il record se non è mai stato usato, altrimenti lo archivia. Restituisce (dati, archiviato)."""
    if is_used(table_name, record_id):
        return update_data(table_name, record_id, {"archived": True}), True
    return delete_data(table_name, record_id), False


def restore(table_name: str, record_id: int):
    model = table_models[table_name]
    with SessionLocal() as session:
        record = session.query(model).filter(model.id == record_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Record non trovato")
    return update_data(table_name, record_id, {"archived": False})


def restore_if_archived(table_name: str, values: dict):
    """
    Se si inserisce un'anagrafica con lo stesso nome di una archiviata, quella viene
    ripristinata e aggiornata con i nuovi dati invece di dare errore di duplicato.
    Restituisce i dati del record ripristinato, oppure None.
    """
    key = NATURAL_KEY.get(table_name)
    value = values.get(key) if key else None
    if not value:
        return None
    model = table_models[table_name]
    with SessionLocal() as session:
        record = session.query(model).filter(getattr(model, key) == value, model.archived == True).first()  # noqa: E712
        if not record:
            return None
        record_id = record.id
    updates = {k: v for k, v in values.items() if v not in (None, "")}
    updates["archived"] = False
    return update_data(table_name, record_id, updates)
