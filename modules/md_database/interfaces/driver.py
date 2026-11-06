from pydantic import BaseModel, validator, root_validator, field_validator
from typing import Optional, List
from modules.md_database.functions.get_data_by_id import get_data_by_id
from datetime import datetime

# Anagrafica autisti (ragione sociale = nome e cognome): ragione sociale (obbligatoria), descrizione e codice del gestionale.

class Driver(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	description: Optional[str] = None
	archived: Optional[bool] = False
	date_created: Optional[datetime] = None
	reservations: List[any] = []
	id: Optional[int] = None

	class Config:
		# Configurazione per consentire l'uso di valori non dichiarati in fase di validazione
		arbitrary_types_allowed = True

class DriverDataDTO(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	description: Optional[str] = None
	id: Optional[int] = None

	@validator('id', pre=True, always=True)
	def check_id(cls, v, values):
		if v not in (None, -1):
			if not get_data_by_id('driver', v):
				raise ValueError('Id not exist in driver')
		return v

class DriverDTO(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	description: Optional[str] = None
	id: Optional[int] = None

	@validator('id', pre=True, always=True)
	def check_id(cls, v, values):
		if v not in (None, -1):
			data = get_data_by_id('driver', v)
			if not data:
				raise ValueError('Id not exist in driver')
			else:
				values['social_reason'] = data.get('social_reason')
				values['code'] = data.get('code')
				values['description'] = data.get('description')
		return v

	class Config:
		# Configurazione per consentire l'uso di valori non dichiarati in fase di validazione
		arbitrary_types_allowed = True

class AddDriverDTO(BaseModel):
	social_reason: str
	code: Optional[str] = None
	description: Optional[str] = None

	@field_validator('*', mode='before')
	@classmethod
	def empty_str_to_none(cls, value, info):
		if isinstance(value, str) and value.strip() == "":
			return None
		return value.strip() if isinstance(value, str) else value

class SetDriverDTO(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	description: Optional[str] = None

	@root_validator(pre=True)
	def check_at_least_one_field(cls, values):
		if not values.get('social_reason') and not values.get('code') and not values.get('description'):
			raise ValueError('At least one of "social_reason", "code" or "description" must be provided.')
		return values

class FilterDriverDTO(BaseModel):
	social_reason: Optional[str] = None
	code: Optional[str] = None
	description: Optional[str] = None
