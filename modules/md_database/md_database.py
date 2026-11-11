from sqlalchemy import event, select, create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, Enum, func, Date, Time, text, inspect, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, object_session
from sqlalchemy.ext.hybrid import hybrid_property
from enum import Enum as PyEnum
from datetime import datetime
import libs.lb_config as lb_config
from libs.lb_utils import hash_password, base_path
import libs.lb_log as lb_log

# Database connection
Base = declarative_base()
path_database = lb_config.g_config['app_api']['path_database']
if not path_database.startswith('/'):
    base_dir = f"{base_path}/{path_database}"
path_database = f"sqlite:///{path_database}"
lb_log.warning(path_database)
engine = create_engine(path_database)
SessionLocal = sessionmaker(bind=engine)

# Model for User table
class User(Base):
    __tablename__ = 'user'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(collation="NOCASE"), unique=True, index=True)
    password = Column(String)
    level = Column(Integer)
    description = Column(String)
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)

    # Relazione con LockRecord
    lock_records = relationship("LockRecord", back_populates="user", cascade="all, delete")
    weighings = relationship("Weighing", back_populates="user", cascade="all, delete")

# Model for Customer table (clienti)
class Customer(Base):
    __tablename__ = 'customer'
    id = Column(Integer, primary_key=True, index=True)
    social_reason = Column(String(collation="NOCASE"), index=True, unique=True)
    description = Column(String, nullable=True)
    code = Column(String(collation="NOCASE"), index=True, unique=True, nullable=True)  # codice nel gestionale
    archived = Column(Boolean, default=False, nullable=False, server_default=text("0"))
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)

    accesses = relationship("Access", back_populates="customer", cascade="all, delete")

# Model for Supplier table (fornitori)
class Supplier(Base):
    __tablename__ = 'supplier'
    id = Column(Integer, primary_key=True, index=True)
    social_reason = Column(String(collation="NOCASE"), index=True, unique=True)
    description = Column(String, nullable=True)
    code = Column(String(collation="NOCASE"), index=True, unique=True, nullable=True)  # codice nel gestionale
    archived = Column(Boolean, default=False, nullable=False, server_default=text("0"))
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)

    accesses = relationship("Access", back_populates="supplier", cascade="all, delete")

# Model for Vector table
class Vector(Base):
    __tablename__ = 'vector'
    id = Column(Integer, primary_key=True, index=True)
    social_reason = Column(String(collation="NOCASE"), index=True, unique=True)
    description = Column(String, nullable=True)
    code = Column(String(collation="NOCASE"), index=True, unique=True, nullable=True)  # codice nel gestionale
    archived = Column(Boolean, default=False, nullable=False, server_default=text("0"))
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)

    accesses = relationship("Access", back_populates="vector", cascade="all, delete")

# Model for Driver table
class Driver(Base):
    __tablename__ = 'driver'
    id = Column(Integer, primary_key=True, index=True)
    social_reason = Column(String)  # nome e cognome
    description = Column(String, nullable=True)
    code = Column(String(collation="NOCASE"), index=True, unique=True, nullable=True)  # codice nel gestionale
    archived = Column(Boolean, default=False, nullable=False, server_default=text("0"))
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)

    accesses = relationship("Access", back_populates="driver", cascade="all, delete")

# Model for Vehicle table
class Vehicle(Base):
    __tablename__ = 'vehicle'
    id = Column(Integer, primary_key=True, index=True)
    plate = Column(String(collation="NOCASE"), index=True, unique=True)
    description = Column(String, nullable=True)
    tare = Column(Integer, nullable=True)
    max_threshold = Column(Integer, nullable=True)
    archived = Column(Boolean, default=False, nullable=False, server_default=text("0"))
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)

    accesses = relationship("Access", back_populates="vehicle", cascade="all, delete")

# Model for Material table
class Material(Base):
    __tablename__ = 'material'
    id = Column(Integer, primary_key=True, index=True)
    description = Column(String(collation="NOCASE"), index=True, unique=True)
    code = Column(String(collation="NOCASE"), index=True, unique=True, nullable=True)  # codice nel gestionale
    archived = Column(Boolean, default=False, nullable=False, server_default=text("0"))
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)

    in_out = relationship("InOut", back_populates="material", cascade="all, delete")
    accesses = relationship("Access", back_populates="material")

class Operator(Base):
    __tablename__ = 'operator'
    id = Column(Integer, primary_key=True, index=True)
    description = Column(String(collation="NOCASE"), index=True, unique=True)
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)
    
    weighings = relationship("Weighing", back_populates="operator", cascade="all, delete")

# Model for Weighing table
class Weighing(Base):
    __tablename__ = 'weighing'
    __table_args__ = (
        UniqueConstraint('pid', 'weigher_serial_number', name='uq_weighing_pid_serial'),
    )
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, server_default=func.now(), default=datetime.now)
    weigher = Column(String, nullable=True)
    weigher_serial_number = Column(String, nullable=True)
    pid = Column(String, index=True, nullable=True)
    is_preset_tare = Column(Boolean, default=False, nullable=True)
    is_preset_weight = Column(Boolean, default=False, nullable=True)
    tare = Column(Integer, nullable=True)
    weight = Column(Integer, nullable=True)
    log = Column(String, nullable=True)
    idUser = Column(Integer, ForeignKey('user.id'))
    idOperator = Column(Integer, ForeignKey('operator.id'))

    # Relationships
    weighing_pictures = relationship("WeighingPicture", back_populates="weighing", cascade="all, delete")
    in_out_weight1 = relationship("InOut", foreign_keys="InOut.idWeight1", back_populates="weight1")
    in_out_weight2 = relationship("InOut", foreign_keys="InOut.idWeight2", back_populates="weight2")
    user = relationship("User", back_populates="weighings")
    operator = relationship("Operator", back_populates="weighings")

class WeighingPicture(Base):
    __tablename__ = 'weighing_picture'
    id = Column(Integer, primary_key=True, index=True)
    path_name = Column(String, nullable=False)
    idWeighing = Column(Integer, ForeignKey('weighing.id'))

    weighing = relationship("Weighing", back_populates="weighing_pictures")

class AccessStatus(PyEnum):
    WAITING = "Attesa"
    OPEN = "Aperto"
    ENTERED = "Entrato"
    CLOSED = "Chiusa"

class TypeAccess(PyEnum):
    RESERVATION = "Prenotazione"
    MANUALLY = "Manuale"
    TEST = "Test"

class AccessMode(PyEnum):
    STANDARD = "Standard"
    TRANSIT = "Transito"
    GENERIC = "Generica"  # ogni pesata è una generica, chiusura in base a number_in_out

class CardRegistry(Base):
    __tablename__ = 'card_registry'
    id = Column(Integer, primary_key=True, index=True)
    number = Column(String(collation="NOCASE"), index=True, unique=True)
    code = Column(String(collation="NOCASE"), index=True, unique=True)
    archived = Column(Boolean, default=False, nullable=False, server_default=text("0"))
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)
    accesses = relationship("Access", back_populates="card_registry")

class WeighingTerminal(Base):
    __tablename__ = 'weighing-terminal'
    id = Column(Integer, primary_key=True, index=True)
    id_terminal = Column(String, nullable=True, index=True)
    bil = Column(String, nullable=True)
    badge = Column(String, nullable=True, index=True)
    plate = Column(String, nullable=True, index=True)
    customer = Column(String, nullable=True, index=True)
    supplier = Column(String, nullable=True, index=True)
    material = Column(String, nullable=True, index=True)
    notes1 = Column(String, nullable=True)
    notes2 = Column(String, nullable=True)
    datetime1 = Column(DateTime, nullable=True, index=True)
    date1 = Column(String, nullable=True)
    time1 = Column(String, nullable=True)
    datetime2 = Column(DateTime, nullable=True, index=True)
    date2 = Column(String, nullable=True)
    time2 = Column(String, nullable=True)
    prog1 = Column(String, nullable=True, index=True)
    prog2 = Column(String, nullable=True, index=True)
    weight1 = Column(Integer, nullable=True)
    pid1 = Column(String, nullable=True, index=True)
    weight2 = Column(Integer, nullable=True)
    pid2 = Column(String, nullable=True, index=True)
    net_weight = Column(Integer, nullable=True)
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)

# Model for Access table
class Access(Base):
    __tablename__ = 'access'
    id = Column(Integer, primary_key=True, index=True)
    idCustomer = Column(Integer, ForeignKey('customer.id'), nullable=True)
    idSupplier = Column(Integer, ForeignKey('supplier.id'), nullable=True)
    idVector = Column(Integer, ForeignKey('vector.id'))
    idDriver = Column(Integer, ForeignKey('driver.id'))
    idVehicle = Column(Integer, ForeignKey('vehicle.id'))
    idMaterial = Column(Integer, ForeignKey('material.id'), nullable=True)
    number_in_out = Column(Integer, nullable=True)
    note = Column(String, nullable=True)
    selected = Column(Boolean, index=True, default=False)
    date_created = Column(DateTime, server_default=func.now(), default=datetime.now)
    status = Column(Enum(AccessStatus), default=AccessStatus.WAITING)
    document_reference = Column(String, nullable=True)
    type = Column(Enum(TypeAccess), default=TypeAccess.MANUALLY)
    idCardRegistry = Column(Integer, ForeignKey('card_registry.id'), nullable=True, index=True)
    hidden = Column(Boolean, default=False)
    mode = Column(Enum(AccessMode), default=AccessMode.STANDARD, nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="accesses")
    supplier = relationship("Supplier", back_populates="accesses")
    vector = relationship("Vector", back_populates="accesses")
    driver = relationship("Driver", back_populates="accesses")
    vehicle = relationship("Vehicle", back_populates="accesses")
    material = relationship("Material", back_populates="accesses")
    card_registry = relationship("CardRegistry", back_populates="accesses")
    in_out = relationship("InOut", back_populates="access", cascade="all, delete")

    @hybrid_property
    def is_latest_for_vehicle(self):
        if not self.idVehicle:
            return None

        session = object_session(self)
        if not session:
            return False

        max_id = session.query(func.max(Access.id)).filter(
            Access.idVehicle == self.idVehicle
        ).scalar()

        return self.id == max_id

    @is_latest_for_vehicle.expression
    def is_latest_for_vehicle(cls):
        return cls.id == func.max(cls.id).over(partition_by=cls.idVehicle)

    @hybrid_property
    def is_latest_for_badge(self):
        if not self.idCardRegistry:
            return None

        session = object_session(self)
        if not session:
            return False

        max_id = session.query(func.max(Access.id)).filter(
            Access.idCardRegistry == self.idCardRegistry
        ).scalar()

        return self.id == max_id

    @is_latest_for_badge.expression
    def is_latest_for_badge(cls):
        return cls.id == func.max(cls.id).over(partition_by=cls.idCardRegistry)

class InOut(Base):
    __tablename__ = 'in_out'
    id = Column(Integer, primary_key=True, index=True)
    idAccess = Column(Integer, ForeignKey('access.id'))
    idCustomer = Column(Integer, ForeignKey('customer.id'), nullable=True)
    idSupplier = Column(Integer, ForeignKey('supplier.id'), nullable=True)
    idVector = Column(Integer, ForeignKey('vector.id'), nullable=True)
    idDriver = Column(Integer, ForeignKey('driver.id'), nullable=True)
    idMaterial = Column(Integer, ForeignKey('material.id'), nullable=True)
    idWeight1 = Column(Integer, ForeignKey('weighing.id'), nullable=True)  # ADDED: nullable=True
    idWeight2 = Column(Integer, ForeignKey('weighing.id'), nullable=True)  # ADDED: nullable=True
    net_weight = Column(Integer, nullable=True)
    note = Column(String, nullable=True)
    document_reference = Column(String, nullable=True)
    idCardRegistry = Column(Integer, ForeignKey('card_registry.id'), nullable=True)

    # "Stampino" dei dati al momento della pesata: stampe, export, CSV e sincronizzazione
    # leggono questi campi, così la pesata resta com'era anche se l'anagrafica cambia o
    # viene archiviata. Vengono compilati in automatico (vedi _fill_in_out_snapshot).
    snapshot_version = Column(Integer, nullable=True)
    plate = Column(String(collation="NOCASE"), nullable=True, index=True)
    vehicle_description = Column(String, nullable=True)
    customer_name = Column(String(collation="NOCASE"), nullable=True, index=True)
    customer_code = Column(String(collation="NOCASE"), nullable=True)
    customer_description = Column(String, nullable=True)
    supplier_name = Column(String(collation="NOCASE"), nullable=True, index=True)
    supplier_code = Column(String(collation="NOCASE"), nullable=True)
    supplier_description = Column(String, nullable=True)
    vector_name = Column(String(collation="NOCASE"), nullable=True, index=True)
    vector_code = Column(String(collation="NOCASE"), nullable=True)
    vector_description = Column(String, nullable=True)
    driver_name = Column(String(collation="NOCASE"), nullable=True)
    driver_code = Column(String(collation="NOCASE"), nullable=True)
    driver_description = Column(String, nullable=True)
    material_description = Column(String(collation="NOCASE"), nullable=True, index=True)
    material_code = Column(String(collation="NOCASE"), nullable=True)
    card_number = Column(String(collation="NOCASE"), nullable=True)
    card_code = Column(String(collation="NOCASE"), nullable=True)

    # Relationships
    access = relationship("Access", back_populates="in_out")
    customer = relationship("Customer", foreign_keys=[idCustomer])
    supplier = relationship("Supplier", foreign_keys=[idSupplier])
    vector = relationship("Vector", foreign_keys=[idVector])
    driver = relationship("Driver", foreign_keys=[idDriver])
    material = relationship("Material", back_populates="in_out")
    weight1 = relationship("Weighing", foreign_keys=[idWeight1], back_populates="in_out_weight1")  # FIXED: added foreign_keys
    weight2 = relationship("Weighing", foreign_keys=[idWeight2], back_populates="in_out_weight2")  # FIXED: added foreign_keys
    card_registry = relationship("CardRegistry", foreign_keys=[idCardRegistry])

    @hybrid_property  
    def is_last(self):
        if not self.idAccess:
            return False
        
        session = object_session(self)
        if not session:
            return False
            
        max_id = session.query(func.max(InOut.id)).filter(
            InOut.idAccess == self.idAccess
        ).scalar()
        
        return self.id == max_id

    @is_last.expression
    def is_last(cls):
        return cls.id == func.max(cls.id).over(partition_by=cls.idAccess)

class LockRecordType(PyEnum):
    SELECT = "select"
    UPDATE = "update"
    DELETE = "delete"
    CALL = "call"
    CANCEL_CALL = "cancel_call"

class LockRecord(Base):
    __tablename__ = 'lock_record'
    id = Column(Integer, primary_key=True, index=True)
    table_name = Column(String, nullable=False)
    idRecord = Column(Integer, nullable=False)
    type = Column(Enum(LockRecordType), default=LockRecordType.SELECT)
    websocket_identifier = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey('user.id'), nullable=True)
    weigher_name = Column(String, nullable=True)

    user = relationship("User", back_populates="lock_records")

# Dictionary of models to map table names to model classes
table_models = {
    'user': User,
    'customer': Customer,
    'supplier': Supplier,
    'vector': Vector,
    'driver': Driver,
    'vehicle': Vehicle,
    'material': Material,
    'weighing': Weighing,
    'operator': Operator,
    'access': Access,
    'lock_record': LockRecord,
    'weighing_picture': WeighingPicture,
    'weighing-terminal': WeighingTerminal,
    'in_out': InOut,  # ADDED: missing from original
    'card-registry': CardRegistry
}

upload_file_datas_required_columns = {
    "customer": {"social_reason": str, "description": str, "code": str},
    "supplier": {"social_reason": str, "description": str, "code": str},
    "vector": {"social_reason": str, "description": str, "code": str},
    "driver": {"social_reason": str, "description": str, "code": str},
    "vehicle": {"plate": str, "description": str, "tare": int},
    "material": {"description": str, "code": str},
    "operator": {"description": str},
    "access": {"idCustomer": int, "idSupplier": int, "idVector": int, "idVehicle": int, "number_in_out": int, "note": str, "idCardRegistry": int},
    "weighing-terminal": {"type": str, "id": str, "bil": str, "datetime1": str, "date1": str, "time1": str, "datetime2": str, "date2": str, "time2": str, "prog1": str, "prog2": str, "badge": str, "plate": str, "customer": str, "supplier": str, "material": str, "notes1": str, "notes2": str, "weight1": int, "pid1": str, "weight2": int, "pid2": str, "net_weight": int}
}

instances = [User, Customer, Supplier, Vector, Driver, Vehicle, Material, Operator, Weighing, WeighingPicture, Access, LockRecord, InOut, WeighingTerminal, CardRegistry]


def sync_database_columns():
    """
    Sincronizza le colonne del database con i modelli SQLAlchemy.
    - Aggiunge colonne mancanti (definite nel modello ma non nel database)
    """
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    for table_name, model in table_models.items():
        # Gestisci il nome della tabella (potrebbe avere caratteri speciali come 'weighing-terminal')
        actual_table_name = model.__tablename__

        if actual_table_name not in existing_tables:
            lb_log.info(f"Tabella '{actual_table_name}' non esiste, verrà creata automaticamente")
            continue

        # Ottieni le colonne esistenti nel database
        db_columns = {col['name'] for col in inspector.get_columns(actual_table_name)}

        # Ottieni le colonne definite nel modello
        model_columns = {col.name for col in model.__table__.columns}

        # Colonne da aggiungere (nel modello ma non nel database)
        columns_to_add = model_columns - db_columns

        # Aggiungi colonne mancanti
        if columns_to_add:
            lb_log.info(f"Tabella '{actual_table_name}': aggiungendo colonne {columns_to_add}")
            with engine.connect() as conn:
                for col_name in columns_to_add:
                    column = model.__table__.columns[col_name]
                    col_type = _get_sqlite_type(column)
                    nullable = "NULL" if column.nullable else "NOT NULL"
                    default = _get_column_default(column)

                    # SQLite non supporta NOT NULL senza DEFAULT per colonne aggiunte
                    if not column.nullable and default == "":
                        default = _get_type_default(column)

                    sql = f'ALTER TABLE "{actual_table_name}" ADD COLUMN "{col_name}" {col_type} {nullable} {default}'
                    try:
                        conn.execute(text(sql))
                        conn.commit()
                        lb_log.info(f"  - Aggiunta colonna '{col_name}' ({col_type})")
                    except Exception as e:
                        lb_log.error(f"  - Errore aggiungendo colonna '{col_name}': {e}")


def _get_sqlite_type(column):
    """Converte il tipo SQLAlchemy in tipo SQLite"""
    type_name = type(column.type).__name__.upper()

    if type_name in ('INTEGER', 'INT', 'SMALLINT', 'BIGINT'):
        return 'INTEGER'
    elif type_name in ('STRING', 'VARCHAR', 'TEXT', 'CHAR'):
        return 'TEXT'
    elif type_name in ('BOOLEAN', 'BOOL'):
        return 'INTEGER'  # SQLite usa INTEGER per boolean
    elif type_name in ('DATETIME', 'DATE', 'TIME', 'TIMESTAMP'):
        return 'TEXT'  # SQLite memorizza date come TEXT
    elif type_name in ('FLOAT', 'REAL', 'DOUBLE'):
        return 'REAL'
    elif type_name == 'ENUM':
        return 'TEXT'
    else:
        return 'TEXT'


def _get_column_default(column):
    """Ottiene il valore DEFAULT per una colonna"""
    if column.default is not None:
        if hasattr(column.default, 'arg'):
            default_val = column.default.arg
            if callable(default_val):
                return ""  # Non possiamo usare callable come default SQL
            elif isinstance(default_val, bool):
                return f"DEFAULT {1 if default_val else 0}"
            elif isinstance(default_val, (int, float)):
                return f"DEFAULT {default_val}"
            elif isinstance(default_val, str):
                return f"DEFAULT '{default_val}'"
    if column.server_default is not None:
        return ""  # Server default viene gestito automaticamente
    return ""


def _get_type_default(column):
    """Ottiene un valore default basato sul tipo per colonne NOT NULL"""
    type_name = type(column.type).__name__.upper()

    if type_name in ('INTEGER', 'INT', 'SMALLINT', 'BIGINT', 'BOOLEAN', 'BOOL'):
        return "DEFAULT 0"
    elif type_name in ('FLOAT', 'REAL', 'DOUBLE'):
        return "DEFAULT 0.0"
    else:
        return "DEFAULT ''"


def migrate_called_status():
    """
    Migrazione per convertire lo stato 'CALLED' (deprecato).
    Necessario per database creati con versioni precedenti del software
    dove AccessStatus includeva il valore CALLED.
    - CALLED con almeno un in_out → ENTERED
    - CALLED senza in_out → WAITING
    """
    try:
        with engine.connect() as conn:
            # Verifica se la tabella access esiste
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='access'"))
            if result.fetchone() is None:
                return  # La tabella non esiste ancora, niente da migrare

            # Aggiorna CALLED → ENTERED per accessi che hanno almeno un in_out
            result_entered = conn.execute(text("""
                UPDATE access SET status = 'ENTERED'
                WHERE status = 'CALLED'
                AND id IN (SELECT DISTINCT idAccess FROM in_out)
            """))

            # Aggiorna CALLED → WAITING per accessi senza in_out
            result_waiting = conn.execute(text("""
                UPDATE access SET status = 'WAITING'
                WHERE status = 'CALLED'
            """))

            conn.commit()

            total = result_entered.rowcount + result_waiting.rowcount
            if total > 0:
                lb_log.info(f"Migrazione stato CALLED: {result_entered.rowcount} → ENTERED, {result_waiting.rowcount} → WAITING")
    except Exception as e:
        lb_log.error(f"Errore durante la migrazione dello stato CALLED: {e}")

def migrate_weighing_pid_constraint():
    """
    Migrazione per sostituire il vincolo UNIQUE su weighing.pid
    con un vincolo composito UNIQUE su (pid, weigher_serial_number).
    Necessario perché terminali diversi possono generare lo stesso pid.
    SQLite non supporta ALTER TABLE DROP CONSTRAINT, quindi si ricrea la tabella.
    """
    try:
        with engine.connect() as conn:
            # Verifica se la tabella weighing esiste
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='weighing'"))
            if result.fetchone() is None:
                return  # La tabella non esiste ancora, niente da migrare

            # Controlla se esiste un indice unique solo su pid (vecchio vincolo)
            indexes = conn.execute(text("PRAGMA index_list('weighing')")).fetchall()
            has_old_unique_pid = False
            for idx in indexes:
                idx_name = idx[1]
                is_unique = idx[2]
                if is_unique:
                    cols = conn.execute(text(f"PRAGMA index_info('{idx_name}')")).fetchall()
                    col_names = [col[2] for col in cols]
                    if col_names == ['pid']:
                        has_old_unique_pid = True
                        break

            old_columns = [row[1] for row in conn.execute(text("PRAGMA table_info('weighing')")).fetchall()]

        if not has_old_unique_pid:
            # Già migrato o vincolo non presente: rimuove eventuali residui di tentativi falliti
            with engine.connect() as conn:
                conn.execute(text("DROP TABLE IF EXISTS weighing_new"))
                conn.commit()
            return

        lb_log.info("Migrazione vincolo weighing.pid: da UNIQUE(pid) a UNIQUE(pid, weigher_serial_number)")

        new_columns = [
            'id', 'date', 'weigher', 'weigher_serial_number', 'pid', 'is_preset_tare',
            'is_preset_weight', 'tare', 'weight', 'log', 'idUser', 'idOperator',
        ]
        # Copia per nome solo le colonne presenti in entrambe le tabelle (l'ordine può differire)
        common_columns = ", ".join(f'"{c}"' for c in new_columns if c in old_columns)

        # Il driver sqlite3 esegue i DDL fuori transazione: si usa una transazione esplicita
        # così che un errore non lasci residui (es. weighing_new) nel database
        raw = engine.raw_connection()
        try:
            dbapi_conn = raw.driver_connection
            dbapi_conn.isolation_level = None
            cursor = dbapi_conn.cursor()
            cursor.execute("BEGIN")
            try:
                cursor.execute("DROP TABLE IF EXISTS weighing_new")
                cursor.execute("""
                    CREATE TABLE weighing_new (
                        id INTEGER PRIMARY KEY,
                        date DATETIME DEFAULT CURRENT_TIMESTAMP,
                        weigher TEXT,
                        weigher_serial_number TEXT,
                        pid TEXT,
                        is_preset_tare INTEGER,
                        is_preset_weight INTEGER,
                        tare INTEGER,
                        weight INTEGER,
                        log TEXT,
                        idUser INTEGER REFERENCES user(id),
                        idOperator INTEGER REFERENCES operator(id),
                        UNIQUE(pid, weigher_serial_number)
                    )
                """)
                cursor.execute(f"INSERT INTO weighing_new ({common_columns}) SELECT {common_columns} FROM weighing")
                cursor.execute("DROP TABLE weighing")
                cursor.execute("ALTER TABLE weighing_new RENAME TO weighing")
                cursor.execute("CREATE INDEX IF NOT EXISTS ix_weighing_pid ON weighing(pid)")
                cursor.execute("COMMIT")
            except Exception:
                cursor.execute("ROLLBACK")
                raise
            finally:
                cursor.close()
                dbapi_conn.isolation_level = ""
        finally:
            raw.close()
        lb_log.info("Migrazione vincolo weighing.pid completata con successo")
    except Exception as e:
        lb_log.error(f"Errore durante la migrazione del vincolo weighing.pid: {e}")

def migrate_badge_unique_constraint():
    """
    Migrazione per rimuovere il vincolo UNIQUE sulla colonna badge della tabella access.
    Il badge ora può essere presente su più accessi (come le targhe),
    e viene usato is_latest_for_badge per identificare l'ultimo accesso con quel badge.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='access'"))
            if result.fetchone() is None:
                return

            indexes = conn.execute(text("PRAGMA index_list('access')")).fetchall()
            has_unique_badge = False
            for idx in indexes:
                idx_name = idx[1]
                is_unique = idx[2]
                if is_unique:
                    cols = conn.execute(text(f"PRAGMA index_info('{idx_name}')")).fetchall()
                    col_names = [col[2] for col in cols]
                    if col_names == ['badge']:
                        has_unique_badge = True
                        break

            if not has_unique_badge:
                return

            lb_log.info("Migrazione vincolo access.badge: rimozione UNIQUE constraint")

            # Rimuovi l'indice unique e ricrealo come non-unique
            conn.execute(text(f"DROP INDEX IF EXISTS \"{idx_name}\""))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_access_badge ON access(badge)"))
            conn.commit()
            lb_log.info("Migrazione vincolo access.badge completata con successo")
    except Exception as e:
        lb_log.error(f"Errore durante la migrazione del vincolo access.badge: {e}")

def migrate_in_out_anagrafiche_columns():
    """
    Migrazione per aggiungere colonne anagrafiche alla tabella in_out.
    Aggiunge: typeSubject, idSubject, idVector, idDriver, note, document_reference
    Popola i dati dalle prenotazioni/access esistenti.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='in_out'"))
            if result.fetchone() is None:
                return

            existing = {row[1] for row in conn.execute(text("PRAGMA table_info('in_out')")).fetchall()}

            access_cols = {row[1] for row in conn.execute(text("PRAGMA table_info('access')")).fetchall()}
            # Database precedenti alla separazione clienti/fornitori: servono le vecchie colonne
            # typeSubject/idSubject anche in in_out, poi migrate_subject_to_customer_supplier le converte
            legacy_subject = 'idSubject' in access_cols
            if not legacy_subject:
                return

            columns_to_add = {
                'typeSubject': 'TEXT NULL',
                'idSubject': 'INTEGER NULL',
                'idVector': 'INTEGER NULL',
                'idDriver': 'INTEGER NULL',
                'note': 'TEXT NULL',
                'document_reference': 'TEXT NULL',
            }

            added_columns = []
            for col_name, col_def in columns_to_add.items():
                if col_name not in existing:
                    try:
                        conn.execute(text(f'ALTER TABLE "in_out" ADD COLUMN "{col_name}" {col_def}'))
                        conn.commit()
                        added_columns.append(col_name)
                        lb_log.info(f"  - Aggiunta colonna '{col_name}' a in_out")
                    except Exception as e:
                        lb_log.error(f"  - Errore aggiungendo colonna '{col_name}' a in_out: {e}")

            # Popola le nuove colonne con i dati dell'access associato
            if added_columns:
                try:
                    conn.execute(text("""
                        UPDATE in_out SET
                            typeSubject = (SELECT typeSubject FROM access WHERE access.id = in_out.idAccess),
                            idSubject = (SELECT idSubject FROM access WHERE access.id = in_out.idAccess),
                            idVector = (SELECT idVector FROM access WHERE access.id = in_out.idAccess),
                            idDriver = (SELECT idDriver FROM access WHERE access.id = in_out.idAccess),
                            note = (SELECT note FROM access WHERE access.id = in_out.idAccess),
                            document_reference = (SELECT document_reference FROM access WHERE access.id = in_out.idAccess)
                        WHERE typeSubject IS NULL AND idSubject IS NULL AND idVector IS NULL AND idDriver IS NULL
                    """))
                    conn.commit()
                    lb_log.info("  - Popolate colonne in_out con dati dalle prenotazioni esistenti")
                except Exception as e:
                    lb_log.error(f"  - Errore popolando colonne in_out: {e}")
    except Exception as e:
        lb_log.error(f"Errore durante la migrazione in_out anagrafiche: {e}")

def migrate_access_badge_to_idCardRegistry():
    """
    Migrazione per convertire access.badge (stringa) in access.idCardRegistry (FK).
    Per ogni valore univoco di badge nella tabella access:
    - Crea un record in card_registry con number=badge e code=badge (se non esiste già)
    - Imposta access.idCardRegistry all'id del record card_registry corrispondente
    Lascia la colonna badge esistente (SQLite non supporta DROP COLUMN facilmente).
    """
    try:
        with engine.connect() as conn:
            # Verifica che entrambe le tabelle esistano
            tables = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
            table_names = {row[0] for row in tables}
            if 'access' not in table_names or 'card_registry' not in table_names:
                return

            # Verifica se idCardRegistry esiste già nell'access
            access_cols = {row[1] for row in conn.execute(text("PRAGMA table_info('access')")).fetchall()}
            if 'idCardRegistry' not in access_cols:
                return  # sync_database_columns non ha ancora aggiunto la colonna, verrà eseguita dopo

            # Verifica se badge esiste (vecchia colonna)
            if 'badge' not in access_cols:
                return  # Migrazione già completata o non necessaria

            # Prendi tutti i badge unici non nulli dalla tabella access
            badges = conn.execute(text(
                "SELECT DISTINCT badge FROM access WHERE badge IS NOT NULL AND badge != '' AND idCardRegistry IS NULL"
            )).fetchall()

            for (badge_value,) in badges:
                # Cerca se esiste già in card_registry
                existing = conn.execute(text(
                    "SELECT id FROM card_registry WHERE code = :code"
                ), {"code": badge_value}).fetchone()

                if existing:
                    card_id = existing[0]
                else:
                    # Crea nuovo record in card_registry
                    conn.execute(text(
                        "INSERT INTO card_registry (number, code, date_created) VALUES (:number, :code, datetime('now'))"
                    ), {"number": badge_value, "code": badge_value})
                    conn.commit()
                    card_id = conn.execute(text(
                        "SELECT id FROM card_registry WHERE code = :code"
                    ), {"code": badge_value}).fetchone()[0]

                # Aggiorna access.idCardRegistry
                conn.execute(text(
                    "UPDATE access SET idCardRegistry = :card_id WHERE badge = :badge AND idCardRegistry IS NULL"
                ), {"card_id": card_id, "badge": badge_value})
                conn.commit()

            if badges:
                lb_log.info(f"Migrazione access.badge → idCardRegistry: {len(badges)} valori migrati")
    except Exception as e:
        lb_log.error(f"Errore durante la migrazione access.badge → idCardRegistry: {e}")


def migrate_access_mode():
    """
    Migrazione per aggiungere il campo mode alla tabella access.
    - Accessi con number_in_out IN (-1, 0) → TRANSIT (erano già marcati come transito)
    - Tutti gli altri → STANDARD
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='access'"))
            if result.fetchone() is None:
                return

            access_cols = {row[1] for row in conn.execute(text("PRAGMA table_info('access')")).fetchall()}
            if 'mode' not in access_cols:
                return

            result_transit = conn.execute(text("""
                UPDATE access SET mode = 'TRANSIT'
                WHERE (number_in_out = -1 OR number_in_out = 0)
                AND mode IS NULL
            """))
            result_standard = conn.execute(text("""
                UPDATE access SET mode = 'STANDARD'
                WHERE mode IS NULL
            """))
            conn.commit()

            total = result_transit.rowcount + result_standard.rowcount
            if total > 0:
                lb_log.info(f"Migrazione access.mode: {result_transit.rowcount} TRANSIT, {result_standard.rowcount} STANDARD")
    except Exception as e:
        lb_log.error(f"Errore durante la migrazione access.mode: {e}")


def migrate_in_out_idCardRegistry():
    """
    Copia access.idCardRegistry su ogni record in_out che non ha ancora
    il campo valorizzato, preservando il badge usato al momento della pesata.
    """
    try:
        with engine.connect() as conn:
            tables = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
            table_names = {row[0] for row in tables}
            if 'in_out' not in table_names or 'access' not in table_names:
                return

            in_out_cols = {row[1] for row in conn.execute(text("PRAGMA table_info('in_out')")).fetchall()}
            if 'idCardRegistry' not in in_out_cols:
                return

            conn.execute(text(
                """
                UPDATE in_out
                SET idCardRegistry = (
                    SELECT a.idCardRegistry FROM access a WHERE a.id = in_out.idAccess
                )
                WHERE idCardRegistry IS NULL
                  AND EXISTS (
                    SELECT 1 FROM access a
                    WHERE a.id = in_out.idAccess AND a.idCardRegistry IS NOT NULL
                  )
                """
            ))
            conn.commit()

            count = conn.execute(text(
                "SELECT changes()"
            )).fetchone()[0]
            if count:
                lb_log.info(f"Migrazione in_out.idCardRegistry: {count} record aggiornati")
    except Exception as e:
        lb_log.error(f"Errore durante la migrazione in_out.idCardRegistry: {e}")


def migrate_subject_to_customer_supplier():
    """
    Migrazione dalla vecchia anagrafica unica 'subject' (con il tipo CUSTOMER/SUPPLIER salvato
    su ogni access/in_out) alle due anagrafiche separate 'customer' e 'supplier'.
    - una ditta usata solo come cliente diventa un cliente, solo come fornitore un fornitore;
    - una ditta usata in entrambi i modi, o mai usata, viene copiata in tutte e due;
    - access e in_out puntano al cliente (idCustomer) o al fornitore (idSupplier) corrispondente.
    Le vecchie colonne e la tabella subject restano nel database (SQLite) ma non sono più usate.
    Viene eseguita una sola volta: solo se esiste 'subject' e clienti e fornitori sono vuoti.
    """
    try:
        with engine.connect() as conn:
            tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
            if 'subject' not in tables or 'customer' not in tables or 'supplier' not in tables:
                return
            if conn.execute(text("SELECT COUNT(*) FROM customer")).scalar() or conn.execute(text("SELECT COUNT(*) FROM supplier")).scalar():
                return
            if not conn.execute(text("SELECT COUNT(*) FROM subject")).scalar():
                return

            def cols(table):
                return {row[1] for row in conn.execute(text(f"PRAGMA table_info('{table}')")).fetchall()} if table in tables else set()

            # Tabelle con riferimenti al soggetto (typeSubject + idSubject)
            refs = [t for t in ('access', 'in_out') if {'typeSubject', 'idSubject'} <= cols(t)]

            usage = {}  # idSubject -> set di tipi ('CUSTOMER'/'SUPPLIER')
            for t in refs:
                for id_subject, type_subject in conn.execute(text(
                    f'SELECT DISTINCT idSubject, typeSubject FROM "{t}" WHERE idSubject IS NOT NULL'
                )).fetchall():
                    # tipo mancante: la ditta resta valida per entrambi
                    usage.setdefault(id_subject, set()).update([type_subject] if type_subject in ('CUSTOMER', 'SUPPLIER') else ['CUSTOMER', 'SUPPLIER'])

            subjects = conn.execute(text("SELECT id, social_reason, telephone, cfpiva, date_created FROM subject")).fetchall()
            n_customers = n_suppliers = 0
            for sid, social_reason, telephone, cfpiva, date_created in subjects:
                kinds = usage.get(sid) or {'CUSTOMER', 'SUPPLIER'}
                params = {"id": sid, "social_reason": social_reason, "telephone": telephone, "cfpiva": cfpiva, "date_created": date_created}
                # stesso id del vecchio soggetto: i riferimenti si convertono senza tabelle di appoggio
                if 'CUSTOMER' in kinds:
                    conn.execute(text("INSERT INTO customer (id, social_reason, description, date_created) VALUES (:id, :social_reason, :cfpiva, :date_created)"), params)
                    n_customers += 1
                if 'SUPPLIER' in kinds:
                    conn.execute(text("INSERT INTO supplier (id, social_reason, description, date_created) VALUES (:id, :social_reason, :cfpiva, :date_created)"), params)
                    n_suppliers += 1

            for t in refs:
                conn.execute(text(f"""
                    UPDATE "{t}" SET
                        idCustomer = CASE WHEN typeSubject = 'SUPPLIER' THEN NULL ELSE idSubject END,
                        idSupplier = CASE WHEN typeSubject = 'SUPPLIER' THEN idSubject ELSE NULL END
                    WHERE idSubject IS NOT NULL
                """))
                # i vecchi riferimenti non vengono più letti: li svuoto per evitare ambiguità
                conn.execute(text(f'UPDATE "{t}" SET idSubject = NULL, typeSubject = NULL'))

            if 'lock_record' in tables:
                conn.execute(text("DELETE FROM lock_record WHERE table_name = 'subject'"))
            conn.commit()
            lb_log.info(f"Migrazione soggetti: {n_customers} clienti e {n_suppliers} fornitori creati da {len(subjects)} soggetti")
    except Exception as e:
        lb_log.error(f"Errore durante la migrazione soggetti -> clienti/fornitori: {e}")

# ── Stampino dei dati sulla pesata (in_out) ─────────────────────────────────
# Gruppi: colonna FK -> (tabella, [(colonna sorgente, colonna dello stampino)])
_SNAPSHOT_GROUPS = {
    "idCustomer": ("customer", [("social_reason", "customer_name"), ("code", "customer_code"), ("description", "customer_description")]),
    "idSupplier": ("supplier", [("social_reason", "supplier_name"), ("code", "supplier_code"), ("description", "supplier_description")]),
    "idVector": ("vector", [("social_reason", "vector_name"), ("code", "vector_code"), ("description", "vector_description")]),
    "idDriver": ("driver", [("social_reason", "driver_name"), ("code", "driver_code"), ("description", "driver_description")]),
    "idMaterial": ("material", [("description", "material_description"), ("code", "material_code")]),
    "idCardRegistry": ("card_registry", [("number", "card_number"), ("code", "card_code")]),
}
SNAPSHOT_VERSION = 1


def _snapshot_group(connection, target, fk):
    table_name, fields = _SNAPSHOT_GROUPS[fk]
    model = {"customer": Customer, "supplier": Supplier, "vector": Vector, "driver": Driver,
             "material": Material, "card_registry": CardRegistry}[table_name]
    record_id = getattr(target, fk)
    row = None
    if record_id is not None:
        row = connection.execute(
            select(*[getattr(model, src) for src, _ in fields]).where(model.id == record_id)
        ).first()
    for i, (_, dst) in enumerate(fields):
        setattr(target, dst, row[i] if row else None)


def _snapshot_vehicle(connection, target):
    row = None
    if target.idAccess is not None:
        row = connection.execute(
            select(Vehicle.plate, Vehicle.description)
            .select_from(Access).join(Vehicle, Vehicle.id == Access.idVehicle)
            .where(Access.id == target.idAccess)
        ).first()
    target.plate = row[0] if row else None
    target.vehicle_description = row[1] if row else None


@event.listens_for(InOut, "before_insert")
def _in_out_snapshot_on_insert(mapper, connection, target):
    for fk in _SNAPSHOT_GROUPS:
        _snapshot_group(connection, target, fk)
    _snapshot_vehicle(connection, target)
    target.snapshot_version = SNAPSHOT_VERSION


@event.listens_for(InOut, "before_update")
def _in_out_snapshot_on_update(mapper, connection, target):
    from sqlalchemy import inspect as sa_inspect
    state = sa_inspect(target)
    changed = lambda key: state.attrs[key].history.has_changes()
    # Alla chiusura della pesata (seconda pesata) lo stampino viene rifatto per intero:
    # fotografa i dati definitivi. Altrimenti si aggiornano solo i gruppi cambiati
    # (es. correzione del cliente di una pesata).
    completed = changed("idWeight2") and target.idWeight2 is not None
    for fk in _SNAPSHOT_GROUPS:
        if completed or changed(fk):
            _snapshot_group(connection, target, fk)
    if completed or changed("idAccess") or target.snapshot_version is None:
        _snapshot_vehicle(connection, target)
    target.snapshot_version = SNAPSHOT_VERSION


def migrate_in_out_snapshot():
    """Compila lo stampino delle pesate già esistenti (una sola volta, dove manca)."""
    try:
        with engine.connect() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info('in_out')")).fetchall()}
            # stampini della versione precedente: CF/P.IVA e telefono autista -> descrizione
            for old, new in (("customer_cfpiva", "customer_description"), ("supplier_cfpiva", "supplier_description"),
                             ("vector_cfpiva", "vector_description"), ("driver_telephone", "driver_description")):
                if old in cols and new in cols:
                    conn.execute(text(f'UPDATE in_out SET "{new}" = "{old}" WHERE "{new}" IS NULL AND "{old}" IS NOT NULL'))
                    conn.execute(text(f'UPDATE in_out SET "{old}" = NULL'))
            conn.commit()
            pending = conn.execute(text("SELECT COUNT(*) FROM in_out WHERE snapshot_version IS NULL")).scalar()
            if not pending:
                return
            tables = {"customer": "customer", "supplier": "supplier", "vector": "vector", "driver": "driver",
                      "material": "material", "card_registry": "card_registry"}
            sets = []
            for fk, (table_name, fields) in _SNAPSHOT_GROUPS.items():
                for src, dst in fields:
                    sets.append(f'"{dst}" = (SELECT t."{src}" FROM "{tables[table_name]}" t WHERE t.id = in_out."{fk}")')
            sets.append('plate = (SELECT v.plate FROM access a JOIN vehicle v ON v.id = a.idVehicle WHERE a.id = in_out.idAccess)')
            sets.append('vehicle_description = (SELECT v.description FROM access a JOIN vehicle v ON v.id = a.idVehicle WHERE a.id = in_out.idAccess)')
            sets.append(f'snapshot_version = {SNAPSHOT_VERSION}')
            conn.execute(text(f"UPDATE in_out SET {', '.join(sets)} WHERE snapshot_version IS NULL"))
            conn.commit()
            lb_log.info(f"Stampino pesate: compilate {pending} pesate esistenti")
    except Exception as e:
        lb_log.error(f"Errore durante la compilazione dello stampino delle pesate: {e}")


def _rebuild_table(conn, model):
    """Ricrea una tabella SQLite secondo il modello (per togliere colonne o vincoli UNIQUE non più previsti)."""
    name = model.__tablename__
    old = f"{name}__old"
    old_cols = [row[1] for row in conn.execute(text(f'PRAGMA table_info("{name}")')).fetchall()]
    conn.execute(text("PRAGMA legacy_alter_table = ON"))  # i riferimenti delle altre tabelle restano su "name"
    conn.execute(text(f'ALTER TABLE "{name}" RENAME TO "{old}"'))
    for idx in conn.execute(text(f'PRAGMA index_list("{old}")')).fetchall():
        if idx[3] == 'c':  # indici creati esplicitamente (gli autoindex dei vincoli spariscono con la tabella)
            conn.execute(text(f'DROP INDEX IF EXISTS "{idx[1]}"'))
    model.__table__.create(conn)
    common = [c.name for c in model.__table__.columns if c.name in old_cols]
    cols = ", ".join(f'"{c}"' for c in common)
    conn.execute(text(f'INSERT INTO "{name}" ({cols}) SELECT {cols} FROM "{old}"'))
    conn.execute(text(f'DROP TABLE "{old}"'))
    conn.execute(text("PRAGMA legacy_alter_table = OFF"))


def migrate_anagrafiche_schema():
    """
    Allinea le anagrafiche al modello:
    - clienti, fornitori, vettori e autisti hanno ragione sociale, descrizione e codice: il vecchio
      CF/P.IVA (telefono per gli autisti) viene copiato nella descrizione, poi la tabella viene
      ricreata senza le colonne e i vincoli UNIQUE non più previsti;
    - crea gli indici previsti dal modello che mancano (es. codice unico sui materiali).
    """
    try:
        with engine.connect() as conn:
            for model in (Customer, Supplier, Vector, Driver):
                name = model.__tablename__
                db_cols = {row[1] for row in conn.execute(text(f'PRAGMA table_info("{name}")')).fetchall()}
                if not db_cols:
                    continue
                model_cols = {c.name for c in model.__table__.columns}
                model_unique = {c.name for c in model.__table__.columns if c.unique or c.primary_key}
                db_unique = set()
                for idx in conn.execute(text(f'PRAGMA index_list("{name}")')).fetchall():
                    if idx[2]:
                        info = conn.execute(text(f'PRAGMA index_info("{idx[1]}")')).fetchall()
                        if len(info) == 1:
                            db_unique.add(info[0][2])
                # i vecchi CF/P.IVA (e il telefono degli autisti) diventano la descrizione
                old_col = "telephone" if name == "driver" else "cfpiva"
                if old_col in db_cols and "description" in db_cols and old_col not in model_cols:
                    conn.execute(text(f'UPDATE "{name}" SET description = "{old_col}" WHERE description IS NULL AND "{old_col}" IS NOT NULL'))
                if (db_cols - model_cols) or (db_unique - model_unique):
                    _rebuild_table(conn, model)
                    lb_log.info(f"Tabella '{name}' aggiornata (colonne/vincoli)")
            conn.commit()
        with engine.begin() as conn:
            for model in (Customer, Supplier, Vector, Driver, Vehicle, Material, CardRegistry, InOut):
                for idx in model.__table__.indexes:
                    idx.create(conn, checkfirst=True)
    except Exception as e:
        lb_log.error(f"Errore durante l'aggiornamento delle anagrafiche: {e}")


# Esegui migrazione per stati deprecati
migrate_called_status()

# Esegui migrazione vincolo pid weighing
migrate_weighing_pid_constraint()

# Esegui migrazione vincolo badge access
migrate_badge_unique_constraint()

# Esegui migrazione colonne anagrafiche in_out
migrate_in_out_anagrafiche_columns()

# Sincronizza le colonne del database prima di creare nuove tabelle
sync_database_columns()

# Create tables (crea tabelle mancanti)
Base.metadata.create_all(engine)

# Separazione dell'anagrafica soggetti in clienti e fornitori (dopo sync e create)
migrate_subject_to_customer_supplier()

# Anagrafiche: codice, archiviazione, niente telefono/CF unici (dopo la separazione clienti/fornitori)
migrate_anagrafiche_schema()

# Esegui migrazione access.badge → idCardRegistry (dopo sync e create)
migrate_access_badge_to_idCardRegistry()

# Copia idCardRegistry da access a in_out per i record storici
migrate_in_out_idCardRegistry()

# Esegui migrazione campo mode (STANDARD/TRANSIT)
migrate_access_mode()

# Stampino dei dati sulle pesate già esistenti (per ultimo: usa i dati già migrati)
migrate_in_out_snapshot()

# Create default users
def create_default_users():
    with SessionLocal() as db_session:
        # Check if admin user exists
        admin_user = db_session.query(User).filter(User.username == "baronpesi").first()

        if admin_user is None:
            admin_user = User(
                username="baronpesi",
                password=hash_password("318101"),  # Change to a secure password in production
                level=4,
                description="baronopesi"
            )
            db_session.add(admin_user)
            db_session.commit()
            print("Admin user created")
            
        # Check if cam capture user exists
        cam_capture_plate_user = db_session.query(User).filter(User.username == "camcaptureplate").first()
        terminal = db_session.query(User).filter(User.username == "terminal").first()
        
        if cam_capture_plate_user is None:
            cam_capture_plate_user = User(
                username="camcaptureplate",
                password=None,  # FIXED: explicitly set password to None
                level=0,
                description="Cam Capture Plate"
            )
            db_session.add(cam_capture_plate_user)
            db_session.commit()
            print("Cam capture user created")

        if terminal is None:
            terminal = User(
                username="terminal",
                password=None,  # FIXED: explicitly set password to None
                level=0,
                description="Terminal"
            )
            db_session.add(terminal)
            db_session.commit()
            print("Weighing terminal user created")

# Execute the function to create default users
create_default_users()
