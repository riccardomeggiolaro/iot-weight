from pydantic import BaseModel, validator, root_validator, field_validator
from typing import Optional, List
from modules.md_database.functions.get_data_by_id import get_data_by_id
from datetime import datetime

# Anagrafica fornitori: ragione sociale (obbligatoria), codice del gestionale, CF/P.IVA.

class Supplier(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	cfpiva: Optional[str] = None
	archived: Optional[bool] = False
	date_created: Optional[datetime] = None
	reservations: List[any] = []
	id: Optional[int] = None

	class Config:
		# Configurazione per consentire l'uso di valori non dichiarati in fase di validazione
		arbitrary_types_allowed = True

class SupplierDataDTO(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	cfpiva: Optional[str] = None
	id: Optional[int] = None

	@validator('id', pre=True, always=True)
	def check_id(cls, v, values):
		if v not in (None, -1):
			if not get_data_by_id('supplier', v):
				raise ValueError('Id not exist in supplier')
		return v

class SupplierDTO(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	cfpiva: Optional[str] = None
	id: Optional[int] = None

	@validator('id', pre=True, always=True)
	def check_id(cls, v, values):
		if v not in (None, -1):
			data = get_data_by_id('supplier', v)
			if not data:
				raise ValueError('Id not exist in supplier')
			else:
				values['social_reason'] = data.get('social_reason')
				values['code'] = data.get('code')
				values['cfpiva'] = data.get('cfpiva')
		return v

	class Config:
		# Configurazione per consentire l'uso di valori non dichiarati in fase di validazione
		arbitrary_types_allowed = True

class AddSupplierDTO(BaseModel):
	social_reason: str
	code: Optional[str] = None
	cfpiva: Optional[str] = None

	@field_validator('*', mode='before')
	@classmethod
	def empty_str_to_none(cls, value, info):
		if isinstance(value, str) and value.strip() == "":
			return None
		return value.strip() if isinstance(value, str) else value

class SetSupplierDTO(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	cfpiva: Optional[str] = None

	@root_validator(pre=True)
	def check_at_least_one_field(cls, values):
		if not values.get('social_reason') and not values.get('code') and not values.get('cfpiva'):
			raise ValueError('At least one of "social_reason", "code" or "cfpiva" must be provided.')
		return values

class FilterSupplierDTO(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	cfpiva: Optional[str] = None
