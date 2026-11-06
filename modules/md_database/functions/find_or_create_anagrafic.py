# Riuso di un'anagrafica esistente quando una prenotazione/pesata indica un nome nuovo.
# Se esiste già un record con lo stesso nome (anche archiviato) viene riusato, e se era
# archiviato torna attivo; altrimenti viene creato.

_NATURAL_KEY = {
    "customer": "social_reason",
    "supplier": "social_reason",
    "vector": "social_reason",
    "driver": "social_reason",
    "material": "description",
    "operator": "description",
    "vehicle": "plate",
}


def find_or_create_anagrafic(session, model, values):
    key = _NATURAL_KEY.get(model.__tablename__)
    existing = None
    if key and values.get(key):
        existing = session.query(model).filter(getattr(model, key) == values[key]).first()
    if existing:
        if getattr(existing, "archived", False):
            existing.archived = False
        return existing
    record = model(**values)
    session.add(record)
    session.flush()
    return record
