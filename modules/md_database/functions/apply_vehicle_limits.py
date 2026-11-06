# Tara e soglia massima indicate in una prenotazione: appartengono al mezzo, quindi
# vengono salvate sull'anagrafica del veicolo collegato.
# None = non cambiare, -1 = svuota, valore > 0 = imposta.


def apply_vehicle_limits(session, model, vehicle_id, vehicle_data):
    if not vehicle_id:
        return False
    changes = {}
    for key in ("tare", "max_threshold"):
        value = getattr(vehicle_data, key, None)
        if value is None:
            continue
        changes[key] = None if value == -1 else int(value)
    if not changes:
        return False
    vehicle = session.query(model).filter(model.id == vehicle_id).first()
    if not vehicle:
        return False
    changed = False
    for key, value in changes.items():
        if getattr(vehicle, key) != value:
            setattr(vehicle, key, value)
            changed = True
    return changed
