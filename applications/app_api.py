import libs.lb_log as lb_log
import libs.lb_config as lb_config
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, PlainTextResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import psutil
import threading
from datetime import datetime, timedelta
from applications.router.generic import GenericRouter
from applications.router.weigher.router import WeigherRouter
from applications.router.anagrafic.router import AnagraficRouter
from applications.router.auth import AuthRouter
from applications.router.printer import PrinterRouter
from applications.router.tunnel_connections import TunnelConnectionsRouter
from applications.router.open_to_customer import OpenToCustomerRouter
from applications.router.sync_folder import SyncFolderRouter
from applications.router.rfid.router import RfidRouter
from applications.router.whoami import WhoAmIRouter
from applications.router.database_viewer import DatabaseViewerRouter
from applications.router.camera_simulator import CameraSimulatorRouter
from pathlib import Path
import os
from fastapi.templating import Jinja2Templates
from applications.middleware.auth import AuthMiddleware
from applications.middleware.no_cache import NoCacheMiddleware
import applications.utils.utils as utils
from libs.lb_utils import base_path
from modules.md_database.functions.delete_pending_non_reservation_accesses import delete_pending_non_reservation_accesses
import modules.md_updating.md_updating as md_updating
from applications.router.anagrafic.manager_anagrafics import manager_anagrafics
import asyncio
from applications.utils.utils_backup import backup_database
# ==============================================================

name_app = "app_api"

# ==============================================================

# ==== MIDNIGHT CLEANUP ========================================
# Thread che esegue la pulizia degli accessi pendenti non prenotati a mezzanotte

_midnight_cleanup_stop_event = threading.Event()

def _midnight_cleanup_loop():
	"""Loop che attende la mezzanotte ed esegue la pulizia degli accessi pendenti non prenotati."""
	while not _midnight_cleanup_stop_event.is_set():
		now = datetime.now()
		# Calcola i secondi fino alla prossima mezzanotte
		next_midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
		seconds_until_midnight = (next_midnight - now).total_seconds()

		lb_log.info(f"Pulizia mezzanotte programmata tra {int(seconds_until_midnight)} secondi")

		# Attendi fino a mezzanotte o fino a quando il thread viene fermato
		if _midnight_cleanup_stop_event.wait(timeout=seconds_until_midnight):
			break  # Lo stop event è stato settato, esci dal loop

		# Backup giornaliero del database: sovrascrive sempre il backup precedente
		backup_database(
			db_path=lb_config.g_config.get("app_api", {}).get("path_database", ""),
			backup_dir=lb_config.g_config.get("app_api", {}).get("path_backup", ""),
		)

		# Controlla se la funzionalità è abilitata nella configurazione
		if not lb_config.g_config.get("app_api", {}).get("delete_pending_accesses_at_midnight", False):
			continue

		try:
			deleted_ids = delete_pending_non_reservation_accesses()
			if deleted_ids:
				# Notifica i client WebSocket della cancellazione
				try:
					loop = asyncio.new_event_loop()
					asyncio.set_event_loop(loop)
					loop.run_until_complete(
						manager_anagrafics["access"].broadcast({"action": "delete", "data": None})
					)
					loop.close()
				except Exception as e:
					lb_log.error(f"Errore durante la notifica WebSocket della pulizia mezzanotte: {e}")
		except Exception as e:
			lb_log.error(f"Errore durante la pulizia mezzanotte: {e}")

# ==============================================================

# ==== MAINPRGLOOP =============================================
# funzione che si connette a redis, setta i moduli e imposta le callback da richiamare dentro i moduli
def mainprg():
	global app
 
	uvicorn.run(app, host="0.0.0.0", port=lb_config.g_config["app_api"]["port"], log_level="info", reload=False)
# ==============================================================


# ==== START ===================================================
# funzione che fa partire la applicazione
def start():
	lb_log.info("start")
	mainprg()  # 	a il loop a mainprg
	lb_log.info("end")
# ==============================================================

def stop():
	# Ferma il thread di pulizia mezzanotte
	_midnight_cleanup_stop_event.set()

	try:
		port = lb_config.g_config["app_api"]["port"]
		connection = [conn for conn in psutil.net_connections() if conn.laddr.port == port] 
		lb_log.info(f"Chiudendo il processo che utilizza la porta {port}...")
		p = psutil.Process(connection[-1].pid)
		p.kill()
		p.wait(timeout=5)  # Attendere al massimo 5 secondi per la chiusura
		lb_log.info(f"Processo sulla porta {port} chiuso con successo.")
	except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired) as e:	
		lb_log.info(f"Impossibile chiudere il processo sulla porta {port}. {e}")

	# closeThread(ssh_client)

# ==== INIT ====================================================
# funzione che dichiara tutte le globali
def init():	
	lb_log.info("init")
	global app

	app = FastAPI()
	utils.base_path_applications = Path(__file__).parent
	path_ui = utils.base_path_applications / lb_config.g_config["app_api"]["path_ui"]
	# Le vecchie interfacce (adq, fiera, ...) sono state rimosse: resta solo static/ui/default (totem, report designer, vista 3D)
	if not path_ui.is_dir():
		lb_log.warning(f"Cartella interfaccia {path_ui} non trovata, uso static/ui/default")
		path_ui = utils.base_path_applications / "static" / "ui" / "default"
	path_content = utils.base_path_applications / lb_config.g_config["app_api"]["path_content"]
	path_images = lb_config.g_config["app_api"]["path_img"]
	if not path_images.startswith("/"):
		path_images = f"{base_path}/{path_images}"
	templates = Jinja2Templates(directory=str(path_ui))

	app.add_middleware(
		CORSMiddleware, 
		allow_origins=[""],
		allow_credentials=True,
		allow_methods=["*"],
		allow_headers=["*"],
	)

	# Aggiungi il middleware al tuo FastAPI
	app.add_middleware(AuthMiddleware)

	# Middleware per disabilitare la cache del browser su HTML, CSS e JS
	app.add_middleware(NoCacheMiddleware)

	generic_router = GenericRouter()
	weigher_router = WeigherRouter()
	anagrafic_router = AnagraficRouter()
	auth_router = AuthRouter()
	printer_router = PrinterRouter()
	tunnel_connections_router = TunnelConnectionsRouter()
	open_to_customer = OpenToCustomerRouter()
	sync_folder_router = SyncFolderRouter()
	rfid_router = RfidRouter()
	whoami_router = WhoAmIRouter()
	database_viewer_router = DatabaseViewerRouter()
	camera_simulator_router = CameraSimulatorRouter()

	# Passa al modulo md_updating il dominio configurato per le chiamate periodiche
	updating_domain = lb_config.g_config.get("app_api", {}).get("updating", {}).get("domain")
	if updating_domain:
		md_updating.set_domain(updating_domain)

	# Avvia il thread di pulizia mezzanotte per eliminare accessi pendenti non prenotati
	_midnight_cleanup_stop_event.clear()
	midnight_thread = threading.Thread(target=_midnight_cleanup_loop, daemon=True, name="midnight-cleanup")
	midnight_thread.start()
	lb_log.info("Thread pulizia mezzanotte avviato")

	app.include_router(weigher_router.router, prefix="/api")

	app.include_router(anagrafic_router.router, prefix="/api")

	app.include_router(printer_router.router, prefix="/api/printer", tags=["printer"])

	app.include_router(generic_router.router, prefix="/api/generic", tags=["generic"])

	app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])

	app.include_router(tunnel_connections_router.router, prefix="/api/tunnel_connections", tags=["tunnel connections"])

	app.include_router(open_to_customer.router, prefix="/api", tags=["open to customer"])

	app.include_router(sync_folder_router.router, prefix="/api/sync-folder", tags=["sync folder"])

	app.include_router(rfid_router.router, prefix="/api/rfid", tags=["rfid"])

	app.include_router(whoami_router.router, tags=["whoami"])

	app.include_router(database_viewer_router.router, prefix="/api/database", tags=["database viewer"])

	# Fotocamera finta per i test (immagine generata a ogni chiamata)
	app.include_router(camera_simulator_router.router, prefix="/api/camera-simulator", tags=["camera simulator"])

	app.mount("/static/content", StaticFiles(directory=path_content), name="content")

	app.mount("/static", StaticFiles(directory=path_ui), name="static")
 
	app.mount("/images", StaticFiles(directory=path_images), name="images")

	# Interfaccia unica (ui-v2): servita sulla radice, montata in fondo a questa funzione
	path_ui_v2 = utils.base_path_applications / "static" / "ui-v2"

	@app.get("/login", include_in_schema=False)
	async def Login():
		return FileResponse(path_ui_v2 / "login.html")

	# Vecchi indirizzi dell'interfaccia precedente: portano alla nuova
	@app.get("/dashboard", include_in_schema=False)
	@app.get("/v2", include_in_schema=False)
	@app.get("/v2/", include_in_schema=False)
	async def LegacyHome():
		return RedirectResponse(url="/")
 
	@app.get('/report-designer/entrata', response_class=HTMLResponse)
	async def report_designer(request: Request):
		"""Endpoint dedicato per il report designer."""
		try:
			nome_variabile = ""
			type = "ENTRATA"
			type_default_report = "IN"
			file_path = path_ui / "report-designer.html"
			
			if not file_path.is_file():
				return HTMLResponse(content="File report-designer.html non trovato", status_code=404)
			
			# Leggi il file HTML
			with open(file_path, 'r', encoding='utf-8') as f:
				html_content = f.read()
			
			# Sostituisci le variabili
			html_content = html_content.replace('{{ nome_variabile }}', nome_variabile)
			html_content = html_content.replace('{{ type }}', type)
			html_content = html_content.replace('{{ type_default_report }}', type_default_report)
			html_content = html_content.replace('{{ default_report_template }}', '/static/content/report/weight_in.json')
			html_content = html_content.replace('{{ report }}', 'report_in')
			
			# Puoi aggiungere altre sostituzioni se servono
			# html_content = html_content.replace('{{ altra_variabile }}', altro_valore)
			
			return HTMLResponse(content=html_content)
			
		except Exception as e:
			print(f"Errore nel caricamento report-designer: {e}")
			return HTMLResponse(content=f"Errore: {str(e)}", status_code=500)

	@app.get('/report-designer/uscita', response_class=HTMLResponse)
	async def report_designer(request: Request):
		"""Endpoint dedicato per il report designer."""
		try:
			nome_variabile = ""
			type = "USCITA"
			type_defualt_report = "OUT"
			file_path = path_ui / "report-designer.html"
			
			if not file_path.is_file():
				return HTMLResponse(content="File report-designer.html non trovato", status_code=404)
			
			# Leggi il file HTML
			with open(file_path, 'r', encoding='utf-8') as f:
				html_content = f.read()
			
			# Sostituisci le variabili
			html_content = html_content.replace('{{ nome_variabile }}', nome_variabile)
			html_content = html_content.replace('{{ type }}', type)
			html_content = html_content.replace('{{ type_default_report }}', type_defualt_report)
			html_content = html_content.replace('{{ default_report_template }}', '/static/content/report/weight_out.json')
			html_content = html_content.replace('{{ report }}', 'report_out')
			
			# Puoi aggiungere altre sostituzioni se servono
			# html_content = html_content.replace('{{ altra_variabile }}', altro_valore)
			
			return HTMLResponse(content=html_content)
			
		except Exception as e:
			print(f"Errore nel caricamento report-designer: {e}")
			return HTMLResponse(content=f"Errore: {str(e)}", status_code=500)

	@app.get('/report-designer/tara', response_class=HTMLResponse)
	async def report_designer_tara(request: Request):
		"""Endpoint dedicato per il report designer della pesatura con tara."""
		try:
			nome_variabile = ""
			type = "TARA"
			type_default_report = "TARE"
			file_path = path_ui / "report-designer.html"

			if not file_path.is_file():
				return HTMLResponse(content="File report-designer.html non trovato", status_code=404)

			with open(file_path, 'r', encoding='utf-8') as f:
				html_content = f.read()

			html_content = html_content.replace('{{ nome_variabile }}', nome_variabile)
			html_content = html_content.replace('{{ type }}', type)
			html_content = html_content.replace('{{ type_default_report }}', type_default_report)
			html_content = html_content.replace('{{ default_report_template }}', '/static/content/report/weight_tare.json')
			html_content = html_content.replace('{{ report }}', 'report_tare')

			return HTMLResponse(content=html_content)

		except Exception as e:
			print(f"Errore nel caricamento report-designer: {e}")
			return HTMLResponse(content=f"Errore: {str(e)}", status_code=500)

	@app.get('/report-designer/generica', response_class=HTMLResponse)
	async def report_designer_generica(request: Request):
		"""Endpoint dedicato per il report designer della pesatura generica."""
		try:
			nome_variabile = ""
			type = "GENERICA"
			type_default_report = "GENERIC"
			file_path = path_ui / "report-designer.html"

			if not file_path.is_file():
				return HTMLResponse(content="File report-designer.html non trovato", status_code=404)

			with open(file_path, 'r', encoding='utf-8') as f:
				html_content = f.read()

			html_content = html_content.replace('{{ nome_variabile }}', nome_variabile)
			html_content = html_content.replace('{{ type }}', type)
			html_content = html_content.replace('{{ type_default_report }}', type_default_report)
			html_content = html_content.replace('{{ default_report_template }}', '/static/content/report/weight_generic.json')
			html_content = html_content.replace('{{ report }}', 'report_generic')

			return HTMLResponse(content=html_content)

		except Exception as e:
			print(f"Errore nel caricamento report-designer: {e}")
			return HTMLResponse(content=f"Errore: {str(e)}", status_code=500)

	def _totem_enabled() -> bool:
		return lb_config.g_config.get("app_api", {}).get("totem_enabled", True)

	@app.get("/dashboard-totem", response_class=HTMLResponse)
	async def DashboardTotem(request: Request):
		if not _totem_enabled():
			return RedirectResponse(url="/")
		return templates.TemplateResponse("dashboard-totem.html", {"request": request})

	@app.get("/totem", response_class=HTMLResponse)
	async def Totem(request: Request):
		if not _totem_enabled():
			return RedirectResponse(url="/")
		return templates.TemplateResponse("totem.html", {"request": request})

	@app.get("/totem.html", response_class=HTMLResponse)
	async def TotemHtml(request: Request):
		if not _totem_enabled():
			return RedirectResponse(url="/")
		return templates.TemplateResponse("totem.html", {"request": request})

	@app.get('/logs/weighing-errors', response_class=PlainTextResponse)
	async def WeighingErrorsLog():
		if os.path.exists(lb_config.g_weighing_error_logfile):
			with open(lb_config.g_weighing_error_logfile, 'r', errors='replace') as f:
				content = f.read()
			return PlainTextResponse(content or "Nessun errore di pesatura registrato.")
		return PlainTextResponse("Nessun errore di pesatura registrato.")

	# Pagine del totem (la navigazione tra le schermate usa indirizzi relativi, es. "totem-plate.html")
	TOTEM_PAGES = [
		"dashboard-totem", "totem-customer", "totem-driver", "totem-material", "totem-plate",
		"totem-subject", "totem-summary", "totem-supplier", "totem-type", "totem-vector",
	]

	def _add_totem_page(page: str):
		async def TotemPage(request: Request):
			if not _totem_enabled():
				return RedirectResponse(url="/")
			return templates.TemplateResponse(f"{page}.html", {"request": request})
		app.add_api_route(f"/{page}.html", TotemPage, methods=["GET"], response_class=HTMLResponse, include_in_schema=False)

	for _page in TOTEM_PAGES:
		_add_totem_page(_page)

	# Tutto il resto è la nuova interfaccia (index.html, css, js)
	app.mount("/", StaticFiles(directory=path_ui_v2, html=True), name="ui")