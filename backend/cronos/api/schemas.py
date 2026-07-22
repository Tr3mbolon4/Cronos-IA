from pydantic import BaseModel, Field


class OwnerCreate(BaseModel):
    name: str = Field(min_length=2)
    password: str = Field(min_length=8)
    pin: str = Field(min_length=4)


class LoginRequest(BaseModel):
    password: str
    pin: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: str = "principal"
    document_ids: list[int] = Field(default_factory=list)


class DocumentQuestion(BaseModel):
    question: str = Field(min_length=1)
