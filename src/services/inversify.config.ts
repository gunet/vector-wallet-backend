import { Container } from "inversify";
import { TYPES  } from "./types";
import { CredentialReceiving, IdentifierStore, PresentationSending, LegalPersonsRegistry } from "./interfaces";
import { OpenidForCredentialIssuanceService } from "./OpenidForCredentialIssuanceService";
import { IdentifierService } from "./IdentifierService";
import { LegalPersonService } from "./LegalPersonService";
import { OpenidForPresentationService } from "./OpenidForPresentationService";
import "reflect-metadata";

const appContainer = new Container();


appContainer.bind<IdentifierStore>(TYPES.IdentifierStore)
	.to(IdentifierService)


appContainer.bind<LegalPersonsRegistry>(TYPES.LegalPersonsRegistry)
	.to(LegalPersonService)
	// .whenTargetNamed(LegalPersonService.identifier);

	
appContainer.bind<CredentialReceiving>(TYPES.CredentialReceiving)
	.to(OpenidForCredentialIssuanceService)
	// .whenTargetNamed(OpenidForCredentialIssuanceService.identifier);

appContainer.bind<PresentationSending>(TYPES.PresentationSending)
	.to(OpenidForPresentationService)
	// .whenTargetNamed(OpenidForPresentationService.identifier);


export { appContainer }


// example usage
// const openidForCredentialIssuanceService = appContainer.getNamed<CredentialReceiving>(TYPES.CredentialReceiving, OpenidForCredentialIssuanceService.identifier);
