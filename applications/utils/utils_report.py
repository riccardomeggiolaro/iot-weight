from jinja2 import Environment, FileSystemLoader, meta, Undefined
import os
from applications.router.weigher.types import ReportVariables, WeighingPicture
import libs.lb_config as lb_config
from modules.md_database.interfaces.customer import CustomerDataDTO
from modules.md_database.interfaces.supplier import SupplierDataDTO
from modules.md_database.interfaces.vector import VectorDataDTO
from modules.md_database.interfaces.driver import DriverDataDTO
from modules.md_database.interfaces.vehicle import VehicleDataDTO
from modules.md_database.interfaces.material import MaterialDataDTO
from modules.md_database.interfaces.operator import OperatorDataDTO
from modules.md_database.interfaces.card_registry import CardRegistry as CardRegistryDTO
import json
from applications.utils.utils import image_to_base64_data_uri
from reportlab.lib import colors as reportlab_colors
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
from reportlab.lib.units import inch

def get_data_variables(in_out, is_generic=False):
    report_in = lb_config.g_config["app_api"]["report_in"]
    report_out = lb_config.g_config["app_api"]["report_out"]
    report_tare = lb_config.g_config["app_api"].get("report_tare")
    report_generic = lb_config.g_config["app_api"].get("report_generic")
    if is_generic and report_generic:
        report = report_generic
    elif in_out.idWeight2 and in_out.weight2.tare > 0 and report_tare:
        report = report_tare
    else:
        report = report_out if in_out.idWeight2 else report_in
    name_file = ""
    variables = ReportVariables(**{})
    # Dati anagrafici dallo "stampino" della pesata: restano quelli del momento della pesata
    def snap(fn, dto):
        obj = fn(in_out)
        return dto(**vars(obj)) if obj else dto(**{})
    variables.customer = snap(resolve_in_out_customer, CustomerDataDTO)
    variables.supplier = snap(resolve_in_out_supplier, SupplierDataDTO)
    variables.vector = snap(resolve_in_out_vector, VectorDataDTO)
    variables.driver = snap(resolve_in_out_driver, DriverDataDTO)
    variables.vehicle = snap(resolve_in_out_vehicle, VehicleDataDTO)
    variables.material = snap(resolve_in_out_material, MaterialDataDTO)
    variables.card = snap(resolve_in_out_card, CardRegistryDTO)
    variables.operator = in_out.weight1.operator if in_out.weight1 and in_out.weight1.operator else in_out.weight2.operator if in_out.weight2 and in_out.weight2.operator else OperatorDataDTO(**{})
    variables.note = in_out.note
    variables.document_reference = in_out.document_reference
    if in_out.idWeight1:
        pid = in_out.weight1.pid if in_out.weight1.pid else in_out.weight1.id
        name_file = f"{in_out.weight1.weigher}_{pid}"
        variables.weight1.date = in_out.weight1.date.strftime("%d/%m/%Y %H:%M")
        variables.weight1.pid = in_out.weight1.pid
        variables.weight1.weight = in_out.weight1.weight
        if "weighing_pictures" in in_out.weight1.__dict__:
            for w in in_out.weight1.weighing_pictures:
                path = lb_config.g_config["app_api"]["path_img"] + w.path_name
                if os.path.exists(path):
                    img = image_to_base64_data_uri(path)
                    if img:
                        variables.weight1.weighing_pictures.append(WeighingPicture(**{"path_name": img}))
    if in_out.idWeight2:
        pid = in_out.weight2.pid if in_out.weight2.pid else in_out.weight2.id
        if in_out.weight2.tare > 0:
            name_file = f"{in_out.weight2.weigher}_{pid}"
            variables.weight1.weight = in_out.weight2.tare
            variables.weight1.type = "PT" if in_out.weight2.is_preset_tare else "Tara"
            if in_out.weight2.is_preset_weight:
                variables.weight1.type = "P.Peso"
        else:
            name_file = f"{in_out.weight2.weigher}_{in_out.weight1.pid}_{pid}"
        variables.weight2.date = in_out.weight2.date.strftime("%d/%m/%Y %H:%M") if in_out.idWeight2 else ""
        variables.weight2.pid = in_out.weight2.pid if in_out.idWeight2 else ""
        variables.weight2.weight = in_out.weight2.weight if in_out.idWeight2 else ""
        if "weighing_pictures" in in_out.weight2.__dict__:
            for w in in_out.weight2.weighing_pictures:
                path = lb_config.g_config["app_api"]["path_img"] + w.path_name
                if os.path.exists(path):
                    img = image_to_base64_data_uri(path)
                    if img:
                        variables.weight2.weighing_pictures.append(WeighingPicture(**{"path_name": img}))
    variables.net_weight = in_out.net_weight
    name_file += ".pdf"
    return name_file, variables, report

def delete_none_value(data):
    """Recursively removes keys with None values in dictionaries and lists."""
    if isinstance(data, dict):
        # Filter out keys with None values
        return {k: delete_none_value(v) for k, v in data.items() if v is not None}
    elif isinstance(data, list):
        # Remove None values from lists
        return [delete_none_value(item) for item in data if item is not None]
    return data

def get_report_file(report_dir, report_name_file):
    content = os.path.join(report_dir, report_name_file)
    if os.path.exists(content):
        with open(content, 'r', encoding='utf-8') as file:
            return file.read()
    return None

def generate_html_report(reports_dir, report_name_file, v: ReportVariables = None):
    try:
        # Setup path to reports
        # Configura Jinja2 per non crashare su variabili undefined
        env = Environment(loader=FileSystemLoader(reports_dir), undefined=Undefined)
        
        file_path = os.path.join(reports_dir, report_name_file)
        
        # Controlla se è un file JSON o HTML
        if report_name_file.endswith('.json'):
            # Caso JSON: leggi il file e estrai l'HTML dalla chiave "html"
            with open(file_path, 'r', encoding='utf-8') as file:
                json_data = json.load(file)
                html_content = json_data.get('html', '')
            
            # Crea il template dalla stringa HTML
            report = env.from_string(html_content)
            parsed_content = env.parse(html_content)
            
        else:
            # Caso HTML: carica direttamente il template
            report = env.get_template(report_name_file)
            source = env.loader.get_source(env, report_name_file)[0]
            parsed_content = env.parse(source)
        
        # Trova le variabili non dichiarate nel template
        variables = meta.find_undeclared_variables(parsed_content)

        # Rimuovi valori None dal dizionario v
        if v:
            v = delete_none_value(v)

        # Create template data dictionary - non includere chiavi con valore None
        # Questo permette ai filtri Jinja2 | default() di funzionare correttamente
        report_data = {}
        for var in variables:
            if v and var in v and v[var] is not None:
                report_data[var] = v[var]

        # Return the rendered report
        return report.render(**report_data)
        
    except Exception as e:
        raise e

def generate_csv_report(variables: ReportVariables):
    data = [
        variables.customer.id if variables.customer.id else '',
        variables.customer.social_reason if variables.customer.social_reason else '',
        variables.customer.code if variables.customer.code else '',
        variables.customer.cfpiva if variables.customer.cfpiva else '',
        variables.supplier.id if variables.supplier.id else '',
        variables.supplier.social_reason if variables.supplier.social_reason else '',
        variables.supplier.code if variables.supplier.code else '',
        variables.supplier.cfpiva if variables.supplier.cfpiva else '',
        variables.vector.id if variables.vector.id else '',
        variables.vector.social_reason if variables.vector.social_reason else '',
        variables.vector.code if variables.vector.code else '',
        variables.vector.cfpiva if variables.vector.cfpiva else '',
        variables.driver.id if variables.driver.id else '',
        variables.driver.social_reason if variables.driver.social_reason else '',
        variables.driver.telephone if variables.driver.telephone else '',
        variables.card.id if variables.card.id else '',
        variables.card.number if variables.card.number else '',
        variables.card.code if variables.card.code else '',
        variables.vehicle.id if variables.vehicle.id else '',
        variables.vehicle.plate if variables.vehicle.plate else '',
        variables.vehicle.description if variables.vehicle.description else '',
        variables.material.id if variables.material.id else '',
        variables.material.description if variables.material.description else '',
        variables.note,
        variables.document_reference,
        variables.weight1.date if variables.weight1.date else '',
        variables.weight1.pid if variables.weight1.pid else '',
        variables.weight1.weight if variables.weight1.weight else '',
        variables.weight2.date if variables.weight2.date else '',
        variables.weight2.pid if variables.weight2.pid else '',
        variables.weight2.weight if variables.weight2.weight else '',
        variables.net_weight if variables.net_weight else ''
    ]
    csv_line = ";".join([str(v) for v in data])
    return csv_line

def save_file_dir(dir, name_file, content):
    os.makedirs(dir, exist_ok=True)
    path = os.path.join(dir, name_file)
    # Se content è bytes, salva in modalità binaria, altrimenti salva come testo
    if isinstance(content, bytes):
        with open(path, "wb") as f:
            f.write(content)
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(str(content))
    return path

def find_file_in_directory(directory, filename):
    # Cammina attraverso la directory
    for root, dirs, files in os.walk(directory):
        if filename in files:
            file_path = os.path.join(root, filename)
            # Apre il file in modalità lettura binaria e ritorna i bytes
            with open(file_path, 'rb') as f:
                return f.read()  # Restituisce i byte del file
    return None

# ── Lettura dello "stampino" della pesata ─────────────────────────────────────
# I dati anagrafici vanno presi dalla pesata (in_out), mai dall'accesso: l'accesso può
# derivare da una prenotazione e portare dati diversi da quelli pesati. La pesata conserva
# una copia dei dati al momento della pesata (snapshot_version valorizzato); per le pesate
# senza copia si usano le anagrafiche collegate. Ogni funzione restituisce un oggetto con
# gli attributi dell'anagrafica (id, social_reason, ...) oppure None.
from types import SimpleNamespace


def _snapshot(in_out, id_attr, fields, relation=None, relation_fields=None):
    if getattr(in_out, "snapshot_version", None):
        values = {name: getattr(in_out, col, None) for name, col in fields.items()}
        if not any(v not in (None, "") for v in values.values()):
            return None
        return SimpleNamespace(id=getattr(in_out, id_attr, None) if id_attr else None, **values)
    rel = relation(in_out) if relation else None
    if not rel:
        return None
    return SimpleNamespace(id=getattr(rel, "id", None), **{name: getattr(rel, name, None) for name in (relation_fields or fields)})


def _company(kind):
    def resolve(in_out):
        return _snapshot(in_out, f"id{kind.capitalize()}",
                         {"social_reason": f"{kind}_name", "code": f"{kind}_code", "cfpiva": f"{kind}_cfpiva"},
                         lambda io: getattr(io, kind, None))
    return resolve


resolve_in_out_customer = _company("customer")
resolve_in_out_supplier = _company("supplier")
resolve_in_out_vector = _company("vector")


def resolve_in_out_driver(in_out):
    return _snapshot(in_out, "idDriver", {"social_reason": "driver_name", "telephone": "driver_telephone"},
                     lambda io: io.driver)


def resolve_in_out_material(in_out):
    return _snapshot(in_out, "idMaterial", {"description": "material_description", "code": "material_code"},
                     lambda io: io.material)


def resolve_in_out_card(in_out):
    return _snapshot(in_out, "idCardRegistry", {"number": "card_number", "code": "card_code"},
                     lambda io: getattr(io.access, "card_registry", None) if io.access else None)


def resolve_in_out_vehicle(in_out):
    def relation(io):
        return io.access.vehicle if io.access and io.access.vehicle else None
    vehicle = _snapshot(in_out, None, {"plate": "plate", "description": "vehicle_description"}, relation)
    if vehicle and getattr(in_out, "snapshot_version", None):
        rel = relation(in_out)
        vehicle.id = getattr(rel, "id", None) if rel else None
        vehicle.tare = getattr(rel, "tare", None) if rel else None
    return vehicle

def compute_grouped_totals(items, key_fn, value_fn, default_label="Non specificato"):
    totals = {}
    for item in items:
        label = key_fn(item) or default_label
        value = value_fn(item) or 0
        totals[label] = totals.get(label, 0) + value
    return sorted(totals.items(), key=lambda x: (x[0] == default_label, x[0]))

def write_xlsx_totals_section(worksheet, workbook, start_row, title, label_header, value_header, totals):
    if not totals:
        return start_row
    bold_format = workbook.add_format({'bold': True})
    worksheet.write(start_row, 0, title, bold_format)
    start_row += 1
    worksheet.write(start_row, 0, label_header, bold_format)
    worksheet.write(start_row, 1, value_header, bold_format)
    start_row += 1
    for label, total in totals:
        worksheet.write(start_row, 0, label)
        worksheet.write(start_row, 1, total)
        start_row += 1
    return start_row + 1

def build_pdf_totals_flowables(styles, title, label_header, value_header, totals, header_color, common_font_size, col_widths=(200, 100)):
    if not totals:
        return []
    flowables = [Spacer(1, 0.3 * inch), Paragraph(title, styles['Heading3']), Spacer(1, 0.1 * inch)]
    totals_data = [[label_header, value_header]]
    for label, total in totals:
        totals_data.append([label, str(total)])
    totals_table = Table(totals_data, colWidths=list(col_widths))
    totals_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), header_color),
        ('TEXTCOLOR', (0, 0), (-1, 0), reportlab_colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), common_font_size),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.5, reportlab_colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    flowables.append(totals_table)
    return flowables
# ── Migrazione modelli di stampa: soggetto unico → cliente e fornitore ──────────
import re as _re

_CUSTOMER_OK = "customer and customer.social_reason"
_SUPPLIER_OK = "supplier and supplier.social_reason"
_SUBJECT_LINE = (
    "{% if " + _CUSTOMER_OK + " %}Cliente:&nbsp;{{ customer.social_reason }}{% endif %}"
    "{% if " + _CUSTOMER_OK + " and " + _SUPPLIER_OK + " %}<br>{% endif %}"
    "{% if " + _SUPPLIER_OK + " %}Fornitore:&nbsp;{{ supplier.social_reason }}{% endif %}"
)
_RE_TYPE_AND_NAME = _re.compile(r"\{\{\s*typeSubject\s*\}\}\s*:\s*(?:&nbsp;|\s)*\{\{\s*subject\.social_reason\s*\}\}")
_RE_TYPE = _re.compile(r"\{\{\s*typeSubject\s*\}\}")
_RE_FIELD = _re.compile(r"\{\{\s*subject\.(\w+)\s*\}\}")


def migrate_subject_in_template(text: str) -> str:
    """
    Converte un modello di stampa dalle vecchie variabili {{ typeSubject }} / {{ subject.* }}
    alle nuove {{ customer.* }} / {{ supplier.* }}.
    "{{ typeSubject }}: {{ subject.social_reason }}" diventa una riga "Cliente: ..." e/o "Fornitore: ...".
    """
    text = _RE_TYPE_AND_NAME.sub(lambda m: _SUBJECT_LINE, text)
    text = _RE_TYPE.sub(lambda m: "{% if " + _CUSTOMER_OK + " %}Cliente{% elif " + _SUPPLIER_OK + " %}Fornitore{% endif %}", text)
    text = _RE_FIELD.sub(lambda m: (
        "{{ customer." + m[1] + " if customer and customer." + m[1] +
        " else (supplier." + m[1] + " if supplier else '') }}"
    ), text)
    return text


def migrate_report_templates(reports_dir) -> int:
    """Aggiorna i modelli di stampa (.json/.html) nella cartella dei report. Restituisce i file modificati."""
    changed = 0
    if not reports_dir or not os.path.isdir(reports_dir):
        return 0
    for root, _dirs, files in os.walk(reports_dir):
        for name in files:
            if not name.lower().endswith((".json", ".html")):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    original = f.read()
                if "typeSubject" not in original and "subject." not in original:
                    continue
                updated = migrate_subject_in_template(original)
                if updated == original:
                    continue
                if name.lower().endswith(".json"):
                    json.loads(updated)  # non salvare un JSON rotto
                with open(path, "w", encoding="utf-8") as f:
                    f.write(updated)
                changed += 1
            except Exception as e:
                import libs.lb_log as lb_log
                lb_log.error(f"Migrazione modello di stampa '{path}' non riuscita: {e}")
    return changed


def in_out_plate(in_out):
    vehicle = resolve_in_out_vehicle(in_out)
    return vehicle.plate if vehicle else None


def in_out_material_description(in_out):
    material = resolve_in_out_material(in_out)
    return material.description if material else None
