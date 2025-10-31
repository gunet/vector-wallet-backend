import "reflect-metadata";

const TYPES = {
	CredentialReceiving: Symbol.for("CredentialReceiving"),
	PresentationSending: Symbol.for("PresentationSending"),

	IdentifierStore: Symbol.for("IdentifierStore"),
	LegalPersonsRegistry: Symbol.for("LegalPersonsRegistry")
};

export { TYPES };