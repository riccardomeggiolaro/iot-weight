from pydantic import BaseModel, validator
from typing import Optional, List
from modules.md_database.interfaces.customer import Customer, CustomerDataDTO
from modules.md_database.interfaces.supplier import Supplier, SupplierDataDTO
from modules.md_database.interfaces.vector import Vector, VectorDataDTO
from modules.md_database.interfaces.driver import Driver, DriverDataDTO
from modules.md_database.interfaces.vehicle import Vehicle, VehicleDataDTO
from modules.md_database.interfaces.material import Material as MaterialInterface, MaterialDataDTO
from modules.md_database.interfaces.operator import OperatorDTO
from modules.md_database.interfaces.card_registry import CardRegistry
from modules.md_database.interfaces.in_out import InOut
from datetime import datetime

class Access(BaseModel):
    id: Optional[int] = None
    idCustomer: Optional[int] = None
    idSupplier: Optional[int] = None
    idVector: Optional[int] = None
    idDriver: Optional[int] = None
    idVehicle: Optional[int] = None
    idMaterial: Optional[int] = None
    idCardRegistry: Optional[int] = None
    number_in_out: Optional[int] = None
    note: Optional[str] = None
    status: Optional[str] = None
    document_reference: Optional[str] = None
    date_created: Optional[datetime] = None
    type: Optional[str] = None
    hidden: Optional[bool] = None
    mode: Optional[str] = None

    customer: Optional[Customer] = None
    supplier: Optional[Supplier] = None
    vector: Optional[Vector] = None
    driver: Optional[Driver] = None
    vehicle: Optional[Vehicle] = None
    material: Optional[MaterialInterface] = None
    card_registry: Optional[CardRegistry] = None
    in_out: List[InOut] = []

class AddAccessDTO(BaseModel):
    customer: CustomerDataDTO = CustomerDataDTO(**{})
    supplier: SupplierDataDTO = SupplierDataDTO(**{})
    vector: VectorDataDTO = VectorDataDTO(**{})
    driver: DriverDataDTO = DriverDataDTO(**{})
    vehicle: VehicleDataDTO = VehicleDataDTO(**{})
    material: MaterialDataDTO = MaterialDataDTO(**{})
    number_in_out: Optional[int] = None
    note: Optional[str] = None
    document_reference: Optional[str] = None
    type: str = "RESERVATION"
    idCardRegistry: Optional[int] = None
    permanent: Optional[bool] = False
    hidden: Optional[bool] = False
    mode: str = "STANDARD"

    @validator('type', pre=True, always=True)
    def check_type_type(cls, v, values):
        if v in ['RESERVATION', 'MANUALLY', 'TEST']:
            return v
        raise ValueError("type is not a valid string")

    @validator('mode', pre=True, always=True)
    def check_mode(cls, v, values):
        if v in ['STANDARD', 'TRANSIT', 'GENERIC']:
            return v
        raise ValueError("mode is not a valid string")

class SetAccessDTO(BaseModel):
    customer: CustomerDataDTO = CustomerDataDTO(**{})
    supplier: SupplierDataDTO = SupplierDataDTO(**{})
    vector: VectorDataDTO = VectorDataDTO(**{})
    driver: DriverDataDTO = DriverDataDTO(**{})
    vehicle: VehicleDataDTO = VehicleDataDTO(**{})
    material: MaterialDataDTO = MaterialDataDTO(**{})
    operator1: OperatorDTO = OperatorDTO(**{})
    operator2: OperatorDTO = OperatorDTO(**{})
    number_in_out: Optional[int] = None
    note: Optional[str] = None
    document_reference: Optional[str] = None
    idCardRegistry: Optional[int] = None
    permanent: Optional[bool] = None
    close: Optional[bool] = None
    mode: Optional[str] = None

    @validator('mode', pre=True, always=True)
    def check_mode(cls, v, values):
        if v is not None and v not in ['STANDARD', 'TRANSIT', 'GENERIC']:
            raise ValueError("mode is not a valid string")
        return v
